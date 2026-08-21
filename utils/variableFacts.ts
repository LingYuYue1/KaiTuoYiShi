import type { 变量事实, 变量命令 } from '@/models/variableCommand';
import { createStableEntityId } from '@/utils/stableFingerprint';
import type { VariableState } from './variableRegistry';
import type { 世界状态 } from '@/models/world';
import { 对齐世界日期与天数, 推进琥珀日期 } from '@/models/world';
import type { NPC记录, NPC关系类型, 约定结构, 约定状态 } from '@/models/npc';
import { 获取NPC关系阶段, 获取NPC兼容关系, 限制NPC好感度, 是NPC泛称姓名, 筛选活跃NPC } from '@/models/npc';
import { matchCanonical } from '@/data/canonicalCharacters';
import type { 物品分类, 物品品质 } from '@/models/inventory';
import type { 手机系统, 主动来信类型, 主动来信优先级 } from '@/models/phone';
import { extractJsonLikeText, parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';
import { 归一化天气ID } from '@/data/weatherRules';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';

const ITEM_CATEGORIES = new Set<物品分类>(['food', 'consumable', 'lightcone', 'weapon', 'clothing', 'accessory', 'memento', 'key']);
const ITEM_QUALITIES = new Set<物品品质>(['蓝', '紫', '金']);
const NPC_RELATIONS = new Set<NPC关系类型>(['stranger', 'acquaintance', 'friend', 'close', 'rival', 'enemy']);
const PHONE_TRIGGER_TYPES = new Set<主动来信类型>(['injury', 'victory', 'defeat', 'location_change', 'important_item', 'relationship', 'news', 'quest', 'time', 'custom']);
const PHONE_PRIORITIES = new Set<主动来信优先级>(['low', 'normal', 'high', 'urgent']);
const NSFW_AGE_VALUES = new Set(['adult', 'unknown', 'minor_blocked']);
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
  天气: 'weather',
  weather: 'weather',
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
  NSFW档案: 'nsfw_archive',
  nsfw: 'nsfw_archive',
  nsfw_archive: 'nsfw_archive',
  nsfwArchive: 'nsfw_archive',
  约定: 'agreement',
  agreement: 'agreement',
  约定状态: 'agreement_status',
  约定状态变更: 'agreement_status',
  agreement_status: 'agreement_status',
  agreementStatus: 'agreement_status',
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
  return extractJsonLikeText(block, 'any');
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
  const list = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
  return list.length ? list : undefined;
}

function 读取字符串对象(value: unknown, allowedKeys: string[]): Record<string, string> | undefined {
  if (!是对象(value)) return undefined;
  const output: Record<string, string> = {};
  for (const key of allowedKeys) {
    const text = 读字符串(value[key]);
    if (text) output[key] = text;
  }
  return Object.keys(output).length ? output : undefined;
}

function 归一化年龄确认(value: unknown): 'adult' | 'unknown' | 'minor_blocked' | undefined {
  const text = 读字符串(value);
  const normalized = ({
    成人: 'adult',
    成年: 'adult',
    未知: 'unknown',
    年龄不明: 'unknown',
    未成年阻止: 'minor_blocked',
    未成年: 'minor_blocked',
    禁止: 'minor_blocked',
  } as Record<string, string>)[text] ?? text;
  return NSFW_AGE_VALUES.has(normalized) ? normalized as 'adult' | 'unknown' | 'minor_blocked' : undefined;
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

function 归一化NPC阶位(value: unknown): 'companion' | 'extra' | undefined {
  const text = 读字符串(value).toLowerCase();
  if (['companion', '伙伴', '重要伙伴', '同行'].includes(text)) return 'companion';
  if (['extra', '路人', '普通路人', '背景'].includes(text)) return 'extra';
  return undefined;
}

function 有NPC互动信号(fact: Extract<变量事实, { type: 'npc' }>): boolean {
  return Boolean(
    fact.memory || fact.recentInteraction || fact.following ||
    typeof fact.affinityDelta === 'number' || typeof fact.affinitySet === 'number' ||
    fact.sharedExperiences?.length || fact.openItems?.length || fact.unresolvedConflicts?.length ||
    fact.mustRemember?.length || fact.doNotForget?.length || fact.longTermImpression || fact.relationshipStage,
  );
}

function inferNpcTier(
  fact: Extract<变量事实, { type: 'npc' }>,
  canonical: ReturnType<typeof matchCanonical>,
  existing?: NPC记录,
  projectedAffinity?: number,
  projectedInteractions?: number,
): 'companion' | 'extra' {
  if (existing?.手动阶位覆盖) return existing.手动阶位覆盖;
  if (fact.tier) return fact.tier;
  // 玩家明确创建的 custom NPC 保留自身阶位；不能因姓名恰好命中原著 alias 被自动晋升。
  if (existing?.NPC来源 === 'custom') return existing.阶位;
  if (canonical || existing?.原著角色 || fact.following) return 'companion';
  if (fact.relation && !['stranger', 'acquaintance'].includes(fact.relation)) return 'companion';
  // 深层关系信号：长期印象或显式关系阶段可晋升（优先级在好感度+互动双门槛之前）。
  if (fact.longTermImpression || fact.relationshipStage) return 'companion';
  if ((projectedAffinity ?? 0) >= 20 && (projectedInteractions ?? 0) >= 2) return 'companion';
  return existing?.阶位 ?? 'extra';
}

function 读取记忆摘要(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!是对象(value)) return '';
  return 读字符串(value.摘要 || value.summary || value.text || value.内容);
}

function pushNpcLedgerListCommands(
  push: (command: 变量命令) => void,
  key: string,
  field: '共同经历' | '未完成事项' | '未解决冲突' | '必须记得' | '禁止遗忘',
  incoming?: string[],
  existing?: string[],
) {
  if (!incoming?.length) return;
  const seen = new Set((existing ?? []).map((item) => item.trim()).filter(Boolean));
  for (const item of incoming) {
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    push({ action: 'push', key: `${key}.${field}`, value: text });
  }
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
  if (type === 'weather') {
    const weather = 读字符串(raw.weather || raw.天气);
    if (!weather) return null;
    return { type: 'weather', weather, evidence: 读字符串(raw.evidence || raw.证据) || undefined };
  }
  if (type === 'npc') {
    const id = 读字符串(raw.id);
    const name = 读字符串(raw.name || raw.姓名 || raw.名称) || npcNameFromId(id);
    if (!name) return null;
    const tier = 归一化NPC阶位(raw.tier || raw.阶位);
    const relation = 读字符串(raw.relation || raw.关系);
    return {
      type: 'npc',
      id: id || undefined,
      name,
      alias: 读字符串(raw.alias || raw.别名) || undefined,
      tier,
      job: 读字符串(raw.job || raw.职务 || raw.职业 || raw.role || raw.occupation) || undefined,
      affinityDelta: 数字(raw.affinityDelta ?? raw.好感变化),
      affinitySet: 数字(raw.affinitySet ?? raw.好感度),
      relation: NPC_RELATIONS.has(relation as NPC关系类型) ? relation : undefined,
      intimateRelationship: typeof raw.intimateRelationship === 'boolean'
        ? raw.intimateRelationship
        : typeof raw.亲密关系 === 'boolean'
          ? raw.亲密关系
          : undefined,
      following: typeof raw.following === 'boolean' ? raw.following : typeof raw.同行 === 'boolean' ? raw.同行 : undefined,
      gender: raw.gender === '男' || raw.gender === '女' || raw.gender === '其他'
        ? raw.gender
        : raw.性别 === '男' || raw.性别 === '女' || raw.性别 === '其他'
          ? raw.性别
          : undefined,
      appearance: 读字符串(raw.appearance || raw.外貌) || undefined,
      clothing: 读字符串(raw.clothing || raw.穿着) || undefined,
      speechStyle: 读字符串(raw.speechStyle || raw.说话方式) || undefined,
      personality: 读字符串(raw.personality || raw.性格) || undefined,
      intro: 读字符串(raw.intro || raw.介绍) || undefined,
      playerAddress: 读字符串(raw.playerAddress || raw.对玩家称呼) || undefined,
      memory: 读取记忆摘要(raw.memory ?? raw.同行记忆 ?? raw.记忆) || undefined,
      recentInteraction: 读字符串(raw.recentInteraction || raw.最近互动) || undefined,
      longTermImpression: 读字符串(raw.longTermImpression || raw.对玩家长期印象 || raw.长期印象) || undefined,
      relationshipStage: 读字符串(raw.relationshipStage || raw.当前关系阶段 || raw.关系阶段) || undefined,
      sharedExperiences: 字符串数组(raw.sharedExperiences ?? raw.共同经历),
      openItems: 字符串数组(raw.openItems ?? raw.未完成事项 ?? raw.未完成承诺),
      unresolvedConflicts: 字符串数组(raw.unresolvedConflicts ?? raw.未解决冲突 ?? raw.冲突),
      mustRemember: 字符串数组(raw.mustRemember ?? raw.必须记得),
      doNotForget: 字符串数组(raw.doNotForget ?? raw.禁止遗忘),
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
  if (type === 'nsfw_archive') {
    const npcId = 读字符串(raw.npcId || raw.NPCID || raw.id);
    const npcName = 读字符串(raw.npcName || raw.name || raw.姓名 || raw.名称) || npcNameFromId(npcId);
    if (!npcName) return null;
    const femaleBody = 读取字符串对象(raw.femaleBodyArchive ?? raw.女性身体档案, ['胸部', '女性私处', '后庭', '体态', '体味']);
    const maleBody = 读取字符串对象(raw.maleBodyArchive ?? raw.男性身体档案, ['男性器', '后庭', '体态', '体味']);
    return {
      type: 'nsfw_archive',
      npcId: npcId || undefined,
      npcName,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : typeof raw.启用 === 'boolean' ? raw.启用 : undefined,
      ageConfirm: 归一化年龄确认(raw.ageConfirm ?? raw.年龄确认),
      intimacyStage: 读字符串(raw.intimacyStage || raw.亲密阶段) || undefined,
      boundaries: 读字符串或数组(raw.boundaries ?? raw.边界) || undefined,
      preferences: 字符串数组(raw.preferences ?? raw.偏好),
      sensitivePoints: 字符串数组(raw.sensitivePoints ?? raw.敏感点),
      taboos: 字符串数组(raw.taboos ?? raw.禁忌),
      femaleBodyArchive: femaleBody,
      maleBodyArchive: maleBody,
      experiences: 字符串数组(raw.experiences ?? raw.经历),
      longTermFacts: 字符串数组(raw.longTermFacts ?? raw.长期事实),
      tags: 字符串数组(raw.tags ?? raw.标签),
      notes: 读字符串或数组(raw.notes ?? raw.备注) || undefined,
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
    parsed = parseJsonWithRepair(block, 'any');
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
  const direct = records.find((npc) =>
    npc.id === id ||
    npc.姓名 === name ||
    npc.别名 === name,
  );
  if (direct) return direct;
  const targetCanonical = matchCanonical(name)?.name;
  return records.find((npc) =>
    npc.NPC来源 !== 'custom' &&
    Boolean(targetCanonical) && matchCanonical(npc.姓名)?.name === targetCanonical,
  );
}

function isCanonicalNpcPersonalityProtected(npc: NPC记录 | undefined, name: string): boolean {
  return Boolean(
    npc?.NPC来源 !== 'custom' && (npc?.原著角色 || matchCanonical(npc?.姓名 ?? name) || matchCanonical(name)),
  );
}

function 数组已有文本(value: unknown, text: string): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim() === text.trim());
}

function mergeUniqueTexts(...groups: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const group of groups) {
    for (const item of group ?? []) {
      const text = item.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      output.push(text);
    }
  }
  return output.length ? output : undefined;
}

function mergePreferredText(current: unknown, incoming: unknown): string | undefined {
  const next = typeof incoming === 'string' ? incoming.trim() : '';
  if (next) return next;
  const existing = typeof current === 'string' ? current.trim() : '';
  return existing || undefined;
}

function buildNsfwArchiveUpdate(existing: NPC记录, fact: Extract<变量事实, { type: 'nsfw_archive' }>): Record<string, unknown> {
  const current = existing.NSFW档案 ?? {};
  const archive: Record<string, unknown> = {};
  // NSFW 年龄门禁已解除：年龄确认降级为纯展示信息，不再限制档案写入。
  // 落库改为字段级合并（existing 优先，fact 补充），不再强制塞入保守基线占位文案。
  archive.enabled = fact.enabled ?? current.enabled ?? true;
  archive.年龄确认 = fact.ageConfirm ?? current.年龄确认 ?? 'unknown';
  archive.亲密阶段 = fact.intimacyStage ?? current.亲密阶段 ?? (existing.亲密关系 ? '已建立亲密关系（私密细节未记录）' : '未建立');
  // 边界/备注只在 fact 或 existing 有值时写入，不再写保守基线默认长文。
  if (fact.boundaries) archive.边界 = fact.boundaries;
  else if (current.边界) archive.边界 = current.边界;
  const longTermFacts = mergeUniqueTexts(current.长期事实, fact.longTermFacts);
  if (longTermFacts?.length) archive.长期事实 = longTermFacts;
  const tags = mergeUniqueTexts(current.标签, fact.tags);
  if (tags?.length) archive.标签 = tags;
  const experiences = mergeUniqueTexts(current.经历, fact.experiences);
  if (experiences?.length) archive.经历 = experiences;
  const currentFemale = current.女性身体档案 ?? {};
  const currentMale = current.男性身体档案 ?? {};
  const femaleIncoming = fact.femaleBodyArchive ?? {};
  const maleIncoming = fact.maleBodyArchive ?? {};
  if (Object.keys(femaleIncoming).length || Object.keys(currentFemale).length) {
    const femaleArchive = {
      胸部: mergePreferredText(currentFemale.胸部, femaleIncoming.胸部),
      女性私处: mergePreferredText(currentFemale.女性私处, femaleIncoming.女性私处),
      后庭: mergePreferredText(currentFemale.后庭, femaleIncoming.后庭),
      体态: mergePreferredText(currentFemale.体态, femaleIncoming.体态),
      体味: mergePreferredText(currentFemale.体味, femaleIncoming.体味),
    };
    if (pruneEmptyObject(femaleArchive)) archive.女性身体档案 = femaleArchive;
  }
  if (Object.keys(maleIncoming).length || Object.keys(currentMale).length) {
    const maleArchive = {
      男性器: mergePreferredText(currentMale.男性器, maleIncoming.男性器),
      后庭: mergePreferredText(currentMale.后庭, maleIncoming.后庭),
      体态: mergePreferredText(currentMale.体态, maleIncoming.体态),
      体味: mergePreferredText(currentMale.体味, maleIncoming.体味),
    };
    if (pruneEmptyObject(maleArchive)) archive.男性身体档案 = maleArchive;
  }
  if (fact.notes) archive.备注 = fact.notes;
  else if (current.备注) archive.备注 = current.备注;
  return archive;
}

function pruneEmptyObject<T extends Record<string, unknown>>(obj: T): T | undefined {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string' && !value.trim()) delete obj[key];
  }
  return Object.keys(obj).length ? obj : undefined;
}

const NON_INVENTORY_INFORMATION_RE = /(坐标|座标|位置|地点|方位|路线|路径|权限$|访问权限|通行权限|许可$|口令|密码|暗号|线索|情报|消息|讯息|资料|记录|名单|名单信息|地址|坐标点)/;
const PHYSICAL_INFORMATION_CARRIER_RE = /(卡|钥匙|钥|芯片|终端|地图|纸条|便签|信件|文书|档案袋|票|通行证|徽章|铭牌|印章|玉牌|玉兆|令牌|样本|碎片|装置|模块|硬盘|数据盘|存储器)/;

function 是非背包信息物品(input: {
  name: string;
  description?: string;
  evidence?: string;
  sourceDescription?: string;
}): boolean {
  const name = input.name.trim();
  const haystack = [name, input.description, input.evidence, input.sourceDescription].filter(Boolean).join(' ');
  if (!NON_INVENTORY_INFORMATION_RE.test(haystack)) return false;
  return !PHYSICAL_INFORMATION_CARRIER_RE.test(name);
}

function resolvePhoneTargetId(
  fact: Extract<变量事实, { type: 'phone_seed' }>,
  npcs: NPC记录[],
  allNpcs: NPC记录[] = npcs,
): string | null {
  if (fact.targetId?.trim()) return fact.targetId.trim();
  if (fact.targetName?.trim()) {
    const id = npcIdFromName(fact.targetName.trim());
    const existing = findNpc(npcs, id, fact.targetName.trim());
    if (existing) return existing.id;
    const archived = allNpcs.find((npc) =>
      npc.归档 && (npc.姓名 === fact.targetName?.trim() || npc.别名 === fact.targetName?.trim()),
    );
    return archived?.id ?? id;
  }
  const related = fact.relatedNpcIds?.find((id) => id.trim());
  if (related?.trim()) return related.trim();
  // 兜底:从 title/context/evidence 文本里匹配已知 NPC 姓名。
  // AI 经常只写 context 不写 targetName,导致 phone_seed 被丢弃。
  // 优先匹配已登记的 NPC,其次匹配经典角色(三月七/丹恒等)。
  const haystack = `${fact.title ?? ''}\n${fact.context ?? ''}\n${fact.evidence ?? ''}`;
  for (const npc of npcs) {
    const name = npc.姓名?.trim();
    if (name && name.length >= 2 && haystack.includes(name)) {
      return npc.id;
    }
    const alias = npc.别名?.trim();
    if (alias && alias.length >= 2 && haystack.includes(alias)) {
      return npc.id;
    }
  }
  const archivedMention = allNpcs.find((npc) => {
    if (!npc.归档) return false;
    return [npc.姓名, npc.别名].some((name) => Boolean(name && name.length >= 2 && haystack.includes(name)));
  });
  if (archivedMention) return archivedMention.id;
  // 经典角色兜底:即使 NPC 列表里没有,也允许生成种子(后续 PhoneModal 会自动创建联系人)
  const canonicalNames = ['三月七', '丹恒', '姬子', '瓦尔特', '帕姆', '黑塔', '艾丝妲', '阿兰', '星', '穹'];
  for (const name of canonicalNames) {
    if (haystack.includes(name)) {
      return npcIdFromName(name);
    }
  }
  return null;
}

function normalizePhoneSeedComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'\[\]（）()《》<>]/g, '')
    .trim();
}

function isPhoneSeedTextSimilar(a: string, b: string): boolean {
  const left = normalizePhoneSeedComparableText(a);
  const right = normalizePhoneSeedComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.includes(left)) return true;
  if (right.length >= 12 && left.includes(right)) return true;
  const shared = [...new Set(left)].filter((char) => right.includes(char)).length;
  return shared / Math.max(1, Math.min(left.length, right.length)) >= 0.82;
}

function hasRecentSimilarPhoneSeed(phone: 手机系统 | undefined, input: {
  turn: number;
  targetId: string;
  relatedNpcIds: string[];
  title: string;
  context: string;
  windowTurns?: number;
}): boolean {
  if (!phone?.messageSeeds?.length) return false;
  const windowTurns = Math.max(3, input.windowTurns ?? 12);
  const ids = new Set([input.targetId, ...input.relatedNpcIds].filter(Boolean));
  const currentText = `${input.title}\n${input.context}`;
  return phone.messageSeeds.some((seed) => {
    if (input.turn - (Number(seed.turn) || 0) > windowTurns) return false;
    const seedIds = new Set([seed.targetId, ...seed.relatedNpcIds].filter(Boolean));
    const sameTarget = [...ids].some((id) => seedIds.has(id) || seedIds.has(`npc_${id}`) || id === seed.targetId);
    if (!sameTarget) return false;
    return isPhoneSeedTextSimilar(currentText, `${seed.title}\n${seed.context}`);
  });
}

function hasRecentNonUrgentPhoneSeed(phone: 手机系统 | undefined, turn: number, windowTurns = 3): boolean {
  if (!phone?.messageSeeds?.length) return false;
  const safeWindow = Math.max(3, Math.trunc(windowTurns) || 3);
  return phone.messageSeeds.some((seed) => {
    if (seed.priority === 'urgent' || seed.priority === 'high') return false;
    return turn - (Number(seed.turn) || 0) < safeWindow;
  });
}

export function factsToVariableCommands(
  facts: 变量事实[],
  state: VariableState,
  turn: number,
  options: {
    phoneSeedsEnabled?: boolean;
    maxPhoneSeedsPerTurn?: number;
    /** 新批次使用稳定回合/消息身份，确保同一事实生成相同实体 ID。 */
    operationSourceId?: string;
  } = {},
): { commands: 变量命令[]; notes: string[]; warnings: string[] } {
  const commands: 变量命令[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  const world = state.世界 as 世界状态;
  const npcs = (state.NPC as NPC记录[]) ?? [];
  const phone = state.手机 as 手机系统 | undefined;
  const phoneSeedsEnabled = options.phoneSeedsEnabled !== false;
  const maxPhoneSeedsPerTurn = Math.max(0, Math.trunc(options.maxPhoneSeedsPerTurn ?? 2));
  const operationSourceId = options.operationSourceId?.trim() || `legacy_turn_${turn}`;
  let phoneSeedsWritten = 0;
  const interactionCountedNpcIds = new Set<string>();

  const push = (command: 变量命令) => commands.push(command);

  for (const fact of facts) {
    if (fact.type === 'traveler_profile') {
      notes.push('已静默忽略 traveler_profile：旅人核心档案由玩家手写维护，变量系统不再修改身份、外貌、性格、背景、能力或专长知识。');
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

    if (fact.type === 'weather') {
      // 天气中文名/复合别名 → ID
      const weatherId = 归一化天气ID(fact.weather);
      if (weatherId) {
        push({ action: 'set', key: '世界.当前天气', value: weatherId });
      } else {
        warnings.push(`weather: 无法识别的天气名「${fact.weather}」，已忽略。`);
      }
      continue;
    }

    if (fact.type === 'npc') {
      const id = fact.id?.trim() || npcIdFromName(fact.name);
      const existing = findNpc(npcs, id, fact.name);
      const canonical = matchCanonical(fact.name);
      const interactionSignal = 有NPC互动信号(fact);
      if (!existing) {
        if (!canonical && 是NPC泛称姓名(fact.name)) {
          warnings.push(`NPC「${fact.name}」仅包含职业/身份泛称，未创建记录；请提供真实姓名，并把「${fact.name}」写入职务字段。`);
          continue;
        }
        const initialAffinity = 限制NPC好感度(fact.affinitySet ?? fact.affinityDelta ?? 0);
        push({
          action: 'push',
          key: 'NPC',
          value: {
            id,
            姓名: canonical?.name ?? fact.name,
            别名: fact.alias,
             阶位: inferNpcTier(fact, canonical, undefined, initialAffinity, interactionSignal ? 1 : 0),
             阶位来源: fact.tier || canonical ? 'ai' : 'auto',
             职务: fact.job,
             累计互动次数: interactionSignal ? 1 : 0,
            好感度: initialAffinity,
            关系: 获取NPC兼容关系(initialAffinity),
            亲密关系: fact.intimateRelationship ?? false,
            同行: fact.following ?? false,
            初见回合: turn,
            最近回合: turn,
            对玩家称呼: fact.playerAddress,
            性别: fact.gender ?? (canonical?.gender as import('@/models/npc').NPC性别 | undefined),
            外貌: fact.appearance ?? canonical?.appearance,
            穿着: fact.clothing,
            说话方式: fact.speechStyle,
            性格: canonical?.personality ?? fact.personality,
            介绍: fact.intro ?? (canonical ? `${canonical.name}是当前剧情中出现的原著角色。` : ''),
            同行记忆: fact.memory ? [{
              id: createStableEntityId('npc_mem', [operationSourceId, id, fact.memory]),
              回合: turn,
              摘要: fact.memory,
              来源: '变量',
              关联NPCID: [id],
              时间: [world?.当前日期, world?.当前时间].filter(Boolean).join(' ').trim() || undefined,
            }] : [],
            最近互动: fact.recentInteraction ?? fact.memory,
            对玩家长期印象: fact.longTermImpression,
            当前关系阶段: fact.relationshipStage ?? 获取NPC关系阶段(initialAffinity),
            共同经历: fact.sharedExperiences,
            未完成事项: fact.openItems,
            未解决冲突: fact.unresolvedConflicts,
            必须记得: fact.mustRemember,
            禁止遗忘: fact.doNotForget,
            备注: fact.evidence ? [fact.evidence] : [],
            原著角色: Boolean(canonical),
            NPC来源: canonical ? 'canonical' : 'unknown',
          },
        });
      } else {
        const key = `NPC[id=${existing.id}]`;
        push({ action: 'set', key: `${key}.最近回合`, value: turn });
        if (existing.归档) {
          push({ action: 'set', key: `${key}.归档`, value: false });
          push({ action: 'delete', key: `${key}.归档回合`, value: null });
        }
        if (interactionSignal && !interactionCountedNpcIds.has(existing.id)) {
          interactionCountedNpcIds.add(existing.id);
          push({ action: 'add', key: `${key}.累计互动次数`, value: 1 });
        }
        if (typeof fact.affinitySet === 'number') push({ action: 'set', key: `${key}.好感度`, value: fact.affinitySet });
        else if (typeof fact.affinityDelta === 'number') push({ action: 'add', key: `${key}.好感度`, value: fact.affinityDelta });
        if (fact.job) push({ action: 'set', key: `${key}.职务`, value: fact.job });
        if (fact.relation) push({ action: 'set', key: `${key}.关系`, value: fact.relation });
        if (existing.手动阶位覆盖) {
          // 玩家覆盖优先于 AI/自动晋升。
          push({ action: 'set', key: `${key}.阶位`, value: existing.手动阶位覆盖 });
        } else if (fact.tier) {
          push({ action: 'set', key: `${key}.阶位`, value: fact.tier });
          push({ action: 'set', key: `${key}.阶位来源`, value: 'ai' });
        } else {
          const projectedAffinity = typeof fact.affinitySet === 'number'
            ? fact.affinitySet
            : existing.好感度 + (fact.affinityDelta ?? 0);
          const projectedInteractions = (existing.累计互动次数 ?? 0) + (interactionSignal ? 1 : 0);
          if (inferNpcTier(fact, canonical, existing, projectedAffinity, projectedInteractions) === 'companion' && existing.阶位 !== 'companion') {
            push({ action: 'set', key: `${key}.阶位`, value: 'companion' });
            push({ action: 'set', key: `${key}.阶位来源`, value: 'auto' });
          }
        }
        if (typeof fact.intimateRelationship === 'boolean') push({ action: 'set', key: `${key}.亲密关系`, value: fact.intimateRelationship });
        if (typeof fact.following === 'boolean') push({ action: 'set', key: `${key}.同行`, value: fact.following });
        if (fact.gender) push({ action: 'set', key: `${key}.性别`, value: fact.gender });
        if (fact.appearance) push({ action: 'set', key: `${key}.外貌`, value: fact.appearance });
        if (fact.clothing) push({ action: 'set', key: `${key}.穿着`, value: fact.clothing });
        if (fact.speechStyle) push({ action: 'set', key: `${key}.说话方式`, value: fact.speechStyle });
        if (fact.personality) {
          if (isCanonicalNpcPersonalityProtected(existing, fact.name)) {
            notes.push(`已忽略 ${existing.姓名} 的 personality 更新：原著角色长期性格由智库人物主体资料校准，变量系统只记录本回合经历和关系变化。`);
          } else {
            push({ action: 'set', key: `${key}.性格`, value: fact.personality });
          }
        }
        if (fact.intro) push({ action: 'set', key: `${key}.介绍`, value: fact.intro });
        if (fact.playerAddress) push({ action: 'set', key: `${key}.对玩家称呼`, value: fact.playerAddress });
        if (fact.recentInteraction || fact.memory) push({ action: 'set', key: `${key}.最近互动`, value: fact.recentInteraction ?? fact.memory });
        if (fact.longTermImpression) push({ action: 'set', key: `${key}.对玩家长期印象`, value: fact.longTermImpression });
        // 关系阶段文本先写入账本；系统标准标签会在 NPC 归一化时按好感度重算，剧情自定义描述才会保留。
        if (fact.relationshipStage) push({ action: 'set', key: `${key}.当前关系阶段`, value: fact.relationshipStage });
        pushNpcLedgerListCommands(push, key, '共同经历', fact.sharedExperiences, existing.共同经历);
        pushNpcLedgerListCommands(push, key, '未完成事项', fact.openItems, existing.未完成事项);
        pushNpcLedgerListCommands(push, key, '未解决冲突', fact.unresolvedConflicts, existing.未解决冲突);
        pushNpcLedgerListCommands(push, key, '必须记得', fact.mustRemember, existing.必须记得);
        pushNpcLedgerListCommands(push, key, '禁止遗忘', fact.doNotForget, existing.禁止遗忘);
        if (fact.memory) push({
          action: 'push',
          key: `${key}.同行记忆`,
          value: {
            id: createStableEntityId('npc_mem', [operationSourceId, existing.id, fact.memory]),
            回合: turn,
            摘要: fact.memory,
            来源: '变量',
            关联NPCID: [existing.id],
            时间: [world?.当前日期, world?.当前时间].filter(Boolean).join(' ').trim() || undefined,
          },
        });
      }
      continue;
    }

    if (fact.type === 'agreement') {
      // 阶段1约定系统·写入环：从正文或recallContext提取约定，写入NPC记录.约定[]
      const id = fact.npcId?.trim() || npcIdFromName(fact.npcName);
      const existing = findNpc(npcs, id, fact.npcName);
      if (!existing) {
        warnings.push(`agreement 已忽略：找不到 NPC ${fact.npcName}，约定只写入已入档 NPC。`);
        continue;
      }
      const key = `NPC[id=${existing.id}]`;
      const newAgreement: 约定结构 = {
        id: createStableEntityId('agr', [operationSourceId, existing.id, fact.title, fact.content]),
        标题: fact.title,
        内容: fact.content,
        约定时间: fact.约定时间,
        当前状态: '等待中',
        后果: fact.后果,
        回合: turn,
        来源: '正文',
      };
      push({ action: 'push', key: `${key}.约定`, value: newAgreement });
      continue;
    }

    if (fact.type === 'agreement_status') {
      // 阶段1约定系统·清理环：约定履行/违约/作废后的状态变更
      const id = fact.npcId?.trim() || npcIdFromName(fact.npcName);
      const existing = findNpc(npcs, id, fact.npcName);
      if (!existing) {
        warnings.push(`agreement_status 已忽略：找不到 NPC ${fact.npcName}。`);
        continue;
      }
      const existingAgreements = existing.约定 ?? [];
      // 模糊匹配标题（精确匹配优先，其次包含匹配）
      let matchIdx = existingAgreements.findIndex((a) => a.标题 === fact.title);
      if (matchIdx < 0) {
        matchIdx = existingAgreements.findIndex(
          (a) => a.标题.includes(fact.title) || fact.title.includes(a.标题),
        );
      }
      if (matchIdx < 0) {
        warnings.push(`agreement_status 已忽略：在 ${existing.姓名} 的约定列表中找不到标题含"${fact.title}"的约定。`);
        continue;
      }
      const key = `NPC[id=${existing.id}]`;
      push({ action: 'set', key: `${key}.约定[${matchIdx}].当前状态`, value: fact.新状态 });

      // 阶段1补充·方案A软上限自动清理：已完结约定超过20条时，删除最老的
      // 已完结 = 当前状态 !== '等待中'（即已履行/已违约/已作废）
      // 保留最近20条已完结约定 + 全部等待中约定，更老的已完结约定物理删除
      const COMPLETED_AGREEMENT_KEEP = 20;
      const updatedAgreements = existingAgreements.map((a, idx) =>
        idx === matchIdx ? { ...a, 当前状态: fact.新状态 as 约定状态 } : a,
      );
      const completedAgreements = updatedAgreements
        .map((a, idx) => ({ ...a, _origIdx: idx }))
        .filter((a) => a.当前状态 !== '等待中')
        .sort((a, b) => b.回合 - a.回合); // 按回合降序，最近在前
      if (completedAgreements.length > COMPLETED_AGREEMENT_KEEP) {
        const toRemoveIdxs = new Set(
          completedAgreements.slice(COMPLETED_AGREEMENT_KEEP).map((a) => a._origIdx),
        );
        const keptAgreements = updatedAgreements.filter((_, idx) => !toRemoveIdxs.has(idx));
        push({ action: 'set', key: `${key}.约定`, value: keptAgreements });
        warnings.push(`agreement_status 自动清理：${existing.姓名} 的已完结约定超过 ${COMPLETED_AGREEMENT_KEEP} 条，已删除最老的 ${toRemoveIdxs.size} 条。`);
      }
      continue;
    }

    if (fact.type === 'nsfw_archive') {
      const id = fact.npcId?.trim() || npcIdFromName(fact.npcName);
      const existing = findNpc(npcs, id, fact.npcName);
      if (!existing) {
        warnings.push(`nsfw_archive 已忽略：找不到 NPC ${fact.npcName}，NSFW 档案只更新已入档 NPC。`);
        continue;
      }
      const blockedReason = getNsfwArchiveBlockReason(existing, fact.npcName);
      if (blockedReason) {
        warnings.push(`nsfw_archive 已忽略：${blockedReason}。`);
        continue;
      }
      const key = `NPC[id=${existing.id}].NSFW档案`;
      const archive = buildNsfwArchiveUpdate(existing, fact);
      if (fact.ageConfirm) archive.年龄确认 = fact.ageConfirm;
      if (fact.intimacyStage) archive.亲密阶段 = fact.intimacyStage;
      if (fact.boundaries) archive.边界 = fact.boundaries;
      if (fact.preferences?.length) archive.偏好 = fact.preferences;
      if (fact.sensitivePoints?.length) archive.敏感点 = fact.sensitivePoints;
      if (fact.taboos?.length) archive.禁忌 = fact.taboos;
      if (fact.femaleBodyArchive && Object.keys(fact.femaleBodyArchive).length) archive.女性身体档案 = fact.femaleBodyArchive;
      if (fact.maleBodyArchive && Object.keys(fact.maleBodyArchive).length) archive.男性身体档案 = fact.maleBodyArchive;
      if (fact.experiences?.length) archive.经历 = fact.experiences;
      if (fact.longTermFacts?.length) archive.长期事实 = fact.longTermFacts;
      if (fact.tags?.length) archive.标签 = fact.tags;
      if (fact.notes) archive.备注 = fact.notes;
      push({ action: 'set', key, value: archive });
      continue;
    }

    if (fact.type === 'item') {
      if (是非背包信息物品({
        name: fact.name,
        description: fact.description,
        evidence: fact.evidence,
        sourceDescription: fact.sourceDescription,
      })) {
        warnings.push(`item 已忽略：${fact.name} 是坐标/权限/线索/情报等信息，不是可放入背包的实体物品；请用 world_event、npc.memory 或剧情承接。`);
        continue;
      }
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
      if (!phoneSeedsEnabled || maxPhoneSeedsPerTurn <= 0) {
        warnings.push(`phone_seed 已忽略：手机主动来信种子已关闭或每回合上限为 0（${fact.title}）。`);
        continue;
      }
      if (phoneSeedsWritten >= maxPhoneSeedsPerTurn) {
        warnings.push(`phone_seed 已忽略：本回合来信种子已达到上限 ${maxPhoneSeedsPerTurn}（${fact.title}）。`);
        continue;
      }
      // 归档 NPC 不参与手机来信目标解析（恢复由 NPC 事实链触发）。
      const activeNpcs = 筛选活跃NPC(npcs);
      const targetId = resolvePhoneTargetId(fact, activeNpcs, npcs);
      if (!targetId) {
        warnings.push(`phone_seed 已忽略：缺少 targetId/targetName/relatedNpcIds，无法确定来信目标（${fact.title}）。`);
        continue;
      }
      const targetIsArchived = npcs.some(
        (npc) => (npc.id === targetId || `npc_${npc.id}` === targetId) && npc.归档 === true,
      );
      if (targetIsArchived) {
        warnings.push(`phone_seed 已忽略：来信目标 ${targetId} 已归档，不接受主动来信（${fact.title}）。`);
        continue;
      }
      const priority = fact.priority ?? 'normal';
      if ((priority === 'low' || priority === 'normal') && hasRecentNonUrgentPhoneSeed(phone, turn)) {
        warnings.push(`phone_seed 已忽略：近期已有普通主动来信，低频/普通来信进入全局冷却（${fact.title}）。`);
        continue;
      }
      const relatedNpcIds = Array.from(new Set([
        ...(fact.relatedNpcIds ?? []),
        targetId.startsWith('npc_') || targetId.startsWith('npc-') ? targetId : '',
      ].map((id) => id.trim()).filter(Boolean)));
      if (hasRecentSimilarPhoneSeed(phone, {
        turn,
        targetId,
        relatedNpcIds,
        title: fact.title,
        context: fact.context,
      })) {
        warnings.push(`phone_seed 已忽略：近期已有同对象同事件的主动来信，避免重复刷屏（${fact.title}）。`);
        continue;
      }
      push({
        action: 'push',
        key: '手机.messageSeeds',
        value: {
          id: createStableEntityId('phone_seed', [operationSourceId, targetId, fact.title, fact.context]),
          turn,
          source: 'main_story',
          triggerType: fact.triggerType ?? 'custom',
          priority,
          targetType: fact.targetType ?? 'private',
          targetId,
          title: fact.title,
          context: fact.context,
          relatedNpcIds,
          expiresAfterTurns: 6,
          status: 'pending',
        },
      });
      phoneSeedsWritten += 1;
    }
  }

  return { commands, notes, warnings };
}
