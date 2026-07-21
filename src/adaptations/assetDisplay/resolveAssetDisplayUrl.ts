/**
 * Frontend-only AssetRef → display URL resolution.
 *
 * Formal album / GameState store AssetRef ids (`asset:<id>` or bare asset id)
 * and remote URLs only — never blob: object URLs or long-lived base64 data URLs.
 *
 * Object URLs live exclusively in `utils/albumObjectUrl.ts` runtime cache and
 * are created lazily at render time.
 */

import type { 相册系统 } from '@/models/imageGeneration';
import {
  创建相册资源引用,
  解析相册资源引用,
  解析相册资源地址,
} from '@/utils/albumActions';
import {
  pickAssetDisplayUrl,
  resolveAlbumAssetDisplayUrl,
} from '@/utils/albumObjectUrl';

/** Build a formal AssetRef string for character / phone avatar fields. */
export function toAssetRef(assetId: string): string {
  return 创建相册资源引用(assetId);
}

/**
 * Resolve a formal field value (AssetRef / remote / legacy) to a display URL.
 * Prefer this at render boundaries; do not write the result back into formal state.
 */
export function resolveAssetDisplayUrl(
  album: 相册系统 | undefined,
  value: string | undefined,
): string | undefined {
  return 解析相册资源引用(album, value);
}

/** Resolve a concrete album asset record to a display URL (render-time only). */
export function resolveAlbumAssetUrl(asset: {
  id?: string;
  dataUrl?: string;
  url?: string;
  localRef?: string;
  originalUrl?: string;
} | undefined): string | undefined {
  return 解析相册资源地址(asset);
}

export {
  pickAssetDisplayUrl,
  resolveAlbumAssetDisplayUrl,
};
