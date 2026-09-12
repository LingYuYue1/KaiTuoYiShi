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
import { seedWorkspace } from './helpers/workspaceFixture';
import { loadActiveLeaf, loadNewestStory } from '@/services/storage/saveTree';
import { loadSave, loadSaveIdByNodeId } from '@/services/storage/saveCrud';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { commitTurn } from '@/hooks/useGame/commitTurn';
import { stage1_turnStart } from '@/hooks/useGame/stage1_turnStart';
import type { TurnContext } from '@/hooks/useGame/turnTypes';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  loadWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { OPENING_INPUT, deriveOpeningBootstrap } from '@/models/opening';
import {
  normalizeEphemeralFields,
  resetEphemeralFields,
  stripEphemeralFields,
} from '@/models/leafLifecycle';
import { 创建聊天消息 } from '@/models/chat';

function testContext(
  state: ReturnType<typeof createGameStateHarness>['state'],
  journal = createWorkflowRecoveryJournal(OPENING_INPUT, 1),
): TurnContext {
  return {
    state,
    assertWorkflowActive: () => {},
    recoveryJournal: journal,
  } as unknown as TurnContext;
}

describe('ephemeral field registry', () => {
  it('accepts only the opening constant and reports anything else', () => {
    expect(normalizeEphemeralFields({ pendingOpeningTrigger: OPENING_INPUT }).fields.pendingOpeningTrigger)
      .toBe(OPENING_INPUT);
    expect(normalizeEphemeralFields({}).fields.pendingOpeningTrigger).toBeNull();

    const invalid = normalizeEphemeralFields({ pendingOpeningTrigger: '任意用户文本' });
    expect(invalid.fields.pendingOpeningTrigger).toBeNull();
    expect(invalid.issues).toHaveLength(1);
    expect(invalid.issues[0].field).toBe('pendingOpeningTrigger');
    expect(invalid.issues[0].raw).toBe('任意用户文本');
  });

  it('strips and resets declared fields generically', () => {
    const payload = { pendingOpeningTrigger: OPENING_INPUT, turnCount: 3 };
    const stripped = stripEphemeralFields(payload);
    expect('pendingOpeningTrigger' in stripped).toBe(false);
    expect(stripped.turnCount).toBe(3);

    const reset = resetEphemeralFields(payload);
    expect(reset.pendingOpeningTrigger).toBeNull();
    expect(reset.turnCount).toBe(3);
  });
});

describe('opening dispatch predicate', () => {
  it('derives dispatch from projection, turn facts and journal presence', () => {
    const facts = { turnCount: 1, chatHistory: [] as { role: string }[], hasJournal: false };
    expect(deriveOpeningBootstrap(OPENING_INPUT, facts)).toBe(true);
    expect(deriveOpeningBootstrap(null, facts)).toBe(false);
    expect(deriveOpeningBootstrap(OPENING_INPUT, { ...facts, hasJournal: true })).toBe(false);
    expect(deriveOpeningBootstrap(OPENING_INPUT, { ...facts, turnCount: 2 })).toBe(false);
    expect(deriveOpeningBootstrap(OPENING_INPUT, { ...facts, chatHistory: [{ role: 'assistant' }] })).toBe(false);
  });
});

describe('opening bootstrap lifecycle', () => {
  it('keeps the armed value on the active leaf but strips it from the sealed checkpoint and the next leaf', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });

    const newest = await loadNewestStory();
    const previousHeadNodeId = newest.headNodeId;
    if (!previousHeadNodeId) throw new Error('缺少初始工作区指针');

    await commitTurn(testContext(harness.state), {}, newest);

    const committed = await loadNewestStory();
    expect(committed.headNodeId).not.toBe(previousHeadNodeId);

    const sealedSaveId = await loadSaveIdByNodeId(previousHeadNodeId);
    const sealed = sealedSaveId ? await loadSave(sealedSaveId) : null;
    expect(sealed).toBeTruthy();
    expect((sealed as { pendingOpeningTrigger?: unknown } | null)?.pendingOpeningTrigger ?? null).toBeNull();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger ?? null).toBeNull();
  });

  it('persists the recovery journal phase and pending child id given by the caller', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state);
    const newest = await loadNewestStory();
    const journal = {
      ...createWorkflowRecoveryJournal('继续前进', 1),
      phase: 'variable_settlement' as const,
      assistantMessageId: 'assistant-1',
    };

    await commitTurn(testContext(harness.state, journal), {}, newest, journal);

    const persisted = await loadWorkflowRecoveryJournal();
    expect(persisted?.workflowId).toBe(journal.workflowId);
    expect(persisted?.phase).toBe('variable_settlement');
    expect(persisted?.assistantMessageId).toBe('assistant-1');
    expect(persisted?.pendingChildNodeId).toBeTruthy();
    await clearWorkflowRecoveryJournal(journal.workflowId);
  });

  it('disarms and persists the cleaned value when boot restores an already-landed opening', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [
        创建聊天消息('user', OPENING_INPUT),
        创建聊天消息('assistant', '红按钮在门后闪烁。'),
      ],
      pendingOpeningTrigger: OPENING_INPUT,
    });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.pendingOpeningTrigger).toBeNull();

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger ?? null).toBeNull();
  });

  it('keeps an unfinished opening armed across boot restore', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });

    const restored = await bootRestoreFromNewest(harness.state);
    expect(restored).toBe(true);
    expect(harness.state.pendingOpeningTrigger).toBe(OPENING_INPUT);

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger).toBe(OPENING_INPUT);
  });

  it('consumes the opening trigger in S1 through the guarded leaf writer', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });
    const newest = await loadNewestStory();

    await stage1_turnStart(
      testContext(harness.state),
      newest.headNodeId,
      OPENING_INPUT,
      harness.state.世界,
      createWorkflowRecoveryJournal(OPENING_INPUT, 1),
    );

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger ?? null).toBeNull();
  });

  it('leaves the trigger armed when S1 is superseded before the guarded write', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });
    const newest = await loadNewestStory();
    const ctx = testContext(harness.state);
    ctx.assertWorkflowActive = () => {
      throw new DOMException('Workflow aborted', 'AbortError');
    };

    await expect(
      stage1_turnStart(ctx, newest.headNodeId, OPENING_INPUT, harness.state.世界, createWorkflowRecoveryJournal(OPENING_INPUT, 1)),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger).toBe(OPENING_INPUT);
  });
});
