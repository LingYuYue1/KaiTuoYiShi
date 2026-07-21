/**
 * StoryState — the kernel's durable story surface.
 *
 * Per IKernelIdealRefactorPlan §3 target state planes:
 *   StoryState contains ONLY story/gameplay data whose history belongs to this
 *   story. Device preferences, API configs, secrets, theme, and reusable
 *   content bodies are NEVER members of StoryState. Worldbook/prompt BODIES
 *   live in the ContentLibrary plane; only per-story trigger/unlock state is
 *   story-owned.
 *
 * Persistence stores this nested record directly. TurnJournalEntry and
 * TurnSnapshot are the sole reroll rollback authority.
 *
 * Construction rule: StoryState is only created from validated input
 * (a NewStorySeed via the onboarding use case). There is no "empty"
 * StoryState — an uninitialized story is the absence of a session.
 */

import type { 角色数据结构 } from '@/models/character';
import { 创建空角色, 确保命途列表 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import { 创建空记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import { 创建空忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import { 创建空手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建空相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空剧情编织系统 } from '@/models/storyWeaving';
import type { 变量命令批次 } from '@/models/variableCommand';
import { assertDurableJob, type DurableJob } from '@/src/kernel/domain/jobs/durableJob';
import { createDefaultSettingsPlanes, type StoryPolicy } from '@/models/settingsPlanes';

// ── Turn journal (for reroll) ──

/**
 * Per-turn immutable record that survives the turn CAS.
 * Replaces embedding a snapshot inside the assistant chat message
 * — reroll reads the TurnJournal directly.
 */
export interface TurnJournalEntry {
  /** The turn index (1-based, matches turnCount after commit). */
  turnIndex: number;
  /** The repository revision after this turn committed. */
  committedRevision: number;
  /** Timestamp of commit in ms. */
  committedAt: number;
  /** Pre-turn state snapshot captured when the user message was accepted. */
  preTurnSnapshot: TurnSnapshot;
}

/**
 * Snapshot of all story fields that a turn may mutate.
 * Field set matches the active turn transaction boundary.
 */
export interface TurnSnapshot {
  旅人: 角色数据结构;
  世界: 世界状态;
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: readonly NPC记录[];
  相册: 相册系统;
  新闻: readonly 新闻条目[];
  剧情: readonly 剧情节点[];
  剧情编织: 剧情编织系统;
  variableBatches: readonly 变量命令批次[];
  jobs: readonly DurableJob[];
  turnCount: number;
  pendingOpeningTrigger: string | null;
}

/** Validate the complete rollback boundary before a snapshot is trusted. */
export function assertTurnSnapshot(value: unknown): asserts value is TurnSnapshot {
  if (!isRecord(value)) throw new Error('Turn snapshot must be an object');

  const recordFields = ['旅人', '世界', '记忆', '忆庭', '智库', '手机', '相册', '剧情编织'] as const;
  for (const field of recordFields) {
    if (!isRecord(value[field])) throw new Error(`Turn snapshot requires object field ${field}`);
  }

  const arrayFields = ['NPC', '新闻', '剧情', 'variableBatches', 'jobs'] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) throw new Error(`Turn snapshot requires array field ${field}`);
  }
  for (const job of value.jobs as unknown[]) assertDurableJob(job);

  if (!Number.isSafeInteger(value.turnCount) || Number(value.turnCount) < 1) {
    throw new Error('Turn snapshot requires a positive turnCount');
  }
  if (
    value.pendingOpeningTrigger !== null &&
    typeof value.pendingOpeningTrigger !== 'string'
  ) {
    throw new Error('Turn snapshot requires pendingOpeningTrigger as string or null');
  }
}

/** Validate journal metadata and its complete pre-turn rollback snapshot. */
export function assertTurnJournalEntry(value: unknown): asserts value is TurnJournalEntry {
  if (!isRecord(value)) throw new Error('Turn journal entry must be an object');
  if (!Number.isSafeInteger(value.turnIndex) || Number(value.turnIndex) < 1) {
    throw new Error('Turn journal entry requires a positive turnIndex');
  }
  if (!Number.isSafeInteger(value.committedRevision) || Number(value.committedRevision) < 0) {
    throw new Error('Turn journal entry requires a non-negative committedRevision');
  }
  if (typeof value.committedAt !== 'number' || !Number.isFinite(value.committedAt) || value.committedAt < 0) {
    throw new Error('Turn journal entry requires a non-negative committedAt');
  }
  assertTurnSnapshot(value.preTurnSnapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ── Story state ──

export interface StoryState {
  readonly traveler: 角色数据结构;
  readonly world: 世界状态;

  readonly conversation: {
    readonly history: readonly 聊天消息[];
    readonly turnJournal: readonly TurnJournalEntry[];
    readonly turnCount: number;
  };

  readonly memory: {
    readonly system: 记忆系统;
    readonly yiting: 忆庭系统;
  };

  readonly characters: {
    readonly npcs: readonly NPC记录[];
  };

  readonly phone: 手机系统;
  readonly album: 相册系统;
  readonly news: readonly 新闻条目[];

  readonly plot: {
    readonly nodes: readonly 剧情节点[];
    readonly weaving: 剧情编织系统;
  };

  readonly systems: {
    readonly variableBatches: readonly 变量命令批次[];
  };

  readonly turn: {
    readonly pendingOpeningTrigger: string | null;
  };

  /** Story-owned feature policy. Device routes, appearance, and content bodies never enter this record. */
  readonly policy: StoryPolicy;

  /** Per-story content STATE only — bodies live in the ContentLibrary plane. */
  readonly content: {
    /** Runtime unlock state for zhiku entries. */
    readonly zhikuRuntime: 智库系统;
    /** Per-story worldbook trigger/cooldown history. */
    readonly worldbookTriggerStates: Readonly<Record<string, number>>;
  };

  readonly jobs: {
    readonly records: readonly DurableJob[];
  };
}

// ── Construction from validated input ──

export interface NewStorySeed {
  traveler: 角色数据结构;
  world: 世界状态;
  initialNpcRecords: NPC记录[];
  /** Hydrated zhiku runtime (bundled catalog merged) — required, not fabricated. */
  zhikuRuntime: 智库系统;
  /** Story weaving aligned to the opening archive; defaults to the real empty system. */
  storyWeaving?: 剧情编织系统;
  pendingOpeningTrigger?: string | null;
  /** Story-owned settings captured from the onboarding draft. */
  policy?: StoryPolicy;
}

/**
 * Create a StoryState from a validated new-story seed.
 * The caller (kernel onboarding use case) owns seed validation; every
 * subsystem starts from its real domain constructor — no `{} as T` casts.
 */
export function createStoryState(seed: NewStorySeed): StoryState {
  return {
    traveler: 确保命途列表({ ...创建空角色(), ...seed.traveler }),
    world: seed.world,
    conversation: {
      history: [],
      turnJournal: [],
      turnCount: 1,
    },
    memory: {
      system: 创建空记忆系统(),
      yiting: 创建空忆庭系统(),
    },
    characters: {
      npcs: seed.initialNpcRecords,
    },
    phone: 创建空手机系统(),
    album: 创建空相册系统(),
    news: [],
    plot: {
      nodes: [],
      weaving: seed.storyWeaving ?? 创建空剧情编织系统(),
    },
    systems: {
      variableBatches: [],
    },
    turn: {
      pendingOpeningTrigger: seed.pendingOpeningTrigger ?? null,
    },
    policy: seed.policy ?? createDefaultSettingsPlanes().story,
    content: {
      zhikuRuntime: seed.zhikuRuntime,
      worldbookTriggerStates: {},
    },
    jobs: {
      records: [],
    },
  };
}
