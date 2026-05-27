import type { 存档数据, 存档类型 } from '@/models/settings';

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = 1;
const SAVES_STORE = 'saves';
const SETTINGS_STORE = 'settings';
const MAX_AUTO_SAVES = 10;
const MAX_BACKUP_SAVES = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// ── Save operations ──

export async function saveGame(data: 存档数据): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    // 让 autoIncrement 生效：调用方传的 id=0 视为「未指定」，删掉这个字段
    // 否则 IDB 会拿 0 当显式主键，第二次 add 必然撞 "Key already exists"
    const { id: _ignoredId, ...rest } = data;
    void _ignoredId;
    const request = store.add(rest as 存档数据);
    request.onsuccess = () => {
      rotateManagedSaves(db).catch(() => {});
      resolve(request.result as number);
    };
    request.onerror = () => reject(request.error);
  });
}

export interface SaveListItemSummary {
  id: number;
  type: 存档类型;
  timestamp: number;
  travelerName: string;
  turnCount: number;       // 已进行的回合数（= chatHistory.length + 1，与 applySaveToState 对齐）
  worldPeriodName: string; // 当前世界期名，空字符串表示未设置
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}

export async function getSaveList(): Promise<SaveListItemSummary[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const list = (request.result as 存档数据[])
        .map((s) => ({
          id: s.id,
          type: normalizeSaveType(s.type),
          timestamp: s.timestamp,
          travelerName: s.旅人?.姓名 ?? '',
          turnCount: (s.chatHistory?.length ?? 0) + 1,
          worldPeriodName: s.世界?.当前时段?.名称 ?? '',
          currentDate: s.世界?.当前日期 ?? '',
          currentTime: s.世界?.当前时间 ?? '',
          currentLocation: s.世界?.当前地点 ?? '',
          lastSummary: summarizeSave(s),
          sizeBytes: estimateSaveSize(s),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadSave(id: number): Promise<存档数据 | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as 存档数据) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLatestSave(): Promise<存档数据 | null> {
  const list = await getSaveList();
  if (list.length === 0) return null;
  const latestPlayable = list.find((item) => item.type !== 'backup') ?? list[0];
  return loadSave(latestPlayable.id);
}

export async function deleteSave(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function hasAnySave(): Promise<boolean> {
  const list = await getSaveList();
  return list.length > 0;
}

// ── Settings operations ──

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? (result.value as T) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Auto-save rotation ──

async function rotateManagedSaves(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(SAVES_STORE, 'readonly');
  const store = tx.objectStore(SAVES_STORE);
  const all: 存档数据[] = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as 存档数据[]);
    req.onerror = () => reject(req.error);
  });
  const autoSaves = all
    .filter((s) => s.type === 'auto')
    .sort((a, b) => b.timestamp - a.timestamp);
  const backupSaves = all
    .filter((s) => s.type === 'backup')
    .sort((a, b) => b.timestamp - a.timestamp);
  const toDelete = [
    ...autoSaves.slice(MAX_AUTO_SAVES),
    ...backupSaves.slice(MAX_BACKUP_SAVES),
  ];
  if (!toDelete.length) return;
  const delTx = db.transaction(SAVES_STORE, 'readwrite');
  const delStore = delTx.objectStore(SAVES_STORE);
  for (const s of toDelete) delStore.delete(s.id);
}

// ── Export / Import ──

export function exportSaveJson(save: 存档数据): void {
  const json = JSON.stringify(save, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const travelerName = sanitizeFilename(save.旅人?.姓名 || 'traveler');
  const turnCount = (save.chatHistory?.length ?? 0) + 1;
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSaveJson(json: string): 存档数据 {
  const data = JSON.parse(json) as 存档数据;
  if (!data || typeof data !== 'object' || !data.旅人 || !data.世界 || !Array.isArray(data.chatHistory)) {
    throw new Error('无效的存档文件');
  }
  if (!data.gameSettings || !data.apiSettings || !data.theme) {
    throw new Error('无效的存档文件');
  }
  return data;
}

function normalizeSaveType(type: unknown): 存档类型 {
  return type === 'auto' || type === 'backup' || type === 'imported' ? type : 'manual';
}

function summarizeSave(save: 存档数据): string {
  const latestAssistant = [...(save.chatHistory ?? [])]
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
  try {
    return new Blob([JSON.stringify(save)]).size;
  } catch {
    return JSON.stringify(save).length;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'traveler';
}
