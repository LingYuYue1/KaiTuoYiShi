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
  | 'reference_image'
  | 'misc';

export interface 图片资源 {
  id: string;
  url?: string;
  originalUrl?: string;
  dataUrl?: string;
  localRef?: string;
  /** 图片原始字节的 SHA-256，用于跨导入和上传去重。 */
  contentHash?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  source: 图片资源来源;
  nsfw: boolean;
  createdAt: number;
  prompt?: string;
  negativePrompt?: string;
  sourcePrompt?: string;
  finalPrompt?: string;
  finalNegativePrompt?: string;
  anchorMode?: boolean;
  anchorSummary?: string;
  referenceImageIds?: string[];
  dimensions?: string;
  model?: string;
  backend?: string;
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
  /** 可同时作为这些角色的生成参考，不改变图片原有归属或槽位。 */
  referenceTargets: string[];
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
  backend: string;
  nsfw: boolean;
  prompt: string;
  negativePrompt?: string;
  sourcePrompt?: string;
  finalPrompt?: string;
  finalNegativePrompt?: string;
  anchorMode?: boolean;
  anchorSummary?: string;
  referenceImageIds?: string[];
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

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const list = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return [...new Set(list)];
}

export function isCharacterLibrarySlot(slot: 图片槽位): boolean {
  return slot === 'avatar_profile' || slot === 'avatar_story' || slot === 'avatar_phone' || slot === 'portrait';
}

export function slotLabel(slot: 图片槽位): string {
  const labels: Record<图片槽位, string> = {
    avatar_profile: '档案头像',
    avatar_story: '正文头像',
    avatar_phone: '手机头像',
    portrait: '角色立绘',
    phone_wallpaper: '手机壁纸',
    phone_chat_background: '聊天背景',
    group_avatar: '群聊头像',
    scene: '场景',
    item_icon: '物品图标',
    nsfw_female_chest: 'NSFW 胸部',
    nsfw_female_genital: 'NSFW 女性私处',
    nsfw_male_genital: 'NSFW 男性器',
    nsfw_rear: 'NSFW 后庭',
    nsfw_body_reference: 'NSFW 身体参考',
    reference_image: '参考图',
    misc: '其他',
  };
  return labels[slot];
}

export function resolveSize(preset: 'default' | '1:1' | '3:4' | '16:9' | 'custom', customSize: string, slot: 图片槽位): string {
  if (preset === 'custom') return customSize.trim() || defaultSizeForSlot(slot);
  if (preset === '1:1') return '1024x1024';
  if (preset === '3:4') return '1024x1365';
  if (preset === '16:9') return '1280x720';
  return defaultSizeForSlot(slot);
}

export function defaultSizeForSlot(slot: 图片槽位): string {
  if (slot === 'portrait') return '1024x1365';
  if (slot === 'scene' || slot === 'phone_wallpaper' || slot === 'phone_chat_background') return '1280x720';
  return '1024x1024';
}

/** 相册参考目标：参考图条目或显式 referenceTargets 输入。 */
type 相册参考目标 = Pick<相册条目, 'targetType' | 'targetId' | 'slot'> & { referenceTargets?: unknown };

export function 读取图片参考目标(entry: 相册参考目标): string[] {
  if (Array.isArray(entry.referenceTargets)) return normalizeStringArray(entry.referenceTargets);
  if (entry.slot !== 'reference_image') return [];
  const targetId = entry.targetType === 'traveler' ? 'traveler' : entry.targetId;
  return targetId ? [targetId] : [];
}

export function 图片是否参考角色(entry: 相册参考目标, characterId: string): boolean {
  return Boolean(characterId) && 读取图片参考目标(entry).includes(characterId);
}

export function 归一化相册系统(input?: Partial<相册系统> | null): 相册系统 {
  if (!input) return 创建空相册系统();

  const assets = Array.isArray(input.assets)
    ? input.assets.map((asset) => ({
        ...asset,
        id: asset.id || `asset_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        source: asset.source,
        nsfw: asset.nsfw,
        createdAt: asset.createdAt || Date.now(),
        status: asset.status,
        contentHash: typeof asset.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(asset.contentHash.trim())
          ? asset.contentHash.trim().toLowerCase()
          : undefined,
      }))
    : [];

  const rawEntries = Array.isArray(input.entries)
    ? input.entries.map((entry) => {
        const normalized = {
          ...entry,
          id: entry.id || `album_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          assetId: entry.assetId || '',
          title: entry.title || '未命名图片',
          targetType: entry.targetType,
          slot: entry.slot,
          tags: normalizeStringArray(entry.tags),
          nsfw: entry.nsfw,
          createdAt: entry.createdAt || Date.now(),
        };
        return { ...normalized, referenceTargets: 读取图片参考目标(normalized) };
      }).filter((entry) => entry.assetId)
    : [];
  const claimedReferenceTargets = new Set<string>();
  const entries = rawEntries.map((entry) => ({
    ...entry,
    referenceTargets: entry.referenceTargets.filter((targetId) => {
      if (claimedReferenceTargets.has(targetId)) return false;
      claimedReferenceTargets.add(targetId);
      return true;
    }),
  }));

  const tasks = Array.isArray(input.tasks)
    ? input.tasks.map((task) => ({
        ...task,
        id: task.id || `img_task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        targetType: task.targetType,
        slot: task.slot,
        source: task.source,
        status: task.status,
        backend: task.backend || 'openai_compatible',
        nsfw: task.nsfw,
        prompt: task.prompt || '',
        referenceImageIds: normalizeStringArray(task.referenceImageIds),
        dimensions: typeof task.dimensions === 'string' ? task.dimensions : undefined,
        retryCount: Math.max(0, Math.trunc(task.retryCount || 0)),
        createdAt: task.createdAt || Date.now(),
      }))
    : [];

  return { assets, entries, tasks };
}
