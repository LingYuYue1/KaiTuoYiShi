/**
 * Kernel album domain (Stage 5.4) — pure surface.
 *
 * Slot bind/replace, entry delete, and generated-asset commit.
 * Integration into application / AlbumPanel is Agent B's job.
 * Binary lives in AssetStore; formal state holds AssetRef metadata only.
 */

export { bindSlot } from './bindSlot';
export type { BindSlotInput, BindSlotResult } from './bindSlot';

export { commitGeneratedAsset } from './commitGeneratedAsset';
export type {
  CommitGeneratedInput,
  CommitGeneratedResult,
} from './commitGeneratedAsset';

export { deleteEntries } from './deleteEntries';
export type { DeleteEntriesResult } from './deleteEntries';

export type {
  KernelAlbum,
  KernelAlbumEntry,
  KernelAsset,
  KernelAssetSource,
  KernelAssetStatus,
  KernelImageSlot,
  KernelImageTargetType,
  KernelImageTask,
  KernelImageTaskStatus,
  KernelSlotBinding,
} from './types';
export {
  cloneKernelAlbum,
  createEmptyKernelAlbum,
  findAsset,
  findEntry,
  findSlotBinding,
} from './types';
