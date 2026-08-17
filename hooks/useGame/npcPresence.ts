import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import { 筛选活跃NPC } from '@/models/npc';
import type { 世界状态 } from '@/models/world';

function namesLikelySame(a: string, b: string): boolean {
  const left = normalizeCharacterName(a);
  const right = normalizeCharacterName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 2) return false;
  return left.includes(right) || right.includes(left);
}

function normalizeCharacterName(value: string): string {
  return value.toLowerCase().replace(/[\s·•・._-]+/gu, '');
}

function nameAppearsInText(name: string, text: string): boolean {
  const cleanName = name.trim();
  if (!cleanName || !text.trim()) return false;
  if (
    cleanName === '黑塔' &&
    /黑塔空间站|空间站[「“"]?黑塔[」”"]?/.test(text) &&
    !/(黑塔说|黑塔看|黑塔问|黑塔本人|人偶黑塔|黑塔的人偶|【黑塔】)/.test(text)
  ) {
    return false;
  }
  if (cleanName.length <= 1) {
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s，。！？、：；“”"'（）()《》【】])${escaped}($|[\\s，。！？、：；“”"'（）()《》【】])`).test(text);
  }
  return text.includes(cleanName);
}

function recentNarrativeText(history: 聊天消息[], limit = 4): string {
  return history
    .slice(-limit)
    .map((msg) => msg.parsedResponse?.body || msg.content)
    .join('\n');
}

export type ZhikuCharacterParticipationLevel = 'present' | 'anticipated' | 'mentioned' | 'background';

export interface ZhikuCharacterParticipation {
  present: string[];
  anticipated: string[];
  mentioned: string[];
  background: string[];
}

export function getZhikuCharacterParticipationForTurn(input: {
  world: 世界状态;
  npcs?: NPC记录[];
  history?: 聊天消息[];
  userInput?: string;
  turnCount: number;
  /** 记忆系统设置（取 即时转短期阈值 推导回顾窗口，缺省 10-1=9 回合）。 */
  settings?: { 即时转短期阈值?: number };
}): ZhikuCharacterParticipation {
  const npcs = 筛选活跃NPC(input.npcs);
  const sceneNames = new Set((input.world.当前时段?.人物 ?? []).map((npc) => npc.姓名.trim()).filter(Boolean));
  const currentText = input.userInput ?? '';
  // 对标回顾窗口：近期文本从「最近 4 条消息」扩展到回顾窗口（即时转短期阈值-1 回合 ≈ 2N 条消息），
  // 避免「只出现在回顾里的角色」在智库召回的所有通道里不可见。
  const reviewTurns = Math.max(2, Math.trunc((input.settings?.即时转短期阈值 ?? 10) - 1) || 9);
  const recentText = recentNarrativeText(input.history ?? [], reviewTurns * 2);
  const recentCutoff = Math.max(1, input.turnCount - 3);
  const present: string[] = [];
  const mentioned: string[] = [];
  const background: string[] = [];

  for (const npc of npcs) {
    const inScene = sceneNames.has(npc.姓名)
      || Boolean(npc.别名 && sceneNames.has(npc.别名));
    const textAppears = nameAppearsInText(npc.姓名, currentText)
      || Boolean(npc.别名 && nameAppearsInText(npc.别名, currentText))
      || nameAppearsInText(npc.姓名, recentText)
      || Boolean(npc.别名 && nameAppearsInText(npc.别名, recentText));
    // 正文点名 + 最近 1 回合内有系统互动记录 → 判为在场。
    // 模型每回合变量有限，「同行」常写不全；正文写了角色在说话行动就是最实在的在场证据。
    // 已知代价：回忆点名会刷新「最近回合」，离场 ≤4 回合被回忆点名的角色可能被算在场（影响小）。
    const bodyEvidence = textAppears && Number(npc.最近回合 || 0) >= input.turnCount - 1;
    const isPresent = npc.同行 || inScene || bodyEvidence;
    if (isPresent) {
      addUnique(present, npc.姓名);
      continue;
    }
    if (textAppears) {
      addUnique(mentioned, npc.姓名);
      continue;
    }
    if (Number(npc.最近回合 || 0) >= recentCutoff) addUnique(background, npc.姓名);
  }

  for (const name of sceneNames) {
    if (!present.some((item) => namesLikelySame(item, name))) addUnique(present, name);
  }
  const anticipated = getAnticipatedNpcNamesForTurn(input)
    .filter((name) => !present.some((item) => namesLikelySame(item, name)))
    .filter((name) => !mentioned.some((item) => namesLikelySame(item, name)));

  return {
    present: filterOriginalProtagonistNames(present, input.world.原著主角).slice(0, 12),
    anticipated: filterOriginalProtagonistNames(anticipated, input.world.原著主角).slice(0, 8),
    mentioned: filterOriginalProtagonistNames(mentioned, input.world.原著主角).slice(0, 12),
    background: filterOriginalProtagonistNames(background, input.world.原著主角).slice(0, 12),
  };
}

export function getExplicitNpcNamesForTurn(input: {
  world: 世界状态;
  npcs?: NPC记录[];
  history?: 聊天消息[];
  userInput?: string;
  turnCount: number;
}): string[] {
  const npcs = 筛选活跃NPC(input.npcs);
  const text = [input.userInput ?? '', recentNarrativeText(input.history ?? [])].join('\n');
  const sceneNames = new Set((input.world.当前时段?.人物 ?? []).map((npc) => npc.姓名.trim()).filter(Boolean));
  const recentCutoff = Math.max(1, input.turnCount - 3);
  const picked: string[] = [];
  const push = (name?: string) => {
    const trimmed = name?.trim();
    if (trimmed && !picked.some((item) => namesLikelySame(item, trimmed))) picked.push(trimmed);
  };

  for (const npc of npcs) {
    const isExplicit =
      npc.同行 ||
      sceneNames.has(npc.姓名) ||
      Boolean(npc.别名 && sceneNames.has(npc.别名)) ||
      Number(npc.最近回合 || 0) >= recentCutoff ||
      nameAppearsInText(npc.姓名, text) ||
      Boolean(npc.别名 && nameAppearsInText(npc.别名, text));
    if (isExplicit) push(npc.姓名);
    if (picked.length >= 12) break;
  }

  return picked;
}

function addUnique(list: string[], name: string): void {
  const trimmed = name.trim();
  if (trimmed && !list.some((item) => namesLikelySame(item, trimmed))) list.push(trimmed);
}

function filterOriginalProtagonistNames(names: string[], originalProtagonist?: 世界状态['原著主角']): string[] {
  if (originalProtagonist === '星') return names.filter((name) => !namesLikelySame(name, '穹'));
  if (originalProtagonist === '穹') return names.filter((name) => !namesLikelySame(name, '星'));
  return names;
}

export function getAnticipatedNpcNamesForTurn(input: {
  world: 世界状态;
  history?: 聊天消息[];
  userInput?: string;
}): string[] {
  const text = [
    input.userInput ?? '',
    recentNarrativeText(input.history ?? [], 6),
    input.world.当前地点 ?? '',
    input.world.当前时段?.名称 ?? '',
  ].join('\n');
  const names: string[] = [];

  if (/帕姆|Pom-?Pom|列车长|广播|星穹列车|观景车厢|派对车厢|客房车厢|车厢/.test(text)) {
    addUnique(names, '帕姆');
  }
  if (/星穹列车|列车组|无名客|观景车厢|派对车厢|客房车厢/.test(text)) {
    for (const name of ['三月七', '丹恒', '姬子', '瓦尔特']) {
      if (nameAppearsInText(name, text)) addUnique(names, name);
    }
  }

  return filterOriginalProtagonistNames(names, input.world.原著主角).slice(0, 8);
}

export function getZhikuNpcNamesForTurn(input: {
  world: 世界状态;
  npcs?: NPC记录[];
  history?: 聊天消息[];
  userInput?: string;
  turnCount: number;
}): string[] {
  return getZhikuCharacterParticipationForTurn(input).present;
}
