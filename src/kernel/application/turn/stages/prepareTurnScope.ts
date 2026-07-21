import type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
import { 踏入命途狭间 } from '@/src/kernel/domain/path/pathOperations';

/** Full turn execution state — authoritative for all command-scope reads. */
export type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';

export type PreparedTurnScope = Readonly<{
  effectiveWorld: TurnExecutionState['世界'];
  isOpeningSystemTrigger: boolean;
  isAwakeningEnterTrigger: boolean;
  awakeningPathId?: string;
  currentScope: 'opening' | 'main' | 'pathAwakening';
  awakeningPhase?: 'question' | 'judgement';
  openingInstruction: string;
  awakeningInstruction: string;
  gameSettings: TurnExecutionState['gameSettings'];
  worldbooks: TurnExecutionState['worldbooks'];
  activeModelConfig: TurnExecutionState['activeModelConfig'];
  worldbookTriggerStates: Record<string, number>;
}>;

export function prepareTurnScope(state: TurnExecutionState, userInput: string): PreparedTurnScope {
  const isOpeningSystemTrigger = state.turnCount === 1 && userInput.startsWith('[系统]');
  const isAwakeningEnterTrigger = userInput === '[系统] 踏入命途狭间';
  const effectiveWorld = isAwakeningEnterTrigger && state.世界.待触发狭间
    ? 踏入命途狭间(state.世界)
    : state.世界;
  const awakeningPathId = isAwakeningEnterTrigger ? effectiveWorld.进行中狭间 ?? undefined : undefined;
  const currentScope = effectiveWorld.进行中狭间
    ? 'pathAwakening'
    : state.turnCount === 1 ? 'opening' : 'main';
  const awakeningPhase = effectiveWorld.进行中狭间
    ? (isAwakeningEnterTrigger ? 'question' : 'judgement')
    : undefined;
  return {
    effectiveWorld,
    isOpeningSystemTrigger,
    isAwakeningEnterTrigger,
    awakeningPathId,
    currentScope,
    awakeningPhase,
    openingInstruction: '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。',
    awakeningInstruction: awakeningPathId
      ? `玩家选择踏入「命途狭间」(命途 ID: ${awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`
      : '',
    gameSettings: state.gameSettings,
    worldbooks: state.worldbooks,
    activeModelConfig: state.activeModelConfig,
    worldbookTriggerStates: state.worldbookTriggerStates,
  };
}
