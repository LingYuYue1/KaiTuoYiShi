import { 图片是否参考角色 } from '@/models/imageGeneration';
import type { 图片资源, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { 文生图API配置, 文生图参考图设置 } from '@/models/settings';
import { pickAssetDisplayUrl } from '@/utils/albumObjectUrl';
import type { generateTargets } from './foundation';

type GenerationTarget = typeof generateTargets[number];

export type ReferenceInjectionStatusCode =
  | 'disabled'
  | 'not_applicable'
  | 'missing_reference'
  | 'unsupported'
  | 'enabled'
  | 'unavailable';

export interface ReferenceInjectionStatus {
  code: ReferenceInjectionStatusCode;
  label: string;
  usable: boolean;
}

type ReferenceDecision = {
  status: ReferenceInjectionStatus;
  entry?: 相册条目;
};

export type ReferenceImagePayload = {
  status: ReferenceInjectionStatus;
  entries: 相册条目[];
  images: Array<{ id: string; src: string; role: 'character'; weight: number }>;
};

export function backendLabel(backend: 文生图API配置['backend'] | string): string {
  return {
    openai_compatible: 'OpenAI 兼容',
    novelai: 'NovelAI',
    sd_webui: 'SD WebUI',
    comfyui: 'ComfyUI',
  }[backend] ?? String(backend || '未选择');
}

export function referenceBackendCapability(
  backend: 文生图API配置['backend'],
  settings: 文生图参考图设置,
): { usable: boolean; message: string } {
  if (backend === 'sd_webui') return { usable: true, message: '支持参考图，生成时使用 img2img。' };
  if (backend === 'comfyui') {
    return settings.enableComfyWorkflowReference
      ? { usable: true, message: '已允许工作流参考图；工作流必须包含参考图占位符。' }
      : { usable: false, message: '尚未允许 ComfyUI 工作流参考图。' };
  }
  if (backend === 'openai_compatible') {
    return settings.enableOpenAICompatibleReference
      ? { usable: true, message: '已允许发送参考图；部分中转供应商可能不支持。' }
      : { usable: false, message: '默认不向 OpenAI 兼容接口发送参考图，可通过兼容开关选择启用。' };
  }
  if (backend === 'novelai') return { usable: false, message: 'NovelAI 参考图参数尚未接入。' };
  return { usable: false, message: '当前后端未声明参考图能力。' };
}

export function referenceBackendSupport(
  backend: 文生图API配置['backend'],
  settings: 文生图参考图设置,
): { usable: boolean; message: string } {
  if (!settings.enabled) return { usable: false, message: '参考图总开关关闭：素材只保存，不参与任何生成。' };
  return referenceBackendCapability(backend, settings);
}

export function isReferenceInjectionTarget(target: GenerationTarget): boolean {
  return target.targetType === 'traveler' || target.targetType === 'npc' || target.targetType === 'nsfw_part';
}

function status(code: ReferenceInjectionStatusCode, label: string, usable = false): ReferenceInjectionStatus {
  return { code, label, usable };
}

export function evaluateReferenceInjection(params: {
  target: GenerationTarget;
  targetId?: string;
  api: 文生图API配置;
  settings: 文生图参考图设置;
  album: 相册系统;
}): ReferenceDecision {
  if (!params.settings.enabled) {
    return { status: status('disabled', '暂未开启参考图') };
  }
  if (!isReferenceInjectionTarget(params.target)) {
    return { status: status('not_applicable', '已开启参考图 · 当前任务不使用') };
  }

  const targetId = params.target.targetType === 'traveler' ? 'traveler' : params.targetId;
  const referenceEntry = targetId
    ? params.album.entries.find((entry) => 图片是否参考角色(entry, targetId))
    : undefined;
  if (!referenceEntry) {
    return { status: status('missing_reference', '已开启参考图 · 当前角色未设置') };
  }

  const support = params.api.enabled
    ? referenceBackendCapability(params.api.backend, params.settings)
    : { usable: false, message: '当前图片接口未启用。' };
  if (!support.usable) {
    return { status: status('unsupported', '已开启参考图 · 当前接口不支持'), entry: referenceEntry };
  }

  return { status: status('enabled', '已开启参考图', true), entry: referenceEntry };
}

export function resolveReferenceImagesForGeneration(params: {
  target: GenerationTarget;
  targetId?: string;
  api: 文生图API配置;
  settings: 文生图参考图设置;
  album: 相册系统;
  assetMap: Map<string, Pick<图片资源, 'dataUrl' | 'url' | 'localRef'>>;
}): ReferenceImagePayload {
  const decision = evaluateReferenceInjection(params);
  if (!decision.status.usable || !decision.entry) {
    return { status: decision.status, entries: [], images: [] };
  }

  const asset = params.assetMap.get(decision.entry.assetId);
  const src = pickAssetDisplayUrl(asset ?? {}) || '';
  if (!src) {
    return {
      status: status('unavailable', '已开启参考图 · 当前图片不可用'),
      entries: [],
      images: [],
    };
  }

  return {
    status: decision.status,
    entries: [decision.entry],
    images: [{ id: decision.entry.id, src, role: 'character', weight: 1 }],
  };
}
