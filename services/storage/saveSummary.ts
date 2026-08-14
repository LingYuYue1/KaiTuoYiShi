import type { 存档数据, 存档类型 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';
import type { SaveListItemSummary } from '@/contracts/storage';

export type StoredSaveMeta = 存档数据 & {
  saveRuntime?: {
    hiddenDeltaBase?: boolean;
    unsealedHead?: boolean;
    cloudBackupOriginFingerprint?: string;
    [key: string]: unknown;
  };
};

export type SaveWithTree = 存档数据 & {
  saveTree?: 存档树元信息;
};

export function isUnsealedHeadSave(save: 存档数据): boolean {
  return (save as StoredSaveMeta).saveRuntime?.unsealedHead === true;
}

/**
 * 剥离检查点队列任务：queueTasks 属主是可写叶子（工作区），检查点/导入恢复点不得携带。
 */
export function 剥离检查点队列任务(save: 存档数据): 存档数据 {
  if (isUnsealedHeadSave(save)) return save;
  const { queueTasks: _queueTasks, ...sealed } = save;
  void _queueTasks;
  return sealed;
}

export function isHiddenDeltaBaseSave(save: 存档数据): boolean {
  return Boolean((save as StoredSaveMeta).saveRuntime?.hiddenDeltaBase);
}

export function normalizeSaveType(type: unknown): 存档类型 {
  return type === 'auto' || type === 'backup' || type === 'imported' ? type : 'manual';
}

export function stripCloudBackupRestoreRuntime<T extends 存档数据>(save: T): T {
  const source = save as T & { saveRuntime?: Record<string, unknown> };
  if (!source.saveRuntime || !('cloudBackupOriginFingerprint' in source.saveRuntime)) return save;
  const { cloudBackupOriginFingerprint: _origin, ...remainingRuntime } = source.saveRuntime;
  void _origin;
  return {
    ...save,
    ...(Object.keys(remainingRuntime).length ? { saveRuntime: remainingRuntime } : { saveRuntime: undefined }),
  };
}

export function buildSaveSummary(save: 存档数据): SaveListItemSummary {
  return {
    id: save.id,
    type: normalizeSaveType(save.type),
    timestamp: save.timestamp,
    saveTree: (save as SaveWithTree).saveTree,
    ...(isUnsealedHeadSave(save) ? { unsealedHead: true } : {}),
    travelerName: save.旅人.姓名,
    turnCount: save.turnCount ?? (save.chatHistory.length + 1),
    worldPeriodName: save.世界.当前时段.名称,
    currentDate: save.世界.当前日期,
    currentTime: save.世界.当前时间,
    currentLocation: save.世界.当前地点,
    lastSummary: summarizeSave(save),
    sizeBytes: estimateSaveSize(save),
  };
}

function summarizeSave(save: 存档数据): string {
  const latestAssistant = [...save.chatHistory]
    .reverse()
    .find((msg) => msg.role === 'assistant');
  const text = latestAssistant?.parsedResponse?.body || latestAssistant?.content || '';
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? Array.from(cleaned).slice(0, 120).join('') : '';
}

function estimateSaveSize(save: 存档数据): number {
  const chatBytes = save.chatHistory.reduce((sum, message) => {
    return sum + message.content.length + (message.parsedResponse?.body.length ?? 0);
  }, 0);
  const albumAssets = save.相册?.assets ?? [];
  const albumBytes = albumAssets.reduce((sum, asset) => {
    const declaredSize = asset.size || 0;
    if (declaredSize > 0) return sum + declaredSize;
    return sum + (asset.dataUrl?.length ?? 0) + (asset.originalUrl?.length ?? 0);
  }, 0);
  const queueBytes = (save.queueTasks ?? []).reduce((sum, task) => {
    return sum +
      task.title.length +
      (task.subtitle?.length ?? 0) +
      (task.detail?.length ?? 0) +
      (task.retryHint?.length ?? 0);
  }, 0);
  return Math.max(1024, chatBytes * 2 + albumBytes + queueBytes * 2 + 48_000);
}
