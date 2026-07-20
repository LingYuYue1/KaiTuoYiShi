import type { SaveCatalogPort } from '@/src/kernel/ports/SaveCatalog';
import { createDbServiceSaveCatalog } from '@/src/kernel/adapters/browser';

export type {
  SaveCatalogPort,
  SaveListItem,
  SavePayload,
} from '@/src/kernel/ports/SaveCatalog';

/**
 * Save catalog adaptation goes straight to the storage adapter. The kernel
 * no longer exposes a raw save port (Phase 2 exit gate); typed access is the
 * kernel.saves use cases — this raw catalog remains only for legacy
 * component call sites until their Phase 3 migration.
 */
let catalogPromise: Promise<SaveCatalogPort> | null = null;

export async function getSaveCatalog(): Promise<SaveCatalogPort> {
  if (!catalogPromise) catalogPromise = createDbServiceSaveCatalog();
  return catalogPromise;
}
