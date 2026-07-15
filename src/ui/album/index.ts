/**
 * UI album operations surface (Stage 5.4 D).
 * Slot bind/replace/delete + generate commit + KernelAlbum ↔ 相册系统 bridge.
 */

export {
  applyBindSlotOnLegacyAlbum,
  fromKernelAlbum,
  toKernelAlbum,
} from './projectAlbum';

export {
  bindSlot,
  bindSlotOnAlbum,
  bindSlotViaKernelOrLocal,
  commitGeneratedAsset,
  commitGeneratedOnAlbum,
  deleteEntries,
  deleteEntriesOnAlbum,
  deleteEntriesViaKernelOrLocal,
  fromKernelAlbum as projectFromKernelAlbum,
  generateImageViaKernel,
  toKernelAlbum as projectToKernelAlbum,
} from './slotOperations';

export type {
  CommitGeneratedLegacyInput,
  NativeKernelSession,
  SlotBindResult,
  SlotCommitResult,
  SlotDeleteResult,
} from './slotOperations';
