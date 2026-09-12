import type { 变量批次诊断, 变量命令批次, 变量命令结果 } from '@/models/variableCommand';

/** 批次失败既可能由命令回执表示，也可能只存在于批次级 diagnostics。 */
export function variableBatchHasFailure(batch: 变量命令批次 | undefined | null): boolean {
  return Boolean(
    batch?.results.some((result: 变量命令结果) => !result.ok && result.kind !== 'warning')
    || batch?.diagnostics?.some((diagnostic: 变量批次诊断) => diagnostic.severity === 'error'),
  );
}

export function variableBatchHasWarning(batch: 变量命令批次 | undefined | null): boolean {
  return Boolean(
    batch?.results.some((result: 变量命令结果) => !result.ok)
    || batch?.diagnostics?.some((diagnostic: 变量批次诊断) => diagnostic.severity === 'warning'),
  );
}

/**
 * 找到可以整批重试的变量批次。
 *
 * 变量批次可能已经部分落地，因此只允许“没有任何成功命令，且确实存在
 * 非 warning/rejected 的失败或 error diagnostic”的批次进入整批重试。
 * 被后续批次 supersede 的旧批次永远不再重放；目标批次找不到时不回退到
 * 其它批次，避免手动操作误选历史回合。
 */
export function findRetryableVariableBatch(
  batches: readonly 变量命令批次[] | null | undefined,
  targetBatchId?: string,
): 变量命令批次 | undefined {
  const normalizedBatches = Array.isArray(batches) ? batches : [];
  const supersededBatchIds = new Set(
    normalizedBatches
      .map((batch: 变量命令批次) => batch.supersedesBatchId)
      .filter((id): id is string => Boolean(id)),
  );
  const candidates = targetBatchId
    ? normalizedBatches.filter((batch: 变量命令批次) => batch.id === targetBatchId)
    : [...normalizedBatches].reverse();

  return candidates.find((batch: 变量命令批次) => {
    const results = batch.results ?? [];
    const hasSuccessfulResult = results.some((result: 变量命令结果) => result.ok);
    const hasRetryableResultFailure = results.some((result: 变量命令结果) =>
      !result.ok && result.kind !== 'warning' && result.kind !== 'rejected',
    );
    const hasErrorDiagnostic = batch.diagnostics?.some((diagnostic: 变量批次诊断) => diagnostic.severity === 'error') ?? false;
    return !supersededBatchIds.has(batch.id)
      && !hasSuccessfulResult
      && (hasRetryableResultFailure || hasErrorDiagnostic);
  });
}
