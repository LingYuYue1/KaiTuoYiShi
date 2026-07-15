/**
 * Kernel album-domain types (Stage 5.4).
 *
 * Formal album slice — metadata + AssetRef ids only.
 * NO dataUrl, NO objectUrl, NO bytes, NO createObjectURL.
 *
 * GameState.album is owned by SessionRepository (Stage 5.4 B).
 */

export type KernelImageSlot =
  | 'avatar_profile'
  | 'avatar_story'
  | 'avatar_phone'
  | 'portrait'
  | 'phone_wallpaper'
  | 'phone_chat_background'
  | 'group_avatar'
  | 'scene'
  | 'item_icon'
  | 'nsfw_female_chest'
  | 'nsfw_female_genital'
  | 'nsfw_male_genital'
  | 'nsfw_rear'
  | 'nsfw_body_reference'
  | 'reference_image'
  | 'misc';

export type KernelImageTargetType =
  | 'traveler'
  | 'npc'
  | 'phone'
  | 'scene'
  | 'item'
  | 'nsfw_part'
  | 'misc';

export type KernelAssetSource = 'generated' | 'upload' | 'remote';
export type KernelAssetStatus = 'ready' | 'failed' | 'pending';

/** Formal asset metadata. NO dataUrl, NO objectUrl, NO bytes. */
export type KernelAsset = Readonly<{
  id: string; // same string as AssetRef brand stripped
  mimeType?: string;
  contentHash?: string;
  width?: number;
  height?: number;
  size?: number;
  source: KernelAssetSource;
  status: KernelAssetStatus;
  nsfw: boolean;
  createdAt: number;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  backend?: string;
  /** Remote original only if needed; never blob: or data: */
  remoteUrl?: string;
}>;

export type KernelAlbumEntry = Readonly<{
  id: string;
  assetId: string;
  title: string;
  targetType: KernelImageTargetType;
  targetId?: string;
  slot: KernelImageSlot;
  tags: readonly string[];
  nsfw: boolean;
  createdAt: number;
  note?: string;
  referenceTargets: readonly string[];
}>;

export type KernelImageTaskStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export type KernelImageTask = Readonly<{
  id: string;
  targetType: KernelImageTargetType;
  targetId?: string;
  slot: KernelImageSlot;
  source: 'manual' | 'auto' | 'retry';
  status: KernelImageTaskStatus;
  backend: string;
  nsfw: boolean;
  prompt: string;
  negativePrompt?: string;
  resultAssetId?: string; // only when success with committed asset
  error?: string;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}>;

/**
 * Slot binding index: at most one committed asset per (targetType, targetId, slot).
 * Prefer explicit targetId: traveler uses targetId 'traveler'.
 */
export type KernelSlotBinding = Readonly<{
  targetType: KernelImageTargetType;
  targetId: string;
  slot: KernelImageSlot;
  assetId: string;
  entryId: string;
}>;

export type KernelAlbum = Readonly<{
  assets: readonly KernelAsset[];
  entries: readonly KernelAlbumEntry[];
  tasks: readonly KernelImageTask[];
  /** Canonical slot map — source of truth for "what is mounted where" */
  slots: readonly KernelSlotBinding[];
}>;

/** Empty formal album — valid state for new sessions / schema ingress. */
export function createEmptyKernelAlbum(): KernelAlbum {
  return {
    assets: [],
    entries: [],
    tasks: [],
    slots: [],
  };
}

export function cloneKernelAlbum(album: KernelAlbum): KernelAlbum {
  return {
    assets: album.assets.map((asset) => ({ ...asset })),
    entries: album.entries.map((entry) => ({
      ...entry,
      tags: entry.tags.slice(),
      referenceTargets: entry.referenceTargets.slice(),
    })),
    tasks: album.tasks.map((task) => ({ ...task })),
    slots: album.slots.map((slot) => ({ ...slot })),
  };
}

export function findAsset(
  album: KernelAlbum,
  assetId: string,
): KernelAsset | undefined {
  return album.assets.find((asset) => asset.id === assetId);
}

export function findEntry(
  album: KernelAlbum,
  entryId: string,
): KernelAlbumEntry | undefined {
  return album.entries.find((entry) => entry.id === entryId);
}

export function findSlotBinding(
  album: KernelAlbum,
  targetType: KernelImageTargetType,
  targetId: string,
  slot: KernelImageSlot,
): KernelSlotBinding | undefined {
  return album.slots.find(
    (binding) =>
      binding.targetType === targetType
      && binding.targetId === targetId
      && binding.slot === slot,
  );
}
