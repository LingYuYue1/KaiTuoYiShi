/**
 * IKernel command envelope contract (Phase 1 / Stage 5.1 / 5.3 / 5.4).
 * Must not import old models, services, hooks, or UI types.
 */

import type {
  KernelImageSlot,
  KernelImageTargetType,
} from '@/src/kernel/domain/album';
import type { KernelNewsGenerationPatch } from '@/src/kernel/domain/news/types';

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
  }>;
}>;

export type RerollTurn = Readonly<{
  type: 'turn.reroll';
  turnId: string;
}>;

/**
 * Manual variable apply from UI Variable Manager (Stage 5.1).
 * Candidates only in the command — formal commit is a single CAS.
 * Does not go through the AI model.
 */
export type ApplyVariables = Readonly<{
  type: 'variables.apply';
  commands: readonly Readonly<{
    action: 'set' | 'add' | 'sub' | 'push' | 'delete';
    key: string;
    value: unknown;
  }>[];
}>;

/**
 * Phone contact reply (Stage 5.3).
 * Application: ensureThread → buildPhonePrompt → model.complete → appendPhoneReply → CAS.
 */
export type PhoneReply = Readonly<{
  type: 'phone.reply';
  contactId: string;
  contactName: string;
  userText: string;
}>;

/**
 * Apply a pre-parsed news patch (Stage 5.3).
 * Host / tests supply KernelNewsGenerationPatch; single CAS.
 */
export type NewsApply = Readonly<{
  type: 'news.apply';
  patch: KernelNewsGenerationPatch;
}>;

/**
 * Generate news via model.complete → parse → applyNewsPatch → CAS (Stage 5.3).
 */
export type NewsGenerate = Readonly<{
  type: 'news.generate';
}>;

/**
 * Generate image via ImageGenerator → AssetStore.put → commitGeneratedAsset → CAS (Stage 5.4).
 * Formal album updates only on final successful CAS; intermediate progress is frames only.
 */
export type ImageGenerate = Readonly<{
  type: 'image.generate';
  prompt: string;
  negativePrompt?: string;
  nsfw: boolean;
  title: string;
  targetType: KernelImageTargetType;
  targetId?: string;
  slot: KernelImageSlot;
  size?: string;
  backend?: string;
  referenceAssetIds?: readonly string[];
  /** If true, bind resulting entry to slot on commit */
  bindToSlot?: boolean;
  tags?: readonly string[];
  note?: string;
}>;

/**
 * Delete album entries by id (Stage 5.4).
 * Pure deleteEntries + single CAS; orphan asset bytes removed after CAS.
 */
export type AlbumDelete = Readonly<{
  type: 'album.delete';
  entryIds: readonly string[];
}>;

/**
 * Bind an existing album entry to a slot (Stage 5.4).
 * Pure bindSlot + single CAS.
 */
export type AlbumBindSlot = Readonly<{
  type: 'album.bindSlot';
  entryId: string;
  targetType: KernelImageTargetType;
  targetId: string;
  slot: KernelImageSlot;
}>;

export type CreateSession = Readonly<{
  type: 'session.create';
  presetId: string;
}>;

export type SessionCommand =
  | AdvanceTurn
  | RerollTurn
  | ApplyVariables
  | PhoneReply
  | NewsApply
  | NewsGenerate
  | ImageGenerate
  | AlbumDelete
  | AlbumBindSlot;

export type SessionCommandEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  expectedRevision: Revision;
  command: SessionCommand;
}>;

export type CreateSessionEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  command: CreateSession;
}>;

export type CommandEnvelope = CreateSessionEnvelope | SessionCommandEnvelope;

export type AdvanceTurnEnvelope = SessionCommandEnvelope & {
  readonly command: AdvanceTurn;
};

export type RerollTurnEnvelope = SessionCommandEnvelope & {
  readonly command: RerollTurn;
};

export type ApplyVariablesEnvelope = SessionCommandEnvelope & {
  readonly command: ApplyVariables;
};

export type PhoneReplyEnvelope = SessionCommandEnvelope & {
  readonly command: PhoneReply;
};

export type NewsApplyEnvelope = SessionCommandEnvelope & {
  readonly command: NewsApply;
};

export type NewsGenerateEnvelope = SessionCommandEnvelope & {
  readonly command: NewsGenerate;
};

export type ImageGenerateEnvelope = SessionCommandEnvelope & {
  readonly command: ImageGenerate;
};

export type AlbumDeleteEnvelope = SessionCommandEnvelope & {
  readonly command: AlbumDelete;
};

export type AlbumBindSlotEnvelope = SessionCommandEnvelope & {
  readonly command: AlbumBindSlot;
};
