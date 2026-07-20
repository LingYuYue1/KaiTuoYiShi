import type { EditMessageBodyEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* editSessionMessageBody(
  envelope: EditMessageBodyEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const story = base.state.story;
    const history = story.conversation.history;
    const index = history.findIndex((message) => message.id === envelope.command.messageId);
    const message = history[index];
    if (!message?.parsedResponse) {
      return { type: 'rejected', error: { code: 'no_changes', message: 'Editable assistant message not found' } };
    }
    const nextHistory = history.slice();
    nextHistory[index] = {
      ...message,
      content: envelope.command.body,
      parsedResponse: { ...message.parsedResponse, body: envelope.command.body },
    };
    return {
      type: 'next',
      state: { story: { ...story, conversation: { ...story.conversation, history: nextHistory } } },
    };
  });
}
