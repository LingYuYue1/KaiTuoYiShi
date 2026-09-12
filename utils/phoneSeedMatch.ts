import type { 主动来信种子 } from '@/models/phone';
import { canonicalContactId } from '@/utils/phone';

/**
 * 主动来信种子的共享目标身份契约：
 * - 私聊 NPC 目标 id 允许原始 NPC id（`npc-123`）与 npc_ 联系人 id（`npc_npc-123`）两种形态，两者指同一目标。
 * - 群聊目标 id 不透明：原样精确比较，绝不按 npc_ 规则归一化。
 * - 目标身份包含 targetType：私聊与群聊永不互相匹配，relatedNpcIds 也不能跨类型桥接。
 * - 相似度抑制仅在目标身份与生产者自定义的时间窗口同时命中时生效。
 * - 冷却与候选选择仍由各生产者自行维护。
 */
export type PhoneSeedTargetRef = Pick<主动来信种子, 'targetType' | 'targetId' | 'relatedNpcIds'>;

/** 按共享契约判断两个主动来信目标是否指向同一目标：群聊 id 精确比较，私聊 id 做 npc_ 归一化。 */
export function isSamePhoneSeedTarget(a: PhoneSeedTargetRef, b: PhoneSeedTargetRef): boolean {
  if (a.targetType !== b.targetType) return false;
  if (a.targetType === 'group') return a.targetId === b.targetId;
  const aIds = new Set([a.targetId, ...a.relatedNpcIds].filter(Boolean).map(canonicalContactId));
  return [b.targetId, ...b.relatedNpcIds]
    .filter(Boolean)
    .map(canonicalContactId)
    .some((id) => aIds.has(id));
}

function normalizePhoneSeedComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'[\]（）()《》<>]/g, '')
    .trim();
}

/** 忽略空白与全/半角标点后比较两段文本：完全相同、长文本包含、或去重字符重合率 ≥ 0.82。 */
export function isPhoneSeedTextSimilar(a: string, b: string): boolean {
  const left = normalizePhoneSeedComparableText(a);
  const right = normalizePhoneSeedComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.includes(left)) return true;
  if (right.length >= 12 && left.includes(right)) return true;
  const shared = [...new Set(left)].filter((char) => right.includes(char)).length;
  return shared / Math.max(1, Math.min(left.length, right.length)) >= 0.82;
}
