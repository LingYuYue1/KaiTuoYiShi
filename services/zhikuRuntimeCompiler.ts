import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { 获取智库人物名列表, 比较智库人物节点 } from '@/models/zhiku';
import type { API配置项, 智库系统设置 } from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import {
  collapseZhikuMutuallyExclusiveEntries,
  retrieveZhikuContext,
  retrieveZhikuContextWithModel,
  type 智库场景上下文,
  type 智库检索结果,
} from '@/services/zhikuRetrieval';
import type { ZhikuCharacterParticipation } from '@/hooks/useGame/npcPresence';

export type ZhikuRequestScope =
  | 'opening'
  | 'main'
  | 'pathAwakeningQuestion'
  | 'pathAwakeningJudgement'
  | 'phone'
  | 'diagnostic';

export interface ZhikuTurnCompilation extends 智库检索结果 {
  compileId: string;
  catalogVersion: string;
  catalogRevision: number;
  scope: ZhikuRequestScope;
  participation: ZhikuCharacterParticipation;
  participationEvidence: Array<{
    name: string;
    level: keyof ZhikuCharacterParticipation;
    evidence: string;
  }>;
  mainStoryInjection: string;
  characterEnforcementBrief: string;
  phonePersonaView: string;
}

interface CompileZhikuTurnInput {
  system: 智库系统 | undefined;
  query: string;
  limit: number;
  scope: ZhikuRequestScope;
  participation: ZhikuCharacterParticipation;
  sceneContext?: 智库场景上下文;
}

const EMPTY_PARTICIPATION: ZhikuCharacterParticipation = {
  present: [],
  anticipated: [],
  mentioned: [],
  background: [],
};

export function compileZhikuTurn(input: CompileZhikuTurnInput): ZhikuTurnCompilation {
  if (!scopeAllowsMainStoryZhiku(input.scope)) return emptyCompilation(input);
  const result = retrieveZhikuContext(input.system, input.query, input.limit, buildCompilerSceneContext(input));
  return finalizeCompilation(input, result);
}

export async function compileZhikuTurnWithModel(
  input: CompileZhikuTurnInput & {
    settings: 智库系统设置;
    mainConfig: API配置项;
    signal?: AbortSignal;
    retryCount?: number;
    promptModules?: 提示词模块[];
  },
): Promise<ZhikuTurnCompilation> {
  if (!scopeAllowsMainStoryZhiku(input.scope)) return emptyCompilation(input);
  const result = await retrieveZhikuContextWithModel(
    input.system,
    input.query,
    input.limit,
    input.settings,
    input.mainConfig,
    input.signal,
    input.retryCount,
    buildCompilerSceneContext(input),
    input.promptModules,
  );
  return finalizeCompilation(input, result);
}

export function compileZhikuPhoneView(
  system: 智库系统 | undefined,
  participantNames: string[],
): ZhikuTurnCompilation {
  const participation: ZhikuCharacterParticipation = {
    ...EMPTY_PARTICIPATION,
    present: normalizeNames(participantNames),
  };
  const entries: 智库条目[] = [];
  for (const name of participation.present) {
    const matches = (system?.条目 ?? [])
      .filter((entry) => entry.分类 === 'character' && entry.可用于联动 !== false)
      .filter((entry) => isPhoneAllowedEntry(entry))
      .filter((entry) => 获取智库人物名列表(entry).some((candidate) => namesLikelySame(candidate, name)))
      .sort((a, b) => {
        const exactDiff = Number(获取智库人物名列表(b).includes(name)) - Number(获取智库人物名列表(a).includes(name));
        return exactDiff || 比较智库人物节点(a, b);
      });
    for (const entry of collapseZhikuMutuallyExclusiveEntries(matches).slice(0, 2)) {
      if (!entries.some((item) => item.id === entry.id)) entries.push(entry);
    }
  }
  const phonePersonaView = entries.map(renderPhonePersonaEntry).filter(Boolean).join('\n\n');
  return {
    compileId: createCompileId(system, 'phone', participation),
    catalogVersion: system?.目录版本 ?? 'catalog:unknown',
    catalogRevision: system?.目录修订 ?? 0,
    scope: 'phone',
    participation,
    participationEvidence: buildParticipationEvidence(participation),
    entries,
    characterEntries: entries,
    strongEntries: [],
    weakEntries: [],
    injection: '',
    mainStoryInjection: '',
    characterEnforcementBrief: '',
    phonePersonaView,
  };
}

function scopeAllowsMainStoryZhiku(scope: ZhikuRequestScope): boolean {
  return scope === 'main' || scope === 'opening' || scope === 'diagnostic';
}

function finalizeCompilation(input: CompileZhikuTurnInput, result: 智库检索结果): ZhikuTurnCompilation {
  const presentEntries = (result.characterEntries ?? [])
    .filter((entry) => entryMatchesNames(entry, input.participation.present));
  const compileId = createCompileId(input.system, input.scope, { query: input.query, participation: input.participation });
  const catalogVersion = input.system?.目录版本 ?? 'catalog:unknown';
  const catalogRevision = input.system?.目录修订 ?? 0;
  const mainStoryInjection = result.injection;
  const characterEnforcementBrief = buildCharacterEnforcementBrief(presentEntries);
  return {
    ...result,
    compileId,
    catalogVersion,
    catalogRevision,
    scope: input.scope,
    participation: input.participation,
    participationEvidence: buildParticipationEvidence(input.participation),
    mainStoryInjection,
    characterEnforcementBrief,
    phonePersonaView: '',
  };
}

function emptyCompilation(input: Pick<CompileZhikuTurnInput, 'system' | 'query' | 'scope' | 'participation'>): ZhikuTurnCompilation {
  const compileId = createCompileId(input.system, input.scope, { query: input.query, participation: input.participation });
  const catalogVersion = input.system?.目录版本 ?? 'catalog:unknown';
  const catalogRevision = input.system?.目录修订 ?? 0;
  return {
    compileId,
    catalogVersion,
    catalogRevision,
    scope: input.scope,
    participation: input.participation,
    participationEvidence: buildParticipationEvidence(input.participation),
    entries: [],
    characterEntries: [],
    strongEntries: [],
    weakEntries: [],
    injection: '',
    mainStoryInjection: '',
    characterEnforcementBrief: '',
    phonePersonaView: '',
  };
}

function buildCharacterEnforcementBrief(entries: 智库条目[]): string {
  const lines = entries.flatMap((entry) => {
    const content = entry.注入内容;
    if (content?.类型 !== 'character') return [];
    const speech = compactText(content.说话方式, 120);
    const boundary = compactText(content.演绎红线, 120);
    return [`- ${entry.标题}：${[speech && `说话方式：${speech}`, boundary && `演绎红线：${boundary}`].filter(Boolean).join('；')}`];
  });
  if (!lines.length) return '';
  return ['【当前明确在场人物校准】', ...lines].join('\n');
}

function isPhoneAllowedEntry(entry: 智库条目): boolean {
  if (entry.可否手机使用 === false || entry.注入内容?.类型 !== 'character') return false;
  const unlock = String(entry.运行时解锁状态 ?? entry.解锁状态 ?? '');
  if (/未解锁|锁定|只读/u.test(unlock)) return false;
  const spoiler = String(entry.剧透等级 ?? '');
  if (/重大|重度|高/u.test(spoiler) && !/默认可用|已解锁|当前可用|手动启用/u.test(unlock)) return false;
  const ranges = entry.使用范围 ?? [];
  return ranges.length === 0 || ranges.some((item) => /手机|通用|全部|all/iu.test(item));
}

function renderPhonePersonaEntry(entry: 智库条目): string {
  const content = entry.注入内容;
  if (content?.类型 !== 'character') return '';
  return [
    `【${entry.标题}】`,
    `核心身份与阵营：${content.核心身份与阵营}`,
    `独立人格与行为：${content.独立人格与行为}`,
    `说话方式：${content.说话方式}`,
    `演绎红线：${content.演绎红线}`,
  ].join('\n');
}

function entryMatchesNames(entry: 智库条目, names: string[]): boolean {
  return 获取智库人物名列表(entry).some((candidate) => names.some((name) => namesLikelySame(candidate, name)));
}

function buildCompilerSceneContext(input: CompileZhikuTurnInput): 智库场景上下文 {
  return {
    ...(input.sceneContext ?? {}),
    presentNpcNamesForFallback: normalizeNames(input.participation.present),
    anticipatedNpcNames: normalizeNames(input.participation.anticipated),
    // 兜底召回只认当前在场角色。mentioned/background 仅作为 AI 补充的上下文信号，
    // 不能在没有关键词命中时直接把离场角色的人物档案塞进本回合。
    recallFallbackNames: normalizeNames(input.participation.present),
  };
}

function buildParticipationEvidence(
  participation: ZhikuCharacterParticipation,
): ZhikuTurnCompilation['participationEvidence'] {
  const labels: Record<keyof ZhikuCharacterParticipation, string> = {
    present: '当前场景人物或同行状态',
    anticipated: '当前剧情规划预计登场',
    mentioned: '玩家输入或近期正文提及',
    background: '近期活跃但本回合未在场',
  };
  return (Object.keys(labels) as Array<keyof ZhikuCharacterParticipation>).flatMap((level) => (
    participation[level].map((name) => ({ name, level, evidence: labels[level] }))
  ));
}

function normalizeNames(names: string[]): string[] {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean))).slice(0, 12);
}

function namesLikelySame(a: string, b: string): boolean {
  const left = normalizeCharacterName(a);
  const right = normalizeCharacterName(b);
  return Boolean(left && right && left === right);
}

function normalizeCharacterName(value: string): string {
  return value.toLowerCase().replace(/[\s·•・._-]+/gu, '');
}

function compactText(value: string, limit: number): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function createCompileId(system: 智库系统 | undefined, scope: ZhikuRequestScope, request: unknown): string {
  const catalogVersion = system?.目录版本 ?? 'catalog:unknown';
  const revision = system?.目录修订 ?? 0;
  return `${revision}:${scope}:${hashText(`${catalogVersion}:${revision}:${scope}:${JSON.stringify(request)}`)}`;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
