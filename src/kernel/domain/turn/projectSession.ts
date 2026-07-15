/**
 * Pure: project formal SessionSnapshot → UI SessionView.
 *
 * Projection is narrow (turns/messages/turnCount/revision) — not full GameState dump.
 */

import type { SessionView } from '@/src/kernel/contract';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';

export function projectSession(
  snapshot: SessionSnapshot,
): SessionView {
  return {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    turnCount: snapshot.state.turnCount,
    turns: snapshot.state.turns,
    messages: snapshot.state.messages,
  };
}
