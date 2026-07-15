/**
 * Kernel knowledge-domain types (Stage 5.2).
 *
 * Formal-friendly minimal shapes for zhiku unlock, yiting local recall,
 * story archive injection, and composed knowledge prompt context.
 * Not a full dump of models/zhiku | models/yiting | models/storyWeaving.
 */

export type KernelZhikuEntry = Readonly<{
  id: string;
  title: string;
  category: string;
  /** Source unlock status / runtime-facing gate label. */
  unlockStatus: string;
  runtimeUnlockStatus?: string;
  runtimeUnlockNote?: string;
  usableForLink?: boolean;
  unlockCondition?: string;
  relatedSegment?: string;
  body?: string;
  keywords?: readonly string[];
}>;

export type KernelZhikuSystem = Readonly<{
  entries: readonly KernelZhikuEntry[];
}>;

export type KernelStoryArchive = Readonly<{
  segmentTitle: string;
  summary?: string;
  body?: string;
}>;

export type KernelStoryProgress = Readonly<{
  archives: readonly KernelStoryArchive[];
  /** Optional prebuilt inject text; preferred by storyInjection when set. */
  injectionHint?: string;
}>;

export type KernelYitingEntry = Readonly<{
  id: string;
  name: string;
  turn: number;
  summary: string;
  raw?: string;
  keywords?: readonly string[];
  type?: string;
}>;

export type KernelYitingSystem = Readonly<{
  entries: readonly KernelYitingEntry[];
}>;

export type KernelMemoryTier = Readonly<{
  recentSummaries: readonly string[];
}>;

export type KernelZhikuUnlockItem = Readonly<{
  id: string;
  title: string;
  status: string;
  reason: string;
}>;

export type KernelZhikuUnlockResult = Readonly<{
  zhiku: KernelZhikuSystem;
  changed: boolean;
  unlocked: readonly KernelZhikuUnlockItem[];
}>;

export type KernelYitingRecallResult = Readonly<{
  entries: readonly KernelYitingEntry[];
  injection: string;
}>;
