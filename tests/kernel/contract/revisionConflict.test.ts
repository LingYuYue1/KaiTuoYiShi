import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  createLegacyAdvanceTurnHarness,
  type ModelFake,
} from '@/tests/kernel/harness/legacyAdvanceTurnHarness';
import { asRevision } from '@/tests/kernel/harness/types';

/**
 * Provisional revision / commandId mapping (Phase 0):
 *
 * Production legacy path (sendWorkflow) has **no** `expectedRevision` CAS and no
 * `commandId` idempotency store. Formal identity today is roughly:
 *   - turnCount increments only after successful main-story settlement
 *   - preTurnSnapshot enables reroll rollback
 *
 * Phase-0 harness introduces linear revision + commandId as the *target* Interface
 * semantics that Native Kernel will own. Tests below prove those Interface rules
 * on the harness; they do not claim production already implements CAS.
 */

const successModel: ModelFake = {
  async complete({ text }) {
    return {
      kind: 'stream_success',
      chunks: [text],
      narrativeText: `回：${text}`,
    };
  },
};

describe('IKernel revision conflict & commandId (provisional Phase 0)', () => {
  it('stale expectedRevision rejects without mutating formal state', async () => {
    const harness = createLegacyAdvanceTurnHarness({ model: successModel });
    // Advance once so revision becomes 1.
    await collectAsync(
      harness.execute(
        harness.advanceTurn('seed', { expectedRevision: 0, commandId: 'rev-seed' }),
      ),
    );
    const afterSeed = await harness.readSnapshot();
    expect(afterSeed.revision).toBe(1);

    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('stale client', {
          expectedRevision: asRevision(0),
          commandId: 'rev-stale',
        }),
      ),
    );
    expect(frames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'revision_conflict' }),
      }),
    ]);
    expect(await harness.readSnapshot()).toEqual(afterSeed);
  });

  it('retrying the same commandId does not double-commit', async () => {
    const harness = createLegacyAdvanceTurnHarness({ model: successModel });
    const cmd = harness.advanceTurn('幂等', {
      expectedRevision: 0,
      commandId: 'idempotent-1',
    });

    const first = await collectAsync(harness.execute(cmd));
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await harness.readSnapshot();
    expect(mid.revision).toBe(1);
    expect(mid.turns).toHaveLength(1);

    // Retry with same commandId and the original expectedRevision (client replay).
    const second = await collectAsync(harness.execute(cmd));
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toMatchObject({ revision: mid.revision });
    }

    const end = await harness.readSnapshot();
    expect(end.revision).toBe(1);
    expect(end.turns).toHaveLength(1);
    expect(end.messages).toEqual(mid.messages);
  });

  it('two concurrent expected revisions: only first CAS wins', async () => {
    let releaseA!: () => void;
    let releaseB!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const gateB = new Promise<void>((r) => {
      releaseB = r;
    });
    let calls = 0;
    const model: ModelFake = {
      async complete({ text }) {
        calls += 1;
        if (text === 'A') await gateA;
        if (text === 'B') await gateB;
        return {
          kind: 'stream_success',
          chunks: [text],
          narrativeText: text,
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({ model });
    const baseRev = await harness.currentRevision();

    const pA = collectAsync(
      harness.execute(
        harness.advanceTurn('A', { expectedRevision: baseRev, commandId: 'race-a' }),
      ),
    );
    const pB = collectAsync(
      harness.execute(
        harness.advanceTurn('B', { expectedRevision: baseRev, commandId: 'race-b' }),
      ),
    );

    // Let both models finish so both attempt CAS at revision 0.
    releaseA();
    releaseB();
    const [framesA, framesB] = await Promise.all([pA, pB]);

    const terminals = [framesA.at(-1), framesB.at(-1)];
    const committed = terminals.filter((t) => t?.type === 'committed');
    const rejected = terminals.filter((t) => t?.type === 'rejected');
    expect(committed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.type === 'rejected') {
      expect(rejected[0].error.code).toBe('revision_conflict');
    }
    expect(await harness.currentRevision()).toBe(baseRev + 1);
    expect(calls).toBe(2);
  });
});
