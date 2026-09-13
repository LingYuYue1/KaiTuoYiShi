import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data/zhikuPreset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/zhikuPreset')>();
  const { 创建空智库系统 } = await import('@/models/zhiku');
  return {
    ...actual,
    loadAllBundledZhikuPresets: () => Promise.resolve(创建空智库系统()),
  };
});

vi.mock('@/hooks/useGame/turnTail', () => ({
  runTurnTail: vi.fn(),
}));

import { createGameStateHarness } from '../helpers/gameStateHarness';
import { seedDefaultWorkspace, seedWorkspace } from '../helpers/workspaceFixture';
import { executeResumeWorkflow } from '@/hooks/useGame/resumeWorkflow';
import { runTurnTail } from '@/hooks/useGame/turnTail';
import {
  forkSaveTreeLeaf,
  loadActiveLeaf,
  loadNewestStory,
  saveNewestStory,
  sealLeafRow,
} from '@/services/storage/saveTree';
import { getSaveCatalogSnapshot, loadSave, loadSaveIdByNodeId } from '@/services/storage/saveCrud';
import { isUnsealedHeadSave } from '@/services/storage/saveSummary';
import { 登记待采纳子叶, 指向NewestStory记录 } from '@/models/newestStory';
import { 创建聊天消息 } from '@/models/chat';
import { parsedStub, recoveryFor } from '../helpers/workflowFixture';

type Harness = ReturnType<typeof createGameStateHarness>;

describe('settling resume wiring', () => {
  const runTurnTailMock = vi.mocked(runTurnTail);

  beforeEach(() => {
    runTurnTailMock.mockReset();
    runTurnTailMock.mockResolvedValue(undefined);
    // node 测试环境无 window：续跑在重建 d 后经 rAF 让出一次，直接同步推进。
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 0;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resumes a coherent settling recovery through runTurnTail and clears the projections', async () => {
    const userMsg = 创建聊天消息('user', '检查门锁');
    const assistantMsg = 创建聊天消息('assistant', '门锁是开着的。', { parsedResponse: parsedStub('门锁是开着的。') });
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'settling',
      recoveryContext: recoveryFor('检查门锁', userMsg.id, { assistantMessageId: assistantMsg.id }, 2),
    });

    const ok = await executeResumeWorkflow({ state: harness.state, getActiveConfig: harness.getActiveConfig });

    expect(ok).toBe(true);
    expect(runTurnTailMock).toHaveBeenCalledTimes(1);
    expect(harness.state.turnPhase).toBeNull();
    expect(harness.activeWorkflow.recovery).toBeNull();
    expect(harness.activeWorkflow.loading).toBe(false);
    expect(harness.activeWorkflow.turnStatus).toEqual({ kind: 'idle' });
  });

  it('disarms the leaf when the settling recovery no longer matches the landed history', async () => {
    const userMsg = 创建聊天消息('user', '检查门锁');
    const assistantMsg = 创建聊天消息('assistant', '门锁是开着的。', { parsedResponse: parsedStub('门锁是开着的。') });
    const harness = await seedDefaultWorkspace({
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'settling',
      // 落地回复 id 与恢复上下文不一致：续跑守卫应判失效。
      recoveryContext: recoveryFor('检查门锁', userMsg.id, { assistantMessageId: 'stale-assistant' }, 2),
    });

    const ok = await executeResumeWorkflow({ state: harness.state, getActiveConfig: harness.getActiveConfig });

    expect(ok).toBe(false);
    expect(runTurnTailMock).not.toHaveBeenCalled();
    expect(harness.state.turnPhase).toBeNull();
    expect(harness.activeWorkflow.recovery).toBeNull();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });
});

describe('crash-window child adoption by newest identity', () => {
  /** 构造崩溃窗口：已封版旧 head + 两个同父未封版子叶，指针显式指回旧 head。 */
  async function seedAmbiguousCrashWindow(harness: Harness) {
    await seedWorkspace(harness.state);
    const before = await loadNewestStory();
    if (!before.headNodeId) throw new Error('缺少初始工作区指针');
    const headId = before.headNodeId;
    const headSaveId = await loadSaveIdByNodeId(headId);
    if (!headSaveId) throw new Error('缺少旧 head 存档');
    const headSave = await loadSave(headSaveId);
    const headTree = (headSave as unknown as { saveTree?: { rootId: string } } | null)?.saveTree;
    if (!headTree) throw new Error('缺少工作区树元信息');
    const rootId = headTree.rootId;

    const forkA = await forkSaveTreeLeaf({ rootId, targetNodeId: headId, branchName: 'branch-a' });
    const forkB = await forkSaveTreeLeaf({ rootId, targetNodeId: headId, branchName: 'branch-b' });
    // 封版旧 head：此时 newest 仍指向已封版节点，但两个子叶已存在。
    const sealed = await loadSave(headSaveId);
    if (!sealed) throw new Error('旧叶子缺失');
    await sealLeafRow(sealed);
    // 目录快照是异步物化：等旧 head 已封版、两个子叶都可见为未封版后，
    // 再做采纳断言，否则单子叶 early-return / 旧 head 仍可写都会误判。
    await vi.waitFor(async () => {
      const snapshot = await getSaveCatalogSnapshot();
      expect(snapshot.catalogComplete).toBe(true);
      const children = snapshot.items
        .filter((item) => item.saveTree?.parentNodeId === headId && item.unsealedHead === true)
        .map((item) => item.saveTree?.nodeId);
      expect(children).toContain(forkA.headNodeId);
      expect(children).toContain(forkB.headNodeId);
      const headLeaf = await loadSave(headSaveId);
      expect(headLeaf && isUnsealedHeadSave(headLeaf)).toBe(false);
    });
    return { headId, childA: forkA.headNodeId, childB: forkB.headNodeId };
  }

  it('adopts the registered child and clears the pending identity on pointer move', async () => {
    const harness = createGameStateHarness();
    const { headId, childA, childB } = await seedAmbiguousCrashWindow(harness);
    expect(childA).not.toBe(childB);

    const newest = await loadNewestStory();
    await saveNewestStory(登记待采纳子叶(指向NewestStory记录(newest, headId), childA));

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error(`采纳失败：${active.status}`);
    expect(active.newest.headNodeId).toBe(childA);

    const moved = await loadNewestStory();
    expect(moved.headNodeId).toBe(childA);
    expect(moved.pendingChildNodeId).toBeNull();
  });

  it('reports sealed-conflict instead of guessing when the identity is absent', async () => {
    const harness = createGameStateHarness();
    const { headId } = await seedAmbiguousCrashWindow(harness);

    const newest = await loadNewestStory();
    // 无登记身份：多子叶歧义不得按保存 ID 猜测。
    await saveNewestStory(指向NewestStory记录(newest, headId));

    const active = await loadActiveLeaf();
    expect(active.status).toBe('sealed-conflict');
  });
});
