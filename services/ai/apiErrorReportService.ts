import type { API配置项 } from '@/models/settings';
import { loadSetting, saveSetting } from '@/services/storage/settings';

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
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value);
  return text.trim().slice(0, maxLength);
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
    const report: ApiErrorReport = {
      id: `apierr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      source: input.source,
      provider: input.config?.provider || '',
      model: input.config?.model || '',
      baseUrl: input.config?.baseUrl || '',
      apiKeyHint: maskApiKey(input.config?.apiKey || ''),
      status: input.status,
      requestUrl: input.requestUrl,
      requestMode: input.requestMode ?? 'unknown',
      message: trimText(error?.message ?? input.error ?? input.responseText ?? '未知错误'),
      responseText: trimText(input.responseText ?? ''),
    };
    const next = [report, ...(Array.isArray(current) ? current : [])].slice(0, MAX_API_ERROR_REPORTS);
    await saveSetting(API_ERROR_REPORTS_KEY, next);
  } catch (err) {
    console.warn('[apiErrorReport] failed to persist report', err);
  }
}

export async function loadApiErrorReports(): Promise<ApiErrorReport[]> {
  const list = await loadSetting<ApiErrorReport[]>(API_ERROR_REPORTS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function clearApiErrorReports(): Promise<void> {
  await saveSetting(API_ERROR_REPORTS_KEY, []);
}
