export type SystemKey = 'traveler' | 'world' | 'memory' | 'yiting' | 'phone' | 'npc' | 'news' | 'zhiku' | 'storyWeaving';
export type EditMode = 'fields' | 'json';
export type WritePolicy = 'writable' | 'manual' | 'readonly';
export const ARRAY_RENDER_BATCH_SIZE = 40;

export interface SystemMeta {
  key: SystemKey;
  label: string;
  rootLabel: string;
  desc: string;
  policy: WritePolicy;
  accent: string;
  hiddenFields?: string[];
}

export const SYSTEMS: SystemMeta[] = [
  {
    key: 'traveler',
    label: '旅人',
    rootLabel: '旅人',
    desc: '档案、命途、战技、背包',
    policy: 'writable',
    accent: 'rgb(var(--tj-accent-primary))',
    hiddenFields: ['属性', '主命途'],
  },
  { key: 'world', label: '世界', rootLabel: '世界', desc: '时间、地点、天数、全局事件', policy: 'writable', accent: '#9fd6ff' },
  { key: 'memory', label: '记忆', rootLabel: '记忆', desc: '即时、短期、中期、长期记忆', policy: 'manual', accent: '#b7e2b4' },
  { key: 'yiting', label: '忆庭', rootLabel: '忆庭', desc: '回忆档案与召回索引', policy: 'manual', accent: '#d4c5ff' },
  { key: 'phone', label: '手机', rootLabel: '手机', desc: '联系人、会话、来信种子', policy: 'writable', accent: '#86e6dd' },
  { key: 'npc', label: '伙伴', rootLabel: 'NPC', desc: '伙伴、路人、同行记忆', policy: 'writable', accent: '#ffc2d6' },
  { key: 'news', label: '周报', rootLabel: '新闻', desc: '新闻条目与事件档案', policy: 'manual', accent: '#ffdf8a' },
  { key: 'zhiku', label: '智库', rootLabel: '智库', desc: '原著资料与内置内容', policy: 'manual', accent: '#a5c8ff' },
  { key: 'storyWeaving', label: '剧情编织', rootLabel: '剧情编织', desc: '原著/自制剧情分解与注入', policy: 'manual', accent: '#f0b7ff' },
];

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** 把未知值转成摘要文本：字符串原样（空串回退），基础字面量转 String，其余回退默认文案。 */
export function displayText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return fallback;
}

export function omitHiddenFields(value: unknown, fields?: string[]): unknown {
  if (!fields?.length || !isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!fields.includes(key)) next[key] = item;
  }
  return next;
}

export function mergeHiddenFields(system: SystemMeta, original: unknown, draft: unknown): unknown {
  if (!system.hiddenFields?.length || !isRecord(original) || !isRecord(draft)) return draft;
  const next = { ...draft };
  for (const field of system.hiddenFields) {
    if (field in original) next[field] = original[field];
  }
  return next;
}

export function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text) return '""';
    return text.length > 46 ? `"${text.slice(0, 46)}..."` : `"${text}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `数组 ${value.length}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `字段 ${keys.length}`;
  }
  return `[${typeof value}]`;
}

// 从数组条目（NPC / 新闻）里提取一个可读标签，用于条目列表和详情标题。
export function summarizeArrayItemLabel(item: unknown): string {
  if (!isRecord(item)) {
    return typeof item === 'string' ? item : summarizeValue(item);
  }
  // NPC 优先 姓名/别名；新闻优先 标题。
  const name = readStrKey(item, ['姓名', '别名', '名称', 'title', '标题', 'id', 'ID']);
  const tier = readStrKey(item, ['阶位', 'tier']);
  const following = item['同行'] === true;
  const suffix = following ? ' · 同行' : tier ? ` · ${tier}` : '';
  return name ? `${name}${suffix}` : `条目 ${summarizeValue(item)}`;
}

export function readStrKey(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (typeof obj[k] === 'string' && (obj[k]).trim()) return (obj[k]).trim();
  }
  return '';
}

export function countValue(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return value === undefined || value === null ? 0 : 1;
}

export function inferDefaultValueFromSibling(items: unknown[]): unknown {
  const last = items[items.length - 1];
  if (last === undefined || last === null) return '';
  if (typeof last === 'string') return '';
  if (typeof last === 'number') return 0;
  if (typeof last === 'boolean') return false;
  if (Array.isArray(last)) return [];
  if (isRecord(last)) {
    const skeleton: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(last)) {
      if (typeof value === 'string') skeleton[key] = '';
      else if (typeof value === 'number') skeleton[key] = 0;
      else if (typeof value === 'boolean') skeleton[key] = false;
      else if (Array.isArray(value)) skeleton[key] = [];
      else if (isRecord(value)) skeleton[key] = {};
      else skeleton[key] = null;
    }
    return skeleton;
  }
  return '';
}

export function policyLabel(policy: WritePolicy): string {
  if (policy === 'writable') return '变量模型可写';
  if (policy === 'manual') return '手动维护';
  return '只读';
}

export function buildQuickStats(system: SystemMeta, value: unknown): string[] {
  if (system.key === 'traveler' && isRecord(value)) {
    return [
      `背包 ${Array.isArray(value.背包) ? value.背包.length : 0}`,
      `战技 ${Array.isArray(value.战技列表) ? value.战技列表.length : 0}`,
      `命途 ${Array.isArray(value.命途列表) ? value.命途列表.length : 0}`,
    ];
  }
  if (system.key === 'world' && isRecord(value)) {
    return [
      displayText(value.当前日期, '日期未定'),
      displayText(value.当前时间, '时间未定'),
      displayText(value.当前地点, '地点未定'),
      displayText(value.当前天气, '天气未定'),
    ];
  }
  if (system.key === 'phone' && isRecord(value)) {
    return [
      `联系人 ${Array.isArray(value.contacts) ? value.contacts.length : 0}`,
      `会话 ${Array.isArray(value.chats) ? value.chats.length : 0}`,
      `来信 ${Array.isArray(value.messageSeeds) ? value.messageSeeds.length : 0}`,
    ];
  }
  if (system.key === 'storyWeaving' && isRecord(value)) {
    const list = Array.isArray(value.系列列表) ? value.系列列表 : [];
    return [`系列 ${list.length}`, value.当前系列ID ? `当前 ${displayText(value.当前系列ID, '')}` : '未选择当前系列'];
  }
  if (Array.isArray(value)) return [`条目 ${value.length}`];
  if (isRecord(value)) return [`字段 ${Object.keys(value).length}`];
  return [summarizeValue(value)];
}
