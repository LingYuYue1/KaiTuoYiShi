import type { 存档数据 } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建相册资源引用 } from '@/utils/albumActions';

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;

function isDataImage(value: unknown): value is string {
  return typeof value === 'string' && DATA_IMAGE_RE.test(value.trimStart());
}

function collectAlbumDataUrls(album?: 相册系统): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of album?.assets ?? []) {
    if (asset.id && isDataImage(asset.dataUrl)) {
      map.set(asset.dataUrl, 创建相册资源引用(asset.id));
    }
  }
  return map;
}

function compactValue(value: unknown, refs: Map<string, string>, seen: WeakSet<object>): unknown {
  if (isDataImage(value)) return refs.get(value) ?? value;
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => compactValue(item, refs, seen));
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    next[key] = compactValue(child, refs, seen);
  }
  return next;
}

export function compactDuplicatedSaveImages<T extends 存档数据>(save: T): T {
  const refs = collectAlbumDataUrls(save.相册);
  if (!refs.size) return save;
  const cloned = JSON.parse(JSON.stringify(save)) as T;
  const seen = new WeakSet<object>();

  // 相册 assets 是原始图片仓库，不能替换，否则引用无法还原。
  const album = cloned.相册;
  delete (cloned as Partial<存档数据>).相册;
  const compacted = compactValue(cloned, refs, seen) as T;
  compacted.相册 = album;
  return compacted;
}
