import { describe, expect, it } from 'vitest';
import {
  分类修复命令,
  应用变量修复计划,
  构建变量修复计划,
  type 变量修复计划,
} from '@/models/variableRepair';
import { commandFingerprint, variableStateFingerprint } from '@/utils/variableFingerprint';
import { VARIABLE_ROOT_KEYS, type VariableState } from '@/utils/variableRegistry';
import type { 变量命令 } from '@/models/variableCommand';
import { 创建空角色 } from '@/models/character';
import { 创建NPC记录 } from '@/models/npc';
import { 创建剧情节点 } from '@/models/plot';

function buildState(overrides: Partial<VariableState> = {}): VariableState {
  const base = Object.fromEntries(VARIABLE_ROOT_KEYS.map((key) => [key, null])) as VariableState;
  return { ...base, ...overrides };
}

function buildNpcState(overrides: { 外貌?: string } = {}): VariableState {
  return buildState({
    旅人: 创建空角色(),
    NPC: [{ ...创建NPC记录({ 姓名: '甲', 初见回合: 0 }), id: 'npc_a', ...overrides }],
    剧情: [{ ...创建剧情节点({ 标题: '节点', 回合: 1 }), id: 'node_1' }],
  });
}

function buildCommand(overrides: Partial<变量命令> = {}): 变量命令 {
  return { action: 'set', key: '世界.当前地点', value: '主控舱段', ...overrides };
}

async function buildPlan(params: {
  state: VariableState;
  items: Parameters<typeof 构建变量修复计划>[0]['items'];
  targetMessageId?: string;
}): Promise<变量修复计划> {
  return 构建变量修复计划({
    turn: 3,
    targetMessageId: params.targetMessageId ?? 'assistant-3',
    baseStateFingerprint: await variableStateFingerprint(params.state),
    items: params.items,
  });
}

describe('修复命令分类', () => {
  it('确定性事实路径归 conflict（含时间/地点/手机种子/NPC 回合计数）', async () => {
    const items = await 分类修复命令({
      commands: [
        buildCommand({ key: '世界.当前时间', value: '10:00' }),
        buildCommand({ key: '世界.当前地点', value: '空间站' }),
        buildCommand({ action: 'push', key: '手机.联系人', value: { name: '三月七' } }),
        buildCommand({ action: 'add', key: 'NPC[id=npc_a].最近回合', value: 3 }),
      ],
      state: buildState(),
      appliedFingerprints: new Set(),
    });
    expect(items.map((item) => item.category)).toStrictEqual(['conflict', 'conflict', 'conflict', 'conflict']);
  });

  it('高影响字段归 confirm（好感/背包/全局事件/删除）', async () => {
    const items = await 分类修复命令({
      commands: [
        buildCommand({ action: 'add', key: 'NPC[id=npc_a].好感度', value: 5 }),
        buildCommand({ action: 'push', key: '旅人.背包', value: { 名称: '面包', 描述: '新鲜出炉的面包', 类别: 'food' } }),
        buildCommand({ action: 'push', key: '世界.全局事件', value: '事件' }),
        buildCommand({ action: 'delete', key: '剧情[id=node_1]' }),
      ],
      state: buildNpcState(),
      appliedFingerprints: new Set(),
    });
    expect(items.map((item) => item.category)).toStrictEqual(['confirm', 'confirm', 'confirm', 'confirm']);
  });

  it('值相同 / 历史已落地归 existing', async () => {
    const state = buildNpcState({ 外貌: '短发布衣' });
    const appliedCommand = buildCommand({ key: 'NPC[id=npc_a].外貌', value: '长袍' });
    const items = await 分类修复命令({
      commands: [
        buildCommand({ key: 'NPC[id=npc_a].外貌', value: '短发布衣' }),
        appliedCommand,
      ],
      state,
      appliedFingerprints: new Set([await commandFingerprint(appliedCommand)]),
    });
    expect(items.map((item) => item.category)).toStrictEqual(['existing', 'existing']);
  });

  it('玩家手写旅人路径与未登记路径归 unsupported', async () => {
    const items = await 分类修复命令({
      commands: [
        buildCommand({ key: '旅人.姓名', value: '开拓者' }),
        buildCommand({ key: '不存在的根.字段', value: 1 }),
      ],
      state: buildState(),
      appliedFingerprints: new Set(),
    });
    expect(items.map((item) => item.category)).toStrictEqual(['unsupported', 'unsupported']);
    expect(items[0].reason).toContain('玩家手写');
  });
});

describe('修复计划应用回执', () => {
  it('基态指纹不一致 → STALE_PLAN，不产生归约结果', async () => {
    const state = buildState({ 世界: { 当前地点: '主控舱段' } });
    const plan = await buildPlan({
      state,
      items: [{ id: 'item_0', category: 'safe', commands: [buildCommand({ action: 'add', key: 'NPC[id=npc_a].好感度', value: 1 })] }],
    });
    const receipt = await 应用变量修复计划({
      plan,
      currentState: buildState({ 世界: { 当前地点: '空间站' } }),
      confirmedItemIds: [],
      appliedFingerprints: new Set(),
    });
    expect(receipt.code).toBe('STALE_PLAN');
    expect(receipt.nextState).toBeUndefined();
  });

  it('勾选不存在的确认项 → INVALID_SELECTION', async () => {
    const state = buildState();
    const plan = await buildPlan({
      state,
      items: [{ id: 'item_0', category: 'safe', commands: [buildCommand()] }],
    });
    const receipt = await 应用变量修复计划({
      plan,
      currentState: state,
      confirmedItemIds: ['item_404'],
      appliedFingerprints: new Set(),
    });
    expect(receipt.code).toBe('INVALID_SELECTION');
  });

  it('无安全项且未勾选确认项 → NO_SELECTED_ITEMS；全为 NSFW 拒绝 → NSFW_POLICY_REJECTED', async () => {
    const state = buildState();
    const onlyExisting = await buildPlan({
      state,
      items: [{ id: 'item_0', category: 'existing', commands: [buildCommand()] }],
    });
    expect((await 应用变量修复计划({
      plan: onlyExisting, currentState: state, confirmedItemIds: [], appliedFingerprints: new Set(),
    })).code).toBe('NO_SELECTED_ITEMS');

    const nsfwRejected = await buildPlan({
      state,
      items: [{ id: 'rejected_0', category: 'unsupported', commands: [buildCommand({ key: 'NPC[id=npc_a].NSFW档案', value: 'x' })], nsfwRejected: true }],
    });
    expect((await 应用变量修复计划({
      plan: nsfwRejected, currentState: state, confirmedItemIds: [], appliedFingerprints: new Set(),
    })).code).toBe('NSFW_POLICY_REJECTED');
  });

  it('候选命令全部已落地 → ALREADY_COMMITTED', async () => {
    const state = buildState({ 世界: { 当前地点: '主控舱段', 当前时间: '', 开拓天数: 1, 当前日期: '' } });
    const command = buildCommand({ key: '世界.当前地点', value: '空间站' });
    const plan = await buildPlan({
      state,
      items: [{ id: 'item_0', category: 'safe', commands: [command] }],
    });
    const receipt = await 应用变量修复计划({
      plan,
      currentState: state,
      confirmedItemIds: [],
      appliedFingerprints: new Set([await commandFingerprint(command)]),
    });
    expect(receipt.code).toBe('ALREADY_COMMITTED');
  });

  it('正常提交 → OK，返回 nextState 与带指纹的 pending', async () => {
    const state = buildState({ 世界: { 当前地点: '主控舱段', 当前时间: '', 开拓天数: 1, 当前日期: '' } });
    const command = buildCommand({ key: '世界.当前地点', value: '空间站' });
    const plan = await buildPlan({
      state,
      items: [{ id: 'item_0', category: 'safe', commands: [command] }],
    });
    const receipt = await 应用变量修复计划({
      plan,
      currentState: state,
      confirmedItemIds: [],
      appliedFingerprints: new Set(),
    });
    expect(receipt.code).toBe('OK');
    expect(receipt.results).toHaveLength(1);
    expect(receipt.pending?.[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((receipt.nextState?.世界 as { 当前地点?: string }).当前地点).toBe('空间站');
  });
});
