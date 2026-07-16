/**
 * Pure: build a fresh turn.advance envelope for re-execution from a turn base.
 *
 * Uses a new commandId (derived from the reroll envelope) so AdvanceTurn
 * idempotency does not collide with the original advance command.
 */

import {
  asCommandId,
  type AdvanceTurnEnvelope,
  type RerollTurnEnvelope,
} from '@/src/kernel/contract';
import type { TurnBaseSnapshot } from './findTurnBaseSnapshot';

/**
 * Create the AdvanceTurn that re-runs the player text from `base`.
 * expectedRevision stays the *current* formal revision (Option B CAS).
 */
export function createRerollAdvanceCommand(
  envelope: RerollTurnEnvelope,
  base: TurnBaseSnapshot,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(`${String(envelope.commandId)}:advance`),
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    command: {
      type: 'turn.advance',
      input: {
        text: base.originalPlayerText,
        createdAt: envelope.command.createdAt,
      },
    },
  };
}
