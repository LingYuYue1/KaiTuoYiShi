import type { API设置, 游戏设置, API配置项 } from '@/models/settings';
import type { 队列任务记录 } from '@/models/queueTask';
import type { 世界书 } from '@/models/worldbook';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { DeviceExecutionOverlay } from '@/src/kernel/ports/ExecutionContextProvider';
import { composeSettings } from '@/models/settingsPlanes';

export type TurnExecutionState = {
  旅人: StoryState['traveler'];
  世界: StoryState['world'];
  chatHistory: StoryState['conversation']['history'] extends readonly (infer Item)[] ? Item[] : never;
  记忆: StoryState['memory']['system'];
  忆庭: StoryState['memory']['yiting'];
  智库: StoryState['content']['zhikuRuntime'];
  手机: StoryState['phone'];
  NPC: StoryState['characters']['npcs'] extends readonly (infer Item)[] ? Item[] : never;
  相册: StoryState['album'];
  新闻: StoryState['news'] extends readonly (infer Item)[] ? Item[] : never;
  剧情: StoryState['plot']['nodes'] extends readonly (infer Item)[] ? Item[] : never;
  剧情编织: StoryState['plot']['weaving'];
  variableBatches: StoryState['systems']['variableBatches'] extends readonly (infer Item)[] ? Item[] : never;
  /** Ephemeral workflow telemetry. Never persisted or projected as story state. */
  queueTasks: 队列任务记录[];
  durableJobs: StoryState['jobs']['records'] extends readonly (infer Item)[] ? Item[] : never;
  turnJournal: StoryState['conversation']['turnJournal'] extends readonly (infer Item)[] ? Item[] : never;
  worldbookTriggerStates: Record<string, number>;
  pendingOpeningTrigger: string | null;
  turnCount: number;
  /** Immutable execution configuration captured when the command starts. */
  gameSettings: 游戏设置;
  /** Active route resolved once from the captured execution context. */
  activeModelConfig: API配置项;
  /** Content snapshot captured for this command. */
  worldbooks: readonly 世界书[];
};

export function createTurnExecutionState(
  story: StoryState,
  context: DeviceExecutionOverlay,
): TurnExecutionState {
  const gameSettings = resolveCommandSettings(story, context);
  const activeModelConfig = resolveActiveModelConfigFromContext(context.apiSettings, gameSettings.enableClaudeMode);
  return structuredClone({
    旅人: story.traveler, 世界: story.world, chatHistory: story.conversation.history.slice(),
    记忆: story.memory.system, 忆庭: story.memory.yiting, 智库: story.content.zhikuRuntime,
    手机: story.phone, NPC: story.characters.npcs.slice(), 相册: story.album, 新闻: story.news.slice(),
    剧情: story.plot.nodes.slice(), 剧情编织: story.plot.weaving,
    variableBatches: story.systems.variableBatches.slice(), queueTasks: [], durableJobs: story.jobs.records.slice(),
    turnJournal: story.conversation.turnJournal.slice(),
    worldbookTriggerStates: story.content.worldbookTriggerStates,
    pendingOpeningTrigger: story.turn.pendingOpeningTrigger,
    turnCount: story.conversation.turnCount,
    gameSettings,
    activeModelConfig,
    worldbooks: context.worldbooks.slice(),
  });
}

export function resolveCommandSettings(story: StoryState, context: DeviceExecutionOverlay): 游戏设置 {
  return composeSettings({
    apiProfiles: context.apiSettings,
    execution: context.executionPolicy,
    appearance: context.appearance,
    content: context.content,
    save: context.savePolicy,
    story: story.policy,
  });
}

export function resolveActiveModelConfig(state: TurnExecutionState): API配置项 {
  return state.activeModelConfig;
}

function resolveActiveModelConfigFromContext(apiSettings: API设置, enableClaudeMode: boolean): API配置项 {
  const activeId = apiSettings.activeConfigId;
  if (!activeId) throw new Error('Active API configuration is required');
  const config = apiSettings.configs.find((candidate) => candidate.id === activeId);
  if (!config) throw new Error(`Active API configuration not found: ${activeId}`);
  return { ...config, enableClaudeMode };
}

export function storyFromTurnExecutionState(state: TurnExecutionState, base: StoryState): StoryState {
  return structuredClone({
    traveler: state.旅人,
    world: state.世界,
    conversation: { history: state.chatHistory, turnJournal: state.turnJournal, turnCount: state.turnCount },
    memory: { system: state.记忆, yiting: state.忆庭 },
    characters: { npcs: state.NPC },
    phone: state.手机,
    album: state.相册,
    news: state.新闻,
    plot: { nodes: state.剧情, weaving: state.剧情编织 },
    systems: { variableBatches: state.variableBatches },
    turn: { pendingOpeningTrigger: state.pendingOpeningTrigger },
    policy: base.policy,
    content: { zhikuRuntime: state.智库, worldbookTriggerStates: state.worldbookTriggerStates },
    jobs: { records: state.durableJobs },
  });
}
