import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import type { API配置项 } from '@/models/settings';
import { 构建天气Prompt片段 } from '@/data/weatherRules';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { buildOpeningSystemPrompt, buildSystemPrompt } from '@/src/kernel/workflows/systemPromptBuilder';
import { buildTavernMessageChain } from '@/src/kernel/workflows/tavernMessageChainBuilder';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/src/kernel/workflows/storyWeaving';
import { getMainHistoryWindow } from '@/src/kernel/workflows/historyWindow';
import { compactForRerollInstruction } from './rerollPolicy';
import { createMacroContext, type MacroContext, type MacroGameState } from '@/utils/macroEngine';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { updateTriggerStatesAfterTurn } from '@/utils/worldbook';
import type { TurnExecutionState } from '../turnExecutionState';
import type { SendWorkflowDeps } from '../turnWorkflowTypes';
import type { PreparedTurnScope } from './prepareTurnScope';
import type { PreparedTurnContext } from './prepareTurnContext';
import { planRequestMessages, type RequestMessagePlan } from './planRequestMessages';
import { isPageHidden } from './turnRuntime';

type PresetV2 = ReturnType<typeof getCurrentSTPresetV2>;

export type TurnPromptPlan = Readonly<{
  systemPrompt: string;
  request: RequestMessagePlan;
  preset: PresetV2;
  tavernV2Enabled: boolean;
  storyGate: ReturnType<typeof evaluateStoryWeavingGate>;
  storyDiagnostics: ReturnType<typeof getStoryWeavingInjectionDiagnostics>;
}>;

export function buildTurnPromptPlan(input: Readonly<{
  state: TurnExecutionState;
  scope: PreparedTurnScope;
  context: PreparedTurnContext;
  config: API配置项;
  userInput: string;
  reroll?: SendWorkflowDeps['rerollContext'];
}>): TurnPromptPlan {
  const macro = buildMacroContext(input.state, input.context.history, input.config);
  const storyGate = evaluateStoryWeavingGate(input.state.剧情编织, input.context.worldbook);
  const storyDiagnostics = getStoryWeavingInjectionDiagnostics(input.state.剧情编织);
  const builtPrompt = buildPrompt(input, macro);
  let systemPrompt = builtPrompt.systemPrompt;
  input.state.worldbookTriggerStates = updateTriggerStatesAfterTurn(
    input.scope.worldbooks.slice(),
    input.context.worldbook,
  ) ?? {};
  systemPrompt += `\n\n${构建天气Prompt片段(input.scope.effectiveWorld.当前地点, input.scope.effectiveWorld.当前天气)}`;
  systemPrompt = appendRerollGuard(systemPrompt, input.reroll);
  const preset = getCurrentSTPresetV2(input.scope.gameSettings, getBuiltinPresetsV2());
  const recentHistory = getMainHistoryWindow(input.context.history, input.scope.gameSettings, input.state.记忆);
  const tavernMessages = preset ? buildTavernMessages(input, preset, recentHistory, macro) : null;
  const request = planRequestMessages({
    tavernMessages,
    recentHistory,
    moduleMessages: builtPrompt.chatModuleMessages,
    settings: input.scope.gameSettings,
    mainConfig: input.config,
    opening: input.scope.isOpeningSystemTrigger,
    openingInstruction: input.scope.openingInstruction,
    enteringAwakening: input.scope.isAwakeningEnterTrigger,
    awakeningInstruction: input.scope.awakeningInstruction,
    awakeningPhase: input.scope.awakeningPhase,
    reroll: input.reroll,
    pageHidden: isPageHidden(),
  });
  return { systemPrompt, request, preset, tavernV2Enabled: Boolean(preset), storyGate, storyDiagnostics };
}

function buildPrompt(input: Parameters<typeof buildTurnPromptPlan>[0], macro: MacroContext) {
  const { state, scope, context } = input;
  const trigger = input.reroll ? 'swipe' : scope.isOpeningSystemTrigger ? 'opening' : 'normal';
  if (scope.isOpeningSystemTrigger) {
    return buildOpeningSystemPrompt(
      state.旅人, scope.effectiveWorld, scope.gameSettings, state.turnCount,
      scope.worldbooks.slice(), context.worldbook, context.newsForPrompt, trigger, macro,
    );
  }
  const zhikuInjection = context.recall.zhikuRecallEnabled
    ? context.recall.zhikuPreview?.status === 'injection'
      ? context.recall.zhikuPreview.injection
      : context.recall.zhikuPreview?.status === 'no-match' ? '' : undefined
    : undefined;
  return buildSystemPrompt(
    state.旅人, scope.effectiveWorld, state.记忆, scope.gameSettings, state.turnCount,
    scope.worldbooks.slice(), context.worldbook, state.NPC, state.新闻, state.剧情,
    state.剧情编织, state.智库, state.忆庭, state.手机, scope.awakeningPhase,
    context.storyRecallInjection || (context.recall.yitingRecallEnabled ? '' : undefined),
    zhikuInjection, Boolean(context.recall.yitingPreview?.injection), context.npcLedgers, trigger, macro,
  );
}

function buildMacroContext(state: TurnExecutionState, history: 聊天消息[], config: API配置项): MacroContext {
  const last = history[history.length - 1];
  const lastUser = [...history].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant');
  const gameState: MacroGameState = {
    charName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
    userName: state.旅人.姓名 || '开拓者',
    lastMessage: last?.content ?? '',
    lastUserMessage: lastUser?.content ?? '',
    lastCharMessage: lastAssistant?.content ?? '',
    messageCount: history.length,
    turnCount: state.turnCount,
    modelName: config.model,
    maxContext: config.maxContext,
  };
  return createMacroContext(state.gameSettings.macroGlobalVars ?? {}, gameState);
}

function buildTavernMessages(
  input: Parameters<typeof buildTurnPromptPlan>[0],
  preset: NonNullable<PresetV2>,
  history: 聊天消息[],
  macro: MacroContext,
): 聊天消息[] {
  if (!preset.preset.prompts?.length) throw new Error('ST V2 preset has no prompts');
  if (!preset.preset.prompt_order?.length) throw new Error('ST V2 preset has no prompt order');
  const latestInput = input.scope.isOpeningSystemTrigger
    ? input.scope.openingInstruction
    : input.scope.isAwakeningEnterTrigger ? input.scope.awakeningInstruction : input.userInput;
  const messages = buildTavernMessageChain({
    preset: preset.preset,
    characterId: input.scope.gameSettings.currentStCharacterId ?? null,
    chatHistory: history,
    latestUserInput: latestInput,
    playerName: input.state.旅人.姓名 || input.state.旅人.别名 || '开拓者',
    playerRole: input.state.旅人,
    macroCtx: macro,
  }).map((message) => 创建聊天消息(message.role, message.content));
  if (!messages.length) throw new Error('ST V2 消息链为空');
  return messages;
}

function appendRerollGuard(systemPrompt: string, reroll?: SendWorkflowDeps['rerollContext']): string {
  if (!reroll) return systemPrompt;
  return [
    systemPrompt, '', '# 重roll生成约束',
    `本次请求是玩家对上一版回复的重roll。重roll nonce: ${reroll.nonce}`,
    '必须基于同一事实起点重新组织镜头、描写、对话和节奏；禁止复用上一版回复的具体段落、句式、变量草稿或行动选项。',
    '开场方式、对白切入、段落顺序和结尾钩子都要换；不要复用上一版前三句、连续短语或相同收束。',
    '可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。',
    reroll.previousResponse ? `上一版回复摘录（仅用于避重复，不是当前事实）：${compactForRerollInstruction(reroll.previousResponse)}` : '',
  ].filter(Boolean).join('\n');
}
