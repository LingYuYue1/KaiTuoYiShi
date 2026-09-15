import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDefaultWorkspace } from '../helpers/workspaceFixture';
import { assistantMessage, loadActiveLeafOrThrow, userMessage } from '../helpers/workflowFixture';
import { 重新解析变量计划 } from '@/services/variableRepair';
import { 提交变量修复计划 } from '@/hooks/useGame/variableRepairWorkflow';
import { callVariableModel } from '@/services/ai/variableModel';
import { snapshotVariableState } from '@/utils/variableExecutor';
import { variableStateFingerprint } from '@/utils/variableFingerprint';
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
  return snapshotVariableState(harness.state);
}

async function scanPlan(harness: GameStateHarness) {
  const message = harness.state.chatHistory.find((item) => item.id === 'assistant-1');
  if (!message) throw new Error('缺少测试用助手消息');
  const stateSnapshot = stateSnapshotOf(harness);
  return 重新解析变量计划({
    message,
    turn: 2,
    stateSnapshot,
    baseStateFingerprint: await variableStateFingerprint(stateSnapshot),
    batches: harness.state.variableBatches,
    mainApiConfig: harness.apiConfig,
    userInput: '继续前进',
    nsfwEnabled: false,
    maleNsfwArchiveEnabled: false,
  });
}

/** 两回合工作区 + 固定的背包命令响应 → 已扫描的修复计划。 */
async function setupRepairCase() {
  const harness = await seedDefaultWorkspace({
    turnCount: 2,
    chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
  });
  callVariableMock.mockResolvedValue({ rawText: 背包命令文本 });
  return { harness, plan: await scanPlan(harness) };
}

describe('变量修复提交事务', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
  });

  it('未勾选确认项 → NO_SELECTED_ITEMS，不写叶子', async () => {
    const { harness, plan } = await setupRepairCase();
    expect(plan.items[0].category).toBe('confirm');

    const receipt = await 提交变量修复计划({ state: harness.state, plan, confirmedItemIds: [] });

    expect(receipt.code).toBe('NO_SELECTED_ITEMS');
    expect(harness.state.旅人.背包).toStrictEqual([]);
    const active = await loadActiveLeafOrThrow();
    expect(active.leaf.旅人.背包).toStrictEqual([]);
  });

  it('勾选确认项后原子提交：写叶子、投影、批次带指纹', async () => {
    const { harness, plan } = await setupRepairCase();
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
    const { harness, plan } = await setupRepairCase();
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
    const { harness, plan } = await setupRepairCase();
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
