import { matchCanonical } from '@/data/canonicalCharacters';
import type { NPC记录 } from '@/models/npc';

export const HERTA_REAL_BODY_ARCHIVE_GUIDANCE = '黑塔的身体档案统一描述“大黑塔 / The Herta”的真实身体，不描述空间站傀儡、人偶或投影。';

const BLOCKED_CANONICAL_NAMES = new Set(['帕姆', '佩佩', '史瓦罗']);
const BLOCKED_SUBJECT_RE = /(帕姆|Pom-Pom|Pom Pom|佩佩|Pepper|史瓦罗|Svarog|机械|机兵|虚卒|机器人|机械造物|傀儡|人偶|投影|怪物|裂界生物)/i;
const HERTA_IDENTITY_RE = /^(?:黑塔|大黑塔|Herta|The\s*Herta)$/i;

type NsfwArchiveSubject = Pick<NPC记录, '姓名' | '别名' | '介绍' | '外貌' | '备注'> | undefined;

function identityTexts(subject: NsfwArchiveSubject, fallbackName = ''): string[] {
  return [fallbackName, subject?.姓名, subject?.别名]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .flatMap((value) => value.split(/[\/、,，]/).map((item) => item.trim()).filter(Boolean));
}

export function isHertaIdentity(subject: NsfwArchiveSubject, fallbackName = ''): boolean {
  return identityTexts(subject, fallbackName).some((name) => {
    if (HERTA_IDENTITY_RE.test(name)) return true;
    return matchCanonical(name)?.name === '黑塔';
  });
}

export function getNsfwArchiveBlockReason(
  subject: NsfwArchiveSubject,
  fallbackName = '',
  fallbackText = '',
): string | null {
  if (isHertaIdentity(subject, fallbackName)) return null;

  const names = identityTexts(subject, fallbackName);
  const canonicalName = names.map((name) => matchCanonical(name)?.name).find(Boolean);
  const displayName = subject?.姓名 || fallbackName || '目标';
  if (canonicalName && BLOCKED_CANONICAL_NAMES.has(canonicalName)) {
    return `${displayName} 属于智械、机械或非人形对象，禁止写入 NSFW 档案`;
  }

  const haystack = subject
    ? [subject.姓名, subject.别名, subject.介绍, subject.外貌, subject.备注?.join(' ')].filter(Boolean).join(' ')
    : `${fallbackName}\n${fallbackText}`;
  if (BLOCKED_SUBJECT_RE.test(haystack)) {
    return `${displayName} 命中智械、机械或非人形对象屏蔽规则，禁止写入 NSFW 档案`;
  }
  return null;
}
