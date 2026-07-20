import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { assertTurnSnapshot, type StoryState, type TurnSnapshot } from '@/src/kernel/domain/session/storyState';

export type TurnBaseSnapshot = Readonly<{
  story: StoryState;
  originalPlayerText: string;
  turnId: string;
  turnIndex: number;
  preTurnSnapshot: TurnSnapshot;
}>;

/** Reroll is deliberately last-turn only; the runtime stores one compact pre-turn snapshot. */
export function findTurnBaseSnapshot(
  snapshot: SessionSnapshot,
  turnId: string,
): TurnBaseSnapshot | null {
  const history = snapshot.state.story.conversation.history;
  const assistantIndex = findLastAssistantIndex(history);
  const assistant = history[assistantIndex]!;
  if (`turn_${assistant.id}` !== turnId) throw new Error('Only the latest turn can be rerolled');
  if (assistantIndex === 0 || history[assistantIndex - 1]?.role !== 'user') {
    throw new Error('Latest assistant message is not paired with a user message');
  }
  const originalPlayerText = history[assistantIndex - 1]!.content;
  const turnIndex = countAssistantMessages(history, assistantIndex);
  const journalEntry = snapshot.state.story.conversation.turnJournal.find((entry) => entry.turnIndex === turnIndex);
  if (!journalEntry) throw new Error('Latest assistant message has no turn journal entry');
  assertTurnSnapshot(journalEntry.preTurnSnapshot);
  const preTurn = journalEntry.preTurnSnapshot;
  const story: StoryState = structuredClone({
    ...snapshot.state.story,
    traveler: preTurn.旅人,
    world: preTurn.世界,
    conversation: {
      history: history.slice(0, assistantIndex - 1),
      turnJournal: snapshot.state.story.conversation.turnJournal.filter((entry) => entry.turnIndex < turnIndex),
      turnCount: preTurn.turnCount,
    },
    memory: { system: preTurn.记忆, yiting: preTurn.忆庭 },
    content: { ...snapshot.state.story.content, zhikuRuntime: preTurn.智库 },
    phone: preTurn.手机,
    characters: { npcs: preTurn.NPC }, album: preTurn.相册, news: preTurn.新闻,
    plot: { nodes: preTurn.剧情, weaving: preTurn.剧情编织 },
    systems: { variableBatches: preTurn.variableBatches },
    jobs: { records: preTurn.jobs },
    turn: { pendingOpeningTrigger: preTurn.pendingOpeningTrigger },
  });
  return { story, originalPlayerText, turnId, turnIndex, preTurnSnapshot: structuredClone(preTurn) };
}

function findLastAssistantIndex(history: StoryState['conversation']['history']): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') return index;
  }
  throw new Error('Latest turn has no assistant message');
}

function countAssistantMessages(
  history: StoryState['conversation']['history'],
  throughIndex: number,
): number {
  let count = 0;
  for (let index = 0; index <= throughIndex; index += 1) {
    if (history[index]?.role === 'assistant') count += 1;
  }
  return count;
}
