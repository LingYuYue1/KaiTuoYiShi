/**
 * Complete public mutation protocol. Every command is asynchronous and revisioned.
 */

import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { 命途ID } from '@/models/journey';
import type { NPC阶位 } from '@/models/npc';
import type { 剧情模式 } from '@/models/journey';
import type { 命途阶段 } from '@/models/path';
import type { 智库条目, 智库条目草稿 } from '@/models/zhiku';
import type { 剧情编织运行状态 } from '@/models/storyWeaving';
import type { 图片槽位, 图片生成任务来源, 图片目标类型, 图片资源, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { NPC角色锚点档案 } from '@/models/npc';
import type { StoryPolicy } from '@/models/settingsPlanes';

export type CommandId = string & { readonly __brand: 'CommandId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type Revision = number & { readonly __brand: 'Revision' };

export function asCommandId(value: string): CommandId {
  return value as CommandId;
}

export function asSessionId(value: string): SessionId {
  return value as SessionId;
}

export function asRevision(value: number): Revision {
  return value as Revision;
}

export type AdvanceTurn = Readonly<{
  type: 'turn.advance';
  input: Readonly<{
    text: string;
    createdAt: number;
    openingTrigger?: string;
  }>;
}>;

export type RerollTurn = Readonly<{
  type: 'turn.reroll';
  turnId: string;
  createdAt: number;
}>;

export type ResetSession = Readonly<{
  type: 'session.reset';
  story: StoryState;
}>;

export type RegenerateNarrativeImage = Readonly<{
  type: 'message.image.regenerate';
  messageId: string;
}>;

export type RetryDurableJob = Readonly<{
  type: 'job.retry';
  jobId: string;
  availableAt: number;
}>;

export type CancelDurableJob = Readonly<{
  type: 'job.cancel';
  jobId: string;
  reason: string;
  cancelledAt: number;
}>;

export type InternalJobCommand =
  | Readonly<{ type: 'job.recover'; runnerId: string; recoveredAt: number }>
  | Readonly<{ type: 'job.claim-next'; runnerId: string; claimedAt: number }>
  | Readonly<{ type: 'job.start'; jobId: string; runnerId: string; startedAt: number }>
  | Readonly<{ type: 'job.execute'; jobId: string; runnerId: string }>;

export type SetPrimaryPath = Readonly<{
  type: 'path.set-primary';
  pathId: 命途ID;
}>;

export type DeclinePathAwakening = Readonly<{
  type: 'path.awakening.decline';
}>;

export type EnterPathAwakening = Readonly<{
  type: 'path.awakening.enter';
  createdAt: number;
}>;

export type EditMessageBody = Readonly<{
  type: 'message.edit-body';
  messageId: string;
  body: string;
}>;

export type SetCompanionTier = Readonly<{
  type: 'companion.set-tier';
  npcId: string;
  tier: NPC阶位;
}>;

export type SetCompanionTraveling = Readonly<{
  type: 'companion.set-traveling';
  npcId: string;
  traveling: boolean;
}>;

export type CompressMemory = Readonly<{
  type: 'memory.compress';
  layer: 'immediate' | 'short' | 'middle';
  force: boolean;
}>;

export type SetStoryMode = Readonly<{
  type: 'world.set-story-mode';
  mode: 剧情模式;
}>;

export type ReplaceStoryPolicy = Readonly<{
  type: 'story-policy.replace';
  policy: StoryPolicy;
}>;

export type SkillDraftInput = Readonly<{
  name: string;
  description: string;
  source: string;
  keywords: readonly string[];
  cost: string;
  cooldown: string;
  notes: string;
}>;

export type SaveSkill = Readonly<{
  type: 'skill.save';
  skillId?: string;
  slot: Readonly<{
    kind: 'normal' | 'path';
    index: number;
    pathId?: 命途ID;
    pathStage?: 命途阶段;
  }>;
  draft: SkillDraftInput;
  createdAt: number;
}>;

export type DeleteSkill = Readonly<{
  type: 'skill.delete';
  skillId: string;
}>;

export type SetSkillEnabled = Readonly<{
  type: 'skill.set-enabled';
  skillId: string;
  enabled: boolean;
  updatedAt: number;
}>;

export type UseInventoryItem = Readonly<{
  type: 'inventory.use';
  itemId: string;
  count: number;
}>;

export type DropInventoryItem = Readonly<{
  type: 'inventory.drop';
  itemId: string;
  count?: number;
}>;

export type UndoInventoryDrop = Readonly<{
  type: 'inventory.undo-drop';
  dropCommandId: CommandId;
}>;

export type CreateZhikuEntry = Readonly<{
  type: 'zhiku.create';
  draft: 智库条目草稿;
  createdAt: number;
}>;

export type UpdateZhikuEntry = Readonly<{
  type: 'zhiku.update';
  entryId: string;
  patch: Partial<Omit<智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>;
  updatedAt: number;
}>;

export type DeleteZhikuEntry = Readonly<{ type: 'zhiku.delete'; entryId: string }>;
export type RefreshBundledZhiku = Readonly<{ type: 'zhiku.refresh-bundled'; cacheBust: number }>;

export type StorySegmentDraftInput = Readonly<{
  title: string;
  chapterRange: string;
  injectionEnabled: boolean;
  summary: string;
  priorFacts: readonly string[];
  endingState: readonly string[];
  futureReferences: readonly string[];
  characters: readonly string[];
  locations: readonly string[];
  factions: readonly string[];
}>;

export type PlotCommand =
  | Readonly<{ type: 'plot.import-text'; text: string; title: string; fileName?: string; chaptersPerSegment: number }>
  | Readonly<{ type: 'plot.import-json'; json: string }>
  | Readonly<{ type: 'plot.restore-bundled' }>
  | Readonly<{ type: 'plot.rename-series'; seriesId: string; title: string; updatedAt: number }>
  | Readonly<{ type: 'plot.rebuild-series'; seriesId: string; chaptersPerSegment: number }>
  | Readonly<{ type: 'plot.toggle-series-injection'; seriesId: string; updatedAt: number }>
  | Readonly<{ type: 'plot.set-current'; seriesId: string; group: number; updatedAt: number }>
  | Readonly<{ type: 'plot.set-segment-status'; seriesId: string; segmentId: string; status: 剧情编织运行状态; updatedAt: number }>
  | Readonly<{ type: 'plot.save-segment'; seriesId: string; segmentId: string; draft: StorySegmentDraftInput; updatedAt: number }>
  | Readonly<{ type: 'plot.delete-series'; seriesId: string }>
  | Readonly<{ type: 'plot.decompose'; seriesId: string; segmentId: string }>
  | Readonly<{ type: 'plot.decompose-batch'; seriesId: string; mode: 'pending' | 'from-current' | 'all' }>;

export type AlbumCommand =
  | Readonly<{ type: 'album.import-reference'; targetKind: 'traveler' | 'npc'; targetId: string; name: string; src: string; mimeType: string; contentHash: string; createdAt: number }>
  | Readonly<{ type: 'album.set-reference'; entryId: string; characterId: string; enabled: boolean }>
  | Readonly<{
      type: 'album.bind-slot'; entryId: string; targetKind: 'traveler' | 'npc'; targetId: string; targetType: 图片目标类型; slot: 图片槽位;
      source: '原著' | '文生图'; builtin?: Readonly<{ asset: 图片资源; entry: 相册条目 }>;
    }>
  | Readonly<{ type: 'album.delete-entries'; entryIds: readonly string[] }>
  | Readonly<{ type: 'album.import-archive'; album: 相册系统 }>
  | Readonly<{ type: 'album.set-character-anchor'; targetKind: 'traveler' | 'npc'; targetId?: string; anchor?: NPC角色锚点档案; updatedAt: number }>
  | Readonly<{
      type: 'album.generate';
      title: string;
      source: 图片生成任务来源;
      prompt: string;
      negativePrompt?: string;
      sourcePrompt?: string;
      finalPrompt?: string;
      finalNegativePrompt?: string;
      anchorMode?: boolean;
      anchorSummary?: string;
      nsfw: boolean;
      targetType: 图片目标类型;
      targetId?: string;
      slot: 图片槽位;
      dimensions?: string;
      tags: readonly string[];
      note?: string;
      createdAt: number;
    }>;

export type PhoneCommand =
  | Readonly<{ type: 'phone.dismiss-seed'; seedId: string }>
  | Readonly<{ type: 'phone.mark-read'; chatId: string }>
  | Readonly<{ type: 'phone.add-contact'; npcId: string; updatedAt: number }>
  | Readonly<{ type: 'phone.open-private-chat'; npcId: string; createdAt: number }>
  | Readonly<{ type: 'phone.create-group'; npcIds: readonly string[]; title: string; createdAt: number }>
  | Readonly<{ type: 'phone.rename-group'; chatId: string; title: string; updatedAt: number }>
  | Readonly<{ type: 'phone.add-group-member'; chatId: string; npcId: string; updatedAt: number }>
  | Readonly<{ type: 'phone.set-wallpaper'; slot: 'home' | 'chat'; assetRef?: string }>
  | Readonly<{ type: 'phone.send'; chatId: string; text: string; createdAt: number }>
  | Readonly<{ type: 'phone.generate-seed'; seedId: string; createdAt: number }>;

export type CreateSession = Readonly<{
  type: 'session.create';
  story: StoryState;
}>;

export type SessionCommand =
  | ResetSession
  | RegenerateNarrativeImage
  | RetryDurableJob
  | CancelDurableJob
  | InternalJobCommand
  | SetPrimaryPath
  | DeclinePathAwakening
  | EnterPathAwakening
  | EditMessageBody
  | SetCompanionTier
  | SetCompanionTraveling
  | CompressMemory
  | SetStoryMode
  | ReplaceStoryPolicy
  | SaveSkill
  | DeleteSkill
  | SetSkillEnabled
  | UseInventoryItem
  | DropInventoryItem
  | UndoInventoryDrop
  | CreateZhikuEntry
  | UpdateZhikuEntry
  | DeleteZhikuEntry
  | RefreshBundledZhiku
  | PlotCommand
  | AlbumCommand
  | PhoneCommand
  | AdvanceTurn
  | RerollTurn;

export type SessionCommandEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  expectedRevision: Revision;
  command: SessionCommand;
}>;

/**
 * Application-facade request. `latest` keeps revision capture inside the
 * kernel's admitted session-command boundary, so background maintenance
 * cannot commit between a facade read and command admission.
 */
export type SessionCommandRequestEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  expectedRevision: Revision | 'latest';
  command: SessionCommand;
}>;

export type CreateSessionEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  command: CreateSession;
}>;

export type CommandEnvelope = CreateSessionEnvelope | SessionCommandRequestEnvelope;

export type AdvanceTurnEnvelope = SessionCommandEnvelope & {
  readonly command: AdvanceTurn;
};

export type RerollTurnEnvelope = SessionCommandEnvelope & {
  readonly command: RerollTurn;
};

export type ResetSessionEnvelope = SessionCommandEnvelope & {
  readonly command: ResetSession;
};

export type RegenerateNarrativeImageEnvelope = SessionCommandEnvelope & {
  readonly command: RegenerateNarrativeImage;
};

export type InternalJobEnvelope = SessionCommandEnvelope & {
  readonly command: InternalJobCommand;
};

export type SetPrimaryPathEnvelope = SessionCommandEnvelope & {
  readonly command: SetPrimaryPath;
};

export type DeclinePathAwakeningEnvelope = SessionCommandEnvelope & {
  readonly command: DeclinePathAwakening;
};

export type EnterPathAwakeningEnvelope = SessionCommandEnvelope & {
  readonly command: EnterPathAwakening;
};

export type EditMessageBodyEnvelope = SessionCommandEnvelope & {
  readonly command: EditMessageBody;
};

export type SetCompanionTierEnvelope = SessionCommandEnvelope & {
  readonly command: SetCompanionTier;
};

export type SetCompanionTravelingEnvelope = SessionCommandEnvelope & {
  readonly command: SetCompanionTraveling;
};

export type CompressMemoryEnvelope = SessionCommandEnvelope & {
  readonly command: CompressMemory;
};

export type SetStoryModeEnvelope = SessionCommandEnvelope & {
  readonly command: SetStoryMode;
};

export type SaveSkillEnvelope = SessionCommandEnvelope & { readonly command: SaveSkill };
export type DeleteSkillEnvelope = SessionCommandEnvelope & { readonly command: DeleteSkill };
export type SetSkillEnabledEnvelope = SessionCommandEnvelope & { readonly command: SetSkillEnabled };
export type UseInventoryItemEnvelope = SessionCommandEnvelope & { readonly command: UseInventoryItem };
export type DropInventoryItemEnvelope = SessionCommandEnvelope & { readonly command: DropInventoryItem };
export type UndoInventoryDropEnvelope = SessionCommandEnvelope & { readonly command: UndoInventoryDrop };
export type CreateZhikuEntryEnvelope = SessionCommandEnvelope & { readonly command: CreateZhikuEntry };
export type UpdateZhikuEntryEnvelope = SessionCommandEnvelope & { readonly command: UpdateZhikuEntry };
export type DeleteZhikuEntryEnvelope = SessionCommandEnvelope & { readonly command: DeleteZhikuEntry };
export type RefreshBundledZhikuEnvelope = SessionCommandEnvelope & { readonly command: RefreshBundledZhiku };
export type PlotCommandEnvelope = SessionCommandEnvelope & { readonly command: PlotCommand };
export type AlbumCommandEnvelope = SessionCommandEnvelope & { readonly command: AlbumCommand };
