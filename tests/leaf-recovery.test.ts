import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/zhikuPreset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/zhikuPreset')>();
  const { 创建空智库系统 } = await import('@/models/zhiku');
  return {
    ...actual,
    loadAllBundledZhikuPresets: () => Promise.resolve(创建空智库系统()),
  };
});

import { createGameStateHarness } from './helpers/gameStateHarness';
import { seedDefaultWorkspace, seedWorkspace } from './helpers/workspaceFixture';

vi.mock('@/hooks/useGame/workflowTransaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useGame/workflowTransaction')>();
  return { ...actual, writeTurnLeaf: vi.fn(actual.writeTurnLeaf) };
});
import { writeTurnLeaf } from '@/hooks/useGame/workflowTransaction';
import { loadActiveLeaf, loadNewestStory, writeLeafNode } from '@/services/storage/saveTree';
import { loadSave, loadSaveIdByNodeId } from '@/services/storage/saveCrud';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { commitTurn, type 新局初始字段 } from '@/hooks/useGame/commitTurn';
import { executeSendWorkflow } from '@/hooks/useGame/sendWorkflow';
import { stage1_turnStart } from '@/hooks/useGame/stage1_turnStart';
import { abandonTurnRecovery } from '@/hooks/useGame/recoveryActions';
import type { TurnContext } from '@/hooks/useGame/turnTypes';
import {
  OPENING_INPUT,
  isOpeningLanded,
  shouldStartOpening,
  type OpeningStartFacts,
} from '@/models/opening';
import {
  normalizeEphemeralFields,
  resetEphemeralFields,
  stripEphemeralFields,
} from '@/models/leafLifecycle';
import { 创建聊天消息 } from '@/models/chat';
import type { TurnRecoveryContext } from '@/models/turnRecovery';
import { parsedStub, recoveryFor } from './helpers/workflowFixture';

type Harness = ReturnType<typeof createGameStateHarness>;

function testContext(state: Harness['state']): TurnContext {
  return {
    state,
    assertWorkflowActive: () => {},
    rollbackSnapshotOnAbort: null,
  } as unknown as TurnContext;
}

/** 建工作区 → 封版一个回合 → 读回封版检查点与当前活跃叶子，供生命周期断言共用。 */
async function seedCommitAndRead(
  harness: Harness,
  overrides: Partial<新局初始字段> = {},
) {
  await seedWorkspace(harness.state, overrides);
  const newest = await loadNewestStory();
  if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
  const previousHeadNodeId = newest.headNodeId;

  await commitTurn(testContext(harness.state), {}, newest);

  const committed = await loadNewestStory();
  const sealedSaveId = await loadSaveIdByNodeId(previousHeadNodeId);
  const sealed = sealedSaveId ? await loadSave(sealedSaveId) : null;
  const active = await loadActiveLeaf();
  return { previousHeadNodeId, committed, sealed, active };
}

describe('ephemeral field lifecycle', () => {
  it('normalizes phase and recovery context, reporting malformed values', () => {
    const valid = normalizeEphemeralFields({
      turnPhase: 'awaitingLanding',
      recoveryContext: { turnAtStart: 1, userInput: '检查门锁', userMessageId: 'u1' },
    });
    expect(valid.fields.turnPhase).toBe('awaitingLanding');
    expect(valid.fields.recoveryContext?.userMessageId).toBe('u1');
    expect(valid.issues).toHaveLength(0);

    const invalid = normalizeEphemeralFields({
      turnPhase: '随便',
      recoveryContext: { turnAtStart: 0 },
    });
    expect(invalid.fields.turnPhase).toBeNull();
    expect(invalid.fields.recoveryContext).toBeNull();
    expect(invalid.issues.map((issue) => issue.field).sort()).toEqual(['recoveryContext', 'turnPhase']);
  });

  it('rejects an over-long input instead of silently truncating it', () => {
    const oversized = normalizeEphemeralFields({
      turnPhase: 'awaitingLanding',
      recoveryContext: { turnAtStart: 1, userInput: `x${'y'.repeat(100_000)}`, userMessageId: 'u1' },
    });
    // 相位独立归一化不受影响；超长上下文判 issue + null，不截断后原样重发。
    expect(oversized.fields.turnPhase).toBe('awaitingLanding');
    expect(oversized.fields.recoveryContext).toBeNull();
    expect(oversized.issues.map((issue) => issue.field)).toEqual(['recoveryContext']);
  });

  it('drops a recovery context that has no phase', () => {
    const orphan = normalizeEphemeralFields({
      recoveryContext: { turnAtStart: 1, userInput: '检查门锁', userMessageId: 'u1' },
    });
    expect(orphan.fields.turnPhase).toBeNull();
    expect(orphan.fields.recoveryContext).toBeNull();
  });

  it('strips declared fields plus the legacy field, and resets only live fields', () => {
    const payload = {
      turnPhase: 'settling' as const,
      recoveryContext: recoveryFor('检查门锁', 'u1'),
      pendingOpeningTrigger: OPENING_INPUT,
      turnCount: 3,
    };
    const stripped = stripEphemeralFields(payload);
    expect('turnPhase' in stripped).toBe(false);
    expect('recoveryContext' in stripped).toBe(false);
    expect('pendingOpeningTrigger' in stripped).toBe(false);
    expect(stripped.turnCount).toBe(3);

    const reset = resetEphemeralFields(payload);
    expect(reset.turnPhase).toBeNull();
    expect(reset.recoveryContext).toBeNull();
    expect(reset.turnCount).toBe(3);
  });

});

describe('opening dispatch predicate', () => {
  const cases: Array<{ name: string; facts: OpeningStartFacts; expected: boolean }> = [
    {
      name: 'dispatches for a fresh new-game leaf',
      facts: { turnPhase: 'awaitingLanding', hasRecovery: false, openingLanded: false },
      expected: true,
    },
    {
      name: 'does not dispatch without an unfinished phase',
      facts: { turnPhase: null, hasRecovery: false, openingLanded: false },
      expected: false,
    },
    {
      name: 'does not dispatch while recovery context exists',
      facts: { turnPhase: 'awaitingLanding', hasRecovery: true, openingLanded: false },
      expected: false,
    },
    {
      name: 'does not dispatch once the opening has landed',
      facts: { turnPhase: 'awaitingLanding', hasRecovery: false, openingLanded: true },
      expected: false,
    },
  ];

  for (const item of cases) {
    it(item.name, () => {
      expect(shouldStartOpening(item.facts)).toBe(item.expected);
    });
  }

  it('derives landed facts from turn count or assistant history', () => {
    expect(isOpeningLanded(1, [])).toBe(false);
    expect(isOpeningLanded(2, [])).toBe(true);
    expect(isOpeningLanded(1, [{ role: 'assistant' }])).toBe(true);
  });
});

describe('leaf recovery lifecycle', () => {
  it('creates the new-game leaf in awaitingLanding and strips ephemerals from the root checkpoint', async () => {
    await seedDefaultWorkspace();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase).toBe('awaitingLanding');
    expect(active.leaf.recoveryContext ?? null).toBeNull();

    const parentNodeId = (active.leaf as { saveTree?: { parentNodeId?: string } }).saveTree?.parentNodeId;
    const rootSaveId = parentNodeId ? await loadSaveIdByNodeId(parentNodeId) : null;
    const rootSave = rootSaveId ? await loadSave(rootSaveId) : null;
    expect(rootSave).toBeTruthy();
    expect((rootSave as unknown as Record<string, unknown>).turnPhase).toBeUndefined();
    expect((rootSave as unknown as Record<string, unknown>).recoveryContext).toBeUndefined();
  });

  it('writes the durable user message and awaitingLanding in one S1 leaf write', async () => {
    const harness = await seedDefaultWorkspace();
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');

    const result = await stage1_turnStart(
      testContext(harness.state),
      newest.headNodeId,
      '检查门锁',
      harness.state.世界,
    );

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase).toBe('awaitingLanding');
    expect(active.leaf.recoveryContext?.userInput).toBe('检查门锁');
    expect(active.leaf.recoveryContext?.userMessageId).toBe(result.userMsg.id);
    expect(active.leaf.chatHistory.map((message) => message.id)).toEqual([result.userMsg.id]);

    expect(harness.state.turnPhase).toBe('awaitingLanding');
    expect(harness.activeWorkflow.recovery?.userMessageId).toBe(result.userMsg.id);
  });

  it('leaves the leaf untouched when S1 is superseded before the guarded write', async () => {
    const harness = await seedDefaultWorkspace();
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
    const ctx = testContext(harness.state);
    ctx.assertWorkflowActive = () => {
      throw new DOMException('Workflow aborted', 'AbortError');
    };

    await expect(
      stage1_turnStart(ctx, newest.headNodeId, '检查门锁', harness.state.世界),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.chatHistory).toHaveLength(0);
    expect(active.leaf.turnPhase).toBe('awaitingLanding');
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });

  it('strips recovery state from the sealed checkpoint and the next leaf', async () => {
    const harness = createGameStateHarness();
    const userMsg = 创建聊天消息('user', '检查门锁');
    const assistantMsg = 创建聊天消息('assistant', '门锁是开着的。', { parsedResponse: parsedStub('门锁是开着的。') });
    const { previousHeadNodeId, committed, sealed, active } = await seedCommitAndRead(harness, {
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'settling',
      recoveryContext: recoveryFor('检查门锁', userMsg.id, { assistantMessageId: assistantMsg.id }),
    });

    expect(committed.headNodeId).not.toBe(previousHeadNodeId);
    expect(committed.pendingChildNodeId).toBeNull();
    expect((sealed as unknown as Record<string, unknown> | null)?.turnPhase).toBeUndefined();
    expect((sealed as unknown as Record<string, unknown> | null)?.recoveryContext).toBeUndefined();

    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });

  it('projects awaitingLanding recovery after boot when the user message is durable', async () => {
    const harness = createGameStateHarness();
    const userMsg = 创建聊天消息('user', OPENING_INPUT);
    await seedWorkspace(harness.state, {
      chatHistory: [userMsg],
      turnPhase: 'awaitingLanding',
      recoveryContext: recoveryFor(OPENING_INPUT, userMsg.id),
    });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.turnPhase).toBe('awaitingLanding');
    expect(harness.activeWorkflow.recovery?.userMessageId).toBe(userMsg.id);

    expect(shouldStartOpening({
      turnPhase: harness.state.turnPhase,
      hasRecovery: Boolean(harness.activeWorkflow.recovery),
      openingLanded: isOpeningLanded(harness.state.turnCount, harness.state.chatHistory),
    })).toBe(false);
  });

  it('keeps a coherent settling recovery across boot for resume', async () => {
    const harness = createGameStateHarness();
    const userMsg = 创建聊天消息('user', '检查门锁');
    const assistantMsg = 创建聊天消息('assistant', '门锁是开着的。', { parsedResponse: parsedStub('门锁是开着的。') });
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'settling',
      recoveryContext: recoveryFor('检查门锁', userMsg.id, { assistantMessageId: assistantMsg.id }),
    });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.turnPhase).toBe('settling');
    expect(harness.activeWorkflow.recovery?.assistantMessageId).toBe(assistantMsg.id);

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase).toBe('settling');
  });

  it('keeps the fresh new-game awaitingLanding across boot', async () => {
    const harness = await seedDefaultWorkspace();

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.turnPhase).toBe('awaitingLanding');
    expect(harness.activeWorkflow.recovery).toBeNull();
    expect(shouldStartOpening({
      turnPhase: harness.state.turnPhase,
      hasRecovery: false,
      openingLanded: isOpeningLanded(harness.state.turnCount, harness.state.chatHistory),
    })).toBe(true);
  });

  it('disarms and persists an awaitingLanding phase that contradicts landed history', async () => {
    const harness = createGameStateHarness();
    const userMsg = 创建聊天消息('user', OPENING_INPUT);
    const assistantMsg = 创建聊天消息('assistant', '红按钮在门后闪烁。');
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'awaitingLanding',
      recoveryContext: recoveryFor(OPENING_INPUT, userMsg.id),
    });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.turnPhase).toBeNull();
    expect(harness.activeWorkflow.recovery).toBeNull();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });

  it('disarms and persists a malformed recovery context', async () => {
    const harness = await seedDefaultWorkspace();
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
    // 直接写入非法值，模拟历史数据 / 手工改档绕过了建局归一化。
    await writeLeafNode(newest.headNodeId, {
      turnPhase: 'awaitingLanding',
      recoveryContext: { turnAtStart: 0 } as unknown as TurnRecoveryContext,
    });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.turnPhase).toBeNull();
    expect(harness.activeWorkflow.recovery).toBeNull();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });

  it('undoes an unfinished turn by stripping the pending user message and clearing recovery state', async () => {
    const harness = await seedDefaultWorkspace();
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
    await stage1_turnStart(testContext(harness.state), newest.headNodeId, '检查门锁', harness.state.世界);

    const undone = await abandonTurnRecovery(harness.state);
    expect(undone.ok).toBe(true);
    expect(undone.text).toBe('检查门锁');

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.chatHistory).toHaveLength(0);
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
    expect(harness.state.turnPhase).toBeNull();
    expect(harness.activeWorkflow.recovery).toBeNull();
  });

  it('retries an unfinished turn by abandoning then resending the same input into a clean leaf', async () => {
    const harness = await seedDefaultWorkspace();
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
    await stage1_turnStart(testContext(harness.state), newest.headNodeId, '检查门锁', harness.state.世界);

    // handleRetryRecovery 的组合语义（abandon + 原样重发）：不断言 AI 调用 half，
    // 只断言剥离后的叶子历史干净、重发文本与恢复上下文一致。
    const abandoned = await abandonTurnRecovery(harness.state);
    expect(abandoned.ok).toBe(true);
    expect(abandoned.text).toBe('检查门锁');
    if (!abandoned.text) throw new Error('放弃应交还原始输入');

    const resent = await stage1_turnStart(testContext(harness.state), newest.headNodeId, abandoned.text, harness.state.世界);
    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.chatHistory.map((message) => message.id)).toEqual([resent.userMsg.id]);
    expect(active.leaf.turnPhase).toBe('awaitingLanding');
    expect(active.leaf.recoveryContext?.userInput).toBe('检查门锁');
    expect(active.leaf.recoveryContext?.userMessageId).toBe(resent.userMsg.id);
  });

  it('keeps the fresh-opening projection when aborted before the S1 write', async () => {
    const harness = await seedDefaultWorkspace();
    // S1 落盘前被中止：叶子仍是新鲜开局形状，投影必须如实保留 awaitingLanding，
    // 否则开局派发谓词在刷新前永远无法再次触发。
    vi.mocked(writeTurnLeaf).mockRejectedValueOnce(new DOMException('Workflow aborted', 'AbortError'));
    await executeSendWorkflow('检查门锁', {
      state: harness.state,
      getActiveConfig: harness.getActiveConfig,
    });

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.chatHistory).toHaveLength(0);
    expect(harness.state.turnPhase).toBe('awaitingLanding');
    expect(harness.activeWorkflow.recovery).toBeNull();
    expect(shouldStartOpening({
      turnPhase: harness.state.turnPhase,
      hasRecovery: false,
      openingLanded: isOpeningLanded(harness.state.turnCount, harness.state.chatHistory),
    })).toBe(true);
  });

  it('abandoning a settling phase keeps the landed history', async () => {
    const harness = createGameStateHarness();
    const userMsg = 创建聊天消息('user', '检查门锁');
    const assistantMsg = 创建聊天消息('assistant', '门锁是开着的。', { parsedResponse: parsedStub('门锁是开着的。') });
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [userMsg, assistantMsg],
      turnPhase: 'settling',
      recoveryContext: recoveryFor('检查门锁', userMsg.id, { assistantMessageId: assistantMsg.id }),
    });

    const abandoned = await abandonTurnRecovery(harness.state);
    expect(abandoned.ok).toBe(true);

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.chatHistory).toHaveLength(2);
    expect(active.leaf.turnPhase ?? null).toBeNull();
    expect(active.leaf.recoveryContext ?? null).toBeNull();
  });
});
