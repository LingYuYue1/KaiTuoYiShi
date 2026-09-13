import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDefaultWorkspace } from '../helpers/workspaceFixture';
import { assistantMessage, loadActiveLeafOrThrow, userMessage } from '../helpers/workflowFixture';
import { 重新解析变量计划 } from '@/services/variableRepair';
import { 提交变量修复计划 } from '@/hooks/useGame/variableRepairWorkflow';
import { callVariableModel } from '@/services/ai/variableModel';
import { snapshotVariableState } from '@/utils/variableExecutor';
import type { GameStateHarness } from '../helpers/gameStateHarness';

vi.mock('@/services/ai/variableModel', () => ({
  callVariableModel: vi.fn(),
}));

const callVariableMock = vi.mocked(callVariableModel);
const 背包命令文本 = [
  '<变量更新>',
  'push 旅人.背包 = {"名称":"面包","描述":"新鲜出炉的面包","类别":"food"}',
  '</变量更新>',
].join('\n');

function stateSnapshotOf(harness: GameStateHarness) {
  return snapshotVariableState({
    旅人: harness.state.旅人,
    世界: harness.state.世界,
    记忆: harness.state.记忆,
    忆庭: harness.state.忆庭,
    智库: harness.state.智库,
    手机: harness.state.手机,
    NPC: harness.state.NPC,
    新闻: harness.state.新闻,
    剧情: harness.state.剧情,
  });
}

async function scanPlan(harness: GameStateHarness) {
  const message = harness.state.chatHistory.find((item) => item.id === 'assistant-1');
  if (!message) throw new Error('缺少测试用助手消息');
  return 重新解析变量计划({
    message,
    turn: 2,
    stateSnapshot: stateSnapshotOf(harness),
    batches: harness.state.variableBatches,
    mainApiConfig: harness.apiConfig,
    userInput: '继续前进',
    nsfwEnabled: false,
    maleNsfwArchiveEnabled: false,
  });
}

describe('变量修复提交事务', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
  });

  it('未勾选确认项 → NO_SELECTED_ITEMS，不写叶子', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
    const plan = await scanPlan(harness);
    expect(plan.items[0].category).toBe('confirm');

    const receipt = await 提交变量修复计划({ state: harness.state, plan, confirmedItemIds: [] });

    expect(receipt.code).toBe('NO_SELECTED_ITEMS');
    expect(harness.state.旅人.背包).toStrictEqual([]);
    const active = await loadActiveLeafOrThrow();
    expect(active.leaf.旅人.背包).toStrictEqual([]);
  });

  it('勾选确认项后原子提交：写叶子、投影、批次带指纹', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
    const plan = await scanPlan(harness);
    const confirmId = plan.items[0].id;

    const receipt = await 提交变量修复计划({
      state: harness.state,
      plan,
      confirmedItemIds: [confirmId],
    });

    expect(receipt.code).toBe('OK');
    expect(harness.state.旅人.背包).toHaveLength(1);
    expect(harness.state.旅人.背包[0].名称).toBe('面包');
    const active = await loadActiveLeafOrThrow();
    expect(active.leaf.旅人.背包).toHaveLength(1);
    const batch = [...harness.state.variableBatches].reverse()[0];
    expect(batch.results).toHaveLength(1);
    expect(batch.results[0].commandFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(batch.baseStateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(batch.outcome).toBe('completed');
    expect(batch.turn).toBe(2);
    expect(batch.targetMessageId).toBe('assistant-1');
  });

  it('提交后重新扫描：同一命令归 existing，不再重复落地', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
    const plan = await scanPlan(harness);
    await 提交变量修复计划({ state: harness.state, plan, confirmedItemIds: [plan.items[0].id] });

    const rescan = await scanPlan(harness);

    expect(rescan.items[0].category).toBe('existing');
    const receipt = await 提交变量修复计划({
      state: harness.state,
      plan: rescan,
      confirmedItemIds: [],
    });
    expect(receipt.code).toBe('NO_SELECTED_ITEMS');
    expect(harness.state.旅人.背包).toHaveLength(1);
  });

  it('提交前状态已变化 → STALE_PLAN，不写叶子', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
    const plan = await scanPlan(harness);
    harness.cells.世界.set({ ...harness.state.世界, 当前地点: '空间站' });

    const receipt = await 提交变量修复计划({
      state: harness.state,
      plan,
      confirmedItemIds: [plan.items[0].id],
    });

    expect(receipt.code).toBe('STALE_PLAN');
    expect(harness.state.旅人.背包).toStrictEqual([]);
    const active = await loadActiveLeafOrThrow();
    expect(active.leaf.旅人.背包).toStrictEqual([]);
  });
});
