import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';

interface DesktopSettingsMirror {
  version: 1;
  updatedAt: number;
  settings: Record<string, unknown>;
}

interface DesktopSpecialSettingMirror {
  kind: 'kaituoyishi-desktop-setting';
  version: 1;
  key: string;
  updatedAt: number;
  value: unknown;
}

export interface DesktopSpecialSettingMirrorStatus {
  key: string;
  path: string;
  present: boolean;
  valid: boolean;
  updatedAt?: number;
  error?: string;
}

const SETTINGS_PATH = 'config/settings.json';
const SPECIAL_SETTING_PATHS: Record<string, string> = {
  zhikuSystem: 'zhiku/system.json',
  worldbooks: 'worldbooks/worldbooks.json',
};

export async function mirrorSettingToDesktop(key: string, value: unknown): Promise<void> {
  if (!isDesktopRuntime()) return;
  const mirror = await readSettingsMirror();
  if (isSpecialSettingKey(key)) {
    const next = { ...mirror.settings };
    delete next[key];
    await writeSettingsMirror(next);
    await writeSpecialSettingMirror(key, value);
    return;
  }
  await writeSettingsMirror({
    ...mirror.settings,
    [key]: value,
  });
}

export async function loadSettingFromDesktopMirror<T>(key: string): Promise<T | null> {
  if (!isDesktopRuntime()) return null;
  const specialValue = await readSpecialSettingMirror<T>(key);
  if (specialValue !== null) return specialValue;
  const mirror = await readSettingsMirror();
  return Object.prototype.hasOwnProperty.call(mirror.settings, key)
    ? (mirror.settings[key] as T)
    : null;
}

export async function removeSettingFromDesktopMirror(key: string): Promise<void> {
  if (!isDesktopRuntime()) return;
  const mirror = await readSettingsMirror();
  if (Object.prototype.hasOwnProperty.call(mirror.settings, key)) {
    const next = { ...mirror.settings };
    delete next[key];
    await writeSettingsMirror(next);
  }
  await removeSpecialSettingMirror(key);
}

export async function listDesktopSettingsMirrorKeys(): Promise<string[]> {
  if (!isDesktopRuntime()) return [];
  const mirror = await readSettingsMirror();
  const keys = new Set(Object.keys(mirror.settings));
  const adapter = createAppStorageAdapter();
  for (const [key, settingPath] of Object.entries(SPECIAL_SETTING_PATHS)) {
    const record = await adapter.readJson<DesktopSpecialSettingMirror>(settingPath);
    if (record?.kind === 'kaituoyishi-desktop-setting' && record.key === key) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}

export async function listDesktopSpecialSettingMirrors(): Promise<DesktopSpecialSettingMirrorStatus[]> {
  if (!isDesktopRuntime()) return [];
  const adapter = createAppStorageAdapter();
  const statuses: DesktopSpecialSettingMirrorStatus[] = [];
  for (const [key, settingPath] of Object.entries(SPECIAL_SETTING_PATHS)) {
    try {
      const raw = await adapter.readText(settingPath);
      if (!raw) {
        statuses.push({ key, path: settingPath, present: false, valid: false });
        continue;
      }
      const record = JSON.parse(raw) as Partial<DesktopSpecialSettingMirror>;
      const valid = record.kind === 'kaituoyishi-desktop-setting'
        && record.version === 1
        && record.key === key
        && typeof record.updatedAt === 'number';
      statuses.push({
        key,
        path: settingPath,
        present: true,
        valid,
        updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : undefined,
        error: valid ? undefined : 'invalid desktop special setting mirror',
      });
    } catch (err) {
      statuses.push({
        key,
        path: settingPath,
        present: true,
        valid: false,
        error: err instanceof Error ? err.message : 'failed to read desktop special setting mirror',
      });
    }
  }
  return statuses;
}

async function readSettingsMirror(): Promise<DesktopSettingsMirror> {
  const adapter = createAppStorageAdapter();
  const mirror = await adapter.readJson<DesktopSettingsMirror>(SETTINGS_PATH);
  if (!mirror || mirror.version !== 1 || !mirror.settings || typeof mirror.settings !== 'object') {
    return { version: 1, updatedAt: Date.now(), settings: {} };
  }
  return mirror;
}

async function writeSettingsMirror(settings: Record<string, unknown>): Promise<void> {
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopSettingsMirror>(SETTINGS_PATH, {
    version: 1,
    updatedAt: Date.now(),
    settings: omitSpecialSettingKeys(settings),
  });
}

async function writeSpecialSettingMirror(key: string, value: unknown): Promise<void> {
  const settingPath = SPECIAL_SETTING_PATHS[key];
  if (!settingPath) return;
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopSpecialSettingMirror>(settingPath, {
    kind: 'kaituoyishi-desktop-setting',
    version: 1,
    key,
    updatedAt: Date.now(),
    value,
  });
}

async function readSpecialSettingMirror<T>(key: string): Promise<T | null> {
  const settingPath = SPECIAL_SETTING_PATHS[key];
  if (!settingPath) return null;
  const adapter = createAppStorageAdapter();
  const record = await adapter.readJson<DesktopSpecialSettingMirror>(settingPath);
  if (record?.kind !== 'kaituoyishi-desktop-setting' || record.key !== key) return null;
  return record.value as T;
}

async function removeSpecialSettingMirror(key: string): Promise<void> {
  const settingPath = SPECIAL_SETTING_PATHS[key];
  if (!settingPath) return;
  const adapter = createAppStorageAdapter();
  await adapter.remove(settingPath);
}

function isSpecialSettingKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPECIAL_SETTING_PATHS, key);
}

function omitSpecialSettingKeys(settings: Record<string, unknown>): Record<string, unknown> {
  const next = { ...settings };
  for (const key of Object.keys(SPECIAL_SETTING_PATHS)) {
    delete next[key];
  }
  return next;
}
