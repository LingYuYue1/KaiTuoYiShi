/**
 * Composition-root singleton for SaveCatalogPort.
 *
 * Presentation code (components / App / UI-facing hooks) imports this module
 * instead of `@/services/dbService`. The dbService adapter is constructed once
 * and only lives inside src/ui/ports/.
 */

import { createDbServiceSaveCatalog } from './dbServiceSaveCatalog';
import type { SaveCatalogPort } from './SaveCatalogPort';

let catalogPromise: Promise<SaveCatalogPort> | null = null;
let catalogOverride: SaveCatalogPort | null = null;

/**
 * Production accessor. Lazily constructs the IndexedDB-backed catalog.
 * Tests may inject via `setDefaultSaveCatalog`.
 */
export function getSaveCatalog(): Promise<SaveCatalogPort> {
  if (catalogOverride) return Promise.resolve(catalogOverride);
  if (!catalogPromise) {
    catalogPromise = createDbServiceSaveCatalog();
  }
  return catalogPromise;
}

/** Sync helper when a catalog instance was already resolved / injected. */
export function getSaveCatalogSync(): SaveCatalogPort | null {
  return catalogOverride;
}

/**
 * Test / host injection. Pass null to clear override and re-lazy-init.
 */
export function setDefaultSaveCatalog(catalog: SaveCatalogPort | null): void {
  catalogOverride = catalog;
  if (catalog === null) {
    catalogPromise = null;
  }
}
