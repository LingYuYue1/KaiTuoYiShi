export type 图片后端类型 = 'openai_compatible' | 'novelai' | 'sd_webui' | 'comfyui';

export type NovelAIContentMode = 'official' | 'append' | 'replace' | 'off';

export interface NovelAIAdvancedSettings {
  qualityMode: NovelAIContentMode;
  qualityText: string;
  ucMode: NovelAIContentMode;
  ucText: string;
  basePromptPrefix: string;
  basePromptSuffix: string;
  characterPromptPrefix: string;
  characterPromptSuffix: string;
  negativePromptAppend: string;
}

export interface NovelAITaskOverrides extends Partial<NovelAIAdvancedSettings> {}

export interface StorySnapshotCharacterContext {
  name: string;
  subjectType: 'girl' | 'boy' | 'other';
  visualPrompt: string;
  negativePrompt: string;
  source: 'traveler' | 'npc' | 'model';
  enabled?: boolean;
}

export interface StorySnapshotRenderContext {
  schemaVersion: 1;
  scenePrompt: string;
  sceneNegativePrompt: string;
  characters: StorySnapshotCharacterContext[];
  stylePrompt?: string;
  styleNegativePrompt?: string;
}

const STORY_SNAPSHOT_CONTEXT_LIMITS = {
  scenePrompt: 1200,
  sceneNegativePrompt: 600,
  stylePrompt: 600,
  styleNegativePrompt: 300,
  characterName: 80,
  characterPrompt: 600,
  characterNegativePrompt: 300,
  characters: 4,
  serializedBytes: 8192,
} as const;

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
  backend: 图片后端类型 | string;
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
  storySnapshotContext?: StorySnapshotRenderContext;
  novelAIOverrides?: NovelAITaskOverrides;
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

function limitContextString(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function storySnapshotContextBytes(value: StorySnapshotRenderContext): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function normalizeStorySnapshotRenderContext(input: unknown): StorySnapshotRenderContext | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Partial<StorySnapshotRenderContext>;
  const characters = Array.isArray(source.characters)
    ? source.characters.slice(0, STORY_SNAPSHOT_CONTEXT_LIMITS.characters).map((raw) => {
        const character = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? raw as Partial<StorySnapshotCharacterContext>
          : {};
        return {
          name: limitContextString(character.name, STORY_SNAPSHOT_CONTEXT_LIMITS.characterName) || 'Character',
          subjectType: character.subjectType === 'girl' || character.subjectType === 'boy'
            ? character.subjectType
            : 'other' as const,
          visualPrompt: limitContextString(character.visualPrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.characterPrompt),
          negativePrompt: limitContextString(character.negativePrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.characterNegativePrompt),
          source: character.source === 'traveler' || character.source === 'npc'
            ? character.source
            : 'model' as const,
          enabled: character.enabled !== false,
        };
      }).filter((character) => character.visualPrompt)
    : [];
  const normalized: StorySnapshotRenderContext = {
    schemaVersion: 1,
    scenePrompt: limitContextString(source.scenePrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.scenePrompt),
    sceneNegativePrompt: limitContextString(source.sceneNegativePrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.sceneNegativePrompt),
    characters,
    stylePrompt: limitContextString(source.stylePrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.stylePrompt) || undefined,
    styleNegativePrompt: limitContextString(source.styleNegativePrompt, STORY_SNAPSHOT_CONTEXT_LIMITS.styleNegativePrompt) || undefined,
  };

  const shrinkTargets: Array<() => boolean> = [
    () => shrinkContextField(normalized, 'stylePrompt'),
    () => shrinkContextField(normalized, 'styleNegativePrompt'),
    ...characters.map((_, index) => () => shrinkCharacterField(normalized, index, 'negativePrompt')),
    () => shrinkContextField(normalized, 'sceneNegativePrompt'),
    ...characters.map((_, index) => () => shrinkCharacterField(normalized, index, 'visualPrompt')),
    () => shrinkContextField(normalized, 'scenePrompt'),
  ];
  let targetIndex = 0;
  while (storySnapshotContextBytes(normalized) > STORY_SNAPSHOT_CONTEXT_LIMITS.serializedBytes) {
    const changed = shrinkTargets[targetIndex % shrinkTargets.length]();
    targetIndex += 1;
    if (!changed && targetIndex >= shrinkTargets.length * 2) break;
  }
  return normalized;
}

export function normalizeNovelAITaskOverrides(input: unknown): NovelAITaskOverrides | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as NovelAITaskOverrides;
  const modes = new Set<NovelAIContentMode>(['official', 'append', 'replace', 'off']);
  const result: NovelAITaskOverrides = {};
  if (source.qualityMode && modes.has(source.qualityMode)) result.qualityMode = source.qualityMode;
  if (source.ucMode && modes.has(source.ucMode)) result.ucMode = source.ucMode;
  const stringLimits: Array<[keyof NovelAIAdvancedSettings, number]> = [
    ['qualityText', 1600],
    ['ucText', 1600],
    ['basePromptPrefix', 1600],
    ['basePromptSuffix', 1600],
    ['characterPromptPrefix', 800],
    ['characterPromptSuffix', 800],
    ['negativePromptAppend', 1600],
  ];
  for (const [key, limit] of stringLimits) {
    if (typeof source[key] === 'string') result[key] = source[key]!.trim().slice(0, limit) as never;
  }
  return result;
}

function shrinkContextField(
  context: StorySnapshotRenderContext,
  key: 'scenePrompt' | 'sceneNegativePrompt' | 'stylePrompt' | 'styleNegativePrompt',
): boolean {
  const value = context[key] ?? '';
  if (!value) return false;
  context[key] = value.slice(0, Math.max(0, value.length - 128));
  return true;
}

function shrinkCharacterField(
  context: StorySnapshotRenderContext,
  index: number,
  key: 'visualPrompt' | 'negativePrompt',
): boolean {
  const character = context.characters[index];
  const value = character?.[key] ?? '';
  if (!character || !value) return false;
  character[key] = value.slice(0, Math.max(0, value.length - 128));
  return true;
}

export function 读取图片参考目标(entry: Pick<相册条目, 'targetType' | 'targetId' | 'slot'> & { referenceTargets?: unknown }): string[] {
  if (Array.isArray(entry.referenceTargets)) return normalizeStringArray(entry.referenceTargets);
  if (entry.slot !== 'reference_image') return [];
  const targetId = entry.targetType === 'traveler' ? 'traveler' : entry.targetId;
  return targetId ? [targetId] : [];
}

export function 图片是否参考角色(entry: Pick<相册条目, 'targetType' | 'targetId' | 'slot'> & { referenceTargets?: unknown }, characterId: string): boolean {
  return Boolean(characterId) && 读取图片参考目标(entry).includes(characterId);
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
        contentHash: typeof asset.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(asset.contentHash.trim())
          ? asset.contentHash.trim().toLowerCase()
          : undefined,
      }))
    : [];

  const rawEntries = Array.isArray(input.entries)
    ? input.entries.map((entry) => {
        const normalized = {
          ...entry,
          id: String(entry.id || `album_${Date.now()}_${Math.random().toString(36).slice(2)}`),
          assetId: String(entry.assetId || ''),
          title: String(entry.title || '未命名图片'),
          targetType: entry.targetType ?? 'misc',
          slot: entry.slot ?? 'misc',
          tags: normalizeStringArray(entry.tags),
          nsfw: entry.nsfw === true,
          createdAt: Number(entry.createdAt) || Date.now(),
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
        id: String(task.id || `img_task_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        targetType: task.targetType ?? 'misc',
        slot: task.slot ?? 'misc',
        source: task.source ?? 'manual',
        status: task.status ?? 'queued',
        backend: task.backend || 'openai_compatible',
        nsfw: task.nsfw === true,
        prompt: String(task.prompt || ''),
        referenceImageIds: normalizeStringArray(task.referenceImageIds),
        dimensions: typeof task.dimensions === 'string' ? task.dimensions : undefined,
        storySnapshotContext: normalizeStorySnapshotRenderContext(task.storySnapshotContext),
        novelAIOverrides: normalizeNovelAITaskOverrides(task.novelAIOverrides),
        retryCount: Math.max(0, Math.trunc(Number(task.retryCount) || 0)),
        createdAt: Number(task.createdAt) || Date.now(),
      }))
    : [];

  return { assets, entries, tasks };
}
