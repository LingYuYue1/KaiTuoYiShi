import type { StoryState, TurnJournalEntry, TurnSnapshot } from '@/src/kernel/domain/session/storyState';

export function captureTurnSnapshot(story: StoryState): TurnSnapshot {
  return structuredClone({
    旅人: story.traveler,
    世界: story.world,
    记忆: story.memory.system,
    忆庭: story.memory.yiting,
    智库: story.content.zhikuRuntime,
    手机: story.phone,
    NPC: story.characters.npcs,
    相册: story.album,
    新闻: story.news,
    剧情: story.plot.nodes,
    剧情编织: story.plot.weaving,
    variableBatches: story.systems.variableBatches,
    jobs: story.jobs.records, queueTasks: [],
    turnCount: story.conversation.turnCount,
    pendingOpeningTrigger: story.turn.pendingOpeningTrigger,
  });
}

export function appendTurnJournalEntry(
  story: StoryState,
  entry: TurnJournalEntry,
): StoryState {
  return {
    ...story,
    conversation: {
      ...story.conversation,
      turnJournal: [...story.conversation.turnJournal.filter((item) => item.turnIndex !== entry.turnIndex), entry]
        .sort((left, right) => left.turnIndex - right.turnIndex),
    },
  };
}

export function countAssistantTurns(story: StoryState): number {
  return story.conversation.history.reduce(
    (count, message) => count + (message.role === 'assistant' ? 1 : 0),
    0,
  );
}
