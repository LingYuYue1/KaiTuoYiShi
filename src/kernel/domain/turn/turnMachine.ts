import type { TurnStage } from '@/src/kernel/contract';

export type TurnMachine =
  | Readonly<{ phase: 'accepted' }>
  | Readonly<{ phase: 'prepared' }>
  | Readonly<{ phase: 'executing'; stage: Exclude<TurnStage, 'preparing-player-message' | 'committing'>; attempt: number }>
  | Readonly<{ phase: 'committing' }>
  | Readonly<{ phase: 'terminal' }>;

export type TurnMachineEvent =
  | Readonly<{ type: 'prepared' }>
  | Readonly<{ type: 'stage'; stage: TurnStage }>
  | Readonly<{ type: 'retry'; stage: 'generating'; attempt: number; limit: number }>
  | Readonly<{ type: 'terminal' }>;

const ORDER: Readonly<Record<Exclude<TurnStage, 'preparing-player-message' | 'committing'>, number>> = {
  'resolving-content': 0,
  'retrieving-context': 1,
  'planning-request': 2,
  generating: 3,
  parsing: 4,
  'assistant-ready': 5,
  reducing: 6,
};

export function reduceTurnMachine(state: TurnMachine, event: TurnMachineEvent): TurnMachine {
  if (state.phase === 'terminal') throw new Error(`Turn event ${event.type} arrived after terminal`);
  if (event.type === 'prepared') {
    if (state.phase !== 'accepted') throw invalid(state, 'prepared');
    return { phase: 'prepared' };
  }
  if (event.type === 'terminal') return { phase: 'terminal' };
  if (event.type === 'retry') {
    if (state.phase !== 'executing' || state.stage !== event.stage) throw invalid(state, `retry:${event.stage}`);
    if (event.attempt < 1 || event.attempt > event.limit || event.attempt <= state.attempt) {
      throw new Error(`Invalid retry attempt ${event.attempt}/${event.limit}`);
    }
    return { ...state, attempt: event.attempt };
  }
  if (event.stage === 'preparing-player-message') throw new Error('Prepared projection owns preparing-player-message');
  if (event.stage === 'committing') {
    if (state.phase !== 'executing' || state.stage !== 'reducing') throw invalid(state, 'committing');
    return { phase: 'committing' };
  }
  if (state.phase === 'prepared') {
    if (event.stage !== 'resolving-content') throw invalid(state, event.stage);
    return { phase: 'executing', stage: event.stage, attempt: 0 };
  }
  if (state.phase !== 'executing') throw invalid(state, event.stage);
  const currentOrder = ORDER[state.stage];
  const nextOrder = ORDER[event.stage];
  if (nextOrder !== currentOrder + 1) throw invalid(state, event.stage);
  return { phase: 'executing', stage: event.stage, attempt: 0 };
}

function invalid(state: TurnMachine, event: string): Error {
  return new Error(`Illegal turn transition ${state.phase} -> ${event}`);
}
