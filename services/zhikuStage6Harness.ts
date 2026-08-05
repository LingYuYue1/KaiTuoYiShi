import type { 聊天消息 } from '@/models/chat';
import type { 智库系统 } from '@/models/zhiku';
import type { ZhikuTurnCompilation } from '@/services/zhikuRuntimeCompiler';
import { createMainRequestHash } from '@/hooks/useGame/mainRequestFinalizer';

export interface ZhikuStage6FixtureDefinition {
  id: string;
  title: string;
  purpose: string;
  referencedEntryIds: string[];
  groups: Array<'with-v3' | 'without-v3' | 'native' | 'tavern-v2'>;
}

export const ZHIKU_STAGE6_FIXTURES: readonly ZhikuStage6FixtureDefinition[] = [
  { id: 'single-present', title: '单角色明确在场', purpose: '身份、口吻与演绎红线', referencedEntryIds: ['JS-004'], groups: ['with-v3', 'without-v3'] },
  { id: 'multi-present', title: '多人明确在场', purpose: '群像保留与抢话控制', referencedEntryIds: ['JS-002', 'JS-004', 'JS-005'], groups: ['with-v3', 'without-v3'] },
  { id: 'mentioned-only', title: '仅被提及', purpose: '允许参考但不得自动登场', referencedEntryIds: ['JS-005'], groups: ['with-v3', 'without-v3'] },
  { id: 'anticipated', title: '预计登场', purpose: '预热检索但尚未出现时不得发言', referencedEntryIds: ['JS-004'], groups: ['with-v3', 'without-v3'] },
  { id: 'multi-form', title: '多形态互斥', purpose: '同一互斥组只保留一个合法形态', referencedEntryIds: ['JS-002', 'JS-004', 'JS-076', 'JS-077', 'JS-083', 'JS-084'], groups: ['with-v3', 'without-v3'] },
  { id: 'runtime-gates', title: '运行时门禁', purpose: '未解锁、重大剧透与作用域禁止必须被过滤', referencedEntryIds: ['JS-099'], groups: ['with-v3'] },
  { id: 'private-relation', title: '长期私有关系', purpose: '动态经历不被静态人格覆盖', referencedEntryIds: ['JS-004'], groups: ['with-v3', 'without-v3'] },
  { id: 'low-information', title: '低信息与无命中', purpose: '不凑资料、不乱入', referencedEntryIds: [], groups: ['with-v3', 'without-v3'] },
  { id: 'ai-supplement', title: 'AI 合法补充与失败回退', purpose: '合法补充、形态修正、非法 ID 拒绝和关键词回退', referencedEntryIds: ['JS-004', 'JS-076'], groups: ['with-v3'] },
  { id: 'scope-and-mode', title: '手机与模式等价', purpose: '手机单聊/群聊及普通/Tavern V2 语义等价', referencedEntryIds: ['JS-004'], groups: ['native', 'tavern-v2'] },
] as const;

export interface ZhikuStage6FixtureAudit {
  fixtureCount: number;
  referencedEntryCount: number;
  totalRequestGroups: number;
  missingEntryIds: string[];
  fixtures: Array<{
    id: string;
    title: string;
    ready: boolean;
    missingEntryIds: string[];
    requestGroups: number;
  }>;
}

export function auditZhikuStage6Fixtures(system: 智库系统 | undefined): ZhikuStage6FixtureAudit {
  const available = new Set((system?.条目 ?? []).flatMap((entry) => [entry.id, ...(entry.兼容ID ?? [])]));
  const fixtures = ZHIKU_STAGE6_FIXTURES.map((fixture) => {
    const missingEntryIds = fixture.referencedEntryIds.filter((id) => !available.has(id));
    return {
      id: fixture.id,
      title: fixture.title,
      ready: missingEntryIds.length === 0,
      missingEntryIds,
      requestGroups: fixture.groups.length,
    };
  });
  const referencedEntryIds = Array.from(new Set(ZHIKU_STAGE6_FIXTURES.flatMap((fixture) => fixture.referencedEntryIds)));
  return {
    fixtureCount: fixtures.length,
    referencedEntryCount: referencedEntryIds.length,
    totalRequestGroups: fixtures.reduce((sum, fixture) => sum + fixture.requestGroups, 0),
    missingEntryIds: Array.from(new Set(fixtures.flatMap((fixture) => fixture.missingEntryIds))),
    fixtures,
  };
}

export interface BuildZhikuStage6EffectAbInput {
  systemPrompt: string;
  messages: Array<Pick<聊天消息, 'role' | 'content'>>;
  compilation: ZhikuTurnCompilation;
  prefixMode: boolean;
  prefixContent?: string;
  scope: string;
  transport: string;
  endpoint: string;
  streaming: boolean;
}

export interface ZhikuStage6EffectAbResult {
  withV3: ZhikuStage6Payload;
  withoutV3: ZhikuStage6Payload;
  assertions: Array<{ id: string; passed: boolean; detail: string }>;
}

export interface ZhikuStage6Payload {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  requestHash: string;
}

export interface ZhikuStage6ModeEquivalenceResult {
  sameFinalSelection: boolean;
  sameStaticInjection: boolean;
  sameCharacterCalibration: boolean;
  passed: boolean;
  reasons: string[];
}

export function compareZhikuStage6Modes(
  nativeCompilation: Pick<ZhikuTurnCompilation, 'mainStoryInjection' | 'characterEnforcementBrief' | 'entries'>,
  tavernCompilation: Pick<ZhikuTurnCompilation, 'mainStoryInjection' | 'characterEnforcementBrief' | 'entries'>,
): ZhikuStage6ModeEquivalenceResult {
  const nativeInjection = nativeCompilation.mainStoryInjection;
  const tavernInjection = tavernCompilation.mainStoryInjection;
  const sameFinalSelection = nativeCompilation.entries.map((entry) => entry.id).join('|') === tavernCompilation.entries.map((entry) => entry.id).join('|');
  const sameStaticInjection = nativeInjection === tavernInjection;
  const sameCharacterCalibration = nativeCompilation.characterEnforcementBrief === tavernCompilation.characterEnforcementBrief;
  const reasons = [
    sameFinalSelection ? '' : '普通模式与 Tavern V2 最终资料 ID 不一致。',
    sameStaticInjection ? '' : '普通模式与 Tavern V2 静态注入不一致。',
    sameCharacterCalibration ? '' : '普通模式与 Tavern V2 人物校准不一致。',
  ].filter(Boolean);
  return {
    sameFinalSelection,
    sameStaticInjection,
    sameCharacterCalibration,
    passed: reasons.length === 0,
    reasons,
  };
}

export function buildZhikuStage6EffectAb(input: BuildZhikuStage6EffectAbInput): ZhikuStage6EffectAbResult {
  const withV3System = String(input.systemPrompt);
  const withV3Messages = input.messages.map(({ role, content }) => ({ role, content }));
  const withoutV3System = removeExactBlock(withV3System, input.compilation.mainStoryInjection);
  const withoutV3Messages = withV3Messages.map((message) => ({
    ...message,
    content: removeExactBlock(message.content, input.compilation.characterEnforcementBrief),
  }));
  const createHash = (systemPrompt: string, messages: Array<{ role: string; content: string }>, compileId: string) => createMainRequestHash({
    systemPrompt,
    messages,
    prefixMode: input.prefixMode,
    prefixContent: input.prefixContent,
    scope: input.scope,
    zhikuCompileId: compileId,
    transport: input.transport,
    endpoint: input.endpoint,
    streaming: input.streaming,
  });
  const withV3: ZhikuStage6Payload = {
    systemPrompt: withV3System,
    messages: withV3Messages,
    requestHash: createHash(withV3System, withV3Messages, input.compilation.compileId),
  };
  const withoutV3: ZhikuStage6Payload = {
    systemPrompt: withoutV3System,
    messages: withoutV3Messages,
    requestHash: createHash(withoutV3System, withoutV3Messages, `${input.compilation.compileId}:without-v3`),
  };
  const aText = flattenPayload(withV3);
  const bText = flattenPayload(withoutV3);
  const staticBlock = input.compilation.mainStoryInjection.trim();
  const calibrationBlock = input.compilation.characterEnforcementBrief.trim();
  return {
    withV3,
    withoutV3,
    assertions: [
      {
        id: 'a-keeps-static-injection',
        passed: !staticBlock || aText.includes(staticBlock),
        detail: staticBlock ? 'A 组保留 V3 静态注入。' : '本 fixture 没有静态注入。',
      },
      {
        id: 'b-removes-static-injection',
        passed: !staticBlock || !bText.includes(staticBlock),
        detail: 'B 组只移除当前编译结果的 V3 静态注入。',
      },
      {
        id: 'b-removes-character-calibration',
        passed: !calibrationBlock || !bText.includes(calibrationBlock),
        detail: 'B 组只移除当前编译结果的人物校准块。',
      },
      {
        id: 'message-shape-stable',
        passed: withV3.messages.length === withoutV3.messages.length
          && withV3.messages.every((message, index) => message.role === withoutV3.messages[index]?.role),
        detail: 'A/B 消息数量和角色顺序保持一致。',
      },
      {
        id: 'no-legacy-fallback',
        passed: !bText.includes('zhikuInjectionOverride'),
        detail: 'B 组不启用旧智库覆盖或回退分支。',
      },
    ],
  };
}

export function createZhikuStage6IsolationFingerprint(value: unknown): string {
  return hashText(stableStringify(value));
}

export function formatZhikuStage6FixtureAudit(
  audit: ZhikuStage6FixtureAudit,
  execution?: { provider?: string; model?: string },
): string {
  return [
    `固定场景：${audit.fixtureCount} 个`,
    `稳定资料引用：${audit.referencedEntryCount} 个`,
    `缺失 ID：${audit.missingEntryIds.join('、') || '无'}`,
    `待确认主模型：${execution?.provider || '未配置'} / ${execution?.model || '未配置'}`,
    `完整矩阵主模型请求：${audit.totalRequestGroups} 次（智库 AI 补充调用另计）`,
    '真实 API：未调用',
    '',
    ...audit.fixtures.map((fixture) => `${fixture.ready ? '就绪' : '缺失'}｜${fixture.id}｜${fixture.title}｜${fixture.requestGroups} 组${fixture.missingEntryIds.length ? `｜缺少 ${fixture.missingEntryIds.join('、')}` : ''}`),
  ].join('\n');
}

function removeExactBlock(value: string, block: string): string {
  const target = block.trim();
  if (!target || !value.includes(target)) return value;
  return value
    .replace(target, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function flattenPayload(payload: ZhikuStage6Payload): string {
  return [payload.systemPrompt, ...payload.messages.map((message) => message.content)].join('\n');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
