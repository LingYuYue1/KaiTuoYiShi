import type {
  变量批次诊断,
  变量命令,
  变量命令批次,
  变量命令动作,
  变量命令结果,
} from '@/models/variableCommand';
import { canonicalizeJsonValue } from './jsonValue';
import { createStableEntityId } from './stableFingerprint';

const VARIABLE_BATCH_SCHEMA_VERSION = 3;
const VALID_ACTIONS = new Set<变量命令动作>(['set', 'add', 'sub', 'push', 'delete']);
const VALID_RESULT_KINDS = new Set(['command', 'warning', 'error', 'rejected']);
const VALID_DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error']);
const VALID_DIAGNOSTIC_STAGES = new Set([
  'request',
  'parse',
  'projection',
  'preflight',
  'reduce',
  'commit',
  'migration',
  'retention',
  'coverage',
  'history_repair',
]);
const LEGACY_PLACEHOLDER_RE = /^\((?:解析失败|事实忽略|变量模型调用失败|变量批次提交失败|内部错误|迁移失败)/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function diagnostic(
  message: string,
  input: Partial<变量批次诊断> = {},
): 变量批次诊断 {
  return {
    code: input.code ?? 'VARIABLE_BATCH_MIGRATION',
    severity: input.severity ?? 'warning',
    stage: input.stage ?? 'migration',
    message,
    ...(input.factGroupId ? { factGroupId: input.factGroupId } : {}),
    ...(input.factIndex !== undefined ? { factIndex: input.factIndex } : {}),
    ...(input.commandIndex !== undefined ? { commandIndex: input.commandIndex } : {}),
    ...(input.entityKey ? { entityKey: input.entityKey } : {}),
    ...(input.root ? { root: input.root } : {}),
    ...(input.factSource ? { factSource: input.factSource } : {}),
    ...(input.sourceEvidenceId ? { sourceEvidenceId: input.sourceEvidenceId } : {}),
  };
}

function diagnosticFingerprint(value: 变量批次诊断): string {
  return JSON.stringify([
    value.code,
    value.severity,
    value.stage,
    value.message,
    value.factGroupId ?? null,
    value.factIndex ?? null,
    value.commandIndex ?? null,
    value.entityKey ?? null,
    value.root ?? null,
    value.factSource ?? null,
    value.sourceEvidenceId ?? null,
  ]);
}

function dedupeDiagnostics(values: readonly 变量批次诊断[]): 变量批次诊断[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const fingerprint = diagnosticFingerprint(value);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function normalizeDiagnostic(value: unknown, index: number): 变量批次诊断 | undefined {
  if (typeof value === 'string' && value.trim()) {
    return diagnostic(value.trim(), { code: 'LEGACY_BATCH_DIAGNOSTIC', commandIndex: index });
  }
  if (!isRecord(value)) return undefined;
  const message = stringValue(value.message) ?? stringValue(value.reason);
  if (!message) return undefined;
  const severity = VALID_DIAGNOSTIC_SEVERITIES.has(String(value.severity))
    ? String(value.severity) as 变量批次诊断['severity']
    : 'warning';
  const stage = VALID_DIAGNOSTIC_STAGES.has(String(value.stage))
    ? String(value.stage) as 变量批次诊断['stage']
    : 'migration';
  return diagnostic(message, {
    code: stringValue(value.code) ?? 'VARIABLE_BATCH_DIAGNOSTIC',
    severity,
    stage,
    factGroupId: stringValue(value.factGroupId),
    factIndex: numberValue(value.factIndex),
    commandIndex: numberValue(value.commandIndex),
    entityKey: stringValue(value.entityKey),
    root: stringValue(value.root),
    factSource: stringValue(value.factSource) as 变量批次诊断['factSource'],
    sourceEvidenceId: stringValue(value.sourceEvidenceId),
  });
}

function inferLegacyDiagnosticStage(key: string): 变量批次诊断['stage'] {
  if (key.includes('解析')) return 'parse';
  if (key.includes('事实')) return 'projection';
  if (key.includes('提交')) return 'commit';
  if (key.includes('调用')) return 'request';
  return 'migration';
}

function normalizeCommand(
  value: unknown,
  index: number,
  diagnostics: 变量批次诊断[],
): { command?: 变量命令; valueInvalid: boolean } {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(`旧命令第 ${index + 1} 条不是对象，已转为批次诊断。`, {
      code: 'LEGACY_COMMAND_NOT_OBJECT',
      commandIndex: index,
    }));
    return { valueInvalid: true };
  }

  const action = stringValue(value.action) as 变量命令动作 | undefined;
  const key = stringValue(value.key);
  if (!action || !VALID_ACTIONS.has(action) || !key) {
    diagnostics.push(diagnostic(`旧命令第 ${index + 1} 条缺少合法 action/key，已转为批次诊断。`, {
      code: 'LEGACY_COMMAND_INVALID_SHAPE',
      commandIndex: index,
    }));
    return { valueInvalid: true };
  }

  const command: 变量命令 = { action, key };
  if (stringValue(value.factSource)) command.factSource = stringValue(value.factSource) as 变量命令['factSource'];
  if (stringValue(value.sourceEvidenceId)) command.sourceEvidenceId = stringValue(value.sourceEvidenceId);
  if (stringValue(value.factGroupId)) command.factGroupId = stringValue(value.factGroupId);
  if (numberValue(value.factIndex) !== undefined) command.factIndex = numberValue(value.factIndex);
  if (stringValue(value.entityKey)) command.entityKey = stringValue(value.entityKey);
  if (Array.isArray(value.dependsOnFactGroupIds)) {
    const dependencies = value.dependsOnFactGroupIds.filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim()),
    );
    if (dependencies.length) command.dependsOnFactGroupIds = [...new Set(dependencies)];
  }

  const hasValue = Object.prototype.hasOwnProperty.call(value, 'value');
  const rawValue = value.value;
  if (action === 'delete' && (!hasValue || rawValue === null || rawValue === undefined)) {
    // 旧命令常用 null 表示 delete 的占位值；迁移后统一成真正的 delete 语义。
    return { command, valueInvalid: false };
  }
  if (!hasValue || rawValue === undefined) {
    diagnostics.push(diagnostic(`命令 ${key} 缺少 JSON value，已保留命令并标记为无效。`, {
      code: 'LEGACY_COMMAND_VALUE_MISSING',
      severity: 'error',
      stage: 'preflight',
      commandIndex: index,
      factGroupId: command.factGroupId,
      factIndex: command.factIndex,
      entityKey: command.entityKey,
    }));
    return { command, valueInvalid: true };
  }

  const canonical = canonicalizeJsonValue(rawValue);
  if (!canonical.ok) {
    diagnostics.push(diagnostic(`命令 ${key} 的 value 无法通过 JSON 边界：${canonical.issues.map((issue) => issue.message).join('；')}`, {
      code: 'LEGACY_COMMAND_VALUE_INVALID',
      severity: 'error',
      stage: 'preflight',
      commandIndex: index,
      factGroupId: command.factGroupId,
      factIndex: command.factIndex,
      entityKey: command.entityKey,
    }));
    return { command, valueInvalid: true };
  }
  command.value = canonical.value;
  return { command, valueInvalid: false };
}

function normalizeResult(
  value: unknown,
  index: number,
  diagnostics: 变量批次诊断[],
): 变量命令结果 | undefined {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(`旧命令结果第 ${index + 1} 条不是对象，已转为批次诊断。`, {
      code: 'LEGACY_RESULT_NOT_OBJECT',
      commandIndex: index,
    }));
    return undefined;
  }

  const rawCommand = value.command;
  const rawKey = isRecord(rawCommand) ? stringValue(rawCommand.key) ?? '' : '';
  const reason = stringValue(value.reason);
  if (!rawCommand || LEGACY_PLACEHOLDER_RE.test(rawKey)) {
    diagnostics.push(diagnostic(reason ?? (rawKey || `旧命令结果第 ${index + 1} 条没有对应命令。`), {
      code: 'LEGACY_PLACEHOLDER_RESULT',
      severity: value.ok === true ? 'warning' : 'error',
      stage: inferLegacyDiagnosticStage(rawKey),
      commandIndex: index,
    }));
    return undefined;
  }

  const normalized = normalizeCommand(rawCommand, index, diagnostics);
  if (!normalized.command) return undefined;
  const rawKind = stringValue(value.kind);
  const kind = VALID_RESULT_KINDS.has(rawKind ?? '')
    ? rawKind as 变量命令结果['kind']
    : value.ok === true ? 'command' : 'error';
  const result: 变量命令结果 = {
    command: normalized.command,
    ok: value.ok === true && !normalized.valueInvalid,
    kind,
    ...(stringValue(value.stage) ? { stage: stringValue(value.stage) as 变量命令结果['stage'] } : {}),
    ...(normalized.command.factGroupId ? { factGroupId: normalized.command.factGroupId } : {}),
    ...(normalized.command.factIndex !== undefined ? { factIndex: normalized.command.factIndex } : {}),
    ...(normalized.command.entityKey ? { entityKey: normalized.command.entityKey } : {}),
    ...(normalized.command.sourceEvidenceId ? { sourceEvidenceId: normalized.command.sourceEvidenceId } : {}),
    ...(reason ? { reason } : {}),
  };
  if (normalized.valueInvalid && !result.reason) {
    result.reason = '旧命令 value 无法通过 JSON 边界，已拒绝执行。';
  }
  return result;
}

function normalizeMode(value: unknown): 变量命令批次['mode'] {
  const mode = stringValue(value);
  return mode === 'normal' || mode === 'retry' || mode === 'repair' || mode === 'history_repair' || mode === 'reroll'
    ? mode
    : undefined;
}

/** 将一个旧批次迁移到结构化诊断 schema；重复调用结果保持稳定。 */
export function migrateVariableCommandBatch(value: unknown): 变量命令批次 {
  const raw = isRecord(value) ? value : {};
  const diagnostics: 变量批次诊断[] = [];
  const rawResults = Array.isArray(raw.results) ? raw.results : [];
  const results = rawResults
    .map((item, index) => normalizeResult(item, index, diagnostics))
    .filter((item): item is 变量命令结果 => Boolean(item));
  const rawDiagnostics = Array.isArray(raw.diagnostics) ? raw.diagnostics : [];
  for (const [index, item] of rawDiagnostics.entries()) {
    const normalized = normalizeDiagnostic(item, index);
    if (normalized) diagnostics.push(normalized);
  }

  const source = raw.source === 'main' ? 'main' : 'calibration';
  const turn = Math.max(0, Math.trunc(numberValue(raw.turn) ?? 0));
  const timestamp = Math.max(0, Math.trunc(numberValue(raw.timestamp) ?? 0));
  const normalizedDiagnostics = dedupeDiagnostics(diagnostics);
  const normalizedMode = normalizeMode(raw.mode);
  const normalizedSourceEvidenceId = stringValue(raw.sourceEvidenceId);
  const normalizedSourceEvidenceIds = Array.isArray(raw.sourceEvidenceIds)
    ? [...new Set(raw.sourceEvidenceIds.filter(
        (item): item is string => typeof item === 'string' && Boolean(item.trim()),
      ))]
    : undefined;
  const id = stringValue(raw.id) ?? createStableEntityId('migrated_vbatch', [
    turn,
    timestamp,
    source,
    stringValue(raw.rawText) ?? '',
    stringValue(raw.turnId) ?? '',
    stringValue(raw.targetMessageId) ?? '',
    stringValue(raw.targetUserMessageId) ?? '',
    results.map((result) => ({
      ok: result.ok,
      kind: result.kind ?? null,
      stage: result.stage ?? null,
      reason: result.reason ?? null,
      command: result.command
        ? {
            action: result.command.action,
            key: result.command.key,
            ...(Object.prototype.hasOwnProperty.call(result.command, 'value')
              ? { value: result.command.value }
              : {}),
            ...(result.command.factGroupId ? { factGroupId: result.command.factGroupId } : {}),
            ...(result.command.factIndex !== undefined ? { factIndex: result.command.factIndex } : {}),
            ...(result.command.entityKey ? { entityKey: result.command.entityKey } : {}),
          }
        : null,
    })),
    normalizedDiagnostics,
  ]);
  const {
    results: _rawResults,
    diagnostics: _rawDiagnostics,
    schemaVersion: _rawSchemaVersion,
    id: _rawId,
    source: _rawSource,
    turn: _rawTurn,
    timestamp: _rawTimestamp,
    mode: _rawMode,
    sourceEvidenceId: _rawSourceEvidenceId,
    sourceEvidenceIds: _rawSourceEvidenceIds,
    rawText: _rawText,
    report: _rawReport,
    ...legacyFields
  } = raw;
  void _rawResults;
  void _rawDiagnostics;
  void _rawSchemaVersion;
  void _rawId;
  void _rawSource;
  void _rawTurn;
  void _rawTimestamp;
  void _rawMode;
  void _rawSourceEvidenceId;
  void _rawSourceEvidenceIds;
  void _rawText;
  void _rawReport;
  const batch: 变量命令批次 = {
    ...legacyFields as Omit<变量命令批次, 'results' | 'diagnostics' | 'schemaVersion' | 'id' | 'source' | 'turn' | 'timestamp'>,
    id,
    schemaVersion: VARIABLE_BATCH_SCHEMA_VERSION,
    turn,
    timestamp,
    source,
    results,
    ...(normalizedMode ? { mode: normalizedMode } : {}),
    ...(normalizedSourceEvidenceId ? { sourceEvidenceId: normalizedSourceEvidenceId } : {}),
    ...(normalizedSourceEvidenceIds?.length ? { sourceEvidenceIds: normalizedSourceEvidenceIds } : {}),
    ...(typeof raw.rawText === 'string' ? { rawText: raw.rawText } : {}),
    ...(typeof raw.report === 'string' ? { report: raw.report } : {}),
    ...(normalizedDiagnostics.length ? { diagnostics: normalizedDiagnostics } : {}),
  };
  const canonical = canonicalizeJsonValue(batch);
  if (canonical.ok) return canonical.value as 变量命令批次;

  // 迁移边界不能把坏值继续带入 React state；保留最小可审计批次，并把原因写成批次诊断。
  const fallbackDiagnostics = dedupeDiagnostics([
    ...normalizedDiagnostics,
    diagnostic(`迁移后的变量批次无法通过 JSON 边界：${canonical.issues.map((issue) => issue.message).join('；')}`, {
      code: 'VARIABLE_BATCH_JSON_INVALID',
      severity: 'error',
      stage: 'migration',
    }),
  ]);
  return {
    id,
    schemaVersion: VARIABLE_BATCH_SCHEMA_VERSION,
    turn,
    timestamp,
    source,
    results,
    diagnostics: fallbackDiagnostics,
    ...(typeof raw.rawText === 'string' ? { rawText: raw.rawText } : {}),
    ...(typeof raw.report === 'string' ? { report: raw.report } : {}),
  };
}

/** 迁移数组入口；非数组输入按空数组处理，适合所有存档/快照边界。 */
export function migrateVariableBatches(value: unknown): 变量命令批次[] {
  if (!Array.isArray(value)) return [];
  return value.map(migrateVariableCommandBatch);
}
