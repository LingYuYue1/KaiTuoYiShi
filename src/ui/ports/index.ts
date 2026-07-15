/**
 * UI-side ports for non-session host capabilities (Phase 3).
 */

export type {
  ReplaceAllSavesOptions,
  SaveCatalogPort,
  SaveListItem,
  SavePayload,
} from './SaveCatalogPort';
export {
  DbServiceSaveCatalog,
  createDbServiceSaveCatalog,
  createSaveCatalogFromStorage,
  type SaveCatalogStorage,
} from './dbServiceSaveCatalog';
export {
  getSaveCatalog,
  getSaveCatalogSync,
  setDefaultSaveCatalog,
} from './defaultSaveCatalog';
