export type 智库治理分类 =
  | 'character'
  | 'story'
  | 'location'
  | 'faction'
  | 'event'
  | 'enemy'
  | 'aeon'
  | 'path'
  | 'term';

export type 智库资料所有者 = 'builtin-json' | 'story-weaving' | 'custom-user-data' | 'pending-user-data';
export type 智库注入策略 = 'preserve' | 'never';

export interface 智库分类策略 {
  readonly key: 智库治理分类;
  readonly label: string;
  readonly machineIdPrefix: string;
  readonly owner: 智库资料所有者;
  readonly viewMode: 'archive' | 'view-only';
  readonly playerVisible: boolean;
  readonly editable: boolean;
  readonly writable: boolean;
  readonly searchable: boolean;
  readonly participatesInRecall: boolean;
  readonly participatesInTokenBudget: boolean;
  readonly injectionPolicy: 智库注入策略;
  readonly unlockPolicy: 'entry-metadata' | 'story-progress-readonly' | 'pending';
  readonly adapter: 'character-archive' | 'story-reader' | 'lore-archive' | 'empty-archive';
}

const archivePolicy = (
  key: Exclude<智库治理分类, 'story' | 'enemy' | 'character'>,
  label: string,
  machineIdPrefix: string,
): 智库分类策略 => Object.freeze({
  key,
  label,
  machineIdPrefix,
  owner: 'builtin-json',
  viewMode: 'archive',
  playerVisible: true,
  editable: false,
  writable: false,
  searchable: true,
  participatesInRecall: true,
  participatesInTokenBudget: true,
  injectionPolicy: 'preserve',
  unlockPolicy: 'entry-metadata',
  adapter: 'lore-archive',
});

export const ZHIKU_CATEGORY_POLICIES: Readonly<Record<智库治理分类, 智库分类策略>> = Object.freeze({
  character: Object.freeze({
    key: 'character',
    label: '人物',
    machineIdPrefix: 'JS',
    owner: 'builtin-json',
    viewMode: 'archive',
    playerVisible: true,
    editable: false,
    writable: false,
    searchable: true,
    participatesInRecall: true,
    participatesInTokenBudget: true,
    injectionPolicy: 'preserve',
    unlockPolicy: 'entry-metadata',
    adapter: 'character-archive',
  }),
  story: Object.freeze({
    key: 'story',
    label: '剧情档案',
    machineIdPrefix: 'JQ',
    owner: 'story-weaving',
    viewMode: 'view-only',
    playerVisible: true,
    editable: false,
    writable: false,
    searchable: true,
    participatesInRecall: false,
    participatesInTokenBudget: false,
    injectionPolicy: 'never',
    unlockPolicy: 'story-progress-readonly',
    adapter: 'story-reader',
  }),
  location: archivePolicy('location', '地点', 'DD'),
  faction: archivePolicy('faction', '派系', 'PX'),
  event: archivePolicy('event', '事件', 'SJ'),
  enemy: Object.freeze({
    key: 'enemy',
    label: '敌对生物',
    machineIdPrefix: 'DS',
    owner: 'builtin-json',
    viewMode: 'archive',
    playerVisible: true,
    editable: false,
    writable: false,
    searchable: true,
    participatesInRecall: true,
    participatesInTokenBudget: true,
    injectionPolicy: 'preserve',
    unlockPolicy: 'entry-metadata',
    adapter: 'lore-archive',
  }),
  aeon: archivePolicy('aeon', '星神', 'XS'),
  path: archivePolicy('path', '命途', 'MT'),
  term: archivePolicy('term', '专有名词', 'MY'),
});

export const ZHIKU_MACHINE_ID_PATTERN = /^[A-Z]{2}-\d{3}$/u;

export function isZhikuGovernanceCategory(value: unknown): value is 智库治理分类 {
  return typeof value === 'string' && Object.hasOwn(ZHIKU_CATEGORY_POLICIES, value);
}

export function isZhikuDataOwner(value: unknown): value is 智库资料所有者 {
  return value === 'builtin-json'
    || value === 'story-weaving'
    || value === 'custom-user-data'
    || value === 'pending-user-data';
}

export function isZhikuStoryArchivePolicy(policy: 智库分类策略): boolean {
  return policy.key === 'story'
    && policy.viewMode === 'view-only'
    && !policy.editable
    && !policy.writable
    && !policy.participatesInRecall
    && !policy.participatesInTokenBudget
    && policy.injectionPolicy === 'never';
}
