import type { API配置项 } from '@/models/settings';
import { loadSetting, saveSetting } from '@/services/dbService';

export const API_ERROR_REPORTS_KEY = 'apiErrorReports';
const MAX_API_ERROR_REPORTS = 80;

export interface ApiErrorReport {
  id: string;
  createdAt: string;
  source: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyHint: string;
  status?: number;
  requestUrl?: string;
  requestMode?: 'stream' | 'non-stream' | 'models' | 'test' | 'unknown';
  message: string;
  responseText?: string;
}

function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return '';
  return key.length <= 8 ? '********' : `${'*'.repeat(Math.min(12, key.length - 4))}${key.slice(-4)}`;
}

function trimText(value: unknown, maxLength = 4000): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

/** 脱敏固定标记。 */
export const REDACTED_MARK = '[REDACTED]';

/**
 * URL 查询参数中视为敏感的键名（含大小写变体）。
 * 值被统一替换为固定标记，参数名保留用于诊断。
 */
const SENSITIVE_QUERY_PARAM_RE =
  /([?&])(key|api_key|apikey|token|access_token|authorization|auth)=[^&#]*/gi;

/** 对用于诊断的请求 URL 脱敏：清除敏感查询参数的值，保留参数名与其余诊断信息。 */
export function sanitizeRequestUrlForReport(url: string | undefined | null): string {
  if (!url) return '';
  return String(url).replace(SENSITIVE_QUERY_PARAM_RE, `$1$2=${REDACTED_MARK}`);
}

/** 从文本中移除精确匹配的完整密钥字符串（供应商错误文本可能回显 Key）。 */
function stripExactSecrets(text: string, secrets: string[]): string {
  if (!text) return text;
  let out = String(text);
  for (const secret of secrets) {
    const s = (secret ?? '').trim();
    if (s.length >= 4) out = out.split(s).join(REDACTED_MARK);
  }
  return out;
}

/**
 * 唯一脱敏入口：对完整错误报告做归一化脱敏。
 * - requestUrl 清除敏感查询参数值；
 * - requestUrl/baseUrl/message/responseText 额外移除精确匹配的完整密钥；
 * - 其余字段原样保留。
 */
export function sanitizeApiErrorReport(report: ApiErrorReport, secrets: string[] = []): ApiErrorReport {
  const requestUrl = stripExactSecrets(sanitizeRequestUrlForReport(report.requestUrl), secrets);
  return {
    ...report,
    requestUrl,
    baseUrl: stripExactSecrets(report.baseUrl ?? '', secrets),
    message: stripExactSecrets(report.message ?? '', secrets),
    responseText: stripExactSecrets(report.responseText ?? '', secrets),
  };
}

export async function appendApiErrorReport(input: {
  source: string;
  config?: Partial<API配置项> | null;
  status?: number;
  requestUrl?: string;
  requestMode?: ApiErrorReport['requestMode'];
  error?: unknown;
  responseText?: string;
}): Promise<void> {
  try {
    const current = await loadSetting<ApiErrorReport[]>(API_ERROR_REPORTS_KEY);
    const error = input.error instanceof Error ? input.error : null;
    const apiKey = input.config?.apiKey || '';
    // 写入 IndexedDB 前必须完成脱敏；调用方不得依赖 UI 才遮罩。
    const report = sanitizeApiErrorReport(
      {
        id: `apierr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        source: input.source,
        provider: input.config?.provider || '',
        model: input.config?.model || '',
        baseUrl: input.config?.baseUrl || '',
        apiKeyHint: maskApiKey(apiKey),
        status: input.status,
        requestUrl: input.requestUrl,
        requestMode: input.requestMode ?? 'unknown',
        message: trimText(error?.message ?? input.error ?? input.responseText ?? '未知错误'),
        responseText: trimText(input.responseText ?? ''),
      },
      [apiKey],
    );
    const next = [report, ...(Array.isArray(current) ? current : [])].slice(0, MAX_API_ERROR_REPORTS);
    await saveSetting(API_ERROR_REPORTS_KEY, next);
  } catch (err) {
    console.warn('[apiErrorReport] failed to persist report', err);
  }
}

export async function loadApiErrorReports(): Promise<ApiErrorReport[]> {
  const list = await loadSetting<ApiErrorReport[]>(API_ERROR_REPORTS_KEY);
  if (!Array.isArray(list)) return [];
  // 历史记录再次归一化并返回脱敏副本；如有变化顺便回写清理后的列表，
  // 避免旧 IndexedDB 持续保存泄露值。
  const sanitized = list.map((item) => sanitizeApiErrorReport(item));
  const changed = sanitized.some(
    (item, index) =>
      item.requestUrl !== list[index]?.requestUrl ||
      item.baseUrl !== list[index]?.baseUrl ||
      item.message !== list[index]?.message ||
      item.responseText !== list[index]?.responseText,
  );
  if (changed) {
    void saveSetting(API_ERROR_REPORTS_KEY, sanitized).catch((err) =>
      console.warn('[apiErrorReport] failed to rewrite sanitized history', err),
    );
  }
  return sanitized;
}

export async function clearApiErrorReports(): Promise<void> {
  await saveSetting(API_ERROR_REPORTS_KEY, []);
}
