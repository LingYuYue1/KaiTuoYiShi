import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assistantMessage } from '../helpers/workflowFixture';
import { 重新解析变量计划 } from '@/services/variableRepair';
import { callVariableModel } from '@/services/ai/variableModel';
import { snapshotVariableState } from '@/utils/variableExecutor';
import { 创建空角色 } from '@/models/character';
import { 创建空世界状态 } from '@/models/world';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空智库系统 } from '@/models/zhiku';
import { 创建空手机系统 } from '@/models/phone';
import { 创建NPC记录 } from '@/models/npc';
import { 创建剧情节点 } from '@/models/plot';

vi.mock('@/services/ai/variableModel', () => ({
  callVariableModel: vi.fn(),
}));

const callVariableMock = vi.mocked(callVariableModel);

function buildSnapshot() {
  return snapshotVariableState({
    旅人: 创建空角色(),
    世界: 创建空世界状态(),
    记忆: 创建空记忆系统(),
    忆庭: 创建空忆庭系统(),
    智库: 创建空智库系统(),
    手机: 创建空手机系统(),
    NPC: [{ ...创建NPC记录({ 姓名: '甲', 初见回合: 0 }), id: 'npc_a' }],
    新闻: [],
    剧情: [{ ...创建剧情节点({ 标题: '节点', 回合: 1 }), id: 'node_1' }],
  });
}

function buildParams(overrides: Partial<Parameters<typeof 重新解析变量计划>[0]> = {}) {
  return {
    message: assistantMessage('assistant-3'),
    turn: 3,
    stateSnapshot: buildSnapshot(),
    // 基态指纹由调用方决定口径，本函数只原样带进计划；批量扫描传扫描起点那一枚。
    baseStateFingerprint: 'fp-scan',
    batches: [],
    mainApiConfig: {
      id: 'cfg',
      name: '测试',
      provider: 'openai_compatible' as const,
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      model: 'test-model',
      createdAt: 1,
      updatedAt: 1,
    },
    userInput: '继续前进',
    nsfwEnabled: false,
    maleNsfwArchiveEnabled: false,
    ...overrides,
  };
}

describe('变量重解析扫描', () => {
  beforeEach(() => {
    callVariableMock.mockReset();
  });

  it('解析命令并分类：冲突 / 确认 / 安全 / 不支持，计划带基态指纹', async () => {
    callVariableMock.mockResolvedValue({
      rawText: [
        '<变量更新>',
        'set 世界.当前地点 = "空间站"',
        'add NPC[id=npc_a].好感度 = 5',
        'set NPC[id=npc_a].外貌 = "短发布衣"',
        'set 旅人.姓名 = "开拓者"',
        '</变量更新>',
      ].join('\n'),
    });
    const params = buildParams();

    const plan = await 重新解析变量计划(params);

    expect(plan.items.map((item) => item.category)).toStrictEqual(['conflict', 'confirm', 'safe', 'unsupported']);
    expect(plan.turn).toBe(3);
    expect(plan.targetMessageId).toBe('assistant-3');
    expect(plan.modelName).toBe('test-model');
    expect(plan.baseStateFingerprint).toBe(params.baseStateFingerprint);
    expect(plan.items[3].reason).toContain('玩家手写');
  });

  it('NSFW 策略拒绝的命令进入 unsupported 并标记 nsfwRejected', async () => {
    callVariableMock.mockResolvedValue({
      rawText: '<变量更新>\nset NPC[id=npc_a].NSFW档案 = {"intimacyStage":"阶段"}\n</变量更新>',
    });

    const plan = await 重新解析变量计划(buildParams());

    const rejected = plan.items.find((item) => item.nsfwRejected);
    expect(rejected).toBeDefined();
    expect(rejected?.category).toBe('unsupported');
    expect(rejected?.reason).toContain('NSFW');
  });

  it('正文为空时抛错', async () => {
    callVariableMock.mockResolvedValue({ rawText: '<变量更新></变量更新>' });
    await expect(重新解析变量计划(buildParams({
      message: assistantMessage('assistant-empty', ''),
    }))).rejects.toThrow('正文为空');
  });
});
