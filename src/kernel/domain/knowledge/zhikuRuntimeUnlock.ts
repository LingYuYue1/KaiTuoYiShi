/**
 * Pure zhiku runtime unlock against story archives (Stage 5.2).
 *
 * Port of services/zhikuRuntimeUnlock decide/apply rules onto kernel types.
 * No React, no models/* imports.
 */

import type {
  KernelStoryArchive,
  KernelZhikuEntry,
  KernelZhikuSystem,
  KernelZhikuUnlockResult,
} from './types';

/**
 * Apply story-archive-driven runtime unlock decisions to a zhiku system.
 * Returns a new system when any entry gains a runtime unlock status.
 */
export function applyZhikuRuntimeUnlock(
  zhiku: KernelZhikuSystem,
  archives: readonly KernelStoryArchive[],
): KernelZhikuUnlockResult {
  if (!zhiku.entries.length || !archives.length) {
    return { zhiku, changed: false, unlocked: [] };
  }

  const unlocked: Array<{ id: string; title: string; status: string; reason: string }> = [];
  const nextEntries = zhiku.entries.map((entry) => {
    const decision = decideRuntimeUnlock(entry, archives);
    if (!decision) return entry;
    unlocked.push({
      id: entry.id,
      title: entry.title,
      status: decision.status,
      reason: decision.reason,
    });
    return {
      ...entry,
      runtimeUnlockStatus: decision.status,
      runtimeUnlockNote: decision.reason,
    };
  });

  if (!unlocked.length) {
    return { zhiku, changed: false, unlocked };
  }

  return {
    zhiku: { entries: nextEntries },
    changed: true,
    unlocked,
  };
}

function decideRuntimeUnlock(
  entry: KernelZhikuEntry,
  archives: readonly KernelStoryArchive[],
): { status: string; reason: string } | null {
  if (entry.category === 'story') return null;
  if (entry.usableForLink === false) return null;
  if (!isRuntimeUnlockableZhikuEntry(entry)) return null;

  const currentUnlock = normalizeText(
    entry.runtimeUnlockStatus ?? entry.unlockStatus,
  );
  if (isAlreadyOpen(currentUnlock)) return null;
  if (isReadOnlyOrManualOnly(entry)) return null;

  const exactArchive = archives.find((archive) => archiveMatchesExactField(entry, archive));
  if (exactArchive) {
    return {
      status: '已解锁',
      reason: `剧情编织归档「${exactArchive.segmentTitle}」命中人物资料关联分段，自动解锁。`,
    };
  }

  const explicitArchive = archives.find((archive) =>
    archiveMatchesUnlockCondition(entry, archive),
  );
  if (explicitArchive) {
    return {
      status: shouldWarmOnly(entry) ? '可预热' : '已解锁',
      reason: `剧情编织归档「${explicitArchive.segmentTitle}」命中解锁条件，自动更新门禁。`,
    };
  }

  return null;
}

function isRuntimeUnlockableZhikuEntry(entry: KernelZhikuEntry): boolean {
  if (entry.category === 'character') return true;
  const text = [
    entry.unlockCondition,
    entry.relatedSegment,
    ...(entry.keywords ?? []),
    entry.body,
  ]
    .filter(Boolean)
    .join(' ');
  return /迁移设定资料|剧情编织|归档|解锁|首次可用|关联剧情/.test(text);
}

function archiveMatchesExactField(
  entry: KernelZhikuEntry,
  archive: KernelStoryArchive,
): boolean {
  const linkedSegment = normalizeText(entry.relatedSegment);
  if (!linkedSegment) return false;
  return (
    textIncludesToken(archive.segmentTitle, linkedSegment)
    || textIncludesToken(archive.summary, linkedSegment)
    || textIncludesToken(archive.body, linkedSegment)
  );
}

function archiveMatchesUnlockCondition(
  entry: KernelZhikuEntry,
  archive: KernelStoryArchive,
): boolean {
  const condition = normalizeText(entry.unlockCondition);
  if (!condition || condition.length < 4) return false;
  const archiveText = [archive.segmentTitle, archive.summary, archive.body]
    .filter(Boolean)
    .join('\n');
  return extractConditionTokens(condition).some((token) =>
    textIncludesToken(archiveText, token),
  );
}

function extractConditionTokens(condition: string): string[] {
  const pieces = condition
    .split(/[，,。；;、\n\r\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        !/^(达到|完成|经过|推进|剧情|阶段|相关|后|时|之后|手动|开启|启用|解锁)$/u.test(
          item,
        ),
    );
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

function shouldWarmOnly(entry: KernelZhikuEntry): boolean {
  const text = [
    entry.unlockStatus,
    entry.runtimeUnlockStatus,
    entry.title,
  ]
    .filter(Boolean)
    .join(' ');
  if (/可预热/.test(text)) return true;
  return /重大|高|重度/.test(text) && !entry.relatedSegment;
}

function isAlreadyOpen(unlock: string): boolean {
  return /默认可用|已解锁|可用/.test(unlock) && !/未解锁|锁定|只读/.test(unlock);
}

function isReadOnlyOrManualOnly(entry: KernelZhikuEntry): boolean {
  const text = [
    entry.unlockStatus,
    entry.runtimeUnlockStatus,
    entry.unlockCondition,
    entry.title,
  ]
    .filter(Boolean)
    .join(' ');
  return /只读|手动启用|手动开启|手动解锁/.test(text);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
