/**
 * Pure: project formal SessionSnapshot → UI SessionView.
 *
 * Projection is narrow — not a full GameState dump.
 * The projection exposes narrow feature DTOs rather than the durable story graph.
 */

import type { SessionView, TurnView } from '@/src/kernel/contract';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';

export function projectSession(
  snapshot: SessionSnapshot,
): SessionView {
  const story = snapshot.state.story;
  return {
    story: structuredClone({
      traveler: story.traveler,
      world: story.world,
      conversation: { history: story.conversation.history, turnCount: story.conversation.turnCount },
      memory: story.memory,
      characters: story.characters,
      phone: story.phone,
      album: story.album,
      news: story.news,
      plot: story.plot,
      systems: story.systems,
      policy: story.policy,
      content: { zhikuRuntime: story.content.zhikuRuntime },
      turn: story.turn,
    }),
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    turns: projectTurns(snapshot),
    jobs: snapshot.state.story.jobs.records.map((job) => ({
      id: job.id,
      kind: job.payload.kind,
      state: job.state,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt,
      ...('error' in job ? { error: job.error } : {}),
    })),
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
