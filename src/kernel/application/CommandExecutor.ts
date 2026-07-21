import type {
  CommandEnvelope,
  CommandId,
  ExecutionFrame,
  KernelQuery,
  QueryResult,
  SessionExistenceView,
  SessionExistsQuery,
  SessionReadQuery,
  SessionView,
} from '@/src/kernel/contract';
import type { SessionCommand } from '@/src/kernel/contract/commands';
import type { StoryState } from '@/src/kernel/domain/session/storyState';

export type CommittedProjection = Readonly<{
  view: SessionView;
  cause: SessionCommand['type'] | 'session.create';
}>;

/** Internal command transport used only by the application facade. */
export interface CommandExecutor {
  execute(command: CommandEnvelope): AsyncIterable<ExecutionFrame>;
  subscribeCommitted(listener: (commit: CommittedProjection) => void): () => void;
  read(query: SessionExistsQuery): Promise<SessionExistenceView>;
  read(query: SessionReadQuery): Promise<SessionView>;
  read(query: KernelQuery): Promise<QueryResult>;
  readStory(sessionId: import('@/src/kernel/contract').SessionId): Promise<StoryState>;
  cancelAndWait(commandId: CommandId): Promise<void>;
}
