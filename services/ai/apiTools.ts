import { chatCompletionNonStream } from './chatCompletionClient';
import { appendApiErrorReport } from './apiErrorReportService';
import { withRetries } from './retry';
import { isPioneerBaseUrl, normalizePioneerBaseUrl } from './pioneerProxyCore';
import { isArkBaseUrl, normalizeArkBaseUrl } from './arkProxyCore';
import { fetchOpenAICompatibleModels } from './openAICompatibleModels';
import { normalizeGeminiBaseUrl } from './geminiEndpointPolicy';
import {
  createConnectionTestChallenge,
  matchesConnectionTestChallenge,
  normalizeConnectionTestResponse,
} from './connectionTestPolicy';

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
      if (config.provider === 'mimo' || /xiaomimimo|mimo\.mi/i.test(baseRaw)) {
        return fetchMimoModels(baseRaw, apiKey);
      }
      if (config.provider === 'gemini') {
        return fetchGeminiModels(baseRaw, apiKey);
      }
      if (config.provider === 'claude' || config.provider === 'claude_compatible') {
        return fetchClaudeModels(baseRaw, apiKey);
      }
      if (config.provider === 'baidu') {
        return fetchBaiduQianfanModels(baseRaw, apiKey);
      }
      if (config.provider === 'opencode') {
        return fetchOpenCodeModels(baseRaw, apiKey);
      }
      if (config.provider === 'ark' || isArkBaseUrl(baseRaw)) {
        return fetchArkModels(baseRaw, apiKey);
      }
      if (isPioneerBaseUrl(baseRaw)) {
        return fetchPioneerModels(baseRaw, apiKey);
      }
      return fetchOpenAICompatibleModels(baseRaw, apiKey);
    },
    { retries: retryCount, label: '模型列表' },
  );
}

function normalizeOpenCodeModelsBaseUrl(baseRaw: string): string {
  let base = baseRaw.replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/zen\/go\/v1/i, '/zen/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models(?:\/.*)?$/i, '');
  if (/^https:\/\/opencode\.ai$/i.test(base)) return `${base}/zen/v1`;
  if (/\/zen$/i.test(base)) return `${base}/v1`;
  return base;
}

async function fetchOpenCodeModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = normalizeOpenCodeModelsBaseUrl(baseRaw);
  const candidates = Array.from(new Set([`${base}/models`, 'https://opencode.ai/zen/v1/models']));
  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const res = await fetch('/api/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'models',
          baseUrl: url,
          apiKey,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'OpenCode Zen 模型列表',
          config: { provider: 'opencode', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (e) {
      void appendApiErrorReport({
        source: 'OpenCode Zen 模型列表',
        config: { provider: 'opencode', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error: e,
      });
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }

  throw new Error(`OpenCode Zen 获取模型列表失败：\n${errors.join('\n')}`);
}

async function fetchMimoModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = baseRaw.replace(/\/+$/, '');
  const normalized = base.replace(/\/v1$/i, '');
  const candidates = Array.from(new Set([`${normalized}/v1/models`, `${base}/models`]));
  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: '小米 MiMo 模型列表',
          config: { provider: 'mimo', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
        continue;
      }
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (e) {
      void appendApiErrorReport({
        source: '小米 MiMo 模型列表',
        config: { provider: 'mimo', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error: e,
      });
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }

  throw new Error(`小米 MiMo 获取模型列表失败：\n${errors.join('\n')}`);
}

async function fetchPioneerModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = normalizePioneerBaseUrl(baseRaw);
  const url = `${base}/models`;
  try {
    const res = await fetch('/api/pioneer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'models',
        baseUrl: base,
        apiKey,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      void appendApiErrorReport({
        source: 'Pioneer 模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        status: res.status,
        requestUrl: url,
        requestMode: 'models',
        responseText: text,
      });
      throw new Error(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
    }
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
      if (ids.length) return ids;
    }
    throw new Error(`${url} -> 返回格式异常（缺 data 数组）`);
  } catch (e) {
    void appendApiErrorReport({
      source: 'Pioneer 模型列表',
      config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
      requestUrl: url,
      requestMode: 'models',
      error: e,
    });
    throw new Error(`Pioneer 获取模型列表失败：\n${(e as Error).message}`);
  }
}

async function fetchArkModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = normalizeArkBaseUrl(baseRaw);
  const url = `${base}/models`;
  try {
    const res = await fetch('/api/ark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'models',
        baseUrl: base,
        apiKey,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      void appendApiErrorReport({
        source: '火山方舟模型列表',
        config: { provider: 'ark', baseUrl: baseRaw, apiKey },
        status: res.status,
        requestUrl: url,
        requestMode: 'models',
        responseText: text,
      });
      throw new Error(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
    }
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
      if (ids.length) return ids;
    }
    throw new Error(`${url} -> 返回格式异常（缺 data 数组）`);
  } catch (e) {
    void appendApiErrorReport({
      source: '火山方舟模型列表',
      config: { provider: 'ark', baseUrl: baseRaw, apiKey },
      requestUrl: url,
      requestMode: 'models',
      error: e,
    });
    throw new Error(`火山方舟获取模型列表失败：\n${(e as Error).message}`);
  }
}

async function fetchBaiduQianfanModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = baseRaw.replace(/\/+$/, '');
  const root = base.replace(/\/v[12](?:\/.*)?$/i, '');
  const candidates = Array.from(new Set([`${root}/v2/models`, `${base}/models`]));
  const errors: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetch('/api/qianfan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'models',
          baseUrl: url,
          apiKey,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: '百度千帆模型列表',
          config: { provider: 'baidu', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data.map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (e) {
      void appendApiErrorReport({
        source: '百度千帆模型列表',
        config: { provider: 'baidu', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error: e,
      });
      errors.push(`${url} -> ${(e as Error).message}`);
    }
  }
  throw new Error(`百度千帆获取模型列表失败：\n${errors.join('\n')}`);
}

async function fetchGeminiModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = normalizeGeminiBaseUrl(baseRaw);
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url).catch((e) => {
    void appendApiErrorReport({
      source: 'Gemini 模型列表',
      config: { provider: 'gemini', baseUrl: baseRaw, apiKey },
      requestUrl: url,
      requestMode: 'models',
      error: e,
    });
    throw e;
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    void appendApiErrorReport({
      source: 'Gemini 模型列表',
      config: { provider: 'gemini', baseUrl: baseRaw, apiKey },
      status: res.status,
      requestUrl: url,
      requestMode: 'models',
      responseText: text,
    });
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
  }).catch((e) => {
    void appendApiErrorReport({
      source: 'Claude 模型列表',
      config: { provider: 'claude', baseUrl: baseRaw, apiKey },
      requestUrl: url,
      requestMode: 'models',
      error: e,
    });
    throw e;
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    void appendApiErrorReport({
      source: 'Claude 模型列表',
      config: { provider: 'claude', baseUrl: baseRaw, apiKey },
      status: res.status,
      requestUrl: url,
      requestMode: 'models',
      responseText: text,
    });
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
    const challenge = createConnectionTestChallenge();
    const text = await withRetries(
      () =>
        chatCompletionNonStream(config, {
          messages: [{ role: 'user', content: `请只返回这个随机校验码：${challenge}` }],
          systemPrompt: '你正在执行 API 连接测试。必须只返回用户提供的随机校验码，不得添加解释、标点或 Markdown。',
          maxTokens: 32,
          temperature: 0,
        }),
      { retries: retryCount, label: '连接测试' },
    );
    const elapsed = Date.now() - startedAt;
    const body = normalizeConnectionTestResponse(text);
    if (!matchesConnectionTestChallenge(body, challenge)) {
      const responseDetail = body
        ? `\n模型实际返回：${body.slice(0, 160)}${body.length > 160 ? '…' : ''}`
        : '\n所选模型没有返回任何正文。';
      return {
        ok: false,
        detail: `耗时：${elapsed} ms\n\n接口有响应，但未通过随机码校验。${responseDetail}`,
      };
    }
    return {
      ok: true,
      detail: `耗时：${elapsed} ms\n\n模型已正确返回本次随机校验码。`,
    };
  } catch (e) {
    const raw = (e as Error).message || String(e);
    void appendApiErrorReport({
      source: '连接测试',
      config,
      requestMode: 'test',
      error: e,
    });
    return { ok: false, detail: raw };
  }
}
