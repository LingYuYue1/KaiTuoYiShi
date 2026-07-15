/**
 * Kernel knowledge domain (Stage 5.2) — pure surface.
 *
 * Local zhiku unlock, yiting recall, and composed knowledge injection.
 * Integration into executeTurn / prompt builders is Agent B's job.
 */

export type {
  BuildKnowledgeInjectionInput,
} from './buildKnowledgeInjection';
export { buildKnowledgeInjection } from './buildKnowledgeInjection';

export type {
  KernelMemoryTier,
  KernelStoryArchive,
  KernelStoryProgress,
  KernelYitingEntry,
  KernelYitingRecallResult,
  KernelYitingSystem,
  KernelZhikuEntry,
  KernelZhikuSystem,
  KernelZhikuUnlockItem,
  KernelZhikuUnlockResult,
} from './types';

export { retrieveYitingLocal } from './yitingLocalRecall';
export { applyZhikuRuntimeUnlock } from './zhikuRuntimeUnlock';
