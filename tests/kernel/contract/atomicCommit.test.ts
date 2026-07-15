import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  createLegacyAdvanceTurnHarness,
  type ModelFake,
} from '@/tests/kernel/harness/legacyAdvanceTurnHarness';

const successModel: ModelFake = {
  async complete({ text }) {
    return {
      kind: 'stream_success',
      chunks: [`叙事：${text}`],
      narrativeText: `叙事：${text}`,
    };
  },
};

describe('IKernel atomic commit (provisional harness)', () => {
  it('committed advances revision exactly once per successful command', async () => {
    const harness = createLegacyAdvanceTurnHarness({ model: successModel });
    const r0 = await harness.currentRevision();

    const frames1 = await collectAsync(
      harness.execute(
        harness.advanceTurn('第一步', { expectedRevision: r0, commandId: 'atomic-1' }),
      ),
    );
    expect(frames1.at(-1)?.type).toBe('committed');
    const r1 = await harness.currentRevision();
    expect(r1).toBe(r0 + 1);

    const frames2 = await collectAsync(
      harness.execute(
        harness.advanceTurn('第二步', { expectedRevision: r1, commandId: 'atomic-2' }),
      ),
    );
    expect(frames2.at(-1)?.type).toBe('committed');
    const r2 = await harness.currentRevision();
    expect(r2).toBe(r0 + 2);

    const snap = await harness.readSnapshot();
    expect(snap.turns).toHaveLength(2);
    expect(snap.turnCount).toBe(3); // started at 1, +1 twice
    expect(snap.messages).toHaveLength(4);
  });

  it('failed command does not leave a half-committed formal snapshot', async () => {
    const model: ModelFake = {
      async complete() {
        return { kind: 'stream_failure', message: 'timeout' };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({
      model,
      travelerName: '丹恒',
      turnCount: 5,
    });
    const before = await harness.readSnapshot();
    await collectAsync(
      harness.execute(
        harness.advanceTurn('尝试', {
          expectedRevision: before.revision,
          commandId: 'atomic-fail-1',
        }),
      ),
    );
    const after = await harness.readSnapshot();
    expect(after).toEqual(before);
    expect(after.travelerName).toBe('丹恒');
    expect(after.turnCount).toBe(5);
  });

  it('progress-only prefix never mutates turnCount or messages', async () => {
    type Success = {
      kind: 'stream_success';
      chunks: string[];
      narrativeText: string;
    };
    let resolveComplete!: (value: Success) => void;
    const hold = new Promise<Success>((resolve) => {
      resolveComplete = resolve;
    });
    const model: ModelFake = {
      complete: async () => hold,
    };
    const harness = createLegacyAdvanceTurnHarness({ model });
    const before = await harness.readSnapshot();
    const iter = harness
      .execute(
        harness.advanceTurn('streaming', {
          expectedRevision: before.revision,
          commandId: 'atomic-progress-only',
        }),
      )
      [Symbol.asyncIterator]();

    // Pull first frame: execute enters model.complete and waits on hold.
    const firstPromise = iter.next();
    // Allow the generator to reach model.complete before releasing.
    await Promise.resolve();
    resolveComplete({
      kind: 'stream_success',
      chunks: ['x', 'y'],
      narrativeText: 'xy',
    });

    const first = await firstPromise;
    expect(first.value?.type).toBe('progress');
    expect(await harness.readSnapshot()).toEqual(before);

    // finish
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = await iter.next();
      if (n.done) break;
    }
    expect(await harness.currentRevision()).toBe(before.revision + 1);
  });
});
