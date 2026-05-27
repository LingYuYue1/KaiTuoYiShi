export interface BuiltinAvatarCandidate {
  id: string;
  title: string;
  src: string;
}

export interface BuiltinAvatarSet {
  canonicalName: string;
  candidates: BuiltinAvatarCandidate[];
}

const BASE = '/assets/builtin-avatars/candidates';

export const BUILTIN_AVATAR_SETS: BuiltinAvatarSet[] = [
  {
    canonicalName: '三月七',
    candidates: [
      { id: 'march7th-01', title: '三月七 01', src: `${BASE}/march7th-01.png` },
      { id: 'march7th-02', title: '三月七 02', src: `${BASE}/march7th-02.png` },
      { id: 'march7th-03', title: '三月七 03', src: `${BASE}/march7th-03.png` },
    ],
  },
  {
    canonicalName: '丹恒',
    candidates: [
      { id: 'danheng-01', title: '丹恒 01', src: `${BASE}/danheng-01.png` },
      { id: 'danheng-02', title: '丹恒 02', src: `${BASE}/danheng-02.png` },
      { id: 'danheng-03', title: '丹恒 03', src: `${BASE}/danheng-03.png` },
    ],
  },
  {
    canonicalName: '姬子',
    candidates: [
      { id: 'himeko-01', title: '姬子 01', src: `${BASE}/himeko-01.png` },
      { id: 'himeko-02', title: '姬子 02', src: `${BASE}/himeko-02.png` },
      { id: 'himeko-03', title: '姬子 03', src: `${BASE}/himeko-03.png` },
    ],
  },
  {
    canonicalName: '瓦尔特',
    candidates: [
      { id: 'welt-01', title: '瓦尔特 01', src: `${BASE}/welt-01.png` },
      { id: 'welt-02', title: '瓦尔特 02', src: `${BASE}/welt-02.png` },
      { id: 'welt-03', title: '瓦尔特 03', src: `${BASE}/welt-03.png` },
    ],
  },
  {
    canonicalName: '帕姆',
    candidates: [
      { id: 'pom-pom-01', title: '帕姆 01', src: `${BASE}/pom-pom-01.png` },
      { id: 'pom-pom-02', title: '帕姆 02', src: `${BASE}/pom-pom-02.png` },
      { id: 'pom-pom-03', title: '帕姆 03', src: `${BASE}/pom-pom-03.png` },
    ],
  },
  {
    canonicalName: '黑塔',
    candidates: [
      { id: 'herta-01', title: '黑塔 01', src: `${BASE}/herta-01.png` },
      { id: 'herta-02', title: '黑塔 02', src: `${BASE}/herta-02.png` },
      { id: 'herta-03', title: '黑塔 03', src: `${BASE}/herta-03.png` },
    ],
  },
  {
    canonicalName: '艾丝妲',
    candidates: [
      { id: 'asta-01', title: '艾丝妲 01', src: `${BASE}/asta-01.png` },
      { id: 'asta-02', title: '艾丝妲 02', src: `${BASE}/asta-02.png` },
      { id: 'asta-03', title: '艾丝妲 03', src: `${BASE}/asta-03.png` },
    ],
  },
  {
    canonicalName: '阿兰',
    candidates: [
      { id: 'arlan-01', title: '阿兰 01', src: `${BASE}/arlan-01.png` },
      { id: 'arlan-02', title: '阿兰 02', src: `${BASE}/arlan-02.png` },
      { id: 'arlan-03', title: '阿兰 03', src: `${BASE}/arlan-03.png` },
    ],
  },
  {
    canonicalName: '星',
    candidates: [
      { id: 'stelle-01', title: '星 01', src: `${BASE}/stelle-01.png` },
      { id: 'stelle-02', title: '星 02', src: `${BASE}/stelle-02.png` },
      { id: 'stelle-03', title: '星 03', src: `${BASE}/stelle-03.png` },
    ],
  },
  {
    canonicalName: '穹',
    candidates: [
      { id: 'caelus-01', title: '穹 01', src: `${BASE}/caelus-01.png` },
      { id: 'caelus-02', title: '穹 02', src: `${BASE}/caelus-02.png` },
      { id: 'caelus-03', title: '穹 03', src: `${BASE}/caelus-03.png` },
    ],
  },
];

export function getBuiltinAvatarSet(canonicalName: string | undefined): BuiltinAvatarSet | undefined {
  if (!canonicalName) return undefined;
  return BUILTIN_AVATAR_SETS.find((set) => set.canonicalName === canonicalName);
}

export function getDefaultBuiltinAvatar(canonicalName: string | undefined): string | undefined {
  return getBuiltinAvatarSet(canonicalName)?.candidates[0]?.src;
}
