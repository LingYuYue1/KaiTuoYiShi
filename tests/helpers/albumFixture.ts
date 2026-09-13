import { afterEach } from 'vitest';
import type { 图片资源, 相册条目, 图片生成任务 } from '@/models/imageGeneration';
import { clearAlbumAssetObjectUrlCache } from '@/utils/albumObjectUrl';

export type AlbumAssetSource = Pick<图片资源, 'dataUrl' | 'url' | 'localRef'>;

/** 相册用 asset 构造器：默认 upload/ready，与 gallery/reference/archive 三文件原默认值一致。 */
export function makeAlbumAsset(overrides: Partial<图片资源> & { id: string }): 图片资源 {
  return {
    source: 'upload',
    nsfw: false,
    createdAt: 1,
    status: 'ready',
    ...overrides,
  };
}

/** 相册用 entry 构造器：默认 npc/avatar_profile，与 gallery/reference/archive 三文件原默认值一致。 */
export function makeAlbumEntry(overrides: Partial<相册条目> & { id: string; assetId: string }): 相册条目 {
  return {
    title: overrides.id,
    targetType: 'npc',
    slot: 'avatar_profile',
    tags: [],
    nsfw: false,
    createdAt: 1,
    referenceTargets: [],
    ...overrides,
  };
}

export function makeAlbumTask(overrides: Partial<图片生成任务> & { id: string }): 图片生成任务 {
  return {
    targetType: 'npc',
    targetId: 'npc-1',
    slot: 'avatar_profile',
    source: 'manual',
    status: 'success',
    backend: 'sd_webui',
    nsfw: false,
    prompt: '测试提示词',
    retryCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

/** 兼容两种历史签名：图片资源数组，或 {id,url,dataUrl,localRef} 元组数组。 */
export function albumAssetMapOf(
  assets: 图片资源[] | Array<{ id: string; url?: string; dataUrl?: string; localRef?: string }>,
): Map<string, AlbumAssetSource> {
  const map = new Map<string, AlbumAssetSource>();
  for (const asset of assets) {
    map.set(asset.id, { url: asset.url, dataUrl: asset.dataUrl, localRef: asset.localRef });
  }
  return map;
}

/** 注册全局的 album object-url 缓存清理，避免用例间泄漏。调用一次即可。 */
export function registerAlbumCacheTeardown(): void {
  afterEach(() => {
    clearAlbumAssetObjectUrlCache();
  });
}
