import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  createLegacyAdvanceTurnHarness,
  type ModelFake,
} from '@/tests/kernel/harness/legacyAdvanceTurnHarness';
import { runKernelContractSuite } from '@/tests/kernel/harness/kernelContractSuite';
import { asRevision } from '@/tests/kernel/harness/types';

const successModel: ModelFake = {
  async complete() {
    return {
      kind: 'stream_success',
      chunks: ['星', '穹', '列车到站了。'],
      narrativeText: '星穹列车到站了。',
    };
  },
};

const failingModel: ModelFake = {
  async complete() {
    return {
      kind: 'stream_failure',
      chunks: ['半', '截'],
      message: 'upstream model 500',
    };
  },
};

function createSuccessHarness() {
  return createLegacyAdvanceTurnHarness({ model: successModel });
}

function createFailingHarness() {
  return createLegacyAdvanceTurnHarness({ model: failingModel });
}

describe('IKernel ExecutionFrame contract (provisional harness)', () => {
  runKernelContractSuite(async () => createSuccessHarness());

  it('progress frames do not persist formal state mid-stream', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const model: ModelFake = {
      async complete() {
        // First chunk path is handled inside execute after complete returns.
        // To observe mid-stream repository stability we delay complete until
        // after the test has recorded `before`, then return multi-chunk success.
        await hold;
        return {
          kind: 'stream_success',
          chunks: ['A', 'B'],
          narrativeText: 'AB',
        };
      },
    };

    const harness = createLegacyAdvanceTurnHarness({ model });
    const before = await harness.repository.read(harness.sessionId);

    const iterator = harness
      .execute(
        harness.advanceTurn('hold', {
          expectedRevision: before.revision,
          commandId: 'mid-stream-1',
        }),
      )
      [Symbol.asyncIterator]();

    // Model has not finished yet — no frames until complete resolves.
    // Release model, then pull first progress frame and re-read repository.
    release();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value?.type).toBe('progress');

    const mid = await harness.repository.read(harness.sessionId);
    expect(mid).toEqual(before);

    // Drain remaining frames (more progress + commit).
    const rest: unknown[] = [];
    for await (const frame of { [Symbol.asyncIterator]: () => iterator }) {
      rest.push(frame);
    }
    expect(rest.some((f) => (f as { type: string }).type === 'committed')).toBe(true);

    const after = await harness.repository.read(harness.sessionId);
    expect(after.revision).toBe(before.revision + 1);
  });

  it('emits zero-or-more progress then exactly one terminal frame', async () => {
    const harness = createSuccessHarness();
    const rev = await harness.currentRevision();
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('stream order', {
          expectedRevision: rev,
          commandId: 'frame-order-1',
        }),
      ),
    );

    const firstTerminalIdx = frames.findIndex(
      (f) => f.type === 'committed' || f.type === 'rejected',
    );
    expect(firstTerminalIdx).toBeGreaterThanOrEqual(0);
    expect(frames.slice(0, firstTerminalIdx).every((f) => f.type === 'progress')).toBe(true);
    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toMatch(/committed|rejected/);
  });

  it('AI failure yields rejected and leaves formal snapshot equal', async () => {
    const harness = createFailingHarness();
    const before = await harness.repository.read(harness.sessionId);
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('will fail', {
          expectedRevision: before.revision,
          commandId: 'ai-fail-1',
        }),
      ),
    );
    const after = await harness.repository.read(harness.sessionId);

    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    expect(terminalFrames(frames)).toHaveLength(1);
    expect(after).toEqual(before);
    expect(after.turnCount).toBe(before.turnCount);
    expect(after.messages).toEqual([]);
  });

  it('committed frame carries revision and session view', async () => {
    const harness = createSuccessHarness();
    const before = await harness.repository.read(harness.sessionId);
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('观察星空', {
          expectedRevision: before.revision,
          commandId: 'commit-view-1',
        }),
      ),
    );
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type !== 'committed') throw new Error('expected committed');
    expect(terminal.revision).toBe(asRevision(before.revision + 1));
    expect(terminal.view.revision).toBe(terminal.revision);
    expect(terminal.view.turns).toHaveLength(1);
    expect(terminal.view.turns[0].playerText).toBe('观察星空');
    expect(terminal.view.turns[0].narrativeText).toBe('星穹列车到站了。');
  });
});
