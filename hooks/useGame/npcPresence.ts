import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 世界状态 } from '@/models/world';

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
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

export function getExplicitNpcNamesForTurn(input: {
  world: 世界状态;
  npcs?: NPC记录[];
  history?: 聊天消息[];
  userInput?: string;
  turnCount: number;
}): string[] {
  const npcs = input.npcs ?? [];
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
  const names: string[] = [];
  for (const name of getExplicitNpcNamesForTurn(input)) addUnique(names, name);
  for (const name of getAnticipatedNpcNamesForTurn(input)) addUnique(names, name);
  return filterOriginalProtagonistNames(names, input.world.原著主角).slice(0, 12);
}
