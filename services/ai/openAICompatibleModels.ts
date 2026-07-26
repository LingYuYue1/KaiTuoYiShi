import { appendApiErrorReport } from './apiErrorReportService';

type CachedModels = {
  expiresAt: number;
  models: string[];
};

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const modelCache = new Map<string, CachedModels>();

export function buildOpenAICompatibleModelUrls(baseRaw: string): string[] {
  let base = baseRaw.trim().replace(/\/+$/, '').split('?')[0] ?? '';
  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models(?:\/.*)?$/i, '');
  if (/\/beta$/i.test(base)) base = base.replace(/\/beta$/i, '/v1');
  const withoutVersion = base.replace(/\/v\d+(?:beta\d*)?$/i, '');
  return Array.from(new Set([
    `${base}/models`,
    `${withoutVersion}/v1/models`,
    `${withoutVersion}/models`,
  ]));
}

export async function fetchOpenAICompatibleModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const errors: string[] = [];
  for (const url of buildOpenAICompatibleModelUrls(baseRaw)) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        void appendApiErrorReport({
          source: '模型列表',
          config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
          status: response.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }
      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data
          .map((model: { id?: string }) => model?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (error) {
      void appendApiErrorReport({
        source: '模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`获取模型列表失败：\n${errors.join('\n')}`);
}

export async function fetchOpenAICompatibleModelsCached(baseRaw: string, apiKey: string): Promise<string[]> {
  const cacheKey = `${baseRaw.trim().replace(/\/+$/, '').toLowerCase()}\u0000${apiKey}`;
  const cached = modelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return [...cached.models];

  const models = await fetchOpenAICompatibleModels(baseRaw, apiKey);
  modelCache.set(cacheKey, {
    expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
    models: [...models],
  });
  return models;
}

export function clearOpenAICompatibleModelCache(): void {
  modelCache.clear();
}
