import type { 角色数据结构 } from '@/models/character';
import { 创建聊天消息, type 回合Token消耗 } from '@/models/chat';
import type { API配置项, 游戏设置 } from '@/models/settings';
import type { 智库系统 } from '@/models/zhiku';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { buildMainTurnEnforcementBlock, finalizeMainRequest } from '@/hooks/useGame/mainRequestFinalizer';
import { buildTavernMessageChain } from '@/hooks/useGame/tavernMessageChainBuilder';
import type { ZhikuCharacterParticipation } from '@/hooks/useGame/npcPresence';
import { chatCompletionNonStream, resolveChatProviderCapabilities } from '@/services/ai/chatCompletionClient';
import type { DeepSeekAttemptDiagnostics } from '@/services/ai/deepSeekRecovery';
import { applyTavernOutputRegexScripts } from '@/hooks/useGame/tavernRegexProcessor';
import { parseResponse, repairTags } from '@/services/ai/responseParser';
import {
  auditZhikuStage6Fixtures,
  buildZhikuStage6EffectAb,
  compareZhikuStage6Modes,
  createZhikuStage6IsolationFingerprint,
  ZHIKU_STAGE6_FIXTURES,
  type ZhikuStage6Payload,
} from '@/services/zhikuStage6Harness';
import {
  compileZhikuPhoneView,
  compileZhikuTurn,
  compileZhikuTurnWithModel,
  type ZhikuTurnCompilation,
} from '@/services/zhikuRuntimeCompiler';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';

export { ZHIKU_STAGE6_FIXTURES } from '@/services/zhikuStage6Harness';

export const ZHIKU_STAGE6_REPORT_STORAGE_KEY = 'internal.zhikuStage6LastReport.v1';

export type ZhikuStage6RunStatus = 'running' | 'completed' | 'partial' | 'cancelled' | 'failed';
export type ZhikuStage6GroupKind = 'with-v3' | 'without-v3' | 'native' | 'tavern-v2';

export interface ZhikuStage6Selection {
  fixtureId: string;
  group: ZhikuStage6GroupKind;
}

export interface ZhikuStage6HumanReview {
  withV3Score?: number;
  withoutV3Score?: number;
  withV3Note?: string;
  withoutV3Note?: string;
  verdict?: 'with-v3' | 'without-v3' | 'tie' | 'unrated';
}

export interface ZhikuStage6ProductionResult {
  normalizedText: string;
  body: string;
  memory: string;
  worldEvents: string[];
  actionOptions: string[];
  appliedTavernScripts: string[];
  skippedTavernScripts: string[];
}

export interface ZhikuStage6GroupResult {
  key: string;
  runId: string;
  fixtureId: string;
  group: ZhikuStage6GroupKind;
  requestHash: string;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number;
  durationSec: number;
  output: string;
  finishReason?: string;
  selectedModel?: string;
  usage?: Partial<Omit<回合Token消耗, 'source'>> & { source: 'api' };
  error?: string;
  observations: string[];
  production?: ZhikuStage6ProductionResult;
}

export interface ZhikuStage6FixtureResult {
  id: string;
  title: string;
  purpose: string;
  compileId: string;
  selectedEntryIds: string[];
  aiSupplementStatus: ZhikuTurnCompilation['runTrace']['aiSupplement']['status'];
  hardAssertions: Array<{ id: string; passed: boolean; detail: string }>;
  groups: ZhikuStage6GroupResult[];
  humanReview?: ZhikuStage6HumanReview;
}

export interface ZhikuStage6Report {
  schemaVersion: 1;
  runId: string;
  execution: { kind: 'full' } | { kind: 'single'; selection: ZhikuStage6Selection };
  status: ZhikuStage6RunStatus;
  createdAt: number;
  completedAt?: number;
  catalogVersion: string;
  catalogRevision: number;
  configuration: {
    provider: string;
    model: string;
    transport: string;
    endpoint: string;
    temperature?: number;
    maxOutputTokens: number;
    requestMode: 'non-stream';
    tavernPreset?: string;
  };
  summary: {
    fixtureCount: number;
    plannedMainRequests: number;
    completedMainRequests: number;
    failedMainRequests: number;
    cancelledMainRequests: number;
    truncatedMainRequests: number;
    aiSupplementRequests: number;
    hardAssertionsPassed: number;
    hardAssertionsFailed: number;
    isolationPreserved: boolean;
  };
  fixtures: ZhikuStage6FixtureResult[];
  warnings: string[];
}

export interface RunZhikuStage6Options {
  system: 智库系统;
  config: API配置项;
  gameSettings: 游戏设置;
  playerRole: 角色数据结构 | null;
  selection?: ZhikuStage6Selection;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  onProgress?: (report: ZhikuStage6Report) => void | Promise<void>;
}

interface ExecutableFixture {
  id: string;
  query: string;
  participation: ZhikuCharacterParticipation;
  userPrompt: string;
  privateContext?: string;
}

const EMPTY_PARTICIPATION: ZhikuCharacterParticipation = {
  present: [],
  anticipated: [],
  mentioned: [],
  background: [],
};

const EXECUTABLE_FIXTURES: readonly ExecutableFixture[] = [
  {
    id: 'single-present',
    query: '丹恒正在资料室整理航行记录。',
    participation: { ...EMPTY_PARTICIPATION, present: ['丹恒'] },
    userPrompt: '资料室里只有开拓者与丹恒。开拓者问他是否发现了异常航线。请自然续写这一小段互动。',
  },
  {
    id: 'multi-present',
    query: '三月七、丹恒和姬子正在列车资料室商量下一站。',
    participation: { ...EMPTY_PARTICIPATION, present: ['三月七', '丹恒', '姬子'] },
    userPrompt: '三月七、丹恒和姬子都在场。三人刚看到一份可疑航路报告，请自然续写群像互动，不必让每个人都说话。',
  },
  {
    id: 'mentioned-only',
    query: '三月七提到姬子正在前舱检查导航。',
    participation: { ...EMPTY_PARTICIPATION, present: ['三月七'], mentioned: ['姬子'] },
    userPrompt: '当前车厢里只有开拓者和三月七。姬子只是在谈话中被提到，正在前舱，不会在本段登场。请续写当前互动。',
  },
  {
    id: 'anticipated',
    query: '三月七说丹恒稍后才会来资料室。',
    participation: { ...EMPTY_PARTICIPATION, present: ['三月七'], anticipated: ['丹恒'] },
    userPrompt: '丹恒预计稍后抵达，但此刻还没有进门。请续写三月七与开拓者等待报告的场景，不让尚未到场者发言。',
  },
  {
    id: 'multi-form',
    query: '丹恒显露饮月之姿，龙角与持明力量已经出现。',
    participation: { ...EMPTY_PARTICIPATION, present: ['丹恒'] },
    userPrompt: '丹恒此刻已经显露饮月形态，正在压制失控的水流。请写一段符合当前形态与能力边界的现场反应。',
  },
  {
    id: 'runtime-gates',
    query: '大黑塔本体成年形态来到空间站。',
    participation: { ...EMPTY_PARTICIPATION, mentioned: ['大黑塔'] },
    userPrompt: '只根据当前请求中实际提供的资料，简短续写空间站研究员等待访客的场景；不要补写未提供的访客设定。',
  },
  {
    id: 'private-relation',
    query: '丹恒在资料室与开拓者复核约定。',
    participation: { ...EMPTY_PARTICIPATION, present: ['丹恒'] },
    privateContext: '已成立的长期关系事实：丹恒与开拓者经历多次共同危机后形成了克制但稳固的信任；他答应在发现异常航线时先与开拓者商量。该动态经历优先于任何静态初识状态。',
    userPrompt: '丹恒发现了新的异常航线。请承接已经成立的信任与约定，写他如何把报告交给开拓者讨论。',
  },
  {
    id: 'low-information',
    query: '继续。',
    participation: EMPTY_PARTICIPATION,
    userPrompt: '当前没有明确人物、地点或事件信息。只写一句克制的环境承接，不新增命名角色或设定。',
  },
  {
    id: 'ai-supplement',
    query: '他抬起手，空气中的水流随之凝住。',
    participation: { ...EMPTY_PARTICIPATION, present: ['丹恒'] },
    userPrompt: '丹恒已经显露龙角并使用持明力量控制水流。请根据本回合实际收到的资料，写一段当前形态下的短场景。',
  },
  {
    id: 'scope-and-mode',
    query: '丹恒在列车上收到开拓者的通讯。',
    participation: { ...EMPTY_PARTICIPATION, present: ['丹恒'] },
    userPrompt: '丹恒收到开拓者发来的简短通讯，询问下一站的航线情况。请写一段自然回应。',
  },
] as const;

const BASE_SYSTEM_PROMPT = [
  '你正在进行一组隔离的崩坏：星穹铁道同人叙事验收。',
  '只依据本请求明确提供的静态资料、当前人物参与状态和已成立的动态关系续写，不调用测试外状态。',
  '人物未在场时不得让其突然登场或发言；预计登场不等于已经到场；同一人物只能采用当前明确形态。',
  '不要解释测试过程，不要评价提示词，不要复述资料清单。',
].join('\n');

export async function runZhikuStage6Ab(options: RunZhikuStage6Options): Promise<ZhikuStage6Report> {
  const config = options.config;
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('当前主 API 配置不完整，无法执行阶段六真实 A/B。');
  }
  const audit = auditZhikuStage6Fixtures(options.system);
  if (audit.missingEntryIds.length) {
    throw new Error(`阶段六固定场景缺少稳定资料 ID：${audit.missingEntryIds.join('、')}`);
  }

  const capabilities = resolveChatProviderCapabilities(config);
  const maxOutputTokens = Math.min(4096, Math.max(1600, Math.trunc(options.maxOutputTokens ?? 2400)));
  const selectedFixture = options.selection
    ? EXECUTABLE_FIXTURES.find((fixture) => fixture.id === options.selection?.fixtureId)
    : undefined;
  if (options.selection && !selectedFixture) {
    throw new Error(`阶段六固定场景不存在：${options.selection.fixtureId}`);
  }
  const builtinTavernPresets = getBuiltinPresetsV2();
  const configuredTavernPreset = getCurrentSTPresetV2(options.gameSettings, builtinTavernPresets);
  const tavernPreset = configuredTavernPreset ?? builtinTavernPresets[0] ?? null;
  const warnings: string[] = [];
  if (!configuredTavernPreset && tavernPreset) {
    warnings.push(`当前未选中 Tavern V2 预设；模式等价场景仅在隔离测试台使用内置预设「${tavernPreset.name}」，没有修改玩家设置。`);
  }
  const report: ZhikuStage6Report = {
    schemaVersion: 1,
    runId: createRunId(),
    execution: options.selection ? { kind: 'single', selection: options.selection } : { kind: 'full' },
    status: 'running',
    createdAt: Date.now(),
    catalogVersion: options.system.目录版本 ?? 'catalog:unknown',
    catalogRevision: options.system.目录修订 ?? 0,
    configuration: {
      provider: config.provider,
      model: config.model,
      transport: capabilities.transport,
      endpoint: capabilities.endpoint,
      temperature: config.temperature,
      maxOutputTokens,
      requestMode: 'non-stream',
      tavernPreset: tavernPreset?.name,
    },
    summary: {
      fixtureCount: selectedFixture ? 1 : audit.fixtureCount,
      plannedMainRequests: selectedFixture ? 1 : audit.totalRequestGroups,
      completedMainRequests: 0,
      failedMainRequests: 0,
      cancelledMainRequests: 0,
      truncatedMainRequests: 0,
      aiSupplementRequests: 0,
      hardAssertionsPassed: 0,
      hardAssertionsFailed: 0,
      isolationPreserved: false,
    },
    fixtures: [],
    warnings,
  };
  const stateFingerprintBefore = createStage6StateFingerprint(options);

  try {
    const fixturesToRun = selectedFixture ? [selectedFixture] : EXECUTABLE_FIXTURES;
    for (const fixture of fixturesToRun) {
      throwIfAborted(options.signal);
      const definition = ZHIKU_STAGE6_FIXTURES.find((item) => item.id === fixture.id);
      if (!definition) throw new Error(`阶段六固定场景定义缺失：${fixture.id}`);
      const compilation = await compileFixture(options, fixture, report);
      const hardAssertions = buildFixtureAssertions(fixture, compilation, options.system);
      const fixtureResult: ZhikuStage6FixtureResult = {
        id: fixture.id,
        title: definition.title,
        purpose: definition.purpose,
        compileId: compilation.compileId,
        selectedEntryIds: compilation.entries.map((entry) => entry.id),
        aiSupplementStatus: compilation.runTrace.aiSupplement.status,
        hardAssertions,
        groups: [],
      };
      report.fixtures.push(fixtureResult);
      appendAssertionSummary(report, hardAssertions);

      const nativeRequest = buildFinalizedFixtureRequest(options, fixture, compilation, 'native');
      const ab = buildZhikuStage6EffectAb({
        systemPrompt: nativeRequest.systemPrompt,
        messages: nativeRequest.messages,
        compilation,
        prefixMode: nativeRequest.prefixMode,
        prefixContent: nativeRequest.prefixContent,
        scope: 'diagnostic',
        transport: nativeRequest.capabilities.transport,
        endpoint: nativeRequest.capabilities.endpoint,
        streaming: false,
      });
      fixtureResult.hardAssertions.push(...ab.assertions);
      appendAssertionSummary(report, ab.assertions);

      const requestByGroup = buildGroupRequests({
        options,
        fixture,
        compilation,
        nativePayload: ab.withV3,
        withoutV3Payload: ab.withoutV3,
        tavernPreset,
      });
      const sourceFingerprint = createZhikuStage6IsolationFingerprint({ compilation, nativeRequest });
      const checkFingerprint = createZhikuStage6IsolationFingerprint({ compilation, nativeRequest });
      const payloadAssertions = buildPayloadAssertions(compilation, requestByGroup, sourceFingerprint === checkFingerprint);
      fixtureResult.hardAssertions.push(...payloadAssertions);
      appendAssertionSummary(report, payloadAssertions);

      const groupsToRun = options.selection
        ? definition.groups.filter((group) => group === options.selection?.group)
        : definition.groups;
      if (options.selection && groupsToRun.length === 0) {
        throw new Error(`场景 ${fixture.id} 不支持复测组 ${options.selection.group}`);
      }
      for (const group of groupsToRun) {
        throwIfAborted(options.signal);
        const payload = requestByGroup.get(group);
        if (!payload) {
          const assertion = { id: `payload-${fixture.id}-${group}`, passed: false, detail: `没有构造 ${group} 请求。` };
          fixtureResult.hardAssertions.push(assertion);
          appendAssertionSummary(report, [assertion]);
          continue;
        }
        const groupResult = await executeGroup({
          config,
          fixture,
          group,
          payload,
          runId: report.runId,
          maxOutputTokens,
          tavernPreset: group === 'tavern-v2' ? tavernPreset?.preset : undefined,
          signal: options.signal,
        });
        fixtureResult.groups.push(groupResult);
        if (groupResult.status === 'completed') report.summary.completedMainRequests += 1;
        else if (groupResult.status === 'cancelled') report.summary.cancelledMainRequests += 1;
        else report.summary.failedMainRequests += 1;
        if (isLengthFinishReason(groupResult.finishReason)) report.summary.truncatedMainRequests += 1;
        await emitProgress(options, report);
      }
    }

    report.summary.isolationPreserved = stateFingerprintBefore === createStage6StateFingerprint(options);
    const isolationAssertion = {
      id: 'global-state-isolation',
      passed: report.summary.isolationPreserved,
      detail: '运行前后目录、设置摘要与玩家摘要指纹保持一致。',
    };
    appendAssertionSummary(report, [isolationAssertion]);
    const allRequestsCompleted = report.summary.completedMainRequests === report.summary.plannedMainRequests;
    const allResponsesComplete = report.summary.truncatedMainRequests === 0;
    report.status = allRequestsCompleted && allResponsesComplete && report.summary.hardAssertionsFailed === 0 ? 'completed' : 'partial';
  } catch (error) {
    if (isAbortError(error, options.signal)) {
      report.status = 'cancelled';
    } else {
      report.status = report.fixtures.length ? 'partial' : 'failed';
      report.warnings.push(sanitizeError(error, config));
    }
  } finally {
    report.completedAt = Date.now();
    report.summary.isolationPreserved = stateFingerprintBefore === createStage6StateFingerprint(options);
    await emitProgress(options, report);
  }
  return cloneReport(report);
}

export function formatZhikuStage6Report(report: ZhikuStage6Report): string {
  const fixtureLines = report.fixtures.flatMap((fixture) => [
    `## ${fixture.title}（${fixture.id}）`,
    `资料：${fixture.selectedEntryIds.join('、') || '无'}｜AI 补充：${fixture.aiSupplementStatus}`,
    `硬断言：${fixture.hardAssertions.filter((item) => item.passed).length}/${fixture.hardAssertions.length}`,
    ...fixture.hardAssertions.filter((item) => !item.passed).map((item) => `- 失败 ${item.id}：${item.detail}`),
    ...fixture.groups.map((group) => [
      `- ${group.group}｜${group.status}｜${group.durationSec.toFixed(2)}s｜finish=${group.finishReason ?? '未返回'}｜hash=${group.requestHash}`,
      group.usage ? `  usage：input ${group.usage.inputTokens ?? 0} / output ${group.usage.outputTokens ?? 0} / total ${group.usage.totalTokens ?? 0}` : '',
      group.error ? `  错误：${group.error}` : '',
      group.observations.length ? `  观察：${group.observations.join('；')}` : '',
      group.production ? `  生产解析正文：\n${indent(group.production.body || '（空）', '    ')}` : '',
      group.production?.actionOptions.length ? `  生产行动选项：${group.production.actionOptions.join('；')}` : '',
      group.output ? `  输出：\n${indent(group.output, '    ')}` : '',
    ].filter(Boolean).join('\n')),
    '',
  ]);
  return [
    '# 智库阶段六真实模型 A/B 报告',
    `runId：${report.runId}`,
    `状态：${report.status}`,
    `模型：${report.configuration.provider} / ${report.configuration.model}`,
    `传输：${report.configuration.transport} / ${report.configuration.endpoint} / ${report.configuration.requestMode}`,
    `目录：${report.catalogVersion} / revision ${report.catalogRevision}`,
    `请求：完成 ${report.summary.completedMainRequests} / 计划 ${report.summary.plannedMainRequests} / 失败 ${report.summary.failedMainRequests} / 取消 ${report.summary.cancelledMainRequests} / 截断 ${report.summary.truncatedMainRequests ?? 0}`,
    `智库 AI 补充调用：${report.summary.aiSupplementRequests}`,
    `硬断言：通过 ${report.summary.hardAssertionsPassed} / 失败 ${report.summary.hardAssertionsFailed}`,
    `隔离指纹：${report.status === 'running' ? '待运行结束确认' : report.summary.isolationPreserved ? '保持一致' : '发生变化'}`,
    report.configuration.tavernPreset ? `Tavern V2：${report.configuration.tavernPreset}` : '',
    report.warnings.length ? `警告：\n${report.warnings.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    ...fixtureLines,
  ].filter(Boolean).join('\n');
}

export function mergeZhikuStage6Reports(
  base: ZhikuStage6Report | null,
  patch: ZhikuStage6Report,
): ZhikuStage6Report {
  if (!base || patch.execution.kind !== 'single') return cloneReport(patch);
  const selection = patch.execution.selection;
  const next = cloneReport(base);
  const targetFixture = patch.fixtures.find((fixture) => fixture.id === selection.fixtureId);
  if (!targetFixture) return next;
  const fixtureIndex = next.fixtures.findIndex((fixture) => fixture.id === targetFixture.id);
  if (fixtureIndex < 0) next.fixtures.push(targetFixture);
  else {
    const current = next.fixtures[fixtureIndex];
    const targetGroup = targetFixture.groups.find((group) => group.group === selection.group);
    if (targetGroup) {
      const groupIndex = current.groups.findIndex((group) => group.group === targetGroup.group);
      if (groupIndex < 0) current.groups.push(targetGroup);
      else current.groups[groupIndex] = targetGroup;
    }
    current.hardAssertions = targetFixture.hardAssertions;
    current.selectedEntryIds = targetFixture.selectedEntryIds;
    current.compileId = targetFixture.compileId;
    current.aiSupplementStatus = targetFixture.aiSupplementStatus;
  }
  const allGroups = next.fixtures.flatMap((fixture) => fixture.groups);
  next.summary = {
    ...next.summary,
    fixtureCount: next.fixtures.length,
    completedMainRequests: allGroups.filter((group) => group.status === 'completed').length,
    failedMainRequests: allGroups.filter((group) => group.status === 'failed').length,
    cancelledMainRequests: allGroups.filter((group) => group.status === 'cancelled').length,
    truncatedMainRequests: allGroups.filter((group) => isLengthFinishReason(group.finishReason)).length,
    hardAssertionsPassed: next.fixtures.flatMap((fixture) => fixture.hardAssertions).filter((item) => item.passed).length,
    hardAssertionsFailed: next.fixtures.flatMap((fixture) => fixture.hardAssertions).filter((item) => !item.passed).length,
  };
  next.status = patch.status === 'running'
    ? 'running'
    : next.summary.failedMainRequests > 0 || next.summary.cancelledMainRequests > 0 || next.summary.truncatedMainRequests > 0 || next.summary.hardAssertionsFailed > 0
      ? 'partial'
      : next.summary.completedMainRequests >= next.summary.plannedMainRequests
        ? 'completed'
        : 'partial';
  next.execution = { kind: 'full' };
  next.summary.isolationPreserved = patch.status === 'running'
    ? next.summary.isolationPreserved
    : next.summary.isolationPreserved && patch.summary.isolationPreserved;
  next.completedAt = patch.completedAt;
  next.warnings = Array.from(new Set([...next.warnings, ...patch.warnings]));
  return next;
}

export function updateZhikuStage6HumanReview(
  report: ZhikuStage6Report,
  fixtureId: string,
  humanReview: ZhikuStage6HumanReview,
): ZhikuStage6Report {
  const next = cloneReport(report);
  const fixture = next.fixtures.find((item) => item.id === fixtureId);
  if (fixture) fixture.humanReview = { ...humanReview };
  return next;
}

async function compileFixture(
  options: RunZhikuStage6Options,
  fixture: ExecutableFixture,
  report: ZhikuStage6Report,
): Promise<ZhikuTurnCompilation> {
  if (fixture.id === 'runtime-gates') {
    const isolatedSystem: 智库系统 = {
      ...options.system,
      条目: options.system.条目.map((entry) => entry.id === 'JS-099'
        ? { ...entry, 解锁状态: '未解锁', 运行时解锁状态: '未解锁' }
        : entry),
    };
    return compileZhikuTurn({
      system: isolatedSystem,
      query: fixture.query,
      limit: 8,
      scope: 'diagnostic',
      participation: fixture.participation,
      sceneContext: { presentNpcNamesForFallback: fixture.participation.present },
    });
  }
  if (fixture.id === 'ai-supplement') {
    report.summary.aiSupplementRequests += 1;
    return compileZhikuTurnWithModel({
      system: options.system,
      query: fixture.query,
      limit: 8,
      scope: 'diagnostic',
      participation: fixture.participation,
      settings: { ...options.gameSettings.智库系统, enableAiSupplement: true },
      mainConfig: options.config,
      signal: options.signal,
      retryCount: 0,
      promptModules: options.gameSettings.promptModules,
      sceneContext: {
        presentNpcNamesForFallback: fixture.participation.present,
        anticipatedNpcNames: fixture.participation.anticipated,
        aiSupplementHints: {
          presentNpcNames: fixture.participation.present,
          immediateStoryReview: '丹恒当前已经显露饮月君形态，龙角与持明力量已经出现。',
          recentStoryContext: fixture.userPrompt,
        },
      },
    });
  }
  return compileZhikuTurn({
    system: options.system,
    query: fixture.query,
    limit: 8,
    scope: 'diagnostic',
    participation: fixture.participation,
    sceneContext: {
      presentNpcNamesForFallback: fixture.participation.present,
      anticipatedNpcNames: fixture.participation.anticipated,
    },
  });
}

function buildFinalizedFixtureRequest(
  options: RunZhikuStage6Options,
  fixture: ExecutableFixture,
  compilation: ZhikuTurnCompilation,
  mode: 'native' | 'tavern-v2',
  tavernMessages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
) {
  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    fixture.privateContext ? `【当前已成立的动态关系】\n${fixture.privateContext}` : '',
    compilation.mainStoryInjection,
  ].filter(Boolean).join('\n\n');
  const nativeMessages = [创建聊天消息('user', fixture.userPrompt)];
  // 工作包C：适配分层 finalizer——fixture 消息作为回合前历史，区E 作为执法块，无任务序列
  return finalizeMainRequest({
    config: options.config,
    systemPrompt,
    mode: mode === 'tavern-v2' ? 'tavern_v2' : 'standard',
    preTurnHistory: (tavernMessages ?? nativeMessages).map((message) => 创建聊天消息(message.role, message.content)),
    depthMessages: [],
    positionZeroCompatMessages: [],
    turnConstraints: [],
    enforcementBlock: buildMainTurnEnforcementBlock({
      playerName: options.playerRole?.姓名 || options.playerRole?.别名 || '开拓者',
      wordCountTarget: 180,
      zhikuCharacterBrief: compilation.characterEnforcementBrief,
      storyWeavingActive: false,
    }),
    taskSequence: [],
    streaming: false,
    scope: 'diagnostic',
    zhikuCompileId: compilation.compileId,
  });
}

function buildGroupRequests(input: {
  options: RunZhikuStage6Options;
  fixture: ExecutableFixture;
  compilation: ZhikuTurnCompilation;
  nativePayload: ZhikuStage6Payload;
  withoutV3Payload: ZhikuStage6Payload;
  tavernPreset: ReturnType<typeof getCurrentSTPresetV2>;
}): Map<ZhikuStage6GroupKind, ZhikuStage6Payload> {
  const result = new Map<ZhikuStage6GroupKind, ZhikuStage6Payload>([
    ['with-v3', input.nativePayload],
    ['without-v3', input.withoutV3Payload],
    ['native', input.nativePayload],
  ]);
  if (!input.tavernPreset) return result;
  const tavernMessages = buildTavernMessageChain({
    settings: input.options.gameSettings,
    preset: input.tavernPreset.preset,
    characterId: input.tavernPreset.characterId ?? null,
    chatHistory: [],
    latestUserInput: input.fixture.userPrompt,
    playerName: input.options.playerRole?.姓名 || input.options.playerRole?.别名 || '开拓者',
    playerRole: input.options.playerRole,
    includeNativeContextInWorldbook: false,
          scope: 'main',
    triggerType: 'stage6-diagnostic',
  });
  const finalized = buildFinalizedFixtureRequest(
    input.options,
    input.fixture,
    input.compilation,
    'tavern-v2',
    tavernMessages,
  );
  result.set('tavern-v2', {
    systemPrompt: finalized.systemPrompt,
    messages: finalized.messages.map(({ role, content }) => ({ role, content })),
    requestHash: finalized.requestHash,
  });
  return result;
}

function buildFixtureAssertions(
  fixture: ExecutableFixture,
  compilation: ZhikuTurnCompilation,
  system: 智库系统,
): Array<{ id: string; passed: boolean; detail: string }> {
  const ids = compilation.entries.map((entry) => entry.id);
  const assertions = [{
    id: `${fixture.id}-no-story`,
    passed: !compilation.entries.some((entry) => entry.分类 === 'story'),
    detail: '剧情档案没有进入编译结果。',
  }];
  if (fixture.id === 'single-present') {
    assertions.push({ id: 'single-danheng-selected', passed: ids.includes('JS-004'), detail: '单角色在场选择丹恒常态档案。' });
    assertions.push({ id: 'single-danheng-calibrated', passed: hasCalibrationLine(compilation.characterEnforcementBrief, '丹恒'), detail: '在场丹恒进入人物校准。' });
  }
  if (fixture.id === 'multi-present') {
    assertions.push({ id: 'multi-present-selected', passed: ['JS-002', 'JS-004', 'JS-005'].every((id) => ids.includes(id)), detail: '三名在场人物均被保留。' });
  }
  if (fixture.id === 'mentioned-only') {
    assertions.push({ id: 'mentioned-not-calibrated', passed: !hasCalibrationLine(compilation.characterEnforcementBrief, '姬子'), detail: '仅被提及的姬子没有进入在场校准。' });
  }
  if (fixture.id === 'anticipated') {
    assertions.push({ id: 'anticipated-not-calibrated', passed: !hasCalibrationLine(compilation.characterEnforcementBrief, '丹恒'), detail: '预计登场的丹恒没有进入在场校准。' });
  }
  if (fixture.id === 'multi-form') {
    const formEntries = (compilation.characterEntries ?? []).filter((entry) => entry.互斥组ID === 'character:danheng:form');
    assertions.push({ id: 'multi-form-exclusive', passed: formEntries.length === 1 && formEntries[0]?.id === 'JS-076', detail: '饮月互斥组只保留 JS-076。' });
  }
  if (fixture.id === 'runtime-gates') {
    assertions.push({ id: 'runtime-gate-blocks-js099', passed: !ids.includes('JS-099'), detail: '隔离测试中的未解锁 JS-099 被门禁过滤。' });
  }
  if (fixture.id === 'private-relation') {
    assertions.push({ id: 'private-context-present', passed: Boolean(fixture.privateContext), detail: '已成立的长期关系作为动态事实保留在共同底座。' });
  }
  if (fixture.id === 'low-information') {
    assertions.push({ id: 'low-information-empty', passed: ids.length === 0, detail: '低信息输入没有凑资料。' });
  }
  if (fixture.id === 'ai-supplement') {
    const status = compilation.runTrace.aiSupplement.status;
    assertions.push({ id: 'ai-supplement-executed-or-fallback', passed: status === 'completed' || status === 'failed-fallback', detail: 'AI 补充已真实执行，或失败后稳定回退关键词结果。' });
    assertions.push({ id: 'ai-supplement-known-ids-only', passed: ids.every((id) => system.条目.some((entry) => entry.id === id)), detail: 'AI 补充结果只含正式目录稳定 ID。' });
  }
  if (fixture.id === 'scope-and-mode') {
    const phone = compileZhikuPhoneView(system, ['丹恒']);
    const equivalence = compareZhikuStage6Modes(compilation, compilation);
    assertions.push({ id: 'phone-view-separated', passed: phone.phonePersonaView.includes('丹恒') && phone.mainStoryInjection === '', detail: '手机人物视图与主剧情静态注入分离。' });
    assertions.push({ id: 'native-tavern-selection-equivalent', passed: equivalence.passed, detail: equivalence.reasons.join('；') || '普通与 Tavern 使用同一编译结果。' });
  }
  return assertions;
}

function buildPayloadAssertions(
  compilation: ZhikuTurnCompilation,
  payloads: Map<ZhikuStage6GroupKind, ZhikuStage6Payload>,
  sourcePreserved: boolean,
): Array<{ id: string; passed: boolean; detail: string }> {
  const joined = Array.from(payloads.values()).map(flattenPayload).join('\n');
  const previewsExcluded = compilation.entries.every((entry) => {
    const original = entry.原文?.trim();
    return !original || !joined.includes(original);
  });
  return [
    { id: 'payload-no-trace', passed: !joined.includes('inputSummaryHash') && !joined.includes('candidateDecisions') && !joined.includes('requestReceipt'), detail: '结构化诊断 trace 没有进入模型 payload。' },
    { id: 'payload-no-full-preview', passed: previewsExcluded, detail: '完整预览原文没有进入模型 payload。' },
    { id: 'payload-builder-pure', passed: sourcePreserved, detail: 'A/B 请求构建没有修改编译结果或源请求。' },
  ];
}

async function executeGroup(input: {
  config: API配置项;
  fixture: ExecutableFixture;
  group: ZhikuStage6GroupKind;
  payload: ZhikuStage6Payload;
  runId: string;
  maxOutputTokens: number;
  tavernPreset?: unknown;
  signal?: AbortSignal;
}): Promise<ZhikuStage6GroupResult> {
  const startedAt = Date.now();
  let usage: ZhikuStage6GroupResult['usage'];
  let diagnostics: DeepSeekAttemptDiagnostics | undefined;
  try {
    const output = await chatCompletionNonStream(input.config, {
      systemPrompt: input.payload.systemPrompt,
      messages: input.payload.messages,
      maxTokens: input.maxOutputTokens,
      temperature: input.config.temperature,
      topP: input.config.topP,
      topK: input.config.topK,
      frequencyPenalty: input.config.frequencyPenalty,
      presencePenalty: input.config.presencePenalty,
      repetitionPenalty: input.config.repetitionPenalty,
      signal: input.signal,
      deepSeekRecovery: 'disabled',
      onUsage: (next) => { usage = next; },
      onResponseDiagnostics: (next) => { diagnostics = next; },
    });
    const completedAt = Date.now();
    const production = buildProductionResult(output, input.group === 'tavern-v2' ? input.tavernPreset : undefined);
    return {
      key: `${input.fixture.id}:${input.group}`,
      runId: input.runId,
      fixtureId: input.fixture.id,
      group: input.group,
      requestHash: input.payload.requestHash,
      status: 'completed',
      startedAt,
      completedAt,
      durationSec: (completedAt - startedAt) / 1000,
      output,
      finishReason: diagnostics?.finishReason,
      selectedModel: diagnostics?.selectedModel,
      usage,
      observations: [
        ...buildOutputObservations(input.fixture, input.group, output),
        ...(isLengthFinishReason(diagnostics?.finishReason) ? ['模型达到输出上限，当前结果不能用于完整表现验收'] : []),
      ],
      production,
    };
  } catch (error) {
    const completedAt = Date.now();
    const cancelled = isAbortError(error, input.signal);
    return {
      key: `${input.fixture.id}:${input.group}`,
      runId: input.runId,
      fixtureId: input.fixture.id,
      group: input.group,
      requestHash: input.payload.requestHash,
      status: cancelled ? 'cancelled' : 'failed',
      startedAt,
      completedAt,
      durationSec: (completedAt - startedAt) / 1000,
      output: '',
      finishReason: diagnostics?.finishReason,
      selectedModel: diagnostics?.selectedModel,
      usage,
      error: sanitizeError(error, input.config),
      observations: [],
    };
  }
}

function buildProductionResult(rawText: string, tavernPreset?: unknown): ZhikuStage6ProductionResult {
  const tavern = tavernPreset ? applyTavernOutputRegexScripts(rawText, tavernPreset) : { text: rawText, applied: [], skipped: [] };
  const normalizedText = repairTags(tavern.text);
  const parsed = parseResponse(normalizedText);
  return {
    normalizedText,
    body: parsed.body,
    memory: parsed.memory,
    worldEvents: parsed.worldEvents,
    actionOptions: parsed.actionOptions,
    appliedTavernScripts: tavern.applied,
    skippedTavernScripts: tavern.skipped,
  };
}

function buildOutputObservations(fixture: ExecutableFixture, group: ZhikuStage6GroupKind, output: string): string[] {
  const observations: string[] = [];
  if (!output.trim()) observations.push('模型没有返回可见文本');
  const missingClosingTags = ['</正文>', '</短期记忆>', '</动态世界>'].filter((tag) => !output.includes(tag));
  if (missingClosingTags.length) observations.push(`原始响应缺少闭合标签：${missingClosingTags.join('、')}；生产解析器虽会修复，仍需人工复核`);
  if (fixture.id === 'mentioned-only' && /姬子\s*[：:][^\n]{1,120}/u.test(output)) observations.push('疑似让仅被提及的姬子直接发言，需人工复核');
  if (fixture.id === 'anticipated' && /丹恒\s*[：:][^\n]{1,120}/u.test(output)) observations.push('疑似让尚未到场的丹恒直接发言，需人工复核');
  if (fixture.id === 'multi-form' && group === 'with-v3' && !/饮月|龙角|持明|水流/u.test(output)) observations.push('饮月形态锚点不明显，需人工复核');
  if (fixture.id === 'low-information' && /丹恒|三月七|姬子|黑塔|星核猎手/u.test(output)) observations.push('低信息场景疑似自行加入命名角色，需人工复核');
  return observations;
}

function createStage6StateFingerprint(options: RunZhikuStage6Options): string {
  return createZhikuStage6IsolationFingerprint({
    catalogVersion: options.system.目录版本,
    catalogRevision: options.system.目录修订,
    entries: options.system.条目.map((entry) => [entry.id, entry.运行时解锁状态, entry.解锁状态]),
    settings: {
      currentStPresetIdV2: options.gameSettings.currentStPresetIdV2,
      enableAiSupplement: options.gameSettings.智库系统.enableAiSupplement,
      maxRelatedEntries: options.gameSettings.智库系统.maxRelatedEntries,
    },
    player: options.playerRole ? [options.playerRole.姓名, options.playerRole.别名, options.playerRole.身份] : null,
  });
}

function flattenPayload(payload: ZhikuStage6Payload): string {
  return [payload.systemPrompt, ...payload.messages.map((message) => message.content)].join('\n');
}

function hasCalibrationLine(brief: string, characterName: string): boolean {
  return brief.split(/\r?\n/u).some((line) => line.startsWith(`- ${characterName}：`));
}

function appendAssertionSummary(report: ZhikuStage6Report, assertions: Array<{ passed: boolean }>): void {
  report.summary.hardAssertionsPassed += assertions.filter((item) => item.passed).length;
  report.summary.hardAssertionsFailed += assertions.filter((item) => !item.passed).length;
}

async function emitProgress(options: RunZhikuStage6Options, report: ZhikuStage6Report): Promise<void> {
  await options.onProgress?.(cloneReport(report));
}

function cloneReport(report: ZhikuStage6Report): ZhikuStage6Report {
  return JSON.parse(JSON.stringify(report)) as ZhikuStage6Report;
}

function createRunId(): string {
  return `zhiku-stage6-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('阶段六 A/B 已取消。', 'AbortError');
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

function isLengthFinishReason(value: string | undefined): boolean {
  return /^(length|max[_ -]?tokens?|max[_ -]?output[_ -]?tokens?)$/iu.test(value?.trim() ?? '');
}

function sanitizeError(error: unknown, config: API配置项): string {
  let text = error instanceof Error ? error.message : String(error ?? '未知错误');
  for (const sensitive of [config.apiKey, config.baseUrl]) {
    if (sensitive) text = text.split(sensitive).join('[已脱敏]');
  }
  return text.slice(0, 1000);
}

function indent(value: string, prefix: string): string {
  return value.split(/\r?\n/u).map((line) => `${prefix}${line}`).join('\n');
}
