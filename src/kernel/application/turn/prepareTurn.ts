import type { CommandId } from '@/src/kernel/contract';
import type { StoryState } from '@/src/kernel/domain/session/storyState';

export function prepareTurnStory(input: Readonly<{
  story: StoryState;
  commandId: CommandId;
  text: string;
  createdAt: number;
}>): StoryState {
  return {
    ...input.story,
    conversation: {
      ...input.story.conversation,
      history: [
      ...input.story.conversation.history,
      {
        id: `command:${input.commandId}:player`,
        role: 'user',
        content: input.text,
        timestamp: input.createdAt,
        gameTime: `${input.story.conversation.turnCount}`,
      },
      ],
    },
  };
}
