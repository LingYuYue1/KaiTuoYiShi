import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStateHarness } from '../helpers/gameStateHarness';
import { isVariableSettlementError, runVariableCalibrationStep } from '@/hooks/useGame/variableWorkflow';
import { stage8_variable } from '@/hooks/useGame/stage8_variable';
import { findRetryableVariableBatch } from '@/hooks/useGame/workflowRetry';
import { callVariableModel } from '@/services/ai/variableModel';
import { commandFingerprint } from '@/utils/variableFingerprint';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { TurnContext, TurnDeltas } from '@/hooks/useGame/turnTypes';

vi.mock('@/services/ai/variableModel', () => ({
  callVariableModel: vi.fn(),
}));

const callVariableMock = vi.mocked(callVariableModel);
const VARIABLE_COMMAND_TEXT = '<变量更新>\nadd 世界.开拓天数 = 1\n</变量更新>';

function seedSettings(harness: ReturnType<typeof createGameStateHarness>): void {
  harness.setGameSettings((prev) => ({ ...prev, enableVariableUpdate: true, enableNsfw: false }));
}

function buildReceipt(turn = 3, assistantMessageId = 'assistant-3') {
  return { sessionEpoch: 0, turn, leafId: 'leaf-1', userMessageId: 'user-2', assistantMessageId, input: '继续' };
}

function buildPriorBatch(overrides: Partial<变量命令批次> = {}): 变量命令批次 {
  return {
    id: 'vbatch_prior',
    turn: 3,
    targetMessageId: 'assistant-3',
    timestamp: 1,
    source: 'main',
    baseStateFingerprint: 'a'.repeat(64),
    results: [],
    ...overrides,
  };
}

async function runCalibration(harness: ReturnType<typeof createGameStateHarness>, receipt = buildReceipt()) {
  return runVariableCalibrationStep({
    state: harness.state,
    mainApiConfig: harness.apiConfig,
    userInput: '继续',
    body: '正文内容',
    receipt,
    memorySystemSnapshot: harness.state.记忆,
    travelerSnapshot: harness.state.旅人,
    worldSnapshot: harness.state.世界,
  });
}

describe('变量结算失败语义', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
  });

  it('模型失败抛 VariableSettlementError，不写假命令、不追加批次', async () => {
    const harness = createGameStateHarness();
    seedSettings(harness);
    callVariableMock.mockRejectedValue(new Error('网络错误'));

    await expect(runCalibration(harness)).rejects.toMatchObject({
      name: 'VariableSettlementError',
      message: '网络错误',
    });
    expect(harness.cells.variableBatches.get()).toStrictEqual([]);
  });

  it('模型失败保留 API 层的已报告标记', async () => {
    const harness = createGameStateHarness();
    seedSettings(harness);
    const error = Object.assign(new Error('接口已报告'), { alreadyReportedByApiLayer: true });
    callVariableMock.mockRejectedValue(error);

    await expect(runCalibration(harness)).rejects.toMatchObject({ alreadyReportedByApiLayer: true });
  });

  it('stage8 失败：叶子不写变量、队列记可见诊断并原样抛错', async () => {
    const harness = createGameStateHarness();
    seedSettings(harness);
    callVariableMock.mockRejectedValue(new Error('调用失败'));
    const ctx = {
      state: harness.state,
      userInput: '继续',
      config: harness.apiConfig,
      abortController: new AbortController(),
      assertWorkflowActive: () => {},
      isCurrentWorkflow: () => true,
      turnCountAtStart: 3,
      queueTasksMirror: harness.state.queueTasks,
    } as unknown as TurnContext;
    const deltas = {
      parsedForDisplay: undefined,
      displayText: '正文内容',
      mem: harness.state.记忆,
      worldAfter: harness.state.世界,
      travelerAfter: harness.state.旅人,
      yitingEnabled: false,
      receipt: buildReceipt(),
    } as unknown as TurnDeltas;

    await expect(stage8_variable(ctx, deltas)).rejects.toSatisfy(isVariableSettlementError);
    const variableTask = [...harness.cells.queueTasks.get()].reverse().find((task) => task.id === 'variable');
    expect(variableTask?.status).toBe('failed');
    expect(variableTask?.detail).toBe('调用失败');
    expect(harness.cells.variableBatches.get()).toStrictEqual([]);
  });
});

describe('重跑幂等：已落地则跳过', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
  });

  it('本回合已成功落地的同名命令不重复归约，报告标记跳过数', async () => {
    const harness = createGameStateHarness();
    seedSettings(harness);
    const appliedCommand = { action: 'add' as const, key: '世界.开拓天数', value: 1 };
    const applied = buildPriorBatch({
      results: [{
        command: appliedCommand,
        ok: true,
        kind: 'command',
        commandFingerprint: await commandFingerprint(appliedCommand),
      }],
    });
    harness.cells.variableBatches.set([applied]);
    const before = harness.cells.世界.get().开拓天数;
    callVariableMock.mockResolvedValue({ rawText: VARIABLE_COMMAND_TEXT });

    const overrides = await runCalibration(harness);

    expect(harness.cells.世界.get().开拓天数).toBe(before);
    expect(overrides?.batch?.results).toStrictEqual([]);
    expect(overrides?.batch?.report).toContain('已跳过的已落地命令：1 条');
    const batches = harness.cells.variableBatches.get();
    expect(batches).toHaveLength(2);
    expect(batches[0]).toStrictEqual(applied);
    expect(batches[1].results).toStrictEqual([]);
  });

  it('其他回合的批次不影响本回合命令落地', async () => {
    const harness = createGameStateHarness();
    seedSettings(harness);
    const otherTurnCommand = { action: 'add' as const, key: '世界.开拓天数', value: 1 };
    harness.cells.variableBatches.set([buildPriorBatch({
      id: 'vbatch_other',
      turn: 2,
      targetMessageId: 'assistant-2',
      results: [{
        command: otherTurnCommand,
        ok: true,
        kind: 'command',
        commandFingerprint: await commandFingerprint(otherTurnCommand),
      }],
    })]);
    const before = harness.cells.世界.get().开拓天数;
    callVariableMock.mockResolvedValue({ rawText: VARIABLE_COMMAND_TEXT });

    const overrides = await runCalibration(harness);

    expect(harness.cells.世界.get().开拓天数).toBe(before + 1);
    expect(overrides?.batch?.results).toHaveLength(1);
    expect(overrides?.batch?.results[0].ok).toBe(true);
  });
});

describe('补结算批次安全判定', () => {
  const command = { action: 'set' as const, key: '世界.当前地点', value: '测试站' };

  it('全失败批可补，部分成功无指纹批不可补，部分成功有指纹批可补', () => {
    const allFailed = buildPriorBatch({
      id: 'batch-all-failed',
      results: [{ command, ok: false, reason: '未落地' }],
    });
    const partialLegacy = buildPriorBatch({
      id: 'batch-partial-legacy',
      results: [
        { command, ok: true, kind: 'command' },
        { command: { ...command, value: '失败项' }, ok: false, reason: '未落地' },
      ],
    });
    const partialFingerprinted = buildPriorBatch({
      id: 'batch-partial-fp',
      results: [
        { command, ok: true, kind: 'command', commandFingerprint: 'b'.repeat(64) },
        { command: { ...command, value: '失败项' }, ok: false, reason: '未落地' },
      ],
    });
    const empty = buildPriorBatch({ id: 'batch-empty' });
    const batches = [allFailed, partialLegacy, partialFingerprinted, empty];

    expect(findRetryableVariableBatch(batches, 'batch-all-failed')?.id).toBe('batch-all-failed');
    expect(findRetryableVariableBatch(batches, 'batch-partial-legacy')).toBeUndefined();
    expect(findRetryableVariableBatch(batches, 'batch-partial-fp')?.id).toBe('batch-partial-fp');
    expect(findRetryableVariableBatch(batches, 'batch-empty')).toBeUndefined();
  });

  it('未指定批次时取最近一个可安全补结算的批次', () => {
    const batches = [
      buildPriorBatch({ id: 'batch-partial-legacy', results: [{ command, ok: true, kind: 'command' }] }),
      buildPriorBatch({ id: 'batch-all-failed', results: [{ command, ok: false, reason: '失败' }] }),
    ];
    expect(findRetryableVariableBatch(batches)?.id).toBe('batch-all-failed');
  });
});
