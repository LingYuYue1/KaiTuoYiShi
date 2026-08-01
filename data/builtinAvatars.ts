import {
  createStaticAssetReference,
  isRemoteStaticAssetUrl,
  resolveStaticAssetOrLocal,
  resolveStaticAssetReference,
} from '@/utils/staticAssets';

export interface BuiltinAvatarCandidate {
  id: string;
  title: string;
  src: string;
  reference?: string;
}

export interface BuiltinAvatarSet {
  canonicalName: string;
  candidates: BuiltinAvatarCandidate[];
}

const BASE = '/assets/builtin-avatars/candidates';

function avatarSource(id: string): string {
  const local = `${BASE}/${id}.png`;
  return resolveStaticAssetOrLocal(`avatar:${id.replace(/-(\d+)$/, ':$1')}`, local);
}

function avatarReference(id: string): string | undefined {
  const logicalId = `avatar:${id.replace(/-(\d+)$/, ':$1')}`;
  return resolveStaticAssetReference(logicalId)
    ? createStaticAssetReference(logicalId)
    : undefined;
}

const BUILTIN_AVATAR_CANONICAL_ALIASES: Record<string, string> = {
  '丹恒·饮月': '丹恒',
  '饮月': '丹恒',
  'Imbibitor Lunae': '丹恒',
  '三月七·巡猎': '三月七',
  '巡猎三月七': '三月七',
};

export const BUILTIN_AVATAR_SETS: BuiltinAvatarSet[] = [
  {
    canonicalName: '三月七',
    candidates: [
      { id: 'march7th-01', title: '三月七 01', src: avatarSource('march7th-01'), reference: avatarReference('march7th-01') },
      { id: 'march7th-02', title: '三月七 02', src: avatarSource('march7th-02'), reference: avatarReference('march7th-02') },
      { id: 'march7th-03', title: '三月七 03', src: avatarSource('march7th-03'), reference: avatarReference('march7th-03') },
    ],
  },
  {
    canonicalName: '丹恒',
    candidates: [
      { id: 'danheng-01', title: '丹恒 01', src: avatarSource('danheng-01'), reference: avatarReference('danheng-01') },
      { id: 'danheng-02', title: '丹恒 02', src: avatarSource('danheng-02'), reference: avatarReference('danheng-02') },
      { id: 'danheng-03', title: '丹恒 03', src: avatarSource('danheng-03'), reference: avatarReference('danheng-03') },
    ],
  },
  {
    canonicalName: '姬子',
    candidates: [
      { id: 'himeko-01', title: '姬子 01', src: avatarSource('himeko-01'), reference: avatarReference('himeko-01') },
      { id: 'himeko-02', title: '姬子 02', src: avatarSource('himeko-02'), reference: avatarReference('himeko-02') },
      { id: 'himeko-03', title: '姬子 03', src: avatarSource('himeko-03'), reference: avatarReference('himeko-03') },
    ],
  },
  {
    canonicalName: '瓦尔特',
    candidates: [
      { id: 'welt-01', title: '瓦尔特 01', src: avatarSource('welt-01'), reference: avatarReference('welt-01') },
      { id: 'welt-02', title: '瓦尔特 02', src: avatarSource('welt-02'), reference: avatarReference('welt-02') },
      { id: 'welt-03', title: '瓦尔特 03', src: avatarSource('welt-03'), reference: avatarReference('welt-03') },
    ],
  },
  {
    canonicalName: '帕姆',
    candidates: [
      { id: 'pom-pom-01', title: '帕姆 01', src: avatarSource('pom-pom-01'), reference: avatarReference('pom-pom-01') },
      { id: 'pom-pom-02', title: '帕姆 02', src: avatarSource('pom-pom-02'), reference: avatarReference('pom-pom-02') },
      { id: 'pom-pom-03', title: '帕姆 03', src: avatarSource('pom-pom-03'), reference: avatarReference('pom-pom-03') },
    ],
  },
  {
    canonicalName: '黑塔',
    candidates: [
      { id: 'herta-01', title: '黑塔 01', src: avatarSource('herta-01'), reference: avatarReference('herta-01') },
      { id: 'herta-02', title: '黑塔 02', src: avatarSource('herta-02'), reference: avatarReference('herta-02') },
      { id: 'herta-03', title: '黑塔 03', src: avatarSource('herta-03'), reference: avatarReference('herta-03') },
    ],
  },
  {
    canonicalName: '艾丝妲',
    candidates: [
      { id: 'asta-01', title: '艾丝妲 01', src: avatarSource('asta-01'), reference: avatarReference('asta-01') },
      { id: 'asta-02', title: '艾丝妲 02', src: avatarSource('asta-02'), reference: avatarReference('asta-02') },
      { id: 'asta-03', title: '艾丝妲 03', src: avatarSource('asta-03'), reference: avatarReference('asta-03') },
    ],
  },
  {
    canonicalName: '阿兰',
    candidates: [
      { id: 'arlan-01', title: '阿兰 01', src: avatarSource('arlan-01'), reference: avatarReference('arlan-01') },
      { id: 'arlan-02', title: '阿兰 02', src: avatarSource('arlan-02'), reference: avatarReference('arlan-02') },
      { id: 'arlan-03', title: '阿兰 03', src: avatarSource('arlan-03'), reference: avatarReference('arlan-03') },
    ],
  },
  {
    canonicalName: '星',
    candidates: [
      { id: 'stelle-01', title: '星 01', src: avatarSource('stelle-01'), reference: avatarReference('stelle-01') },
      { id: 'stelle-02', title: '星 02', src: avatarSource('stelle-02'), reference: avatarReference('stelle-02') },
      { id: 'stelle-03', title: '星 03', src: avatarSource('stelle-03'), reference: avatarReference('stelle-03') },
    ],
  },
  {
    canonicalName: '穹',
    candidates: [
      { id: 'caelus-01', title: '穹 01', src: avatarSource('caelus-01'), reference: avatarReference('caelus-01') },
      { id: 'caelus-02', title: '穹 02', src: avatarSource('caelus-02'), reference: avatarReference('caelus-02') },
      { id: 'caelus-03', title: '穹 03', src: avatarSource('caelus-03'), reference: avatarReference('caelus-03') },
    ],
  },
  {
    canonicalName: '布洛妮娅',
    candidates: [
      { id: 'bronya-01', title: '布洛妮娅 01', src: avatarSource('bronya-01'), reference: avatarReference('bronya-01') },
      { id: 'bronya-02', title: '布洛妮娅 02', src: avatarSource('bronya-02'), reference: avatarReference('bronya-02') },
      { id: 'bronya-03', title: '布洛妮娅 03', src: avatarSource('bronya-03'), reference: avatarReference('bronya-03') },
    ],
  },
];

export function getBuiltinAvatarSet(canonicalName: string | undefined): BuiltinAvatarSet | undefined {
  if (!canonicalName) return undefined;
  const ownerName = BUILTIN_AVATAR_CANONICAL_ALIASES[canonicalName] ?? canonicalName;
  return BUILTIN_AVATAR_SETS.find((set) => set.canonicalName === ownerName);
}

export function getDefaultBuiltinAvatar(canonicalName: string | undefined): string | undefined {
  const candidates = getBuiltinAvatarSet(canonicalName)?.candidates;
  return candidates?.find((candidate) => isRemoteStaticAssetUrl(candidate.src))?.src ?? candidates?.[0]?.src;
}
