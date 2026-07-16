import type {
  图片槽位,
  图片生成任务,
  图片目标类型,
  图片资源,
  图片槽位绑定,
  相册条目,
  相册系统,
} from '@/models/imageGeneration';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { 创建相册资源引用 } from '@/utils/albumActions';
import { rememberAlbumAssetFromDataUrl, revokeAlbumAssets } from '@/utils/albumObjectUrl';

export type SlotBindResult = Readonly<{
  album: 相册系统;
  assetRef: string;
  previousEntryId?: string;
}>;

export type SlotDeleteResult = Readonly<{
  album: 相册系统;
  removedAssetIds: readonly string[];
  removedEntryIds: readonly string[];
  removedBindings: readonly 图片槽位绑定[];
}>;

export type SlotCommitResult = Readonly<{
  album: 相册系统;
  entryId: string;
  assetId: string;
}>;

export function bindSlotOnAlbum(
  album: 相册系统,
  input: Readonly<{
    entryId: string;
    targetType: 图片目标类型;
    targetId: string;
    slot: 图片槽位;
  }>,
): SlotBindResult {
  const current = 归一化相册系统(album);
  if (!input.targetId.trim()) throw new Error('Album slot binding requires targetId');
  const entry = current.entries.find((candidate) => candidate.id === input.entryId);
  if (!entry) throw new Error(`Album entry not found: ${input.entryId}`);
  const asset = current.assets.find((candidate) => candidate.id === entry.assetId);
  if (!asset || asset.status !== 'ready') throw new Error(`Ready album asset not found: ${entry.assetId}`);

  rememberInlineAsset(asset);
  const previous = current.bindings.find((binding) => sameSlot(binding, input));
  const binding: 图片槽位绑定 = {
    targetType: input.targetType,
    targetId: input.targetId,
    slot: input.slot,
    entryId: entry.id,
    updatedAt: Date.now(),
  };
  return {
    album: {
      ...current,
      bindings: [binding, ...current.bindings.filter((candidate) => !sameSlot(candidate, input))],
    },
    assetRef: 创建相册资源引用(asset.id),
    previousEntryId: previous?.entryId,
  };
}

export function deleteEntriesOnAlbum(
  album: 相册系统,
  entryIds: readonly string[],
): SlotDeleteResult {
  const current = 归一化相册系统(album);
  if (!entryIds.length || entryIds.some((id) => !id.trim())) {
    throw new Error('Album deletion requires non-empty entry ids');
  }
  const ids = new Set(entryIds);
  const removedEntryIds = current.entries.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
  if (!removedEntryIds.length) throw new Error('No album entries matched deletion request');

  const entries = current.entries.filter((entry) => !ids.has(entry.id));
  const removedBindings = current.bindings.filter((binding) => ids.has(binding.entryId));
  const retainedAssetIds = new Set(entries.map((entry) => entry.assetId));
  const removedAssetIds = current.assets
    .filter((asset) => !retainedAssetIds.has(asset.id))
    .map((asset) => asset.id);
  const removedAssets = new Set(removedAssetIds);
  revokeAlbumAssets(removedAssetIds);
  return {
    album: {
      assets: current.assets.filter((asset) => retainedAssetIds.has(asset.id)),
      entries,
      tasks: current.tasks.filter((task) => !task.resultAssetId || !removedAssets.has(task.resultAssetId)),
      bindings: current.bindings.filter((binding) => !ids.has(binding.entryId)),
    },
    removedAssetIds,
    removedEntryIds,
    removedBindings,
  };
}

export type CommitGeneratedRuntimeInput = Readonly<{
  asset: 图片资源;
  entry: 相册条目;
  task?: 图片生成任务;
  displayDataUrl?: string;
}>;

export function commitGeneratedOnAlbum(
  album: 相册系统,
  input: CommitGeneratedRuntimeInput,
): SlotCommitResult {
  const current = 归一化相册系统(album);
  if (!isReadyAsset(input.asset)) throw new Error('Generated album asset is invalid');
  if (current.assets.some((asset) => asset.id === input.asset.id)) {
    throw new Error(`Album asset already exists: ${input.asset.id}`);
  }
  if (!isValidEntry(input.entry) || current.entries.some((entry) => entry.id === input.entry.id)) {
    throw new Error(`Album entry is invalid or already exists: ${input.entry.id}`);
  }
  if (input.entry.assetId !== input.asset.id) throw new Error('Album entry assetId does not match committed asset');
  if (input.task && !isSuccessfulTask(input.task, input.asset.id, current)) {
    throw new Error(`Album generation task is invalid: ${input.task.id}`);
  }

  if (input.displayDataUrl) rememberAlbumAssetFromDataUrl(input.asset.id, input.displayDataUrl);
  rememberInlineAsset(input.asset);
  const asset = sanitizeAsset(input.asset);
  const next: 相册系统 = {
    assets: [asset, ...current.assets],
    entries: [{ ...input.entry, tags: input.entry.tags.slice(), referenceTargets: input.entry.referenceTargets.slice() }, ...current.entries],
    tasks: input.task ? [{ ...input.task }, ...current.tasks] : current.tasks,
    bindings: current.bindings,
  };
  return { album: next, entryId: input.entry.id, assetId: input.asset.id };
}

function sameSlot(
  binding: Pick<图片槽位绑定, 'targetType' | 'targetId' | 'slot'>,
  target: Pick<图片槽位绑定, 'targetType' | 'targetId' | 'slot'>,
): boolean {
  return binding.targetType === target.targetType
    && binding.targetId === target.targetId
    && binding.slot === target.slot;
}

function isReadyAsset(asset: 图片资源): boolean {
  return Boolean(
    asset.id.trim()
    && asset.status === 'ready'
    && Number.isFinite(asset.createdAt)
    && (asset.source === 'generated' || asset.source === 'upload' || asset.source === 'remote'),
  );
}

function isValidEntry(entry: 相册条目): boolean {
  return Boolean(
    entry.id.trim()
    && entry.assetId.trim()
    && entry.title.trim()
    && Array.isArray(entry.tags)
    && Array.isArray(entry.referenceTargets)
    && Number.isFinite(entry.createdAt),
  );
}

function isSuccessfulTask(task: 图片生成任务, assetId: string, album: 相册系统): boolean {
  return Boolean(
    task.id.trim()
    && task.status === 'success'
    && task.resultAssetId === assetId
    && task.backend.trim()
    && Number.isFinite(task.createdAt)
    && !album.tasks.some((candidate) => candidate.id === task.id),
  );
}

function rememberInlineAsset(asset: 图片资源): void {
  for (const value of [asset.dataUrl, asset.originalUrl, asset.url]) {
    if (value?.startsWith('data:')) {
      rememberAlbumAssetFromDataUrl(asset.id, value);
      return;
    }
  }
}

function sanitizeAsset(asset: 图片资源): 图片资源 {
  return {
    ...asset,
    dataUrl: 创建相册资源引用(asset.id),
    url: asset.url?.startsWith('data:') ? undefined : asset.url,
    originalUrl: asset.originalUrl?.startsWith('data:') ? undefined : asset.originalUrl,
  };
}
