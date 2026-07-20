/**
 * Pure: project formal SessionSnapshot → UI SessionView.
 *
 * Projection is narrow — not a full GameState dump.
 * Stage 5.1 adds traveler variable slice for Variable Manager / display.
 * Stage 5.2 adds a narrow knowledge projection (counts + unlocked titles).
 * Stage 5.3 adds narrow phone / news projections.
 * Stage 5.4 adds narrow album projection (counts + titles + slot ids).
 */

import type { SessionView, TurnView } from '@/src/kernel/contract';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';

export function projectSession(
  snapshot: SessionSnapshot,
): SessionView {
  return {
    story: structuredClone(snapshot.state.story),
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    turns: projectTurns(snapshot),
  };
}

function projectTurns(snapshot: SessionSnapshot): TurnView[] {
  const history = snapshot.state.story.conversation.history;
  if (history.length % 2 !== 0) throw new Error('chatHistory requires complete user and assistant pairs');
  const turns: TurnView[] = [];
  for (let index = 0; index < history.length; index += 2) {
    const user = history[index]!;
    const assistant = history[index + 1]!;
    if (user.role !== 'user' || assistant.role !== 'assistant' || !assistant.parsedResponse) {
      throw new Error(`chatHistory pair ${index / 2} is invalid`);
    }
    turns.push({
      id: `turn_${assistant.id}`,
      createdAt: assistant.timestamp,
      playerText: user.content,
      narrativeText: assistant.parsedResponse.body,
    });
  }
  return turns;
}
