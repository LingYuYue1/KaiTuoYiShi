import type { 文生图API配置 } from '@/models/settings';
import type { 叙事插图 } from '@/models/chat';
import type { NovelAITaskOverrides, StorySnapshotRenderContext } from '@/models/imageGeneration';
import { fetchModels } from '@/services/ai/apiTools';
import { compileNovelAIPrompt, resolveNovelAIModelProfile } from './novelaiPromptCompiler';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  nsfw?: boolean;
  size?: string;
  referenceImages?: ImageReferenceInput[];
  referenceStrength?: number;
  storySnapshotContext?: StorySnapshotRenderContext;
  novelAIOverrides?: NovelAITaskOverrides;
  signal?: AbortSignal;
}

export interface ImageReferenceInput {
  id?: string;
  src: string;
  weight?: number;
  role?: 'character' | 'style' | 'composition';
}

export interface ImageGenerationResult {
  src: string;
  mimeType?: string;
  model?: string;
  backend?: string;
  originalUrl?: string;
}

export interface ComfyWorkflowCandidate {
  id: string;
  title: string;
  source: 'queue' | 'history';
  workflowJson: string;
}

const NOVELAI_IMAGE_MODELS = [
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-3',
];

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

/**
 * 生成故事快照：调用生图 API 并返回叙事插图结构。
 * @param config 生图接口配置
 * @param prompt 正面提示词
 * @param negativePrompt 负面提示词
 * @param type 图片类型
 * @param description 中文描述
 * @param imageId 图片 ID
 * @param storySnapshotContext 故事快照的紧凑分层上下文
 * @param signal 中断信号
 */
export async function generateNarrativeImage(
  config: 文生图API配置,
  prompt: string,
  negativePrompt: string,
  type: 'scene' | 'character',
  description: string,
  imageId: string,
  storySnapshotContext?: StorySnapshotRenderContext,
  signal?: AbortSignal,
): Promise<叙事插图> {
  try {
    const result = await generateImage(config, {
      prompt,
      negativePrompt: negativePrompt || undefined,
      size: type === 'scene' ? '1280x720' : '1024x1024',
      storySnapshotContext,
      signal,
    });
    return {
      id: imageId,
      dataUrl: result.src,
      type,
      kind: type === 'scene' ? 'snapshot' : 'character',
      prompt,
      negativePrompt,
      description,
      status: 'done',
    };
  } catch (err) {
    return {
      id: imageId,
      dataUrl: '',
      type,
      kind: type === 'scene' ? 'snapshot' : 'character',
      prompt,
      negativePrompt,
      description,
      status: 'failed',
      error: (err as Error).message ?? '生图失败',
    };
  }
}

export async function testImageGenerationConnection(config: 文生图API配置): Promise<string> {
  if (!config.enabled) throw new Error('当前接口未启用。');
  if (!config.baseUrl.trim()) throw new Error('请先填写 Base URL。');
  const path = config.backend === 'openai_compatible' ? readOpenAICompatibleImagePath(config) : readPath(config);
  const endpoint = joinUrl(config.baseUrl, path);

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
    if (response.ok || response.status === 400 || isOpenAICompatibleImageValidationResponse(response.status, text)) {
      return `连接可达：${endpoint}。${response.ok ? '接口响应成功。' : '接口返回了参数校验结果，通常说明地址与鉴权已进入服务端。'}`;
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
  const data = await readJsonResponse(response, 'ComfyUI 模型列表');
  const options = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  if (!Array.isArray(options)) return [];
  return options.map((item) => String(item)).filter(Boolean);
}

export async function fetchImageGenerationModels(config: 文生图API配置): Promise<string[]> {
  if (config.backend === 'novelai') {
    return NOVELAI_IMAGE_MODELS;
  }
  if (config.backend === 'comfyui') {
    return fetchComfyCheckpoints(config);
  }
  if (config.backend === 'sd_webui') {
    return fetchSdWebUiModels(config);
  }
  return fetchModels({
    id: '__image_generation_models__',
    name: '文生图模型列表',
    provider: 'openai_compatible',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    retryCount: config.retryCount,
    createdAt: 0,
    updatedAt: 0,
  });
}

async function fetchSdWebUiModels(config: 文生图API配置): Promise<string[]> {
  if (!config.baseUrl.trim()) throw new Error('请先填写 Stable Diffusion WebUI Base URL。');
  const response = await fetch(joinUrl(config.baseUrl, '/sdapi/v1/sd-models'));
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`获取 SD WebUI 模型列表失败 ${response.status}: ${text || response.statusText}`);
  }
  const data = await readJsonResponse(response, 'SD WebUI 模型列表');
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return String(record.title || record.model_name || record.filename || '').trim();
    })
    .filter(Boolean);
}

export async function fetchComfyWorkflowCandidates(
  config: 文生图API配置,
  source: 'queue' | 'history',
): Promise<ComfyWorkflowCandidate[]> {
  if (!config.baseUrl.trim()) throw new Error('请先填写 ComfyUI Base URL。');
  const endpoint = source === 'queue' ? '/queue' : '/history?max_items=20';
  const response = await fetch(joinUrl(config.baseUrl, endpoint));
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`读取 ComfyUI ${source === 'queue' ? '队列' : '历史'}失败 ${response.status}: ${text || response.statusText}`);
  }
  const data = await readJsonResponse(response, 'ComfyUI 工作流列表');
  return source === 'queue'
    ? extractComfyQueueWorkflows(data)
    : extractComfyHistoryWorkflows(data);
}

function extractComfyQueueWorkflows(data: unknown): ComfyWorkflowCandidate[] {
  const root = isRecord(data) ? data : {};
  const rows = [
    ...asArray(root.queue_running),
    ...asArray(root.queue_pending),
  ];
  const results: ComfyWorkflowCandidate[] = [];
  for (const row of rows) {
    const arr = Array.isArray(row) ? row : [];
    const promptId = String(arr[1] ?? results.length + 1);
    const workflow = normalizeComfyWorkflowPayload(arr[2] ?? row);
    if (!workflow) continue;
    results.push(buildComfyWorkflowCandidate('queue', promptId, workflow));
  }
  return results;
}

function extractComfyHistoryWorkflows(data: unknown): ComfyWorkflowCandidate[] {
  if (!isRecord(data)) return [];
  const results: ComfyWorkflowCandidate[] = [];
  for (const [promptId, rawEntry] of Object.entries(data).reverse()) {
    const entry = isRecord(rawEntry) ? rawEntry : {};
    const workflow = normalizeComfyWorkflowPayload(entry.prompt ?? rawEntry);
    if (!workflow) continue;
    results.push(buildComfyWorkflowCandidate('history', promptId, workflow));
  }
  return results;
}

function buildComfyWorkflowCandidate(
  source: 'queue' | 'history',
  promptId: string,
  workflow: Record<string, unknown>,
): ComfyWorkflowCandidate {
  const nodes = Object.values(workflow).filter(isRecord);
  const ckpt = nodes
    .map((node) => isRecord(node.inputs) ? node.inputs.ckpt_name : undefined)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const label = source === 'queue' ? '队列' : '历史';
  return {
    id: promptId,
    source,
    title: `${label} ${promptId}${ckpt ? ` · ${ckpt}` : ''} · ${nodes.length} 节点`,
    workflowJson: JSON.stringify(workflow, null, 2),
  };
}

function normalizeComfyWorkflowPayload(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = normalizeComfyWorkflowPayload(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(payload)) return null;
  if (looksLikeComfyWorkflow(payload)) return payload;
  const prompt = normalizeComfyWorkflowPayload(payload.prompt);
  if (prompt) return prompt;
  const workflow = normalizeComfyWorkflowPayload(payload.workflow);
  if (workflow) return workflow;
  return null;
}

function looksLikeComfyWorkflow(payload: Record<string, unknown>): boolean {
  const nodes = Object.values(payload).filter(isRecord);
  return nodes.some((node) => typeof node.class_type === 'string' && isRecord(node.inputs));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonResponse(response: Response, label: string): Promise<any> {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${label}返回空响应。`);
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const contentType = response.headers.get('content-type') || '';
    const preview = trimmed.slice(0, 180).replace(/\s+/g, ' ');
    const isHtml = /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || contentType.includes('text/html');
    if (isHtml) {
      throw new Error(`${label}返回了网页而不是 JSON。请检查 Base URL 和接口路径是否指向图片 API 端点，当前响应预览：${preview}`);
    }
    throw new Error(`${label}返回的内容不是合法 JSON：${(err as Error).message}。响应预览：${preview}`);
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path.trim())) return path.trim();
  const base = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function normalizeOpenAICompatibleImagePath(path: string): string {
  const raw = String(path || '').trim() || '/images/generations';
  const clean = raw.replace(/\/+$/, '');
  if (/\/v1$/i.test(clean) || /^v1$/i.test(clean)) {
    return `${clean.startsWith('/') || /^https?:\/\//i.test(clean) ? clean : `/${clean}`}/images/generations`;
  }
  return raw;
}

function readOpenAICompatibleImagePath(config: 文生图API配置): string {
  return normalizeOpenAICompatibleImagePath(readPath(config));
}

function readOpenAICompatibleReferencePath(config: 文生图API配置): string {
  const generationPath = readOpenAICompatibleImagePath(config);
  if (/\/images\/edits(?:\?.*)?$/i.test(generationPath)) return generationPath;
  if (/\/images\/generations(?:\?.*)?$/i.test(generationPath)) {
    return generationPath.replace(/\/images\/generations(?=\?|$)/i, '/images/edits');
  }
  return '/images/edits';
}

function isOpenAICompatibleImageValidationResponse(status: number, text: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = text.toLowerCase();
  return lower.includes('prompt') && (lower.includes('required') || lower.includes('missing') || lower.includes('field required'));
}

function parseSize(size: string): { width: number; height: number } {
  const match = String(size || '').match(/(\d+)\s*[xX*]\s*(\d+)/);
  if (!match) return { width: 1024, height: 1024 };
  return {
    width: Math.max(64, Math.trunc(Number(match[1]) || 1024)),
    height: Math.max(64, Math.trunc(Number(match[2]) || 1024)),
  };
}

function normalizeOpenAICompatibleImageSize(size: string): string {
  const raw = String(size || '').trim();
  if (!raw || raw === 'auto') return '1024x1024';
  if (/^(1024x1024|1024x1536|1536x1024)$/i.test(raw)) return raw.toLowerCase();
  const { width, height } = parseSize(raw);
  if (width > height * 1.15) return '1536x1024';
  if (height > width * 1.15) return '1024x1536';
  return '1024x1024';
}

function normalizeNovelAISize(size: string): { width: number; height: number } {
  const parsed = parseSize(size);
  const snap = (value: number) => Math.max(64, Math.min(2048, Math.round(value / 64) * 64));
  return {
    width: snap(parsed.width),
    height: snap(parsed.height),
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

function formatOpenAICompatibleImageError(status: number, text: string): string {
  const tips: string[] = [];
  const lower = text.toLowerCase();
  if (status >= 500 && (lower.includes('new_api_error') || lower.includes('do_request_failed') || lower.includes('upstream error'))) {
    tips.push('上游图片接口请求失败。若头像/立绘和手动故事快照可用但自动故事快照失败，优先检查本次正文快照提示词、并发限制、response_format 支持和中转模型能力。');
    tips.push('若仍失败，请检查中转的图片模型、/images/generations 路径、余额、并发限制和 response_format 支持情况。');
  }
  if (status === 400 && /size|dimension|resolution/i.test(text)) {
    tips.push('图片接口拒绝了尺寸参数。OpenAI 兼容接口会自动使用 1024x1024 / 1536x1024 / 1024x1536。');
  }
  return [`图片接口错误 ${status}: ${text}`, ...tips].filter(Boolean).join('\n');
}

function normalizeReferenceImages(referenceImages?: ImageReferenceInput[]): ImageReferenceInput[] {
  return (referenceImages ?? [])
    .map((item) => ({
      ...item,
      id: item.id?.trim(),
      src: String(item.src || '').trim(),
      role: item.role ?? 'composition',
      weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : undefined,
    }))
    .filter((item) => item.src.length > 0);
}

function stripDataUrlPrefix(src: string): string {
  return src.startsWith('data:') ? src.slice(src.indexOf(',') + 1) : src;
}

/** Convert a display/reference src (data URL, blob URL, or remote) to raw base64 for API payloads. */
async function referenceSrcToBase64(src: string, signal?: AbortSignal): Promise<string> {
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return stripDataUrlPrefix(trimmed);
  const blob = await loadReferenceImageBlob(trimmed, signal);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return btoa(binary);
}

function clampReferenceStrength(value?: number): number {
  if (!Number.isFinite(Number(value))) return 0.55;
  return Math.max(0.05, Math.min(0.95, Number(value)));
}

function readSdWebUiImagePath(config: 文生图API配置, useImg2Img: boolean): string {
  if (config.pathMode === 'custom' && config.customPath.trim()) return config.customPath.trim();
  return useImg2Img ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';
}

async function generateOpenAICompatibleImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写图片接口 Base URL。');
  if (!config.apiKey.trim()) throw new Error('请填写图片接口 API Key。');
  if (!config.model.trim()) throw new Error('请填写图片模型。');
  const referenceImages = normalizeReferenceImages(request.referenceImages);

  const negative = mergeNegativePrompt(config, request);
  const prompt = negative
    ? `${request.prompt.trim()}\n\nNegative prompt: ${negative}`
    : request.prompt.trim();
  if (referenceImages.length > 0) {
    return generateOpenAICompatibleReferenceImage(config, request, prompt, referenceImages[0]);
  }

  const url = joinUrl(config.baseUrl, readOpenAICompatibleImagePath(config));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: normalizeOpenAICompatibleImageSize(request.size || config.defaultSize || '1024x1024'),
      n: 1,
      response_format: config.responseFormat === 'dataUrl' ? 'b64_json' : config.responseFormat,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(formatOpenAICompatibleImageError(response.status, text || response.statusText));
  }

  return readOpenAICompatibleImageResult(response, config, request.signal);
}

async function generateOpenAICompatibleReferenceImage(
  config: 文生图API配置,
  request: ImageGenerationRequest,
  prompt: string,
  reference: ImageReferenceInput,
): Promise<ImageGenerationResult> {
  const referenceBlob = await loadReferenceImageBlob(reference.src, request.signal);
  const form = new FormData();
  form.append('model', config.model);
  form.append('prompt', prompt);
  form.append('image', referenceBlob, `reference.${imageExtension(referenceBlob.type)}`);
  form.append('size', normalizeOpenAICompatibleImageSize(request.size || config.defaultSize || '1024x1024'));
  form.append('n', '1');

  const response = await fetch(joinUrl(config.baseUrl, readOpenAICompatibleReferencePath(config)), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${formatOpenAICompatibleImageError(response.status, text || response.statusText)}\n部分中转供应商不支持参考图，如参考图生成失败请关闭该开关。`);
  }
  return readOpenAICompatibleImageResult(response, config, request.signal);
}

async function loadReferenceImageBlob(src: string, signal?: AbortSignal): Promise<Blob> {
  try {
    const response = await fetch(src, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('图片内容为空');
    return blob.type ? blob : new Blob([blob], { type: 'image/png' });
  } catch (error) {
    throw new Error(`参考图读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function imageExtension(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/gif/i.test(mimeType)) return 'gif';
  return 'png';
}

async function readOpenAICompatibleImageResult(response: Response, config: 文生图API配置, signal?: AbortSignal): Promise<ImageGenerationResult> {
  const data = await readJsonResponse(response, 'OpenAI 兼容图片接口');
  const first = data?.data?.[0];
  if (!first) throw new Error('图片接口没有返回结果。');

  if (typeof first.url === 'string' && first.url.trim()) {
    return persistRemoteImage(first.url.trim(), { model: config.model, backend: config.backend, signal });
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

export interface NovelAIRequestPayload {
  action: 'generate';
  input: string;
  model: string;
  parameters: Record<string, any>;
}

function resolveNovelAIUcPresetIndex(
  profile: ReturnType<typeof resolveNovelAIModelProfile>,
  preset: 文生图API配置['novelAIUcPreset'] | undefined,
): number {
  if (!preset || preset === 'recommended' || preset === 'heavy') return 0;
  const expectedName = {
    light: 'Light',
    furry_focus: 'Furry Focus',
    human_focus: 'Human Focus',
    none: 'None',
  }[preset];
  const index = profile.ucPresets.findIndex((item) => item.name === expectedName);
  return index >= 0 ? index : profile.ucPresets.length - 1;
}

export function buildNovelAIRequestPayload(
  config: 文生图API配置,
  request: ImageGenerationRequest,
  seed: number,
): NovelAIRequestPayload {
  const model = config.model.trim();
  const profile = resolveNovelAIModelProfile(model);
  const { width, height } = normalizeNovelAISize(request.size || config.defaultSize);
  const compiled = compileNovelAIPrompt({
    model,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt,
    advanced: config.novelAIAdvanced,
    taskOverrides: request.novelAIOverrides,
    storySnapshotContext: request.storySnapshotContext,
    ucPreset: resolveNovelAIUcPresetIndex(profile, config.novelAIUcPreset),
  });
  const useCustomParameters = config.novelAIParameterMode === 'custom';
  const characterPrompts = profile.supportsCharacterPrompts
    ? compiled.characterPrompts.map((character) => ({
        prompt: character.prompt,
        uc: character.negativePrompt,
        center: character.center,
        enabled: true,
      }))
    : [];
  const parameters: Record<string, any> = {
    width,
    height,
    scale: useCustomParameters ? config.cfgScale : profile.recommendedCfgScale,
    sampler: config.sampler,
    steps: useCustomParameters ? config.steps : profile.recommendedSteps,
    seed,
    n_samples: 1,
    ucPreset: compiled.ucPreset,
    uc: compiled.uc,
    cfg_rescale: 0,
    controlnet_strength: 1,
    dynamic_thresholding: false,
    params_version: 3,
    legacy: false,
    legacy_uc: false,
    legacy_v3_extend: false,
    negative_prompt: compiled.uc,
    noise_schedule: config.noiseSchedule,
    qualityToggle: Boolean(compiled.qualityTags),
    sm: false,
    sm_dyn: false,
    add_original_image: true,
    characterPrompts,
    use_coords: false,
    deliberate_euler_ancestral_bug: false,
    prefer_brownian: true,
  };

  if (profile.supportsCharacterPrompts) {
    parameters.v4_prompt = {
      caption: {
        base_caption: compiled.basePrompt,
        char_captions: characterPrompts.map((character) => ({
          char_caption: character.prompt,
          centers: [character.center],
        })),
      },
      use_coords: false,
      use_order: true,
    };
    parameters.v4_negative_prompt = {
      caption: {
        base_caption: compiled.uc,
        char_captions: characterPrompts.map((character) => ({
          char_caption: character.uc,
          centers: [character.center],
        })),
      },
      legacy_uc: false,
    };
  }

  return { action: 'generate', input: compiled.basePrompt, model, parameters };
}

async function generateNovelAIImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写 NovelAI Base URL。');
  if (!config.apiKey.trim()) throw new Error('请填写 NovelAI Token。');
  if (!config.model.trim()) throw new Error('请填写 NovelAI 模型。');
  if (normalizeReferenceImages(request.referenceImages).length > 0) {
    throw new Error('当前 NovelAI 生图链路尚未接入 img2img / vibe transfer 参考图参数。请先关闭参考图参与生成。');
  }
  const payload = buildNovelAIRequestPayload(config, {
    ...request,
    negativePrompt: mergeNegativePrompt(config, request),
  }, config.seed >= 0 ? config.seed : Math.floor(Math.random() * 2147483647));
  const model = config.model.trim();

  const response = await fetch(joinUrl(config.baseUrl.replace(/^https:\/\/novelai\.net/i, 'https://image.novelai.net'), readPath(config)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(formatNovelAIError(response.status, text || response.statusText, model));
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await readJsonResponse(response, 'NovelAI 图片接口');
    const b64 = data?.data?.[0]?.b64_json || data?.image || data?.output?.[0];
    if (typeof b64 === 'string' && b64.trim()) {
      return { src: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`, mimeType: 'image/png', model: config.model, backend: config.backend };
    }
  }
  const blob = await response.blob();
  const image = await readNovelAIImageBlob(blob, contentType);
  return { src: image.src, mimeType: image.mimeType, model: config.model, backend: config.backend };
}

function formatNovelAIError(status: number, text: string, model: string): string {
  const tips: string[] = [];
  if (status === 500 && model.startsWith('nai-diffusion-4')) {
    tips.push('NAI V4/V4.5 需要 v4_prompt 参数；当前版本已自动补齐。若仍失败，请检查模型名是否为账号可用模型，以及尺寸是否为 64 的倍数。');
  }
  if (status === 401 || status === 403) {
    tips.push('请检查 NovelAI Token 是否有效，且账号订阅/额度允许生图。');
  }
  if (status === 400) {
    tips.push('请检查模型名、尺寸、采样器、噪点表或提示词长度。');
  }
  return [`NovelAI 图片接口错误 ${status}: ${text}`, ...tips].filter(Boolean).join('\n');
}

async function generateSdWebUIImage(config: 文生图API配置, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!config.baseUrl.trim()) throw new Error('请填写 Stable Diffusion WebUI Base URL。');
  const { width, height } = parseSize(request.size || config.defaultSize);
  const referenceImages = normalizeReferenceImages(request.referenceImages);
  const useImg2Img = referenceImages.length > 0;
  const endpoint = useImg2Img ? readSdWebUiImagePath(config, true) : readPath(config);
  const payload: Record<string, unknown> = {
    prompt: request.prompt.trim(),
    negative_prompt: mergeNegativePrompt(config, request),
    steps: config.steps,
    cfg_scale: config.cfgScale,
    width,
    height,
    seed: config.seed,
    sampler_name: config.sampler,
    override_settings: config.model ? { sd_model_checkpoint: config.model } : undefined,
  };
  if (useImg2Img) {
    payload.init_images = await Promise.all(
      referenceImages.map((item) => referenceSrcToBase64(item.src, request.signal)),
    );
    payload.denoising_strength = clampReferenceStrength(request.referenceStrength);
    payload.resize_mode = 1;
  }
  const response = await fetch(joinUrl(config.baseUrl, endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SD WebUI 图片接口错误 ${response.status}: ${text || response.statusText}`);
  }
  const data = await readJsonResponse(response, 'SD WebUI 图片接口');
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
  const referenceImages = normalizeReferenceImages(request.referenceImages);
  const firstReferenceImage = referenceImages[0]?.src
    ? await referenceSrcToBase64(referenceImages[0].src, request.signal)
    : '';
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
    .replaceAll('{{ckpt_name}}', modelName)
    .replaceAll('__REFERENCE_IMAGE__', firstReferenceImage)
    .replaceAll('{{reference_image}}', firstReferenceImage);
  if (referenceImages.length > 0 && !/__REFERENCE_IMAGE__|\{\{reference_image\}\}/.test(config.comfyWorkflowJson)) {
    throw new Error('当前 ComfyUI 工作流没有参考图占位符。请在工作流中预留 __REFERENCE_IMAGE__ 或 {{reference_image}}，或关闭参考图参与生成。');
  }
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
  const data = await readJsonResponse(response, 'ComfyUI Prompt');
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
    const history = await readJsonResponse(response, 'ComfyUI 历史结果');
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
        return persistRemoteImage(joinUrl(config.baseUrl, `/view?${params.toString()}`), { model: config.model, backend: config.backend, signal });
      }
    }
  }
  throw new Error('ComfyUI 生成超时。');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readNovelAIImageBlob(blob: Blob, contentType: string): Promise<{ src: string; mimeType: string }> {
  const declaredType = blob.type || contentType;
  if (isZipContentType(declaredType)) {
    return readFirstImageFromZip(blob);
  }
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (isZipHeader(header)) {
    return readFirstImageFromZip(blob);
  }
  const mimeType = normalizeImageMimeType(declaredType, undefined);
  return { src: await blobToDataUrl(blob), mimeType };
}

async function persistRemoteImage(url: string, meta: { model?: string; backend?: string; signal?: AbortSignal }): Promise<ImageGenerationResult> {
  try {
    const response = await fetch(url, { signal: meta.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const mimeType = normalizeImageMimeType(blob.type || response.headers.get('content-type') || '', undefined);
    return {
      src: await blobToDataUrl(new Blob([blob], { type: mimeType })),
      mimeType,
      model: meta.model,
      backend: meta.backend,
      originalUrl: url,
    };
  } catch {
    return {
      src: url,
      model: meta.model,
      backend: meta.backend,
      originalUrl: url,
    };
  }
}

function isZipContentType(contentType: string): boolean {
  return /(?:application|binary)\/(?:zip|x-zip-compressed)|application\/octet-stream/i.test(contentType);
}

function isZipHeader(header: Uint8Array): boolean {
  return header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
}

async function readFirstImageFromZip(blob: Blob): Promise<{ src: string; mimeType: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const entry = findFirstZipImageEntry(bytes);
  if (!entry) throw new Error('NovelAI 返回了压缩包，但里面没有找到 PNG/JPEG/WebP 图片。');

  const compressed = bytes.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const imageBytes = entry.compressionMethod === 0
    ? compressed
    : entry.compressionMethod === 8
      ? await inflateRaw(compressed)
      : undefined;
  if (!imageBytes) throw new Error(`NovelAI 返回的压缩包使用了暂不支持的压缩方式：${entry.compressionMethod}。`);

  const mimeType = normalizeImageMimeType('', entry.filename, imageBytes);
  const imageBlob = new Blob([imageBytes], { type: mimeType });
  return { src: await blobToDataUrl(imageBlob), mimeType };
}

function findFirstZipImageEntry(bytes: Uint8Array): { filename: string; compressionMethod: number; compressedSize: number; dataOffset: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset >= 0) {
    const entryCount = view.getUint16(eocdOffset + 10, true);
    let offset = view.getUint32(eocdOffset + 16, true);
    for (let index = 0; index < entryCount && offset + 46 <= bytes.length; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const filenameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const filename = decodeZipFilename(bytes.slice(offset + 46, offset + 46 + filenameLength));
      if (isImageFilename(filename)) {
        const dataOffset = getZipLocalDataOffset(view, localHeaderOffset);
        if (dataOffset >= 0) return { filename, compressionMethod, compressedSize, dataOffset };
      }
      offset += 46 + filenameLength + extraLength + commentLength;
    }
  }

  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const filename = decodeZipFilename(bytes.slice(offset + 30, offset + 30 + filenameLength));
    const dataOffset = offset + 30 + filenameLength + extraLength;
    if (isImageFilename(filename) && compressedSize > 0) return { filename, compressionMethod, compressedSize, dataOffset };
    offset = dataOffset + compressedSize;
  }
  return null;
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function getZipLocalDataOffset(view: DataView, localHeaderOffset: number): number {
  if (localHeaderOffset < 0 || localHeaderOffset + 30 > view.byteLength) return -1;
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) return -1;
  const filenameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  return localHeaderOffset + 30 + filenameLength + extraLength;
}

function decodeZipFilename(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return Array.from(bytes, (item) => String.fromCharCode(item)).join('');
  }
}

function isImageFilename(filename: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filename);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const Decompression = (globalThis as typeof globalThis & { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!Decompression) throw new Error('当前浏览器不支持解压 NovelAI 返回的 zip 图片包。');
  const stream = new Blob([bytes]).stream().pipeThrough(new Decompression('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function normalizeImageMimeType(contentType: string, filename?: string, bytes?: Uint8Array): string {
  if (/image\/png/i.test(contentType)) return 'image/png';
  if (/image\/jpe?g/i.test(contentType)) return 'image/jpeg';
  if (/image\/webp/i.test(contentType)) return 'image/webp';
  if (filename && /\.jpe?g$/i.test(filename)) return 'image/jpeg';
  if (filename && /\.webp$/i.test(filename)) return 'image/webp';
  if (bytes?.length && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes?.length && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return 'image/png';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}
