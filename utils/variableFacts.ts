import type { 变量事实, 变量命令 } from '@/models/variableCommand';
import type { VariableState } from './variableRegistry';
import type { 世界状态 } from '@/models/world';
import { 对齐世界日期与天数, 推进琥珀日期 } from '@/models/world';
import type { NPC记录, NPC关系类型 } from '@/models/npc';
import { matchCanonical } from '@/data/canonicalCharacters';
import type { 物品分类, 物品品质 } from '@/models/inventory';
import type { 主动来信类型, 主动来信优先级 } from '@/models/phone';

const ITEM_CATEGORIES = new Set<物品分类>(['food', 'consumable', 'lightcone', 'weapon', 'clothing', 'accessory', 'memento', 'key']);
const ITEM_QUALITIES = new Set<物品品质>(['蓝', '紫', '金']);
const NPC_RELATIONS = new Set<NPC关系类型>(['stranger', 'acquaintance', 'friend', 'close', 'rival', 'enemy']);
const PHONE_TRIGGER_TYPES = new Set<主动来信类型>(['injury', 'victory', 'defeat', 'location_change', 'important_item', 'relationship', 'news', 'quest', 'time', 'custom']);
const PHONE_PRIORITIES = new Set<主动来信优先级>(['low', 'normal', 'high', 'urgent']);
const FACT_TYPE_ALIASES: Record<string, 变量事实['type']> = {
  旅人: 'traveler_profile',
  旅人档案: 'traveler_profile',
  traveler: 'traveler_profile',
  travelerProfile: 'traveler_profile',
  traveler_profile: 'traveler_profile',
  时间: 'time',
  time: 'time',
  地点: 'location',
  location: 'location',
  NPC: 'npc',
  npc: 'npc',
  npc_memory: 'npc',
  npcMemory: 'npc',
  relationship: 'npc',
  伙伴记忆: 'npc',
  物品: 'item',
  item: 'item',
  item_gain: 'item',
  itemGain: 'item',
  获得物品: 'item',
  世界事件: 'world_event',
  world_event: 'world_event',
  worldEvent: 'world_event',
  event: 'world_event',
  手机来信: 'phone_seed',
  phone_seed: 'phone_seed',
  phoneSeed: 'phone_seed',
  phone_message_seed: 'phone_seed',
  message_seed: 'phone_seed',
};
const ITEM_CATEGORY_ALIASES: Record<string, 物品分类> = {
  食物: 'food',
  餐食: 'food',
  消耗品: 'consumable',
  道具: 'consumable',
  光锥: 'lightcone',
  武器: 'weapon',
  衣物: 'clothing',
  服装: 'clothing',
  配饰: 'accessory',
  饰品: 'accessory',
  纪念品: 'memento',
  纪念物: 'memento',
  关键道具: 'key',
  钥匙: 'key',
};
const ITEM_ACTION_ALIASES: Record<string, 'gain'> = {
  获得: 'gain',
  获取: 'gain',
  得到: 'gain',
  拾取: 'gain',
  gain: 'gain',
};
const PHONE_TRIGGER_ALIASES: Record<string, 主动来信类型> = {
  受伤: 'injury',
  胜利: 'victory',
  失败: 'defeat',
  地点变化: 'location_change',
  关键物品: 'important_item',
  关系变化: 'relationship',
  新闻: 'news',
  任务: 'quest',
  时间: 'time',
  自定义: 'custom',
};
const PHONE_PRIORITY_ALIASES: Record<string, 主动来信优先级> = {
  低: 'low',
  普通: 'normal',
  一般: 'normal',
  高: 'high',
  紧急: 'urgent',
};

function 清理事实块(block: string): string {
  return block
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/```/g, '')
    .trim();
}

function 读字符串(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function 是对象(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function 数字(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function 读字符串或数组(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).join('；');
  return '';
}

function 字符串数组(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function npcNameFromId(id: string): string {
  const normalized = id.replace(/^npc[_-]/i, '').toLowerCase();
  const map: Record<string, string> = {
    march7th: '三月七',
    march7: '三月七',
    march: '三月七',
    danheng: '丹恒',
    dan_heng: '丹恒',
    himeko: '姬子',
    welt: '瓦尔特',
    pompom: '帕姆',
    'pom-pom': '帕姆',
    herta: '黑塔',
    asta: '艾丝妲',
    arlan: '阿兰',
    stelle: '星',
    caelus: '穹',
  };
  return map[normalized] ?? '';
}

function inferNpcTier(fact: Extract<变量事实, { type: 'npc' }>, canonical: ReturnType<typeof matchCanonical>): 'companion' | 'extra' {
  if (fact.tier) return fact.tier;
  if (canonical) return 'companion';
  if (fact.following) return 'companion';
  if (fact.memory) return 'companion';
  if (typeof fact.affinityDelta === 'number' && fact.affinityDelta !== 0) return 'companion';
  if (typeof fact.affinitySet === 'number' && fact.affinitySet !== 0) return 'companion';
  if (fact.relation && fact.relation !== 'stranger' && fact.relation !== 'acquaintance') return 'companion';
  return 'extra';
}

function 读取记忆摘要(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!是对象(value)) return '';
  return 读字符串(value.摘要 || value.summary || value.text || value.内容);
}

function 归一化事实类型(value: unknown): 变量事实['type'] | '' {
  const text = 读字符串(value);
  return FACT_TYPE_ALIASES[text] ?? '';
}

function 归一化物品分类(value: unknown): 物品分类 | '' {
  const text = 读字符串(value);
  return (ITEM_CATEGORY_ALIASES[text] ?? text) as 物品分类 | '';
}

function 归一化物品动作(value: unknown): 'gain' | '' {
  const text = 读字符串(value) || 'gain';
  return ITEM_ACTION_ALIASES[text] ?? '';
}

function 归一化触发类型(value: unknown): 主动来信类型 | '' {
  const text = 读字符串(value);
  return (PHONE_TRIGGER_ALIASES[text] ?? text) as 主动来信类型 | '';
}

function 归一化优先级(value: unknown): 主动来信优先级 | '' {
  const text = 读字符串(value);
  return (PHONE_PRIORITY_ALIASES[text] ?? text) as 主动来信优先级 | '';
}

function 归一化事实(raw: unknown): 变量事实 | null {
  if (!是对象(raw)) return null;
  const type = 归一化事实类型(raw.type || raw.类型);
  if (type === 'traveler_profile') {
    const abilityAdd = 字符串数组(raw.abilityAdd ?? raw.新增能力 ?? raw.能力新增);
    const knowledgeAdd = 字符串数组(raw.knowledgeAdd ?? raw.新增专长知识 ?? raw.专长知识新增);
    const fact = {
      type: 'traveler_profile' as const,
      identity: 读字符串(raw.identity || raw.身份) || undefined,
      appearance: 读字符串(raw.appearance || raw.外貌) || undefined,
      personality: 读字符串(raw.personality || raw.性格) || undefined,
      background: 读字符串(raw.background || raw.背景) || undefined,
      abilityAdd,
      knowledgeAdd,
      evidence: 读字符串(raw.evidence || raw.证据) || undefined,
    };
    if (!fact.identity && !fact.appearance && !fact.personality && !fact.background && !fact.abilityAdd && !fact.knowledgeAdd) {
      return null;
    }
    return fact;
  }
  if (type === 'time') {
    const mode = 读字符串(raw.mode || raw.模式);
    const normalizedMode = ({
      不变: 'no_change',
      无变化: 'no_change',
      推进: 'elapsed',
      耗时: 'elapsed',
      设定时间: 'set_time',
      同日设定: 'set_time',
      跨夜: 'overnight',
      次日: 'next_day',
      跨日: 'next_day',
    } as Record<string, string>)[mode] ?? mode;
    if (!['no_change', 'elapsed', 'set_time', 'overnight', 'next_day'].includes(normalizedMode)) return null;
    return {
      type: 'time',
      mode: normalizedMode as 'no_change' | 'elapsed' | 'set_time' | 'overnight' | 'next_day',
      minutes: 数字(raw.minutes ?? raw.分钟),
      targetTime: 读字符串(raw.targetTime || raw.目标时间 || raw.time || raw.时间) || undefined,
      evidence: 读字符串(raw.evidence || raw.证据) || undefined,
    };
  }
  if (type === 'location') {
    const location = 读字符串(raw.location || raw.地点);
    if (!location) return null;
    return { type: 'location', location, evidence: 读字符串(raw.evidence || raw.证据) || undefined };
  }
  if (type === 'npc') {
    const id = 读字符串(raw.id);
    const name = 读字符串(raw.name || raw.姓名 || raw.名称) || npcNameFromId(id);
    if (!name) return null;
    const tier = 读字符串(raw.tier || raw.阶位);
    const relation = 读字符串(raw.relation || raw.关系);
    return {
      type: 'npc',
      id: id || undefined,
      name,
      alias: 读字符串(raw.alias || raw.别名) || undefined,
      tier: tier === 'companion' || tier === 'extra' ? tier : undefined,
      affinityDelta: 数字(raw.affinityDelta ?? raw.好感变化),
      affinitySet: 数字(raw.affinitySet ?? raw.好感度),
      relation: NPC_RELATIONS.has(relation as NPC关系类型) ? relation : undefined,
      following: typeof raw.following === 'boolean' ? raw.following : typeof raw.同行 === 'boolean' ? raw.同行 : undefined,
      appearance: 读字符串(raw.appearance || raw.外貌) || undefined,
      clothing: 读字符串(raw.clothing || raw.穿着) || undefined,
      speechStyle: 读字符串(raw.speechStyle || raw.说话方式) || undefined,
      personality: 读字符串(raw.personality || raw.性格) || undefined,
      intro: 读字符串(raw.intro || raw.介绍) || undefined,
      playerAddress: 读字符串(raw.playerAddress || raw.对玩家称呼) || undefined,
      memory: 读取记忆摘要(raw.memory ?? raw.同行记忆 ?? raw.记忆) || undefined,
      evidence: 读字符串(raw.evidence || raw.证据) || undefined,
    };
  }
  if (type === 'item') {
    const action = 归一化物品动作(raw.action || raw.动作);
    const category = 归一化物品分类(raw.category || raw.类别);
    const name = 读字符串(raw.name || raw.名称);
    if (action !== 'gain' || !category || !name) return null;
    if (!ITEM_CATEGORIES.has(category as 物品分类)) return null;
    const quality = 读字符串(raw.quality || raw.品质);
    const source = 读字符串(raw.source || raw.来源);
    const narrativeEffectsRaw = raw.narrativeEffects ?? raw.叙事效果;
    return {
      type: 'item',
      action: 'gain',
      category: category as 物品分类,
      name,
      description: 读字符串(raw.description || raw.描述) || undefined,
      quantity: 数字(raw.quantity ?? raw.数量),
      quality: ITEM_QUALITIES.has(quality as 物品品质) ? quality as 物品品质 : undefined,
      stackable: typeof raw.stackable === 'boolean' ? raw.stackable : typeof raw.可堆叠 === 'boolean' ? raw.可堆叠 : undefined,
      source: ['剧情掉落', '任务奖励', '商店', '打造', '其它'].includes(source) ? source as never : undefined,
      sourceDescription: 读字符串(raw.sourceDescription || raw.来源描述) || undefined,
      narrativeEffects: Array.isArray(narrativeEffectsRaw)
        ? narrativeEffectsRaw.filter((item: unknown): item is string => typeof item === 'string')
        : undefined,
      evidence: 读字符串(raw.evidence || raw.证据) || undefined,
    };
  }
  if (type === 'world_event') {
    const text = 读字符串(raw.text || raw.内容 || raw.事件);
    if (!text) return null;
    return { type: 'world_event', text, evidence: 读字符串(raw.evidence || raw.证据) || undefined };
  }
  if (type === 'phone_seed') {
    const title = 读字符串(raw.title || raw.标题);
    const context = 读字符串(raw.context || raw.上下文 || raw.内容);
    if (!title || !context) return null;
    const targetType = 读字符串(raw.targetType || raw.目标类型);
    const triggerType = 归一化触发类型(raw.triggerType || raw.触发类型);
    const priority = 归一化优先级(raw.priority || raw.优先级);
    const relatedNpcIdsRaw = raw.relatedNpcIds ?? raw.关联NPCID;
    return {
      type: 'phone_seed',
      targetType: targetType === 'group' ? 'group' : 'private',
      targetId: 读字符串(raw.targetId || raw.目标ID) || undefined,
      targetName: 读字符串(raw.targetName || raw.目标名称) || undefined,
      title,
      context,
      triggerType: PHONE_TRIGGER_TYPES.has(triggerType as 主动来信类型) ? triggerType as 主动来信类型 : undefined,
      priority: PHONE_PRIORITIES.has(priority as 主动来信优先级) ? priority as 主动来信优先级 : undefined,
      relatedNpcIds: Array.isArray(relatedNpcIdsRaw)
        ? relatedNpcIdsRaw.filter((item: unknown): item is string => typeof item === 'string')
        : undefined,
      evidence: 读字符串(raw.evidence || raw.证据) || undefined,
    };
  }
  return null;
}

export function parseVariableFacts(rawText: string): { facts: 变量事实[]; parseErrors: string[] } {
  const facts: 变量事实[] = [];
  const parseErrors: string[] = [];
  const blockMatch = rawText.match(/<变量事实>([\s\S]*?)<\/变量事实>/);
  if (!blockMatch) return { facts, parseErrors };

  const block = 清理事实块(blockMatch[1]);
  if (!block) return { facts, parseErrors };

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (err) {
    parseErrors.push(`变量事实 JSON 无法解析：${err instanceof Error ? err.message : String(err)}`);
    return { facts, parseErrors };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : 是对象(parsed) && Array.isArray(parsed.facts)
      ? parsed.facts
      : null;
  if (!list) {
    parseErrors.push('变量事实必须是数组，或形如 {"facts":[...]} 的对象');
    return { facts, parseErrors };
  }

  list.forEach((item, index) => {
    const fact = 归一化事实(item);
    if (fact) facts.push(fact);
    else parseErrors.push(`变量事实第 ${index + 1} 条无法识别或缺少必填字段`);
  });

  return { facts, parseErrors };
}

function 分钟序数(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function 格式化分钟(total: number): string {
  const safe = ((Math.trunc(total) % 1440) + 1440) % 1440;
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function 有跨日证据(text: string | undefined): boolean {
  return Boolean(text && /次日|第二天|翌日|隔天|跨日|跨夜|过夜|一夜|睡醒|醒来|凌晨|清晨/.test(text));
}

function npcIdFromName(name: string): string {
  const canonical = matchCanonical(name);
  const map: Record<string, string> = {
    三月七: 'march7th',
    丹恒: 'danheng',
    姬子: 'himeko',
    瓦尔特: 'welt',
    帕姆: 'pompom',
    黑塔: 'herta',
    艾丝妲: 'asta',
    阿兰: 'arlan',
    星: 'stelle',
    穹: 'caelus',
  };
  const key = canonical ? map[canonical.name] ?? canonical.name : name;
  return `npc_${key.toLowerCase().replace(/\s+/g, '_').replace(/[^\w一-龥]/g, '')}`;
}

function findNpc(records: NPC记录[], id: string, name: string): NPC记录 | undefined {
  const targetCanonical = matchCanonical(name)?.name;
  return records.find((npc) =>
    npc.id === id ||
    npc.姓名 === name ||
    npc.别名 === name ||
    (Boolean(targetCanonical) && matchCanonical(npc.姓名)?.name === targetCanonical),
  );
}

function 数组已有文本(value: unknown, text: string): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim() === text.trim());
}

function resolvePhoneTargetId(fact: Extract<变量事实, { type: 'phone_seed' }>, npcs: NPC记录[]): string | null {
  if (fact.targetId?.trim()) return fact.targetId.trim();
  if (fact.targetName?.trim()) {
    const id = npcIdFromName(fact.targetName.trim());
    const existing = findNpc(npcs, id, fact.targetName.trim());
    return existing?.id ?? id;
  }
  const related = fact.relatedNpcIds?.find((id) => id.trim());
  return related?.trim() ?? null;
}

export function factsToVariableCommands(
  facts: 变量事实[],
  state: VariableState,
  turn: number,
): { commands: 变量命令[]; notes: string[]; warnings: string[] } {
  const commands: 变量命令[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  const world = state.世界 as 世界状态;
  const npcs = (state.NPC as NPC记录[]) ?? [];

  const push = (command: 变量命令) => commands.push(command);

  for (const fact of facts) {
    if (fact.type === 'traveler_profile') {
      if (fact.identity) push({ action: 'set', key: '旅人.身份', value: fact.identity });
      if (fact.appearance) push({ action: 'set', key: '旅人.外貌', value: fact.appearance });
      if (fact.personality) push({ action: 'set', key: '旅人.性格', value: fact.personality });
      if (fact.background) push({ action: 'set', key: '旅人.背景', value: fact.background });
      fact.abilityAdd?.forEach((ability) => {
        if (!数组已有文本((state.旅人 as { 能力?: unknown }).能力, ability)) push({ action: 'push', key: '旅人.能力', value: ability });
      });
      fact.knowledgeAdd?.forEach((knowledge) => {
        if (!数组已有文本((state.旅人 as { 专长知识?: unknown }).专长知识, knowledge)) push({ action: 'push', key: '旅人.专长知识', value: knowledge });
      });
      continue;
    }

    if (fact.type === 'time') {
      const current = 分钟序数(world?.当前时间);
      if (fact.mode === 'no_change') continue;
      if (fact.mode === 'elapsed') {
        const delta = Math.max(1, Math.min(30, Math.trunc(fact.minutes ?? 3)));
        if (current !== null) push({ action: 'set', key: '世界.当前时间', value: 格式化分钟(current + delta) });
        else warnings.push('time(elapsed) 已忽略：当前时间不是 HH:mm，无法计算推进。');
        continue;
      }
      if (fact.mode === 'set_time') {
        const next = 分钟序数(fact.targetTime);
        if (next === null) {
          warnings.push(`time(set_time) 已忽略：无法识别目标时间 ${fact.targetTime ?? '空'}。`);
          continue;
        }
        if (next !== null && current !== null && next < current && 有跨日证据(fact.evidence)) {
          const nextDate = 推进琥珀日期(world?.当前日期 ?? '');
          const aligned = 对齐世界日期与天数((world?.开拓天数 ?? 1) + 1, nextDate);
          push({ action: 'set', key: '世界.开拓天数', value: aligned.开拓天数 });
          push({ action: 'set', key: '世界.当前日期', value: aligned.当前日期 });
          push({ action: 'set', key: '世界.当前时间', value: fact.targetTime });
          continue;
        }
        if (current !== null && next < current) {
          warnings.push(`time(set_time) 已忽略疑似同日时间回退：当前 ${world?.当前时间 ?? '未知'}，事实目标 ${fact.targetTime}；若剧情跨日，请输出 mode=next_day/overnight 并写明证据。`);
          continue;
        }
        push({ action: 'set', key: '世界.当前时间', value: fact.targetTime });
        continue;
      }
      if (fact.mode === 'overnight' || fact.mode === 'next_day') {
        const nextDate = 推进琥珀日期(world?.当前日期 ?? '');
        const aligned = 对齐世界日期与天数((world?.开拓天数 ?? 1) + 1, nextDate);
        push({ action: 'set', key: '世界.开拓天数', value: aligned.开拓天数 });
        push({ action: 'set', key: '世界.当前日期', value: aligned.当前日期 });
        if (fact.targetTime) push({ action: 'set', key: '世界.当前时间', value: fact.targetTime });
        else warnings.push(`time(${fact.mode}) 缺少 targetTime：已推进日期和天数，但当前时间保持 ${world?.当前时间 ?? '未知'}。`);
        continue;
      }
    }

    if (fact.type === 'location') {
      push({ action: 'set', key: '世界.当前地点', value: fact.location });
      continue;
    }

    if (fact.type === 'npc') {
      const id = fact.id?.trim() || npcIdFromName(fact.name);
      const existing = findNpc(npcs, id, fact.name);
      if (!existing) {
        const canonical = matchCanonical(fact.name);
        push({
          action: 'push',
          key: 'NPC',
          value: {
            id,
            姓名: canonical?.name ?? fact.name,
            别名: fact.alias,
            阶位: inferNpcTier(fact, canonical),
            好感度: Math.max(-100, Math.min(100, Math.trunc(fact.affinitySet ?? fact.affinityDelta ?? 0))),
            关系: fact.relation ?? 'acquaintance',
            同行: fact.following ?? false,
            初见回合: turn,
            最近回合: turn,
            对玩家称呼: fact.playerAddress,
            外貌: fact.appearance ?? canonical?.appearance,
            穿着: fact.clothing,
            说话方式: fact.speechStyle,
            性格: fact.personality ?? canonical?.personality,
            介绍: fact.intro ?? (canonical ? `${canonical.name}是当前剧情中出现的原著角色。` : ''),
            同行记忆: fact.memory ? [{
              id: `npc_mem_${id}_${turn}_${Math.random().toString(36).slice(2, 6)}`,
              回合: turn,
              摘要: fact.memory,
              来源: '变量',
              关联NPCID: [id],
            }] : [],
            备注: fact.evidence ? [fact.evidence] : [],
            原著角色: Boolean(canonical),
          },
        });
      } else {
        const key = `NPC[id=${existing.id}]`;
        push({ action: 'set', key: `${key}.最近回合`, value: turn });
        if (typeof fact.affinitySet === 'number') push({ action: 'set', key: `${key}.好感度`, value: fact.affinitySet });
        else if (typeof fact.affinityDelta === 'number') push({ action: 'add', key: `${key}.好感度`, value: fact.affinityDelta });
        if (fact.relation) push({ action: 'set', key: `${key}.关系`, value: fact.relation });
        if (typeof fact.following === 'boolean') push({ action: 'set', key: `${key}.同行`, value: fact.following });
        if (fact.appearance) push({ action: 'set', key: `${key}.外貌`, value: fact.appearance });
        if (fact.clothing) push({ action: 'set', key: `${key}.穿着`, value: fact.clothing });
        if (fact.speechStyle) push({ action: 'set', key: `${key}.说话方式`, value: fact.speechStyle });
        if (fact.personality) push({ action: 'set', key: `${key}.性格`, value: fact.personality });
        if (fact.intro) push({ action: 'set', key: `${key}.介绍`, value: fact.intro });
        if (fact.playerAddress) push({ action: 'set', key: `${key}.对玩家称呼`, value: fact.playerAddress });
        if (fact.memory) push({
          action: 'push',
          key: `${key}.同行记忆`,
          value: {
            id: `npc_mem_${existing.id}_${turn}_${Math.random().toString(36).slice(2, 6)}`,
            回合: turn,
            摘要: fact.memory,
            来源: '变量',
            关联NPCID: [existing.id],
          },
        });
      }
      continue;
    }

    if (fact.type === 'item') {
      push({
        action: 'push',
        key: '旅人.背包',
        value: {
          类别: fact.category,
          名称: fact.name,
          描述: fact.description || fact.evidence || `${fact.name}。`,
          数量: fact.quantity ?? 1,
          品质: fact.quality ?? '蓝',
          可堆叠: fact.stackable,
          来源: fact.source ?? '剧情掉落',
          来源描述: fact.sourceDescription ?? fact.evidence,
          叙事效果: fact.narrativeEffects,
          获得时间: `${world?.当前日期 || ''} ${world?.当前时间 || ''}`.trim(),
        },
      });
      continue;
    }

    if (fact.type === 'world_event') {
      push({ action: 'push', key: '世界.全局事件', value: fact.text });
      continue;
    }

    if (fact.type === 'phone_seed') {
      const targetId = resolvePhoneTargetId(fact, npcs);
      if (!targetId) {
        warnings.push(`phone_seed 已忽略：缺少 targetId/targetName/relatedNpcIds，无法确定来信目标（${fact.title}）。`);
        continue;
      }
      push({
        action: 'push',
        key: '手机.messageSeeds',
        value: {
          id: `phone_seed_${turn}_${Math.random().toString(36).slice(2, 8)}`,
          turn,
          source: 'main_story',
          triggerType: fact.triggerType ?? 'custom',
          priority: fact.priority ?? 'normal',
          targetType: fact.targetType ?? 'private',
          targetId,
          title: fact.title,
          context: fact.context,
          relatedNpcIds: fact.relatedNpcIds ?? [],
          expiresAfterTurns: 6,
          status: 'pending',
        },
      });
    }
  }

  return { commands, notes, warnings };
}
