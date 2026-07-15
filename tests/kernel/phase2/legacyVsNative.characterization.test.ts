/**
 * Phase 2 — fixed model response: legacy harness vs native kernel
 * projection-level comparison (not full React state dump).
 *
 * Compares SessionView-shaped observables:
 * - messages, turns (player/narrative), turnCount, revision delta
 * - travelerName domain slice under legal/illegal variable blocks
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type SessionView,
} from '@/src/kernel/contract';
import {
  createLegacyAdvanceTurnHarness,
  type ModelFake,
} from '@/tests/kernel/harness/legacyAdvanceTurnHarness';
import { createKernel } from '@/src/kernel/createKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';

const FIXED_PLAYER = '我想去观景车厢看看';
const FIXED_CHUNKS = ['列车', '缓缓', '停靠。'];
const FIXED_NARRATIVE = '列车缓缓停靠。';

function projectionOf(view: SessionView) {
  return {
    revision: view.revision,
    turnCount: view.turnCount,
    messages: view.messages,
    turns: view.turns.map((t) => ({
      playerText: t.playerText,
      narrativeText: t.narrativeText,
    })),
  };
}

async function runLegacy(model: ModelFake, opts?: { travelerName?: string }) {
  const harness = createLegacyAdvanceTurnHarness({
    model,
    sessionId: 'cmp-legacy',
    travelerName: opts?.travelerName ?? '开拓者',
    turnCount: 1,
    initialRevision: 0,
  });
  const frames = await collectAsync(
    harness.execute(
      harness.advanceTurn(FIXED_PLAYER, {
        expectedRevision: 0,
        commandId: 'cmp-cmd',
      }),
    ),
  );
  const terminal = frames.at(-1);
  const snap = await harness.readSnapshot();
  return { frames, terminal, snap, progress: frames.filter((f) => f.type === 'progress') };
}

async function runNative(
  completedText: string,
  chunks: readonly string[],
  opts?: { travelerName?: string },
) {
  const sessions = new InMemorySessionRepository();
  const sessionId = asSessionId('cmp-native');
  sessions.seed(
    createSessionSnapshot({
      sessionId,
      revision: asRevision(0),
      state: {
        turnCount: 1,
        travelerName: opts?.travelerName ?? '开拓者',
      },
    }),
  );
  const model = new ScriptedModelGateway();
  model.enqueue({
    kind: 'success',
    chunks: [...chunks],
    completedText,
  });
  const kernel = await createKernel('native-turn', {
    native: { sessions, model },
  });
  const frames = await collectAsync(
    kernel.execute({
      protocolVersion: 1,
      commandId: asCommandId('cmp-cmd'),
      sessionId,
      expectedRevision: asRevision(0),
      command: { type: 'turn.advance', input: { text: FIXED_PLAYER } },
    }),
  );
  const terminal = frames.at(-1);
  const snap = await sessions.read(sessionId);
  return {
    frames,
    terminal,
    snap,
    progress: frames.filter((f) => f.type === 'progress'),
    // Map native snapshot to harness-like traveler field for comparison.
    travelerName: snap.state.travelerName,
  };
}

describe('legacy vs native characterization (fixed model)', () => {
  it('success: projection-level messages/turnCount/revision match', async () => {
    const legacyModel: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: FIXED_CHUNKS,
          narrativeText: FIXED_NARRATIVE,
        };
      },
    };

    const legacy = await runLegacy(legacyModel);
    const native = await runNative(FIXED_NARRATIVE, FIXED_CHUNKS);

    expect(legacy.terminal?.type).toBe('committed');
    expect(native.terminal?.type).toBe('committed');
    if (legacy.terminal?.type !== 'committed' || native.terminal?.type !== 'committed') {
      throw new Error('both must commit');
    }

    // Progress order (cumulative) matches.
    const legacyProgress = legacy.progress.map((f) =>
      f.type === 'progress' ? f.delta.text : '',
    );
    const nativeProgress = native.progress.map((f) =>
      f.type === 'progress' ? f.delta.text : '',
    );
    expect(nativeProgress).toEqual(legacyProgress);
    expect(nativeProgress).toEqual(['列车', '列车缓缓', '列车缓缓停靠。']);

    // Projection identity (ignore turn id prefix differences if any — both use turn_<commandId>).
    expect(projectionOf(native.terminal.view)).toEqual(projectionOf(legacy.terminal.view));
    expect(native.terminal.view.turns[0].id).toBe(legacy.terminal.view.turns[0].id);
  });

  it('AI failure: both reject with model_failure and unchanged formal state', async () => {
    const legacyModel: ModelFake = {
      async complete() {
        return { kind: 'stream_failure', chunks: ['…'], message: 'timeout' };
      },
    };
    const legacy = await runLegacy(legacyModel);

    const sessions = new InMemorySessionRepository();
    const sessionId = asSessionId('cmp-fail');
    sessions.seed(
      createSessionSnapshot({
        sessionId,
        revision: asRevision(0),
        state: { turnCount: 1, travelerName: '开拓者' },
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'timeout', chunks: ['…'] });
    const kernel = await createKernel('native-turn', {
      native: { sessions, model },
    });
    const before = await sessions.read(sessionId);
    const frames = await collectAsync(
      kernel.execute({
        protocolVersion: 1,
        commandId: asCommandId('fail-cmd'),
        sessionId,
        expectedRevision: asRevision(0),
        command: { type: 'turn.advance', input: { text: FIXED_PLAYER } },
      }),
    );

    expect(legacy.terminal).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: 'timeout' },
    });
    expect(await sessions.read(sessionId)).toEqual(before);
    // Legacy harness formal snap unchanged.
    expect(legacy.snap.revision).toBe(0);
    expect(legacy.snap.messages).toEqual([]);
  });

  it('illegal variable: both commit narrative; travelerName unchanged', async () => {
    const illegalBlock = `<变量更新>
set 旅人.姓名 = {{not-json
set 未知根.字段 = "x"
delete
</变量更新>`;
    const legacyModel: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['叙事仍成功。'],
          narrativeText: '叙事仍成功。',
          variableBlock: illegalBlock,
        };
      },
    };
    const legacy = await runLegacy(legacyModel, { travelerName: '开拓者甲' });
    const native = await runNative(
      `叙事仍成功。\n${illegalBlock}`,
      ['叙事仍成功。'],
      { travelerName: '开拓者甲' },
    );

    expect(legacy.terminal?.type).toBe('committed');
    expect(native.terminal?.type).toBe('committed');
    expect(legacy.snap.travelerName).toBe('开拓者甲');
    expect(native.travelerName).toBe('开拓者甲');
    if (legacy.terminal?.type === 'committed' && native.terminal?.type === 'committed') {
      expect(native.terminal.view.messages.at(-1)?.content).toBe(
        legacy.terminal.view.messages.at(-1)?.content,
      );
    }
  });

  it('legal variable set: both update travelerName on commit', async () => {
    const legalBlock = `<变量更新>
set 旅人.姓名 = "星核旅人"
</变量更新>`;
    const legacyModel: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['好。'],
          narrativeText: '好。',
          variableBlock: legalBlock,
        };
      },
    };
    const legacy = await runLegacy(legacyModel, { travelerName: '旧名' });
    const native = await runNative(`好。\n${legalBlock}`, ['好。'], {
      travelerName: '旧名',
    });

    expect(legacy.snap.travelerName).toBe('星核旅人');
    expect(native.travelerName).toBe('星核旅人');
  });
});
