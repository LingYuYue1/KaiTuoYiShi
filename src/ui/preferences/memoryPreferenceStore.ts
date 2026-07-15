/**
 * In-memory PreferenceStore for tests and non-durable hosts.
 */

import type { PreferenceStore } from './preferenceStore';

export class MemoryPreferenceStore implements PreferenceStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    if (!this.values.has(key)) return null;
    return this.values.get(key) as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}
