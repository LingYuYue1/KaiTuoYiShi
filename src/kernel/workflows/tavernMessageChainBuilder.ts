//  ============================== Tavern Message Chain Builder ==============================
//  核心功能：按 ST 预设的 prompt_order 构建消息链，识别内置 identifier 并注入项目内容
//  参考实现：MoRanJiangHu-main/hooks/useGame/promptRuntime.ts 构建酒馆预设消息链函数 (L612-773)

import type { STMessageRole, STPreset, STPresetOrder, STWorldInfoEntry, TavernMessage, TavernInternalMessage } from '@/models/stTypes';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { MacroContext } from '@/utils/macroEngine';
import { processMacros } from '@/utils/macroEngine';

export const TAVERN_CHAR_COMPAT_PROMPT =
  '当前剧情中的主要互动对象、出场 NPC、同伴、敌对角色以及由 AI 负责扮演和调度的剧情角色集合。不要把 {{char}} 理解为固定角色卡；应根据最近剧情、玩家输入、聊天历史和世界状态判断当前焦点对象。';

//  ---------- 辅助类型 ----------
export interface TavernChainParams {
  preset: STPreset;
  characterId: number | null;
  chatHistory: 聊天消息[];
  latestUserInput: string;
  playerName: string;
  playerRole: 角色数据结构;
  macroCtx: MacroContext;
}

//  ---------- 主函数 ----------
export function buildTavernMessageChain(params: TavernChainParams): TavernMessage[] {
  // 1. 取预设与选中顺序
  const selectedOrder = getSTPresetOrder(params.preset, params.characterId);
  
  // 2. 建立 identifier → prompt 索引
  const promptMap = new Map(
    (Array.isArray(params.preset.prompts) ? params.preset.prompts : [])
      .map((item) => [item.identifier, item] as const)
  );

  // 3. 过滤启用的 slot：enabled !== false
  const enabledOrderSlots = (Array.isArray(selectedOrder.order) ? selectedOrder.order : [])
    .filter((slot) => Boolean(slot) && slot.enabled !== false);

  // The native kernel context is already sent as the API system message.
  // This chain owns the selected Tavern order, preset world-info, and chat loop.
  const presetWorldInfoText = buildPresetWorldInfoText(params);

  // A valid Tavern preset commonly uses chatHistory as the send-message slot.
  // Callers must therefore include the current user message in chatHistory.
  const historyMessages = buildTavernChatHistory(params.chatHistory);
  const personaProfile = buildTavernPersonaProfile(params.playerRole);
  const charRuntimeProfile = buildTavernCharRuntimeProfile(params);
  const macroCtx = params.macroCtx;

  // 8. 遍历启用的 slot，按 identifier 分派
  const messages: TavernInternalMessage[] = [];
  let worldbookInjected = false;
  let latestInputInjected = false;

  for (const slot of enabledOrderSlots) {
    const identifier = slot.identifier;
    const prompt = promptMap.get(identifier);
    if (!prompt) throw new Error(`ST V2 prompt_order 引用了不存在的提示词：${identifier}`);

    // 特殊 identifier 处理（内置槽位 -> 运行时注入）
    if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
      if (!worldbookInjected && presetWorldInfoText) {
        messages.push({ role: 'system', content: presetWorldInfoText, source: 'worldbook' });
        worldbookInjected = true;
      }
      continue;
    }

    if (identifier === 'chatHistory') {
      historyMessages.forEach((msg) => messages.push({ ...msg, source: 'history' }));
      if (historyContainsLatestInput(historyMessages, params.latestUserInput)) latestInputInjected = true;
      continue;
    }

    if (identifier === 'personaDescription') {
      if (!personaProfile) throw new Error('ST V2 enabled personaDescription slot has no persona content');
      const role = prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system';
      messages.push({ role, content: personaProfile, source: 'persona' });
      continue;
    }

    if (identifier === 'userInput' || identifier === 'user_input' || identifier === 'latestUserInput' || identifier === 'input') {
      if (!params.latestUserInput.trim()) throw new Error(`ST V2 enabled slot ${identifier} has no user input`);
      messages.push({ role: 'user', content: params.latestUserInput, source: 'latest_input' });
      latestInputInjected = true;
      continue;
    }

    // 其他普通 prompt 项：变量替换 + 按 role 推送
    const rawContent = typeof prompt.content === 'string' ? prompt.content : '';
    const resolved = replaceTavernVariables({
      content: rawContent,
      playerName: params.playerName,
      charRuntimeProfile,
      latestInput: params.latestUserInput,
      macroCtx,
    });
    const content = resolved.content;
    if (!content.trim()) continue;
    if (resolved.usedLatestInput) latestInputInjected = true;
    const role = prompt.role === 'user' || prompt.role === 'assistant' ? prompt.role : 'system';
    messages.push({ role, content, source: 'preset' });
  }

  if (presetWorldInfoText && !worldbookInjected) {
    throw new Error('ST V2 预设包含世界书内容但没有启用 worldInfoBefore/worldInfoAfter 槽位');
  }
  if (!latestInputInjected && !historyContainsLatestInput(historyMessages, params.latestUserInput) && params.latestUserInput) {
    throw new Error('ST V2 预设未注入当前用户输入');
  }

  return mergeTavernMessages(messages);
}

//  ---------- 辅助函数 ----------
export function getSTPresetOrder(preset: STPreset, characterId: number | null): STPresetOrder {
  if (!preset?.prompt_order?.length) throw new Error('ST V2 预设没有 prompt_order');
  
  // 优先使用指定的 characterId
  if (characterId !== null) {
    const found = preset.prompt_order.find((order) => order.character_id === characterId);
    if (!found) throw new Error(`ST V2 预设没有 character_id=${characterId} 的 prompt_order`);
    return found;
  }
  if (preset.prompt_order.length !== 1) throw new Error('ST V2 预设包含多个 prompt_order，但没有选择 character_id');
  return preset.prompt_order[0];
}

export function buildPresetWorldInfoText(params: TavernChainParams): string {
  const entries = getPresetWorldInfoEntries(params.preset);
  if (entries.length === 0) return '';

  const haystack = buildWorldInfoHaystack(params);
  const triggered = entries
    .filter((entry) => shouldInjectPresetWorldInfoEntry(entry, haystack))
    .sort((a, b) => readNumber(a.order, 'world_info.order') - readNumber(b.order, 'world_info.order'));

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
    return new RegExp(normalized, 'iu').test(haystack);
  });
}

function passesPresetWorldInfoProbability(entry: STWorldInfoEntry, haystack: string): boolean {
  const probability = Math.max(0, Math.min(100, readNumber(entry.probability, 'world_info.probability')));
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

function readNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`ST V2 requires a finite ${field}`);
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

function historyContainsLatestInput(history: Array<{role: STMessageRole; content: string; source: 'history'}> | undefined, latestInput: string): boolean {
  if (!history || !latestInput) return false;
  return history.some(msg => msg.role === 'user' && msg.content.includes(latestInput));
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
  latestInput: string;
  macroCtx?: MacroContext;
}): {content: string; usedLatestInput: boolean} {
  let resolved = params.content;
  let usedLatestInput = false;

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
    if (pattern.test(resolved)) {
      resolved = resolved.replace(pattern, params.latestInput);
      usedLatestInput = true;
    }
  }

  // 其他占位符
  if (params.playerName) {
    resolved = resolved.replace(/\{\{\s*user\s*\}\}/gi, params.playerName);
  }
  resolved = resolved.replace(/\{\{\s*char\s*\}\}/gi, params.charRuntimeProfile);
  resolved = resolved.replace(/<\s*charname\s*>/gi, params.charRuntimeProfile);
  
  if (params.macroCtx) {
    resolved = processMacros(resolved, params.macroCtx);
  }

  return {content: resolved, usedLatestInput};
}

function mergeTavernMessages(messages: TavernInternalMessage[]): TavernMessage[] {
  const merged: TavernMessage[] = [];
  messages.forEach((item) => {
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
