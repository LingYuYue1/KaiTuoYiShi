import type { 回合快照 } from '@/models/chat';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { cloneRuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';

export type TurnBaseSnapshot = Readonly<{
  runtime: RuntimeGameState;
  originalPlayerText: string;
  turnId: string;
}>;

/** Reroll is deliberately last-turn only; the runtime stores one compact pre-turn snapshot. */
export function findTurnBaseSnapshot(
  snapshot: SessionSnapshot,
  turnId: string,
): TurnBaseSnapshot | null {
  const assistantIndex = findLastAssistantIndex(snapshot.state.runtime.chatHistory);
  const assistant = snapshot.state.runtime.chatHistory[assistantIndex]!;
  if (`turn_${assistant.id}` !== turnId) throw new Error('Only the latest turn can be rerolled');
  if (assistantIndex === 0 || snapshot.state.runtime.chatHistory[assistantIndex - 1]?.role !== 'user') {
    throw new Error('Latest assistant message is not paired with a user message');
  }
  const originalPlayerText = snapshot.state.runtime.chatHistory[assistantIndex - 1]!.content;
  const preTurn = requireCompletePreTurnSnapshot(assistant.preTurnSnapshot);
  const chatHistory = snapshot.state.runtime.chatHistory.slice(0, assistantIndex - 1);
  const runtime = cloneRuntimeGameState({
    ...snapshot.state.runtime,
    旅人: preTurn.旅人 as typeof snapshot.state.runtime.旅人,
    世界: preTurn.世界 as typeof snapshot.state.runtime.世界,
    chatHistory,
    记忆: preTurn.记忆 as typeof snapshot.state.runtime.记忆,
    忆庭: preTurn.忆庭 as typeof snapshot.state.runtime.忆庭,
    智库: preTurn.智库 as typeof snapshot.state.runtime.智库,
    手机: preTurn.手机 as typeof snapshot.state.runtime.手机,
    NPC: preTurn.NPC as typeof snapshot.state.runtime.NPC,
    相册: preTurn.相册 as typeof snapshot.state.runtime.相册,
    新闻: preTurn.新闻 as typeof snapshot.state.runtime.新闻,
    剧情: preTurn.剧情 as typeof snapshot.state.runtime.剧情,
    剧情编织: preTurn.剧情编织 as typeof snapshot.state.runtime.剧情编织,
    variableBatches: preTurn.variableBatches as typeof snapshot.state.runtime.variableBatches,
    queueTasks: preTurn.queueTasks as typeof snapshot.state.runtime.queueTasks,
    turnCount: preTurn.turnCount,
  });
  return { runtime, originalPlayerText, turnId };
}

function findLastAssistantIndex(history: SessionSnapshot['state']['runtime']['chatHistory']): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') return index;
  }
  throw new Error('Latest turn has no assistant message');
}

function requireCompletePreTurnSnapshot(value: 回合快照 | undefined): Required<回合快照> {
  if (!value) throw new Error('Latest assistant message has no pre-turn snapshot');
  const required = ['忆庭', '智库', '手机', '相册', '剧情编织', 'queueTasks'] as const;
  for (const field of required) {
    if (value[field] === undefined) throw new Error(`Pre-turn snapshot requires ${field}`);
  }
  return value as Required<回合快照>;
}
