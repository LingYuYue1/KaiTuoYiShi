import type { 回合快照 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 队列任务记录 } from '@/models/queueTask';
import { 创建相册资源引用 } from '@/utils/albumActions';
import { isDataImageUrl, rememberAlbumAssetFromDataUrl } from '@/utils/albumObjectUrl';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { 归一化智库系统 } from '@/models/zhiku';

const LARGE_TEXT_LIMIT = 8000;
const MAX_SNAPSHOT_QUEUE_TASKS = 12;

function isDataImage(value: unknown): value is string {
  return isDataImageUrl(value);
}

function collectAlbumDataUrls(album?: 相册系统): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of album?.assets ?? []) {
    if (asset.id && isDataImage(asset.dataUrl)) {
      // Ensure binary is cached before stripping from snapshot state.
      rememberAlbumAssetFromDataUrl(asset.id, asset.dataUrl);
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
      dataUrl: asset.id ? 创建相册资源引用(asset.id) : asset.dataUrl,
      originalUrl: isDataImage(asset.originalUrl) ? undefined : asset.originalUrl,
    })),
  };
}

function compactDataImages(value: unknown, refs: Map<string, string>, seen = new WeakMap<object, unknown>()): unknown {
  if (isDataImage(value)) return refs.get(value) ?? '[图片数据已从运行快照省略]';
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    seen.set(value, next);
    for (const item of value) next.push(compactDataImages(item, refs, seen));
    return next;
  }
  const next: Record<string, unknown> = {};
  seen.set(value, next);
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
  const refs = collectAlbumDataUrls(snapshot.相册 as 相册系统 | undefined);
  const compacted = compactDataImages({
    ...snapshot,
    相册: stripAlbumAssetPayload(snapshot.相册 as 相册系统 | undefined),
    剧情编织: snapshot.剧情编织
      ? buildPersistedStoryWeavingSystem(归一化剧情编织系统(snapshot.剧情编织))
      : snapshot.剧情编织,
    智库: snapshot.智库
      ? buildPersistedZhikuSystem(归一化智库系统(snapshot.智库 as import('@/models/zhiku').智库系统))
      : snapshot.智库,
    variableBatches: compactVariableBatchHistory(snapshot.variableBatches as import('@/models/variableCommand').变量命令批次[]),
    queueTasks: compactQueueTasks(snapshot.queueTasks),
  }, refs) as 回合快照;
  return compacted;
}
