/**
 * Pure slot bind / replace (Stage 5.4).
 *
 * REPLACE semantics: new binding wins; previous KernelSlotBinding is removed
 * from `slots`. Previous entry target fields stay historical (slots is SoT).
 * Bound entry targetType/targetId/slot are updated to match the bind input.
 */

import {
  findAsset,
  findEntry,
  findSlotBinding,
  type KernelAlbum,
  type KernelImageSlot,
  type KernelImageTargetType,
  type KernelSlotBinding,
} from './types';

export type BindSlotInput = Readonly<{
  entryId: string;
  targetType: KernelImageTargetType;
  targetId: string;
  slot: KernelImageSlot;
}>;

export type BindSlotResult =
  | Readonly<{ ok: true; album: KernelAlbum; previous: KernelSlotBinding | null }>
  | Readonly<{
      ok: false;
      reason: 'entry_not_found' | 'asset_not_found' | 'invalid_target';
    }>;

/**
 * Bind entry's asset to a slot.
 * Require entry.assetId exists in assets with status==='ready'.
 * Reject empty targetId / invalid.
 */
export function bindSlot(
  album: KernelAlbum,
  input: BindSlotInput,
): BindSlotResult {
  if (!album || typeof album !== 'object') {
    throw new Error('bindSlot: album must be a KernelAlbum object');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('bindSlot: input must be an object');
  }

  if (!isNonEmptyString(input.entryId)) {
    return { ok: false, reason: 'entry_not_found' };
  }
  if (!isNonEmptyString(input.targetId)) {
    return { ok: false, reason: 'invalid_target' };
  }
  if (!isKernelImageTargetType(input.targetType)) {
    return { ok: false, reason: 'invalid_target' };
  }
  if (!isKernelImageSlot(input.slot)) {
    return { ok: false, reason: 'invalid_target' };
  }

  const entry = findEntry(album, input.entryId);
  if (!entry) {
    return { ok: false, reason: 'entry_not_found' };
  }
  if (!isNonEmptyString(entry.assetId)) {
    return { ok: false, reason: 'asset_not_found' };
  }

  const asset = findAsset(album, entry.assetId);
  if (!asset || asset.status !== 'ready') {
    return { ok: false, reason: 'asset_not_found' };
  }

  const previous =
    findSlotBinding(album, input.targetType, input.targetId, input.slot) ?? null;

  const nextBinding: KernelSlotBinding = {
    targetType: input.targetType,
    targetId: input.targetId,
    slot: input.slot,
    assetId: entry.assetId,
    entryId: entry.id,
  };

  const slots = album.slots
    .filter(
      (binding) =>
        !(
          binding.targetType === input.targetType
          && binding.targetId === input.targetId
          && binding.slot === input.slot
        ),
    )
    .concat([nextBinding]);

  const entries = album.entries.map((item) => {
    if (item.id !== entry.id) return item;
    return {
      ...item,
      targetType: input.targetType,
      targetId: input.targetId,
      slot: input.slot,
    };
  });

  return {
    ok: true,
    album: {
      assets: album.assets,
      entries,
      tasks: album.tasks,
      slots,
    },
    previous,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const TARGET_TYPES: ReadonlySet<string> = new Set([
  'traveler',
  'npc',
  'phone',
  'scene',
  'item',
  'nsfw_part',
  'misc',
]);

const IMAGE_SLOTS: ReadonlySet<string> = new Set([
  'avatar_profile',
  'avatar_story',
  'avatar_phone',
  'portrait',
  'phone_wallpaper',
  'phone_chat_background',
  'group_avatar',
  'scene',
  'item_icon',
  'nsfw_female_chest',
  'nsfw_female_genital',
  'nsfw_male_genital',
  'nsfw_rear',
  'nsfw_body_reference',
  'reference_image',
  'misc',
]);

function isKernelImageTargetType(value: unknown): value is KernelImageTargetType {
  return typeof value === 'string' && TARGET_TYPES.has(value);
}

function isKernelImageSlot(value: unknown): value is KernelImageSlot {
  return typeof value === 'string' && IMAGE_SLOTS.has(value);
}
