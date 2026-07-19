import type { 聊天消息, 回合快照 } from '@/models/chat';
import type { 变量命令批次, 变量命令结果 } from '@/models/variableCommand';

export const DETAILED_CHAT_TURNS = 20;
export const DETAILED_VARIABLE_BATCHES = 20;
export const SUMMARY_VARIABLE_BATCHES = 80;

const MAX_VARIABLE_BATCHES = DETAILED_VARIABLE_BATCHES + SUMMARY_VARIABLE_BATCHES;
const MAX_BATCH_REPORT_LENGTH = 2000;
const MAX_BATCH_FAILURE_RESULTS = 12;
const MAX_FAILURE_REASON_LENGTH = 500;
const MAX_COMMAND_KEY_LENGTH = 240;
const MAX_COMMAND_STRING_VALUE_LENGTH = 160;

export function compactVariableBatchHistory(
  value: readonly 变量命令批次[] | null | undefined,
): 变量命令批次[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const retained = value.slice(-MAX_VARIABLE_BATCHES);
  const detailedStart = Math.max(0, retained.length - DETAILED_VARIABLE_BATCHES);

  return retained.map((batch, index) => {
    if (index >= detailedStart) return batch;
    if (batch.retentionSummary && !batch.rawText) return batch;
    const results: 变量命令结果[] = Array.isArray(batch.results) ? batch.results : [];
    const diagnosticResults = results
      .filter((result) => !result.ok || (result.kind && result.kind !== 'command'))
      .slice(-MAX_BATCH_FAILURE_RESULTS)
      .map(compactVariableDiagnosticResult);
    const succeeded = results.filter((result) => result.ok && (!result.kind || result.kind === 'command')).length;
    const omittedDiagnostics = Math.max(
      0,
      results.length - succeeded - diagnosticResults.length,
    );
    const historySummary = `[旧批次摘要] 共 ${results.length} 条，成功 ${succeeded} 条，失败/警告 ${results.length - succeeded} 条。`;
    const reportBody = batch.report && batch.report.length > MAX_BATCH_REPORT_LENGTH
      ? `${batch.report.slice(0, MAX_BATCH_REPORT_LENGTH)}\n...[旧变量报告已截断]`
      : batch.report;
    const omittedSummary = omittedDiagnostics > 0
      ? `\n...[另有 ${omittedDiagnostics} 条失败/警告摘要已省略]`
      : '';
    const { rawText: _rawText, ...summary } = batch;
    void _rawText;
    return {
      ...summary,
      results: diagnosticResults,
      report: reportBody
        ? `${historySummary}\n${reportBody}${omittedSummary}`
        : `${historySummary}${omittedSummary}`,
      retentionSummary: {
        totalResults: results.length,
        succeededResults: succeeded,
        diagnosticResults: results.length - succeeded,
        omittedDiagnosticResults: omittedDiagnostics,
      },
    };
  });
}

function compactVariableDiagnosticResult(result: 变量命令结果): 变量命令结果 {
  const command = result.command ?? { action: 'set', key: '', value: undefined };
  const reason = result.reason && result.reason.length > MAX_FAILURE_REASON_LENGTH
    ? `${result.reason.slice(0, MAX_FAILURE_REASON_LENGTH)}...[已截断]`
    : result.reason;
  return {
    ...result,
    command: {
      action: command.action,
      key: String(command.key ?? '').slice(0, MAX_COMMAND_KEY_LENGTH),
      value: compactCommandValue(command.value),
    },
    reason,
  };
}

function compactCommandValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_COMMAND_STRING_VALUE_LENGTH
      ? `${value.slice(0, MAX_COMMAND_STRING_VALUE_LENGTH)}...[旧命令值已截断]`
      : value;
  }
  if (Array.isArray(value)) return `[旧数组值已省略，共 ${value.length} 项]`;
  if (value && typeof value === 'object') {
    return `[旧对象值已省略，共 ${Object.keys(value as Record<string, unknown>).length} 个字段]`;
  }
  return value;
}

export function compactChatHistoryForLongSession(
  value: readonly 聊天消息[] | null | undefined,
): 聊天消息[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const detailedAssistantIndices = collectDetailedAssistantIndices(value);
  const snapshotCarrierIndex = findLatestSnapshotCarrier(value);

  return value.map((message, index) => {
    let next = message;
    const keepSnapshot = index === snapshotCarrierIndex;
    if (message.preTurnSnapshot && !keepSnapshot) {
      next = { ...next, preTurnSnapshot: undefined };
    } else if (message.preTurnSnapshot && keepSnapshot) {
      const snapshot = compactSnapshotVariableBatches(message.preTurnSnapshot);
      if (snapshot !== message.preTurnSnapshot) next = { ...next, preTurnSnapshot: snapshot };
    }

    if (message.role !== 'assistant' || detailedAssistantIndices.has(index)) return next;

    const parsed = message.parsedResponse;
    return {
      ...next,
      debugContext: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      tokenUsage: undefined,
      responseDurationSec: undefined,
      parsedResponse: parsed
        ? {
            ...parsed,
            rawText: '',
            thinking: '',
            memory: '',
            commands: {},
            worldEvents: [],
            actionOptions: [],
            variableDraft: '',
            storyPlan: '',
          }
        : parsed,
    };
  });
}

function collectDetailedAssistantIndices(messages: readonly 聊天消息[]): Set<number> {
  const indices = new Set<number>();
  let remaining = DETAILED_CHAT_TURNS;
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (messages[index].role !== 'assistant') continue;
    indices.add(index);
    remaining -= 1;
  }
  return indices;
}

function findLatestSnapshotCarrier(messages: readonly 聊天消息[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' && message.role !== 'user') continue;
    if (message.role === 'user') return message.preTurnSnapshot ? index : -1;
    return message.preTurnSnapshot ? index : -1;
  }
  return -1;
}

function compactSnapshotVariableBatches(snapshot: 回合快照): 回合快照 {
  const current = Array.isArray(snapshot.variableBatches)
    ? snapshot.variableBatches as 变量命令批次[]
    : [];
  const compacted = compactVariableBatchHistory(current);
  const unchanged = compacted.length === current.length
    && compacted.every((batch, index) => batch === current[index]);
  return unchanged ? snapshot : { ...snapshot, variableBatches: compacted };
}
