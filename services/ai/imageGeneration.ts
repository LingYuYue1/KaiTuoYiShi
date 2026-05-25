import type { 文生图API配置 } from '@/models/settings';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  nsfw?: boolean;
  size?: string;
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  src: string;
  mimeType?: string;
  model?: string;
  backend?: string;
}

export async function generateImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.enabled) throw new Error('当前文生图接口未启用。');
  if (!request.prompt.trim()) throw new Error('请先填写生图提示词。');

  if (config.backend === 'novelai') {
    return generateNovelAIImage(config, request);
  }
  if (config.backend === 'sd_webui') {
    return generateSdWebUIImage(config, request);
  }
  if (config.backend === 'comfyui') {
    return generateComfyUIImage(config, request);
  }
  return generateOpenAICompatibleImage(config, request);
}

export async function testImageGenerationConnection(config: 文生图API配置): Promise<string> {
  if (!config.enabled) throw new Error('当前接口未启用。');
  if (!config.baseUrl.trim()) throw new Error('请先填写 Base URL。');
  const endpoint = joinUrl(config.baseUrl, readPath(config));

  if (config.backend === 'openai_compatible') {
    if (!config.apiKey.trim()) throw new Error('OpenAI 兼容接口需要 API Key。');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model.trim() || 'gpt-image-2',
        n: 1,
        response_format: 'b64_json',
      }),
    });
    const text = await response.text().catch(() => '');
    if (response.ok || response.status === 400) {
      return `连接可达：${endpoint}。${response.status === 400 ? '接口返回了参数校验结果，通常说明地址与鉴权已进入服务端。' : '接口响应成功。'}`;
    }
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  if (config.backend === 'novelai') {
    if (!config.apiKey.trim()) throw new Error('NovelAI 接口需要 Token。');
    const response = await fetch(joinUrl(config.baseUrl.replace(/^https:\/\/novelai\.net/i, 'https://image.novelai.net'), readPath(config)), {
      method: 'OPTIONS',
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (response.ok || response.status === 204 || response.status === 405 || response.status === 404) {
      return `NovelAI 端点可达：${endpoint}。`;
    }
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  if (config.backend === 'sd_webui') {
    const response = await fetch(joinUrl(config.baseUrl, '/sdapi/v1/options'));
    if (response.ok) return `SD WebUI 可达：${config.baseUrl.replace(/\/+$/, '')}。`;
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  if (config.backend === 'comfyui') {
    const response = await fetch(joinUrl(config.baseUrl, '/system_stats'));
    if (response.ok) return `ComfyUI 可达：${config.baseUrl.replace(/\/+$/, '')}。`;
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  return `端点可达性检查已完成：${endpoint}。`;
}

export async function fetchComfyCheckpoints(config: 文生图API配置): Promise<string[]> {
  if (!config.baseUrl.trim()) throw new Error('请先填写 ComfyUI Base URL。');
  const response = await fetch(joinUrl(config.baseUrl, '/object_info/CheckpointLoaderSimple'));
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`获取 ComfyUI 模型列表失败 ${response.status}: ${text || response.statusText}`);
  }
  const data = await response.json();
  const options = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  if (!Array.isArray(options)) return [];
  return options.map((item) => String(item)).filter(Boolean);
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function parseSize(size: string): { width: number; height: number } {
  const match = String(size || '').match(/(\d+)\s*[xX*]\s*(\d+)/);
  if (!match) return { width: 1024, height: 1024 };
  return {
    width: Math.max(64, Math.trunc(Number(match[1]) || 1024)),
    height: Math.max(64, Math.trunc(Number(match[2]) || 1024)),
  };
}

function readPath(config: 文生图API配置): string {
  if (config.pathMode === 'custom' && config.customPath.trim()) return config.customPath.trim();
  switch (config.backend) {
    case 'novelai':
      return '/ai/generate-image';
    case 'sd_webui':
      return '/sdapi/v1/txt2img';
    case 'comfyui':
      return '/prompt';
    case 'openai_compatible':
    default:
      return '/images/generations';
  }
}

function mergeNegativePrompt(config: 文生图API配置, request: ImageGenerationRequest): string {
  return [config.negativePrompt, request.negativePrompt]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(', ');
}

async function generateOpenAICompatibleImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写图片接口 Base URL。');
  if (!config.apiKey.trim()) throw new Error('请填写图片接口 API Key。');
  if (!config.model.trim()) throw new Error('请填写图片模型。');

  const url = joinUrl(config.baseUrl, readPath(config));
  const negative = mergeNegativePrompt(config, request);
  const prompt = negative
    ? `${request.prompt.trim()}\n\nNegative prompt: ${negative}`
    : request.prompt.trim();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: request.size || config.defaultSize || '1024x1024',
      n: 1,
      response_format: config.responseFormat === 'dataUrl' ? 'b64_json' : config.responseFormat,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`图片接口错误 ${response.status}: ${text || response.statusText}`);
  }

  const data = await response.json();
  const first = data?.data?.[0];
  if (!first) throw new Error('图片接口没有返回结果。');

  if (typeof first.url === 'string' && first.url.trim()) {
    return { src: first.url.trim(), model: config.model, backend: config.backend };
  }

  if (typeof first.b64_json === 'string' && first.b64_json.trim()) {
    return {
      src: `data:image/png;base64,${first.b64_json.trim()}`,
      mimeType: 'image/png',
      model: config.model,
      backend: config.backend,
    };
  }

  throw new Error('图片接口返回格式无法识别。');
}

async function generateNovelAIImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写 NovelAI Base URL。');
  if (!config.apiKey.trim()) throw new Error('请填写 NovelAI Token。');
  if (!config.model.trim()) throw new Error('请填写 NovelAI 模型。');
  const { width, height } = parseSize(request.size || config.defaultSize);
  const response = await fetch(joinUrl(config.baseUrl.replace(/^https:\/\/novelai\.net/i, 'https://image.novelai.net'), readPath(config)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      input: request.prompt.trim(),
      model: config.model,
      action: 'generate',
      parameters: {
        width,
        height,
        scale: config.cfgScale,
        sampler: config.sampler,
        steps: config.steps,
        seed: config.seed >= 0 ? config.seed : Math.floor(Math.random() * 2147483647),
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        noise_schedule: config.noiseSchedule,
        negative_prompt: mergeNegativePrompt(config, request),
      },
    }),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`NovelAI 图片接口错误 ${response.status}: ${text || response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const b64 = data?.data?.[0]?.b64_json || data?.image || data?.output?.[0];
    if (typeof b64 === 'string' && b64.trim()) {
      return { src: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`, mimeType: 'image/png', model: config.model, backend: config.backend };
    }
  }
  const blob = await response.blob();
  return { src: await blobToDataUrl(blob), mimeType: blob.type || 'image/png', model: config.model, backend: config.backend };
}

async function generateSdWebUIImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写 Stable Diffusion WebUI Base URL。');
  const { width, height } = parseSize(request.size || config.defaultSize);
  const response = await fetch(joinUrl(config.baseUrl, readPath(config)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: request.prompt.trim(),
      negative_prompt: mergeNegativePrompt(config, request),
      steps: config.steps,
      cfg_scale: config.cfgScale,
      width,
      height,
      seed: config.seed,
      sampler_name: config.sampler,
      override_settings: config.model ? { sd_model_checkpoint: config.model } : undefined,
    }),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SD WebUI 图片接口错误 ${response.status}: ${text || response.statusText}`);
  }
  const data = await response.json();
  const first = data?.images?.[0];
  if (typeof first === 'string' && first.trim()) {
    return { src: first.startsWith('data:') ? first : `data:image/png;base64,${first}`, mimeType: 'image/png', model: config.model, backend: config.backend };
  }
  throw new Error('SD WebUI 没有返回 images[0]。');
}

async function generateComfyUIImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写 ComfyUI Base URL。');
  if (!config.comfyWorkflowJson.trim()) {
    throw new Error('请在文生图设置里填写 ComfyUI Workflow JSON。当前阶段需要工作流内包含 __PROMPT__ 和 __NEGATIVE_PROMPT__ 等占位符。');
  }
  const { width, height } = parseSize(request.size || config.defaultSize);
  const seed = config.seed >= 0 ? config.seed : Math.floor(Math.random() * 2147483647);
  const negativePrompt = mergeNegativePrompt(config, request);
  const comfySampler = toComfySamplerName(config.sampler);
  const comfyScheduler = toComfySchedulerName(config.noiseSchedule);
  const modelName = config.model.trim();
  const checkpoints: string[] = await fetchComfyCheckpoints(config).catch(() => [] as string[]);
  if (checkpoints.length && (!modelName || !checkpoints.includes(modelName))) {
    throw new Error([
      `ComfyUI Checkpoint 不存在：${modelName || '未填写'}`,
      `当前可用模型：${checkpoints.join(' / ')}`,
      '请在文生图设置的「Checkpoint / 模型名」里选择本机已有 ckpt_name。',
    ].join('\n'));
  }
  const workflowText = config.comfyWorkflowJson
    .replaceAll('__PROMPT__', request.prompt.trim())
    .replaceAll('{{prompt}}', request.prompt.trim())
    .replaceAll('__NEGATIVE_PROMPT__', negativePrompt)
    .replaceAll('{{negative_prompt}}', negativePrompt)
    .replaceAll('__WIDTH__', String(width))
    .replaceAll('{{width}}', String(width))
    .replaceAll('__HEIGHT__', String(height))
    .replaceAll('{{height}}', String(height))
    .replaceAll('__STEPS__', String(config.steps))
    .replaceAll('{{steps}}', String(config.steps))
    .replaceAll('__CFG__', String(config.cfgScale))
    .replaceAll('{{cfg}}', String(config.cfgScale))
    .replaceAll('__SEED__', String(seed))
    .replaceAll('{{seed}}', String(seed))
    .replaceAll('__SAMPLER__', comfySampler)
    .replaceAll('{{sampler}}', comfySampler)
    .replaceAll('__SCHEDULER__', comfyScheduler)
    .replaceAll('{{scheduler}}', comfyScheduler)
    .replaceAll('__MODEL__', modelName)
    .replaceAll('__CKPT_NAME__', modelName)
    .replaceAll('{{model}}', modelName)
    .replaceAll('{{ckpt_name}}', modelName);
  let promptPayload: unknown;
  try {
    promptPayload = JSON.parse(workflowText);
  } catch (err) {
    throw new Error(`ComfyUI Workflow JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
  }
  patchComfyWorkflow(promptPayload, {
    model: modelName,
    sampler: comfySampler,
    scheduler: comfyScheduler,
    steps: config.steps,
    cfgScale: config.cfgScale,
    seed,
    width,
    height,
    positive: request.prompt.trim(),
    negative: negativePrompt,
  });
  assertNoComfyPlaceholders(promptPayload);
  const response = await fetch(joinUrl(config.baseUrl, readPath(config)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptPayload }),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ComfyUI /prompt 错误 ${response.status}: ${formatComfyError(text || response.statusText)}`);
  }
  const data = await response.json();
  const promptId = data?.prompt_id;
  if (!promptId) throw new Error('ComfyUI 未返回 prompt_id。');
  return pollComfyResult(config, String(promptId), request.signal);
}

function toComfySamplerName(sampler: string): string {
  const map: Record<string, string> = {
    k_euler: 'euler',
    k_euler_ancestral: 'euler_ancestral',
    k_dpmpp_2m: 'dpmpp_2m',
    k_dpmpp_2s_ancestral: 'dpmpp_2s_ancestral',
    k_dpmpp_sde: 'dpmpp_sde',
    k_dpmpp_2m_sde: 'dpmpp_2m_sde',
  };
  return map[sampler] ?? sampler ?? 'euler';
}

function toComfySchedulerName(noiseSchedule: string): string {
  const map: Record<string, string> = {
    native: 'normal',
    karras: 'karras',
    exponential: 'exponential',
    polyexponential: 'exponential',
  };
  return map[noiseSchedule] ?? noiseSchedule ?? 'normal';
}

function patchComfyWorkflow(payload: unknown, values: {
  model: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfgScale: number;
  seed: number;
  width: number;
  height: number;
  positive: string;
  negative: string;
}) {
  if (!payload || typeof payload !== 'object') return;
  const nodes = Object.values(payload as Record<string, unknown>);
  for (const rawNode of nodes) {
    if (!rawNode || typeof rawNode !== 'object') continue;
    const node = rawNode as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = node.inputs;
    if (!inputs || typeof inputs !== 'object') continue;

    if (values.model && node.class_type === 'CheckpointLoaderSimple') {
      inputs.ckpt_name = values.model;
    }
    if (node.class_type === 'KSampler') {
      inputs.sampler_name = values.sampler;
      inputs.scheduler = values.scheduler;
      inputs.steps = values.steps;
      inputs.cfg = values.cfgScale;
      inputs.seed = values.seed;
    }
    if (node.class_type === 'EmptyLatentImage') {
      inputs.width = values.width;
      inputs.height = values.height;
    }
    if (node.class_type === 'CLIPTextEncode' && typeof inputs.text === 'string') {
      const text = inputs.text;
      if (text.includes('__PROMPT__') || text.includes('{{prompt}}')) inputs.text = values.positive;
      if (text.includes('__NEGATIVE_PROMPT__') || text.includes('{{negative_prompt}}')) inputs.text = values.negative;
    }
  }
}

function assertNoComfyPlaceholders(payload: unknown) {
  const text = JSON.stringify(payload);
  const match = text.match(/__(PROMPT|NEGATIVE_PROMPT|WIDTH|HEIGHT|STEPS|CFG|SEED|SAMPLER|SCHEDULER|MODEL|CKPT_NAME)__|\{\{(prompt|negative_prompt|width|height|steps|cfg|seed|sampler|scheduler|model|ckpt_name)\}\}/);
  if (match) {
    throw new Error(`ComfyUI Workflow 仍包含未替换占位符：${match[0]}。请检查 Workflow JSON 或对应接口设置。`);
  }
}

function formatComfyError(text: string): string {
  try {
    const data = JSON.parse(text);
    const nodeErrors = data?.node_errors && typeof data.node_errors === 'object'
      ? Object.entries(data.node_errors as Record<string, any>).flatMap(([nodeId, node]) => {
          const errors = Array.isArray(node?.errors) ? node.errors : [];
          return errors.map((err: any) => `节点 ${nodeId}(${node?.class_type || 'unknown'}): ${err?.details || err?.message || '校验失败'}`);
        })
      : [];
    if (nodeErrors.length) return nodeErrors.join('；');
  } catch {
    // keep raw text below
  }
  return text;
}

async function pollComfyResult(config: 文生图API配置, promptId: string, signal?: AbortSignal): Promise<ImageGenerationResult> {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    if (signal?.aborted) throw new Error('ComfyUI 生成已取消。');
    await delay(1500);
    const response = await fetch(joinUrl(config.baseUrl, `/history/${promptId}`), { signal });
    if (!response.ok) continue;
    const history = await response.json();
    const item = history?.[promptId];
    const outputs = item?.outputs && typeof item.outputs === 'object' ? Object.values(item.outputs) : [];
    for (const output of outputs as any[]) {
      const images = Array.isArray(output?.images) ? output.images : [];
      const image = images[0];
      if (image?.filename) {
        const params = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder || '',
          type: image.type || 'output',
        });
        return { src: joinUrl(config.baseUrl, `/view?${params.toString()}`), model: config.model, backend: config.backend };
      }
    }
  }
  throw new Error('ComfyUI 生成超时。');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}
