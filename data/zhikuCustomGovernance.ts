import {
  创建智库条目,
  获取智库注入内容缺失字段,
  智库条目需要注入内容,
  type 智库条目,
} from '@/models/zhiku';
import type { 智库治理分类 } from '@/models/zhikuGovernance';

export const ZHIKU_CUSTOM_ID_PREFIX = 'ZZ';
export const ZHIKU_CUSTOM_ID_PATTERN = /^ZZ-\d{3}$/u;
export const ZHIKU_CUSTOM_SCHEMA_VERSION = 3;
export const ZHIKU_AUXILIARY_FIELDS_VERSION = 1;

export type 智库资料健康度状态 = 'healthy' | 'attention' | 'invalid';
export type 智库资料健康度级别 = 'info' | 'warning' | 'error';

export interface 智库资料健康度问题 {
  code: string;
  level: 智库资料健康度级别;
  field: string;
  message: string;
}

export interface 智库资料健康度诊断 {
  score: number;
  status: 智库资料健康度状态;
  schemaVersion: number;
  auxiliaryFieldsVersion: number;
  schemaCurrent: boolean;
  auxiliaryFieldsCurrent: boolean;
  issues: 智库资料健康度问题[];
}

type 创建智库条目输入 = Parameters<typeof 创建智库条目>[0];

function collectIds(entries: readonly Pick<智库条目, 'id'>[]): Set<string> {
  return new Set(entries.map((entry) => entry.id.trim()).filter(Boolean));
}

function allocateAvailableCustomId(blockedIds: Set<string>, startAt = 0): string {
  for (let index = Math.max(0, Math.trunc(startAt)); index <= 999; index += 1) {
    const id = `${ZHIKU_CUSTOM_ID_PREFIX}-${String(index).padStart(3, '0')}`;
    if (!blockedIds.has(id)) return id;
  }
  throw new Error('自制智库资料 ID 已用尽（ZZ-000 至 ZZ-999）。');
}

function inferGovernanceCategory(entry: Pick<智库条目, '分类' | '治理分类'>): 智库治理分类 | undefined {
  if (entry.治理分类) return entry.治理分类;
  if (entry.分类 === 'character') return 'character';
  if (entry.分类 === 'location') return 'location';
  if (entry.分类 === 'faction') return 'faction';
  if (entry.分类 === 'event') return 'event';
  if (entry.分类 === 'enemy') return 'enemy';
  if (entry.分类 === 'term') return 'term';
  return undefined;
}

function normalizeVersion(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function 分配自制智库ID(
  existingEntries: readonly Pick<智库条目, 'id'>[],
  startAt = 0,
): string {
  return allocateAvailableCustomId(collectIds(existingEntries), startAt);
}

export function 获取下一个自制智库序号(
  entries: readonly Pick<智库条目, 'id'>[],
  minimum = 0,
): number {
  const nextFromEntries = entries.reduce((next, entry) => {
    if (!ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)) return next;
    return Math.max(next, Number(entry.id.slice(3)) + 1);
  }, 0);
  return Math.max(Math.trunc(minimum), nextFromEntries, 0);
}

export function 创建自制智库条目(
  existingEntries: readonly Pick<智库条目, 'id'>[],
  input: 创建智库条目输入,
  nextSequence = 0,
): 智库条目 {
  const entry = 创建智库条目({ ...input, builtin: false });
  if (entry.分类 === 'story') {
    throw new Error('剧情档案由剧情编织维护，只读且永不注入，不能作为自制智库资料创建。');
  }
  if (!entry.原文.trim()) {
    throw new Error('自制智库资料必须填写完整档案原文。');
  }
  const missingInjectionFields = 获取智库注入内容缺失字段(entry);
  if (missingInjectionFields.length) {
    throw new Error(`自制智库资料缺少注入内容：${missingInjectionFields.join('、')}。`);
  }
  return {
    ...entry,
    id: 分配自制智库ID(existingEntries, nextSequence),
    治理分类: inferGovernanceCategory(entry),
    资料所有者: 'custom-user-data',
    来源预设ID: undefined,
    来源文件: undefined,
    来源序号: undefined,
    资料版本: ZHIKU_CUSTOM_SCHEMA_VERSION,
    辅助字段版本: ZHIKU_AUXILIARY_FIELDS_VERSION,
    builtin: false,
  };
}

export function 规范化自制智库条目(
  customEntries: readonly 智库条目[],
  reservedEntries: readonly Pick<智库条目, 'id'>[] = [],
): 智库条目[] {
  const claimedIds = collectIds(reservedEntries);
  return customEntries.flatMap((entry) => {
    const id = entry.id.trim();
    if (!ZHIKU_CUSTOM_ID_PATTERN.test(id) || claimedIds.has(id)) return [];
    claimedIds.add(id);
    const schemaVersion = normalizeVersion(entry.资料版本, 0);
    const auxiliaryFieldsVersion = normalizeVersion(entry.辅助字段版本, 0);
    return [{
      ...entry,
      id,
      治理分类: inferGovernanceCategory(entry),
      资料所有者: 'custom-user-data' as const,
      来源预设ID: undefined,
      来源文件: undefined,
      来源序号: undefined,
      资料版本: Math.max(schemaVersion, ZHIKU_CUSTOM_SCHEMA_VERSION),
      辅助字段版本: auxiliaryFieldsVersion,
      builtin: false,
    }];
  });
}

function addHealthIssue(
  issues: 智库资料健康度问题[],
  code: string,
  level: 智库资料健康度级别,
  field: string,
  message: string,
): void {
  issues.push({ code, level, field, message });
}

export function 诊断智库条目健康度(entry: 智库条目): 智库资料健康度诊断 {
  const issues: 智库资料健康度问题[] = [];
  const schemaVersion = entry.builtin
    ? normalizeVersion(entry.资料版本, ZHIKU_CUSTOM_SCHEMA_VERSION)
    : normalizeVersion(entry.资料版本, 0);
  const auxiliaryFieldsVersion = entry.builtin
    ? normalizeVersion(entry.辅助字段版本, ZHIKU_AUXILIARY_FIELDS_VERSION)
    : normalizeVersion(entry.辅助字段版本, 0);

  if (!entry.builtin && !ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)) {
    addHealthIssue(issues, 'custom-id-invalid', 'error', 'id', '自制资料必须使用 ZZ-000 格式的机器 ID。');
  }
  if (!entry.builtin && entry.资料所有者 !== 'custom-user-data') {
    addHealthIssue(issues, 'custom-owner-missing', 'warning', '资料所有者', '自制资料尚未标记为 custom-user-data。');
  }
  if (schemaVersion !== ZHIKU_CUSTOM_SCHEMA_VERSION) {
    addHealthIssue(issues, 'schema-version-stale', 'warning', '资料版本', `资料结构版本应为 ${ZHIKU_CUSTOM_SCHEMA_VERSION}。`);
  }
  if (auxiliaryFieldsVersion !== ZHIKU_AUXILIARY_FIELDS_VERSION) {
    addHealthIssue(issues, 'auxiliary-version-stale', 'warning', '辅助字段版本', `人工辅助字段需要按版本 ${ZHIKU_AUXILIARY_FIELDS_VERSION} 重新检查。`);
  }
  if (!entry.标题.trim() || entry.标题 === '未命名资料') {
    addHealthIssue(issues, 'title-missing', 'error', '标题', '资料缺少可识别标题。');
  }
  if (!entry.原文.trim()) {
    addHealthIssue(issues, 'archive-content-missing', 'error', '原文', '资料必须保留完整档案原文；摘要不能替代档案。');
  }
  if (智库条目需要注入内容(entry)) {
    const missingInjectionFields = 获取智库注入内容缺失字段(entry);
    if (missingInjectionFields.length) {
      addHealthIssue(
        issues,
        'injection-content-incomplete',
        'error',
        '注入内容',
        `结构化注入内容缺少：${missingInjectionFields.join('、')}。`,
      );
    }
  }
  if (entry.关键词.length === 0) {
    addHealthIssue(issues, 'keywords-missing', 'warning', '关键词', '资料没有召回关键词。');
  }

  if (entry.分类 === 'character') {
    const anchorFields = [
      entry.外貌锚点,
      entry.性格锚点,
      entry.说话方式,
      entry.行为习惯,
      entry.关系边界,
      entry.禁止误写,
    ];
    const anchorCount = anchorFields.filter((value) => Boolean(value?.trim())).length;
    if (anchorCount < anchorFields.length) {
      addHealthIssue(issues, 'character-anchors-incomplete', 'warning', '人物锚点', `人物表现锚点完成 ${anchorCount}/${anchorFields.length}。`);
    }
    if (!entry.角色故事摘要?.trim() && !/角色故事|故事层|经历脉络/u.test(entry.原文)) {
      addHealthIssue(issues, 'character-story-missing', 'info', '角色故事摘要', '人物资料没有独立故事摘要或故事层。');
    }
  }

  const penalty = issues.reduce((total, issue) => {
    if (issue.level === 'error') return total + 30;
    if (issue.level === 'warning') return total + 10;
    return total + 2;
  }, 0);
  const score = Math.max(0, 100 - penalty);
  const status: 智库资料健康度状态 = issues.some((issue) => issue.level === 'error')
    ? 'invalid'
    : issues.some((issue) => issue.level === 'warning')
      ? 'attention'
      : 'healthy';

  return {
    score,
    status,
    schemaVersion,
    auxiliaryFieldsVersion,
    schemaCurrent: schemaVersion === ZHIKU_CUSTOM_SCHEMA_VERSION,
    auxiliaryFieldsCurrent: auxiliaryFieldsVersion === ZHIKU_AUXILIARY_FIELDS_VERSION,
    issues,
  };
}
