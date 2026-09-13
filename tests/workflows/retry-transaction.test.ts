import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDefaultWorkspace } from '../helpers/workspaceFixture';
import { retryQueueTask } from '@/hooks/useGame/workflowRetry';
import { runNewsGenerationStep } from '@/hooks/useGame/newsWorkflow';
import { callVariableModel } from '@/services/ai/variableModel';
import { cancelActiveWorkflow } from '@/hooks/useGame/workflowTransaction';
import { beginSession, ensureHeadLeafWritable } from '@/hooks/useGame/saveLoadWorkflow';
import { commitTurn } from '@/hooks/useGame/commitTurn';
import { loadActiveLeaf, loadNewestStory, sealLeafRow, isActiveLeafWritable } from '@/services/storage/saveTree';
import { loadSave, loadSaveIdByNodeId } from '@/services/storage/saveCrud';
import { getStreamingMessage } from '@/utils/streamingMessageStore';
import { 归一化新闻条目, type 新闻条目 } from '@/models/news';
import type { 队列任务ID, 队列任务记录 } from '@/models/queueTask';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { TurnContext, TurnDeltas } from '@/hooks/useGame/turnTypes';
import {
  assistantMessage,
  latestTask as latestTaskBase,
  loadActiveLeafOrThrow as loadLeafOrThrow,
  userMessage,
} from '../helpers/workflowFixture';

vi.mock('@/hooks/useGame/newsWorkflow', () => ({
  runNewsGenerationStep: vi.fn(),
}));
vi.mock('@/services/ai/variableModel', () => ({
  callVariableModel: vi.fn(),
}));

const VARIABLE_COMMAND_TEXT = '<变量更新>\nset 世界.当前地点 = "测试站"\n</变量更新>';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function failedNewsTask(): 队列任务记录 {
  return {
    id: 'news',
    title: '星际和平周报',
    turn: 2,
    timestamp: 3,
    status: 'failed',
    failCount: 1,
    targetMessageId: 'assistant-1',
  };
}

function failedVariableTask(): 队列任务记录 {
  return {
    id: 'variable',
    title: '变量生成',
    turn: 2,
    timestamp: 3,
    status: 'failed',
    failCount: 1,
    targetMessageId: 'assistant-1',
    targetBatchId: 'batch-fail',
  };
}

function failedBatch(): 变量命令批次 {
  return {
    id: 'batch-fail',
    turn: 2,
    targetMessageId: 'assistant-1',
    timestamp: 3,
    source: 'main',
    modelName: 'test-model',
    results: [{
      command: { action: 'set', key: '(变量模型调用失败)', value: null },
      ok: false,
      reason: '调用失败',
    }],
  };
}

function latestTask(queueTasks: 队列任务记录[], id: 队列任务ID): 队列任务记录 | undefined {
  return latestTaskBase(queueTasks, id);
}

const newsItem: 新闻条目 = 归一化新闻条目({
  id: 'news-retry-1',
  标题: '重试后的新闻',
  正文: '正文',
  回合: 2,
});

describe('standalone workflow transactions', () => {
  const runNewsMock = vi.mocked(runNewsGenerationStep);
  const callVariableMock = vi.mocked(callVariableModel);

  beforeEach(() => {
    runNewsMock.mockReset();
    callVariableMock.mockReset();
  });

  it('persists news retry results through the active leaf and keeps turn semantics', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    runNewsMock.mockResolvedValue({ news: [newsItem], changed: true });

    await retryQueueTask(harness.state, harness.getActiveConfig, failedNewsTask());

    expect(harness.activeWorkflow.loading).toBe(false);
    expect(harness.activeWorkflow.turnStatus).toEqual({ kind: 'idle' });
    expect(harness.cells.新闻.get()).toEqual([newsItem]);

    const active = await loadLeafOrThrow();
    expect(active.leaf.新闻).toEqual([newsItem]);
    expect(active.leaf.turnCount).toBe(2);
    expect(active.leaf.chatHistory.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(latestTask(active.leaf.queueTasks ?? [], 'news')?.status).toBe('success');
  });

  it('projects variable retry state only after the leaf write succeeds', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
      variableBatches: [failedBatch()],
    });
    harness.setGameSettings((prev) => ({ ...prev, enableVariableUpdate: true }));
    callVariableMock.mockResolvedValue({ rawText: VARIABLE_COMMAND_TEXT });

    await retryQueueTask(harness.state, harness.getActiveConfig, failedVariableTask());

    expect(harness.cells.世界.get().当前地点).toBe('测试站');
    expect(harness.cells.variableBatches.get().some((batch) => batch.id !== 'batch-fail')).toBe(true);

    const active = await loadLeafOrThrow();
    expect(active.leaf.世界.当前地点).toBe('测试站');
    expect(active.leaf.variableBatches?.some((batch) => batch.id !== 'batch-fail')).toBe(true);
    expect(latestTask(active.leaf.queueTasks ?? [], 'variable')?.status).toBe('success');
  });

  it('restores the variable snapshot and leaves the leaf untouched when the write is rejected', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
      variableBatches: [failedBatch()],
    });
    harness.setGameSettings((prev) => ({ ...prev, enableVariableUpdate: true }));
    const initialLocation = harness.cells.世界.get().当前地点;

    callVariableMock.mockImplementation(async (_config, request) => {
      const active = await loadActiveLeaf();
      if (active.status !== 'ok' || !active.newest.headNodeId) throw new Error('活跃叶子不可读');
      const saveId = await loadSaveIdByNodeId(active.newest.headNodeId);
      const leaf = saveId ? await loadSave(saveId) : null;
      if (leaf) await sealLeafRow(leaf);
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return { rawText: VARIABLE_COMMAND_TEXT };
    });

    await retryQueueTask(harness.state, harness.getActiveConfig, failedVariableTask());

    // 写叶子失败：没有领域投影、没有成功队列项。
    expect(harness.cells.世界.get().当前地点).toBe(initialLocation);
    expect(harness.cells.variableBatches.get()).toHaveLength(1);
    expect(latestTask(harness.cells.queueTasks.get(), 'variable')?.status).toBe('failed');
    expect(harness.activeWorkflow.loading).toBe(false);
    expect((await loadActiveLeaf()).status).toBe('sealed-conflict');

    // 崩溃窗口恢复：下一次进入工作区时能重新拿到可写叶子并重试成功。
    const recovered = await ensureHeadLeafWritable(harness.state);
    expect(recovered.headNodeId).toBeTruthy();
    callVariableMock.mockResolvedValue({ rawText: VARIABLE_COMMAND_TEXT });
    await retryQueueTask(harness.state, harness.getActiveConfig, failedVariableTask());
    expect(harness.cells.世界.get().当前地点).toBe('测试站');
    const active = await loadLeafOrThrow();
    expect(active.leaf.世界.当前地点).toBe('测试站');
  });

  it('cleans up abort state and queue ledger without touching the persisted leaf', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    runNewsMock.mockImplementation(({ signal }) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    const retryPromise = retryQueueTask(harness.state, harness.getActiveConfig, failedNewsTask());
    await vi.waitFor(() => {
      expect(latestTask(harness.cells.queueTasks.get(), 'news')?.status).toBe('pending');
    });

    cancelActiveWorkflow(harness.state);
    await retryPromise;

    expect(harness.activeWorkflow.loading).toBe(false);
    expect(getStreamingMessage()).toBe('');
    expect(harness.activeWorkflow.turnStatus.kind).toBe('stopped');
    expect(latestTask(harness.cells.queueTasks.get(), 'news')?.status).toBe('cancelled');
    const latestById = new Map<队列任务ID, 队列任务记录>();
    for (const task of harness.cells.queueTasks.get()) latestById.set(task.id, task);
    expect([...latestById.values()].every((task) => task.status !== 'pending')).toBe(true);

    const active = await loadLeafOrThrow();
    expect(active.leaf.新闻 ?? []).toEqual([]);
    expect(active.leaf.chatHistory.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
  });

  it('ignores a superseded workflow that resolves after session teardown', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    const deferred = createDeferred<Awaited<ReturnType<typeof runNewsGenerationStep>>>();
    runNewsMock.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      void deferred.promise.then(resolve, reject);
    }));

    const retryPromise = retryQueueTask(harness.state, harness.getActiveConfig, failedNewsTask());
    await vi.waitFor(() => {
      expect(latestTask(harness.cells.queueTasks.get(), 'news')?.status).toBe('pending');
    });
    const queueLengthBeforeTeardown = harness.cells.queueTasks.get().length;

    beginSession(harness.state);
    deferred.resolve({ news: [newsItem], changed: true });
    await retryPromise;

    expect(harness.cells.queueTasks.get()).toHaveLength(queueLengthBeforeTeardown);
    expect(harness.cells.新闻.get()).toEqual([]);
    expect(harness.activeWorkflow.loading).toBe(false);
    const active = await loadLeafOrThrow();
    expect(active.leaf.新闻 ?? []).toEqual([]);
  });

  it('refuses to start while another workflow owns the slot', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    harness.cells.loading.set(true);

    await retryQueueTask(harness.state, harness.getActiveConfig, failedNewsTask());

    expect(runNewsMock).not.toHaveBeenCalled();
    expect(harness.activeWorkflow.loading).toBe(true);
    const refusal = latestTask(harness.cells.queueTasks.get(), 'news');
    expect(refusal?.status).toBe('failed');
    expect(refusal?.detail).toContain('当前有任务进行中');
  });

  it('lets the next normal turn commit seal retry results without changing turn semantics', async () => {
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMessage('user-1'), assistantMessage('assistant-1')],
    });
    runNewsMock.mockResolvedValue({ news: [newsItem], changed: true });
    await retryQueueTask(harness.state, harness.getActiveConfig, failedNewsTask());

    const newest = await loadNewestStory();
    const previousHeadNodeId = newest.headNodeId;
    expect(previousHeadNodeId).toBeTruthy();
    const ctx = {
      state: harness.state,
      assertWorkflowActive: () => {},
      rollbackSnapshotOnAbort: null,
    } as unknown as TurnContext;
    const deltas: TurnDeltas = {};
    await commitTurn(ctx, deltas, newest);

    const committed = await loadNewestStory();
    expect(committed.headNodeId).not.toBe(previousHeadNodeId);
    if (!previousHeadNodeId) throw new Error('缺少旧工作区指针');
    expect(await isActiveLeafWritable(previousHeadNodeId)).toBe(false);

    const active = await loadLeafOrThrow();
    expect(active.leaf.新闻).toEqual([newsItem]);
    expect(active.leaf.turnCount).toBe(2);
    expect(active.leaf.chatHistory.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
  });
});
