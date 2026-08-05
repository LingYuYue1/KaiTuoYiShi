import type { 智库分类 } from '@/models/zhiku';
import { estimateTextTokens } from '@/utils/tokenEstimate';

export type ZhikuTraceChannel =
  | 'keyword'
  | 'present-fallback'
  | 'ai-candidate'
  | 'ai-supplement'
  | 'ai-form-override';

export type ZhikuTraceDecision =
  | 'selected'
  | 'candidate'
  | 'filtered'
  | 'trimmed'
  | 'rejected'
  | 'replaced';

export type ZhikuTraceFinalRole = 'character' | 'strong' | 'weak' | 'none';

export interface ZhikuCandidateDecisionTrace {
  entryId: string;
  title: string;
  category: 智库分类 | 'unknown';
  channels: ZhikuTraceChannel[];
  evidence: string[];
  gate: {
    passed: boolean;
    reason?: string;
  };
  decision: ZhikuTraceDecision;
  decisionReason: string;
  finalRole: ZhikuTraceFinalRole;
  stableOrder: number;
  exclusionGroupId?: string;
  replacement?: {
    replacedEntryId: string;
    retainedEntryId: string;
    source: 'keyword-specificity' | 'ai-form-override' | 'cross-channel-collapse';
  };
  injectionExcerpt?: string;
}

export interface ZhikuRunTraceRequestReceipt {
  kind: 'prediction' | 'actual';
  requestHash: string;
  predictedRequestHash?: string;
  provider: string;
  model: string;
  transport: string;
  endpoint: string;
  mode: 'native' | 'tavern-v2';
  streaming: boolean;
  prefixApplied: boolean;
  finishReason?: string;
  usage?: {
    source: 'api' | 'estimate' | 'mixed';
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    uncachedTokens?: number;
  };
  durationSec?: number;
  differenceReasons: string[];
  fallbackReason?: string;
}

export interface ZhikuRunTrace {
  schemaVersion: 1;
  compileId: string;
  catalogVersion: string;
  catalogRevision: number;
  scope: string;
  inputSummaryHash: string;
  generatedAt: number;
  participation: {
    present: string[];
    anticipated: string[];
    mentioned: string[];
    background: string[];
  };
  participationEvidence: Array<{
    name: string;
    level: 'present' | 'anticipated' | 'mentioned' | 'background';
    evidence: string;
  }>;
  candidates: ZhikuCandidateDecisionTrace[];
  finalSelection: {
    characterIds: string[];
    strongIds: string[];
    weakIds: string[];
    allIds: string[];
  };
  injectionMetrics: {
    mainStoryInjectionChars: number;
    mainStoryInjectionTokens: number;
    characterEnforcementChars: number;
    characterEnforcementTokens: number;
    phonePersonaChars: number;
    phonePersonaTokens: number;
  };
  aiSupplement: {
    requested: boolean;
    executed: boolean;
    status: 'disabled' | 'preview-not-executed' | 'not-configured' | 'completed' | 'failed-fallback';
    provider?: string;
    model?: string;
    failureReason?: string;
  };
  requestReceipt?: ZhikuRunTraceRequestReceipt;
}

export interface BuildZhikuRunTraceInput {
  compileId: string;
  catalogVersion: string;
  catalogRevision: number;
  scope: string;
  query: string;
  generatedAt: number;
  participation: ZhikuRunTrace['participation'];
  participationEvidence: ZhikuRunTrace['participationEvidence'];
  candidateDecisions?: ZhikuCandidateDecisionTrace[];
  characterIds: string[];
  strongIds: string[];
  weakIds: string[];
  mainStoryInjection: string;
  characterEnforcementBrief: string;
  phonePersonaView: string;
  aiSupplement: ZhikuRunTrace['aiSupplement'];
}

export function buildZhikuRunTrace(input: BuildZhikuRunTraceInput): ZhikuRunTrace {
  const characterIds = unique(input.characterIds);
  const strongIds = unique(input.strongIds).filter((id) => !characterIds.includes(id));
  const weakIds = unique(input.weakIds).filter((id) => !characterIds.includes(id) && !strongIds.includes(id));
  return {
    schemaVersion: 1,
    compileId: input.compileId,
    catalogVersion: input.catalogVersion,
    catalogRevision: Math.max(0, Math.trunc(input.catalogRevision || 0)),
    scope: input.scope,
    inputSummaryHash: hashText(input.query.trim()),
    generatedAt: input.generatedAt,
    participation: cloneParticipation(input.participation),
    participationEvidence: input.participationEvidence.map((item) => ({ ...item })),
    candidates: (input.candidateDecisions ?? []).map(cloneCandidateDecision),
    finalSelection: {
      characterIds,
      strongIds,
      weakIds,
      allIds: [...characterIds, ...strongIds, ...weakIds],
    },
    injectionMetrics: {
      mainStoryInjectionChars: input.mainStoryInjection.length,
      mainStoryInjectionTokens: estimateTextTokens(input.mainStoryInjection),
      characterEnforcementChars: input.characterEnforcementBrief.length,
      characterEnforcementTokens: estimateTextTokens(input.characterEnforcementBrief),
      phonePersonaChars: input.phonePersonaView.length,
      phonePersonaTokens: estimateTextTokens(input.phonePersonaView),
    },
    aiSupplement: { ...input.aiSupplement },
  };
}

export function attachZhikuRequestReceipt(
  trace: ZhikuRunTrace,
  receipt: ZhikuRunTraceRequestReceipt,
): ZhikuRunTrace {
  return {
    ...trace,
    participation: cloneParticipation(trace.participation),
    participationEvidence: trace.participationEvidence.map((item) => ({ ...item })),
    candidates: trace.candidates.map(cloneCandidateDecision),
    finalSelection: {
      characterIds: [...trace.finalSelection.characterIds],
      strongIds: [...trace.finalSelection.strongIds],
      weakIds: [...trace.finalSelection.weakIds],
      allIds: [...trace.finalSelection.allIds],
    },
    injectionMetrics: { ...trace.injectionMetrics },
    aiSupplement: { ...trace.aiSupplement },
    requestReceipt: {
      ...receipt,
      differenceReasons: [...receipt.differenceReasons],
      usage: receipt.usage ? { ...receipt.usage } : undefined,
    },
  };
}

export function formatZhikuRunTrace(trace: ZhikuRunTrace): string {
  const receipt = trace.requestReceipt;
  const candidateLines = trace.candidates.length
    ? trace.candidates.map((item) => [
        `${item.stableOrder}. ${item.entryId}｜${item.title}`,
        `来源=${item.channels.join('+') || 'unknown'}`,
        `门禁=${item.gate.passed ? '通过' : '拦截'}`,
        `决策=${item.decision}/${item.finalRole}`,
        `理由=${item.decisionReason}`,
        item.replacement
          ? `替换=${item.replacement.replacedEntryId}->${item.replacement.retainedEntryId}(${item.replacement.source})`
          : '',
      ].filter(Boolean).join('｜')).join('\n')
    : '（无候选）';
  return [
    `编译：${trace.compileId}`,
    `目录：${trace.catalogVersion} / revision ${trace.catalogRevision}`,
    `作用域：${trace.scope}`,
    `输入摘要哈希：${trace.inputSummaryHash}`,
    `参与级别：在场 ${trace.participation.present.join('、') || '无'}；预计 ${trace.participation.anticipated.join('、') || '无'}；提及 ${trace.participation.mentioned.join('、') || '无'}；背景 ${trace.participation.background.join('、') || '无'}`,
    `AI 补充：${trace.aiSupplement.status}${trace.aiSupplement.model ? `（${trace.aiSupplement.provider ?? 'unknown'}/${trace.aiSupplement.model}）` : ''}`,
    `最终资料：人物 ${trace.finalSelection.characterIds.length} / 强 ${trace.finalSelection.strongIds.length} / 弱 ${trace.finalSelection.weakIds.length}`,
    `静态注入：${trace.injectionMetrics.mainStoryInjectionChars} 字符 / 约 ${trace.injectionMetrics.mainStoryInjectionTokens} tokens`,
    `人物校准：${trace.injectionMetrics.characterEnforcementChars} 字符 / 约 ${trace.injectionMetrics.characterEnforcementTokens} tokens`,
    receipt
      ? `请求回执：${receipt.kind}｜${receipt.requestHash}｜${receipt.provider}/${receipt.model}｜${receipt.mode}｜${receipt.streaming ? 'stream' : 'non-stream'}｜finish=${receipt.finishReason ?? '未返回'}`
      : '请求回执：尚未附加',
    receipt?.differenceReasons.length ? `预测/实发差异：${receipt.differenceReasons.join('；')}` : '',
    '',
    '候选决策：',
    candidateLines,
  ].filter((line, index, lines) => line || lines[index - 1]).join('\n');
}

function cloneParticipation(input: ZhikuRunTrace['participation']): ZhikuRunTrace['participation'] {
  return {
    present: [...input.present],
    anticipated: [...input.anticipated],
    mentioned: [...input.mentioned],
    background: [...input.background],
  };
}

function cloneCandidateDecision(item: ZhikuCandidateDecisionTrace): ZhikuCandidateDecisionTrace {
  return {
    ...item,
    channels: [...item.channels],
    evidence: [...item.evidence],
    gate: { ...item.gate },
    replacement: item.replacement ? { ...item.replacement } : undefined,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
