import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { 图片槽位, 图片生成任务, 图片目标类型, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { API设置, PNG画风预设来源, 游戏设置, 文生图API配置, 文生图参考图设置, 文生图规则中心设置, 文生图系统设置 } from '@/models/settings';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录, NPC头像槽位, NPC角色锚点档案 } from '@/models/npc';
import { 读取NPC头像 } from '@/models/npc';
import { saveSetting } from '@/services/dbService';
import {
  添加图片到相册,
  创建相册图片条目,
  fileToDataUrl,
  挂载NPC头像图片,
  挂载NPC立绘图片,
  挂载NPC_NSFW部位图片,
  挂载旅人图片,
  卸载NPC头像图片,
  卸载NPC立绘图片,
  卸载NPC_NSFW部位图片,
  卸载旅人图片,
  读取相册条目地址,
} from '@/utils/albumActions';
import { generateImage } from '@/services/ai/imageGeneration';
import { ImageRuleTemplateEditor } from '@/components/features/ImageGeneration/ImageRuleTemplateEditor';
import { ImageGenerationSettingsTab } from '@/components/features/Settings/ImageGenerationSettingsTab';
import { parseSceneImagePrompt, parseStorySnapshotPrompt } from '@/services/ai/narrativeImageParse';
import { extractCharacterAnchorWithAI } from '@/services/ai/characterAnchorExtract';
import { buildNpcImagePrompt, buildSceneImagePrompt, buildTravelerImagePrompt, 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { readImageError, runImageGenerationWithRetry } from '@/utils/imageGenerationRetry';
import { buildImagePromptTokenizerConfig, buildImagePromptTokenizerSystemPrompt, tokenizeImagePrompt } from '@/services/ai/imagePromptTokenizer';
import { getBuiltinAvatarSet } from '@/data/builtinAvatars';
import { matchCanonical } from '@/data/canonicalCharacters';

interface AlbumPanelProps {
  album: 相册系统;
  onAlbumChange: React.Dispatch<React.SetStateAction<相册系统>>;
  traveler: 角色数据结构;
  onTravelerChange: React.Dispatch<React.SetStateAction<角色数据结构>>;
  phone: 手机系统;
  onPhoneChange: React.Dispatch<React.SetStateAction<手机系统>>;
  npcs: NPC记录[];
  onNpcChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  apiSettings: API设置;
  gameSettings: 游戏设置;
  onGameSettingsChange: React.Dispatch<React.SetStateAction<游戏设置>>;
  imageSettings: 文生图系统设置;
  nsfwEnabled: boolean;
  nsfwImageEnabled: boolean;
  mainChatHistory?: 聊天消息[];
}

type WorkTab = 'manual' | 'library' | 'sceneLibrary' | 'anchor' | 'reference' | 'scene' | 'sceneImage' | 'phone' | 'rules' | 'queue' | 'history' | 'manage' | 'settings';
type GenerateTarget = 'traveler_avatar' | 'traveler_portrait' | 'npc_avatar' | 'npc_portrait' | 'scene' | 'phone_wallpaper' | 'nsfw_reference';
type NsfwPartImageSlot = '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考';
type LibraryStatusFilter = 'all' | 'ready' | 'empty';
type PromptMeta = { anchorMode: boolean; anchorSummary: string; sourcePrompt?: string };
type StorySnapshotSource = 'latest_assistant' | 'previous_turn' | 'manual';
type AnchorSelection = 'traveler' | string;
type SceneLibraryFilter = 'all' | 'scene' | 'snapshot' | 'phone';
type GenerationHistoryFilter = 'all' | 'character' | 'scene' | 'snapshot' | 'phone';
type AlbumImportTarget = {
  scope: 'character' | 'scene';
  targetType: 图片目标类型;
  targetId?: string;
  sceneKind?: Exclude<SceneLibraryFilter, 'all'>;
};
type StorySnapshotSummary = {
  title: string;
  characters: string[];
  location: string;
  atmosphere: string;
  action: string;
  camera: string;
  avoid: string;
};
type SceneImageSummary = {
  title: string;
  location: string;
  atmosphere: string;
  subject: string;
  camera: string;
  avoid: string;
};
type StorySnapshotSourceOption = { id: StorySnapshotSource; title: string; desc: string; text: string };

const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const albumGridLayer = 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.062) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-cyan),0.048) 1px, transparent 1px)';
const albumGridSize = '26px 26px, 26px 26px, auto, auto';
const heroSurface = `${albumGridLayer}, radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.14), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface),0.78), rgba(var(--tj-bg-primary),0.94))`;
const panelSurface = 'radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.08), transparent 28%), linear-gradient(180deg, rgba(var(--tj-surface),0.74), rgba(var(--tj-bg-primary),0.94))';
const insetSurface = 'linear-gradient(135deg, rgba(var(--tj-surface),0.64), rgba(var(--tj-surface-strong),0.76))';
const imageWellSurface = 'linear-gradient(135deg, rgba(var(--tj-surface-strong),0.8), rgba(var(--tj-bg-primary),0.88))';
const titleColor = 'rgb(var(--tj-ui-title))';
const bodyColor = 'rgba(var(--tj-ui-body),0.94)';
const mutedColor = 'rgba(var(--tj-ui-muted),0.78)';
const faintColor = 'rgba(var(--tj-ui-faint),0.66)';
const activeTextColor = 'rgb(var(--tj-ui-active-text))';
const accentColor = 'rgb(var(--tj-accent-primary))';
const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
const activeAccentSurface = 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgba(223,211,130,0.96) 48%, rgb(var(--tj-tech-cyan)) 100%)';
const quietAccentSurface = 'rgba(var(--tj-accent-primary),0.055)';
const cardSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel),0.76), rgba(var(--tj-ui-panel-strong),0.72))';
const heroGridBackgroundStyle = {
  backgroundSize: albumGridSize,
  backgroundPosition: '0 0, 0 0, center, center',
} as CSSProperties;
const albumThemeStyle = {
  '--tj-bg-primary': '8, 7, 9',
  '--tj-bg-secondary': '16, 14, 16',
  '--tj-text-primary': '230, 218, 188',
  '--tj-text-secondary': '160, 148, 120',
  '--tj-accent-primary': '245, 217, 122',
  '--tj-accent-secondary': '196, 163, 90',
  '--tj-border': '245, 217, 122',
  '--tj-on-accent': '26, 19, 37',
  '--tj-surface': '16, 14, 16',
  '--tj-surface-strong': '10, 9, 10',
  '--tj-tech-cyan': '117, 214, 216',
  '--tj-tech-cyan-deep': '117, 214, 216',
  '--tj-ui-title': '255, 244, 212',
  '--tj-ui-body': '235, 223, 193',
  '--tj-ui-muted': '180, 168, 140',
  '--tj-ui-faint': '160, 148, 120',
  '--tj-ui-active-text': '26, 19, 37',
  '--tj-ui-panel': '16, 14, 16',
  '--tj-ui-panel-strong': '8, 7, 9',
  color: 'rgb(230, 218, 188)',
} as CSSProperties;

const tabs: { id: WorkTab; label: string; desc: string; group: 'create' | 'manage' }[] = [
  { id: 'manual', label: '图片生成', desc: '生成图片与构图', group: 'create' },
  { id: 'scene', label: '故事快照', desc: '正文插图与场景', group: 'create' },
  { id: 'sceneImage', label: '场景图', desc: '地点与新闻配图', group: 'create' },
  { id: 'phone', label: '手机背景', desc: '壁纸与聊天背景', group: 'create' },
  { id: 'anchor', label: '角色视觉', desc: '头像与立绘锚点', group: 'create' },
  { id: 'reference', label: '参考图', desc: '手动启用与兼容', group: 'create' },
  { id: 'library', label: '成品库', desc: '归档与挂载', group: 'manage' },
  { id: 'sceneLibrary', label: '场景库', desc: '场景与手机图库', group: 'manage' },
  { id: 'rules', label: '规则中心', desc: 'Prompt 规范', group: 'manage' },
  { id: 'queue', label: '生成队列', desc: '状态与重试', group: 'manage' },
  { id: 'history', label: '历史', desc: '生成记录', group: 'manage' },
  { id: 'manage', label: '整理', desc: '导入导出', group: 'manage' },
  { id: 'settings', label: '设置', desc: '接口与正文插图', group: 'manage' },
];

const generateTargets: Array<{
  id: GenerateTarget;
  label: string;
  desc: string;
  targetType: 图片目标类型;
  slot: 图片槽位;
  tokenizerMode: 'avatar' | 'portrait' | 'scene';
  nsfw?: boolean;
  sceneApi?: boolean;
}> = [
  { id: 'traveler_avatar', label: '旅人头像', desc: '用于旅人档案、正文头像或手机头像。', targetType: 'traveler', slot: 'avatar_profile', tokenizerMode: 'avatar' },
  { id: 'traveler_portrait', label: '旅人立绘', desc: '用于旅人档案大图和后续角色预览。', targetType: 'traveler', slot: 'portrait', tokenizerMode: 'portrait' },
  { id: 'npc_avatar', label: '伙伴头像', desc: '用于伙伴档案、正文头像或手机头像。', targetType: 'npc', slot: 'avatar_profile', tokenizerMode: 'avatar' },
  { id: 'npc_portrait', label: '伙伴立绘', desc: '完整服饰与姿态，后续用于角色立绘槽位。', targetType: 'npc', slot: 'portrait', tokenizerMode: 'portrait' },
  { id: 'scene', label: '场景图', desc: '地点、剧情快照、新闻配图。', targetType: 'scene', slot: 'scene', tokenizerMode: 'scene', sceneApi: true },
  { id: 'phone_wallpaper', label: '手机背景', desc: '手机界面壁纸或聊天背景。', targetType: 'phone', slot: 'phone_wallpaper', tokenizerMode: 'scene', sceneApi: true },
  { id: 'nsfw_reference', label: 'NSFW 参考图', desc: '只走 NSFW 独立接口，不进入普通生成。', targetType: 'nsfw_part', slot: 'nsfw_body_reference', tokenizerMode: 'portrait', nsfw: true },
];

const imageGenerationTargets = generateTargets.filter((target) => target.id !== 'scene' && target.id !== 'phone_wallpaper');
type GenerateOverride = {
  prompt?: string;
  negativePrompt?: string;
  title?: string;
  target?: typeof generateTargets[number];
  anchorMode?: boolean;
  anchorSummary?: string;
  sourcePrompt?: string;
  imageApi?: 文生图API配置;
  size?: string;
  targetId?: string;
  tags?: string[];
  note?: string;
  statusMessage?: string;
  disabledMessage?: string;
};

export function AlbumPanel({ album, onAlbumChange, traveler, onTravelerChange, phone, onPhoneChange, npcs, onNpcChange, apiSettings, gameSettings, onGameSettingsChange, imageSettings, nsfwEnabled, nsfwImageEnabled, mainChatHistory = [] }: AlbumPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkTab>('manual');
  const [showNsfw, setShowNsfw] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [lastPromptMeta, setLastPromptMeta] = useState<PromptMeta | null>(null);
  const [generateTitle, setGenerateTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const [generateTarget, setGenerateTarget] = useState<GenerateTarget>('npc_avatar');
  const [sizePreset, setSizePreset] = useState<'default' | '1:1' | '3:4' | '16:9' | 'custom'>('default');
  const [customSize, setCustomSize] = useState('');
  const [extraRequirement, setExtraRequirement] = useState('');
  const [tokenizerNpcId, setTokenizerNpcId] = useState('');
  const [tokenizerMode, setTokenizerMode] = useState<'avatar' | 'portrait' | 'scene'>('avatar');
  const [tokenizing, setTokenizing] = useState(false);
  const [sceneText, setSceneText] = useState('');
  const [sceneImageText, setSceneImageText] = useState('');
  const [sceneImageSummary, setSceneImageSummary] = useState<SceneImageSummary | null>(null);
  const [sceneImageAnalyzing, setSceneImageAnalyzing] = useState(false);
  const [storySnapshotSource, setStorySnapshotSource] = useState<StorySnapshotSource>('latest_assistant');
  const [storySnapshotDraft, setStorySnapshotDraft] = useState('');
  const [storySnapshotSummary, setStorySnapshotSummary] = useState<StorySnapshotSummary | null>(null);
  const [storySnapshotAnalyzing, setStorySnapshotAnalyzing] = useState(false);
  const [libraryNameFilter, setLibraryNameFilter] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<LibraryStatusFilter>('all');
  const [libraryNpcId, setLibraryNpcId] = useState('');
  const [sceneLibraryFilter, setSceneLibraryFilter] = useState<SceneLibraryFilter>('all');
  const [anchorSelection, setAnchorSelection] = useState<AnchorSelection>('traveler');
  const [anchorExtractingTarget, setAnchorExtractingTarget] = useState<AnchorSelection | null>(null);
  const [anchorBatchExtracting, setAnchorBatchExtracting] = useState(false);
  const [travelerAnchorRequirement, setTravelerAnchorRequirement] = useState('');
  const [anchorRequirement, setAnchorRequirement] = useState('');
  const nsfwVisible = nsfwEnabled && nsfwImageEnabled;

  const assetMap = useMemo(() => new Map(album.assets.map((asset) => [asset.id, asset])), [album.assets]);
  const activeEntry = album.entries.find((entry) => entry.id === activeEntryId) ?? album.entries[0] ?? null;
  const companions = npcs.filter((npc) => npc.阶位 === 'companion');
  const resourceEntries = useMemo(
    () => buildAlbumResourceEntries(album, assetMap, nsfwVisible && showNsfw),
    [album, assetMap, nsfwVisible, showNsfw],
  );
  const sceneLibraryEntries = useMemo(() => buildSceneLibraryEntries(album, assetMap), [album, assetMap]);
  const storySnapshotSourceOptions = useMemo(() => buildStorySnapshotSourceOptions(mainChatHistory), [mainChatHistory]);
  const importCurrentBodyText = () => {
    const latestAssistant = [...mainChatHistory]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content.trim());
    const text = trimSnapshotSource(latestAssistant?.content ?? '');
    if (!text) {
      setMessage('暂无可导入正文。');
      return;
    }
    setSceneImageText(text);
    setMessage('已导入当前正文。');
  };
  useEffect(() => {
    if (storySnapshotDraft.trim()) return;
    const initial = storySnapshotSourceOptions.find((option) => option.id === storySnapshotSource)?.text || storySnapshotSourceOptions[0]?.text || '';
    if (initial) setStorySnapshotDraft(initial);
  }, [storySnapshotDraft, storySnapshotSource, storySnapshotSourceOptions]);
  const libraryRecords = useMemo(
    () => buildCharacterLibraryRecords(traveler, npcs, album, assetMap, nsfwVisible && showNsfw),
    [traveler, npcs, album, assetMap, nsfwVisible, showNsfw],
  );
  const filteredLibraryRecords = useMemo(() => {
    const query = libraryNameFilter.trim().toLowerCase();
    return libraryRecords.filter((record) => {
      if (query && !record.name.toLowerCase().includes(query) && !(record.alias ?? '').toLowerCase().includes(query)) return false;
      if (libraryStatusFilter === 'ready' && record.imageCount <= 0) return false;
      if (libraryStatusFilter === 'empty' && record.imageCount > 0) return false;
      return true;
    });
  }, [libraryNameFilter, libraryRecords, libraryStatusFilter]);
  const activeLibraryRecord = filteredLibraryRecords.find((record) => record.id === libraryNpcId) ?? filteredLibraryRecords[0] ?? null;
  const persistGameSettingsChange = (next: 游戏设置) => {
    onGameSettingsChange(next);
    void saveSetting('gameSettings', next);
  };

  const addAlbumItem = (item: ReturnType<typeof 创建相册图片条目>) => {
    onAlbumChange((prev) => 添加图片到相册(prev, item));
    setActiveEntryId(item.entry.id);
    setActiveTab('library');
    setMessage('图片已加入相册。');
  };

  const clearPromptDraft = () => {
    setPrompt('');
    setNegativePrompt('');
    setLastPromptMeta(null);
  };

  const invalidatePromptDraft = (reason: string) => {
    clearPromptDraft();
    setPromptEditorOpen(false);
    setMessage(reason);
  };

  const patchReferenceSettings = (patch: Partial<文生图参考图设置>) => {
    const nextSettings: 游戏设置 = {
      ...gameSettings,
      文生图系统: {
        ...imageSettings,
        参考图: {
          ...imageSettings.参考图,
          ...patch,
        },
      },
    };
    persistGameSettingsChange(nextSettings);
    if (patch.enabled === false) {
      clearPromptDraft();
      setPromptEditorOpen(false);
      setMessage('参考图已关闭，已清空当前生成草稿。');
    }
  };

  const uploadReferenceImages = async (files: FileList | null, record: CharacterLibraryRecord | null) => {
    if (!files?.length || !record) return;
    const nextItems: ReturnType<typeof 创建相册图片条目>[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const src = await fileToDataUrl(file);
      nextItems.push(创建相册图片条目({
        title: `${record.name} 参考图`,
        src,
        source: 'upload',
        targetType: record.kind === 'traveler' ? 'traveler' : 'npc',
        targetId: record.id,
        slot: 'reference_image',
        mimeType: file.type,
        tags: ['参考图'],
        note: '手动上传参考图',
      }));
    }
    if (!nextItems.length) {
      setMessage('没有找到可导入的图片文件。');
      return;
    }
    onAlbumChange((prev) => nextItems.reduce((next, item) => 添加图片到相册(next, item), prev));
    setActiveEntryId(nextItems[0]?.entry.id ?? null);
    setMessage(`已导入 ${nextItems.length} 张参考图。`);
  };

  const patchImageRules = (patch: Partial<文生图规则中心设置>) => {
    onGameSettingsChange((prev) => ({
      ...prev,
      文生图系统: {
        ...prev.文生图系统,
        rules: {
          ...prev.文生图系统.rules,
          ...patch,
        },
      },
    }));
  };

  const persistImageRulesPatch = (patch: Partial<文生图规则中心设置>) => {
    const nextSettings: 游戏设置 = {
      ...gameSettings,
      文生图系统: {
        ...imageSettings,
        rules: {
          ...imageSettings.rules,
          ...patch,
        },
      },
    };
    persistGameSettingsChange(nextSettings);
  };

  const handleSaveRules = async () => {
    const nextSettings: 游戏设置 = {
      ...gameSettings,
      文生图系统: imageSettings,
    };
    try {
      await saveSetting('gameSettings', nextSettings);
      setMessage('规则中心已保存。');
    } catch (err) {
      setMessage(`规则中心保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const resolveStorySnapshotParserConfig = () => buildImagePromptTokenizerConfig(gameSettings, apiSettings);

  const resolveCharacterAnchorExtractConfig = () => {
    const mainApi = apiSettings.configs.find((item) => item.id === apiSettings.activeConfigId) ?? apiSettings.configs[0];
    if (!mainApi) return null;
    const override = imageSettings.词组转化器API;
    return {
      ...mainApi,
      id: '__character_anchor_extract__',
      name: '角色视觉锚点提取',
      provider: override.provider || mainApi.provider,
      baseUrl: override.baseUrl.trim() || mainApi.baseUrl,
      apiKey: override.apiKey.trim() || mainApi.apiKey,
      model: override.model.trim() || mainApi.model,
      maxTokens: override.maxTokens ?? mainApi.maxTokens ?? 1600,
      temperature: override.temperature ?? mainApi.temperature ?? 0.35,
      retryCount: override.retryCount ?? mainApi.retryCount ?? 1,
      enableClaudeMode: gameSettings.enableClaudeMode === true,
      updatedAt: Date.now(),
    };
  };

  const currentTarget = generateTargets.find((item) => item.id === generateTarget) ?? generateTargets[0];
  const resolvedSize = resolveSize(sizePreset, customSize, currentTarget.slot);
  const currentCanvasTargetId = resolveGenerationTargetId(currentTarget, undefined, tokenizerNpcId);
  const currentCanvasTask = useMemo(() => {
    const byLastTask = lastTaskId ? album.tasks.find((item) => item.id === lastTaskId) : undefined;
    const matchesCurrentTarget = (item: 图片生成任务) =>
      item.slot === currentTarget.slot &&
      item.targetType === currentTarget.targetType &&
      (!currentCanvasTargetId || !item.targetId || item.targetId === currentCanvasTargetId);
    if (byLastTask && matchesCurrentTarget(byLastTask)) return byLastTask;
    return album.tasks.find(matchesCurrentTarget);
  }, [album.tasks, currentTarget.slot, currentTarget.targetType, currentCanvasTargetId, lastTaskId]);
  const currentCanvasAsset = currentCanvasTask?.resultAssetId ? assetMap.get(currentCanvasTask.resultAssetId) : undefined;
  const currentCanvasSrc = currentCanvasAsset?.dataUrl || currentCanvasAsset?.url || currentCanvasAsset?.localRef || '';

  const handleGenerate = async (nsfw = false, override?: GenerateOverride) => {
    const target = override?.target ?? currentTarget;
    const targetSize = override?.size ?? (override?.target ? resolveSize(sizePreset, customSize, target.slot) : resolvedSize);
    let promptText = override?.prompt ?? prompt;
    let negativeText = override?.negativePrompt ?? negativePrompt;
    const titleText = override?.title ?? generateTitle;
    const resolvedTargetId = resolveGenerationTargetId(target, override?.targetId, tokenizerNpcId);
    const entryTags = override?.tags ?? defaultAlbumEntryTags(target);
    const entryNote = override?.note ?? defaultAlbumEntryNote(target);
    if (requiresCharacterTarget(target) && !resolvedTargetId) {
      setMessage('请先选择对应伙伴，再生成伙伴图片。');
      return;
    }
    if (!imageSettings.enabled) {
      setMessage('请先在设置里启用文生图。');
      return;
    }
    if (nsfw && !nsfwVisible) {
      setMessage('NSFW 生图未开启。');
      return;
    }
    let taskAnchorMode = override?.anchorMode ?? lastPromptMeta?.anchorMode ?? false;
    let taskAnchorSummary = override?.anchorSummary ?? lastPromptMeta?.anchorSummary ?? '';
    let sourcePrompt = override?.sourcePrompt ?? lastPromptMeta?.sourcePrompt ?? promptText;
    if (!promptText.trim()) {
      const built = await buildPromptForTarget(target);
      if (!built) return;
      promptText = built.prompt;
      negativeText = negativeText || built.negative;
      taskAnchorMode = built.anchorMode;
      taskAnchorSummary = built.anchorSummary;
      sourcePrompt = built.sourcePrompt;
      setPrompt(promptText);
      setNegativePrompt((prev) => prev || built.negative);
      setLastPromptMeta({ anchorMode: built.anchorMode, anchorSummary: built.anchorSummary, sourcePrompt: built.sourcePrompt });
    }
    const api = override?.imageApi ?? (nsfw
      ? imageSettings.NSFW接口
      : imageSettings.普通接口);
    if (!api.enabled) {
      setMessage(override?.disabledMessage || '当前文生图接口未启用。');
      return;
    }
    const referencePayload = resolveReferenceImagesForGeneration({
      target,
      targetId: resolvedTargetId,
      api,
      settings: imageSettings.参考图,
      album,
      assetMap,
    });
    const task = createTask({
      prompt: promptText,
      negativePrompt: negativeText,
      sourcePrompt,
      finalPrompt: promptText,
      finalNegativePrompt: negativeText,
      anchorMode: taskAnchorMode,
      anchorSummary: taskAnchorSummary,
      nsfw,
      backend: api.backend,
      slot: target.slot,
      targetType: target.targetType,
      targetId: resolvedTargetId,
      dimensions: targetSize,
      referenceImageIds: referencePayload.entries.map((entry) => entry.id),
    });
    setLastTaskId(task.id);
    onAlbumChange((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
    setGenerating(true);
    setMessage(override?.statusMessage || (nsfw ? '正在调用 NSFW 独立接口...' : '正在调用文生图接口...'));
    try {
      const result = await runImageGenerationWithRetry(
        () => generateImage(api, {
          prompt: promptText,
          negativePrompt: negativeText,
          nsfw,
          size: targetSize,
          referenceImages: referencePayload.images,
          referenceStrength: imageSettings.参考图.sdWebuiDenoisingStrength,
        }),
        {
          maxRetries: api.retryCount,
          onAttempt: (attempt, total) => {
            onAlbumChange((prev) => ({
              ...prev,
              tasks: prev.tasks.map((old) =>
                old.id === task.id
                  ? { ...old, status: 'running', retryCount: attempt - 1, error: attempt > 1 ? `正在重试：${attempt}/${total}` : undefined }
                  : old,
              ),
            }));
            setMessage(referencePayload.images.length
              ? (total > 1 ? `正在参考图片生成（${attempt}/${total}）...` : '正在参考图片生成...')
              : (total > 1 ? `正在生成图片（${attempt}/${total}）...` : '正在生成图片...'));
          },
          onRetry: (attempt, total, errorMessage) => {
            onAlbumChange((prev) => ({
              ...prev,
              tasks: prev.tasks.map((old) =>
                old.id === task.id
                  ? { ...old, status: 'running', retryCount: attempt, error: `第 ${attempt}/${total} 次失败：${errorMessage}` }
                  : old,
              ),
            }));
            setMessage(`生成失败，正在自动重试（${attempt}/${total}）：${errorMessage}`);
          },
        },
      );
      const item = 创建相册图片条目({
        title: titleText || target.label,
        src: result.src,
        source: 'generated',
        nsfw,
        targetType: target.targetType,
        targetId: resolvedTargetId,
        slot: target.slot,
        prompt: promptText,
        negativePrompt: negativeText,
        sourcePrompt,
        finalPrompt: promptText,
        finalNegativePrompt: negativeText,
        anchorMode: taskAnchorMode,
        anchorSummary: taskAnchorSummary,
        dimensions: targetSize,
        model: result.model,
        backend: result.backend,
        mimeType: result.mimeType,
        originalUrl: result.originalUrl,
        tags: entryTags,
        note: entryNote,
      });
      onAlbumChange((prev) => ({
        ...添加图片到相册(prev, item),
        tasks: prev.tasks.map((old) => old.id === task.id ? { ...old, status: 'success', resultAssetId: item.asset.id, finishedAt: Date.now() } : old),
      }));
      setActiveEntryId(item.entry.id);
      setMessage('图片已生成并加入相册。');
    } catch (err) {
      const error = readImageError(err);
      onAlbumChange((prev) => ({
        ...prev,
        tasks: prev.tasks.map((old) => old.id === task.id ? { ...old, status: 'failed', error, finishedAt: Date.now() } : old),
      }));
      setMessage(`生成失败：${error}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRetryTask = (task?: 图片生成任务) => {
    const target = task ?? album.tasks.find((item) => item.id === lastTaskId) ?? album.tasks.find((item) => item.status === 'failed');
    if (!target) {
      setMessage('没有可重试的失败任务。');
      return;
    }
    setPrompt(target.prompt);
    setNegativePrompt(target.negativePrompt ?? '');
    setGenerateTitle('重试生成');
    setLastPromptMeta({
      anchorMode: target.anchorMode === true,
      anchorSummary: target.anchorSummary || (target.anchorMode ? '沿用上次角色锚点' : '沿用上次档案回退结果'),
      sourcePrompt: target.sourcePrompt,
    });
    void handleGenerate(target.nsfw, {
      prompt: target.prompt,
      negativePrompt: target.negativePrompt,
      title: '重试生成',
      target: generateTargets.find((item) => item.targetType === target.targetType && item.slot === target.slot),
      targetId: target.targetId,
      anchorMode: target.anchorMode,
      anchorSummary: target.anchorSummary,
      sourcePrompt: target.sourcePrompt,
    });
  };

  const mountSelectedToCharacter = (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => {
    const entry = album.entries.find((item) => item.id === params.entryId);
    const isBuiltinEntry = params.entryId.startsWith('builtin-avatar:');
    if (!entry && !isBuiltinEntry) return;
    const sourceLabel = isBuiltinEntry ? '原著' : '文生图';
    if (params.targetKind === 'traveler') {
      if (params.slot === 'portrait') {
        onTravelerChange((prev) => 挂载旅人图片(prev, { slot: '立绘', src: params.src }));
      } else if (params.slot.toString().startsWith('nsfw_')) {
        setMessage('旅人档案暂不支持挂载 NSFW 部位图。');
        return;
      } else {
        onTravelerChange((prev) => 挂载旅人图片(prev, { slot: mapImageSlotToTravelerSlot(params.slot), src: params.src }));
      }
      if (entry) {
        onAlbumChange((prev) => ({
          ...prev,
          entries: prev.entries.map((item) =>
            item.id === params.entryId
              ? {
                  ...item,
                  targetType: 'traveler',
                  targetId: params.targetId,
                  slot: params.slot,
                }
              : item,
          ),
        }));
      }
      setMessage(`已挂载到 ${slotLabel(params.slot)}。`);
      return;
    }
    if (params.slot === 'portrait') {
      onNpcChange((prev) => 挂载NPC立绘图片(prev, { npcId: params.targetId, src: params.src, source: sourceLabel }));
    } else if (params.slot === 'nsfw_female_chest') {
      onNpcChange((prev) => 挂载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '女性胸部', src: params.src }));
    } else if (params.slot === 'nsfw_female_genital') {
      onNpcChange((prev) => 挂载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '女性私处', src: params.src }));
    } else if (params.slot === 'nsfw_male_genital') {
      if (!gameSettings.enableMaleNsfwArchive) {
        setMessage('男性 NSFW 档案未开启，不能挂载男性器部位图。');
        return;
      }
      onNpcChange((prev) => 挂载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '男性器', src: params.src }));
    } else if (params.slot === 'nsfw_rear') {
      onNpcChange((prev) => 挂载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '后庭', src: params.src }));
    } else if (params.slot === 'nsfw_body_reference') {
      onNpcChange((prev) => 挂载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '体态参考', src: params.src }));
    } else {
      onNpcChange((prev) => 挂载NPC头像图片(prev, { npcId: params.targetId, slot: mapImageSlotToNpcAvatarSlot(params.slot), src: params.src, source: sourceLabel }));
    }
    if (entry) {
      onAlbumChange((prev) => ({
        ...prev,
        entries: prev.entries.map((item) =>
          item.id === params.entryId
            ? {
                ...item,
                targetType: params.slot.toString().startsWith('nsfw_') ? 'nsfw_part' : 'npc',
                targetId: params.targetId,
                slot: params.slot,
                nsfw: item.nsfw || params.slot.toString().startsWith('nsfw_'),
              }
            : item,
        ),
      }));
    }
    setMessage(`已挂载到 ${slotLabel(params.slot)}。`);
  };

  const deleteLibraryEntries = (entryIds: string[]) => {
    const ids = Array.from(new Set(entryIds)).filter(Boolean);
    if (!ids.length) {
      setMessage('请先选择要删除的图片。');
      return;
    }
    const idSet = new Set(ids);
    onAlbumChange((prev) => cleanupAlbumAssets({
      ...prev,
      entries: prev.entries.filter((entry) => !idSet.has(entry.id)),
    }));
    setActiveEntryId((current) => (current && idSet.has(current) ? null : current));
    setMessage(`已删除 ${ids.length} 张图片。`);
  };

  const setLibraryEntryToSlot = (params: { record: CharacterLibraryRecord | null; entryId: string; slot: 图片槽位 }) => {
    const record = params.record;
    if (!record) {
      setMessage('请先选择一个角色。');
      return;
    }
    const scopedEntries = [...record.entries, ...resourceEntries];
    const item = scopedEntries.find((entry) => entry.entry.id === params.entryId);
    if (!item?.src) {
      setMessage('请选择一张可用图片。');
      return;
    }
    mountSelectedToCharacter({
      targetKind: record.kind,
      targetId: record.id,
      entryId: item.entry.id,
      src: item.src,
      slot: params.slot,
    });
  };

  const unmountCharacterSlot = (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; slot: MountedImageSlot }) => {
    if (params.targetKind === 'traveler') {
      onTravelerChange((prev) => 卸载旅人图片(prev, { slot: mapMountedSlotToTravelerSlot(params.slot.key) }));
      setMessage(`已卸下${params.slot.label}。`);
      return;
    }
    if (params.slot.key === 'portrait') {
      onNpcChange((prev) => 卸载NPC立绘图片(prev, { npcId: params.targetId }));
    } else if (params.slot.key === 'nsfw-female-chest') {
      onNpcChange((prev) => 卸载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '女性胸部' }));
    } else if (params.slot.key === 'nsfw-female-genital') {
      onNpcChange((prev) => 卸载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '女性私处' }));
    } else if (params.slot.key === 'nsfw-male-genital') {
      onNpcChange((prev) => 卸载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '男性器' }));
    } else if (params.slot.key === 'nsfw-rear') {
      onNpcChange((prev) => 卸载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '后庭' }));
    } else if (params.slot.key === 'nsfw-body-reference') {
      onNpcChange((prev) => 卸载NPC_NSFW部位图片(prev, { npcId: params.targetId, slot: '体态参考' }));
    } else {
      onNpcChange((prev) => 卸载NPC头像图片(prev, { npcId: params.targetId, slot: mapMountedSlotToNpcAvatarSlot(params.slot.key) }));
    }
    setMessage(`已卸下${params.slot.label}。`);
  };

  const saveNpcAnchor = (npcId: string, patch: NonNullable<NPC记录['图像档案']>['角色锚点']) => {
    onNpcChange((prev) => prev.map((npc) => {
      if (npc.id !== npcId) return npc;
      return {
        ...npc,
        图像档案: {
          ...(npc.图像档案 ?? {}),
          角色锚点: {
            ...(npc.图像档案?.角色锚点 ?? {}),
            ...(patch ?? {}),
            id: patch?.id || npc.图像档案?.角色锚点?.id || `anchor_${npcId}_${Date.now()}`,
            名称: patch?.名称 || npc.图像档案?.角色锚点?.名称 || npc.姓名,
            来源: patch?.来源 || npc.图像档案?.角色锚点?.来源 || 'manual',
            createdAt: npc.图像档案?.角色锚点?.createdAt || Date.now(),
            updatedAt: Date.now(),
          },
        },
      };
    }));
    invalidatePromptDraft('角色锚点已保存，当前生成草稿已清空，请重新生成。');
  };

  const deleteNpcAnchor = (npcId: string) => {
    onNpcChange((prev) => prev.map((npc) => {
      if (npc.id !== npcId) return npc;
      return {
        ...npc,
        图像档案: {
          ...(npc.图像档案 ?? {}),
          角色锚点: undefined,
        },
      };
    }));
    invalidatePromptDraft('角色锚点已删除，当前生成草稿已清空，请重新生成。');
  };

  const extractNpcAnchor = async (npcId: string, requirement: string) => {
    const npc = npcs.find((item) => item.id === npcId);
    if (!npc) return;
    const config = resolveCharacterAnchorExtractConfig();
    if (!config) {
      setMessage('角色锚点提取模型未配置：请先在 API 设置里启用一个可用模型。');
      return;
    }
    setAnchorExtractingTarget(npcId);
    setMessage(`正在 AI 提取 ${npc.姓名} 的角色锚点...`);
    try {
      const anchor = await extractCharacterAnchorWithAI(config, {
        name: npc.姓名,
        kind: 'npc',
        sourceText: [npc.外貌, npc.穿着, npc.装备摘要, npc.图像档案?.头像提示词, npc.图像档案?.立绘提示词].filter(Boolean).join('\n'),
        requirement,
      });
      saveNpcAnchor(npcId, anchor);
      invalidatePromptDraft(`已 AI 提取并保存 ${npc.姓名} 的角色锚点，当前生成草稿已清空，请重新生成。`);
    } catch (err) {
      setMessage(`角色锚点 AI 提取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnchorExtractingTarget((current) => (current === npcId ? null : current));
    }
  };

  const saveTravelerAnchor = (patch: NPC角色锚点档案 | undefined) => {
    onTravelerChange((prev) => ({
      ...prev,
      图像档案: {
        ...(prev.图像档案 ?? {}),
        角色锚点: {
          ...(prev.图像档案?.角色锚点 ?? {}),
          ...(patch ?? {}),
          id: patch?.id || prev.图像档案?.角色锚点?.id || `anchor_traveler_${Date.now()}`,
          名称: patch?.名称 || prev.图像档案?.角色锚点?.名称 || prev.姓名 || '旅人',
          来源: patch?.来源 || prev.图像档案?.角色锚点?.来源 || 'manual',
          createdAt: prev.图像档案?.角色锚点?.createdAt || Date.now(),
          updatedAt: Date.now(),
        },
      },
    }));
    invalidatePromptDraft('主控锚点已保存，当前生成草稿已清空，请重新生成。');
  };

  const deleteTravelerAnchor = () => {
    onTravelerChange((prev) => ({
      ...prev,
      图像档案: {
        ...(prev.图像档案 ?? {}),
        角色锚点: undefined,
      },
    }));
    invalidatePromptDraft('主控锚点已删除，当前生成草稿已清空，请重新生成。');
  };

  const extractTravelerAnchor = async (requirement: string) => {
    const config = resolveCharacterAnchorExtractConfig();
    if (!config) {
      setMessage('主控锚点提取模型未配置：请先在 API 设置里启用一个可用模型。');
      return;
    }
    setAnchorExtractingTarget('traveler');
    setMessage('正在 AI 提取主控锚点...');
    try {
      const anchor = await extractCharacterAnchorWithAI(config, {
        name: traveler.姓名 || '旅人',
        kind: 'traveler',
        sourceText: [traveler.性别, traveler.年龄 ? `${traveler.年龄}` : '', traveler.身高, traveler.身份, traveler.外貌, traveler.主命途, ...(traveler.能力 ?? [])].filter(Boolean).join('\n'),
        requirement,
      });
      saveTravelerAnchor(anchor);
      invalidatePromptDraft('已 AI 提取并保存主控锚点，当前生成草稿已清空，请重新生成。');
    } catch (err) {
      setMessage(`主控锚点 AI 提取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnchorExtractingTarget((current) => (current === 'traveler' ? null : current));
    }
  };

  const handleGenerateStorySnapshot = (nsfw = false, override?: GenerateOverride) => {
    const sceneTarget = generateTargets.find((item) => item.id === 'scene') ?? currentTarget;
    void handleGenerate(nsfw, {
      ...override,
      target: sceneTarget,
      size: resolveSize(sizePreset, customSize, sceneTarget.slot),
      tags: ['故事快照'],
      note: '故事快照',
      statusMessage: '正在调用主文生图接口...',
      disabledMessage: '请先在文生图设置中启用统一接口。',
    });
  };

  const handleRetryStorySnapshotTask = (task?: 图片生成任务) => {
    const target = task ?? currentCanvasTask;
    if (!target) {
      setMessage('没有可重试的故事快照任务。');
      return;
    }
    setPrompt(target.prompt);
    setNegativePrompt(target.negativePrompt ?? '');
    setGenerateTitle('重试生成');
    setLastPromptMeta({
      anchorMode: target.anchorMode === true,
      anchorSummary: target.anchorSummary || (target.anchorMode ? '沿用上次角色锚点' : '沿用上次档案回退结果'),
      sourcePrompt: target.sourcePrompt,
    });
    handleGenerateStorySnapshot(target.nsfw, {
      prompt: target.prompt,
      negativePrompt: target.negativePrompt,
      title: '重试生成',
      anchorMode: target.anchorMode,
      anchorSummary: target.anchorSummary,
      sourcePrompt: target.sourcePrompt,
      size: target.dimensions || resolveSize(sizePreset, customSize, 'scene'),
    });
  };

  const applyTokenizerIfAvailable = async (input: {
    title: string;
    mode: string;
    sourceText: string;
    prompt: string;
    negative: string;
    anchorMode: boolean;
    anchorSummary: string;
  }) => {
    const tokenizerConfig = buildImagePromptTokenizerConfig(gameSettings, apiSettings);
    if (!tokenizerConfig) return input;
    setTokenizing(true);
    try {
      const refined = await tokenizeImagePrompt(
        tokenizerConfig,
        buildImagePromptTokenizerSystemPrompt(gameSettings, input.mode),
        {
          title: input.title,
          mode: input.mode,
          sourceText: input.sourceText,
          basePrompt: input.prompt,
          baseNegative: input.negative,
          extraRequirement,
          anchorMode: input.anchorMode,
          anchorSummary: input.anchorSummary,
        },
        tokenizerConfig.retryCount ?? 2,
      );
      setMessage('已通过词组转化器整理最终提示词。');
      return { ...input, prompt: refined.prompt, negative: refined.negative };
    } catch (err) {
      setMessage(`词组转化器失败，已保留本地基础提示词：${err instanceof Error ? err.message : String(err)}`);
      return input;
    } finally {
      setTokenizing(false);
    }
  };

  const buildPromptForTarget = async (target: typeof currentTarget, override?: { sceneText?: string }) => {
    if (target.tokenizerMode === 'scene') {
      const sourceSceneText = override?.sceneText ?? sceneText;
      const presentNpcs = buildPresentSceneNpcs(npcs, sourceSceneText);
      const anchorInfo = getSceneAnchorStatus(traveler, presentNpcs);
      const built = buildSceneImagePrompt({
        text: sourceSceneText,
        mode: target.id === 'phone_wallpaper' ? 'phone_wallpaper' : 'scene',
        rules: imageSettings.rules,
        traveler,
        presentNpcs,
        extraRequirement,
        size: resolvedSize,
        slot: target.slot,
      });
      const refined = await applyTokenizerIfAvailable({
        title: target.label,
        mode: target.id,
        sourceText: buildSceneSourceText(sourceSceneText || target.desc, traveler, presentNpcs),
        prompt: built.prompt,
        negative: built.negative,
        anchorMode: anchorInfo.anchorMode,
        anchorSummary: anchorInfo.anchorSummary,
      });
      return { prompt: refined.prompt, negative: refined.negative, anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: built.prompt };
    }
    if (target.targetType === 'traveler') {
      const anchorInfo = getTravelerAnchorStatus(traveler);
      const built = buildTravelerImagePrompt({
        traveler,
        mode: target.tokenizerMode === 'portrait' ? 'portrait' : 'avatar',
        rules: imageSettings.rules,
        extraRequirement,
        size: resolvedSize,
      });
      const refined = await applyTokenizerIfAvailable({
        title: target.label,
        mode: target.id,
        sourceText: buildTravelerSourceText(traveler),
        prompt: built.prompt,
        negative: built.negative,
        anchorMode: anchorInfo.anchorMode,
        anchorSummary: anchorInfo.anchorSummary,
      });
      return { prompt: refined.prompt, negative: refined.negative, anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: built.prompt };
    }
    const npc = npcs.find((item) => item.id === tokenizerNpcId);
    if (!npc) {
      setMessage('请先选择一个伙伴。');
      return null;
    }
    const anchorInfo = getNpcAnchorStatus(npc);
    const built = buildNpcImagePrompt({
      npc,
      mode: target.nsfw ? 'nsfw' : target.tokenizerMode === 'portrait' ? 'portrait' : 'avatar',
      rules: imageSettings.rules,
      extraRequirement,
      size: resolvedSize,
    });
    const refined = await applyTokenizerIfAvailable({
      title: target.label,
      mode: target.id,
      sourceText: buildNpcSourceText(npc),
      prompt: built.prompt,
      negative: built.negative,
      anchorMode: anchorInfo.anchorMode,
      anchorSummary: anchorInfo.anchorSummary,
    });
    return { prompt: refined.prompt, negative: refined.negative, anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: built.prompt };
  };

  const handleBuildPrompt = async () => {
    const target = currentTarget;
    const built = await buildPromptForTarget(target);
    if (!built) return;
    setPrompt(built.prompt);
    setNegativePrompt((prev) => prev || built.negative);
    setLastPromptMeta({ anchorMode: built.anchorMode, anchorSummary: built.anchorSummary, sourcePrompt: built.sourcePrompt });
    if (target.tokenizerMode === 'scene') {
      setGenerateTitle(sceneText.trim().slice(0, 16) || target.label);
    } else if (target.targetType === 'traveler') {
      setGenerateTitle(`${traveler.姓名 || '旅人'}${target.label}`);
    } else {
      const npc = npcs.find((item) => item.id === tokenizerNpcId);
      setGenerateTitle(`${npc?.姓名 || ''}${target.label}`);
    }
    setPromptEditorOpen(true);
    setMessage(`${built.anchorMode ? '已按角色锚点模式生成提示词。' : '已按档案回退模式生成提示词。'}可在高级编辑里微调。`);
  };

  const handleBuildSceneImagePrompt = async () => {
    const sourceText = sceneImageText.trim();
    if (!sourceText) {
      setMessage('请先填写场景说明。');
      return;
    }
    const target = generateTargets.find((item) => item.id === 'scene') ?? currentTarget;
    setSceneImageAnalyzing(true);
    setSceneImageSummary(null);
    setMessage('正在解析场景画面...');
    try {
      const parserConfig = resolveStorySnapshotParserConfig();
      const presentNpcs = buildPresentSceneNpcs(npcs, sourceText);
      const anchorInfo = getSceneAnchorStatus(traveler, presentNpcs);
      let parsed: Awaited<ReturnType<typeof parseSceneImagePrompt>> | null = null;
      let usedLocalFallback = false;
      if (parserConfig) {
        try {
          parsed = await parseSceneImagePrompt(parserConfig, {
            body: sourceText,
            traveler: {
              name: traveler.姓名 || traveler.别名 || '玩家角色',
              gender: traveler.性别 || undefined,
              appearance: traveler.外貌 || undefined,
              identity: traveler.身份 || undefined,
              anchorPrompt: traveler.图像档案?.角色锚点 ? JSON.stringify(traveler.图像档案.角色锚点) : undefined,
            },
            playerAppearanceMode: 'auto',
            presentNpcs: presentNpcs.map((npc) => ({
              name: npc.姓名,
              appearance: npc.外貌,
              clothing: npc.穿着,
            })),
          });
        } catch (error) {
          usedLocalFallback = true;
          const reason = error instanceof Error ? error.message : String(error);
          setMessage(`场景图模型解析失败，已改用本地草稿兜底：${reason}`);
        }
      } else {
        usedLocalFallback = true;
      }

      if (parsed) {
        const lockedPrompt = 应用场景角色锚点锁({
          prompt: parsed.prompt,
          negative: parsed.negativePrompt,
          traveler,
          presentNpcs,
        });
        const enhanced = 应用质量增强提示词(imageSettings.rules, lockedPrompt.prompt, lockedPrompt.negative);
        const summary: SceneImageSummary = {
          title: parsed.title,
          location: parsed.location,
          atmosphere: parsed.atmosphere,
          subject: parsed.subject,
          camera: parsed.camera,
          avoid: parsed.avoid,
        };
        setSceneImageSummary(summary);
        setGenerateTitle(summary.title);
        setPrompt(enhanced.prompt);
        setNegativePrompt(enhanced.negative);
        setLastPromptMeta({ anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: parsed.prompt });
        setPromptEditorOpen(false);
        setMessage('已完成场景图解析和提示词整理，可直接普通生成。');
        return;
      }

      const built = await buildPromptForTarget(target, { sceneText: sourceText });
      if (!built) return;
      setPrompt(built.prompt);
      setNegativePrompt(built.negative);
      setLastPromptMeta({ anchorMode: built.anchorMode, anchorSummary: built.anchorSummary, sourcePrompt: built.sourcePrompt });
      setGenerateTitle(sourceText.slice(0, 16) || target.label);
      setPromptEditorOpen(true);
      setMessage(usedLocalFallback ? '已用本地兜底草稿整理场景图，可在高级编辑里微调。' : '已完成场景图提示词整理。');
    } finally {
      setSceneImageAnalyzing(false);
    }
  };

  const handleBuildStorySnapshotPrompt = async () => {
    const sourceText = storySnapshotDraft.trim();
    if (!sourceText) {
      setMessage('请先选择或填写正文片段。');
      return;
    }
    setStorySnapshotAnalyzing(true);
    setStorySnapshotSummary(null);
    setMessage('正在解析正文画面...');
    try {
      const target = generateTargets.find((item) => item.id === 'scene') ?? currentTarget;
      const parserConfig = resolveStorySnapshotParserConfig();
      const presentNpcs = buildPresentSceneNpcs(npcs, sourceText);
      const anchorInfo = getSceneAnchorStatus(traveler, presentNpcs);
      let parsed: Awaited<ReturnType<typeof parseStorySnapshotPrompt>> | null = null;
      let usedLocalFallback = false;
      if (parserConfig) {
        try {
          parsed = await parseStorySnapshotPrompt(parserConfig, {
            body: sourceText,
            traveler: {
              name: traveler.姓名 || traveler.别名 || '玩家角色',
              gender: traveler.性别 || undefined,
              appearance: traveler.外貌 || undefined,
              identity: traveler.身份 || undefined,
              anchorPrompt: traveler.图像档案?.角色锚点 ? JSON.stringify(traveler.图像档案.角色锚点) : undefined,
            },
            playerAppearanceMode: 'auto',
            presentNpcs: presentNpcs.map((npc) => ({
              name: npc.姓名,
              appearance: npc.外貌,
              clothing: npc.穿着,
            })),
          });
        } catch (error) {
          usedLocalFallback = true;
          const reason = error instanceof Error ? error.message : String(error);
          setMessage(`故事快照模型解析失败，已改用本地草稿兜底：${reason}`);
        }
      } else {
        usedLocalFallback = true;
      }
      const summary = parsed
        ? {
            title: parsed.title,
            characters: parsed.characters,
            location: parsed.location,
            atmosphere: parsed.atmosphere,
            action: parsed.action,
            camera: parsed.camera,
            avoid: parsed.avoid,
          }
        : extractStorySnapshot(sourceText, traveler, npcs);
      const nextSceneText = parsed
        ? [
            `画面标题：${summary.title}`,
            `出场人物：${summary.characters.length ? summary.characters.join('、') : '按正文片段决定'}`,
            `地点：${summary.location}`,
            `氛围：${summary.atmosphere}`,
            `关键动作：${summary.action}`,
            `镜头构图：${summary.camera}`,
            `不要出现：${summary.avoid}`,
          ].join('\n')
        : formatStorySnapshotSceneText(summary);
      setSceneText('');
      setGenerateTitle(summary.title);

      let promptRefined: { prompt: string; negative: string };
      if (parsed) {
        const lockedPrompt = 应用场景角色锚点锁({
          prompt: parsed.prompt,
          negative: parsed.negativePrompt,
          traveler,
          presentNpcs,
        });
        promptRefined = 应用质量增强提示词(imageSettings.rules, lockedPrompt.prompt, lockedPrompt.negative);
      } else {
        const built = buildSceneImagePrompt({
          text: nextSceneText,
          mode: 'scene',
          rules: imageSettings.rules,
          traveler,
          presentNpcs,
          extraRequirement,
          size: resolvedSize,
          slot: target.slot,
        });
        promptRefined = await applyTokenizerIfAvailable({
            title: target.label,
            mode: target.id,
            sourceText: buildSceneSourceText(nextSceneText, traveler, presentNpcs),
            prompt: built.prompt,
            negative: built.negative,
            anchorMode: anchorInfo.anchorMode,
            anchorSummary: anchorInfo.anchorSummary,
          });
      }
      setStorySnapshotSummary(summary);
      setSceneText(nextSceneText);
      setPrompt(promptRefined.prompt);
      setNegativePrompt(promptRefined.negative);
      setLastPromptMeta({ anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: promptRefined.prompt });
      setPromptEditorOpen(false);
      setMessage(usedLocalFallback ? '已用本地兜底草稿整理故事快照，可直接普通生成。' : '已完成故事快照解析和提示词整理，可直接普通生成。');
    } finally {
      setStorySnapshotAnalyzing(false);
    }
  };

  const handleTargetChange = (next: GenerateTarget) => {
    const target = generateTargets.find((item) => item.id === next) ?? generateTargets[0];
    setGenerateTarget(next);
    setTokenizerMode(target.tokenizerMode);
    if (next === 'traveler_avatar' || next === 'npc_avatar') setSizePreset('1:1');
    if (next === 'traveler_portrait' || next === 'npc_portrait') setSizePreset((prev) => (prev === '1:1' ? '3:4' : prev));
    setGenerateTitle('');
    clearPromptDraft();
  };

  return (
    <div className="min-h-0 pb-3" style={albumThemeStyle}>
      <div className="grid min-h-0 gap-4 xl:h-[calc(100vh-220px)] xl:min-h-[560px] xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <WorkspaceTabs
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              if (tab === 'scene') handleTargetChange('scene');
              if (tab === 'sceneImage') handleTargetChange('scene');
              if (tab === 'phone') handleTargetChange('phone_wallpaper');
              if (tab === 'manual' && (generateTarget === 'scene' || generateTarget === 'phone_wallpaper')) handleTargetChange('traveler_avatar');
            }}
          />
          <NsfwVisibilityToggle nsfwVisible={nsfwVisible} showNsfw={showNsfw} setShowNsfw={setShowNsfw} />
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto pr-1">
          <main className="min-w-0">
            {activeTab === 'library' && (
              <CharacterLibraryWorkspace
                records={filteredLibraryRecords}
                activeRecord={activeLibraryRecord}
                activeEntryId={activeEntryId ?? undefined}
                resourceEntries={resourceEntries}
                nameFilter={libraryNameFilter}
                setNameFilter={setLibraryNameFilter}
                statusFilter={libraryStatusFilter}
                setStatusFilter={setLibraryStatusFilter}
                onSelectNpc={(id) => {
                  setLibraryNpcId(id);
                  setActiveEntryId(null);
                }}
                onSelectEntry={setActiveEntryId}
                onCreate={() => setActiveTab('manual')}
                onMount={mountSelectedToCharacter}
                onUnmount={unmountCharacterSlot}
                onDeleteEntries={deleteLibraryEntries}
                onSetSlot={setLibraryEntryToSlot}
                maleNsfwEnabled={gameSettings.enableMaleNsfwArchive}
              />
            )}
            {activeTab === 'sceneLibrary' && (
              <SceneLibraryWorkspace
                entries={sceneLibraryEntries}
                activeEntryId={activeEntryId ?? undefined}
                filter={sceneLibraryFilter}
                setFilter={setSceneLibraryFilter}
                onSelectEntry={setActiveEntryId}
                onDeleteEntries={deleteLibraryEntries}
              />
            )}
            {activeTab === 'anchor' && (
              <CharacterAnchorWorkspace
                traveler={traveler}
                travelerRequirement={travelerAnchorRequirement}
                setTravelerRequirement={setTravelerAnchorRequirement}
                onSaveTravelerAnchor={saveTravelerAnchor}
                onDeleteTravelerAnchor={deleteTravelerAnchor}
                onExtractTravelerAnchor={extractTravelerAnchor}
                records={filteredLibraryRecords.filter(isNpcLibraryRecord)}
                activeRecord={isNpcLibraryRecord(activeLibraryRecord) ? activeLibraryRecord : null}
                activeSelection={anchorSelection}
                anchorExtractingTarget={anchorExtractingTarget}
                setAnchorExtractingTarget={setAnchorExtractingTarget}
                anchorBatchExtracting={anchorBatchExtracting}
                setAnchorBatchExtracting={setAnchorBatchExtracting}
                onSelectAnchor={(selection) => {
                  setAnchorSelection(selection);
                  if (selection !== 'traveler') setLibraryNpcId(selection);
                }}
                requirement={anchorRequirement}
                setRequirement={setAnchorRequirement}
                onSaveAnchor={saveNpcAnchor}
                onDeleteAnchor={deleteNpcAnchor}
                onExtractAnchor={extractNpcAnchor}
              />
            )}
            {activeTab === 'reference' && (
              <ReferenceImageWorkspace
                records={libraryRecords}
                activeRecord={activeLibraryRecord}
                entries={buildReferenceLibraryEntries(activeLibraryRecord, album, assetMap)}
                activeEntryId={activeEntryId ?? undefined}
                settings={imageSettings.参考图}
                imageBackend={imageSettings.普通接口.backend}
                onSettingsChange={patchReferenceSettings}
                onSelectRecord={(id) => {
                  setLibraryNpcId(id);
                  setActiveEntryId(null);
                }}
                onSelectEntry={setActiveEntryId}
                onUpload={(files) => void uploadReferenceImages(files, activeLibraryRecord)}
                onDeleteEntries={deleteLibraryEntries}
              />
            )}
            {activeTab === 'manual' && (
              <CreateWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={currentTarget}
                generateTarget={generateTarget}
                setGenerateTarget={handleTargetChange}
                sizePreset={sizePreset}
                setSizePreset={setSizePreset}
                customSize={customSize}
                setCustomSize={setCustomSize}
                resolvedSize={resolvedSize}
                extraRequirement={extraRequirement}
                setExtraRequirement={setExtraRequirement}
                prompt={prompt}
                setPrompt={setPrompt}
                negativePrompt={negativePrompt}
                setNegativePrompt={setNegativePrompt}
                generateTitle={generateTitle}
                setGenerateTitle={setGenerateTitle}
                onGenerate={handleGenerate}
                generating={generating}
                nsfwVisible={nsfwVisible}
                companions={companions}
                tokenizerNpcId={tokenizerNpcId}
                setTokenizerNpcId={setTokenizerNpcId}
                tokenizerMode={tokenizerMode}
                setTokenizerMode={setTokenizerMode}
                sceneText={sceneText}
                setSceneText={setSceneText}
                imageRules={imageSettings.rules}
                onImageRulesChange={persistImageRulesPatch}
                onBuildPrompt={handleBuildPrompt}
                tokenizing={tokenizing}
                promptEditorOpen={promptEditorOpen}
                setPromptEditorOpen={setPromptEditorOpen}
                promptMeta={lastPromptMeta}
                canvasTask={currentCanvasTask}
                canvasSrc={currentCanvasSrc}
                onRetryTask={handleRetryTask}
              />
            )}
            {activeTab === 'scene' && (
              <StorySnapshotWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={generateTargets.find((item) => item.id === 'scene') ?? currentTarget}
                sizePreset={sizePreset}
                setSizePreset={setSizePreset}
                customSize={customSize}
                setCustomSize={setCustomSize}
                resolvedSize={resolveSize(sizePreset, customSize, 'scene')}
                extraRequirement={extraRequirement}
                setExtraRequirement={setExtraRequirement}
                prompt={prompt}
                setPrompt={setPrompt}
                negativePrompt={negativePrompt}
                setNegativePrompt={setNegativePrompt}
                generateTitle={generateTitle}
                setGenerateTitle={setGenerateTitle}
                onGenerate={handleGenerateStorySnapshot}
                generating={generating}
                sceneText={sceneText}
                setSceneText={setSceneText}
                sourceMode={storySnapshotSource}
                setSourceMode={setStorySnapshotSource}
                sourceText={storySnapshotDraft}
                setSourceText={setStorySnapshotDraft}
                sourceOptions={storySnapshotSourceOptions}
                summary={storySnapshotSummary}
                analyzing={storySnapshotAnalyzing}
                onBuildSnapshotPrompt={handleBuildStorySnapshotPrompt}
                onBuildPrompt={handleBuildStorySnapshotPrompt}
                tokenizing={tokenizing}
                promptEditorOpen={promptEditorOpen}
                setPromptEditorOpen={setPromptEditorOpen}
                promptMeta={lastPromptMeta}
                canvasTask={currentCanvasTask}
                canvasSrc={currentCanvasSrc}
                onRetryTask={handleRetryStorySnapshotTask}
              />
            )}
            {activeTab === 'sceneImage' && (
              <SceneImageWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={generateTargets.find((item) => item.id === 'scene') ?? currentTarget}
                sizePreset={sizePreset}
                setSizePreset={setSizePreset}
                customSize={customSize}
                setCustomSize={setCustomSize}
                resolvedSize={resolveSize(sizePreset, customSize, 'scene')}
                extraRequirement={extraRequirement}
                setExtraRequirement={setExtraRequirement}
                prompt={prompt}
                setPrompt={setPrompt}
                negativePrompt={negativePrompt}
                setNegativePrompt={setNegativePrompt}
                generateTitle={generateTitle}
                setGenerateTitle={setGenerateTitle}
                onGenerate={handleGenerate}
                generating={generating}
                sceneText={sceneImageText}
                setSceneText={setSceneImageText}
                onBuildPrompt={handleBuildSceneImagePrompt}
                tokenizing={tokenizing}
                promptEditorOpen={promptEditorOpen}
                setPromptEditorOpen={setPromptEditorOpen}
                promptMeta={lastPromptMeta}
                canvasTask={currentCanvasTask}
                canvasSrc={currentCanvasSrc}
                onRetryTask={handleRetryTask}
                sceneSummary={sceneImageSummary}
                analyzing={sceneImageAnalyzing}
                onImportCurrentBody={importCurrentBodyText}
              />
            )}
            {activeTab === 'phone' && (
              <PhoneBackgroundWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={generateTargets.find((item) => item.id === 'phone_wallpaper') ?? currentTarget}
                sizePreset={sizePreset}
                setSizePreset={setSizePreset}
                customSize={customSize}
                setCustomSize={setCustomSize}
                resolvedSize={resolveSize(sizePreset, customSize, 'phone_wallpaper')}
                extraRequirement={extraRequirement}
                setExtraRequirement={setExtraRequirement}
                prompt={prompt}
                setPrompt={setPrompt}
                negativePrompt={negativePrompt}
                setNegativePrompt={setNegativePrompt}
                generateTitle={generateTitle}
                setGenerateTitle={setGenerateTitle}
                onGenerate={handleGenerate}
                generating={generating}
                sceneText={sceneText}
                setSceneText={setSceneText}
                onBuildPrompt={handleBuildPrompt}
                tokenizing={tokenizing}
                promptEditorOpen={promptEditorOpen}
                setPromptEditorOpen={setPromptEditorOpen}
                promptMeta={lastPromptMeta}
                canvasTask={currentCanvasTask}
                canvasSrc={currentCanvasSrc}
                onRetryTask={handleRetryTask}
              />
            )}
            {activeTab === 'rules' && (
              <RulesWorkspace
                rules={imageSettings.rules}
                onChange={patchImageRules}
                onSave={handleSaveRules}
              />
            )}
            {activeTab === 'queue' && <QueueWorkspace tasks={album.tasks} onRetry={handleRetryTask} />}
            {activeTab === 'history' && <HistoryWorkspace album={album} assetMap={assetMap} onSelect={setActiveEntryId} />}
            {activeTab === 'manage' && (
              <ManageWorkspace
                traveler={traveler}
                npcs={npcs}
                onExport={() => void exportAlbum(album)}
                onImport={(file, target) => {
                  void importAlbum(file, target).then((next) => {
                    if (!next) return;
                    onAlbumChange(next);
                    setMessage('相册已导入。');
                  }).catch((err) => setMessage(`导入失败：${err instanceof Error ? err.message : String(err)}`));
                }}
              />
            )}
            {activeTab === 'settings' && (
              <ImageGenerationSettingsTab
                settings={gameSettings}
                onChange={persistGameSettingsChange}
                apiSettings={apiSettings}
              />
            )}
          </main>
          {message && (
            <div className="mt-4 px-3 py-2 text-xs leading-relaxed" style={{ color: message.includes('失败') ? 'rgba(255,180,180,0.9)' : 'rgba(165,230,170,0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
              {message}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkspaceTabs({ activeTab, setActiveTab }: { activeTab: WorkTab; setActiveTab: (tab: WorkTab) => void }) {
  const createTabs = tabs.filter((tab) => tab.group === 'create');
  const manageTabs = tabs.filter((tab) => tab.group === 'manage');
  const renderTab = (tab: typeof tabs[number], index: number) => {
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveTab(tab.id)}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all"
        style={{
          color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.86)',
          background: active ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.13), rgba(var(--tj-tech-cyan),0.045))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
          boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.46)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)',
          clipPath: smallClip,
        }}
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center font-mono text-[10px]" style={{ color: active ? 'rgba(var(--tj-tech-cyan),0.95)' : 'rgba(var(--tj-accent-primary),0.55)', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-sm font-bold tracking-[0.16em]">{tab.label}</span>
          <span className="mt-0.5 block truncate text-[11px]" style={{ color: active ? 'rgba(var(--tj-ui-body),0.68)' : 'rgba(var(--tj-ui-faint),0.68)' }}>{tab.desc}</span>
        </span>
      </button>
    );
  };
  return (
    <Panel title="工作台">
      <div className="space-y-4">
        <div>
          <div className="mb-2 font-serif text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>创作</div>
          <div className="space-y-2">{createTabs.map(renderTab)}</div>
        </div>
        <div>
          <div className="mb-2 font-serif text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>管理</div>
          <div className="space-y-2">{manageTabs.map((tab, index) => renderTab(tab, index + createTabs.length))}</div>
        </div>
      </div>
    </Panel>
  );
}

function NsfwVisibilityToggle({
  nsfwVisible,
  showNsfw,
  setShowNsfw,
}: {
  nsfwVisible: boolean;
  showNsfw: boolean;
  setShowNsfw: (v: boolean) => void;
}) {
  if (!nsfwVisible) return null;
  return (
    <Panel title="NSFW 资源">
      <div className="mb-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>
        成人图片与普通图片隔离显示，关闭后不会出现在成品库和角色槽位。
      </div>
      <button type="button" onClick={() => setShowNsfw(!showNsfw)} className="w-full px-3 py-2 text-xs font-serif tracking-[0.14em]" style={{ color: showNsfw ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-nsfw),0.88)', background: showNsfw ? 'linear-gradient(135deg, rgb(var(--tj-ui-nsfw)), #c989a6)' : 'rgba(var(--tj-ui-nsfw),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.28)', clipPath: smallClip }}>
        {showNsfw ? '隐藏 NSFW 图片' : '显示 NSFW 图片'}
      </button>
    </Panel>
  );
}

function CharacterLibraryWorkspace({
  records,
  activeRecord,
  activeEntryId,
  resourceEntries,
  onSelectNpc,
  onSelectEntry,
  onCreate,
  onMount,
  onDeleteEntries,
  onSetSlot,
  maleNsfwEnabled,
}: {
  records: CharacterLibraryRecord[];
  activeRecord: CharacterLibraryRecord | null;
  activeEntryId?: string;
  resourceEntries: CharacterLibraryEntry[];
  nameFilter: string;
  setNameFilter: (value: string) => void;
  statusFilter: LibraryStatusFilter;
  setStatusFilter: (value: LibraryStatusFilter) => void;
  onSelectNpc: (id: string) => void;
  onSelectEntry: (id: string) => void;
  onCreate: () => void;
  onMount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => void;
  onUnmount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; slot: MountedImageSlot }) => void;
  onDeleteEntries: (entryIds: string[]) => void;
  onSetSlot: (params: { record: CharacterLibraryRecord | null; entryId: string; slot: 图片槽位 }) => void;
  maleNsfwEnabled: boolean;
}) {
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const totals = useMemo(() => ({
    current: records.length,
    images: records.reduce((sum, record) => sum + record.imageCount, 0),
    mounted: records.reduce((sum, record) => sum + record.mountedCount, 0),
  }), [records]);

  const scopedResourceEntries = useMemo(
    () => buildScopedCharacterGalleryEntries(activeRecord, resourceEntries),
    [activeRecord, resourceEntries],
  );
  const visibleCharacterEntries = useMemo(
    () => buildVisibleCharacterEntries(activeRecord, resourceEntries),
    [activeRecord, resourceEntries],
  );
  const previewEntry = useMemo(
    () => visibleCharacterEntries.find((item) => item.entry.id === activeEntryId) ?? (selectedIds.length === 1 ? visibleCharacterEntries.find((item) => item.entry.id === selectedIds[0]) : null) ?? null,
    [activeEntryId, selectedIds, visibleCharacterEntries],
  );
  const visibleIds = useMemo(() => new Set(visibleCharacterEntries.map((item) => item.entry.id)), [visibleCharacterEntries]);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.has(id));
  const toggleSelected = (entryId: string) => {
    setSelectedIds((current) => current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]);
  };
  const handleEntryClick = (entryId: string) => {
    onSelectEntry(entryId);
    if (batchMode) toggleSelected(entryId);
  };
  const handleDeleteSelected = () => {
    onDeleteEntries(selectedVisibleIds);
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  };
  const resolveSlotTargetEntryId = () => {
    const entryId = selectedVisibleIds.length === 1 ? selectedVisibleIds[0] : activeEntryId;
    return entryId || '';
  };
  const handleOpenSlotPicker = () => {
    if (!resolveSlotTargetEntryId()) return;
    setSlotPickerOpen(true);
  };
  const handleSetSlot = (slot: 图片槽位) => {
    const entryId = resolveSlotTargetEntryId();
    if (!entryId) return;
    onSetSlot({ record: activeRecord, entryId, slot });
    setSlotPickerOpen(false);
  };
  const handlePreview = () => {
    if (!previewEntry?.src) return;
    setPreviewOpen(true);
  };
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleIds]);

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
      <Panel title="角色列表" className="min-h-0" contentClassName="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pr-2">
            {records.length ? (
              <div className="space-y-1.5">
                {records.map((record) => (
                  <CharacterArchiveButton
                    key={record.id}
                    record={record}
                    active={activeRecord?.id === record.id}
                    onClick={() => onSelectNpc(record.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyLibraryBox title="未找到角色" desc="调整筛选条件，或先让剧情写入伙伴档案。" />
            )}
          </div>
          <div className="border-t px-3 py-3 text-[11px] leading-relaxed" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.1)', color: 'rgba(var(--tj-ui-muted),0.72)' }}>
            {totals.current} 个角色，{totals.images} 张图。
          </div>
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4">
        <Panel title="图片功能" className="shrink-0" contentClassName="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
              成品库只管理旅人和伙伴的头像、正文头像、手机头像与立绘。场景图和故事快照会进入后续独立图库。
            </div>
            <div className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-accent-primary),0.78)', background: 'rgba(var(--tj-ui-panel-strong),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
              当前对象：{activeRecord?.name || '未选择'}
              {batchMode && <span className="ml-2" style={{ color: 'rgba(var(--tj-tech-cyan),0.88)' }}>已选 {selectedVisibleIds.length}</span>}
            </div>
            {batchMode && (
              <div className="px-3 py-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-tech-cyan),0.88)', background: 'rgba(var(--tj-tech-cyan),0.06)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.16)', clipPath: smallClip }}>
                批量选择已开启，点卡片即可勾选。
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <button
              type="button"
              disabled={!previewEntry?.src}
              onClick={handlePreview}
              className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
              style={{ color: 'rgba(var(--tj-accent-primary),0.92)', background: 'rgba(var(--tj-tech-cyan),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}
            >
              图片预览
            </button>
            <button
              type="button"
              onClick={() => {
                setBatchMode(!batchMode);
                if (batchMode) setSelectedIds([]);
              }}
              className="min-h-[42px] px-3 py-2 font-serif text-xs font-bold tracking-[0.14em]"
              style={{
                color: batchMode ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.94)',
                background: batchMode ? 'linear-gradient(135deg, rgb(var(--tj-tech-cyan)), rgb(var(--tj-accent-primary)))' : 'rgba(var(--tj-ui-panel-strong),0.42)',
                boxShadow: batchMode ? 'inset 0 0 0 1px rgba(255,245,200,0.62), 0 0 22px rgba(var(--tj-tech-cyan),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                clipPath: smallClip,
              }}
            >
              {batchMode ? `批量选择中 · ${selectedVisibleIds.length}` : '批量选择'}
            </button>
            <button
              type="button"
              disabled={!batchMode || selectedVisibleIds.length === 0}
              onClick={handleDeleteSelected}
              className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
              style={{ color: 'rgba(255,205,205,0.92)', background: 'rgba(160,60,60,0.16)', boxShadow: 'inset 0 0 0 1px rgba(255,140,140,0.2)', clipPath: smallClip }}
            >
              批量删除
            </button>
            <button
              type="button"
              disabled={!activeRecord || (!activeEntryId && selectedVisibleIds.length !== 1)}
              onClick={handleOpenSlotPicker}
              className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
              style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.38)', clipPath: smallClip }}
            >
              设置到槽位
            </button>
          </div>
        </Panel>

        <Panel title="图库" className="min-h-0 flex-1" contentClassName="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b px-3 py-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.1)' }}>
              <div className="mb-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
                这里按角色归属展示头像和立绘。生成伙伴图片时会直接归到所选伙伴名下。
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="px-3 py-1.5 font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.44)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
                  {activeRecord?.name || '未选择角色'} · 当前图库
                </div>
                <div style={{ color: 'rgba(var(--tj-ui-faint),0.72)', fontSize: 11 }}>
                  当前显示 {visibleCharacterEntries.length} 项
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {visibleCharacterEntries.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                  {visibleCharacterEntries.map((item) => (
                    <ResourceEntryCard
                      key={item.entry.id}
                      item={item}
                      active={activeEntryId === item.entry.id}
                      activeRecord={activeRecord}
                      maleNsfwEnabled={maleNsfwEnabled}
                      batchMode={batchMode}
                      selected={selectedVisibleIds.includes(item.entry.id)}
                      onClick={() => handleEntryClick(item.entry.id)}
                      onMount={onMount}
                    />
                  ))}
                </div>
              ) : (
                <EmptyLibraryBox title="暂无可显示资源" desc="当前角色名下还没有头像或立绘。内置头像、生成结果和挂载资源都会显示在这里。" />
              )}
            </div>
          </div>
        </Panel>
      </div>
      <ImagePreviewModal
        open={previewOpen && Boolean(previewEntry?.src)}
        src={previewEntry?.src || ''}
        title={`图片预览 · ${activeRecord?.name || '角色'} · ${previewEntry?.entry.title || ''}`}
        onClose={() => setPreviewOpen(false)}
      />
      <SlotPickerModal
        open={slotPickerOpen}
        recordName={activeRecord?.name || '角色'}
        entryTitle={previewEntry?.entry.title || ''}
        recommendedSlot={previewEntry?.entry.slot}
        onClose={() => setSlotPickerOpen(false)}
        onSelect={handleSetSlot}
      />
    </div>
  );
}

function SceneLibraryWorkspace({
  entries,
  activeEntryId,
  filter,
  setFilter,
  onSelectEntry,
  onDeleteEntries,
}: {
  entries: SceneLibraryEntry[];
  activeEntryId?: string;
  filter: SceneLibraryFilter;
  setFilter: (value: SceneLibraryFilter) => void;
  onSelectEntry: (id: string) => void;
  onDeleteEntries: (entryIds: string[]) => void;
}) {
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const filterOptions: Array<{ id: SceneLibraryFilter; title: string; desc: string }> = [
    { id: 'all', title: '全部', desc: `${entries.length} 张` },
    { id: 'scene', title: '场景图', desc: `${entries.filter((item) => item.kind === 'scene').length} 张` },
    { id: 'snapshot', title: '故事快照', desc: `${entries.filter((item) => item.kind === 'snapshot').length} 张` },
    { id: 'phone', title: '手机背景', desc: `${entries.filter((item) => item.kind === 'phone').length} 张` },
  ];
  const visibleEntries = useMemo(
    () => entries.filter((item) => filter === 'all' || item.kind === filter),
    [entries, filter],
  );
  const visibleIds = useMemo(() => new Set(visibleEntries.map((item) => item.entry.id)), [visibleEntries]);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.has(id));
  const previewEntry = useMemo(
    () => visibleEntries.find((item) => item.entry.id === activeEntryId) ?? (selectedVisibleIds.length === 1 ? visibleEntries.find((item) => item.entry.id === selectedVisibleIds[0]) : null) ?? null,
    [activeEntryId, selectedVisibleIds, visibleEntries],
  );
  const totals = useMemo(() => ({
    scene: entries.filter((item) => item.kind === 'scene').length,
    snapshot: entries.filter((item) => item.kind === 'snapshot').length,
    phone: entries.filter((item) => item.kind === 'phone').length,
  }), [entries]);
  const toggleSelected = (entryId: string) => {
    setSelectedIds((current) => current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]);
  };
  const handleEntryClick = (entryId: string) => {
    onSelectEntry(entryId);
    if (batchMode) toggleSelected(entryId);
  };
  const handleDeleteSelected = () => {
    onDeleteEntries(selectedVisibleIds);
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  };
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleIds]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Panel title="场景库" className="shrink-0" contentClassName="space-y-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
            场景库只负责收纳场景图、故事快照和手机背景。下面的筛选用于切换三类资源，和创建入口分开，避免看起来像页签切换。
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniInfo label="场景图" value={`${totals.scene}`} />
            <MiniInfo label="故事快照" value={`${totals.snapshot}`} />
            <MiniInfo label="手机背景" value={`${totals.phone}`} />
          </div>
        </div>
        <OptionButtonGroup
          label="图库筛选"
          columns="md:grid-cols-4"
          value={filter}
          options={filterOptions}
          onChange={(id) => setFilter(id as SceneLibraryFilter)}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={!previewEntry?.src}
            onClick={() => setPreviewOpen(true)}
            className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
            style={{ color: 'rgba(var(--tj-accent-primary),0.92)', background: 'rgba(var(--tj-tech-cyan),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}
          >
            图片预览
          </button>
          <button
            type="button"
            onClick={() => {
              setBatchMode(!batchMode);
              if (batchMode) setSelectedIds([]);
            }}
            className="min-h-[42px] px-3 py-2 font-serif text-xs font-bold tracking-[0.14em]"
            style={{
              color: batchMode ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.94)',
              background: batchMode ? 'linear-gradient(135deg, rgb(var(--tj-tech-cyan)), rgb(var(--tj-accent-primary)))' : 'rgba(var(--tj-ui-panel-strong),0.42)',
              boxShadow: batchMode ? 'inset 0 0 0 1px rgba(255,245,200,0.62), 0 0 22px rgba(var(--tj-tech-cyan),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
              clipPath: smallClip,
            }}
          >
            {batchMode ? `批量选择中 · ${selectedVisibleIds.length}` : '批量选择'}
          </button>
          <button
            type="button"
            disabled={!batchMode || selectedVisibleIds.length === 0}
            onClick={handleDeleteSelected}
            className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
            style={{ color: 'rgba(255,205,205,0.92)', background: 'rgba(160,60,60,0.16)', boxShadow: 'inset 0 0 0 1px rgba(255,140,140,0.2)', clipPath: smallClip }}
          >
            批量删除
          </button>
        </div>
      </Panel>

      <Panel title="图库" className="min-h-0 flex-1" contentClassName="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b px-3 py-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.1)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="px-3 py-1.5 font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.44)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
                {sceneLibraryFilterLabel(filter)} · 当前图库
              </div>
              <div style={{ color: 'rgba(var(--tj-ui-faint),0.72)', fontSize: 11 }}>
                当前显示 {visibleEntries.length} 项
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visibleEntries.length ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                {visibleEntries.map((item) => (
                  <SceneLibraryCard
                    key={item.entry.id}
                    item={item}
                    active={activeEntryId === item.entry.id}
                    batchMode={batchMode}
                    selected={selectedVisibleIds.includes(item.entry.id)}
                    onClick={() => handleEntryClick(item.entry.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyLibraryBox title="暂无场景资源" desc="场景图、故事快照和手机背景会单独进入这里，不再混进角色成品库。" />
            )}
          </div>
        </div>
      </Panel>
      <ImagePreviewModal
        open={previewOpen && Boolean(previewEntry?.src)}
        src={previewEntry?.src || ''}
        title={`图片预览 · ${previewEntry?.label || '场景'} · ${previewEntry?.entry.title || ''}`}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

function SceneLibraryCard({
  item,
  active,
  batchMode,
  selected,
  onClick,
}: {
  item: SceneLibraryEntry;
  active: boolean;
  batchMode: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="relative space-y-1.5 transition-all"
      style={batchMode ? {
        padding: 5,
        background: selected ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.34), rgba(var(--tj-accent-primary),0.26))' : 'rgba(var(--tj-tech-cyan),0.08)',
        boxShadow: selected ? '0 0 0 2px rgba(var(--tj-tech-cyan),0.92), 0 0 24px rgba(var(--tj-tech-cyan),0.22)' : '0 0 0 1px rgba(var(--tj-tech-cyan),0.24)',
        clipPath: cardClip,
      } : undefined}
    >
      {batchMode && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center font-serif text-lg font-bold"
          style={{
            color: selected ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.82)',
            background: selected ? activeAccentSurface : 'rgba(0,0,0,0.58)',
            boxShadow: selected ? 'inset 0 0 0 1px rgba(255,245,200,0.62), 0 0 18px rgba(var(--tj-accent-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.36)',
            clipPath: smallClip,
          }}
        >
          {selected ? '✓' : ''}
        </div>
      )}
      {batchMode && selected && (
        <div className="pointer-events-none absolute inset-[5px] z-10 flex items-center justify-center" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62))', clipPath: cardClip }}>
          <div className="px-3 py-2 font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, clipPath: smallClip }}>
            已选择
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className="group block w-full overflow-hidden text-left transition-all"
        style={{
          background: 'rgba(var(--tj-ui-panel), 0.52)',
          boxShadow: active || selected ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.78), 0 0 18px rgba(var(--tj-accent-primary),0.1)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
          clipPath: cardClip,
        }}
      >
        <div className="aspect-[4/3]">
          <SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />
        </div>
        <div className="space-y-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 px-2 py-1 font-serif text-[10px] tracking-[0.12em]" style={{ color: sceneLibraryKindColor(item.kind), background: sceneLibraryKindSurface(item.kind), boxShadow: `inset 0 0 0 1px ${sceneLibraryKindBorder(item.kind)}`, clipPath: smallClip }}>
              {item.label}
            </span>
            <span className="truncate text-[10px]" style={{ color: 'rgba(var(--tj-ui-muted),0.58)' }}>{formatAlbumDate(item.entry.createdAt)}</span>
          </div>
          <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>
            <span>{slotLabel(item.entry.slot)}</span>
            {item.entry.tags?.length ? <span className="truncate">{item.entry.tags.slice(0, 2).join(' / ')}</span> : null}
          </div>
        </div>
      </button>
      <div className="px-2 text-[10px] leading-relaxed" style={{ color: selected ? 'rgba(var(--tj-tech-cyan),0.9)' : active ? 'rgba(var(--tj-accent-primary),0.72)' : 'rgba(var(--tj-ui-muted),0.52)' }}>
        {batchMode ? (selected ? '已加入批量选择。' : '点选加入批量选择。') : active ? '当前选中，可在上方预览。' : '点选后可预览或批量管理。'}
      </div>
    </div>
  );
}

function CharacterArchiveButton({ record, active, onClick }: { record: CharacterLibraryRecord; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full min-w-0 px-3 py-2.5 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.07)]"
      style={{
        background: active ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.16), rgba(var(--tj-accent-primary),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="min-w-0">
        <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>
          {record.name}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>
          <span>已装 {record.mountedCount}</span>
          <span>资源 {record.resourceCount}</span>
        </div>
      </div>
    </button>
  );
}

function MountedSlotPreview({ slot, onUnmount }: { slot: MountedImageSlot; onUnmount: () => void }) {
  return (
    <div className="overflow-hidden" style={{ background: slot.nsfw ? 'rgba(var(--tj-ui-nsfw),0.055)' : 'rgba(var(--tj-accent-primary),0.035)', boxShadow: slot.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.2)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
      <div className="aspect-[4/3] ">
        <SafeAlbumImage src={slot.src} alt={slot.label} className="h-full w-full object-cover" emptyLabel="待写入" failedLabel="图片失效" />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="truncate font-serif text-xs font-bold tracking-[0.14em]" style={{ color: slot.nsfw ? 'rgb(var(--tj-ui-nsfw))' : 'rgb(var(--tj-ui-title))' }}>{slot.label}</div>
        {slot.src && (
          <button type="button" onClick={onUnmount} className="shrink-0 px-2 py-1 font-serif text-[10px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-danger),0.9)', background: 'rgba(var(--tj-danger),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.22)', clipPath: smallClip }}>
            卸下
          </button>
        )}
      </div>
    </div>
  );
}

function CharacterAnchorWorkspace({
  traveler,
  travelerRequirement,
  setTravelerRequirement,
  onSaveTravelerAnchor,
  onDeleteTravelerAnchor,
  onExtractTravelerAnchor,
  records,
  activeRecord,
  activeSelection,
  anchorExtractingTarget,
  setAnchorExtractingTarget,
  anchorBatchExtracting,
  setAnchorBatchExtracting,
  onSelectAnchor,
  requirement,
  setRequirement,
  onSaveAnchor,
  onDeleteAnchor,
  onExtractAnchor,
}: {
  traveler: 角色数据结构;
  travelerRequirement: string;
  setTravelerRequirement: (value: string) => void;
  onSaveTravelerAnchor: (anchor: NPC角色锚点档案) => void;
  onDeleteTravelerAnchor: () => void;
  onExtractTravelerAnchor: (requirement: string) => Promise<void>;
  records: NpcLibraryRecord[];
  activeRecord: NpcLibraryRecord | null;
  activeSelection: AnchorSelection;
  anchorExtractingTarget: AnchorSelection | null;
  setAnchorExtractingTarget: React.Dispatch<React.SetStateAction<AnchorSelection | null>>;
  anchorBatchExtracting: boolean;
  setAnchorBatchExtracting: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectAnchor: (selection: AnchorSelection) => void;
  requirement: string;
  setRequirement: (value: string) => void;
  onSaveAnchor: (npcId: string, anchor: NonNullable<NPC记录['图像档案']>['角色锚点']) => void;
  onDeleteAnchor: (npcId: string) => void;
  onExtractAnchor: (npcId: string, requirement: string) => Promise<void>;
}) {
  const [batchMessage, setBatchMessage] = useState('批量操作会应用到左侧当前列表，单个锚点编辑已改为自动保存。');
  const anchoredCount = records.filter((record) => record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词).length;
  const enabledCount = records.filter((record) => record.npc.图像档案?.角色锚点?.是否启用 !== false && (record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词)).length;
  const travelerAnchor = traveler.图像档案?.角色锚点;
  const travelerHasAnchor = Boolean(travelerAnchor?.正面提示词 || travelerAnchor?.负面提示词);
  const activeNpcRecord = activeSelection === 'traveler'
    ? null
    : records.find((record) => record.npc.id === activeSelection) ?? activeRecord;
  const batchMissingCount = records.filter((record) => !(record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词)).length + (travelerHasAnchor ? 0 : 1);
  const handleBatchExtract = () => {
    setAnchorBatchExtracting(true);
    void (async () => {
      try {
        let count = 0;
        if (!travelerHasAnchor) {
          await onExtractTravelerAnchor(travelerRequirement);
          count += 1;
        }
        for (const record of records) {
          const anchor = record.npc.图像档案?.角色锚点;
          if (anchor?.正面提示词 || anchor?.负面提示词) continue;
          await onExtractAnchor(record.npc.id, requirement);
          count += 1;
        }
        setBatchMessage(count > 0
          ? `已为 ${count} 个缺失对象生成锚点，并写入对应档案。`
          : '当前列表没有缺失锚点。');
      } finally {
        setAnchorBatchExtracting(false);
      }
    })();
  };
  const handleBatchSave = () => {
    setBatchMessage('当前版本已改为自动保存：单个锚点编辑、批量提取和批量清理都会立即写入档案。');
  };
  const handleBatchClean = () => {
    let count = 0;
    if (travelerAnchor) {
      onDeleteTravelerAnchor();
      count += 1;
    }
    records.forEach((record) => {
      const anchor = record.npc.图像档案?.角色锚点;
      if (!anchor) return;
      onDeleteAnchor(record.npc.id);
      count += 1;
    });
    setBatchMessage(count > 0 ? `已清理当前列表中的 ${count} 个锚点。` : '当前列表没有可清理的锚点。');
  };

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <Panel title="锚点角色">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <AnchorStat label="已建立" value={anchoredCount + (travelerHasAnchor ? 1 : 0)} />
          <AnchorStat label="启用中" value={enabledCount + (travelerHasAnchor && travelerAnchor?.是否启用 !== false ? 1 : 0)} />
        </div>
        <button
          type="button"
          onClick={() => onSelectAnchor('traveler')}
          className="mb-2 w-full px-3 py-3 text-left transition-all"
          style={{ background: activeSelection === 'traveler' ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.18), rgba(var(--tj-accent-primary),0.05))' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: activeSelection === 'traveler' ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>主控 · {traveler.姓名 || '旅人'}</div>
              <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.62)' }}>
                {travelerHasAnchor ? travelerAnchor?.名称 || '主控锚点' : '未建立锚点'}
              </div>
            </div>
            <span className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: travelerHasAnchor ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.66)', background: travelerHasAnchor ? activeAccentSurface : 'rgba(var(--tj-accent-primary),0.06)', clipPath: smallClip }}>
              {travelerHasAnchor ? (travelerAnchor?.是否启用 === false ? '停用' : '启用') : '空'}
            </span>
          </div>
          {travelerAnchor?.场景生图自动注入 && (
            <div className="mt-2 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.7)' }}>场景联动</div>
          )}
        </button>
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {records.length ? (
            records.map((record) => {
              const anchor = record.npc.图像档案?.角色锚点;
              const hasAnchor = Boolean(anchor?.正面提示词 || anchor?.负面提示词);
              const active = activeSelection === record.npc.id;
              return (
                <button
                  key={record.npc.id}
                  type="button"
                  onClick={() => onSelectAnchor(record.npc.id)}
                  className="w-full px-3 py-3 text-left transition-all"
                  style={{
                    background: active ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.16), rgba(var(--tj-accent-primary),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
                    boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{record.npc.姓名}</div>
                      <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.62)' }}>
                        {hasAnchor ? anchor?.名称 || '角色锚点' : '未建立锚点'}
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: hasAnchor ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.66)', background: hasAnchor ? activeAccentSurface : 'rgba(var(--tj-accent-primary),0.06)', clipPath: smallClip }}>
                      {hasAnchor ? (anchor?.是否启用 === false ? '停用' : '启用') : '空'}
                    </span>
                  </div>
                  {anchor?.场景生图自动注入 && (
                    <div className="mt-2 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.7)' }}>场景联动</div>
                  )}
                </button>
              );
            })
          ) : (
            <EmptyLibraryBox title="暂无角色" desc="伙伴系统写入角色后，才会在这里建立角色锚点。" />
          )}
        </div>
      </Panel>

      <div className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Panel title="批量处理">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>角色视觉批量工作区</div>
              <div>用于批量提取缺失锚点、确认自动保存状态，或一键清空当前列表内的全部锚点。</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <MiniInfo label="角色数" value={String(records.length + 1)} />
                <MiniInfo label="缺失锚点" value={String(batchMissingCount)} />
                <MiniInfo label="场景联动" value={String(records.filter((record) => record.npc.图像档案?.角色锚点?.场景生图自动注入).length + (travelerAnchor?.场景生图自动注入 ? 1 : 0))} />
              </div>
              <div className="px-3 py-2 text-[11px]" style={{ color: 'rgba(var(--tj-tech-cyan),0.82)', background: 'rgba(var(--tj-tech-cyan),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.18)', clipPath: smallClip }}>
                {batchMessage}
              </div>
            </div>
            <div className="grid gap-2">
              <Button disabled={anchorBatchExtracting} onClick={handleBatchExtract}>
                <span className="inline-flex items-center gap-2">
                  {anchorBatchExtracting && <Spinner />}
                  {anchorBatchExtracting ? '批量提取中' : 'AI 批量提取锚点'}
                </span>
              </Button>
              <Button onClick={handleBatchSave}>保存状态说明</Button>
              <Button onClick={handleBatchClean}>清理全部锚点</Button>
            </div>
          </div>
        </Panel>

        <Panel title={activeSelection === 'traveler' ? `${traveler.姓名 || '旅人'} · 主控锚点档案` : activeNpcRecord ? `${activeNpcRecord.npc.姓名} · 角色锚点档案` : '角色锚点档案'}>
          {activeSelection === 'traveler' ? (
            <CharacterAnchorPanel
              label="主控锚点管理"
              desc="主控锚点用于稳定旅人外观，角色图和场景图都会优先读取它。"
              nameFallback={traveler.姓名 || '旅人'}
              anchor={traveler.图像档案?.角色锚点}
              requirement={travelerRequirement}
              setRequirement={setTravelerRequirement}
              onExtract={() => { void onExtractTravelerAnchor(travelerRequirement); }}
              onSave={onSaveTravelerAnchor}
              onDelete={onDeleteTravelerAnchor}
              isExtracting={anchorExtractingTarget === 'traveler'}
              extractLabel="主控锚点提取"
            />
          ) : activeNpcRecord ? (
            <CharacterAnchorPanel
              label="角色锚点管理"
              desc="角色锚点用于稳定 NPC 外观，每名角色只保留一个锚点。"
              nameFallback={activeNpcRecord.npc.姓名}
              anchor={activeNpcRecord.npc.图像档案?.角色锚点}
              requirement={requirement}
              setRequirement={setRequirement}
              onExtract={() => { void onExtractAnchor(activeNpcRecord.npc.id, requirement); }}
              onSave={(anchor) => onSaveAnchor(activeNpcRecord.npc.id, anchor)}
              onDelete={() => onDeleteAnchor(activeNpcRecord.npc.id)}
              isExtracting={anchorExtractingTarget === activeNpcRecord.npc.id}
              extractLabel="AI提取锚点"
            />
          ) : (
            <EmptyLibraryBox title="未选择角色" desc="先在左侧选择一个伙伴，再建立用于稳定外观的角色锚点。" />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ReferenceImageWorkspace({
  records,
  activeRecord,
  entries,
  activeEntryId,
  settings,
  imageBackend,
  onSettingsChange,
  onSelectRecord,
  onSelectEntry,
  onUpload,
  onDeleteEntries,
}: {
  records: CharacterLibraryRecord[];
  activeRecord: CharacterLibraryRecord | null;
  entries: CharacterLibraryEntry[];
  activeEntryId?: string;
  settings: 文生图参考图设置;
  imageBackend: 文生图API配置['backend'];
  onSettingsChange: (patch: Partial<文生图参考图设置>) => void;
  onSelectRecord: (id: string) => void;
  onSelectEntry: (id: string) => void;
  onUpload: (files: FileList | null) => void;
  onDeleteEntries: (entryIds: string[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<CharacterLibraryEntry | null>(null);
  const selectedVisibleIds = selectedIds.filter((id) => entries.some((item) => item.entry.id === id));
  const activeSupport = referenceBackendSupport(imageBackend, settings);
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => entries.some((item) => item.entry.id === id)));
  }, [entries]);
  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[190px_minmax(0,1fr)]">
      <Panel title="参考对象" className="min-h-0" contentClassName="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pr-2">
            <div className="space-y-1.5">
              {records.map((record) => (
                <CharacterArchiveButton
                  key={record.id}
                  record={record}
                  active={activeRecord?.id === record.id}
                  onClick={() => onSelectRecord(record.id)}
                />
              ))}
            </div>
          </div>
          <div className="border-t px-3 py-3 text-[11px] leading-relaxed" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.1)', color: 'rgba(var(--tj-ui-muted),0.72)' }}>
            参考图按角色归档，开启后只在对应旅人或伙伴生成时尝试参与。
          </div>
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4">
        <Panel title="参考图控制" className="shrink-0">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-3">
              <AnchorToggle
                label="启用参考图"
                desc="默认关闭；开启后才会尝试把本页素材传入生成接口"
                checked={settings.enabled}
                onChange={(enabled) => onSettingsChange({ enabled })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <ReferenceCapabilityCard
                  title="SD WebUI"
                  status="已接入"
                  desc="开启后使用 /sdapi/v1/img2img，并读取当前角色参考图。"
                  active={imageBackend === 'sd_webui'}
                />
                <ReferenceCapabilityCard
                  title="ComfyUI"
                  status={settings.enableComfyWorkflowReference ? '需工作流' : '默认关闭'}
                  desc="需要工作流显式预留 __REFERENCE_IMAGE__ 或 {{reference_image}}。"
                  active={imageBackend === 'comfyui'}
                />
                <ReferenceCapabilityCard
                  title="OpenAI 兼容"
                  status="不保证"
                  desc="/images/generations 多数中转不吃参考图；默认只保存素材。"
                  active={imageBackend === 'openai_compatible'}
                />
                <ReferenceCapabilityCard
                  title="NovelAI"
                  status="待接入"
                  desc="img2img / vibe transfer 参数差异大，当前不自动传图。"
                  active={imageBackend === 'novelai'}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="px-3 py-3 text-xs leading-relaxed" style={{ color: activeSupport.usable ? 'rgba(var(--tj-tech-cyan),0.9)' : 'rgba(255,205,145,0.9)', background: activeSupport.usable ? 'rgba(var(--tj-tech-cyan),0.07)' : 'rgba(var(--tj-accent-primary),0.06)', boxShadow: `inset 0 0 0 1px ${activeSupport.usable ? 'rgba(var(--tj-tech-cyan),0.2)' : 'rgba(var(--tj-accent-primary),0.18)'}`, clipPath: smallClip }}>
                当前统一接口：{backendLabel(imageBackend)}
                <br />
                {activeSupport.message}
              </div>
              <Field label="SD WebUI 参考强度">
                <input
                  type="range"
                  min={0.05}
                  max={0.95}
                  step={0.05}
                  value={settings.sdWebuiDenoisingStrength}
                  onChange={(event) => onSettingsChange({ sdWebuiDenoisingStrength: Number(event.target.value) })}
                  className="w-full"
                />
                <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
                  denoising strength：{settings.sdWebuiDenoisingStrength.toFixed(2)}
                </div>
              </Field>
              <AnchorToggle
                label="允许 ComfyUI 工作流参考图"
                desc="仅在你确认工作流有参考图占位符时开启"
                checked={settings.enableComfyWorkflowReference}
                onChange={(enableComfyWorkflowReference) => onSettingsChange({ enableComfyWorkflowReference })}
              />
            </div>
          </div>
        </Panel>

        <Panel title="参考图库" className="min-h-0 flex-1" contentClassName="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
                当前对象：{activeRecord?.name || '未选择'} · {entries.length} 张参考图
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    onUpload(event.currentTarget.files);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={!activeRecord}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 font-serif text-xs font-bold tracking-[0.14em] disabled:opacity-45"
                  style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.38)', clipPath: smallClip }}
                >
                  导入参考图
                </button>
                <button
                  type="button"
                  disabled={!selectedVisibleIds.length}
                  onClick={() => {
                    onDeleteEntries(selectedVisibleIds);
                    setSelectedIds([]);
                  }}
                  className="px-4 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45"
                  style={{ color: 'rgba(255,205,205,0.92)', background: 'rgba(160,60,60,0.16)', boxShadow: 'inset 0 0 0 1px rgba(255,140,140,0.2)', clipPath: smallClip }}
                >
                  删除选中
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {entries.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                  {entries.map((item) => {
                    const selected = selectedVisibleIds.includes(item.entry.id);
                    return (
                      <button
                        key={item.entry.id}
                        type="button"
                        onClick={() => {
                          onSelectEntry(item.entry.id);
                          setSelectedIds((current) => current.includes(item.entry.id) ? current.filter((id) => id !== item.entry.id) : [...current, item.entry.id]);
                        }}
                        onDoubleClick={() => setPreview(item)}
                        className="group overflow-hidden text-left transition-all"
                        style={{ background: 'rgba(var(--tj-ui-panel),0.54)', boxShadow: selected ? 'inset 0 0 0 2px rgba(var(--tj-tech-cyan),0.9), 0 0 24px rgba(var(--tj-tech-cyan),0.16)' : activeEntryId === item.entry.id ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.72)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: cardClip }}
                      >
                        <div className="relative aspect-[4/3]">
                          <SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />
                          {selected && (
                            <div className="absolute right-2 top-2 px-2 py-1 font-serif text-[10px] font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, boxShadow: '0 0 16px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}>
                              已选
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</div>
                          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>双击预览 · {formatAlbumDate(item.entry.createdAt)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyLibraryBox title="暂无参考图" desc="导入角色头像、立绘或风格参考后，开启参考图开关才会参与生成。" />
              )}
            </div>
          </div>
        </Panel>
      </div>
      <ImagePreviewModal
        open={Boolean(preview?.src)}
        src={preview?.src || ''}
        title={`参考图预览 · ${activeRecord?.name || '角色'}`}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function ReferenceCapabilityCard({ title, status, desc, active }: { title: string; status: string; desc: string; active: boolean }) {
  return (
    <div className="px-3 py-3" style={{ background: active ? 'rgba(var(--tj-tech-cyan),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-serif text-xs font-bold tracking-[0.16em]" style={{ color: active ? 'rgba(var(--tj-tech-cyan),0.95)' : 'rgb(var(--tj-ui-title))' }}>{title}</div>
        <div className="text-[10px]" style={{ color: active ? 'rgba(var(--tj-tech-cyan),0.88)' : 'rgba(var(--tj-accent-primary),0.72)' }}>{status}</div>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{desc}</div>
    </div>
  );
}

function SafeAlbumImage({
  src,
  alt,
  className,
  emptyLabel = '待写入',
  failedLabel = '图片失效',
}: {
  src?: string;
  alt: string;
  className: string;
  emptyLabel?: string;
  failedLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center px-2 text-center font-serif text-xs tracking-[0.12em]`}
        style={{ background: imageWellSurface, color: failed ? 'rgba(255,180,180,0.88)' : 'rgba(var(--tj-ui-faint),0.58)' }}
      >
        {failed ? failedLabel : emptyLabel}
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}

function AnchorStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2" style={{ background: insetSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.62)', clipPath: smallClip }}>
      <div className="text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.62)' }}>{label}</div>
      <div className="mt-1 font-serif text-base font-bold" style={{ color: 'rgb(var(--tj-ui-title))' }}>{value}</div>
    </div>
  );
}

function CharacterAnchorPanel({
  label,
  desc,
  nameFallback,
  anchor,
  requirement,
  setRequirement,
  onExtract,
  onSave,
  onDelete,
  isExtracting = false,
  extractLabel = 'AI提取锚点',
}: {
  label: string;
  desc: string;
  nameFallback: string;
  anchor?: NPC角色锚点档案;
  requirement: string;
  setRequirement: (value: string) => void;
  onExtract: () => void;
  onSave: (anchor: NPC角色锚点档案) => void;
  onDelete: () => void;
  isExtracting?: boolean;
  extractLabel?: string;
}) {
  const [name, setName] = useState(anchor?.名称 || nameFallback);
  const [enabled, setEnabled] = useState(anchor?.是否启用 !== false);
  const [defaultApply, setDefaultApply] = useState(anchor?.生成时默认附加 !== false);
  const [sceneInject, setSceneInject] = useState(anchor?.场景生图自动注入 !== false);
  const [positive, setPositive] = useState(anchor?.正面提示词 || '');
  const [negative, setNegative] = useState(anchor?.负面提示词 || '');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const autosaveTimerRef = useRef<number | null>(null);
  const skipAutosaveRef = useRef(true);

  useEffect(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    skipAutosaveRef.current = true;
    setName(anchor?.名称 || nameFallback);
    setEnabled(anchor?.是否启用 !== false);
    setDefaultApply(anchor?.生成时默认附加 !== false);
    setSceneInject(anchor?.场景生图自动注入 !== false);
    setPositive(anchor?.正面提示词 || '');
    setNegative(anchor?.负面提示词 || '');
    setSaveState('saved');
  }, [anchor, nameFallback]);

  const save = () => onSave({
    ...(anchor ?? {}),
    名称: name,
    是否启用: enabled,
    生成时默认附加: defaultApply,
    场景生图自动注入: sceneInject,
    正面提示词: positive,
    负面提示词: negative,
    中文摘要: anchor?.中文摘要,
    来源: anchor?.来源 ?? 'manual',
  });

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    setSaveState('dirty');
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      setSaveState('saving');
      save();
      setSaveState('saved');
      autosaveTimerRef.current = null;
    }, 420);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [name, enabled, defaultApply, sceneInject, positive, negative]);

  const saveNow = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    save();
    setSaveState('saved');
  };

  return (
    <div className="space-y-3 px-3 py-3" style={{ background: cardSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58)', clipPath: smallClip }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>{label}</div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.64)' }}>{desc}</div>
          <div className="mt-1 text-[10px]" style={{ color: saveState === 'saving' ? 'rgba(var(--tj-tech-cyan),0.82)' : saveState === 'dirty' ? 'rgba(var(--tj-accent-primary),0.82)' : 'rgba(var(--tj-ui-muted),0.58)' }}>
            {saveState === 'saving' ? '自动保存中' : saveState === 'dirty' ? '待自动保存' : '已自动保存'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isExtracting} onClick={onExtract}>
            <span className="inline-flex items-center gap-2">
              {isExtracting && <Spinner />}
              {isExtracting ? '提取中' : extractLabel}
            </span>
          </Button>
          <Button onClick={saveNow}>手动保存</Button>
          <Button onClick={onDelete}>删除锚点</Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-3">
          <Field label="锚点名称">
            <input value={name} onChange={(event) => setName(event.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="提取附加要求">
            <input value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：更重视脸部、发色、胸型和常驻衣着" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <AnchorToggle label="启用锚点" desc="关闭后不参与生图" checked={enabled} onChange={setEnabled} />
            <AnchorToggle label="默认附加" desc="NPC 单图自动带入" checked={defaultApply} onChange={setDefaultApply} />
            <AnchorToggle label="场景联动" desc="场景图自动注入" checked={sceneInject} onChange={setSceneInject} />
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <Field label="正面提示词">
            <textarea value={positive} onChange={(event) => setPositive(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="负面提示词">
            <textarea value={negative} onChange={(event) => setNegative(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
        </div>
        <Field label="中文锚点摘要">
          <div className="min-h-[82px] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.28)', color: 'rgba(var(--tj-ui-title),0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
            {anchor?.中文摘要?.trim() || 'AI 提取后会在这里显示中文版本的稳定外观摘要，仅供玩家查看。'}
          </div>
        </Field>
      </div>
    </div>
  );
}

function AnchorToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 px-3 py-2 text-left"
      style={{ background: checked ? 'rgba(var(--tj-accent-primary),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: checked ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}
    >
      <span className="min-w-0">
        <span className="block font-serif text-xs font-bold tracking-[0.14em]" style={{ color: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.74)' }}>{label}</span>
        <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'rgba(var(--tj-ui-muted),0.58)' }}>{desc}</span>
      </span>
      <span className="h-5 w-9 shrink-0 rounded-full p-0.5" style={{ background: checked ? 'rgba(var(--tj-accent-primary),0.36)' : 'rgba(120,120,130,0.28)' }}>
        <span className="block h-4 w-4 rounded-full transition-all" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)', background: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(220,220,230,0.7)' }} />
      </span>
    </button>
  );
}

function CharacterEntryCard({
  item,
  active,
  targetKind,
  targetId,
  maleNsfwEnabled,
  onClick,
  onMount,
}: {
  item: CharacterLibraryEntry;
  active: boolean;
  targetKind?: CharacterLibraryRecord['kind'];
  targetId?: string;
  maleNsfwEnabled: boolean;
  onClick: () => void;
  onMount?: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => void;
}) {
  const canMount = Boolean(targetKind && targetId && onMount);
  const mountSlots = canMount && targetKind ? getMountSlotsForEntry(item.entry, maleNsfwEnabled, targetKind) : [];
  return (
    <div
      className="group overflow-hidden text-left transition-all"
      style={{
        background: 'rgba(var(--tj-ui-panel), 0.52)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.78), 0 0 18px rgba(var(--tj-accent-primary),0.1)' : item.entry.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: cardClip,
      }}
    >
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="aspect-[4/3] ">
          <SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />
        </div>
      </button>
      <div className="space-y-2 px-3 py-2">
        <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>
          <span>{slotLabel(item.entry.slot)}</span>
          {item.sourceLabel && <span style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>{item.sourceLabel}</span>}
          {item.entry.nsfw && <span style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}
        </div>
        {canMount && (
        <div className="grid grid-cols-2 gap-1.5">
          {mountSlots.map((slot) => (
            <button
              key={slot.value}
              type="button"
              disabled={!item.src}
              onClick={() => {
                if (!targetKind || !targetId || !onMount) return;
                onMount({ targetKind, targetId, entryId: item.entry.id, src: item.src, slot: slot.value });
              }}
              className="px-2 py-1.5 font-serif text-[11px] tracking-[0.1em] transition-all disabled:opacity-40"
              style={{
                color: slot.nsfw ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-accent-primary),0.9)',
                background: slot.nsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-accent-primary),0.055)',
                boxShadow: slot.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.24)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.2)',
                clipPath: smallClip,
              }}
            >
              {slot.label}
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function ResourceEntryCard({
  item,
  active,
  activeRecord,
  maleNsfwEnabled,
  batchMode,
  selected,
  onClick,
  onMount: _onMount,
}: {
  item: CharacterLibraryEntry;
  active: boolean;
  activeRecord: CharacterLibraryRecord | null;
  maleNsfwEnabled: boolean;
  batchMode: boolean;
  selected: boolean;
  onClick: () => void;
  onMount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => void;
}) {
  return (
        <div
          className="relative space-y-1.5 transition-all"
          style={batchMode ? {
            padding: 5,
            background: selected ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.34), rgba(var(--tj-accent-primary),0.26))' : 'rgba(var(--tj-tech-cyan),0.08)',
            boxShadow: selected ? '0 0 0 2px rgba(var(--tj-tech-cyan),0.92), 0 0 24px rgba(var(--tj-tech-cyan),0.22)' : '0 0 0 1px rgba(var(--tj-tech-cyan),0.24)',
            clipPath: cardClip,
          } : undefined}
        >
          {batchMode && (
            <div
              className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center font-serif text-lg font-bold"
              style={{
                color: selected ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.82)',
                background: selected ? activeAccentSurface : 'rgba(0,0,0,0.58)',
                boxShadow: selected ? 'inset 0 0 0 1px rgba(255,245,200,0.62), 0 0 18px rgba(var(--tj-accent-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.36)',
                clipPath: smallClip,
              }}
            >
              {selected ? '✓' : ''}
            </div>
          )}
          {batchMode && (
            <div
              className="pointer-events-none absolute inset-[5px] z-10 flex items-center justify-center transition-opacity"
              style={{
                background: selected ? 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62))' : 'rgba(0,0,0,0.18)',
                boxShadow: selected ? 'inset 0 0 0 999px rgba(var(--tj-tech-cyan),0.1)' : 'none',
                clipPath: cardClip,
              }}
            >
              {selected && (
                <div
                  className="px-3 py-2 font-serif text-xs font-bold tracking-[0.18em]"
                  style={{
                    color: 'rgb(var(--tj-ui-active-text))',
                    background: activeAccentSurface,
                    boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.52), 0 0 18px rgba(var(--tj-accent-primary),0.28)',
                    clipPath: smallClip,
                  }}
                >
                  已选择
                </div>
              )}
            </div>
          )}
          <CharacterEntryCard
            item={item}
            active={active || selected}
            targetKind={activeRecord?.kind}
            targetId={activeRecord?.id}
            maleNsfwEnabled={maleNsfwEnabled}
            onClick={onClick}
          />
          <div className="px-2 text-[10px] leading-relaxed" style={{ color: selected ? 'rgba(var(--tj-tech-cyan),0.9)' : active ? 'rgba(var(--tj-accent-primary),0.72)' : 'rgba(var(--tj-ui-muted),0.52)' }}>
            {batchMode ? (selected ? '已加入批量选择。' : '点选加入批量选择。') : active ? '当前选中，可设为头像。' : '点选后进入图库处理。'}
          </div>
        </div>
  );
}

function getMountSlotsForEntry(entry: 相册条目, maleNsfwEnabled: boolean, targetKind: CharacterLibraryRecord['kind'] = 'npc'): Array<{ value: 图片槽位; label: string; nsfw?: boolean }> {
  if (targetKind === 'traveler') {
    return [
      { value: 'avatar_profile', label: '档案' },
      { value: 'avatar_story', label: '正文' },
      { value: 'avatar_phone', label: '手机' },
      { value: 'portrait', label: '立绘' },
    ];
  }
  if (entry.nsfw || entry.targetType === 'nsfw_part') {
    return [
      { value: 'nsfw_female_chest', label: '胸部', nsfw: true },
      { value: 'nsfw_female_genital', label: '私处', nsfw: true },
      ...(maleNsfwEnabled ? [{ value: 'nsfw_male_genital' as 图片槽位, label: '男性器', nsfw: true }] : []),
      { value: 'nsfw_rear', label: '后庭', nsfw: true },
      { value: 'nsfw_body_reference', label: '体态', nsfw: true },
    ];
  }
  return [
    { value: 'avatar_profile', label: '档案' },
    { value: 'avatar_story', label: '正文' },
    { value: 'avatar_phone', label: '手机' },
    { value: 'portrait', label: '立绘' },
  ];
}

function EmptyLibraryBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-none border border-dashed px-6 text-center" style={{ borderColor: 'rgba(95,115,150,0.34)', color: 'rgba(var(--tj-ui-faint),0.72)' }}>
      <div>
        <div className="font-serif text-base tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{title}</div>
        <div className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{desc}</div>
      </div>
    </div>
  );
}

function EntryGrid({ entries, assetMap, activeId, onSelect, onCreate }: { entries: 相册条目[]; assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>; activeId?: string; onSelect: (id: string) => void; onCreate: () => void }) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-4 py-16 text-center" style={{ color: 'rgba(var(--tj-ui-faint), 0.72)', background: 'linear-gradient(180deg, rgba(var(--tj-ui-panel),0.45), rgba(var(--tj-ui-panel-strong),0.62))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)', clipPath: cardClip }}>
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center font-serif text-2xl" style={{ color: 'rgba(var(--tj-accent-primary),0.78)', background: 'rgba(var(--tj-accent-primary),0.06)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)', clipPath: smallClip }}>▧</div>
          <div className="font-serif text-base tracking-[0.24em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>暂无图片</div>
          <button type="button" onClick={onCreate} className="mt-5 px-5 py-2.5 font-serif text-xs font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.45), 0 0 16px rgba(var(--tj-tech-cyan),0.12)', clipPath: smallClip }}>
            生成 / 导入
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
      {entries.map((entry) => {
        const asset = assetMap.get(entry.assetId);
        const src = asset?.dataUrl || asset?.url || asset?.localRef || '';
        return (
          <button key={entry.id} type="button" onClick={() => onSelect(entry.id)} className="group overflow-hidden text-left transition-all" style={{ background: 'rgba(var(--tj-ui-panel), 0.52)', boxShadow: activeId === entry.id ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.78), 0 0 18px rgba(var(--tj-accent-primary),0.1)' : entry.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.32)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)', clipPath: cardClip }}>
            <div className="aspect-[4/3] ">
              <SafeAlbumImage src={src} alt={entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />
            </div>
            <div className="px-3 py-2">
              <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{entry.title}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted), 0.68)' }}>
                <span>{slotLabel(entry.slot)}</span>
                {entry.nsfw && <span style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CreateWorkspace(props: {
  imageEnabled: boolean;
  currentTarget: typeof generateTargets[number];
  generateTarget: GenerateTarget;
  setGenerateTarget: (v: GenerateTarget) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  resolvedSize: string;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void; negativePrompt: string; setNegativePrompt: (v: string) => void; generateTitle: string; setGenerateTitle: (v: string) => void; onGenerate: (nsfw?: boolean) => void; generating: boolean; nsfwVisible: boolean;
  companions: NPC记录[]; tokenizerNpcId: string; setTokenizerNpcId: (v: string) => void; tokenizerMode: 'avatar' | 'portrait' | 'scene'; setTokenizerMode: (v: 'avatar' | 'portrait' | 'scene') => void; sceneText: string; setSceneText: (v: string) => void; onBuildPrompt: () => void | Promise<void>; tokenizing: boolean;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  promptEditorOpen: boolean;
  setPromptEditorOpen: (v: boolean) => void;
  promptMeta: PromptMeta | null;
  canvasTask?: 图片生成任务;
  canvasSrc: string;
  onRetryTask: (task?: 图片生成任务) => void;
}) {
  const activePromptMeta = props.canvasTask
    ? {
        anchorMode: props.canvasTask.anchorMode === true,
        anchorSummary: props.canvasTask.anchorSummary || (props.canvasTask.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
        sourcePrompt: props.canvasTask.sourcePrompt,
      }
    : props.promptMeta;
  const parameterPanel = (
    <Panel title="生成参数">
      {props.currentTarget.targetType === 'traveler' ? (
        <TravelerGenerationParameters
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
          targetId={props.currentTarget.id}
          imageRules={props.imageRules}
          onImageRulesChange={props.onImageRulesChange}
          extraRequirement={props.extraRequirement}
          setExtraRequirement={props.setExtraRequirement}
        />
      ) : (
        <NpcGenerationParameters
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
          targetId={props.currentTarget.id}
          imageRules={props.imageRules}
          onImageRulesChange={props.onImageRulesChange}
          companions={props.companions}
          tokenizerNpcId={props.tokenizerNpcId}
          setTokenizerNpcId={props.setTokenizerNpcId}
          extraRequirement={props.extraRequirement}
          setExtraRequirement={props.setExtraRequirement}
        />
      )}
      <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
    </Panel>
  );
  return (
    <div className="space-y-4">
      <StudioHero imageEnabled={props.imageEnabled} currentTarget={props.currentTarget} />
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="生成用途" className="h-full" contentClassName="flex min-h-0 flex-1 flex-col">
            <div className="flex h-full flex-col gap-2">
              {imageGenerationTargets
                .filter((target) => !target.nsfw || props.nsfwVisible)
                .map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => props.setGenerateTarget(target.id)}
                    className="flex min-h-[76px] w-full flex-col justify-center px-3 py-3 text-left transition-all"
                    style={{
                      color: props.generateTarget === target.id ? 'rgb(var(--tj-ui-active-text))' : target.nsfw ? 'rgba(var(--tj-ui-nsfw),0.9)' : 'rgba(var(--tj-ui-muted),0.82)',
                      background: props.generateTarget === target.id
                        ? target.nsfw ? 'linear-gradient(135deg, rgb(var(--tj-ui-nsfw)), #c989a6)' : activeAccentSurface
                        : target.nsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.36)',
                      boxShadow: props.generateTarget === target.id
                        ? 'inset 0 0 0 1px rgba(255,245,200,0.42), 0 0 12px rgba(var(--tj-accent-primary),0.1)'
                        : target.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.24)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="font-serif text-sm font-bold tracking-[0.12em]">{target.label}</div>
                    <div
                      className="mt-1 overflow-hidden text-[11px] leading-relaxed opacity-72"
                      style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}
                    >
                      {target.desc}
                    </div>
                  </button>
                ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="画面草稿" className="h-full">
            <DraftCanvasPreview
              target={props.currentTarget}
              size={props.resolvedSize}
              task={props.canvasTask}
              resultSrc={props.canvasSrc}
              promptMeta={activePromptMeta}
              onRetry={() => props.onRetryTask(props.canvasTask)}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <DraftActionButton disabled={props.tokenizing} onClick={() => { void props.onBuildPrompt(); }}>
                {props.tokenizing ? '整理中' : '生成提示词'}
              </DraftActionButton>
              <DraftActionButton disabled={props.generating || props.currentTarget.nsfw === true} onClick={() => props.onGenerate(false)}>
                {props.generating ? '生成中' : '普通生成'}
              </DraftActionButton>
              {props.nsfwVisible && (
                <DraftActionButton disabled={props.generating || props.currentTarget.nsfw !== true} onClick={() => props.onGenerate(true)} tone="nsfw">
                  NSFW 生成
                </DraftActionButton>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2 md:items-stretch">
              <AnchorModeBadge promptMeta={activePromptMeta} />
              <button
                type="button"
                onClick={() => props.setPromptEditorOpen(!props.promptEditorOpen)}
                className="min-h-[42px] px-3 py-2 font-serif text-xs tracking-[0.12em]"
                style={{
                  color: props.promptEditorOpen ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.82)',
                  background: props.promptEditorOpen ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                  clipPath: smallClip,
                }}
              >
                高级提示词编辑
              </button>
            </div>
            {props.promptEditorOpen && (
              <div className="space-y-3">
                <Field label="最终 Prompt">
                  <textarea rows={7} value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="最终 Negative Prompt">
                  <textarea rows={3} value={props.negativePrompt} onChange={(e) => props.setNegativePrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
              </div>
            )}
          </Panel>
        </div>

        <div className="xl:col-span-2">
          {parameterPanel}
        </div>
      </div>
    </div>
  );
}

function DraftCanvasPreview({
  target,
  size,
  task,
  resultSrc,
  promptMeta,
  onRetry,
}: {
  target: typeof generateTargets[number];
  size: string;
  task?: 图片生成任务;
  resultSrc: string;
  promptMeta: PromptMeta | null;
  onRetry: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const displaySize = task?.dimensions ? task.dimensions.replace(/x/i, ' × ') : size ? size.replace(/x/i, ' × ') : '接口默认';
  const stateLabel = task ? statusLabel(task.status) : '草稿';
  const isRunning = task?.status === 'queued' || task?.status === 'running';
  const isFailed = task?.status === 'failed';
  const isSuccess = task?.status === 'success' && Boolean(resultSrc);
  useEffect(() => {
    setPreviewOpen(false);
  }, [resultSrc]);
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewOpen]);
  const draftGrid =
    'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.11) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-accent-primary),0.08) 1px, transparent 1px), radial-gradient(circle at 18% 12%, rgba(var(--tj-tech-cyan),0.12), transparent 32%), linear-gradient(180deg, rgba(2,3,5,0.92), rgba(7,7,8,0.98))';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="font-serif font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>当前画布</div>
        <div className="flex items-center gap-2">
          <span className="font-serif tracking-[0.12em]" style={{ color: isFailed ? 'rgba(255,170,170,0.9)' : isSuccess ? 'rgba(165,230,170,0.9)' : 'rgba(var(--tj-tech-cyan),0.82)' }}>{stateLabel}</span>
          <span className="font-mono" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>{displaySize}</span>
        </div>
      </div>
      <div
        className="relative min-h-[220px] overflow-hidden px-4 py-4 md:min-h-[260px]"
        style={{
          background: draftGrid,
          backgroundSize: '24px 24px, 24px 24px, auto, auto',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28), inset 0 0 0 2px rgba(0,0,0,0.42)',
          clipPath: cardClip,
        }}
      >
        {isSuccess && (
          <SafeAlbumImage src={resultSrc} alt={target.label} className="absolute inset-0 h-full w-full object-cover" emptyLabel="无图片" failedLabel="图片失效" />
        )}
        {isSuccess && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.58))' }} />}
        <div className="absolute left-5 top-4 border px-2.5 py-1 font-mono text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.96)', borderColor: 'rgba(var(--tj-tech-cyan),0.28)', background: 'rgba(0,0,0,0.42)' }}>
          {isSuccess ? 'SCENE SNAPSHOT / READY' : isRunning ? 'SCENE SNAPSHOT / RUNNING' : isFailed ? 'SCENE SNAPSHOT / FAILED' : 'SCENE SNAPSHOT / DRAFT'}
        </div>
        <div className="absolute right-5 top-4 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{slotLabel(target.slot)}</div>
        {promptMeta && (
          <div
            className="absolute left-5 top-12 max-w-[260px] truncate px-2.5 py-1 text-[11px]"
            style={{
              color: promptMeta.anchorMode ? 'rgba(var(--tj-tech-cyan),0.94)' : 'rgba(var(--tj-ui-muted),0.82)',
              background: 'rgba(0,0,0,0.38)',
              boxShadow: `inset 0 0 0 1px ${promptMeta.anchorMode ? 'rgba(var(--tj-tech-cyan),0.22)' : 'rgba(var(--tj-accent-primary),0.14)'}`,
              clipPath: smallClip,
            }}
          >
            {promptMeta.anchorMode ? '锚点模式' : '档案回退'} · {promptMeta.anchorSummary}
          </div>
        )}
        {!isSuccess && <svg className="absolute inset-x-6 bottom-8 top-14 h-[calc(100%-5.5rem)] w-[calc(100%-3rem)]" viewBox="0 0 680 300" preserveAspectRatio="none" aria-hidden="true">
          <rect x="48" y="58" width="580" height="168" fill="none" stroke="rgba(117,214,216,0.46)" strokeWidth="1.4" />
          <rect x="70" y="80" width="536" height="54" fill="none" stroke="rgba(245,217,122,0.18)" strokeWidth="1" />
          <path d="M86 112 C180 44, 272 68, 350 112 S520 134, 598 82" fill="none" stroke="rgba(117,214,216,0.26)" strokeWidth="1.4" />
          <ellipse cx="335" cy="246" rx="210" ry="30" fill="none" stroke="rgba(245,217,122,0.52)" strokeWidth="1.5" />
          <path d="M220 254 C222 206, 256 178, 300 178 C344 178, 374 207, 382 254" fill="none" stroke="rgba(235,223,193,0.48)" strokeWidth="2" />
          <path d="M100 256 C104 216, 128 188, 168 188 C210 188, 234 216, 244 256" fill="none" stroke="rgba(235,223,193,0.44)" strokeWidth="1.8" />
          <path d="M424 256 C428 216, 454 190, 492 190 C532 190, 560 216, 572 256" fill="none" stroke="rgba(235,223,193,0.44)" strokeWidth="1.8" />
          <circle cx="332" cy="148" r="36" fill="rgba(2,3,5,0.28)" stroke="rgba(235,223,193,0.62)" strokeWidth="2" />
          <circle cx="164" cy="160" r="36" fill="rgba(2,3,5,0.24)" stroke="rgba(235,223,193,0.56)" strokeWidth="2" />
          <circle cx="492" cy="162" r="32" fill="rgba(2,3,5,0.24)" stroke="rgba(235,223,193,0.54)" strokeWidth="2" />
          <path d="M244 234 C285 210, 326 210, 370 234 C398 248, 430 236, 456 226" fill="none" stroke="rgba(117,214,216,0.72)" strokeWidth="1.6" />
          <path d="M94 238 C156 215, 238 212, 310 230" fill="none" stroke="rgba(245,217,122,0.46)" strokeWidth="1.3" />
        </svg>}
        {isRunning && (
          <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 px-4 py-3" style={{ color: 'rgba(var(--tj-ui-body),0.9)', background: 'rgba(0,0,0,0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}>
            <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.92)' }}>正在生成画面</div>
            <div className="mt-2 h-1 overflow-hidden" style={{ background: 'rgba(var(--tj-tech-cyan),0.12)' }}>
              <div className="h-full w-2/3 animate-pulse" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.2), rgba(var(--tj-accent-primary),0.92))' }} />
            </div>
            <div className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>
              {task?.retryCount ? `已重试 ${task.retryCount} 次` : '任务已进入生成流程'}
            </div>
          </div>
        )}
        <div className="absolute bottom-4 right-4 max-w-[340px] px-3 py-2 text-[11px] leading-relaxed" style={{ color: isFailed ? 'rgba(255,205,205,0.92)' : 'rgba(var(--tj-ui-body),0.86)', background: 'rgba(0,0,0,0.62)', boxShadow: `inset 0 0 0 1px ${isFailed ? 'rgba(255,170,170,0.28)' : 'rgba(var(--tj-accent-primary),0.22)'}`, clipPath: smallClip }}>
          {isFailed ? (task?.error || '生成失败，参数已保留。') : isSuccess ? '图片已生成并加入成品库，可继续重试、改参数或前往成品库挂载。' : '生成失败时保留这个画布卡片，直接显示错误、参数和重新生成按钮，不需要重 roll 主剧情。'}
          {isFailed && (
            <button type="button" onClick={onRetry} className="mt-2 block px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>
              重新生成
            </button>
          )}
          {isSuccess && (
            <button type="button" onClick={() => setPreviewOpen(true)} className="mt-2 block px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>
              完整预览
            </button>
          )}
        </div>
        <div className="absolute bottom-4 left-4 max-w-[220px] truncate font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.76)' }}>{target.label}</div>
      </div>
      <ImagePreviewModal
        open={previewOpen && isSuccess}
        src={resultSrc}
        title={`完整预览 · ${target.label} · ${displaySize}`}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

function BaseGenerationFields(props: {
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="生成标题"><input value={props.generateTitle} onChange={(e) => props.setGenerateTitle(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} /></Field>
        <Field label="尺寸">
          <select value={props.sizePreset} onChange={(e) => props.setSizePreset(e.target.value as 'default' | '1:1' | '3:4' | '16:9' | 'custom')} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="default">跟随接口默认</option>
            <option value="1:1">头像 1:1</option>
            <option value="3:4">半身/立绘 3:4</option>
            <option value="16:9">场景 16:9</option>
            <option value="custom">自定义</option>
          </select>
        </Field>
      </div>
      {props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
    </>
  );
}

function ImagePreviewModal({ open, src, title, onClose }: { open: boolean; src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !src) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.86)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-5 top-5 z-[10001] min-h-11 px-4 py-2 font-serif text-xs tracking-[0.16em]"
        style={{
          color: 'rgb(26,19,37)',
          background: 'linear-gradient(135deg, rgb(245,217,122), rgb(196,163,90))',
          boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.48), 0 12px 36px rgba(0,0,0,0.42)',
          clipPath: smallClip,
        }}
      >
        关闭
      </button>
      <div
        className="relative flex h-[92vh] w-full max-w-6xl items-center justify-center overflow-hidden px-4 py-12"
        style={{
          background: 'linear-gradient(180deg, rgb(8,7,9), rgb(16,14,16))',
          boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.42), 0 24px 80px rgba(0,0,0,0.62)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-5 top-4 max-w-[70%] truncate font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(245,217,122,0.82)' }}>
          {title}
        </div>
        <div className="flex h-full w-full items-center justify-center overflow-auto px-2 py-2">
          <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SlotPickerModal({
  open,
  recordName,
  entryTitle,
  recommendedSlot,
  onClose,
  onSelect,
}: {
  open: boolean;
  recordName: string;
  entryTitle: string;
  recommendedSlot?: 图片槽位;
  onClose: () => void;
  onSelect: (slot: 图片槽位) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  const slots: Array<{ slot: 图片槽位; title: string; desc: string }> = [
    { slot: 'avatar_profile', title: '档案头像', desc: '用于角色档案、成品库代表图。' },
    { slot: 'avatar_story', title: '正文头像', desc: '用于剧情正文里的角色头像。' },
    { slot: 'avatar_phone', title: '手机头像', desc: '用于手机联系人、聊天头像。' },
    { slot: 'portrait', title: '角色立绘', desc: '用于角色大图与立绘展示。' },
  ];
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="设置到槽位"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl px-4 py-4"
        style={{
          background: 'linear-gradient(180deg, rgb(8,7,9), rgb(16,14,16))',
          boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.38), 0 24px 80px rgba(0,0,0,0.58)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.78)' }}>设置到槽位</div>
            <div className="mt-1 truncate font-serif text-base font-bold" style={{ color: 'rgb(255,244,212)' }}>{recordName}</div>
            <div className="mt-1 truncate text-xs" style={{ color: 'rgba(180,168,140,0.78)' }}>{entryTitle || '当前选中图片'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-3 py-2 font-serif text-xs tracking-[0.14em]"
            style={{ color: 'rgb(26,19,37)', background: 'linear-gradient(135deg, rgb(245,217,122), rgb(196,163,90))', clipPath: smallClip }}
          >
            关闭
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {slots.map((option) => {
            const recommended = option.slot === recommendedSlot || (recommendedSlot?.startsWith('avatar_') && option.slot === 'avatar_profile');
            return (
              <button
                key={option.slot}
                type="button"
                onClick={() => onSelect(option.slot)}
                className="min-h-[92px] px-4 py-3 text-left transition-all"
                style={{
                  color: recommended ? 'rgb(26,19,37)' : 'rgba(235,223,193,0.92)',
                  background: recommended ? 'linear-gradient(135deg, rgb(245,217,122), rgb(196,163,90))' : 'rgba(16,14,16,0.78)',
                  boxShadow: recommended ? 'inset 0 0 0 1px rgba(255,245,200,0.5), 0 0 18px rgba(245,217,122,0.12)' : 'inset 0 0 0 1px rgba(245,217,122,0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif text-sm font-bold tracking-[0.14em]">{option.title}</span>
                  {recommended && <span className="text-[10px] tracking-[0.12em]">推荐</span>}
                </div>
                <div className="mt-2 text-xs leading-relaxed opacity-80">{option.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TravelerGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
}) {
  const isAvatar = props.targetId === 'traveler_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = [
    { id: '', title: '无要求', desc: '不附加' },
    ...props.imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
  return (
    <div className="space-y-3">
      {!isAvatar && (
        <OptionButtonGroup
          label="构图预设"
          columns="md:grid-cols-3"
          value={props.sizePreset}
          options={[
            { id: '3:4', title: '3:4', desc: '竖图比例' },
            { id: 'default', title: '默认', desc: '跟随用途' },
            { id: 'custom', title: '自定义', desc: '手动尺寸' },
          ]}
          onChange={(id) => props.setSizePreset(id as 'default' | '3:4' | 'custom')}
        />
      )}
      {!isAvatar && props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
      <OptionButtonGroup
        label="画风选择"
        columns="md:grid-cols-5"
        value={props.imageRules.当前NPCPNG画风预设ID}
        options={pngStyleOptions}
        onChange={(id) => props.onImageRulesChange({ 当前NPCPNG画风预设ID: id })}
      />
      <Field label="画师串预设">
        <select value={props.imageRules.当前NPC画师串预设ID} onChange={(e) => props.onImageRulesChange({ 当前NPC画师串预设ID: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
          <option value="">不启用</option>
          {artistPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
        </select>
      </Field>
      <Field label="额外要求">
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用主控锚点。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}

function NpcGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  companions: NPC记录[];
  tokenizerNpcId: string;
  setTokenizerNpcId: (v: string) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
}) {
  const isAvatar = props.targetId === 'npc_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = [
    { id: '', title: '无要求', desc: '不附加' },
    ...props.imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
  return (
    <div className="space-y-3">
      <Field label="选择伙伴">
        <select value={props.tokenizerNpcId} onChange={(e) => props.setTokenizerNpcId(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
          <option value="">选择伙伴</option>
          {props.companions.map((npc) => <option key={npc.id} value={npc.id}>{npc.姓名}</option>)}
        </select>
      </Field>
      {!isAvatar && (
        <OptionButtonGroup
          label="构图预设"
          columns="md:grid-cols-3"
          value={props.sizePreset}
          options={[
            { id: '3:4', title: '3:4', desc: '竖图比例' },
            { id: 'default', title: '默认', desc: '跟随用途' },
            { id: 'custom', title: '自定义', desc: '手动尺寸' },
          ]}
          onChange={(id) => props.setSizePreset(id as 'default' | '3:4' | 'custom')}
        />
      )}
      {!isAvatar && props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
      <OptionButtonGroup
        label="画风选择"
        columns="md:grid-cols-5"
        value={props.imageRules.当前NPCPNG画风预设ID}
        options={pngStyleOptions}
        onChange={(id) => props.onImageRulesChange({ 当前NPCPNG画风预设ID: id })}
      />
      <Field label="画师串预设">
        <select value={props.imageRules.当前NPC画师串预设ID} onChange={(e) => props.onImageRulesChange({ 当前NPC画师串预设ID: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
          <option value="">不启用</option>
          {artistPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
        </select>
      </Field>
      <Field label="额外要求">
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用角色锚点。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}

function AnchorModeBadge({ promptMeta }: { promptMeta: PromptMeta | null }) {
  const anchorMode = promptMeta?.anchorMode === true;
  return (
    <div
      className="min-h-[42px] px-3 py-2 text-xs leading-relaxed"
      style={{
        color: anchorMode ? 'rgba(var(--tj-tech-cyan),0.92)' : 'rgba(var(--tj-ui-muted),0.78)',
        background: anchorMode ? 'rgba(var(--tj-tech-cyan),0.06)' : 'rgba(var(--tj-ui-panel-strong),0.34)',
        boxShadow: `inset 0 0 0 1px ${anchorMode ? 'rgba(var(--tj-tech-cyan),0.2)' : 'rgba(var(--tj-accent-primary),0.12)'}`,
        clipPath: smallClip,
      }}
    >
      <span className="font-serif font-bold tracking-[0.12em]">{anchorMode ? '角色锚点优先' : '等待提示词'}</span>
      <span className="ml-2" style={{ color: 'rgba(var(--tj-ui-body),0.76)' }}>
        {promptMeta?.anchorSummary || '普通生成会先自动生成提示词；有角色锚点时优先沿用稳定外观。'}
      </span>
    </div>
  );
}

function OptionButtonGroup(props: {
  label: string;
  value: string;
  options: Array<{ id: string; title: string; desc: string }>;
  onChange: (value: string) => void;
  columns: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{props.label}</div>
      <div className={`grid gap-3 ${props.columns}`}>
        {props.options.map((option) => {
          const active = props.value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => props.onChange(option.id)}
              className="min-h-[76px] px-3 py-3 text-left transition-all"
              style={{
                color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.86)',
                background: active ? activeAccentSurface : 'rgba(0,0,0,0.34)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(255,245,200,0.48), 0 0 12px rgba(var(--tj-accent-primary),0.12)'
                  : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="font-serif text-base font-bold tracking-[0.14em]">{option.title}</div>
                <div className="mt-1 text-[11px] opacity-78">{option.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DraftActionButton({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  const isNsfw = tone === 'nsfw';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-[54px] w-full px-4 py-3 font-serif text-sm tracking-[0.16em] disabled:opacity-45"
      style={{
        color: isNsfw ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-accent-primary),0.94)',
        background: isNsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-accent-primary),0.075)',
        boxShadow: isNsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.32)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function pngStyleSourceLabel(source: PNG画风预设来源): string {
  if (source === 'novelai') return 'NAI 风格';
  if (source === 'sd_webui') return 'SD 风格';
  if (source === 'comfyui') return 'ComfyUI';
  return '通用风格';
}

function StudioHero({ imageEnabled, currentTarget }: { imageEnabled: boolean; currentTarget: typeof generateTargets[number] }) {
  return (
    <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>◆ 生成工作室</div>
        <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>图片生成</div>
        </div>
        <div className="px-3 py-2 text-xs" style={{ color: imageEnabled ? 'rgba(165,230,170,0.9)' : 'rgba(255,180,180,0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
          {imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{currentTarget.label}
        </div>
      </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>
          先确定用途、构图和提示词，再把结果送进队列。生成后的图片进入成品库，由玩家决定是否挂到角色、正文快照或手机背景。
        </p>
    </section>
  );
}

function taskStatusTone(status: 图片生成任务['status']): { color: string; background: string; border: string } {
  if (status === 'failed') return { color: 'rgba(255,180,180,0.94)', background: 'rgba(255,90,90,0.08)', border: 'rgba(255,120,120,0.3)' };
  if (status === 'success') return { color: 'rgba(165,230,170,0.94)', background: 'rgba(100,220,140,0.08)', border: 'rgba(130,230,160,0.28)' };
  if (status === 'cancelled') return { color: 'rgba(var(--tj-ui-faint),0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', border: 'rgba(var(--tj-ui-faint),0.16)' };
  return { color: 'rgba(var(--tj-accent-primary),0.94)', background: 'rgba(var(--tj-accent-primary),0.08)', border: 'rgba(var(--tj-accent-primary),0.28)' };
}

function taskPromptTitle(task: 图片生成任务): string {
  const kind = task.slot === 'scene' && task.sourcePrompt?.includes('故事快照') ? '故事快照' : slotLabel(task.slot);
  const suffix = task.status === 'failed' ? '失败任务' : task.status === 'success' ? '完成任务' : '生成任务';
  return `${kind} · ${suffix}`;
}

function displayAlbumEntryTitle(entry: 相册条目, kind?: Exclude<GenerationHistoryFilter, 'all'>): string {
  const title = entry.title.trim();
  if (title && !looksLikeRawPromptTitle(title)) return title;
  return `${historyKindLabel(kind ?? historyKind(entry))} · ${formatGenerationDate(entry.createdAt)}`;
}

function looksLikeRawPromptTitle(title: string): boolean {
  if (!title) return true;
  if (/[\u4e00-\u9fff]/.test(title)) return false;
  const lower = title.toLowerCase();
  return title.length > 18 || title.includes(',') || /cinematic|fantasy|environment|portrait|masterpiece|prompt|style|anime|illustration|photo/.test(lower);
}

function imageBackendLabel(backend?: string): string {
  return {
    openai_compatible: 'OpenAI 兼容',
    novelai: 'NovelAI',
    sd_webui: 'SD WebUI',
    comfyui: 'ComfyUI',
  }[backend || ''] ?? (backend || '未记录');
}

function generationSourceLabel(source?: string): string {
  return {
    manual: '手动生成',
    auto: '正文自动生成',
    retry: '重试生成',
    generated: '生成图片',
    upload: '本地上传',
    remote: '远程图片',
  }[source || ''] ?? (source || '未记录');
}

function formatGenerationDate(value?: number): string {
  if (!value) return '未记录';
  try {
    return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '未记录';
  }
}

function historyKind(entry: 相册条目): Exclude<GenerationHistoryFilter, 'all'> {
  const text = [entry.title, entry.note, ...(entry.tags || [])].join(' ');
  if (entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || entry.targetType === 'phone') return 'phone';
  if (/故事快照|快照|正文插图/.test(text)) return 'snapshot';
  if (entry.slot === 'scene' || entry.targetType === 'scene') return 'scene';
  return 'character';
}

function historyKindLabel(kind: Exclude<GenerationHistoryFilter, 'all'>): string {
  return {
    character: '角色',
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}

function historyKindTone(kind: Exclude<GenerationHistoryFilter, 'all'>): { color: string; background: string; border: string } {
  if (kind === 'scene') return { color: 'rgba(var(--tj-tech-cyan),0.94)', background: 'rgba(var(--tj-tech-cyan),0.075)', border: 'rgba(var(--tj-tech-cyan),0.24)' };
  if (kind === 'snapshot') return { color: 'rgba(var(--tj-accent-primary),0.94)', background: 'rgba(var(--tj-accent-primary),0.075)', border: 'rgba(var(--tj-accent-primary),0.24)' };
  if (kind === 'phone') return { color: 'rgba(180,210,255,0.94)', background: 'rgba(140,180,255,0.075)', border: 'rgba(160,200,255,0.22)' };
  return { color: 'rgba(var(--tj-ui-body),0.9)', background: 'rgba(var(--tj-ui-panel-strong),0.38)', border: 'rgba(var(--tj-accent-primary),0.14)' };
}

function QueueWorkspace({ tasks, onRetry }: { tasks: 图片生成任务[]; onRetry: (task?: 图片生成任务) => void }) {
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const stats = {
    active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    success: tasks.filter((task) => task.status === 'success').length,
    total: tasks.length,
  };

  if (!tasks.length) {
    return (
      <div className="space-y-3">
        <QueueHero stats={stats} />
        <div className="px-4 py-16 text-center" style={{ color: faintColor, background: 'rgba(var(--tj-ui-panel),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}>
          <div className="font-serif text-sm tracking-[0.24em]">暂无生成任务</div>
          <div className="mt-2 text-xs tracking-[0.08em]">开始生成图片后，排队、运行、失败和完成状态会在这里汇总。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <QueueHero stats={stats} />
      <div className="space-y-2">
        {sortedTasks.map((task) => {
          const tone = taskStatusTone(task.status);
          const isActive = task.status === 'queued' || task.status === 'running';
          return (
            <div key={task.id} className="px-4 py-3" style={{ background: cardSurface, boxShadow: `inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)${isActive ? ', inset 3px 0 0 rgba(var(--tj-tech-cyan),0.34)' : ''}`, clipPath: cardClip }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px] flex-1">
                  <div className="truncate font-serif text-sm font-bold tracking-[0.08em]" style={{ color: titleColor }}>{taskPromptTitle(task)}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
                    <span>{slotLabel(task.slot)}</span>
                    <span>·</span>
                    <span>{imageBackendLabel(task.backend)}</span>
                    {task.dimensions && <><span>·</span><span>{task.dimensions.replace(/x/i, ' × ')}</span></>}
                    {task.nsfw && <><span>·</span><span style={{ color: nsfwColor }}>NSFW</span></>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="px-3 py-1 text-xs font-serif tracking-[0.14em]" style={{ color: tone.color, background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.border}`, clipPath: smallClip }}>{statusLabel(task.status)}</span>
                  {task.status === 'failed' && (
                    <button type="button" onClick={() => onRetry(task)} className="px-3 py-1.5 font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.94)', background: 'rgba(var(--tj-accent-primary),0.075)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)', clipPath: smallClip }}>
                      重试
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3" style={{ color: mutedColor }}>
                <InfoLine label="创建" value={formatGenerationDate(task.createdAt)} />
                <InfoLine label="开始" value={formatGenerationDate(task.startedAt)} />
                <InfoLine label="结束" value={formatGenerationDate(task.finishedAt)} />
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3" style={{ color: mutedColor }}>
                <InfoLine label="来源" value={generationSourceLabel(task.source)} />
                <InfoLine label="重试" value={`${task.retryCount} 次`} />
                <InfoLine label="锚点" value={task.anchorMode ? (task.anchorSummary || '已附加') : '未附加'} />
              </div>

              {task.error && (
                <div className="mt-3 px-3 py-2 text-xs leading-relaxed" style={{ color: 'rgba(255,190,190,0.92)', background: 'rgba(255,80,80,0.065)', boxShadow: 'inset 0 0 0 1px rgba(255,120,120,0.18)', clipPath: smallClip }}>
                  {task.error}
                </div>
              )}

              {(task.prompt || task.negativePrompt || task.sourcePrompt || task.finalPrompt || task.finalNegativePrompt) && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer select-none font-serif text-xs tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>查看提示词</summary>
                  <div className="mt-2 grid gap-2 text-xs leading-relaxed">
                    {task.finalPrompt && <PromptBlock title="最终正向" text={task.finalPrompt} />}
                    {task.prompt && <PromptBlock title="基础正向" text={task.prompt} />}
                    {task.finalNegativePrompt && <PromptBlock title="最终负向" text={task.finalNegativePrompt} />}
                    {task.negativePrompt && <PromptBlock title="基础负向" text={task.negativePrompt} />}
                    {task.sourcePrompt && <PromptBlock title="来源草稿" text={task.sourcePrompt} />}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueHero({ stats }: { stats: { active: number; failed: number; success: number; total: number } }) {
  return (
    <section className="px-4 py-4" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.36), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.34)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>◆ 生成队列</div>
          <div className="mt-1 font-serif text-xl font-bold tracking-[0.18em]" style={{ color: titleColor }}>任务调度</div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['进行中', stats.active],
            ['失败', stats.failed],
            ['完成', stats.success],
            ['总数', stats.total],
          ].map(([label, value]) => (
            <div key={label} className="min-w-[68px] px-3 py-2" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
              <div className="font-serif text-base font-bold" style={{ color: label === '失败' ? 'rgba(255,180,180,0.94)' : label === '进行中' ? 'rgba(var(--tj-accent-primary),0.94)' : titleColor }}>{value}</div>
              <div className="mt-0.5 text-[10px] tracking-[0.14em]" style={{ color: faintColor }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-3 py-2" style={{ color: 'rgba(var(--tj-ui-body),0.82)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)', clipPath: smallClip }}>
      <div className="mb-1 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{title}</div>
      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words pr-1">{text}</div>
    </div>
  );
}

function HistoryWorkspace({ album, assetMap, onSelect }: { album: 相册系统; assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<GenerationHistoryFilter>('all');
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
  const generatedEntries = album.entries
    .map((entry) => ({ entry, asset: assetMap.get(entry.assetId), kind: historyKind(entry) }))
    .filter((item) => item.asset)
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt);
  const visibleEntries = filter === 'all' ? generatedEntries : generatedEntries.filter((item) => item.kind === filter);
  const filters: Array<{ id: GenerationHistoryFilter; title: string; count: number }> = [
    { id: 'all', title: '全部', count: generatedEntries.length },
    { id: 'character', title: '角色', count: generatedEntries.filter((item) => item.kind === 'character').length },
    { id: 'scene', title: '场景图', count: generatedEntries.filter((item) => item.kind === 'scene').length },
    { id: 'snapshot', title: '故事快照', count: generatedEntries.filter((item) => item.kind === 'snapshot').length },
    { id: 'phone', title: '手机背景', count: generatedEntries.filter((item) => item.kind === 'phone').length },
  ];

  if (!generatedEntries.length) {
    return (
      <div className="space-y-3">
        <HistoryHero filters={filters} filter={filter} setFilter={setFilter} visibleCount={0} totalCount={0} />
        <div className="px-4 py-16 text-center" style={{ color: faintColor, background: 'rgba(var(--tj-ui-panel),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}>
          <div className="font-serif text-sm tracking-[0.24em]">暂无图片历史</div>
          <div className="mt-2 text-xs tracking-[0.08em]">生成完成并写入相册后，会在这里按时间展示。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <HistoryHero filters={filters} filter={filter} setFilter={setFilter} visibleCount={visibleEntries.length} totalCount={generatedEntries.length} />
      {!visibleEntries.length ? (
        <div className="px-4 py-14 text-center" style={{ color: faintColor, background: 'rgba(var(--tj-ui-panel),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: cardClip }}>
          <div className="font-serif text-sm tracking-[0.2em]">当前筛选下暂无图片</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleEntries.map(({ entry, asset, kind }) => {
            const src = asset?.dataUrl || asset?.url || asset?.localRef || '';
            const tone = historyKindTone(kind);
            const title = displayAlbumEntryTitle(entry, kind);
            return (
              <article key={entry.id} className="overflow-hidden" style={{ background: cardSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: cardClip }}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry.id);
                    if (src) setPreview({ src, title });
                  }}
                  className="block w-full cursor-pointer text-left"
                >
                  <div className="aspect-[4/3] overflow-hidden" style={{ background: imageWellSurface }}>
                    <SafeAlbumImage src={src} alt={title} className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]" emptyLabel="无图片" failedLabel="图片失效" />
                  </div>
                </button>
                <div className="space-y-3 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-sm font-bold tracking-[0.08em]" style={{ color: titleColor }}>{title}</div>
                      <div className="mt-1 text-[11px]" style={{ color: faintColor }}>{slotLabel(entry.slot)} · {formatGenerationDate(entry.createdAt)}</div>
                    </div>
                    <span className="shrink-0 px-2 py-1 text-[11px] tracking-[0.1em]" style={{ color: tone.color, background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.border}`, clipPath: smallClip }}>{historyKindLabel(kind)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.nsfw && <span className="px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: nsfwColor, background: 'rgba(var(--tj-ui-nsfw),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.24)', clipPath: smallClip }}>NSFW</span>}
                    {(entry.tags || []).slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-1 text-[10px] tracking-[0.1em]" style={{ color: 'rgba(var(--tj-ui-muted),0.82)', background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.08)', clipPath: smallClip }}>{tag}</span>
                    ))}
                  </div>
                  {entry.note && <div className="line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.74)' }}>{entry.note}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => src && setPreview({ src, title })} disabled={!src} className="px-3 py-2 font-serif text-xs tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgba(var(--tj-accent-primary),0.92)', background: 'rgba(var(--tj-tech-cyan),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}>
                      图片预览
                    </button>
                    <button type="button" onClick={() => onSelect(entry.id)} className="px-3 py-2 font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.92)', background: 'rgba(var(--tj-accent-primary),0.06)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.2)', clipPath: smallClip }}>
                      定位条目
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ImagePreviewModal
        open={Boolean(preview?.src)}
        src={preview?.src || ''}
        title={`图片预览 · ${preview?.title || ''}`}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function HistoryHero({
  filters,
  filter,
  setFilter,
  visibleCount,
  totalCount,
}: {
  filters: Array<{ id: GenerationHistoryFilter; title: string; count: number }>;
  filter: GenerationHistoryFilter;
  setFilter: (filter: GenerationHistoryFilter) => void;
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <section className="px-4 py-4" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.36), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.34)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>◆ 生成历史</div>
          <div className="mt-1 font-serif text-xl font-bold tracking-[0.18em]" style={{ color: titleColor }}>图片时间流</div>
        </div>
        <div className="text-xs tracking-[0.12em]" style={{ color: mutedColor }}>当前显示 {visibleCount} / {totalCount} 张</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className="cursor-pointer px-3 py-2 text-left transition-colors"
              style={{
                color: active ? activeTextColor : 'rgba(var(--tj-ui-body),0.82)',
                background: active ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)',
                boxShadow: active ? '0 10px 24px rgba(var(--tj-accent-primary),0.13)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                clipPath: smallClip,
              }}
            >
              <span className="font-serif text-xs tracking-[0.14em]">{item.title}</span>
              <span className="ml-2 text-[11px] opacity-75">{item.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type SceneCreationWorkspaceProps = {
  imageEnabled: boolean;
  currentTarget: typeof generateTargets[number];
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  resolvedSize: string;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  onGenerate: (nsfw?: boolean) => void;
  generating: boolean;
  sceneText: string;
  setSceneText: (v: string) => void;
  onBuildPrompt: () => void | Promise<void>;
  tokenizing: boolean;
  promptEditorOpen: boolean;
  setPromptEditorOpen: (v: boolean) => void;
  promptMeta: PromptMeta | null;
  canvasTask?: 图片生成任务;
  canvasSrc: string;
  onRetryTask: (task?: 图片生成任务) => void;
  sceneSummary?: SceneImageSummary | null;
  analyzing?: boolean;
  onImportCurrentBody?: () => void;
};

type StorySnapshotWorkspaceProps = SceneCreationWorkspaceProps & {
  sourceMode: StorySnapshotSource;
  setSourceMode: (value: StorySnapshotSource) => void;
  sourceText: string;
  setSourceText: (value: string) => void;
  sourceOptions: StorySnapshotSourceOption[];
  summary: StorySnapshotSummary | null;
  analyzing: boolean;
  onBuildSnapshotPrompt: () => void | Promise<void>;
};

function StorySnapshotWorkspace(props: StorySnapshotWorkspaceProps) {
  const selectedOption = props.sourceOptions.find((option) => option.id === props.sourceMode) ?? props.sourceOptions[0];
  const applySource = (option: StorySnapshotSourceOption) => {
    props.setSourceMode(option.id);
    if (option.id !== 'manual') props.setSourceText(option.text);
  };
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 故事快照"
      title="故事快照"
      description="用于正文插图、章节关键画面和剧情瞬间。会读取主控锚点与场景中提到的同行角色锚点。"
      panelTitle="快照描述"
      textareaLabel="场景说明"
      placeholder="写清地点、时间、人物站位、动作关系，以及这张图更像纯场景还是故事快照。"
      parameterTitle="快照参数"
      defaultSizeHint="故事快照默认更适合横图；如果想做竖向海报可改为自定义。"
      promptButtonLabel="生成快照提示词"
      busyLabel="解析中"
      busyWhen={props.tokenizing || props.analyzing}
      hideAdvancedPrompt
      lowerContent={(
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="快照与提示词">
            <div className="space-y-4">
              <OptionButtonGroup
                label="来源选择"
                columns="md:grid-cols-3"
                value={props.sourceMode}
                options={props.sourceOptions.map((option) => ({ id: option.id, title: option.title, desc: option.desc }))}
                onChange={(id) => {
                  const option = props.sourceOptions.find((item) => item.id === id) ?? selectedOption;
                  applySource(option);
                }}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-2">
                  <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>正文片段</div>
                  <textarea
                    rows={11}
                    value={props.sourceText}
                    onChange={(e) => {
                      props.setSourceMode('manual');
                      props.setSourceText(e.target.value);
                    }}
                    placeholder="粘贴或选择一段最近正文，用来提炼故事快照。"
                    className="kaituo-input min-h-[300px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
                    style={{ clipPath: smallClip }}
                  />
                </div>
                <div className="min-h-[300px]">
                  {props.analyzing ? (
                    <StorySnapshotParsingCard />
                  ) : props.summary ? (
                    <StorySnapshotSummaryCard summary={props.summary} prompt={props.prompt} negativePrompt={props.negativePrompt} />
                  ) : (
                    <EmptySnapshotPromptCard />
                  )}
                </div>
              </div>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="快照解析">
              {props.analyzing ? (
                <StorySnapshotParsingCard />
              ) : props.summary ? (
                <StorySnapshotParsedPanel summary={props.summary} />
              ) : (
                <EmptySnapshotAnalysisCard />
              )}
              <Field label="额外要求">
                <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </Panel>
            <Panel title="快照参数">
              <BaseGenerationFields
                generateTitle={props.generateTitle}
                setGenerateTitle={props.setGenerateTitle}
                sizePreset={props.sizePreset}
                setSizePreset={props.setSizePreset}
                customSize={props.customSize}
                setCustomSize={props.setCustomSize}
              />
              <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>故事快照默认更适合横图；如果想做竖向海报可改为自定义。</div>
              <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
            </Panel>
          </div>
        </div>
      )}
    />
  );
}

function SceneImageWorkspace(props: SceneCreationWorkspaceProps) {
  const lowerContent = (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="场景描述">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={props.onImportCurrentBody}
            disabled={!props.onImportCurrentBody}
            className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em] transition-opacity hover:opacity-90 disabled:opacity-45"
            style={{ color: 'rgba(var(--tj-accent-primary),0.92)', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)', clipPath: smallClip }}
          >
            导入当前正文
          </button>
        </div>
        <Field label="场景说明">
          <textarea rows={7} value={props.sceneText} onChange={(e) => props.setSceneText(e.target.value)} placeholder="写清地点、天气、空间结构、主体在场位置，以及这张图要传达的氛围。" className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="额外要求">
          <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      </Panel>

      <Panel title="场景解析">
        {props.analyzing ? (
          <StorySnapshotParsingCard title="正在解析场景" description="正在提取地点、主体、光线与镜头，完成后再显示解析结果。" />
        ) : props.sceneSummary ? (
          <SceneImageParsedPanel summary={props.sceneSummary} />
        ) : (
          <EmptySceneImageAnalysisCard />
        )}
      </Panel>

      <Panel title="场景参数">
        <BaseGenerationFields
          generateTitle={props.generateTitle}
          setGenerateTitle={props.setGenerateTitle}
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
        />
        <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。</div>
        <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
      </Panel>
    </div>
  );
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 场景图"
      title="场景图"
      description="用于地点、新闻配图和纯环境镜头。更强调空间、天气、光线和整体氛围。"
      panelTitle="场景描述"
      textareaLabel="场景说明"
      placeholder="写清地点、天气、空间结构、主体在场位置，以及这张图要传达的氛围。"
      parameterTitle="场景参数"
      defaultSizeHint="场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。"
      promptButtonLabel="解析场景提示词"
      busyLabel="解析中"
      busyWhen={props.analyzing}
      lowerContent={lowerContent}
    />
  );
}

function PhoneBackgroundWorkspace(props: SceneCreationWorkspaceProps) {
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 手机背景"
      title="手机背景"
      description="用于手机桌面壁纸或聊天背景。画面需要留出图标、对话气泡和系统栏的可读空间。"
      panelTitle="壁纸描述"
      textareaLabel="背景说明"
      placeholder="写清想要的氛围、地点、主色调、是否出现人物，以及需要给图标或聊天气泡留白的位置。"
      parameterTitle="壁纸参数"
      defaultSizeHint="手机背景会按壁纸用途生成，后续可继续细分桌面壁纸和聊天背景。"
    />
  );
}

function StorySnapshotSummaryCard({ summary, prompt, negativePrompt }: { summary: StorySnapshotSummary; prompt?: string; negativePrompt?: string }) {
  const rows = [
    ['标题', summary.title],
    ['人物', summary.characters.length ? summary.characters.join('、') : '未明确'],
    ['地点', summary.location],
    ['氛围', summary.atmosphere],
    ['动作', summary.action],
    ['镜头', summary.camera],
    ['避免', summary.avoid],
  ];
  return (
    <div className="space-y-2 px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
      <div className="font-serif text-sm font-bold tracking-[0.14em]" style={{ color: titleColor }}>{summary.title}</div>
      {rows.slice(1).map(([label, value]) => (
        <InfoLine key={label} label={label} value={value} />
      ))}
      {prompt?.trim() && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.16)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>最终 Prompt</div>
          <div className="max-h-32 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-body),0.78)' }}>{prompt}</div>
        </div>
      )}
      {negativePrompt?.trim() && (
        <div className="border-t pt-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.12)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>Negative</div>
          <div className="max-h-20 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{negativePrompt}</div>
        </div>
      )}
    </div>
  );
}

function StorySnapshotParsedPanel({ summary }: { summary: StorySnapshotSummary }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>快照标题</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{summary.title}</div>
      </div>
      <div className="grid gap-2">
        <SnapshotParsedField label="人物" value={summary.characters.length ? summary.characters.join('、') : '未明确'} />
        <SnapshotParsedField label="地点" value={summary.location} />
        <SnapshotParsedField label="氛围" value={summary.atmosphere} />
        <SnapshotParsedField label="动作" value={summary.action} />
        <SnapshotParsedField label="镜头" value={summary.camera} />
        <SnapshotParsedField label="避免" value={summary.avoid} />
      </div>
    </div>
  );
}

function SnapshotParsedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.09)', clipPath: smallClip }}>
      <span className="font-serif tracking-[0.12em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <span style={{ color: 'rgba(var(--tj-ui-body),0.82)' }}>{value}</span>
    </div>
  );
}

function EmptySnapshotAnalysisCard() {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>等待解析</div>
        <div className="mt-2 text-xs leading-relaxed">选择正文来源后点击「生成快照提示词」，这里会显示从正文解析出的画面要素。</div>
      </div>
    </div>
  );
}

function SceneImageParsedPanel({ summary }: { summary: SceneImageSummary }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>场景标题</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{summary.title}</div>
      </div>
      <div className="grid gap-2">
        <SnapshotParsedField label="地点" value={summary.location} />
        <SnapshotParsedField label="主体" value={summary.subject} />
        <SnapshotParsedField label="氛围" value={summary.atmosphere} />
        <SnapshotParsedField label="镜头" value={summary.camera} />
        <SnapshotParsedField label="避免" value={summary.avoid} />
      </div>
    </div>
  );
}

function EmptySceneImageAnalysisCard() {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>等待解析</div>
        <div className="mt-2 text-xs leading-relaxed">填写场景说明后点击「解析场景提示词」，这里会显示地点、主体、氛围与镜头。</div>
      </div>
    </div>
  );
}

function StorySnapshotParsingCard({ title = '正在解析正文', description = '正在提取画面要素并整理最终提示词，完成后再显示解析结果。' }: { title?: string; description?: string }) {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.72)', background: 'rgba(var(--tj-ui-panel-strong),0.3)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
      <div>
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(var(--tj-accent-primary),0.86)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.55)' }} />
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>{title}</div>
        <div className="mt-2 text-xs leading-relaxed">{description}</div>
      </div>
    </div>
  );
}

function EmptySnapshotPromptCard() {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.26)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>等待快照提示词</div>
        <div className="mt-2 text-xs leading-relaxed">选择正文来源后，点击画布下方的「生成快照提示词」。这里会展示提炼出的快照草稿和最终 Prompt。</div>
      </div>
    </div>
  );
}

function SceneCreationWorkspaceShell(props: SceneCreationWorkspaceProps & {
  eyebrow: string;
  title: string;
  description: string;
  panelTitle: string;
  textareaLabel: string;
  placeholder: string;
  parameterTitle: string;
  defaultSizeHint: string;
  beforeDescriptionPanel?: ReactNode;
  lowerContent?: ReactNode;
  promptButtonLabel?: string;
  busyLabel?: string;
  busyWhen?: boolean;
  hideAdvancedPrompt?: boolean;
}) {
  const activePromptMeta = props.canvasTask
    ? {
        anchorMode: props.canvasTask.anchorMode === true,
        anchorSummary: props.canvasTask.anchorSummary || (props.canvasTask.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
        sourcePrompt: props.canvasTask.sourcePrompt,
      }
    : props.promptMeta;
  return (
    <div className="space-y-4">
      <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>{props.eyebrow}</div>
            <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>{props.title}</div>
          </div>
          <div className="px-3 py-2 text-xs" style={{ color: props.imageEnabled ? 'rgba(165,230,170,0.9)' : 'rgba(255,180,180,0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
            {props.imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{props.currentTarget.label}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>{props.description}</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="画面草稿">
            <DraftCanvasPreview
              target={props.currentTarget}
              size={props.resolvedSize}
              task={props.canvasTask}
              resultSrc={props.canvasSrc}
              promptMeta={activePromptMeta}
              onRetry={() => props.onRetryTask(props.canvasTask)}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <DraftActionButton disabled={props.busyWhen ?? props.tokenizing} onClick={() => { void props.onBuildPrompt(); }}>
                {(props.busyWhen ?? props.tokenizing) ? props.busyLabel || '整理中' : props.promptButtonLabel || '生成提示词'}
              </DraftActionButton>
              <DraftActionButton disabled={props.generating} onClick={() => props.onGenerate(false)}>
                {props.generating ? '生成中' : '普通生成'}
              </DraftActionButton>
            </div>
            {!props.hideAdvancedPrompt && (
              <div className="grid gap-2 md:grid-cols-2 md:items-stretch">
                <AnchorModeBadge promptMeta={activePromptMeta} />
                <button
                  type="button"
                  onClick={() => props.setPromptEditorOpen(!props.promptEditorOpen)}
                  className="min-h-[42px] px-3 py-2 font-serif text-xs tracking-[0.12em]"
                  style={{
                    color: props.promptEditorOpen ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.82)',
                    background: props.promptEditorOpen ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                    clipPath: smallClip,
                  }}
                >
                  高级提示词编辑
                </button>
              </div>
            )}
            {!props.hideAdvancedPrompt && props.promptEditorOpen && (
              <div className="space-y-3">
                <Field label="最终 Prompt">
                  <textarea rows={7} value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="最终 Negative Prompt">
                  <textarea rows={3} value={props.negativePrompt} onChange={(e) => props.setNegativePrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
              </div>
            )}
          </Panel>
        </div>

      </div>

      {props.lowerContent ?? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px]">
          {props.beforeDescriptionPanel}
          <Panel title={props.panelTitle}>
            <Field label={props.textareaLabel}>
              <textarea rows={7} value={props.sceneText} onChange={(e) => props.setSceneText(e.target.value)} placeholder={props.placeholder} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="额外要求">
              <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
          </Panel>

          <Panel title={props.parameterTitle}>
            <BaseGenerationFields
              generateTitle={props.generateTitle}
              setGenerateTitle={props.setGenerateTitle}
              sizePreset={props.sizePreset}
              setSizePreset={props.setSizePreset}
              customSize={props.customSize}
              setCustomSize={props.setCustomSize}
            />
            <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{props.defaultSizeHint}</div>
            <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function RulesWorkspace({
  rules,
  onChange,
  onSave,
}: {
  rules: 文生图规则中心设置;
  onChange: (patch: Partial<文生图规则中心设置>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="规则中心">
        <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
          这里和设置里的文生图规则模板是同一份数据。当前按角色生成规则与场景生成规则维护：旅人/伙伴/NSFW 参考图走角色规则，场景图/故事快照/手机背景走场景规则。
        </div>
        <ImageRuleTemplateEditor rules={rules} onChange={onChange} />
        <div className="max-w-56">
          <Button onClick={onSave}>保存规则中心</Button>
        </div>
      </Panel>
    </div>
  );
}

function ManageWorkspace({
  traveler,
  npcs,
  onExport,
  onImport,
}: {
  traveler: 角色数据结构;
  npcs: NPC记录[];
  onExport: () => void;
  onImport: (file: File | null, target: AlbumImportTarget) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Panel title="导出相册">
        <div className="space-y-3">
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.74)' }}>
            导出会把当前相册中的图片打包为 ZIP，解压后可直接查看图片文件。
          </div>
          <Button onClick={onExport}>导出图片 ZIP</Button>
        </div>
      </Panel>
      <ImportWorkspace traveler={traveler} npcs={npcs} onImport={onImport} />
    </div>
  );
}

function ImportWorkspace({
  traveler,
  npcs,
  onImport,
}: {
  traveler: 角色数据结构;
  npcs: NPC记录[];
  onImport: (file: File | null, target: AlbumImportTarget) => void;
}) {
  const [scope, setScope] = useState<'character' | 'scene'>('character');
  const [targetKind, setTargetKind] = useState<'traveler' | 'npc' | 'scene' | 'snapshot' | 'phone'>('npc');
  const [targetId, setTargetId] = useState('traveler');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const characterOptions = [
    { id: 'traveler', title: traveler.姓名 || '旅人', desc: '导入到旅人图库' },
    ...npcs.filter((npc) => npc.阶位 === 'companion' || npc.原著角色).map((npc) => ({
      id: npc.id,
      title: npc.姓名,
      desc: npc.别名 || '伙伴角色',
    })),
  ];

  const targetLabel = scope === 'character'
    ? (targetKind === 'traveler' ? '旅人' : characterOptions.find((item) => item.id === targetId)?.title || '伙伴')
    : (targetKind === 'snapshot' ? '故事快照' : targetKind === 'scene' ? '场景图' : '手机背景');

  const openPicker = () => fileRef.current?.click();
  const handleImport = (file: File | null) => {
    if (!file) return;
    onImport(file, {
      scope,
      targetType: scope === 'character'
        ? (targetId === 'traveler' ? 'traveler' : 'npc')
        : targetKind === 'phone' ? 'phone' : 'scene',
      targetId: scope === 'character' ? targetId : undefined,
      sceneKind: scope === 'scene'
        ? (targetKind === 'snapshot' ? 'snapshot' : targetKind === 'phone' ? 'phone' : 'scene')
        : undefined,
    });
  };

  return (
    <Panel title="导入相册">
      <div className="space-y-4">
        <OptionButtonGroup
          label="导入到"
          columns="md:grid-cols-2"
          value={scope}
          options={[
            { id: 'character', title: '角色', desc: '旅人或伙伴图库' },
            { id: 'scene', title: '场景', desc: '场景图、故事快照或手机背景' },
          ]}
          onChange={(value) => {
            const nextScope = value as 'character' | 'scene';
            setScope(nextScope);
            if (nextScope === 'character') {
              setTargetKind('npc');
            } else {
              setTargetKind('scene');
            }
          }}
        />

        {scope === 'character' ? (
          <div className="space-y-2">
            <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>具体角色</div>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            >
              {characterOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>具体场景</div>
            <OptionButtonGroup
              label=""
              columns="md:grid-cols-3"
              value={targetKind}
              options={[
                { id: 'scene', title: '场景图', desc: '导入到场景库' },
                { id: 'snapshot', title: '故事快照', desc: '导入到场景库' },
                { id: 'phone', title: '手机背景', desc: '导入到场景库' },
              ]}
              onChange={(value) => setTargetKind(value as 'scene' | 'snapshot' | 'phone')}
            />
          </div>
        )}

        <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
          选择的目标会用于导入后的默认归类：当前是 {targetLabel}。
        </div>

        <Button onClick={openPicker}>选择相册文件</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => handleImport(e.target.files?.[0] ?? null)} className="hidden" />
      </div>
    </Panel>
  );
}

function GenerationSummary({ target, size }: { target: typeof generateTargets[number]; size: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <MiniInfo label="分类" value={target.targetType} />
      <MiniInfo label="槽位" value={slotLabel(target.slot)} />
      <MiniInfo label="尺寸" value={size || '接口默认'} />
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-ui-panel-strong),0.38), rgba(var(--tj-ui-panel-strong),0.38))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)', clipPath: smallClip }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.62)' }}>{label}</div>
      <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.82)' }}>{value}</div>
    </div>
  );
}

function Panel({ title, children, className = '', contentClassName = 'space-y-3' }: { title: string; children: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <div className={`flex flex-col gap-3 px-3 py-3 ${className}`} style={{ background: panelSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.68), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.36)', clipPath: cardClip }}>
      <div className="shrink-0 font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>{title}</div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{label}</div>{children}</label>;
}

function Button({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="w-full px-3 py-2 text-xs font-serif tracking-[0.16em] disabled:opacity-45" style={{ color: tone === 'nsfw' ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-accent-primary),0.9)', background: tone === 'nsfw' ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-accent-primary),0.055)', boxShadow: tone === 'nsfw' ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.3)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)', clipPath: smallClip }}>{children}</button>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2"><span style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{label}</span><span className="truncate">{value}</span></div>;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border border-transparent"
      style={{ borderTopColor: 'rgba(var(--tj-accent-primary),0.88)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.7)' }}
    />
  );
}

interface CharacterLibraryEntry {
  entry: 相册条目;
  src: string;
  sourceLabel?: string;
}

interface SceneLibraryEntry {
  entry: 相册条目;
  src: string;
  kind: Exclude<SceneLibraryFilter, 'all'>;
  label: string;
}

interface MountedImageSlot {
  key: string;
  label: string;
  src?: string;
  nsfw?: boolean;
}

type CharacterLibraryRecord = TravelerLibraryRecord | NpcLibraryRecord;

interface BaseCharacterLibraryRecord {
  id: string;
  kind: 'traveler' | 'npc';
  name: string;
  alias?: string;
  avatar?: string;
  entries: CharacterLibraryEntry[];
  slots: MountedImageSlot[];
  imageCount: number;
  resourceCount: number;
  mountedCount: number;
}

interface TravelerLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'traveler';
  traveler: 角色数据结构;
}

interface NpcLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'npc';
  npc: NPC记录;
}

function buildCharacterLibraryRecords(
  traveler: 角色数据结构,
  npcs: NPC记录[],
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryRecord[] {
  const travelerRecord = buildTravelerLibraryRecord(traveler, album, assetMap);
  const npcRecords = npcs
    .filter((npc) => npc.阶位 === 'companion' || npc.原著角色)
    .map((npc): NpcLibraryRecord => {
      const slots = [
        { key: 'avatar-profile', label: '档案头像', src: 读取NPC头像(npc, '档案') },
        { key: 'avatar-story', label: '正文头像', src: 读取NPC头像(npc, '正文') },
        { key: 'avatar-phone', label: '手机头像', src: 读取NPC头像(npc, '手机') },
        { key: 'portrait', label: '角色立绘', src: npc.图像档案?.立绘 },
      ];
      const albumEntries = album.entries
        .filter((entry) => {
          if (entry.nsfw && !includeNsfw) return false;
          if (!isCharacterLibrarySlot(entry.slot)) return false;
          if (entry.targetId === npc.id) return true;
          if (entry.targetType !== 'npc') return false;
          return entry.title.includes(npc.姓名) || Boolean(npc.别名 && entry.title.includes(npc.别名));
        })
        .map((entry) => ({
          entry,
          src: assetMap.get(entry.assetId)?.dataUrl || assetMap.get(entry.assetId)?.url || assetMap.get(entry.assetId)?.localRef || '',
        }));
      const builtinEntries = buildBuiltinAvatarEntries(npc);
      const entries = [...builtinEntries, ...albumEntries];
      const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
      const resourceCount = entries.length;
      return {
        id: npc.id,
        kind: 'npc',
        name: npc.姓名,
        alias: npc.别名,
        avatar: 读取NPC头像(npc, '档案'),
        npc,
        entries,
        slots,
        imageCount: resourceCount + mountedCount,
        resourceCount,
        mountedCount,
      };
    })
    .sort((a, b) => b.imageCount - a.imageCount || a.npc.姓名.localeCompare(b.npc.姓名, 'zh-Hans-CN'));
  return [travelerRecord, ...npcRecords];
}

function buildTravelerLibraryRecord(
  traveler: 角色数据结构,
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
): TravelerLibraryRecord {
  const travelerId = 'traveler';
  const slots: MountedImageSlot[] = [
    { key: 'traveler-avatar-profile', label: '档案头像', src: traveler.图像档案?.头像 || traveler.头像 || undefined },
    { key: 'traveler-avatar-story', label: '正文头像', src: traveler.图像档案?.正文头像 },
    { key: 'traveler-avatar-phone', label: '手机头像', src: traveler.图像档案?.手机头像 },
    { key: 'traveler-portrait', label: '角色立绘', src: traveler.图像档案?.立绘 },
  ];
  const entries = album.entries
    .filter((entry) => {
      if (entry.nsfw) return false;
      if (!isCharacterLibrarySlot(entry.slot)) return false;
      if (entry.targetType === 'traveler') return true;
      if (entry.targetType !== 'npc' && entry.targetType !== 'misc') return false;
      return entry.title.includes(traveler.姓名 || '旅人') || entry.title.includes('旅人');
    })
    .map((entry) => ({
      entry,
      src: assetMap.get(entry.assetId)?.dataUrl || assetMap.get(entry.assetId)?.url || assetMap.get(entry.assetId)?.localRef || '',
    }));
  const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
  const resourceCount = entries.length;
  return {
    id: travelerId,
    kind: 'traveler',
    name: traveler.姓名 || '旅人',
    alias: traveler.别名,
    avatar: traveler.图像档案?.头像 || traveler.头像 || undefined,
    traveler,
    entries,
    slots,
    imageCount: resourceCount + mountedCount,
    resourceCount,
    mountedCount,
  };
}

function buildAlbumResourceEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryEntry[] {
  return album.entries
    .filter((entry) => {
      if (!includeNsfw && entry.nsfw) return false;
      return (entry.targetType === 'traveler' || entry.targetType === 'npc') && isCharacterLibrarySlot(entry.slot);
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => ({
      entry,
      src: assetMap.get(entry.assetId)?.dataUrl || assetMap.get(entry.assetId)?.url || assetMap.get(entry.assetId)?.localRef || '',
    }));
}

function buildReferenceLibraryEntries(
  record: CharacterLibraryRecord | null,
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
): CharacterLibraryEntry[] {
  if (!record) return [];
  return album.entries
    .filter((entry) => {
      if (entry.slot !== 'reference_image') return false;
      if (record.kind === 'traveler') return entry.targetType === 'traveler' || entry.targetId === 'traveler';
      return entry.targetType === 'npc' && entry.targetId === record.id;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => ({
      entry,
      src: assetMap.get(entry.assetId)?.dataUrl || assetMap.get(entry.assetId)?.url || assetMap.get(entry.assetId)?.localRef || '',
    }));
}

function buildSceneLibraryEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
): SceneLibraryEntry[] {
  return album.entries
    .map((entry) => {
      const kind = classifySceneLibraryEntry(entry);
      if (!kind) return null;
      return {
        entry,
        src: assetMap.get(entry.assetId)?.dataUrl || assetMap.get(entry.assetId)?.url || assetMap.get(entry.assetId)?.localRef || '',
        kind,
        label: sceneLibraryKindLabel(kind),
      };
    })
    .filter((item): item is SceneLibraryEntry => Boolean(item))
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt);
}

function classifySceneLibraryEntry(entry: 相册条目): Exclude<SceneLibraryFilter, 'all'> | null {
  const tags = new Set((entry.tags ?? []).map((tag) => tag.trim()).filter(Boolean));
  const note = (entry.note ?? '').trim();
  const title = entry.title.trim();
  const kindHint = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (/故事快照|快照|正文插图/.test(kindHint)) return 'snapshot';
  const text = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (tags.has('故事快照') || entry.targetType === 'scene' && /快照|正文插图|剧情瞬间/.test(text)) return 'snapshot';
  if (entry.targetType === 'phone' || entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || tags.has('手机背景') || /手机背景|壁纸/.test(text)) return 'phone';
  if (entry.targetType === 'scene' || entry.slot === 'scene' || tags.has('场景图') || /场景图/.test(text)) return 'scene';
  return null;
}

function sceneLibraryKindLabel(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}

function sceneLibraryFilterLabel(filter: SceneLibraryFilter): string {
  return {
    all: '全部资源',
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[filter];
}

function sceneLibraryKindColor(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.88)',
    snapshot: 'rgba(var(--tj-accent-primary),0.88)',
    phone: 'rgba(180,210,255,0.9)',
  }[kind];
}

function sceneLibraryKindSurface(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.08)',
    snapshot: 'rgba(var(--tj-accent-primary),0.08)',
    phone: 'rgba(180,210,255,0.08)',
  }[kind];
}

function sceneLibraryKindBorder(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.18)',
    snapshot: 'rgba(var(--tj-accent-primary),0.18)',
    phone: 'rgba(180,210,255,0.18)',
  }[kind];
}

function formatAlbumDate(createdAt: number): string {
  if (!createdAt) return '未知时间';
  try {
    return new Date(createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return '未知时间';
  }
}

function defaultAlbumEntryTags(target: typeof generateTargets[number]): string[] {
  if (target.id === 'scene') return ['场景图'];
  if (target.id === 'phone_wallpaper') return ['手机背景'];
  if (target.targetType === 'traveler' || target.targetType === 'npc') return [slotLabel(target.slot)];
  return [];
}

function defaultAlbumEntryNote(target: typeof generateTargets[number]): string | undefined {
  if (target.id === 'scene') return '场景图';
  if (target.id === 'phone_wallpaper') return '手机背景';
  return undefined;
}

function isCharacterLibrarySlot(slot: 图片槽位): boolean {
  return slot === 'avatar_profile' || slot === 'avatar_story' || slot === 'avatar_phone' || slot === 'portrait';
}

function isReferenceLibrarySlot(slot: 图片槽位): boolean {
  return slot === 'reference_image';
}

function backendLabel(backend: 文生图API配置['backend'] | string): string {
  return {
    openai_compatible: 'OpenAI 兼容',
    novelai: 'NovelAI',
    sd_webui: 'SD WebUI',
    comfyui: 'ComfyUI',
  }[backend] ?? String(backend || '未选择');
}

function referenceBackendSupport(backend: 文生图API配置['backend'], settings: 文生图参考图设置): { usable: boolean; message: string } {
  if (!settings.enabled) return { usable: false, message: '参考图总开关关闭：素材只保存，不参与任何生成。' };
  if (backend === 'sd_webui') return { usable: true, message: '当前后端可用：生成时会改走 SD WebUI img2img。' };
  if (backend === 'comfyui') {
    return settings.enableComfyWorkflowReference
      ? { usable: true, message: '当前后端需工作流配合：工作流必须包含参考图占位符。' }
      : { usable: false, message: 'ComfyUI 参考图未启用：请确认工作流后再开启。' };
  }
  if (backend === 'openai_compatible') return { usable: false, message: 'OpenAI 兼容图片接口差异较大，当前不会自动传参考图。' };
  if (backend === 'novelai') return { usable: false, message: 'NovelAI 参考图参数暂未接入，当前不会自动传参考图。' };
  return { usable: false, message: '当前后端未声明参考图能力。' };
}

function buildScopedCharacterGalleryEntries(record: CharacterLibraryRecord | null, resourceEntries: CharacterLibraryEntry[]): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = resourceEntries.filter((item) => {
    if (item.entry.targetId === record.id) return true;
    if (record.kind === 'traveler') return item.entry.targetType === 'traveler';
    return item.entry.targetType === 'npc' && item.entry.targetId === record.id;
  });
  const merged = [...record.entries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}

function buildVisibleCharacterEntries(
  record: CharacterLibraryRecord | null,
  resourceEntries: CharacterLibraryEntry[],
): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = buildScopedCharacterGalleryEntries(record, resourceEntries);
  const recordEntries = record.entries.filter((item) => isCharacterLibrarySlot(item.entry.slot) || item.entry.targetId === record.id);
  const builtin = record.kind === 'npc' ? buildBuiltinAvatarEntries(record.npc) : buildTravelerBuiltinAvatarEntries(record.traveler);
  const merged = [...builtin, ...recordEntries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}

function isNpcLibraryRecord(record: CharacterLibraryRecord | null | undefined): record is NpcLibraryRecord {
  return record?.kind === 'npc';
}

function buildBuiltinAvatarEntries(npc: NPC记录): CharacterLibraryEntry[] {
  const canonical = findNpcCanonicalName(npc);
  const set = getBuiltinAvatarSet(canonical);
  if (!set) return [];
  return set.candidates.map((candidate): CharacterLibraryEntry => ({
    entry: {
      id: `builtin-avatar:${npc.id}:${candidate.id}`,
      assetId: candidate.id,
      title: candidate.title,
      targetType: 'npc',
      targetId: npc.id,
      slot: 'avatar_profile',
      tags: ['内置头像', set.canonicalName],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
    },
    src: candidate.src,
    sourceLabel: '内置',
  }));
}

function buildTravelerBuiltinAvatarEntries(traveler: 角色数据结构): CharacterLibraryEntry[] {
  const avatar = traveler.图像档案?.头像 || traveler.头像 || '';
  if (!avatar) return [];
  return [{
    entry: {
      id: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      assetId: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      title: `${traveler.姓名 || '旅人'}·档案头像`,
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
      tags: ['内置头像', traveler.姓名 || '旅人'],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
    },
    src: avatar,
    sourceLabel: '内置',
  }];
}

function findNpcCanonicalName(npc: NPC记录): string | undefined {
  const names = [npc.姓名, npc.别名]
    .flatMap((item) => (item ?? '').split(/[\/／|、,，]/))
    .map((item) => item.trim())
    .filter(Boolean);
  for (const name of names) {
    const canonical = matchCanonical(name);
    if (canonical) return canonical.name;
  }
  return undefined;
}

function mapImageSlotToNpcAvatarSlot(slot: 图片槽位): NPC头像槽位 {
  if (slot === 'avatar_story') return '正文';
  if (slot === 'avatar_phone') return '手机';
  return '档案';
}

function mapImageSlotToTravelerSlot(slot: 图片槽位): '头像' | '正文头像' | '手机头像' | '立绘' {
  if (slot === 'avatar_story') return '正文头像';
  if (slot === 'avatar_phone') return '手机头像';
  if (slot === 'portrait') return '立绘';
  return '头像';
}

function mapMountedSlotToNpcAvatarSlot(key: string): NPC头像槽位 {
  if (key === 'avatar-story') return '正文';
  if (key === 'avatar-phone') return '手机';
  return '档案';
}

function mapMountedSlotToTravelerSlot(key: string): '头像' | '正文头像' | '手机头像' | '立绘' {
  if (key === 'traveler-avatar-story') return '正文头像';
  if (key === 'traveler-avatar-phone') return '手机头像';
  if (key === 'traveler-portrait') return '立绘';
  return '头像';
}

function buildPresentSceneNpcs(npcs: NPC记录[], sceneText: string): NPC记录[] {
  const text = sceneText.trim();
  return npcs
    .map((npc) => ({
      npc,
      score: (text && (text.includes(npc.姓名) || Boolean(npc.别名 && text.includes(npc.别名))) ? 100 : 0) + (npc.同行 ? 80 : 0) + (npc.图像档案?.角色锚点?.正面提示词 ? 20 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.npc.最近回合 - a.npc.最近回合)
    .map((item) => item.npc)
    .slice(0, 4);
}

function buildStorySnapshotSourceOptions(history: 聊天消息[]): StorySnapshotSourceOption[] {
  const assistantMessages = history.filter((message) => message.role === 'assistant' && message.content.trim());
  const latest = assistantMessages[assistantMessages.length - 1]?.content.trim() ?? '';
  const previous = assistantMessages[assistantMessages.length - 2]?.content.trim() ?? latest;
  return [
    { id: 'latest_assistant', title: '最近正文', desc: latest ? '上一条回复' : '暂无正文', text: trimSnapshotSource(latest) },
    { id: 'previous_turn', title: '上一回合', desc: previous && previous !== latest ? '再前一条' : '可回退', text: trimSnapshotSource(previous) },
    { id: 'manual', title: '手动片段', desc: '自行粘贴', text: '' },
  ];
}

function characterAnchorHasPersistentContent(anchor?: NPC角色锚点档案): boolean {
  if (!anchor) return false;
  return Boolean(
    anchor.名称?.trim() ||
    anchor.正面提示词?.trim() ||
    anchor.负面提示词?.trim() ||
    Object.values(anchor.结构化特征 ?? {}).some((list) => Array.isArray(list) && list.some((item) => String(item ?? '').trim())),
  );
}

function trimSnapshotSource(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<变量事实>[\s\S]*?<\/变量事实>/g, '')
    .replace(/<变量更新>[\s\S]*?<\/变量更新>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1800);
}

function extractStorySnapshot(text: string, traveler: 角色数据结构, npcs: NPC记录[]): StorySnapshotSummary {
  const source = trimSnapshotSource(text);
  const compact = source.replace(/\s+/g, ' ').trim();
  const names = [traveler.姓名 || '旅人', ...npcs.map((npc) => npc.姓名), ...npcs.flatMap((npc) => npc.别名 ? [npc.别名] : [])]
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  const characters = names.filter((name) => compact.includes(name)).slice(0, 5);
  const locationMatch = compact.match(/(?:在|于|来到|抵达|走进|进入)([^，。！？；]{2,18}(?:车厢|房间|大厅|街道|广场|港口|空间站|列车|仙舟|实验室|走廊|庭院|舱室|店|馆|城|镇|星球|裂界))/);
  const location = locationMatch?.[1]?.trim() || '当前剧情发生地点';
  const actionSentence = pickSentence(compact, ['走', '看', '握', '站', '坐', '伸', '转', '推', '接', '递', '笑', '沉默', '望', '靠近', '离开']) || compact.slice(0, 80) || '角色在当前情境中形成一个可视化瞬间';
  const atmosphere = inferSnapshotAtmosphere(compact);
  const title = buildSnapshotTitle(location, actionSentence);
  return {
    title,
    characters,
    location,
    atmosphere,
    action: actionSentence,
    camera: characters.length >= 2 ? '中景，保留人物站位关系与环境线索' : '中远景，先交代环境，再突出主体动作',
    avoid: '避免无关角色、现代摄影棚感、过度拥挤构图、与正文矛盾的服装或地点',
  };
}

function pickSentence(text: string, keywords: string[]): string {
  const sentences = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  return sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword))) || sentences[0] || '';
}

function inferSnapshotAtmosphere(text: string): string {
  if (/紧张|警惕|危险|压迫|战斗|爆炸|追逐|枪|刃|血/.test(text)) return '紧张、压迫、带有行动前后的张力';
  if (/温暖|笑|点心|午后|柔和|安静|闲聊|放松/.test(text)) return '温暖、安静、日常感';
  if (/雨|夜|霓虹|阴影|沉默|低声|秘密/.test(text)) return '低调、潮湿、带一点悬疑感';
  if (/实验|数据|屏幕|机械|空间站|装置/.test(text)) return '冷光、科技感、理性而克制';
  return '贴合正文情绪，保留剧情现场感';
}

function buildSnapshotTitle(location: string, action: string): string {
  const subject = location.replace(/^当前剧情发生/, '').slice(0, 10) || '故事瞬间';
  const actionHint = action.replace(/[“”"']/g, '').slice(0, 12);
  return `${subject}${actionHint ? ` · ${actionHint}` : ''}`;
}

function formatStorySnapshotSceneText(summary: StorySnapshotSummary): string {
  return [
    `画面标题：${summary.title}`,
    `出场人物：${summary.characters.length ? summary.characters.join('、') : '按正文片段决定'}`,
    `地点：${summary.location}`,
    `氛围：${summary.atmosphere}`,
    `关键动作：${summary.action}`,
    `镜头构图：${summary.camera}`,
    `不要出现：${summary.avoid}`,
  ].join('\n');
}

function buildSceneSourceText(text: string, traveler: 角色数据结构, presentNpcs: NPC记录[]): string {
  const travelerAnchor = traveler.图像档案?.角色锚点;
  return [
    `场景说明：${text || '未填写'}`,
    `主控角色：${traveler.姓名 || '旅人'}`,
    traveler.外貌 ? `主控外貌：${traveler.外貌}` : '',
    travelerAnchor?.正面提示词 ? `主控锚点：${travelerAnchor.正面提示词}` : '',
    travelerAnchor?.负面提示词 ? `主控负面锚点：${travelerAnchor.负面提示词}` : '',
    presentNpcs.length ? `在场角色：${presentNpcs.map((npc) => npc.姓名).join('、')}` : '',
    ...presentNpcs.map((npc) => {
      const anchor = npc.图像档案?.角色锚点;
      return [
        `${npc.姓名}：${[npc.外貌, npc.穿着].filter(Boolean).join('，')}`,
        anchor?.正面提示词 ? `${npc.姓名}锚点：${anchor.正面提示词}` : '',
        anchor?.负面提示词 ? `${npc.姓名}负面锚点：${anchor.负面提示词}` : '',
      ].filter(Boolean).join('\n');
    }),
  ].filter(Boolean).join('\n');
}

function anchorHasUsableContent(anchor?: NPC角色锚点档案): boolean {
  if (!anchor || anchor.是否启用 === false) return false;
  if (anchor.正面提示词?.trim() || anchor.负面提示词?.trim()) return true;
  return Object.values(anchor.结构化特征 ?? {}).some((list) => Array.isArray(list) && list.some((item) => String(item ?? '').trim()));
}

function getTravelerAnchorStatus(traveler: 角色数据结构): PromptMeta {
  const anchor = traveler.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `主控锚点：${anchor?.名称 || traveler.姓名 || '旅人'}` : '未使用主控锚点，按旅人档案回退',
  };
}

function getNpcAnchorStatus(npc: NPC记录): PromptMeta {
  const anchor = npc.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `角色锚点：${anchor?.名称 || npc.姓名}` : '未使用角色锚点，按伙伴档案回退',
  };
}

function getSceneAnchorStatus(traveler: 角色数据结构, presentNpcs: NPC记录[]): PromptMeta {
  const names: string[] = [];
  const travelerAnchor = traveler.图像档案?.角色锚点;
  if (anchorHasUsableContent(travelerAnchor) && travelerAnchor?.场景生图自动注入 !== false) {
    names.push(travelerAnchor?.名称 || traveler.姓名 || '旅人');
  }
  for (const npc of presentNpcs) {
    const anchor = npc.图像档案?.角色锚点;
    if (anchorHasUsableContent(anchor) && anchor?.场景生图自动注入 !== false) names.push(anchor?.名称 || npc.姓名);
  }
  return {
    anchorMode: names.length > 0,
    anchorSummary: names.length ? `场景锚点：${names.slice(0, 4).join('、')}` : '未使用场景角色锚点',
  };
}

function buildTravelerSourceText(traveler: 角色数据结构): string {
  return [
    `姓名：${traveler.姓名 || '未命名旅人'}`,
    traveler.性别 ? `性别：${traveler.性别}` : '',
    traveler.年龄 ? `年龄：${traveler.年龄}` : '',
    traveler.身高 ? `身高：${traveler.身高}` : '',
    traveler.身份 ? `身份：${traveler.身份}` : '',
    traveler.外貌 ? `外貌：${traveler.外貌}` : '',
    traveler.性格 ? `性格：${traveler.性格}` : '',
    traveler.背景 ? `背景：${traveler.背景}` : '',
    traveler.能力?.length ? `能力：${traveler.能力.join('、')}` : '',
    traveler.主命途 ? `命途：${traveler.主命途}` : '',
    traveler.图像档案?.角色锚点?.名称 ? `主控锚点名称：${traveler.图像档案.角色锚点.名称}` : '',
    traveler.图像档案?.角色锚点?.正面提示词 ? `主控锚点：${traveler.图像档案.角色锚点.正面提示词}` : '',
    traveler.图像档案?.角色锚点?.负面提示词 ? `主控负面锚点：${traveler.图像档案.角色锚点.负面提示词}` : '',
  ].filter(Boolean).join('\n');
}

function buildNpcSourceText(npc: NPC记录): string {
  return [
    `姓名：${npc.姓名}`,
    npc.别名 ? `别名：${npc.别名}` : '',
    npc.性别 ? `性别：${npc.性别}` : '',
    npc.原著角色 ? '原著角色：是' : '',
    npc.外貌 ? `外貌：${npc.外貌}` : '',
    npc.穿着 ? `穿着：${npc.穿着}` : '',
    npc.性格 ? `性格：${npc.性格}` : '',
    npc.说话方式 ? `说话方式：${npc.说话方式}` : '',
    npc.介绍 ? `介绍：${npc.介绍}` : '',
    npc.装备摘要 ? `装备：${npc.装备摘要}` : '',
    npc.图像档案?.头像提示词 ? `头像提示词：${npc.图像档案.头像提示词}` : '',
    npc.图像档案?.立绘提示词 ? `立绘提示词：${npc.图像档案.立绘提示词}` : '',
    npc.图像档案?.角色锚点?.名称 ? `角色锚点名称：${npc.图像档案.角色锚点.名称}` : '',
    npc.图像档案?.角色锚点?.正面提示词 ? `角色锚点：${npc.图像档案.角色锚点.正面提示词}` : '',
    npc.图像档案?.角色锚点?.负面提示词 ? `角色负面锚点：${npc.图像档案.角色锚点.负面提示词}` : '',
    npc.NSFW档案?.enabled ? `NSFW档案：${JSON.stringify(npc.NSFW档案)}` : '',
  ].filter(Boolean).join('\n');
}

function createTask(input: {
  prompt: string;
  negativePrompt?: string;
  sourcePrompt?: string;
  finalPrompt?: string;
  finalNegativePrompt?: string;
  anchorMode?: boolean;
  anchorSummary?: string;
  nsfw: boolean;
  backend: string;
  slot: 图片槽位;
  targetType: 图片目标类型;
  targetId?: string;
  dimensions?: string;
  referenceImageIds?: string[];
}): 图片生成任务 {
  return {
    id: `img_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetType: input.targetType,
    targetId: input.targetId,
    slot: input.slot,
    source: 'manual',
    status: 'running',
    backend: input.backend,
    nsfw: input.nsfw,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    sourcePrompt: input.sourcePrompt,
    finalPrompt: input.finalPrompt,
    finalNegativePrompt: input.finalNegativePrompt,
    anchorMode: input.anchorMode,
    anchorSummary: input.anchorSummary,
    referenceImageIds: input.referenceImageIds ?? [],
    dimensions: input.dimensions,
    retryCount: 0,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
}

function resolveReferenceImagesForGeneration(params: {
  target: typeof generateTargets[number];
  targetId?: string;
  api: 文生图API配置;
  settings: 文生图参考图设置;
  album: 相册系统;
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>;
}): { entries: 相册条目[]; images: Array<{ id: string; src: string; role: 'character'; weight: number }> } {
  if (!params.settings.enabled) return { entries: [], images: [] };
  if (params.target.targetType !== 'traveler' && params.target.targetType !== 'npc') return { entries: [], images: [] };
  const support = referenceBackendSupport(params.api.backend, params.settings);
  if (!support.usable) return { entries: [], images: [] };
  const targetId = params.target.targetType === 'traveler' ? 'traveler' : params.targetId;
  if (!targetId) return { entries: [], images: [] };
  const entries = params.album.entries
    .filter((entry) => {
      if (!isReferenceLibrarySlot(entry.slot)) return false;
      if (params.target.targetType === 'traveler') return entry.targetType === 'traveler' || entry.targetId === 'traveler';
      return entry.targetType === 'npc' && entry.targetId === targetId;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 1);
  const images = entries
    .map((entry) => {
      const asset = params.assetMap.get(entry.assetId);
      const src = asset?.dataUrl || asset?.url || asset?.localRef || '';
      return src ? { id: entry.id, src, role: 'character' as const, weight: 1 } : null;
    })
    .filter((item): item is { id: string; src: string; role: 'character'; weight: number } => Boolean(item));
  return { entries, images };
}

function requiresCharacterTarget(target: typeof generateTargets[number]): boolean {
  return target.targetType === 'npc' || target.targetType === 'nsfw_part';
}

function resolveGenerationTargetId(target: typeof generateTargets[number], overrideTargetId: string | undefined, selectedNpcId: string): string | undefined {
  if (overrideTargetId) return overrideTargetId;
  if (target.targetType === 'traveler') return 'traveler';
  if (requiresCharacterTarget(target)) return selectedNpcId || undefined;
  return undefined;
}

function deleteAlbumEntry(album: 相册系统, entryId: string): 相册系统 {
  return cleanupAlbumAssets({
    ...album,
    entries: album.entries.filter((entry) => entry.id !== entryId),
  });
}

function cleanupAlbumAssets(album: 相册系统): 相册系统 {
  const used = new Set(album.entries.map((entry) => entry.assetId));
  return {
    ...album,
    assets: album.assets.filter((asset) => used.has(asset.id)),
  };
}

async function exportAlbum(album: 相册系统) {
  const assetMap = new Map(album.assets.map((asset) => [asset.id, asset]));
  const usedNames = new Set<string>();
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const manifest: Array<Record<string, unknown>> = [];

  for (const entry of album.entries) {
    const asset = assetMap.get(entry.assetId);
    if (!asset) {
      manifest.push({ title: entry.title, status: 'missing_asset', assetId: entry.assetId });
      continue;
    }
    const loaded = await loadAlbumAssetBytes(asset);
    if (!loaded) {
      manifest.push({ title: entry.title, status: 'unavailable', assetId: asset.id, url: asset.url || asset.originalUrl || asset.localRef });
      continue;
    }
    const fileName = uniqueZipName(
      usedNames,
      `${albumEntryFolder(entry)}/${sanitizeFileName(entry.title || entry.id)}.${loaded.ext}`,
    );
    files.push({ name: fileName, data: loaded.bytes });
    manifest.push({
      title: entry.title,
      file: fileName,
      targetType: entry.targetType,
      targetId: entry.targetId,
      slot: entry.slot,
      tags: entry.tags,
      nsfw: entry.nsfw,
      createdAt: entry.createdAt,
    });
  }

  files.push({
    name: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify({ exportedAt: new Date().toISOString(), entries: manifest }, null, 2)),
  });

  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kaituo-album-images-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importAlbum(file: File | null, target?: AlbumImportTarget): Promise<相册系统 | null> {
  if (!file) return null;
  const text = await file.text();
  const data = JSON.parse(text) as 相册系统;
  const next: 相册系统 = {
    assets: Array.isArray(data.assets) ? data.assets : [],
    entries: Array.isArray(data.entries) ? data.entries : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
  };
  return target ? applyImportTarget(next, target) : next;
}

function applyImportTarget(album: 相册系统, target: AlbumImportTarget): 相册系统 {
  const createdAt = Date.now();
  return {
    ...album,
    entries: album.entries.map((entry, index) => {
      const patch = resolveImportTargetPatch(target, entry);
      return {
        ...entry,
        ...patch,
        tags: Array.from(new Set([...(entry.tags ?? []), ...patch.tags])),
        createdAt: Number(entry.createdAt) || createdAt + index,
      };
    }),
    tasks: album.tasks,
  };
}

function resolveImportTargetPatch(target: AlbumImportTarget, entry: 相册条目): Pick<相册条目, 'targetType' | 'targetId' | 'slot' | 'tags' | 'note'> {
  if (target.scope === 'scene') {
    const sceneKind = target.sceneKind ?? (target.targetType === 'phone' ? 'phone' : 'scene');
    const isPhone = sceneKind === 'phone';
    const tag = sceneKind === 'snapshot' ? '故事快照' : isPhone ? '手机背景' : '场景图';
    return {
      targetType: isPhone ? 'phone' : 'scene',
      targetId: target.targetId,
      slot: isPhone ? 'phone_wallpaper' : 'scene',
      tags: [tag],
      note: entry.note || tag,
    };
  }
  const isTraveler = target.targetType === 'traveler';
  const slot = isCharacterLibrarySlot(entry.slot) ? entry.slot : 'avatar_profile';
  return {
    targetType: isTraveler ? 'traveler' : 'npc',
    targetId: target.targetId,
    slot,
    tags: [slotLabel(slot)],
    note: entry.note,
  };
}

async function loadAlbumAssetBytes(asset: { dataUrl?: string; url?: string; originalUrl?: string; localRef?: string; mimeType?: string }): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const src = asset.dataUrl || asset.url || asset.originalUrl || asset.localRef || '';
  if (!src) return null;
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      const header = src.slice(0, comma);
      const body = src.slice(comma + 1);
      const mime = header.match(/^data:([^;,]+)/)?.[1] || asset.mimeType || 'image/png';
      const binary = header.includes(';base64') ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return { bytes, ext: extensionFromMime(mime) };
    }
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: extensionFromMime(blob.type || asset.mimeType || 'image/png') };
  } catch {
    return null;
  }
}

function albumEntryFolder(entry: 相册条目): string {
  if (entry.targetType === 'traveler' || entry.targetType === 'npc') return 'characters';
  if (entry.targetType === 'phone') return 'phone';
  if (entry.targetType === 'scene') return 'scenes';
  if (entry.targetType === 'nsfw_part') return 'nsfw';
  return 'misc';
}

function sanitizeFileName(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
    || 'image';
}

function uniqueZipName(used: Set<string>, name: string): string {
  let candidate = name;
  let index = 2;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : '';
  while (used.has(candidate)) {
    candidate = `${base}_${index}${ext}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function extensionFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  return 'png';
}

function createZipBlob(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(nameBytes.length), u16(0), nameBytes, file.data,
    ]);
    chunks.push(local);
    central.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]));
    offset += local.length;
  }
  const centralStart = offset;
  const centralBlock = concatBytes(central);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlock.length), u32(centralStart), u16(0),
  ]);
  return new Blob([...chunks, centralBlock, end], { type: 'application/zip' });
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function slotLabel(slot: 图片槽位): string {
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
  return labels[slot] ?? slot;
}

function statusLabel(status: 图片生成任务['status']): string {
  return {
    queued: '排队中',
    running: '生成中',
    success: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status];
}

function resolveSize(preset: 'default' | '1:1' | '3:4' | '16:9' | 'custom', customSize: string, slot: 图片槽位): string {
  if (preset === 'custom') return customSize.trim() || defaultSizeForSlot(slot);
  if (preset === '1:1') return '1024x1024';
  if (preset === '3:4') return '1024x1365';
  if (preset === '16:9') return '1280x720';
  return defaultSizeForSlot(slot);
}

function defaultSizeForSlot(slot: 图片槽位): string {
  if (slot === 'portrait') return '1024x1365';
  if (slot === 'scene' || slot === 'phone_wallpaper' || slot === 'phone_chat_background') return '1280x720';
  return '1024x1024';
}
