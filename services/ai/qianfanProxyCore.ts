type QianfanProxyBody = {
  baseUrl?: string;
  apiKey?: string;
  kind?: 'chat' | 'models';
  body?: unknown;
};

type QianfanAttempt = {
  url: string;
  model?: string;
  status: number;
  errorCode?: string;
};

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildQianfanChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (!/^https:\/\/qianfan\.baidubce\.com(?:\/|$)/i.test(base)) {
    throw new Error('仅允许代理百度千帆 qianfan.baidubce.com。');
  }
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

function buildQianfanFallbackChatUrls(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/v2\/coding(?:\/chat\/completions)?$/i.test(base)) return [];
  return [];
}

function buildQianfanCodingPlanChatUrl(baseUrl: string): string | null {
  const base = baseUrl.replace(/\/+$/, '');
  if (!/^https:\/\/qianfan\.baidubce\.com\/v2(?:\/chat\/completions)?$/i.test(base)) return null;
  return 'https://qianfan.baidubce.com/v2/coding/chat/completions';
}

function buildQianfanModelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (!/^https:\/\/qianfan\.baidubce\.com(?:\/|$)/i.test(base)) {
    throw new Error('仅允许代理百度千帆 qianfan.baidubce.com。');
  }
  const root = base.replace(/\/v[12](?:\/.*)?$/i, '');
  return `${root}/v2/models`;
}

function proxyHeaders(upstream?: Response): Headers {
  const headers = new Headers();
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('cache-control', 'no-store');
  headers.set('content-type', upstream?.headers.get('content-type') || 'application/json; charset=utf-8');
  return headers;
}

function buildQianfanChatPayloadVariants(body: unknown): unknown[] {
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  const model = typeof data?.model === 'string' ? data.model.trim() : '';
  if (!data || !/^glm[-_\s]?5\.1$/i.test(model)) return [body ?? {}];
  return [
    { ...data, model: 'glm-5.1' },
    { ...data, model: 'GLM-5.1' },
  ];
}

function readModelFromBody(body: unknown): string {
  return body && typeof body === 'object' && typeof (body as Record<string, unknown>).model === 'string'
    ? ((body as Record<string, unknown>).model as string)
    : '';
}

async function readQianfanErrorCode(response: Response): Promise<string> {
  try {
    const data = await response.clone().json() as { error?: { code?: unknown } };
    return typeof data?.error?.code === 'string' ? data.error.code : '';
  } catch {
    return '';
  }
}

export async function handleQianfanProxyRequest(request: Request): Promise<Response> {
  let payload: QianfanProxyBody;
  try {
    payload = await request.json() as QianfanProxyBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是有效 JSON。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  const baseUrl = readText(payload.baseUrl);
  const apiKey = readText(payload.apiKey);
  const kind = payload.kind === 'models' ? 'models' : 'chat';
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: '缺少百度千帆 Base URL 或 API Key。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  try {
    const upstreamUrl = kind === 'models' ? buildQianfanModelsUrl(baseUrl) : buildQianfanChatUrl(baseUrl);
    if (kind === 'models') {
      const upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: proxyHeaders(upstream),
      });
    }

    const urls = [upstreamUrl, ...buildQianfanFallbackChatUrls(baseUrl)];
    const bodyVariants = buildQianfanChatPayloadVariants(payload.body);
    let upstream: Response | null = null;
    const attempts: QianfanAttempt[] = [];
    for (const candidateUrl of urls) {
      for (const candidateBody of bodyVariants) {
        upstream = await fetch(candidateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(candidateBody ?? {}),
        });
        attempts.push({
          url: candidateUrl,
          model: readModelFromBody(candidateBody),
          status: upstream.status,
          errorCode: upstream.status >= 400 ? await readQianfanErrorCode(upstream) : undefined,
        });
        if (upstream.status !== 404) break;
      }
      if (upstream && upstream.status !== 404) break;
    }
    if (!upstream) {
      upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload.body ?? {}),
      });
      attempts.push({
        url: upstreamUrl,
        model: readModelFromBody(payload.body),
        status: upstream.status,
        errorCode: upstream.status >= 400 ? await readQianfanErrorCode(upstream) : undefined,
      });
    }
    if (
      upstream.status === 401 &&
      attempts.some((item) => item.errorCode === 'coding_plan_api_key_not_allowed')
    ) {
      const codingUrl = buildQianfanCodingPlanChatUrl(baseUrl);
      if (codingUrl) {
        for (const candidateBody of bodyVariants) {
          upstream = await fetch(codingUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(candidateBody ?? {}),
          });
          attempts.push({
            url: codingUrl,
            model: readModelFromBody(candidateBody),
            status: upstream.status,
            errorCode: upstream.status >= 400 ? await readQianfanErrorCode(upstream) : undefined,
          });
          if (upstream.status !== 404) break;
        }
      }
    }
    if (upstream.status === 404 && attempts.length > 1) {
      return new Response(JSON.stringify({
        error: '百度千帆上游全部候选路径 / 模型 ID 均返回 404。',
        hint: '官方模型列表中 GLM-5.1 的 model 参数接入点 ID 是 glm-5.1；如果这里仍全部 404，请检查账号是否开通该模型，或在千帆模型列表里确认该 Key 可见的实际模型 ID。Coding Plan Key 必须继续使用 /v2/coding，不会回退到 /v2。',
        attempts,
      }), {
        status: 404,
        headers: proxyHeaders(),
      });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: proxyHeaders(upstream),
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 502,
      headers: proxyHeaders(),
    });
  }
}
