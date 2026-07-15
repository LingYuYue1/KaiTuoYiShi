/**
 * Kernel IndexedDB / durable session adapters (Phase 3).
 */

export {
  PersistentSessionRepository,
  createIndexedDbSessionRepository,
  createMemoryPersistentSessionRepository,
  createMemoryPersistentSessionRepositoryWithBackend,
} from './PersistentSessionRepository';
export {
  IndexedDbSessionBackend,
  KERNEL_SESSION_DB_NAME,
  KERNEL_SESSION_DB_VERSION,
  SESSIONS_STORE,
  COMMAND_COMMITS_STORE,
} from './indexedDbSessionBackend';
export { MemorySessionBackend } from './memorySessionBackend';
export type {
  SessionAtomicTx,
  SessionPersistenceBackend,
  StoredCommandRecord,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
export {
  commandRecordId,
  toStoredRecord,
} from './sessionPersistenceBackend';
