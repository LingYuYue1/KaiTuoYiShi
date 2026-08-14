import { openDB, SETTINGS_STORE } from './dbConnection';
import { toError } from '@/utils/storageUtils';

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await writeIndexedSetting(key, value);
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result as { value?: T } | undefined;
      resolve(result?.value ?? null);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await deleteIndexedSetting(key);
}

async function writeIndexedSetting(key: string, value: unknown): Promise<void> {
  const storedValue = 剥离游戏设置运行态键(key, value);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value: storedValue });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

/** 单点剥离（片 5a-2 D3）：gameSettings 落盘时剔除两运行态键，内存 state.gameSettings 不动。 */
function 剥离游戏设置运行态键(key: string, value: unknown): unknown {
  if (key !== 'gameSettings') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (!('macroGlobalVars' in source) && !('worldbookTriggerStates' in source)) return value;
  const { macroGlobalVars: _macro, worldbookTriggerStates: _trigger, ...rest } = source;
  void _macro;
  void _trigger;
  return rest;
}

async function deleteIndexedSetting(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}
