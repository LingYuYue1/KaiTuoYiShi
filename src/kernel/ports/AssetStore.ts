/**
 * AssetStore port (Stage 5.4).
 *
 * Binary asset storage for images and other blobs.
 * Staging vs committed reference:
 * - put() stages bytes and returns a durable AssetRef id.
 * - Formal GameState only gains that ref after a later CAS (application layer).
 * - Domain pure functions only accept already-known AssetRef ids / asset metadata.
 *
 * Binary is Uint8Array only. Object URL / Blob / createObjectURL MUST NOT appear here.
 */

export type AssetRef = string & { readonly __brand: 'AssetRef' };

/** Brand a non-empty, non-whitespace asset id. Throws otherwise. */
export function asAssetRef(id: string): AssetRef {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('asAssetRef: id must be a non-empty string');
  }
  if (id !== id.trim()) {
    throw new Error('asAssetRef: id must not have leading/trailing whitespace');
  }
  return id as AssetRef;
}

export type AssetWrite = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  /** Optional content hash if already known */
  contentHash?: string;
}>;

export interface AssetStore {
  /** Stage bytes; returns durable AssetRef id. Does not mutate GameState. */
  put(asset: AssetWrite): Promise<AssetRef>;
  read(ref: AssetRef): Promise<Uint8Array>;
  remove(ref: AssetRef): Promise<void>;
  /** Optional: check existence for tests */
  has?(ref: AssetRef): Promise<boolean>;
}
