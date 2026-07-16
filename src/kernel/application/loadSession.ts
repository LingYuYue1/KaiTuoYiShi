/**
 * importSession — Kernel-owned formal session package import (Phase 4).
 *
 * Decode → migrate at ingress → seed repository → return SessionView projection.
 * Import revision policy: preserve package revision (roundtrip fidelity).
 */

import {
  asRevision,
  asSessionId,
  type SessionView,
} from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { cloneGameState } from '@/src/kernel/domain/session/types';
import { readSessionRecord } from '@/src/kernel/domain/session/schema';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { decodeSessionPackage } from './saveSession';

/**
 * Repository that can bootstrap/replace a session from a save package.
 * seed is host/bootstrap (not part of the CAS formal-write path).
 */
export type SeedableSessionRepository = SessionRepository & {
  seed(snapshot: SessionSnapshot): void | Promise<void>;
};

/**
 * Import a formal session package into the repository authority.
 * Returns the projected SessionView after seed.
 */
export async function importSession(
  bytes: Uint8Array,
  sessions: SeedableSessionRepository,
): Promise<SessionView> {
  const raw = decodeSessionPackage(bytes);
  const exact = readSessionRecord(raw);

  const snapshot: SessionSnapshot = {
    sessionId: asSessionId(exact.sessionId),
    revision: asRevision(exact.revision),
    state: cloneGameState(exact.state),
  };

  await sessions.seed(snapshot);
  return projectSession(snapshot);
}
