export type 图片后端类型 = 'openai_compatible' | 'novelai' | 'sd_webui' | 'comfyui';

export type 图片资源来源 = 'generated' | 'upload' | 'remote';
export type 图片资源状态 = 'ready' | 'failed' | 'pending';
export type 图片目标类型 = 'traveler' | 'npc' | 'phone' | 'scene' | 'item' | 'nsfw_part' | 'misc';

export type 图片槽位 =
  | 'avatar_profile'
  | 'avatar_story'
  | 'avatar_phone'
  | 'portrait'
  | 'phone_wallpaper'
  | 'phone_chat_background'
  | 'group_avatar'
  | 'scene'
  | 'item_icon'
  | 'nsfw_female_chest'
  | 'nsfw_female_genital'
  | 'nsfw_male_genital'
  | 'nsfw_rear'
  | 'nsfw_body_reference'
  | 'misc';

export interface 图片资源 {
  id: string;
  url?: string;
  dataUrl?: string;
  localRef?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  source: 图片资源来源;
  nsfw: boolean;
  createdAt: number;
  prompt?: string;
  negativePrompt?: string;
  dimensions?: string;
  model?: string;
  backend?: 图片后端类型 | string;
  status: 图片资源状态;
  error?: string;
}

export interface 相册条目 {
  id: string;
  assetId: string;
  title: string;
  targetType: 图片目标类型;
  targetId?: string;
  slot: 图片槽位;
  tags: string[];
  nsfw: boolean;
  createdAt: number;
  note?: string;
}

export type 图片生成任务状态 = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type 图片生成任务来源 = 'manual' | 'auto' | 'retry';

export interface 图片生成任务 {
  id: string;
  targetType: 图片目标类型;
  targetId?: string;
  slot: 图片槽位;
  source: 图片生成任务来源;
  status: 图片生成任务状态;
  backend: 图片后端类型 | string;
  nsfw: boolean;
  prompt: string;
  negativePrompt?: string;
  dimensions?: string;
  resultAssetId?: string;
  error?: string;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface 相册系统 {
  assets: 图片资源[];
  entries: 相册条目[];
  tasks: 图片生成任务[];
}

export function 创建空相册系统(): 相册系统 {
  return {
    assets: [],
    entries: [],
    tasks: [],
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

export function 归一化相册系统(input?: Partial<相册系统> | null): 相册系统 {
  if (!input) return 创建空相册系统();

  const assets = Array.isArray(input.assets)
    ? input.assets.map((asset) => ({
        ...asset,
        id: String(asset.id || `asset_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        source: asset.source ?? 'generated',
        nsfw: asset.nsfw === true,
        createdAt: Number(asset.createdAt) || Date.now(),
        status: asset.status ?? 'ready',
      }))
    : [];

  const entries = Array.isArray(input.entries)
    ? input.entries.map((entry) => ({
        ...entry,
        id: String(entry.id || `album_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        assetId: String(entry.assetId || ''),
        title: String(entry.title || '未命名图片'),
        targetType: entry.targetType ?? 'misc',
        slot: entry.slot ?? 'misc',
        tags: normalizeStringArray(entry.tags),
        nsfw: entry.nsfw === true,
        createdAt: Number(entry.createdAt) || Date.now(),
      })).filter((entry) => entry.assetId)
    : [];

  const tasks = Array.isArray(input.tasks)
    ? input.tasks.map((task) => ({
        ...task,
        id: String(task.id || `img_task_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        targetType: task.targetType ?? 'misc',
        slot: task.slot ?? 'misc',
        source: task.source ?? 'manual',
        status: task.status ?? 'queued',
        backend: task.backend || 'openai_compatible',
        nsfw: task.nsfw === true,
        prompt: String(task.prompt || ''),
        dimensions: typeof task.dimensions === 'string' ? task.dimensions : undefined,
        retryCount: Math.max(0, Math.trunc(Number(task.retryCount) || 0)),
        createdAt: Number(task.createdAt) || Date.now(),
      }))
    : [];

  return { assets, entries, tasks };
}
