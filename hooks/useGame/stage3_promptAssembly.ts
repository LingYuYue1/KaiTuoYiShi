import type { TurnContext, TurnDeltas } from './turnTypes';
import type { 聊天消息 } from '@/models/chat';
import { 创建聊天消息 } from '@/models/chat';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import {
  getMainHistoryWindow,
  getPathAwakeningHistoryWindow,
  toPromptHistory,
} from './historyWindow';
import { isDeepSeekMainConfig } from './mainResponseProtocol';
import { isPageHidden } from './workflowTaskRuntime';
import {
  compilePrompt,
  insertDepthIntoHistory,
} from './mainRequestFinalizer';
/** stage3 产出：apiMessages 是下游（S4/S5）的必填输入，因此比 Partial<TurnDeltas> 更严格。 */
export interface Stage3Output extends Partial<TurnDeltas> {
  apiMessages: 聊天消息[];
}

export function stage3_promptAssembly(
  ctx: TurnContext,
  d: TurnDeltas,
): Stage3Output {
  const { state, userInput, deps, mainStoryConfig, isOpeningSystemTrigger,
    isAwakeningEnterTrigger, awakeningInstruction, openingInstruction } = ctx;
  if (!d.currentTriggerType || !d.macroCtx || !d.updatedHistory || !d.userMsg || !d.systemPrompt) {
    throw new Error('stage3_promptAssembly: 前置阶段必须写入 currentTriggerType/macroCtx/updatedHistory/userMsg/systemPrompt');
  }
  const awakeningPhase = d.awakeningPhase;
  const macroCtx = d.macroCtx;
  const updatedHistory = d.updatedHistory;
  const userMsg = d.userMsg;
  const isPathAwakeningTurn = d.isPathAwakeningTurn === true;
  const scope = isOpeningSystemTrigger ? 'opening' : isPathAwakeningTurn ? 'pathAwakening' : 'main';
  const latestUserInput = isOpeningSystemTrigger
    ? openingInstruction
    : isAwakeningEnterTrigger
      ? awakeningInstruction
      : userInput;

  const moduleChatMessages = d.chatModuleMessages ?? [];
  const currentPresetV2 = getCurrentSTPresetV2(state.deviceSettings.gameSettings, getBuiltinPresetsV2());
  const shouldTryTavernV2 =
    state.deviceSettings.gameSettings.enableStPreset !== false &&
    Boolean(currentPresetV2?.preset.prompts.length) &&
    Boolean(currentPresetV2?.preset.prompt_order.length);
  let tavernV2Messages: 聊天消息[] | null = null;
  let tavernV2Error: Error | null = null;

  const rawWindow = isPathAwakeningTurn && awakeningPhase
    ? getPathAwakeningHistoryWindow(updatedHistory, awakeningPhase)
    : getMainHistoryWindow(updatedHistory, state.deviceSettings.gameSettings, state.记忆);
  const preTurnHistory = toPromptHistory(
    isPathAwakeningTurn ? rawWindow : rawWindow.filter((msg) => msg.id !== userMsg.id),
  );

  if (shouldTryTavernV2 && currentPresetV2) {
    try {
      const depthMessages = moduleChatMessages.filter((item) => item._injectionPosition === 1);
      tavernV2Messages = buildTavernMessageChain({
        settings: state.deviceSettings.gameSettings,
        preset: currentPresetV2.preset,
        characterId: state.deviceSettings.gameSettings.currentStCharacterId ?? currentPresetV2.characterId ?? null,
        chatHistory: insertDepthIntoHistory(preTurnHistory, depthMessages),
        latestUserInput,
        scope,
        playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
        playerRole: state.旅人,
        includeNativeContextInWorldbook: false,
        triggerType: d.currentTriggerType,
        macroCtx,
      }).map((msg) => 创建聊天消息(msg.role, msg.content));
      if (tavernV2Messages.length === 0) {
        tavernV2Messages = null;
        tavernV2Error = new Error('ST V2 消息链为空，已回退 legacy 主剧情路径');
        console.warn('[ST V2] 消息链为空，已回退 legacy 主剧情路径');
      }
    } catch (error) {
      tavernV2Messages = null;
      tavernV2Error = error instanceof Error ? error : new Error(String(error));
      console.warn('[ST V2] 消息链构建失败，已回退 legacy 主剧情路径', error);
    }
  }

  const deepSeekMainMode = state.deviceSettings.gameSettings.deepSeekMainMode;
  const deepSeekMainActive = isDeepSeekMainConfig(mainStoryConfig) && deepSeekMainMode !== 'off';
  const deepSeekLockFormat = deepSeekMainActive && deepSeekMainMode === 'lock_format';
  const finalized = compilePrompt({
    scope,
    awakeningPhase,
    prompt: { systemPrompt: d.systemPrompt, chatModuleMessages: moduleChatMessages },
    preTurnHistory,
    latestUserInput,
    tavernMessages: tavernV2Messages,
    deepSeekMainActive,
    deepSeekLockFormat,
    enableCotFakeHistory: state.deviceSettings.gameSettings.enableCotFakeHistory,
    reroll: !isOpeningSystemTrigger && deps.rerollContext ? deps.rerollContext : null,
    prefixMode: deepSeekLockFormat,
    prefixContent: deepSeekLockFormat ? '<thinking>\n' : undefined,
    provider: mainStoryConfig.provider,
  });

  return {
    systemPrompt: finalized.systemPrompt,
    apiMessages: finalized.messages,
    deepSeekMainActive,
    deepSeekLockFormat,
    deepSeekMainMode,
    shouldTryTavernV2,
    tavernV2Error,
    effectivePrefixMode: finalized.prefixMode,
    effectivePrefixContent: finalized.prefixContent,
    mainRequestMode: state.deviceSettings.gameSettings.enableStreaming && !isPageHidden() ? 'stream' : 'non-stream',
    tavernV2Messages,
    currentPresetV2ForStage: currentPresetV2,
  };
}
