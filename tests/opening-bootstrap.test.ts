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
import { loadActiveLeaf, loadNewestStory, writeLeafNode } from '@/services/storage/saveTree';
import { loadSave, loadSaveIdByNodeId } from '@/services/storage/saveCrud';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { commitTurn, type 新局初始字段 } from '@/hooks/useGame/commitTurn';
import { stage1_turnStart } from '@/hooks/useGame/stage1_turnStart';
import type { TurnContext } from '@/hooks/useGame/turnTypes';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  loadWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import {
  OPENING_INPUT,
  getOpeningStartFacts,
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

type Harness = ReturnType<typeof createGameStateHarness>;

function testContext(
  state: Harness['state'],
  journal = createWorkflowRecoveryJournal(OPENING_INPUT, 1),
): TurnContext {
  return {
    state,
    assertWorkflowActive: () => {},
    recoveryJournal: journal,
  } as unknown as TurnContext;
}

/** 建工作区 → 封版一个回合 → 读回封版检查点与当前活跃叶子，供生命周期断言共用。 */
async function seedCommitAndRead(
  harness: Harness,
  options: { overrides?: Partial<新局初始字段>; journal?: WorkflowRecoveryJournal } = {},
) {
  await seedWorkspace(harness.state, options.overrides ?? {});
  const newest = await loadNewestStory();
  if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
  const previousHeadNodeId = newest.headNodeId;

  await commitTurn(testContext(harness.state, options.journal), {}, newest, options.journal);

  const committed = await loadNewestStory();
  const sealedSaveId = await loadSaveIdByNodeId(previousHeadNodeId);
  const sealed = sealedSaveId ? await loadSave(sealedSaveId) : null;
  const active = await loadActiveLeaf();
  return { previousHeadNodeId, committed, sealed, active };
}

describe('ephemeral field lifecycle', () => {
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
  const cases: Array<{ name: string; facts: OpeningStartFacts; expected: boolean }> = [
    {
      name: 'dispatches when the projection is armed and the opening has not landed',
      facts: { bootstrap: OPENING_INPUT, openingLanded: false, hasJournal: false },
      expected: true,
    },
    {
      name: 'does not dispatch without a projection',
      facts: { bootstrap: null, openingLanded: false, hasJournal: false },
      expected: false,
    },
    {
      name: 'does not dispatch while a recovery journal is in flight',
      facts: { bootstrap: OPENING_INPUT, openingLanded: false, hasJournal: true },
      expected: false,
    },
    {
      name: 'does not dispatch once the opening has landed',
      facts: { bootstrap: OPENING_INPUT, openingLanded: true, hasJournal: false },
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

    const facts = getOpeningStartFacts({
      pendingOpeningTrigger: OPENING_INPUT,
      turnCount: 1,
      chatHistory: [],
      hasJournal: false,
    });
    expect(facts).toEqual({ bootstrap: OPENING_INPUT, openingLanded: false, hasJournal: false });
  });
});

describe('opening bootstrap lifecycle', () => {
  it('keeps the armed value on the active leaf but strips it from the sealed checkpoint and the next leaf', async () => {
    const harness = createGameStateHarness();
    const { previousHeadNodeId, committed, sealed, active } = await seedCommitAndRead(harness, {
      overrides: { pendingOpeningTrigger: OPENING_INPUT },
    });

    expect(committed.headNodeId).not.toBe(previousHeadNodeId);
    expect(sealed).toBeTruthy();
    expect((sealed as { pendingOpeningTrigger?: unknown } | null)?.pendingOpeningTrigger ?? null).toBeNull();

    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger ?? null).toBeNull();
  });

  it('persists the recovery journal phase and pending child id given by the caller', async () => {
    const harness = createGameStateHarness();
    const journal: WorkflowRecoveryJournal = {
      ...createWorkflowRecoveryJournal('继续前进', 1),
      phase: 'variable_settlement',
      assistantMessageId: 'assistant-1',
    };

    await seedCommitAndRead(harness, { journal });

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

  it('disarms and persists the cleaned value when boot restores a malformed opening value', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state);
    const newest = await loadNewestStory();
    if (!newest.headNodeId) throw new Error('缺少初始工作区指针');
    // 直接写入非法值，模拟历史数据 / 手工改档绕过了建局归一化。
    await writeLeafNode(newest.headNodeId, { pendingOpeningTrigger: '不是开局常量' });

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

  it('consumes the opening trigger in S1 from the leaf without reading the React projection', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });
    const newest = await loadNewestStory();
    // 派发方会先清空投影：消费必须只看输入常量与叶子，不看 React 状态。
    harness.state.setPendingOpeningTrigger(null);

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

  it('does not consume the opening trigger for a normal input', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, { pendingOpeningTrigger: OPENING_INPUT });
    const newest = await loadNewestStory();

    await stage1_turnStart(
      testContext(harness.state),
      newest.headNodeId,
      '普通输入',
      harness.state.世界,
      createWorkflowRecoveryJournal('普通输入', 1),
    );

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error('活跃叶子缺失');
    expect(active.leaf.pendingOpeningTrigger).toBe(OPENING_INPUT);
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
