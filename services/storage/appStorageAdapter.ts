import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';

export interface AppStorageAdapter {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  readBase64File?(path: string): Promise<string | null>;
  writeBase64File?(path: string, base64Content: string): Promise<void>;
  readJson<T>(path: string): Promise<T | null>;
  writeJson<T>(path: string, value: T): Promise<void>;
  list(path: string): Promise<string[]>;
  remove(path: string): Promise<void>;
}

export class DesktopAppStorageAdapter implements AppStorageAdapter {
  async readText(path: string): Promise<string | null> {
    return invoke<string | null>('desktop_read_text', { relativePath: normalizeStoragePath(path) });
  }

  async writeText(path: string, content: string): Promise<void> {
    await invoke('desktop_write_text_atomic', { relativePath: normalizeStoragePath(path), content });
  }

  async writeBase64File(path: string, base64Content: string): Promise<void> {
    await invoke('desktop_write_base64_file', {
      relativePath: normalizeStoragePath(path),
      base64Content,
    });
  }

  async readBase64File(path: string): Promise<string | null> {
    return invoke<string | null>('desktop_read_base64_file', { relativePath: normalizeStoragePath(path) });
  }

  async readJson<T>(path: string): Promise<T | null> {
    const raw = await this.readText(path);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async writeJson<T>(path: string, value: T): Promise<void> {
    await this.writeText(path, JSON.stringify(value));
  }

  async list(path: string): Promise<string[]> {
    return invoke<string[]>('desktop_list', { relativePath: normalizeStoragePath(path) });
  }

  async remove(path: string): Promise<void> {
    await invoke('desktop_remove', { relativePath: normalizeStoragePath(path) });
  }
}

export class WebAppStorageAdapter implements AppStorageAdapter {
  async readText(path: string): Promise<string | null> {
    return localStorage.getItem(storageKey(path));
  }

  async writeText(path: string, content: string): Promise<void> {
    localStorage.setItem(storageKey(path), content);
  }

  async readJson<T>(path: string): Promise<T | null> {
    const raw = await this.readText(path);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async writeJson<T>(path: string, value: T): Promise<void> {
    await this.writeText(path, JSON.stringify(value));
  }

  async list(path: string): Promise<string[]> {
    const prefix = storageKey(path.endsWith('/') ? path : `${path}/`);
    const items: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) items.push(key.slice(prefix.length));
    }
    return items;
  }

  async remove(path: string): Promise<void> {
    localStorage.removeItem(storageKey(path));
  }
}

function storageKey(path: string): string {
  return `kaituoyishi:storage:${normalizeStoragePath(path)}`;
}

export function createAppStorageAdapter(): AppStorageAdapter {
  return isDesktopRuntime() ? new DesktopAppStorageAdapter() : new WebAppStorageAdapter();
}

function normalizeStoragePath(path: string): string {
  const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleanPath || cleanPath.split('/').some((part) => part === '..')) {
    throw new Error(`存储路径不合法: ${path}`);
  }
  return cleanPath;
}
