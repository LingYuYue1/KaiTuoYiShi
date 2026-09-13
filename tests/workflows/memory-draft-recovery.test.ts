import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStateHarness, type GameStateHarness } from '../helpers/gameStateHarness';
import { seedWorkspace } from '../helpers/workspaceFixture';
import { ignoreMemoryDraft, retryMemoryDraft } from '@/hooks/useGame/memoryRecovery';
import { loadActiveLeaf } from '@/services/storage/saveTree';
import {
  创建空记忆系统,
  构建记忆失败草稿,
  type 记忆失败草稿,
  type 记忆系统,
} from '@/models/memory';
import { 归一化记忆系统设置 } from '@/models/settings';

vi.mock('@/services/ai/chatCompletionClient', () => ({
  chatCompletionNonStream: vi.fn(),
}));

import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';

const nonStreamMock = vi.mocked(chatCompletionNonStream);
const NOW = 1_700_000_000_000;

function configureMemoryApi(harness: GameStateHarness): void {
  harness.setGameSettings((prev) => ({
    ...prev,
    记忆系统: 归一化记忆系统设置({
      ...prev.记忆系统,
      即时转短期阈值: 2,
      启用中短长期API总结: true,
      记忆总结API: {
        provider: 'openai_compatible',
        baseUrl: 'https://recall.example/v1',
        apiKey: 'sk-recall',
        model: 'recall-model',
        retryCount: 0,
      },
    }),
  }));
}

function buildMemoryWithDraft(): { memory: 记忆系统; draft: 记忆失败草稿 } {
  const memory = 创建空记忆系统();
  memory.即时记忆 = ['甲', '乙', '丙'];
  const draft = 构建记忆失败草稿({
    kind: 'short',
    turn: 2,
    items: ['甲', '乙'],
    prompt: '把即时记忆压缩为短期记忆。',
    failureCode: 'request_failed',
    failureMessage: '网络错误',
    now: NOW,
  });
  if (!draft) throw new Error('测试草稿构建失败');
  memory.失败草稿 = [draft];
  return { memory, draft };
}

async function seedWithDraftMemory(overrides: Partial<记忆系统> = {}) {
  const harness = createGameStateHarness();
  const { memory, draft } = buildMemoryWithDraft();
  await seedWorkspace(harness.state, { turnCount: 2, 记忆: { ...memory, ...overrides } });
  configureMemoryApi(harness);
  return { harness, draft };
}

async function loadLeafMemory(): Promise<记忆系统> {
  const active = await loadActiveLeaf();
  if (active.status !== 'ok') throw new Error(`活跃叶子不可读：${active.status}`);
  return active.leaf.记忆;
}

beforeEach(() => {
  nonStreamMock.mockReset();
});

describe('记忆失败草稿恢复', () => {
  it('重试成功：按快照归档批次并写回叶子', async () => {
    const { harness, draft } = await seedWithDraftMemory();
    nonStreamMock.mockResolvedValue('- 甲乙已整理为短期纪要');

    await retryMemoryDraft(harness.state, harness.getActiveConfig, draft.id);

    const after = harness.cells.记忆.get();
    expect(after.即时记忆).toStrictEqual(['丙']);
    expect(after.短期记忆).toStrictEqual(['- 甲乙已整理为短期纪要']);
    expect(after.中期记忆).toStrictEqual([]);
    expect(after.长期记忆).toStrictEqual([]);
    expect(after.失败草稿[0].status).toBe('resolved');
    expect(after.失败草稿[0].attemptCount).toBe(1);
    expect(harness.activeWorkflow.loading).toBe(false);

    const leafMemory = await loadLeafMemory();
    expect(leafMemory.短期记忆).toStrictEqual(['- 甲乙已整理为短期纪要']);
    expect(leafMemory.失败草稿[0].status).toBe('resolved');
  });

  it('重试再失败：记忆不动，草稿回 pending 并累计次数', async () => {
    const { harness, draft } = await seedWithDraftMemory();
    nonStreamMock.mockRejectedValue(new Error('仍然失败'));

    await retryMemoryDraft(harness.state, harness.getActiveConfig, draft.id);

    const after = harness.cells.记忆.get();
    expect(after.即时记忆).toStrictEqual(['甲', '乙', '丙']);
    expect(after.短期记忆).toStrictEqual([]);
    expect(after.失败草稿[0].status).toBe('pending');
    expect(after.失败草稿[0].attemptCount).toBe(1);
    expect(after.失败草稿[0].failureMessage).toContain('仍然失败');

    const leafMemory = await loadLeafMemory();
    expect(leafMemory.失败草稿[0].status).toBe('pending');
    expect(leafMemory.即时记忆).toStrictEqual(['甲', '乙', '丙']);
  });

  it('源批已被修改：草稿作废并留诊断', async () => {
    const { harness, draft } = await seedWithDraftMemory({ 即时记忆: ['丙'] });

    await retryMemoryDraft(harness.state, harness.getActiveConfig, draft.id);

    const after = harness.cells.记忆.get();
    expect(after.即时记忆).toStrictEqual(['丙']);
    expect(after.失败草稿[0].status).toBe('ignored');
    expect(after.失败草稿[0].failureCode).toBe('source_changed');
    expect(nonStreamMock).not.toHaveBeenCalled();

    const leafMemory = await loadLeafMemory();
    expect(leafMemory.失败草稿[0].status).toBe('ignored');
  });

  it('忽略：草稿归档、批次不消费、叶子同步', async () => {
    const { harness, draft } = await seedWithDraftMemory();

    await ignoreMemoryDraft(harness.state, draft.id);

    const after = harness.cells.记忆.get();
    expect(after.即时记忆).toStrictEqual(['甲', '乙', '丙']);
    expect(after.失败草稿[0].status).toBe('ignored');
    expect(nonStreamMock).not.toHaveBeenCalled();

    const leafMemory = await loadLeafMemory();
    expect(leafMemory.失败草稿[0].status).toBe('ignored');
    expect(leafMemory.即时记忆).toStrictEqual(['甲', '乙', '丙']);
  });

  it('不存在的草稿：拒绝并留可见队列提示', async () => {
    const { harness } = await seedWithDraftMemory();

    await retryMemoryDraft(harness.state, harness.getActiveConfig, 'missing-draft');

    expect(harness.cells.记忆.get().失败草稿[0].status).toBe('pending');
    const memoryTask = [...harness.cells.queueTasks.get()].reverse().find((task) => task.id === 'memory');
    expect(memoryTask?.status).toBe('failed');
  });
});
