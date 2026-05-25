import { chatCompletionNonStream } from './chatCompletionClient';
import { withRetries } from './retry';

export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
}

export async function fetchModels(config: any): Promise<string[]> {
  const retryCount = Math.max(0, Math.trunc(Number(config?.retryCount ?? 0)) || 0);
  const baseRaw = (config?.baseUrl || '').trim();
  const apiKey = (config?.apiKey || '').trim();
  if (!baseRaw) throw new Error('缺少 Base URL');
  if (!apiKey) throw new Error('缺少 API Key');

  return withRetries(
    async () => {
      if (config.provider === 'gemini') {
        return fetchGeminiModels(baseRaw, apiKey);
      }
      if (config.provider === 'claude') {
        return fetchClaudeModels(baseRaw, apiKey);
      }
      return fetchOpenAICompatibleModels(baseRaw, apiKey);
    },
    { retries: retryCount, label: '模型列表' },
  );
}

async function fetchOpenAICompatibleModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = baseRaw.replace(/\/+$/, '');
  const normalized = base.replace(/\/v1$/i, '');
  const candidates = Array.from(new Set([`${normalized}/v1/models`, `${normalized}/models`, `${base}/models`]));

  const errors: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        errors.push(`${url} -> ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
        if (ids.length) return ids;
      }
    } catch (e) {
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }
  throw new Error(`获取模型列表失败：\n${errors.join('\n')}`);
}

async function fetchGeminiModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = baseRaw.replace(/\/+$/, '');
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini /models 失败 ${res.status}：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.models)) {
    throw new Error('Gemini /models 返回格式异常（缺 models 数组）');
  }
  const ids = data.models
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'),
    )
    .map((m: { name?: string }) => (m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean) as string[];
  if (!ids.length) throw new Error('Gemini 返回空列表');
  return ids;
}

async function fetchClaudeModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = baseRaw.replace(/\/+$/, '');
  const url = base.endsWith('/v1') ? `${base}/models` : `${base.replace(/\/v1\/?$/, '')}/v1/models`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude /models 失败 ${res.status}：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.data)) {
    throw new Error('Claude /models 返回格式异常（缺 data 数组）');
  }
  const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
  if (!ids.length) throw new Error('Claude 返回空列表');
  return ids;
}

export async function testConnection(config: any): Promise<ConnectionTestResult> {
  const retryCount = Math.max(0, Math.trunc(Number(config?.retryCount ?? 0)) || 0);
  if (!config?.apiKey) return { ok: false, detail: '缺少 API Key' };
  if (!config?.baseUrl) return { ok: false, detail: '缺少 Base URL' };
  if (!config?.model) return { ok: false, detail: '缺少模型名称' };

  const startedAt = Date.now();
  try {
    const text = await withRetries(
      () =>
        chatCompletionNonStream(config, {
          messages: [{ role: 'user', content: 'ping' }],
          systemPrompt: '你是连接测试。请只回答 OK。',
          maxTokens: 32,
          temperature: 0,
        }),
      { retries: retryCount, label: '连接测试' },
    );
    const elapsed = Date.now() - startedAt;
    const body = (text || '').trim();
    return {
      ok: true,
      detail: `耗时：${elapsed} ms\n\n${body.length ? body : '（无响应内容）'}`,
    };
  } catch (e) {
    const raw = (e as Error).message || String(e);
    return { ok: false, detail: raw };
  }
}
