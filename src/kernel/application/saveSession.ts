/**
 * exportSession — Kernel-owned formal session package export (Phase 4).
 *
 * Not a UI→db call. Reads the SessionRepository authority and encodes a
 * versioned package. Full 存档 catalog remains SaveCatalogPort (Phase 3 facade).
 */

import type { SessionId } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { GameState } from '@/src/kernel/domain/session/types';
import { cloneGameState } from '@/src/kernel/domain/session/types';
import { SESSION_SCHEMA_VERSION } from '@/src/kernel/domain/session/schema';

/**
 * Minimal formal-slice save package.
 * schemaVersion is always written as the current constant (single schema write).
 */
export type SessionSavePackage = Readonly<{
  schemaVersion: number;
  sessionId: string;
  revision: number;
  state: GameState;
}>;

/**
 * Export formal session bytes (UTF-8 JSON).
 */
export async function exportSession(
  sessionId: SessionId,
  sessions: SessionRepository,
): Promise<Uint8Array> {
  const snapshot = await sessions.read(sessionId);
  const packageBody: SessionSavePackage = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: String(snapshot.sessionId),
    revision: Number(snapshot.revision),
    state: cloneGameState(snapshot.state),
  };
  const json = JSON.stringify(packageBody);
  return new TextEncoder().encode(json);
}

/**
 * Decode bytes to a raw package object (no migration). Prefer importSession.
 */
export function decodeSessionPackage(bytes: Uint8Array): unknown {
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `exportSession package is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
