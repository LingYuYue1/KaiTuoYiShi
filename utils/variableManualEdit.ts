import { 创建空角色, 确保命途列表 } from '@/models/character';
import type { 角色数据结构 } from '@/models/character';
import { normalizeMemorySystem } from '@/models/memory';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化智库系统 } from '@/models/zhiku';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { canonicalizeJsonValue, JsonValueError } from './jsonValue';

export type VariableManualSystemKey =
  | 'traveler'
  | 'world'
  | 'memory'
  | 'yiting'
  | 'phone'
  | 'npc'
  | 'news'
  | 'zhiku'
  | 'storyWeaving';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTraveler(value: unknown): 角色数据结构 {
  const source = isRecord(value) ? value : {};
  return 确保命途列表({
    ...创建空角色(),
    ...source,
  } as 角色数据结构);
}

/** 手动编辑与存档使用同一根域归一化边界；不改变各系统的 owner。 */
export function normalizeManualVariableRoot(key: VariableManualSystemKey, value: unknown): unknown {
  switch (key) {
    case 'traveler':
      return normalizeTraveler(value);
    case 'world':
      return 归一化世界状态(isRecord(value) ? value : {});
    case 'memory':
      return normalizeMemorySystem(isRecord(value) ? value : {});
    case 'yiting':
      return 归一化忆庭系统(isRecord(value) ? value : {});
    case 'phone':
      return 归一化手机系统(isRecord(value) ? value : {});
    case 'npc':
      return 归一化NPC记录列表(value);
    case 'news':
      return 归一化新闻列表(Array.isArray(value) ? value as never[] : []);
    case 'zhiku':
      return 归一化智库系统(isRecord(value) ? value : {});
    case 'storyWeaving':
      return 归一化剧情编织系统(isRecord(value) ? value : {});
  }
}

/**
 * 先通过 JSON 边界，再过根域归一化，最后重新 canonicalize。
 * 这样 normalizer 新增的可选字段也不会把 undefined 带回 state。
 */
export function prepareManualVariableRoot(key: VariableManualSystemKey, value: unknown): unknown {
  const initial = canonicalizeJsonValue(value);
  if (!initial.ok) throw new JsonValueError(initial.issues);
  const normalized = normalizeManualVariableRoot(key, initial.value);
  const final = canonicalizeJsonValue(normalized);
  if (!final.ok) throw new JsonValueError(final.issues);
  return final.value;
}

function inferDefaultLeaf(value: unknown): unknown | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return [];
  if (isRecord(value)) return {};
  return undefined;
}

/** 从相邻条目推导新增条目的空形状；空/未知字段直接省略，不制造 null 占位。 */
export function inferDefaultValueFromSibling(items: readonly unknown[]): unknown {
  const last = items[items.length - 1];
  if (last === undefined || last === null) return {};
  if (!isRecord(last)) return inferDefaultLeaf(last) ?? '';

  const skeleton: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(last)) {
    const inferred = inferDefaultLeaf(value);
    if (inferred !== undefined) skeleton[key] = inferred;
  }
  return skeleton;
}
