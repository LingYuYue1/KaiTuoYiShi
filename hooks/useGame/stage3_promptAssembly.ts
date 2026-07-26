/**
 * 阶段 3：Prompt 组装 —— ST V2 Tavern 链、Depth 注入、DeepSeek 守卫、
 *   CoT 伪装历史、Claude 方案 D、reroll 守卫、apiMessages 最终拼接。
 * 同步函数，无网络调用。
 *
 * 读 d 字段:
 *   - systemPrompt (S2, stage2_preModel)
 *   - chatModuleMessages (S2)
 *   - awakeningPhase (S2)
 *   - currentTriggerType (S2)
 *   - macroCtx (S2)
 *   - updatedHistory (S1)
 *   - userMsg (S1)
 * 写 d 字段: systemPrompt (updated), apiMessages, tavernV2Messages,
 *   tavernV2Error, shouldTryTavernV2, deepSeekMainActive, deepSeekLockFormat,
 *   deepSeekMainMode, effectivePrefixMode, effectivePrefixContent,
 *   mainRequestMode, currentPresetV2ForStage
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import type { 聊天消息 } from '@/models/chat';
import { 创建聊天消息 } from '@/models/chat';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { getBuiltinPresets } from '@/data/builtinPresets';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import { compactForRerollInstruction } from './workflowRetry';
import { buildRerollGenerationGuard } from './workflowRetry';
import { buildLeanAssistantHistoryContent, getMainHistoryWindow } from './historyWindow';
import {
  COT_FAKE_HISTORY_ASSISTANT,
  COT_FAKE_HISTORY_USER,
  DEEPSEEK_MAIN_FORMAT_GUARD,
  isDeepSeekMainConfig,
} from './mainResponseProtocol';
import { isPageHidden } from './workflowTaskRuntime';

export function stage3_promptAssembly(
  ctx: TurnContext,
  d: TurnDeltas,
): Partial<TurnDeltas> {
  const { state, userInput, deps, mainStoryConfig, isOpeningSystemTrigger,
    isAwakeningEnterTrigger, awakeningInstruction, openingInstruction } = ctx;
  const currentTriggerType = d.currentTriggerType!;
  const awakeningPhase = d.awakeningPhase!;
  const macroCtx = d.macroCtx!;
  const updatedHistory = d.updatedHistory!;
  const userMsg = d.userMsg!;
  let systemPrompt = d.systemPrompt!;

  // Phase 4: In-Chat depth 注入（moduleChatMessages 来自 stage2）
  const moduleChatMessages = (d.chatModuleMessages as Array<{ role: string; content: string; _injectionPosition?: number; _injectionDepth?: number; _injectionOrder?: number }>) ?? [];
  const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());
  const shouldTryTavernV2 =
    state.gameSettings.enableStPreset !== false &&
    Boolean(currentPresetV2?.preset?.prompts?.length) &&
    Boolean(currentPresetV2?.preset?.prompt_order?.length);
  let tavernV2Messages: 聊天消息[] | null = null;
  let tavernV2Error: unknown = null;
  const recentHistory = getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);
  const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id);
  if (deps.rerollContext && !isOpeningSystemTrigger) {
    systemPrompt = [
      systemPrompt,
      '',
      '# 重roll生成约束',
      `本次请求是玩家对上一版回复的重roll。重roll nonce: ${deps.rerollContext.nonce}`,
      '必须基于同一事实起点重新组织镜头、描写、对话和节奏；禁止复用上一版回复的具体段落、句式、变量草稿或行动选项。',
      '开场方式、对白切入、段落顺序和结尾钩子都要换；不要复用上一版前三句、连续短语或相同收束。',
      '可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。',
      deps.rerollContext.previousResponse
        ? `上一版回复摘录（仅用于避重复，不是当前事实）：${compactForRerollInstruction(deps.rerollContext.previousResponse)}`
        : '',
    ].filter(Boolean).join('\n');
  }

  if (shouldTryTavernV2 && currentPresetV2) {
    try {
      const latestTavernInput = isOpeningSystemTrigger
        ? openingInstruction
        : isAwakeningEnterTrigger
          ? awakeningInstruction
          : userInput;
      tavernV2Messages = buildTavernMessageChain({
        settings: state.gameSettings,
        preset: currentPresetV2.preset,
        characterId: state.gameSettings.currentStCharacterId ?? currentPresetV2.characterId ?? null,
        chatHistory: tavernHistory,
        latestUserInput: latestTavernInput,
        playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
        playerRole: state.旅人,
        includeNativeContextInWorldbook: false,
        triggerType: currentTriggerType,
        macroCtx,
      }).map((msg) => 创建聊天消息(msg.role, msg.content));
      if (tavernV2Messages.length === 0) {
        tavernV2Messages = null;
        tavernV2Error = new Error('ST V2 消息链为空，已回退 legacy 主剧情路径');
        console.warn('[ST V2] 消息链为空，已回退 legacy 主剧情路径');
      }
    } catch (error) {
      tavernV2Messages = null;
      tavernV2Error = error;
      console.warn('[ST V2] 消息链构建失败，已回退 legacy 主剧情路径', error);
    }
  }

  // 3. Prepare messages for API
  const apiMessages: 聊天消息[] = [];
  if (tavernV2Messages) {
    apiMessages.push(...tavernV2Messages);
  } else {
    for (const msg of recentHistory) {
      // 跳过 [系统] 触发消息，避免污染 AI 上下文
      if (msg.role === 'user' && msg.content.startsWith('[系统]')) {
        continue;
      }
      if (msg.role === 'user') {
        apiMessages.push(msg);
      } else if (msg.role === 'assistant' && msg.parsedResponse) {
        apiMessages.push(创建聊天消息('assistant', buildLeanAssistantHistoryContent(msg)));
      }
    }
    if (isOpeningSystemTrigger) {
      apiMessages.push(创建聊天消息('user', openingInstruction));
    }
    // [系统] 触发被 API 过滤 → 必须额外推一条真实指令,否则 AI 收到空白消息直接卡住。
    if (isAwakeningEnterTrigger && awakeningInstruction) {
      apiMessages.push(创建聊天消息('user', awakeningInstruction));
    }
  }
  // 评判回合:再追加一条系统级提醒,强化「必输 <狭间评判> 标签」的指令优先级。
  // 实践中,AI 若只在 system prompt 里看到此规则,容易在长正文里漏掉标签;把它升到 user 末尾会显著提高遵循率。
  if (awakeningPhase === 'judgement') {
    apiMessages.push(
      创建聊天消息(
        'user',
        '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。',
      ),
    );
  }

  const deepSeekMainMode = state.gameSettings.deepSeekMainMode ?? 'off';
  const deepSeekMainActive = isDeepSeekMainConfig(mainStoryConfig) && deepSeekMainMode !== 'off';
  const deepSeekLockFormat = deepSeekMainActive && deepSeekMainMode === 'lock_format';
  const shouldUseCotFakeHistory =
    state.gameSettings.enableCotFakeHistory && !isOpeningSystemTrigger && !deepSeekMainActive;

  // Phase 4/7：从当前激活预设读取 assistant prefill
  // DeepSeek lock_format 必须固定从 <thinking>\n 续写；普通请求才允许使用预设 assistantPrefill。
  const currentPresetId = state.gameSettings.currentStPresetId;
  const allPresets = [
    ...getBuiltinPresets(),
    ...(state.gameSettings.stPresets ?? []),
  ];
  const currentPreset = currentPresetId
    ? allPresets.find((p) => p.id === currentPresetId)
    : undefined;
  const presetAssistantPrefill = currentPreset?.assistantPrefill;
  const usePresetPrefill = Boolean(presetAssistantPrefill) && !deepSeekLockFormat;
  const effectivePrefixMode = deepSeekLockFormat || usePresetPrefill;
  const effectivePrefixContent = deepSeekLockFormat ? '<thinking>\n' : presetAssistantPrefill;

  if (deepSeekMainActive) {
    apiMessages.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
  }
  if (deps.rerollContext && !isOpeningSystemTrigger) {
    apiMessages.push(创建聊天消息(
      'user',
      buildRerollGenerationGuard(deps.rerollContext.nonce, deps.rerollContext.previousResponse),
    ));
  }

  // 3b. CoT 伪装历史注入：在消息序列最前面塞一对 user/assistant，强化思考段输出习惯。
  //     DeepSeek 专用模式下不注入这段伪装续聊，避免污染真实 user 输入并降低格式漂移。
  if (shouldUseCotFakeHistory) {
    apiMessages.unshift(
      创建聊天消息('user', COT_FAKE_HISTORY_USER),
      创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
    );
  }

  // 3c. ST 预设兼容：In-Chat depth 注入。
  //     injectionPosition=1 的模块按 injectionDepth 插入聊天历史。
  //     depth=0 末尾后，depth=1 末尾前，依此类推。
  //     Claude 方案 D：Claude 下 normalizeClaudeMessages 会抽取所有 system 消息到顶层，
  //     所以 Claude 下跳过 depth 注入。user/assistant 角色的 depth 模块追加到 systemPrompt 尾部。
  //     兜底：injectionPosition=0 的 user/assistant 模块（ST 预设很少用）也追加到 systemPrompt，
  //     避免内容丢失。
  //
  // 方案 B + C（v3 计划）：position 分流规则
  //   - position=0 + system role → 进 systemSection（在 injectPromptModules 里处理）
  //   - position=0 + user/assistant role → 追加 systemPrompt 尾部（方案 B，下方分支）
  //     简化处理：ST 语义里 position=0 + depth>0 表示插入 systemPrompt 中段，
  //     但我们的 systemPrompt 是字符串拼接，无法精确插入中段，统一追加到尾部。
  //     ST 预设中 position=0 + user/assistant + depth>0 极罕见，此简化可接受。
  //   - position=1 + user/assistant role（非 Claude）→ depth 注入（方案 C，下方分支）
  //   - position=1 + user/assistant role（Claude）→ 追加 systemPrompt 尾部（Claude 方案 D）
  if (moduleChatMessages.length > 0) {
    // 方案 B：injectionPosition=0 的 user/assistant 消息追加到 systemPrompt 尾部
    const positionZeroMessages = moduleChatMessages
      .filter((m) => m._injectionPosition === 0)
      .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
    if (positionZeroMessages.length > 0) {
      const fallbackText = positionZeroMessages.map((m) => m.content).join('\n\n---\n\n');
      systemPrompt = systemPrompt + '\n\n---\n\n' + fallbackText;
    }

    if (mainStoryConfig.provider !== 'claude') {
      // 方案 C：非 Claude 走 depth 注入，按 depth 降序 splice 到 apiMessages
      // 降序是为了避免 splice 时索引偏移（先插后面的再插前面的）
      const depthMessages = moduleChatMessages
        .filter((m) => m._injectionPosition === 1)
        .sort((a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0));
      for (const msg of depthMessages) {
        const depth = msg._injectionDepth ?? 0;
        const insertIndex = Math.max(0, apiMessages.length - depth);
        apiMessages.splice(insertIndex, 0, 创建聊天消息(msg.role as 'user' | 'assistant', msg.content));
      }
    } else {
      // Claude 方案 D：depth 模块退回 systemPrompt 拼接
      const fallbackMessages = moduleChatMessages
        .filter((m) => m._injectionPosition === 1)
        .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
      if (fallbackMessages.length > 0) {
        const fallbackText = fallbackMessages.map((m) => m.content).join('\n\n---\n\n');
        systemPrompt = systemPrompt + '\n\n---\n\n' + fallbackText;
      }
    }
  }

  // S3→S4 bridge: populate computed values into d for stage4+5 consumption
  const shouldStreamMainRequest = state.gameSettings.enableStreaming && !isPageHidden();

  return {
    systemPrompt,
    apiMessages,
    deepSeekMainActive,
    deepSeekLockFormat,
    deepSeekMainMode,
    shouldTryTavernV2,
    tavernV2Error,
    effectivePrefixMode,
    effectivePrefixContent,
    mainRequestMode: (shouldStreamMainRequest ? 'stream' : 'non-stream') as 'stream' | 'non-stream',
    tavernV2Messages,
    currentPresetV2ForStage: currentPresetV2,
  };
}
