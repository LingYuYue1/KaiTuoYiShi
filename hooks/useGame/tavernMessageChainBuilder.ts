//  ============================== Tavern Message Chain Builder ==============================
//  核心功能：按 ST 预设的 prompt_order 构建消息链，识别内置 identifier 并注入项目内容
//  参考实现：MoRanJiangHu-main/hooks/useGame/promptRuntime.ts 构建酒馆预设消息链函数 (L612-773)

import type { STMessageRole, STPreset, STPresetPrompt, STPresetOrder, STWorldInfoEntry, TavernMessage, TavernInternalMessage, TavernPostProcessMode } from '@/models/stTypes';
import type { 提示词模块 } from '@/models/prompts';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { MacroContext } from '@/utils/macroEngine';
import { createMacroContext, processMacros } from '@/utils/macroEngine';
import { applyTavernFormatGuard, matchesTavernCotPlaceholder, matchesTavernFormatPlaceholder } from './tavernFormatGuard';
import { resolvePlayerSpeechMode } from '@/utils/narrativeRuntimePolicy';

export const TAVERN_CHAR_COMPAT_PROMPT =
  '当前剧情中的主要互动对象、出场 NPC、同伴、敌对角色以及由 AI 负责扮演和调度的剧情角色集合。不要把 {{char}} 理解为固定角色卡；应根据最近剧情、玩家输入、聊天历史和世界状态判断当前焦点对象。';
const TAVERN_CHAR_FALLBACK_PROMPT =
  '你将扮演当前剧情中所有由 AI 控制的崩坏：星穹铁道同人角色、NPC、同伴、敌人和旁白，不代替玩家角色做决定。';

//  ---------- 辅助类型 ----------
export interface TavernChainParams {
  settings: any; // 游戏设置 - 需要访问 promptModules 获取上下文片段
  preset: STPreset;
  characterId: number | null;
  chatHistory: 聊天消息[];
  latestUserInput: string;
  /** 工作包D：当前 scope——兼容保护读取对应 COT（main/opening/pathAwakening），不再固定主剧情 COT。 */
  scope: 'main' | 'opening' | 'pathAwakening';
  playerName: string;
  playerRole: 角色数据结构 | null;
  worldbookExtraTexts?: string[];
  includeNativeContextInWorldbook?: boolean;
  triggerType?: string;
  macroCtx?: MacroContext;
}

interface TavernContextPieces {
  worldPrompt: string;
  cotPrompt: string;
  formatPrompt: string;
  actionOptionsPrompt: string;
  noControlPrompt: string;
  playerSpeechExpansionPrompt: string;
  personaPrompt: string;
  devModePrompt: string;
  writingStylePrompt: string;
}

//  ---------- 主函数 ----------
export function buildTavernMessageChain(params: TavernChainParams): TavernMessage[] {
  // 1. 取预设与选中顺序
  const selectedOrder = getSTPresetOrder(params.preset, params.characterId);
  if (!params.preset || !selectedOrder) return [];
  
  // 2. 建立 identifier → prompt 索引
  const promptMap = new Map(
    (Array.isArray(params.preset.prompts) ? params.preset.prompts : [])
      .map((item) => [item.identifier, item] as const)
  );

  // 3. 过滤启用的 slot：enabled !== false
  const enabledOrderSlots = (Array.isArray(selectedOrder.order) ? selectedOrder.order : [])
    .filter((slot) => Boolean(slot) && slot.enabled !== false);

  // 4. 探测预设冲突规则
  const presetHasNoControl = presetContainsNoControl(params.preset, selectedOrder);
  const presetHasPlayerSpeechExpansion = presetContainsPlayerSpeechExpansion(params.preset, selectedOrder);

  // 5. 构建项目上下文片段（从 settings.promptModules 中提取内置模块内容）
  const contextPieces = buildContextPieces(params.settings, params.scope ?? 'main');
  const cotCompatReference = buildTavernCotCompatReference(params.scope ?? 'main');
  const formatCompatReference = buildTavernFormatCompatReference();

  // 6. 构建嫁接文本 combinedWorldbookText
  const worldbookText = params.includeNativeContextInWorldbook === false
    ? ''
    : buildWorldbookText(contextPieces, presetHasNoControl, presetHasPlayerSpeechExpansion);
  const presetWorldInfoText = buildPresetWorldInfoText(params);
  const combinedWorldbookText = [
    worldbookText,
    presetWorldInfoText,
    ...(Array.isArray(params.worldbookExtraTexts) ? params.worldbookExtraTexts : [])
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // 7. 构建历史消息
  const historyMessages = buildTavernChatHistory(params.chatHistory);
  const personaProfile = buildTavernPersonaProfile(params.playerRole);
  const charRuntimeProfile = buildTavernCharRuntimeProfile(params);
  const macroCtx = params.macroCtx ?? createMacroContext(undefined, {
    charName: charRuntimeProfile,
    userName: params.playerName,
    lastMessage: getLastMessageContent(params.chatHistory),
    lastUserMessage: getLastMessageContent(params.chatHistory, 'user'),
    lastCharMessage: getLastMessageContent(params.chatHistory, 'assistant'),
    messageCount: params.chatHistory.length,
    turnCount: params.chatHistory.length,
  });

  // 8. 遍历启用的 slot，按 identifier 分派
  const messages: TavernInternalMessage[] = [];
  let worldbookInjected = false;
  let historyInjected = false;
  let latestInputInjected = false;

  for (const slot of enabledOrderSlots) {
    const identifier = slot.identifier;
    const prompt = promptMap.get(identifier);
    if (!prompt) continue;

    // 特殊 identifier 处理（内置槽位 -> 运行时注入）
    if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
      if (!worldbookInjected && combinedWorldbookText) {
        messages.push({ role: 'system', content: combinedWorldbookText, source: 'worldbook' });
        worldbookInjected = true;
      }
      continue;
    }

    if (identifier === 'chatHistory') {
      if (!historyInjected) {
        historyMessages.forEach((msg) => messages.push({ ...msg, source: 'history' }));
        historyInjected = true;
      }
      continue;
    }

    if (identifier === 'personaDescription') {
      if (personaProfile) {
        const role = prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system';
        messages.push({ role, content: personaProfile, source: 'persona' });
      }
      continue;
    }

    if (identifier === 'userInput' || identifier === 'user_input' || identifier === 'latestUserInput' || identifier === 'input') {
      if (!latestInputInjected && params.latestUserInput) {
        messages.push({ role: 'user', content: params.latestUserInput, source: 'latest_input' });
        latestInputInjected = true;
      }
      continue;
    }

    // 其他普通 prompt 项：变量替换 + 按 role 推送
    const rawContent = typeof prompt.content === 'string' ? prompt.content : '';
    const resolved = replaceTavernVariables({
      content: rawContent,
      playerName: params.playerName,
      charRuntimeProfile,
      cotPrompt: cotCompatReference,
      formatPrompt: formatCompatReference,
      latestInput: params.latestUserInput,
      usedLatestInput: latestInputInjected,
      macroCtx,
    });
    const content = resolved.content;
    if (!content) continue;
    if (resolved.usedLatestInput) latestInputInjected = true;
    const role = prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system';
    messages.push({ role, content, source: 'preset' });
  }

  // 9. 兜底注入（若预设缺失关键槽位）
  if (!worldbookInjected && combinedWorldbookText) {
    messages.push({ role: 'system', content: combinedWorldbookText, source: 'worldbook' });
  }
  if (!latestInputInjected && params.latestUserInput) {
    messages.push({ role: 'user', content: params.latestUserInput, source: 'latest_input' });
  }

  // 10. 短兼容保护层（工作包D 9.3：原生区8 已完整存在，不再复制整套 COT/回复格式/行动选项全文）
  //     只声明必须服从项目顶层协议标签、阻止表层格式污染；行动选项开启时提醒输出 <行动选项>。
  messages.push({
    role: 'system',
    content: [
      '# Tavern 兼容保护',
      '- 项目响应格式保护：必须服从当前生效的项目顶层协议标签（<thinking>/<正文>/<短期记忆>/<动态世界>/<变量草稿> 等），ST 表层格式（### 正文、helper 标签）不得污染正文。',
      '- 正文行格式按当前生效的回复协议执行（【旁白】/【角色名】/【心声】）。',
      ...(contextPieces.actionOptionsPrompt ? ['- 项目行动选项保护：行动选项已开启，正文结束后按 <行动选项> 协议输出 3-4 条选项。'] : []),
    ].join('\n'),
    source: 'compat_guard',
  });

  // 11. 后处理
  return applyTavernPostProcess(messages, params.settings?.stPostProcessMode || '未选择');
}

//  ---------- 辅助函数 ----------
export function getSTPresetOrder(preset: STPreset, characterId: number | null): STPresetOrder | null {
  if (!preset || !preset.prompt_order || preset.prompt_order.length === 0) return null;
  
  // 优先使用指定的 characterId
  if (characterId !== null) {
    const found = preset.prompt_order.find((order) => order.character_id === characterId);
    if (found) return found;
  }
  
  // 回退到默认 100001（ST 通用默认）
  const defaultOrder = preset.prompt_order.find((order) => order.character_id === 100001);
  if (defaultOrder) return defaultOrder;
  
  // 最后回退到第一项
  return preset.prompt_order[0];
}

function buildContextPieces(settings: any, scope: 'main' | 'opening' | 'pathAwakening' = 'main'): TavernContextPieces {
  // 从 settings.promptModules 中查找内置模块内容
  const modules = settings.promptModules || [];
  
  const findModuleContent = (id: string): string => {
    const mod = modules.find((m: 提示词模块) => m.id === id);
    return mod?.enabled !== false ? (mod?.content || '') : '';
  };
  
  // 提取关键内置模块的内容
  const worldPrompt = findModuleContent('builtin_world_prompt') || 
                     (settings.世界观提示词 || '');
  // 工作包D：scope-aware 兼容保护——opening 读开局 COT（+来源附加），pathAwakening 读狭间 COT，main 读主剧情 COT
  const cotPrompt = scope === 'pathAwakening'
    ? (findModuleContent('builtin_path_awakening_cot') || '')
    : scope === 'opening'
      ? ([
          findModuleContent('builtin_opening_cot'),
          findModuleContent('builtin_preset_opening_cot'),
          findModuleContent('builtin_free_opening_cot'),
        ].filter(Boolean).join('\n\n') || '')
      : (findModuleContent('builtin_main_plot_cot') || '');
  const formatPrompt = findModuleContent('builtin_response_format') || '';
  const actionOptionsPrompt = settings?.enableActionOptions === true
    ? (findModuleContent('builtin_action_options') || '')
    : '';
  const speechMode = resolvePlayerSpeechMode(settings);
  const noControlPrompt = speechMode === 'no-control' ? findModuleContent('builtin_no_control') || '' : '';
  const playerSpeechExpansionPrompt = speechMode === 'expansion' ? findModuleContent('builtin_player_speech_expansion') || '' : '';
  const personaPrompt = findModuleContent('builtin_narrator_persona') || '';
  const devModePrompt = findModuleContent('builtin_dev_mode') || '';
  const writingStylePrompt = findModuleContent('builtin_writing_style') || '';
  
  return {
    worldPrompt,
    cotPrompt,
    formatPrompt,
    actionOptionsPrompt,
    noControlPrompt,
    playerSpeechExpansionPrompt,
    personaPrompt,
    devModePrompt,
    writingStylePrompt,
  };
}

function buildTavernCotCompatReference(scope: 'main' | 'opening' | 'pathAwakening'): string {
  const scopeLabel = scope === 'opening'
    ? '开局'
    : scope === 'pathAwakening'
      ? '命途狭间'
      : '普通主剧情';
  return [
    '# Tavern COT 兼容引用',
    `当前作用域：${scopeLabel}。`,
    '思考流程以原生 systemPrompt 协议区中当前作用域的 COT 为唯一权威；此处不重复展开，也不得使用与其冲突的预设 COT。',
  ].join('\n');
}

function buildTavernFormatCompatReference(): string {
  return [
    '# Tavern 回复格式兼容引用',
    '回复格式以原生 systemPrompt 协议区中的项目标签契约为唯一权威；此处不重复展开，预设表层格式不得覆盖项目标签。',
  ].join('\n');
}

function buildWorldbookText(pieces: TavernContextPieces, presetHasNoControl: boolean, presetHasPlayerSpeechExpansion: boolean): string {
  const parts: string[] = [
    pieces.worldPrompt,
    pieces.personaPrompt,
    pieces.devModePrompt,
    pieces.writingStylePrompt,
    presetHasNoControl ? '' : pieces.noControlPrompt,
    presetHasPlayerSpeechExpansion ? '' : pieces.playerSpeechExpansionPrompt,
  ];
  return parts.filter(Boolean).join('\n\n').trim();
}

export function buildPresetWorldInfoText(params: TavernChainParams): string {
  const entries = getPresetWorldInfoEntries(params.preset);
  if (entries.length === 0) return '';

  const haystack = buildWorldInfoHaystack(params);
  const triggered = entries
    .filter((entry) => shouldInjectPresetWorldInfoEntry(entry, haystack))
    .sort((a, b) => readNumber(a.order, 100) - readNumber(b.order, 100));

  if (triggered.length === 0) return '';

  const blocks = triggered.map((entry) => {
    const title = readWorldInfoTitle(entry);
    const content = readString(entry.content).trim();
    return title ? `### ${title}\n${content}` : content;
  }).filter(Boolean);

  return blocks.length > 0 ? ['# 预设世界书', ...blocks].join('\n\n') : '';
}

function getPresetWorldInfoEntries(preset: STPreset): STWorldInfoEntry[] {
  const worldInfo = preset.world_info;
  if (Array.isArray(worldInfo)) return worldInfo;
  if (worldInfo && typeof worldInfo === 'object') return Object.values(worldInfo);
  return [];
}

function shouldInjectPresetWorldInfoEntry(entry: STWorldInfoEntry, haystack: string): boolean {
  const content = readString(entry.content).trim();
  if (!content) return false;
  if (entry.enabled === false) return false;
  if (readBool(entry.constant)) return passesPresetWorldInfoProbability(entry, haystack);

  const primaryKeys = readStringArray(entry.key);
  const secondaryKeys = readStringArray(entry.keysecondary);
  if (primaryKeys.length === 0) return false;
  const useRegex = readBool((entry as { useRegex?: unknown }).useRegex);
  const primaryMatched = matchAnyWorldInfoKey(primaryKeys, haystack, useRegex);
  if (!primaryMatched) return false;

  if (readBool(entry.selective) && secondaryKeys.length > 0) {
    const secondaryMatched = matchAnyWorldInfoKey(secondaryKeys, haystack, useRegex);
    if (!secondaryMatched) return false;
  }

  return passesPresetWorldInfoProbability(entry, haystack);
}

function buildWorldInfoHaystack(params: TavernChainParams): string {
  const historyText = params.chatHistory
    .slice(-20)
    .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
    .filter(Boolean)
    .join('\n');
  return [
    params.latestUserInput,
    params.playerName,
    historyText,
  ].filter(Boolean).join('\n').toLowerCase();
}

function matchAnyWorldInfoKey(keys: string[], haystack: string, useRegex: boolean): boolean {
  return keys.some((key) => {
    const normalized = key.trim();
    if (!normalized) return false;
    if (!useRegex) return haystack.includes(normalized.toLowerCase());
    try {
      return new RegExp(normalized, 'iu').test(haystack);
    } catch {
      return haystack.includes(normalized.toLowerCase());
    }
  });
}

function passesPresetWorldInfoProbability(entry: STWorldInfoEntry, haystack: string): boolean {
  const probability = Math.max(0, Math.min(100, readNumber(entry.probability, 100)));
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return stablePercent(`${readString(entry.uid)}:${readString(entry.content)}:${haystack}`) < probability;
}

function stablePercent(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

function readWorldInfoTitle(entry: STWorldInfoEntry): string {
  return readString(entry.comment) || readString(entry.uid && `world_info_${entry.uid}`);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readString(item).trim()).filter(Boolean);
}

function readBool(value: unknown): boolean {
  return value === true || value === 1 || value === 'true';
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildTavernChatHistory(history: 聊天消息[]): Array<{role: STMessageRole; content: string; source: 'history'}> {
  const messages: Array<{role: STMessageRole; content: string; source: 'history'}> = [];
  for (const msg of history) {
    const role = msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'system';
    const content = buildTavernHistoryContent(msg);
    if (!content) continue;
    messages.push({
      role,
      content,
      source: 'history'
    });
  }
  return messages;
}

function buildTavernHistoryContent(msg: 聊天消息): string {
  if (msg.role !== 'assistant') return typeof msg.content === 'string' ? msg.content.trim() : '';
  const parsed = msg.parsedResponse;
  const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
  const worldEvents = Array.isArray(parsed?.worldEvents) && parsed.worldEvents.length > 0
    ? `【世界事件】\n${parsed.worldEvents.join('\n')}`
    : '';
  const memory = typeof parsed?.memory === 'string' && parsed.memory.trim()
    ? `【记忆】\n${parsed.memory.trim()}`
    : '';
  return [body, worldEvents, memory]
    .filter(Boolean)
    .join('\n\n')
    .trim() || (typeof msg.content === 'string' ? msg.content.trim() : '');
}

function getLastMessageContent(history: 聊天消息[], role?: STMessageRole): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (role && msg.role !== role) continue;
    const content = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (content) return content;
  }
  return '';
}

function buildTavernPersonaProfile(playerRole: 角色数据结构 | null): string {
  if (!playerRole) return '';
  const lines = [
    playerRole.姓名 ? `姓名：${playerRole.姓名}` : '',
    playerRole.别名 ? `别名：${playerRole.别名}` : '',
    playerRole.性别 ? `性别：${playerRole.性别}` : '',
    Number.isFinite(playerRole.年龄) ? `年龄：${playerRole.年龄}` : '',
    playerRole.生日 ? `生日：${playerRole.生日}` : '',
    playerRole.身高 ? `身高：${playerRole.身高}` : '',
    playerRole.身份 ? `身份：${playerRole.身份}` : '',
    playerRole.外貌 ? `外貌：${playerRole.外貌}` : '',
    playerRole.性格 ? `性格：${playerRole.性格}` : '',
    playerRole.背景 ? `背景：${playerRole.背景}` : '',
    Array.isArray(playerRole.专长知识) && playerRole.专长知识.length > 0
      ? `专长知识：${playerRole.专长知识.join('、')}`
      : '',
  ].filter(Boolean);
  return lines.length > 0 ? ['# 玩家档案', ...lines].join('\n') : '';
}

export function buildTavernCharRuntimeProfile(params: TavernChainParams): string {
  const focusNames = extractPossibleNpcNames([
    params.latestUserInput,
    getLastMessageContent(params.chatHistory, 'assistant'),
    getLastMessageContent(params.chatHistory, 'user'),
  ]);
  const focusText = focusNames.length > 0
    ? `当前剧情焦点角色候选：${focusNames.slice(0, 8).join('、')}。`
    : '';
  const historyHint = getLastMessageContent(params.chatHistory, 'assistant');
  const historyText = historyHint
    ? `最近一次 AI 叙事片段可作为判断当前登场 NPC 和旁白职责的依据：${historyHint.slice(0, 240)}`
    : '';
  return [
    TAVERN_CHAR_COMPAT_PROMPT,
    focusText,
    historyText,
    TAVERN_CHAR_FALLBACK_PROMPT,
  ].filter(Boolean).join('\n');
}

function extractPossibleNpcNames(texts: string[]): string[] {
  const found = new Set<string>();
  const patterns = [
    /(?:【|「|『)([^】」』]{1,16})(?:】|」|』)/g,
    /(?:^|[\s，。、“”])([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z·]{1,15})(?:说|问|答|看向|望向|走来|喊道|低声|轻声|笑道)/g,
  ];
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (name && !isLikelyNonCharacterName(name)) found.add(name);
      }
    }
  }
  return [...found];
}

function isLikelyNonCharacterName(name: string): boolean {
  return /^(玩家|用户|系统|旁白|正文|行动选项|变量更新|天气|剧情规划|发送者|assistant|user|system)$/i.test(name);
}

function replaceTavernVariables(params: {
  content: string;
  playerName: string;
  charRuntimeProfile: string;
  cotPrompt: string;
  formatPrompt: string;
  latestInput: string;
  usedLatestInput: boolean;
  macroCtx?: MacroContext;
}): {content: string; usedLatestInput: boolean} {
  let resolved = params.content;
  let usedLatestInput = params.usedLatestInput;

  // 用户输入类占位符
  const inputPatterns = [
    /\{\{\s*userinput\s*\}\}/gi,
    /\{\{\s*input\s*\}\}/gi,
    /\{\{\s*lastinput\s*\}\}/gi,
    /<\s*userinput\s*>/gi,
    /<\s*user_input\s*>/gi,
    /<\s*input\s*>/gi
  ];
  for (const pattern of inputPatterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(resolved)) continue;
    pattern.lastIndex = 0;
    let insertedThisPattern = false;
    resolved = resolved.replace(pattern, () => {
      if (usedLatestInput || insertedThisPattern) return '';
      insertedThisPattern = true;
      usedLatestInput = true;
      return params.latestInput;
    });
  }

  // 其他占位符
  if (params.playerName) {
    resolved = resolved.replace(/\{\{\s*user\s*\}\}/gi, params.playerName);
  }
  resolved = resolved.replace(/\{\{\s*char\s*\}\}/gi, params.charRuntimeProfile);
  resolved = resolved.replace(/<\s*charname\s*>/gi, params.charRuntimeProfile);
  
  const cotMatch = resolved.match(/\{\{\s*cot\s*\}\}/i);
  if (cotMatch) {
    resolved = resolved.replace(/\{\{\s*cot\s*\}\}/gi, params.cotPrompt);
  }
  
  const formatMatch = resolved.match(/\{\{\s*(?:格式|format)\s*\}\}/i);
  if (formatMatch) {
    resolved = resolved.replace(/\{\{\s*(?:格式|format)\s*\}\}/gi, params.formatPrompt);
  }

  if (params.macroCtx) {
    try {
      resolved = processMacros(resolved, params.macroCtx);
    } catch (error) {
      console.warn('[TavernPreset] 宏处理失败，保留原文本', error);
    }
  }

  return {content: resolved, usedLatestInput};
}

function presetContainsNoControl(preset: STPreset, selectedOrder: STPresetOrder): boolean {
  const noControlKeywords = /NoControl|防止说话|防抢话|禁止代写|不得代写|不代写玩家|不替玩家|绝不控制|禁止控制玩家|不控制玩家|玩家的台词|玩家言行|代替玩家发言/iu;
  const enabledIds = new Set(selectedOrder.order
    .filter(slot => slot.enabled !== false)
    .map(slot => slot.identifier));
  
  return (Array.isArray(preset.prompts) ? preset.prompts : []).some(prompt => {
    if (!enabledIds.has(prompt.identifier)) return false;
    return noControlKeywords.test(`${prompt.identifier}\n${prompt.name || ''}\n${prompt.content || ''}`);
  });
}

function presetContainsPlayerSpeechExpansion(preset: STPreset, selectedOrder: STPresetOrder): boolean {
  const speechExpansionKeywords = /抢话|嘴替|代写玩家对白|代替玩家说话|玩家对白扩写|扩写玩家|加强复述|扩写后推进|主动替玩家|user 的嘴替/iu;
  const enabledIds = new Set(selectedOrder.order
    .filter(slot => slot.enabled !== false)
    .map(slot => slot.identifier));

  return (Array.isArray(preset.prompts) ? preset.prompts : []).some(prompt => {
    if (!enabledIds.has(prompt.identifier)) return false;
    return speechExpansionKeywords.test(`${prompt.identifier}\n${prompt.name || ''}\n${prompt.content || ''}`);
  });
}

function applyTavernPostProcess(messages: TavernInternalMessage[], mode: TavernPostProcessMode): TavernMessage[] {
  // 角色重写
  const mapped: TavernMessage[] = messages.map((item) => {
    if (mode === '严格') {
      if (item.source === 'history' || item.source === 'latest_input') {
        return { role: item.role, content: item.content };
      }
      return { role: 'system', content: item.content };
    }
    if (mode === '半严格') {
      if (item.source === 'history' || item.source === 'latest_input') {
        return { role: item.role, content: item.content };
      }
      return {
        role: item.role === 'assistant' ? 'user' : item.role,
        content: item.content
      };
    }
    if (mode === '单一用户') {
      if (item.source === 'history' || item.source === 'latest_input') {
        return { role: item.role, content: item.content };
      }
      return {
        role: item.role === 'system' ? 'system' : 'user',
        content: item.content
      };
    }
    // 未选择或其他：保持原 role
    return item;
  });

  // 相邻同角色合并 + 空内容过滤
  const merged: TavernMessage[] = [];
  mapped.forEach((item) => {
    const trimmed = (item.content || '').trim();
    if (!trimmed) return;
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) {
      last.content = `${last.content}\n\n${trimmed}`.trim();
      return;
    }
    merged.push({ role: item.role, content: trimmed });
  });
  return merged;
}
