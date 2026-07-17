import type { 相册系统 } from '@/models/imageGeneration';
import { 创建相册资源引用, 解析相册资源地址, 解析相册资源引用 } from '@/utils/albumActions';

export type 手机壁纸候选 = Readonly<{
  entryId: string;
  assetId: string;
  title: string;
  slot: 'phone_wallpaper' | 'phone_chat_background';
  src: string;
  assetRef: string;
}>;

/** Select ready album assets that can be assigned to either phone wallpaper slot. */
export function 列出手机相册壁纸(album?: 相册系统): 手机壁纸候选[] {
  if (!album) return [];
  const assetsById = new Map(album.assets.map((asset) => [asset.id, asset]));
  const wallpapers: 手机壁纸候选[] = [];

  for (const entry of album.entries) {
    if (entry.slot !== 'phone_wallpaper' && entry.slot !== 'phone_chat_background') continue;
    const asset = assetsById.get(entry.assetId);
    if (!asset || (asset.status && asset.status !== 'ready')) continue;
    const assetRef = 创建相册资源引用(asset.id);
    const src = 解析相册资源引用(album, assetRef) || 解析相册资源地址(asset);
    if (!src) continue;
    wallpapers.push({
      entryId: entry.id,
      assetId: asset.id,
      title: entry.title || (entry.slot === 'phone_chat_background' ? '聊天背景' : '手机壁纸'),
      slot: entry.slot,
      src,
      assetRef,
    });
  }

  return wallpapers;
}

/** Accept legacy raw URLs at this boundary while all new selections persist an asset reference. */
export function 是当前手机壁纸(storedRef: string | undefined, resolvedSrc: string, wallpaper: 手机壁纸候选): boolean {
  return storedRef?.trim() === wallpaper.assetRef || storedRef?.trim() === wallpaper.src || resolvedSrc === wallpaper.src;
}
