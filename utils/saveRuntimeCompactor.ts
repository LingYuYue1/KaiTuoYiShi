import type { 回合快照 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 手机系统 } from '@/models/phone';
import type { 队列任务记录 } from '@/models/queueTask';
import { 创建相册资源引用 } from '@/utils/albumActions';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const LARGE_TEXT_LIMIT = 8000;
const MAX_SNAPSHOT_QUEUE_TASKS = 12;

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

function stripAlbumAssetPayload(album?: 相册系统): 相册系统 | undefined {
  if (!album) return album;
  return {
    ...album,
    assets: (album.assets ?? []).map((asset) => ({
      ...asset,
      dataUrl: asset.dataUrl ? 创建相册资源引用(asset.id) : asset.dataUrl,
      originalUrl: isDataImage(asset.originalUrl) ? undefined : asset.originalUrl,
    })),
  };
}

function compactPhoneImages(phone?: 手机系统, refs = new Map<string, string>()): 手机系统 | undefined {
  if (!phone) return phone;
  return compactDataImages(phone, refs) as 手机系统;
}

function compactDataImages(value: unknown, refs: Map<string, string>, seen = new WeakSet<object>()): unknown {
  if (isDataImage(value)) return refs.get(value) ?? '[图片数据已从运行快照省略]';
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => compactDataImages(item, refs, seen));
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === 'string' && child.length > LARGE_TEXT_LIMIT && /raw|prompt|debug|system/i.test(key)) {
      next[key] = `${child.slice(0, LARGE_TEXT_LIMIT)}\n...[运行快照已截断 ${child.length - LARGE_TEXT_LIMIT} 字符]`;
      continue;
    }
    next[key] = compactDataImages(child, refs, seen);
  }
  return next;
}

function compactQueueTasks(tasks?: unknown[]): 队列任务记录[] | undefined {
  if (!Array.isArray(tasks)) return tasks as 队列任务记录[] | undefined;
  return tasks.slice(-MAX_SNAPSHOT_QUEUE_TASKS).map((task) => {
    const item = task as 队列任务记录;
    return {
      ...item,
      rawText: item.rawText && item.rawText.length > LARGE_TEXT_LIMIT
        ? `${item.rawText.slice(0, LARGE_TEXT_LIMIT)}\n...[运行快照已截断]`
        : item.rawText,
    };
  });
}

export function compactPreTurnSnapshot(snapshot: 回合快照): 回合快照 {
  const album = stripAlbumAssetPayload(snapshot.相册 as 相册系统 | undefined);
  const refs = collectAlbumDataUrls(snapshot.相册 as 相册系统 | undefined);
  return {
    ...snapshot,
    相册: album,
    手机: compactPhoneImages(snapshot.手机 as 手机系统 | undefined, refs),
    剧情编织: snapshot.剧情编织
      ? buildPersistedStoryWeavingSystem(归一化剧情编织系统(snapshot.剧情编织))
      : snapshot.剧情编织,
    queueTasks: compactQueueTasks(snapshot.queueTasks),
  };
}
