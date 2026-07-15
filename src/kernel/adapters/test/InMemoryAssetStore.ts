/**
 * In-memory AssetStore for tests (Stage 5.4).
 *
 * Map-backed put/read/remove. Generates ids `asset_<n>`.
 * Clones bytes on put and read so callers cannot mutate stored data.
 */

import {
  asAssetRef,
  type AssetRef,
  type AssetStore,
  type AssetWrite,
} from '@/src/kernel/ports/AssetStore';

export class InMemoryAssetStore implements AssetStore {
  private readonly store = new Map<AssetRef, Uint8Array>();
  private seq = 0;

  async put(asset: AssetWrite): Promise<AssetRef> {
    if (!asset || typeof asset !== 'object') {
      throw new Error('InMemoryAssetStore.put: asset must be an object');
    }
    if (!(asset.bytes instanceof Uint8Array)) {
      throw new Error('InMemoryAssetStore.put: bytes must be Uint8Array');
    }
    if (typeof asset.mimeType !== 'string' || asset.mimeType.trim().length === 0) {
      throw new Error('InMemoryAssetStore.put: mimeType must be a non-empty string');
    }
    if (asset.contentHash !== undefined) {
      if (
        typeof asset.contentHash !== 'string'
        || asset.contentHash.trim().length === 0
      ) {
        throw new Error(
          'InMemoryAssetStore.put: contentHash must be a non-empty string when provided',
        );
      }
    }

    this.seq += 1;
    const ref = asAssetRef(`asset_${this.seq}`);
    this.store.set(ref, new Uint8Array(asset.bytes));
    return ref;
  }

  async read(ref: AssetRef): Promise<Uint8Array> {
    const bytes = this.store.get(ref);
    if (!bytes) {
      throw new Error(`InMemoryAssetStore.read: asset not found: ${String(ref)}`);
    }
    return new Uint8Array(bytes);
  }

  async remove(ref: AssetRef): Promise<void> {
    if (!this.store.has(ref)) {
      throw new Error(`InMemoryAssetStore.remove: asset not found: ${String(ref)}`);
    }
    this.store.delete(ref);
  }

  async has(ref: AssetRef): Promise<boolean> {
    return this.store.has(ref);
  }

  /** Test helper: count staged assets. */
  size(): number {
    return this.store.size;
  }
}
