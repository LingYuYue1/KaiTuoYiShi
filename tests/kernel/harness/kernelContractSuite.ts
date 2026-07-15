import { expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import type { ProvisionalAdvanceTurnHarness } from './legacyAdvanceTurnHarness';

/**
 * Interface contract suite from IKernelRefac.md Stage 0.2.
 * Every assertion goes through kernel.execute / repository.read — not source search.
 */
export function runKernelContractSuite(
  createHarness: () => Promise<ProvisionalAdvanceTurnHarness> | ProvisionalAdvanceTurnHarness,
): void {
  it('does not commit progress frames as formal state (progress has no revision/view)', async () => {
    const h = await createHarness();
    const before = await h.repository.read(h.sessionId);
    const frames = await collectAsync(
      h.execute(
        h.advanceTurn('ping', {
          expectedRevision: before.revision,
          commandId: 'contract-progress-1',
        }),
      ),
    );
    const after = await h.repository.read(h.sessionId);

    const progress = frames.filter((f) => f.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    for (const frame of progress) {
      expect(frame).toMatchObject({ type: 'progress' });
      expect(frame).not.toHaveProperty('revision');
      expect(frame).not.toHaveProperty('view');
    }
    // Formal revision only advances on terminal commit, never per progress frame.
    if (frames.at(-1)?.type === 'committed') {
      expect(after.revision).toBe(before.revision + 1);
    } else {
      expect(after).toEqual(before);
    }
  });

  it('emits exactly one terminal frame and it is last', async () => {
    const harness = await createHarness();
    const before = await harness.repository.read(harness.sessionId);
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('hello', {
          expectedRevision: before.revision,
          commandId: 'contract-terminal-1',
        }),
      ),
    );

    const terminals = terminalFrames(frames);
    expect(terminals).toHaveLength(1);
    expect(frames.at(-1)).toEqual(terminals[0]);
    expect(terminals[0].type === 'committed' || terminals[0].type === 'rejected').toBe(true);
  });

  it('reject path leaves formal state and revision unchanged', async () => {
    const harness = await createHarness();
    const before = await harness.repository.read(harness.sessionId);
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('stale', {
          expectedRevision: (before.revision + 99) as typeof before.revision,
          commandId: 'contract-reject-stale',
        }),
      ),
    );
    const after = await harness.repository.read(harness.sessionId);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('rejected');
    expect(after).toEqual(before);
  });
}
