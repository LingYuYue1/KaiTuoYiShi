import type { 剧情编织历史归档, 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 智库条目, 智库系统 } from '@/models/zhiku';
import { 归一化智库系统, 解析智库软结构标签 } from '@/models/zhiku';

export interface 智库运行时解锁结果 {
  system: 智库系统;
  changed: boolean;
  unlocked: Array<{ id: string; title: string; status: string; reason: string }>;
}

export function applyStoryArchiveZhikuRuntimeUnlock(params: {
  zhiku: 智库系统 | undefined;
  storyWeaving: 剧情编织系统 | undefined;
}): 智库运行时解锁结果 {
  const zhiku = 归一化智库系统(params.zhiku);
  const story = 归一化剧情编织系统(params.storyWeaving);
  const archives = story.当前进度?.历史归档 ?? [];
  if (!zhiku.条目.length || !archives.length) {
    return { system: zhiku, changed: false, unlocked: [] };
  }

  const unlocked: 智库运行时解锁结果['unlocked'] = [];
  const nextEntries = zhiku.条目.map((entry) => {
    const decision = decideRuntimeUnlock(entry, archives);
    if (!decision) return entry;
    unlocked.push({
      id: entry.id,
      title: entry.标题,
      status: decision.status,
      reason: decision.reason,
    });
    return {
      ...entry,
      运行时解锁状态: decision.status,
      运行时解锁备注: decision.reason,
      updatedAt: Date.now(),
    };
  });

  if (!unlocked.length) return { system: zhiku, changed: false, unlocked };
  return {
    system: 归一化智库系统({ 条目: nextEntries }),
    changed: true,
    unlocked,
  };
}

function decideRuntimeUnlock(
  entry: 智库条目,
  archives: 剧情编织历史归档[],
): { status: string; reason: string } | null {
  if (entry.分类 !== 'character') return null;
  if (entry.可用于联动 === false) return null;
  const meta = 解析智库软结构标签(entry);
  const currentUnlock = normalizeText(entry.运行时解锁状态 ?? entry.解锁状态 ?? meta.解锁状态);
  if (isAlreadyOpen(currentUnlock)) return null;
  if (isReadOnlyOrManualOnly(entry)) return null;

  const exactArchive = archives.find((archive) => archiveMatchesExactField(entry, archive));
  if (exactArchive) {
    return {
      status: '已解锁',
      reason: `剧情编织归档「${exactArchive.分段标题}」命中人物资料关联分段，自动解锁。`,
    };
  }

  const explicitArchive = archives.find((archive) => archiveMatchesUnlockCondition(entry, archive));
  if (explicitArchive) {
    return {
      status: shouldWarmOnly(entry) ? '可预热' : '已解锁',
      reason: `剧情编织归档「${explicitArchive.分段标题}」命中解锁条件，自动更新门禁。`,
    };
  }

  return null;
}

function archiveMatchesExactField(entry: 智库条目, archive: 剧情编织历史归档): boolean {
  const linkedSegment = normalizeText(entry.关联剧情分段ID);
  if (linkedSegment && archive.分段ID && sameToken(linkedSegment, archive.分段ID)) return true;
  if (linkedSegment && archive.分段标题 && textIncludesToken(archive.分段标题, linkedSegment)) return true;

  const firstSegment = normalizeText(entry.首次可用剧情段);
  if (!firstSegment) return false;
  return textIncludesToken(archive.分段标题, firstSegment)
    || textIncludesToken(archive.摘要, firstSegment)
    || (archive.分段ID ? sameToken(firstSegment, archive.分段ID) : false);
}

function archiveMatchesUnlockCondition(entry: 智库条目, archive: 剧情编织历史归档): boolean {
  const condition = normalizeText(entry.解锁条件);
  if (!condition || condition.length < 4) return false;
  const archiveText = [
    archive.分段标题,
    archive.摘要,
    archive.切换说明,
    ...(archive.角色推进摘要 ?? []),
    ...(archive.判定理由 ?? []),
  ].join('\n');
  return extractConditionTokens(condition).some((token) => textIncludesToken(archiveText, token));
}

function extractConditionTokens(condition: string): string[] {
  const pieces = condition
    .split(/[，,。；;、\n\r\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(达到|完成|经过|推进|剧情|阶段|相关|后|时|之后|手动|开启|启用|解锁)$/u.test(item));
  const tokens = new Set<string>();

  for (const item of pieces) {
    if (item.length >= 4) tokens.add(item);
  }
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const pair = `${pieces[index]}${pieces[index + 1]}`;
    if (pair.length >= 4) tokens.add(pair);
  }
  const compact = pieces.join('');
  if (compact.length >= 4) tokens.add(compact);

  return Array.from(tokens).slice(0, 8);
}

function shouldWarmOnly(entry: 智库条目): boolean {
  const text = [
    entry.解锁状态,
    entry.运行时解锁状态,
    entry.剧透等级,
    entry.资料类型,
    entry.标题,
  ].filter(Boolean).join(' ');
  if (/可预热/.test(text)) return true;
  return /重大|高|重度/.test(text) && !entry.关联剧情分段ID;
}

function isAlreadyOpen(unlock: string): boolean {
  return /默认可用|已解锁|可用/.test(unlock) && !/未解锁|锁定|只读/.test(unlock);
}

function isReadOnlyOrManualOnly(entry: 智库条目): boolean {
  const text = [
    entry.解锁状态,
    entry.运行时解锁状态,
    entry.解锁条件,
    entry.剧透等级,
    entry.资料类型,
    entry.标题,
  ].filter(Boolean).join(' ');
  return /只读|手动启用|手动开启|手动解锁/.test(text);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sameToken(a: string, b: string): boolean {
  return normalizeComparable(a) === normalizeComparable(b);
}

function textIncludesToken(text: string | undefined, token: string): boolean {
  const normalizedText = normalizeComparable(text ?? '');
  const normalizedToken = normalizeComparable(token);
  return normalizedToken.length >= 3 && normalizedText.includes(normalizedToken);
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s"'“”‘’《》「」『』【】\[\]（）()·\-_:：,，。；;、/\\|]+/gu, '');
}
