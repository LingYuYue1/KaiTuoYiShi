import type {
  CommandId,
  ExecutionFrame,
  MessageProjection,
  SessionView,
  TurnStage,
} from '@/src/kernel/contract';
import type { GameEvent } from '@/src/kernel/contract/session';

type ActiveProjection = Readonly<{
  session: SessionView;
  commandId: CommandId;
  draft: SessionView;
  stage: TurnStage;
  retry: Readonly<{ attempt: number; limit: number }> | null;
}>;

export type ProjectionState =
  | Readonly<{ phase: 'stable'; session: SessionView }>
  | Readonly<{ phase: 'command-running'; session: SessionView; commandId: CommandId }>
  | (ActiveProjection & Readonly<{ phase: 'prepared' }>)
  | (ActiveProjection & Readonly<{ phase: 'streaming'; text: string }>)
  | (ActiveProjection & Readonly<{ phase: 'assistant-ready'; message: MessageProjection }>)
  | Readonly<{ phase: 'resyncing'; session: SessionView; lastRevision: SessionView['revision'] }>;

export class SessionProjectionStore {
  private value: ProjectionState | null = null;
  private readonly listeners = new Set<() => void>();
  private activeSequence: Readonly<{ commandId: CommandId; sequence: number }> | null = null;
  private readonly supersededCommands = new Set<CommandId>();

  current(): ProjectionState | null { return this.value; }

  initialize(session: SessionView): ProjectionState {
    this.value = createProjectionState(session);
    this.activeSequence = null;
    this.supersededCommands.clear();
    this.emit();
    return this.value;
  }

  apply(frame: ExecutionFrame): ProjectionState {
    if (!this.value) throw new Error('Kernel projection is not initialized');
    this.value = applyExecutionFrame(this.value, frame);
    this.emit();
    return this.value;
  }

  applyEvent(event: GameEvent): ProjectionState {
    if (!this.value) throw new Error('Kernel projection is not initialized');
    if (event.type === 'command.submitted') {
      if (event.sequence !== 0) return this.enterResync();
      if (this.activeSequence) this.supersededCommands.add(this.activeSequence.commandId);
      this.activeSequence = { commandId: event.commandId, sequence: 0 };
      this.value = { phase: 'command-running', session: this.value.session, commandId: event.commandId };
      this.emit();
      return this.value;
    }
    if (this.supersededCommands.has(event.commandId)) {
      if (event.type === 'command.committed' || event.type === 'command.rejected') {
        this.supersededCommands.delete(event.commandId);
      }
      return this.value;
    }
    const active = this.activeSequence;
    if (!active || active.commandId !== event.commandId) return this.enterResync();
    if (event.sequence <= active.sequence) return this.value;
    if (event.sequence !== active.sequence + 1) return this.enterResync();
    this.activeSequence = { commandId: active.commandId, sequence: event.sequence };
    if (event.type !== 'command.accepted') {
      this.value = applyExecutionFrame(this.value, eventToFrame(event));
    }
    if (event.type === 'command.committed' || event.type === 'command.rejected') this.activeSequence = null;
    this.emit();
    return this.value;
  }

  /** Follow commits that do not have a presentation CommandHandle (durable jobs). */
  followCommitted(session: SessionView): ProjectionState {
    if (!this.value) return this.initialize(session);
    if (this.activeSequence || this.value.phase !== 'stable') return this.value;
    if (Number(session.revision) <= Number(this.value.session.revision)) return this.value;
    this.value = { phase: 'stable', session };
    this.emit();
    return this.value;
  }

  clearEphemerals(): ProjectionState | null {
    if (!this.value) return null;
    this.value = { phase: 'stable', session: this.value.session };
    this.emit();
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private enterResync(): ProjectionState {
    if (!this.value) throw new Error('Kernel projection is not initialized');
    this.activeSequence = null;
    this.value = {
      phase: 'resyncing',
      session: this.value.session,
      lastRevision: this.value.session.revision,
    };
    this.emit();
    return this.value;
  }
}

export function createProjectionState(session: SessionView): ProjectionState {
  return { phase: 'stable', session };
}

export function clearProjectionEphemerals(state: ProjectionState): ProjectionState {
  return { phase: 'stable', session: state.session };
}

export function displaySessionView(state: ProjectionState): SessionView {
  return state.phase === 'stable' || state.phase === 'resyncing' || state.phase === 'command-running'
    ? state.session
    : state.draft;
}

export function projectionNarrativeText(state: ProjectionState): string {
  return state.phase === 'streaming' ? state.text : '';
}

export function projectionHasDraft(state: ProjectionState): boolean {
  return state.phase !== 'stable' && state.phase !== 'resyncing' && state.phase !== 'command-running';
}

export function applyExecutionFrame(state: ProjectionState, frame: ExecutionFrame): ProjectionState {
  switch (frame.type) {
    case 'accepted':
      return { phase: 'command-running', session: state.session, commandId: frame.commandId };
    case 'prepared':
      return {
        phase: 'prepared',
        session: state.session,
        commandId: frame.commandId,
        draft: frame.view,
        stage: 'preparing-player-message',
        retry: null,
      };
    case 'stage.changed':
      return mapActive(state, frame.commandId, (active) => ({ ...active, stage: frame.stage, retry: null }));
    case 'stage.retrying':
      return mapActive(state, frame.commandId, (active) => ({
        ...active,
        phase: 'prepared',
        stage: frame.stage,
        retry: { attempt: frame.attempt, limit: frame.limit },
      }));
    case 'progress':
      return mapActive(state, frame.commandId, (active) => ({
        ...active,
        phase: 'streaming',
        stage: 'generating',
        text: frame.delta.text,
      }));
    case 'assistant.ready':
      return mapActive(state, frame.commandId, (active) => ({
        ...active,
        phase: 'assistant-ready',
        stage: 'assistant-ready',
        message: frame.message,
        draft: {
          ...active.draft,
          story: {
            ...active.draft.story,
            conversation: {
              ...active.draft.story.conversation,
              history: [...active.draft.story.conversation.history, frame.message],
            },
          },
        },
      }));
    case 'committed':
      return { phase: 'stable', session: frame.view };
    case 'rejected':
      return { phase: 'stable', session: state.session };
    default: {
      const exhaustive: never = frame;
      throw new Error(`Unknown execution frame: ${String(exhaustive)}`);
    }
  }
}

export function reduceExecutionFrames(state: ProjectionState, frames: readonly ExecutionFrame[]): ProjectionState {
  return frames.reduce(applyExecutionFrame, state);
}

function mapActive(
  state: ProjectionState,
  commandId: CommandId,
  update: (active: Exclude<ProjectionState, { phase: 'stable' | 'resyncing' | 'command-running' }>) => ProjectionState,
): ProjectionState {
  if (state.phase === 'stable' || state.phase === 'resyncing' || state.phase === 'command-running') {
    throw new Error('Process event arrived before turn.prepared');
  }
  if (state.commandId !== commandId) throw new Error(`Projection command mismatch: ${commandId}`);
  return update(state);
}

function eventToFrame(event: Exclude<GameEvent, { type: 'command.submitted' | 'command.accepted' }>): ExecutionFrame {
  switch (event.type) {
    case 'turn.prepared': return { type: 'prepared', commandId: event.commandId, view: event.view };
    case 'stage.changed': return { type: 'stage.changed', commandId: event.commandId, stage: event.stage };
    case 'stage.retrying': return { type: 'stage.retrying', commandId: event.commandId, stage: event.stage, attempt: event.attempt, limit: event.limit };
    case 'narrative.delta': return { type: 'progress', commandId: event.commandId, delta: { kind: 'narrative', text: event.text } };
    case 'assistant.ready': return { type: 'assistant.ready', commandId: event.commandId, message: event.message };
    case 'command.committed': return { type: 'committed', commandId: event.commandId, revision: event.revision, view: event.view };
    case 'command.rejected': return { type: 'rejected', commandId: event.commandId, error: event.error };
  }
}
