// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { seedDefaultWorkspace } from '../helpers/workspaceFixture';
import { assistantMessage, loadActiveLeafOrThrow, userMessage } from '../helpers/workflowFixture';
import { useVariableRepairCenter } from '@/hooks/useGame/variableRepairCenter';
import { 保存变量修复草稿, 读取变量修复草稿 } from '@/services/storage/variableRepairDraft';
import { 构建变量修复草稿 } from '@/models/variableRepairBatch';
import { callVariableModel } from '@/services/ai/variableModel';

vi.mock('@/services/ai/variableModel', () => ({
  callVariableModel: vi.fn(),
}));

const callVariableMock = vi.mocked(callVariableModel);

const 背包命令文本 = [
  '<变量更新>',
  'push 旅人.背包 = {"名称":"面包","描述":"新鲜出炉的面包","类别":"food"}',
  '</变量更新>',
].join('\n');

const 两回合聊天 = [userMessage('user-2'), assistantMessage('assistant-2')];

async function until(condition: () => boolean, label: string): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < 2000) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  expect(condition(), `超时：${label}`).toBe(true);
}

describe('变量修复中心（批量扫描草稿）', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
    callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
  });

  it('扫描多回合 → 逐项 ready、草稿持久化、汇总含计划', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: 两回合聊天,
    });
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    act(() => result.current.开始扫描());
    await until(() => result.current.草稿?.state === 'ready', '扫描收敛');
    expect(result.current.草稿?.项).toHaveLength(1);
    expect(result.current.草稿?.项[0].status).toBe('ready');
    expect(result.current.草稿?.项[0].计划?.items.some((item) => item.category === 'confirm')).toBe(true);
    const stored = await 读取变量修复草稿();
    expect(stored.draft?.state).toBe('ready');
    expect(stored.draft?.项[0].计划?.targetMessageId).toBe('assistant-2');
  });

  it('暂停 → paused；继续 → 完成剩余项', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1'), userMessage('user-2'), assistantMessage('assistant-2')],
    });
    let resolveSecond: (value: { rawText: string }) => void = () => {};
    callVariableMock
      .mockResolvedValueOnce({ rawText: 背包命令文本 })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    act(() => result.current.开始扫描());
    await until(() => result.current.草稿?.项.filter((item) => item.status === 'ready').length === 1, '首回合 ready');
    act(() => result.current.暂停());
    resolveSecond({ rawText: 背包命令文本 });
    await until(() => result.current.草稿?.state === 'paused', '落 paused');
    expect(callVariableMock).toHaveBeenCalledTimes(2);
    expect(result.current.草稿?.项.filter((item) => item.status === 'ready').length).toBe(1);

    callVariableMock.mockResolvedValueOnce({ rawText: 背包命令文本 });
    act(() => result.current.继续());
    await until(() => result.current.草稿?.state === 'ready', '续扫收敛');
    expect(result.current.草稿?.项.every((item) => item.status === 'ready')).toBe(true);
  });

  it('取消 → 状态 cancelled，不再推进后续项', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1'), userMessage('user-2'), assistantMessage('assistant-2')],
    });
    let resolveSecond: (value: { rawText: string }) => void = () => {};
    callVariableMock
      .mockResolvedValueOnce({ rawText: 背包命令文本 })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    act(() => result.current.开始扫描());
    await until(() => result.current.草稿?.项.filter((item) => item.status === 'ready').length === 1, '首回合 ready');
    act(() => result.current.取消());
    resolveSecond({ rawText: 背包命令文本 });
    await until(() => result.current.草稿?.state === 'cancelled', '落 cancelled');
    expect(callVariableMock).toHaveBeenCalledTimes(2);
  });

  it('指纹不匹配 → 草稿丢弃 + 可见诊断 + 存储键清除', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: 两回合聊天,
    });
    const stale = 构建变量修复草稿([{ turn: 2, targetMessageId: 'assistant-2' }], 'stale-fingerprint', 1_700);
    await 保存变量修复草稿(stale);
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    await until(() => (result.current.诊断 ?? '').includes('已自动清除'), '诊断可见');
    expect(result.current.草稿).toBeNull();
    expect((await 读取变量修复草稿()).draft).toBeUndefined();
  });

  it('扫描中清除 → 在途扫描不回写草稿，存储键保持清除', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1'), userMessage('user-2'), assistantMessage('assistant-2')],
    });
    let resolveSecond: (value: { rawText: string }) => void = () => {};
    callVariableMock
      .mockResolvedValueOnce({ rawText: 背包命令文本 })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    act(() => result.current.开始扫描());
    await until(() => result.current.草稿?.项.filter((item) => item.status === 'ready').length === 1, '首回合 ready');
    act(() => result.current.清除());
    resolveSecond({ rawText: 背包命令文本 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.草稿).toBeNull();
    expect((await 读取变量修复草稿()).draft).toBeUndefined();
  });

  it('提交选择：逐计划走既有事务并持久化批次', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: 两回合聊天,
    });
    const { result } = renderHook(() => useVariableRepairCenter({
      getState: () => harness.state,
      getActiveConfig: harness.getActiveConfig,
      sessionEpoch: 0,
      pushQueueTask: () => {},
    }));
    act(() => result.current.开始扫描());
    await until(() => result.current.草稿?.state === 'ready', '扫描收敛');
    const plan = result.current.草稿?.项[0].计划;
    const confirmId = plan?.items.find((item) => item.category === 'confirm')?.id;
    expect(confirmId).toBeDefined();

    await act(async () => {
      await result.current.提交选择({ 'assistant-2': [confirmId as string] });
    });
    expect(result.current.诊断).toBeNull();
    expect(harness.state.旅人.背包).toHaveLength(1);
    expect(harness.state.旅人.背包[0].名称).toBe('面包');
    const active = await loadActiveLeafOrThrow();
    expect(active.leaf.旅人.背包).toHaveLength(1);
    const batches = harness.state.variableBatches;
    expect(batches.some((batch) => batch.source === 'calibration')).toBe(true);
  });

  it('存储层往返：保存 → 读取保真（issues 为空）', async () => {
    const draft = 构建变量修复草稿([{ turn: 3, targetMessageId: 'a-3' }], 'fp-x');
    await 保存变量修复草稿(draft);
    const round = await 读取变量修复草稿();
    expect(round.issues).toStrictEqual([]);
    expect(round.draft?.指纹).toBe('fp-x');
  });
});
