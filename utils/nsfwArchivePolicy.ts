import { matchCanonical } from '@/data/canonicalCharacters';
import type { NPC记录 } from '@/models/npc';

const BLOCKED_CANONICAL_NAMES = new Set(['帕姆', '佩佩', '史瓦罗']);
const BLOCKED_IDENTITY_RE = /(帕姆|Pom-Pom|Pom Pom|佩佩|Pepper|史瓦罗|Svarog|机械|机兵|虚卒|机器人|机械造物|傀儡|人偶|投影|怪物|裂界生物)/i;
const HERTA_IDENTITY_RE = /^(?:黑塔|大黑塔|Herta|The\s*Herta)$/i;

type NsfwArchiveSubject = Pick<NPC记录, '姓名' | '别名'> | undefined;

function identityTexts(subject: NsfwArchiveSubject, fallbackName = ''): string[] {
  return [fallbackName, subject?.姓名, subject?.别名]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .flatMap((value) => value.split(/[/、,，]/).map((item) => item.trim()).filter(Boolean));
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
  // 保留参数兼容旧调用方，但命令值不是目标身份，不能参与硬禁判断。
  void fallbackText;
  if (isHertaIdentity(subject, fallbackName)) return null;

  const names = identityTexts(subject, fallbackName);
  const canonicalName = names.map((name) => matchCanonical(name)?.name).find(Boolean);
  const displayName = subject?.姓名 || fallbackName || '目标';
  if (canonicalName && BLOCKED_CANONICAL_NAMES.has(canonicalName)) {
    return `${displayName} 属于智械、机械或非人形对象，禁止写入 NSFW 档案`;
  }

  // 只检查身份文本。介绍、外貌、备注和命令值可能提到同场的帕姆、机械声或人偶，
  // 它们描述的是剧情上下文，不是目标 NPC 的种类，不能作为 NSFW 硬禁依据。
  if (BLOCKED_IDENTITY_RE.test(names.join(' '))) {
    return `${displayName} 命中智械、机械或非人形对象屏蔽规则，禁止写入 NSFW 档案`;
  }
  return null;
}
