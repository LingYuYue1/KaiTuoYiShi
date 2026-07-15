/**
 * Stage 0.3 — AdvanceTurn characterization.
 *
 * Drives:
 *  - LegacyAdvanceTurnHarness via IKernel.execute (fixed Model fake)
 *  - Real pure modules: parseVariableCommands, createVisibilityBufferedPublisher,
 *    compactPreTurnSnapshot
 *
 * Does NOT rewrite production sendWorkflow / App composition root.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  createLegacyAdvanceTurnHarness,
  type ModelFake,
} from '@/tests/kernel/harness/legacyAdvanceTurnHarness';
import { parseVariableCommands } from '@/utils/variableExecutor';
import { createVisibilityBufferedPublisher } from '@/utils/visibilityBufferedPublisher';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import type { 回合快照 } from '@/models/chat';

describe('AdvanceTurn provisional contract model + pure modules', () => {
  it('1. user input enters the turn as playerText on commit', async () => {
    const model: ModelFake = {
      async complete({ text }) {
        return {
          kind: 'stream_success',
          chunks: ['…'],
          narrativeText: `回应：${text}`,
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({ model });
    const rev = await harness.currentRevision();
    const userInput = '我想去观景车厢看看';
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn(userInput, { expectedRevision: rev, commandId: 'char-input-1' }),
      ),
    );
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type !== 'committed') throw new Error('expected committed');
    expect(terminal.view.turns[0].playerText).toBe(userInput);
    expect(terminal.view.messages[0]).toEqual({ role: 'user', content: userInput });
  });

  it('2. progress display order matches cumulative stream chunks', async () => {
    const chunks = ['列车', '缓缓', '停靠。'];
    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks,
          narrativeText: chunks.join(''),
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({ model });
    const rev = await harness.currentRevision();
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('看窗外', { expectedRevision: rev, commandId: 'char-progress-1' }),
      ),
    );
    const progressTexts = frames
      .filter((f) => f.type === 'progress')
      .map((f) => (f.type === 'progress' ? f.delta.text : ''));
    expect(progressTexts).toEqual(['列车', '列车缓缓', '列车缓缓停靠。']);
    // Real visibility buffer: when page is hidden, commits are deferred.
    const commits: string[] = [];
    let hidden = true;
    const publisher = createVisibilityBufferedPublisher({
      source: {
        isHidden: () => hidden,
        subscribe: () => () => {},
      },
      commit: (text) => {
        commits.push(text);
      },
    });
    expect(publisher.bufferWhenHidden('列车')).toBe(true);
    expect(publisher.bufferWhenHidden('列车缓缓')).toBe(true);
    expect(commits).toEqual([]);
    hidden = false;
    publisher.flush();
    expect(commits).toEqual(['列车缓缓']);
    publisher.dispose();
  });

  it('3. success yields messages + revision/turn identity', async () => {
    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['三月七挥了挥手。'],
          narrativeText: '三月七挥了挥手。',
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({
      model,
      turnCount: 3,
      initialRevision: 2,
    });
    const before = await harness.readSnapshot();
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('打招呼', {
          expectedRevision: before.revision,
          commandId: 'char-success-1',
        }),
      ),
    );
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type !== 'committed') throw new Error('expected committed');
    expect(terminal.revision).toBe(before.revision + 1);
    expect(terminal.view.turnCount).toBe(before.turnCount + 1);
    expect(terminal.view.messages).toEqual([
      { role: 'user', content: '打招呼' },
      { role: 'assistant', content: '三月七挥了挥手。' },
    ]);
    expect(terminal.view.turns[0].id).toBe('turn_char-success-1');
  });

  it('4. AI failure leaves formal state unchanged', async () => {
    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_failure',
          chunks: ['…连接中'],
          message: '主流程失败：network reset',
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({
      model,
      turnCount: 7,
      travelerName: '星',
    });
    const before = await harness.readSnapshot();
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('继续', {
          expectedRevision: before.revision,
          commandId: 'char-ai-fail-1',
        }),
      ),
    );
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: '主流程失败：network reset' },
    });
    expect(await harness.readSnapshot()).toEqual(before);
  });

  it('5. illegal variable output does not mutate traveler domain slice', async () => {
    // Real pure path: parseVariableCommands rejects garbage / unparseable values.
    // Note: multi-line join can turn `set 旅人.姓名 =\nfoo` into a legal string set —
    // use values that 解析变量值 rejects, and unknown roots that still parse as commands
    // but our harness only applies legal `旅人.姓名` sets.
    const illegalBlock = `<变量更新>
set 旅人.姓名 = {{not-json
set 未知根.字段 = "x"
delete
</变量更新>`;
    const parsed = parseVariableCommands(illegalBlock);
    expect(parsed.parseErrors.length).toBeGreaterThan(0);
    expect(parsed.commands.every((c) => c.key !== '旅人.姓名')).toBe(true);

    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['叙事仍成功。'],
          narrativeText: '叙事仍成功。',
          variableBlock: illegalBlock,
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({
      model,
      travelerName: '开拓者甲',
    });
    const before = await harness.readSnapshot();
    const frames = await collectAsync(
      harness.execute(
        harness.advanceTurn('带非法变量', {
          expectedRevision: before.revision,
          commandId: 'char-illegal-var-1',
        }),
      ),
    );
    // Legacy main story still commits narrative when variables are bad;
    // domain travelerName stays put.
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await harness.readSnapshot();
    expect(after.travelerName).toBe('开拓者甲');
    expect(after.revision).toBe(before.revision + 1);
    expect(after.messages.at(-1)?.content).toBe('叙事仍成功。');
  });

  it('5b. legal variable set updates traveler name on formal commit', async () => {
    const legalBlock = `<变量更新>
set 旅人.姓名 = "星核旅人"
</变量更新>`;
    const parsed = parseVariableCommands(legalBlock);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.commands.some((c) => c.key === '旅人.姓名')).toBe(true);

    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['好。'],
          narrativeText: '好。',
          variableBlock: legalBlock,
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({
      model,
      travelerName: '旧名',
    });
    const rev = await harness.currentRevision();
    await collectAsync(
      harness.execute(
        harness.advanceTurn('改名', { expectedRevision: rev, commandId: 'char-legal-var-1' }),
      ),
    );
    expect((await harness.readSnapshot()).travelerName).toBe('星核旅人');
  });

  it('6. save then re-read via in-memory repository (no IndexedDB)', async () => {
    const model: ModelFake = {
      async complete() {
        return {
          kind: 'stream_success',
          chunks: ['存档点。'],
          narrativeText: '存档点。',
        };
      },
    };
    const harness = createLegacyAdvanceTurnHarness({ model, sessionId: 'save-session' });
    const rev = await harness.currentRevision();
    await collectAsync(
      harness.execute(
        harness.advanceTurn('走到存档点', {
          expectedRevision: rev,
          commandId: 'char-save-1',
        }),
      ),
    );
    const saved = await harness.repository.read(harness.sessionId);
    // Re-read is a fresh clone from repository — observable equality.
    const reloaded = await harness.read({
      type: 'session.read',
      sessionId: harness.sessionId,
    });
    // session.read returns SessionView (not SettingsView).
    expect('messages' in reloaded).toBe(true);
    if (!('messages' in reloaded)) throw new Error('expected SessionView');
    expect(reloaded.revision).toBe(saved.revision);
    expect(reloaded.messages).toEqual(saved.messages);
    expect(reloaded.turns).toEqual(saved.turns);
    expect(reloaded.turnCount).toBe(saved.turnCount);
  });

  it('pure module: compactPreTurnSnapshot returns an independent deep snapshot', () => {
    const source = {
      旅人: { 姓名: '测试' },
      世界: { 当前地点: '星穹列车' },
      记忆: {},
      turnCount: 4,
      variableBatches: [],
      queueTasks: [],
    } as unknown as 回合快照;

    const compacted = compactPreTurnSnapshot(source);
    expect(compacted.turnCount).toBe(4);
    expect(compacted).not.toBe(source);
    // Mutating compacted must not touch source (structuredClone isolation).
    (compacted as { turnCount: number }).turnCount = 99;
    expect(source.turnCount).toBe(4);
  });
});
