import { useEffect, useMemo, useState } from 'react';
import { useTransition } from 'react';
import { 图片是否参考角色, 读取图片参考目标 } from '@/models/imageGeneration';
import type { 图片槽位, 图片生成任务, 图片目标类型, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { 游戏设置, 文生图规则中心设置, 文生图系统设置 } from '@/models/settings';
import type { NPC记录, NPC角色锚点档案 } from '@/models/npc';
import { getAppRoot } from '@/src/adaptations/kernel';
import { persistSettingsPlanes } from '@/src/adaptations/preferences/persistSettingsPlanes';
import {
  创建相册图片条目,
  fileToDataUrl,
  解析相册资源地址,
} from '@/utils/albumActions';
import { ImageGenerationSettingsTab } from '@/components/features/Settings/ImageGenerationSettingsTab';
import { buildNpcImagePrompt, buildSceneImagePrompt, buildTravelerImagePrompt, 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { readImageError } from '@/utils/imageGenerationRetry';

import { generateTargets, smallClip } from './album/foundation';
import type {
  AnchorSelection, GenerateOverride, GenerateTarget, PromptMeta,
  SceneImageSummary, StorySnapshotSource, StorySnapshotSummary, WorkTab,
} from './album/foundation';

import {
  buildAlbumResourceEntries, buildCharacterLibraryRecords, buildNpcSourceText, buildPresentSceneNpcs,
  buildSceneLibraryEntries, buildSceneSourceText, buildStorySnapshotSourceOptions,
  buildTravelerSourceText, CharacterAnchorWorkspace,
  CreateWorkspace, defaultAlbumEntryNote, defaultAlbumEntryTags,
  getNpcAnchorStatus, getSceneAnchorStatus, getTravelerAnchorStatus,
  isNpcLibraryRecord, NsfwVisibilityToggle,
  PhoneBackgroundWorkspace, requiresCharacterTarget,
  resolveGenerationTargetId, resolveSize, RulesWorkspace, SceneImageWorkspace,
  slotLabel, StorySnapshotWorkspace, trimSnapshotSource, WorkspaceTabs,
} from './album/workspaces';
import type { CharacterLibraryRecord } from './album/workspaces';
import { ImageLibraryWorkspace } from './album/libWorkspace';
import { ImageTaskWorkspace } from './album/taskWorkspace';
import { evaluateReferenceInjection } from './album/referenceInjection';
import { ReferenceInjectionWorkspace } from './album/referenceWorkspace';
import {
  albumOperationStageLabel,
  exportAlbumInWorker,
  importAlbumInWorker,
  type AlbumOperationProgress,
} from './album/albumArchiveWorkerClient';
import { dataUrlToBytes, sha256Bytes } from './album/albumContent';

type GenerationTargetDefinition = (typeof generateTargets)[number];

function requireGenerationTarget(id: GenerateTarget): GenerationTargetDefinition {
  const target = generateTargets.find((item) => item.id === id);
  if (!target) throw new Error(`Unknown album generation target: ${id}`);
  return target;
}

function findGenerationTarget(targetType: 图片目标类型, slot: 图片槽位): GenerationTargetDefinition {
  const target = generateTargets.find((item) => item.targetType === targetType && item.slot === slot);
  if (!target) throw new Error(`No album generation target for ${targetType}/${slot}`);
  return target;
}

interface AlbumWorkspaceProps {
  album: 相册系统;
  traveler: 角色数据结构;
  npcs: NPC记录[];
  actions: AlbumWorkspaceActions;
  gameSettings: 游戏设置;
  onGameSettingsChange: React.Dispatch<React.SetStateAction<游戏设置>>;
  imageSettings: 文生图系统设置;
  nsfwEnabled: boolean;
  nsfwImageEnabled: boolean;
  mainChatHistory?: 聊天消息[];
}

export interface AlbumWorkspaceActions {
  importReference(input: Omit<Extract<import('@/src/kernel/contract').AlbumCommand, { type: 'album.import-reference' }>, 'type' | 'createdAt'>): Promise<string>;
  setReference(entryId: string, characterId: string, enabled: boolean): Promise<void>;
  generate(input: Omit<Extract<import('@/src/kernel/contract').AlbumCommand, { type: 'album.generate' }>, 'type' | 'createdAt'>): Promise<{ entryId: string; task: 图片生成任务 }>;
  bindSlot(input: Omit<Extract<import('@/src/kernel/contract').AlbumCommand, { type: 'album.bind-slot' }>, 'type'>): Promise<void>;
  deleteEntries(entryIds: readonly string[]): Promise<void>;
  importArchive(album: 相册系统): Promise<void>;
  setCharacterAnchor(input: Omit<Extract<import('@/src/kernel/contract').AlbumCommand, { type: 'album.set-character-anchor' }>, 'type' | 'updatedAt'>): Promise<void>;
  extractCharacterAnchor(input: import('@/services/ai/characterAnchorExtract').CharacterAnchorExtractInput): Promise<NPC角色锚点档案>;
  tokenizePrompt(input: import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerInput): Promise<import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerResult | null>;
  parseScene(input: import('@/services/ai/narrativeImageParse').解析上下文): Promise<import('@/services/ai/narrativeImageParse').场景图解析结果>;
  parseStorySnapshot(input: import('@/services/ai/narrativeImageParse').解析上下文): Promise<import('@/services/ai/narrativeImageParse').故事快照解析结果>;
}

function setEntryReferenceTargets(entries: 相册条目[], entryId: string, characterId: string, enabled: boolean): 相册条目[] {
  return entries.map((entry) => {
    const targets = 读取图片参考目标(entry);
    if (entry.id !== entryId) {
      return enabled ? { ...entry, referenceTargets: targets.filter((targetId) => targetId !== characterId) } : entry;
    }
    return {
      ...entry,
      referenceTargets: enabled
        ? Array.from(new Set([...targets, characterId]))
        : targets.filter((targetId) => targetId !== characterId),
    };
  });
}

export function AlbumWorkspace({ album, traveler, npcs, actions, gameSettings, onGameSettingsChange, imageSettings, nsfwEnabled, nsfwImageEnabled, mainChatHistory = [] }: AlbumWorkspaceProps) {
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
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [tokenizing, setTokenizing] = useState(false);
  const [sceneText, setSceneText] = useState('');
  const [sceneImageText, setSceneImageText] = useState('');
  const [sceneImageSummary, setSceneImageSummary] = useState<SceneImageSummary | null>(null);
  const [sceneImageAnalyzing, setSceneImageAnalyzing] = useState(false);
  const [storySnapshotSource, setStorySnapshotSource] = useState<StorySnapshotSource>('latest_assistant');
  const [storySnapshotDraft, setStorySnapshotDraft] = useState('');
  const [storySnapshotSummary, setStorySnapshotSummary] = useState<StorySnapshotSummary | null>(null);
  const [storySnapshotAnalyzing, setStorySnapshotAnalyzing] = useState(false);
  const [libraryNpcId, setLibraryNpcId] = useState('');
  const [anchorSelection, setAnchorSelection] = useState<AnchorSelection>('traveler');
  const [anchorExtractingTarget, setAnchorExtractingTarget] = useState<AnchorSelection | null>(null);
  const [anchorBatchExtracting, setAnchorBatchExtracting] = useState(false);
  const [travelerAnchorRequirement, setTravelerAnchorRequirement] = useState('');
  const [anchorRequirement, setAnchorRequirement] = useState('');
  const [archiveProgress, setArchiveProgress] = useState<AlbumOperationProgress | null>(null);
  /** Generation progress UI only; incomplete assets never enter the formal album. */
  const [localGenerateTask, setLocalGenerateTask] = useState<图片生成任务 | null>(null);
  const [albumUpdatePending, startAlbumUpdate] = useTransition();
  const nsfwVisible = nsfwEnabled && nsfwImageEnabled;
  const albumOperationBusy = Boolean(archiveProgress) || albumUpdatePending;
  const albumOperationLabel = archiveProgress
    ? albumOperationStageLabel(archiveProgress)
    : albumUpdatePending
      ? '正在更新图库…'
      : '';

  const assetMap = useMemo(() => new Map(album.assets.map((asset) => [asset.id, asset])), [album.assets]);
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
    const selectedSource = storySnapshotSourceOptions.find((option) => option.id === storySnapshotSource);
    if (selectedSource?.text) setStorySnapshotDraft(selectedSource.text);
  }, [storySnapshotDraft, storySnapshotSource, storySnapshotSourceOptions]);
  const libraryRecords = useMemo(
    () => buildCharacterLibraryRecords(traveler, npcs, album, assetMap, nsfwVisible && showNsfw),
    [traveler, npcs, album, assetMap, nsfwVisible, showNsfw],
  );
  const activeLibraryRecord = libraryRecords.find((record) => record.id === libraryNpcId) ?? null;
  const persistGameSettingsChange = (next: 游戏设置) => {
    onGameSettingsChange(next);
    void persistSettingsPlanes(next);
  };

  const setReferenceInjectionEnabled = (enabled: boolean) => {
    persistGameSettingsChange({
      ...gameSettings,
      文生图系统: {
        ...imageSettings,
        参考图: {
          ...imageSettings.参考图,
          enabled,
        },
      },
    });
    setMessage(enabled ? '已开启参考图注入。' : '已关闭参考图注入，生成时不会读取或发送参考图。');
  };

  const setOpenAICompatibleReferenceEnabled = (enabled: boolean) => {
    persistGameSettingsChange({
      ...gameSettings,
      文生图系统: {
        ...imageSettings,
        参考图: {
          ...imageSettings.参考图,
          enableOpenAICompatibleReference: enabled,
        },
      },
    });
    setMessage(enabled
      ? '已允许 OpenAI 兼容接口发送参考图。'
      : '已关闭 OpenAI 兼容参考图发送。');
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

  const uploadReferenceImages = async (files: FileList | null, record: CharacterLibraryRecord | null) => {
    if (!files?.length || !record) return;
    const file = Array.from(files).find((item) => item.type.startsWith('image/'));
    if (!file) {
      setMessage('没有找到可导入的图片文件。');
      return;
    }
    let src: string;
    let contentHash: string;
    try {
      src = await fileToDataUrl(file);
      const decoded = dataUrlToBytes(src);
      if (!decoded) throw new Error('无法读取图片字节');
      contentHash = await sha256Bytes(decoded.bytes);
    } catch {
      setMessage('导入失败：图片未能读取或超过 12MB。');
      return;
    }

    const entryId = await actions.importReference({
      targetKind: record.kind,
      targetId: record.id,
      name: record.name,
      src,
      mimeType: file.type,
      contentHash,
    });
    setActiveEntryId(entryId);
    setMessage(`已导入并设为 ${record.name} 的参考图。`);
  };

  const setEntryReference = (entryId: string, record: CharacterLibraryRecord, enabled: boolean) => {
    void actions.setReference(entryId, record.id, enabled);
    setMessage(enabled ? `已替换为 ${record.name} 的参考图。` : `已取消 ${record.name} 的参考图。`);
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
      await persistSettingsPlanes(nextSettings);
      setMessage('规则中心已保存。');
    } catch (err) {
      setMessage(`规则中心保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currentTarget = generateTargets.find((item) => item.id === generateTarget);
  if (!currentTarget) throw new Error(`Unknown album generation target: ${generateTarget}`);
  const resolvedSize = resolveSize(sizePreset, customSize, currentTarget.slot);
  const currentCanvasTargetId = resolveGenerationTargetId(currentTarget, undefined, selectedCharacterId);
  const currentCanvasTask = useMemo(() => {
    const matchesCurrentTarget = (item: 图片生成任务) =>
      item.slot === currentTarget.slot &&
      item.targetType === currentTarget.targetType &&
      (!currentCanvasTargetId || !item.targetId || item.targetId === currentCanvasTargetId);
    // Prefer in-flight local task (progress UI) over formal album tasks.
    if (localGenerateTask && matchesCurrentTarget(localGenerateTask)) return localGenerateTask;
    const byLastTask = lastTaskId ? album.tasks.find((item) => item.id === lastTaskId) : undefined;
    if (byLastTask && matchesCurrentTarget(byLastTask)) return byLastTask;
    return album.tasks.find(matchesCurrentTarget);
  }, [album.tasks, currentTarget.slot, currentTarget.targetType, currentCanvasTargetId, lastTaskId, localGenerateTask]);
  const currentCanvasAsset = currentCanvasTask?.resultAssetId ? assetMap.get(currentCanvasTask.resultAssetId) : undefined;
  const currentCanvasSrc = 解析相册资源地址(currentCanvasAsset) || '';
  const currentCanvasEntry = currentCanvasTask?.resultAssetId ? album.entries.find((entry) => entry.assetId === currentCanvasTask.resultAssetId) : undefined;
  const currentGenerationRecord = currentTarget.targetType === 'traveler'
    ? libraryRecords.find((record) => record.kind === 'traveler') ?? null
    : libraryRecords.find((record) => record.id === selectedCharacterId) ?? null;
  const currentResultIsReference = Boolean(currentCanvasEntry && currentGenerationRecord && 图片是否参考角色(currentCanvasEntry, currentGenerationRecord.id));
  const currentReferenceStatus = evaluateReferenceInjection({
    target: currentTarget,
    targetId: currentCanvasTargetId,
    api: currentTarget.nsfw ? imageSettings.NSFW接口 : imageSettings.普通接口,
    settings: imageSettings.参考图,
    album,
  }).status;
  const nonCharacterReferenceStatus = evaluateReferenceInjection({
    target: requireGenerationTarget('scene'),
    api: imageSettings.普通接口,
    settings: imageSettings.参考图,
    album,
  }).status;

  const handleGenerate = async (_requestedNsfw = false, override?: GenerateOverride) => {
    const target = override?.target ?? currentTarget;
    const nsfw = target.nsfw === true;
    const targetSize = override?.size ?? (override?.target ? resolveSize(sizePreset, customSize, target.slot) : resolvedSize);
    let promptText = override?.prompt ?? prompt;
    let negativeText = override?.negativePrompt ?? negativePrompt;
    const titleText = override?.title ?? generateTitle;
    const resolvedTargetId = resolveGenerationTargetId(target, override?.targetId, selectedCharacterId);
    const entryTags = override?.tags ?? defaultAlbumEntryTags(target);
    const entryNote = override?.note ?? defaultAlbumEntryNote(target);
    if (requiresCharacterTarget(target) && !resolvedTargetId) {
      setMessage('请先选择角色，再生成图片。');
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
    const task: 图片生成任务 = {
      id: `ui_img_task_${Date.now()}`,
      targetType: target.targetType,
      targetId: resolvedTargetId,
      slot: target.slot,
      source: override?.source ?? 'manual',
      status: 'running',
      backend: api.backend,
      nsfw,
      prompt: promptText,
      negativePrompt: negativeText,
      sourcePrompt,
      finalPrompt: promptText,
      finalNegativePrompt: negativeText,
      anchorMode: taskAnchorMode,
      anchorSummary: taskAnchorSummary,
      dimensions: targetSize,
      referenceImageIds: [],
      retryCount: 0,
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    setLastTaskId(task.id);
    // Progress lives in component state only — formal album is written once on success
    // (mirrors kernel image.generate: no half assets / no intermediate CAS).
    setLocalGenerateTask({ ...task, status: 'running' });
    setGenerating(true);
    setMessage(override?.statusMessage || (nsfw ? '正在调用 NSFW 独立接口...' : '正在调用文生图接口...'));
    try {
      const generated = await actions.generate({
        title: titleText || target.label,
        source: override?.source ?? 'manual',
        prompt: promptText,
        negativePrompt: negativeText,
        sourcePrompt,
        finalPrompt: promptText,
        finalNegativePrompt: negativeText,
        anchorMode: taskAnchorMode,
        anchorSummary: taskAnchorSummary,
        nsfw,
        targetType: target.targetType,
        targetId: resolvedTargetId,
        slot: target.slot,
        dimensions: targetSize,
        tags: entryTags,
        note: entryNote,
      });
      setLocalGenerateTask(generated.task);
      setActiveEntryId(generated.entryId);
      setMessage('图片已生成并加入相册；当前显示图片未改变。');
    } catch (err) {
      const error = readImageError(err);
      // Failure: local UI only — formal album unchanged (no half asset).
      setLocalGenerateTask((prev) =>
        prev && prev.id === task.id
          ? { ...prev, status: 'failed', error, finishedAt: Date.now() }
          : prev,
      );
      setMessage(`生成失败：${error}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRetryTask = (target: 图片生成任务) => {
    setPrompt(target.prompt);
    setNegativePrompt(target.negativePrompt ?? '');
    setGenerateTitle('重试生成');
    setLastPromptMeta({
      anchorMode: target.anchorMode === true,
      anchorSummary: target.anchorSummary ?? '',
      sourcePrompt: target.sourcePrompt,
    });
    void handleGenerate(target.nsfw, {
      source: 'retry',
      prompt: target.prompt,
      negativePrompt: target.negativePrompt,
      title: '重试生成',
      target: findGenerationTarget(target.targetType, target.slot),
      targetId: target.targetId,
      anchorMode: target.anchorMode,
      anchorSummary: target.anchorSummary,
      sourcePrompt: target.sourcePrompt,
    });
  };

  /** Select an existing durable entry for display without mutating or deleting library history. */
  const showEntryInCharacterSlot = async (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => {
    const isBuiltinEntry = params.entryId.startsWith('builtin-avatar:');
    const currentAlbum = album;
    let entry = currentAlbum.entries.find((item) => item.id === params.entryId);
    let builtinItem: ReturnType<typeof 创建相册图片条目> | undefined;
    if (!entry && !isBuiltinEntry) return;
    const sourceLabel = isBuiltinEntry ? '原著' : '文生图';

    // Built-in choices enter the same durable entry -> explicit binding lifecycle.
    if (!entry) {
      if (!params.src.trim()) {
        setMessage('设置当前显示失败：内置图片没有可用资源。');
        return;
      }
      const builtin = 创建相册图片条目({
        assetId: params.entryId.replace('builtin-avatar:', 'builtin-asset:'),
        entryId: params.entryId,
        title: `${params.targetKind === 'traveler' ? traveler.姓名 || '旅人' : npcs.find((npc) => npc.id === params.targetId)?.姓名 || '角色'}·内置图片`,
        src: params.src,
        source: 'remote',
        targetType: params.targetKind === 'traveler' ? 'traveler' : 'npc',
        targetId: params.targetKind === 'traveler' ? 'traveler' : params.targetId,
        slot: params.slot,
        tags: ['内置图片'],
        note: '随包内置图片',
      });
      builtinItem = builtin;
      entry = builtin.entry;
    }

    if (params.targetKind === 'traveler' && params.slot.toString().startsWith('nsfw_')) {
      setMessage('旅人档案暂不支持显示 NSFW 部位图。');
      return;
    }
    if (params.slot === 'nsfw_male_genital' && !gameSettings.enableMaleNsfwArchive) {
      setMessage('男性 NSFW 档案未开启，不能显示男性器部位图。');
      return;
    }

    const albumTargetType: 图片目标类型 = params.targetKind === 'traveler'
      ? 'traveler'
      : params.slot.toString().startsWith('nsfw_')
        ? 'nsfw_part'
        : 'npc';
    const albumTargetId = params.targetId || (params.targetKind === 'traveler' ? 'traveler' : params.targetId);

    await actions.bindSlot({
      entryId: params.entryId,
      targetKind: params.targetKind,
      targetType: albumTargetType,
      targetId: albumTargetId,
      slot: params.slot,
      source: sourceLabel,
      builtin: builtinItem,
    });
    setMessage(`已设为 ${slotLabel(params.slot)} 的当前显示。`);
  };

  const deleteLibraryEntries = async (entryIds: string[]) => {
    if (albumOperationBusy) return;
    const ids = Array.from(new Set(entryIds)).filter(Boolean);
    if (!ids.length) {
      setMessage('请先选择要删除的图片。');
      return;
    }
    setMessage(`正在删除 ${ids.length} 张图片…`);
    await actions.deleteEntries(ids);
    startAlbumUpdate(() => {
      setActiveEntryId((current) => (current && ids.includes(current) ? null : current));
      setMessage(`已删除 ${ids.length} 张图片。`);
    });
  };

  const showLibraryEntryInSlot = async (params: { record: CharacterLibraryRecord | null; entryId: string; src: string; slot: 图片槽位 }) => {
    const record = params.record;
    if (!record) {
      setMessage('请先选择一个角色。');
      return;
    }
    const scopedEntries = [...record.entries, ...resourceEntries];
    const item = scopedEntries.find((entry) => entry.entry.id === params.entryId);
    // Formal album entry is enough to mount (AssetRef path). Display src may be
    // empty when Blob cache is cold; do not block bind on resolved preview URL.
    if (!item && !params.entryId.startsWith('builtin-avatar:')) {
      setMessage('请选择一张可用图片。');
      return;
    }
    const src = item?.src || params.src || '';
    if (!item && !src) {
      setMessage('请选择一张可用图片。');
      return;
    }
    await showEntryInCharacterSlot({
      targetKind: record.kind,
      targetId: record.id,
      entryId: params.entryId,
      src,
      slot: params.slot,
    });
  };

  const openCurrentResultInGallery = () => {
    if (currentCanvasEntry) setActiveEntryId(currentCanvasEntry.id);
    setActiveTab('gallery');
  };

  const setCurrentResultAsReference = () => {
    if (!currentCanvasEntry || !currentGenerationRecord) return;
    setEntryReference(currentCanvasEntry.id, currentGenerationRecord, true);
  };

  const showCurrentResultInTargetSlot = () => {
    if (!currentCanvasEntry || !currentGenerationRecord || !currentCanvasSrc) return;
    if (currentTarget.targetType !== 'traveler' && currentTarget.targetType !== 'npc') return;
    void showLibraryEntryInSlot({
      record: currentGenerationRecord,
      entryId: currentCanvasEntry.id,
      src: currentCanvasSrc,
      slot: currentTarget.slot,
    });
  };

  const saveNpcAnchor = (npcId: string, patch: NonNullable<NPC记录['图像档案']>['角色锚点']) => {
    void actions.setCharacterAnchor({ targetKind: 'npc', targetId: npcId, anchor: patch });
    invalidatePromptDraft('角色锚点已保存，当前生成草稿已清空，请重新生成。');
  };

  const deleteNpcAnchor = (npcId: string) => {
    void actions.setCharacterAnchor({ targetKind: 'npc', targetId: npcId, anchor: undefined });
    invalidatePromptDraft('角色锚点已删除，当前生成草稿已清空，请重新生成。');
  };

  const extractNpcAnchor = async (npcId: string, requirement: string) => {
    const npc = npcs.find((item) => item.id === npcId);
    if (!npc) return;
    setAnchorExtractingTarget(npcId);
    setMessage(`正在 AI 提取 ${npc.姓名} 的角色锚点...`);
    try {
      const anchor = await actions.extractCharacterAnchor({
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
    if (patch) void actions.setCharacterAnchor({ targetKind: 'traveler', anchor: patch });
    invalidatePromptDraft('主控锚点已保存，当前生成草稿已清空，请重新生成。');
  };

  const deleteTravelerAnchor = () => {
    void actions.setCharacterAnchor({ targetKind: 'traveler', anchor: undefined });
    invalidatePromptDraft('主控锚点已删除，当前生成草稿已清空，请重新生成。');
  };

  const extractTravelerAnchor = async (requirement: string) => {
    setAnchorExtractingTarget('traveler');
    setMessage('正在 AI 提取主控锚点...');
    try {
      const anchor = await actions.extractCharacterAnchor({
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
    const sceneTarget = requireGenerationTarget('scene');
    void handleGenerate(nsfw, {
      ...override,
      source: override?.source ?? (storySnapshotSource === 'manual' ? 'manual' : 'auto'),
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
      anchorSummary: target.anchorSummary ?? '',
      sourcePrompt: target.sourcePrompt,
    });
    handleGenerateStorySnapshot(target.nsfw, {
      source: 'retry',
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
    setTokenizing(true);
    try {
      const refined = await actions.tokenizePrompt({
        title: input.title,
        mode: input.mode,
        sourceText: input.sourceText,
        basePrompt: input.prompt,
        baseNegative: input.negative,
        extraRequirement,
        anchorMode: input.anchorMode,
        anchorSummary: input.anchorSummary,
      });
      if (!refined) {
        return { prompt: input.prompt, negative: input.negative };
      }
      setMessage('已通过词组转化器整理最终提示词。');
      return { ...input, prompt: refined.prompt, negative: refined.negative };
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
    if (target.targetType === 'traveler' || (target.nsfw && selectedCharacterId === 'traveler')) {
      const anchorInfo = getTravelerAnchorStatus(traveler);
      const built = buildTravelerImagePrompt({
        traveler,
        mode: target.nsfw ? 'nsfw' : target.tokenizerMode === 'portrait' ? 'portrait' : 'avatar',
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
    const npc = npcs.find((item) => item.id === selectedCharacterId);
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
    } else if (target.targetType === 'traveler' || (target.nsfw && selectedCharacterId === 'traveler')) {
      setGenerateTitle(`${traveler.姓名 || '旅人'}${target.label}`);
    } else {
      const npc = npcs.find((item) => item.id === selectedCharacterId);
      setGenerateTitle(`${npc?.姓名 || ''}${target.label}`);
    }
    setPromptEditorOpen(true);
    setMessage(`${built.anchorMode ? '已按角色锚点模式生成提示词。' : '已按角色档案模式生成提示词。'}可在高级编辑里微调。`);
  };

  const handleBuildSceneImagePrompt = async () => {
    const sourceText = sceneImageText.trim();
    if (!sourceText) {
      setMessage('请先填写场景说明。');
      return;
    }
    setSceneImageAnalyzing(true);
    setSceneImageSummary(null);
    setMessage('正在解析场景画面...');
    try {
      const presentNpcs = buildPresentSceneNpcs(npcs, sourceText);
      const anchorInfo = getSceneAnchorStatus(traveler, presentNpcs);
      const parsed = await actions.parseScene({
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
    } catch (error) {
      setMessage(`场景图解析失败：${error instanceof Error ? error.message : String(error)}`);
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
      const presentNpcs = buildPresentSceneNpcs(npcs, sourceText);
      const anchorInfo = getSceneAnchorStatus(traveler, presentNpcs);
      const parsed = await actions.parseStorySnapshot({
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
      const summary = {
        title: parsed.title,
        characters: parsed.characters,
        location: parsed.location,
        atmosphere: parsed.atmosphere,
        action: parsed.action,
        camera: parsed.camera,
        avoid: parsed.avoid,
      };
      const nextSceneText = [
        `画面标题：${summary.title}`,
        `出场人物：${summary.characters.length ? summary.characters.join('、') : '按正文片段决定'}`,
        `地点：${summary.location}`,
        `氛围：${summary.atmosphere}`,
        `关键动作：${summary.action}`,
        `镜头构图：${summary.camera}`,
        `不要出现：${summary.avoid}`,
      ].join('\n');
      setSceneText('');
      setGenerateTitle(summary.title);
      const lockedPrompt = 应用场景角色锚点锁({
        prompt: parsed.prompt,
        negative: parsed.negativePrompt,
        traveler,
        presentNpcs,
      });
      const promptRefined = 应用质量增强提示词(imageSettings.rules, lockedPrompt.prompt, lockedPrompt.negative);
      setStorySnapshotSummary(summary);
      setSceneText(nextSceneText);
      setPrompt(promptRefined.prompt);
      setNegativePrompt(promptRefined.negative);
      setLastPromptMeta({ anchorMode: anchorInfo.anchorMode, anchorSummary: anchorInfo.anchorSummary, sourcePrompt: promptRefined.prompt });
      setPromptEditorOpen(false);
      setMessage('已完成故事快照解析和提示词整理，可直接普通生成。');
    } catch (error) {
      setMessage(`故事快照解析失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStorySnapshotAnalyzing(false);
    }
  };

  const handleTargetChange = (next: GenerateTarget) => {
    setGenerateTarget(next);
    if (next === 'traveler_avatar' || next === 'npc_avatar') setSizePreset('1:1');
    if (next === 'traveler_portrait' || next === 'npc_portrait') setSizePreset((prev) => (prev === '1:1' ? '3:4' : prev));
    setGenerateTitle('');
    clearPromptDraft();
  };

  const handleManualTargetSelection = (purpose: 'avatar' | 'portrait' | 'nsfw', characterId: string) => {
    setSelectedCharacterId(characterId);
    if (purpose === 'nsfw') {
      handleTargetChange('nsfw_reference');
      return;
    }
    handleTargetChange(`${characterId === 'traveler' ? 'traveler' : 'npc'}_${purpose}` as GenerateTarget);
  };

  return (
    <div className="min-h-0 pb-3" >
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

        <section className={`min-h-0 min-w-0 pr-1 ${activeTab === 'gallery' ? 'xl:overflow-hidden' : 'overflow-y-auto'}`}>
          <main className={activeTab === 'gallery' ? 'h-full min-h-0 min-w-0' : 'min-w-0'}>
            {activeTab === 'gallery' && (
              <ImageLibraryWorkspace
                records={libraryRecords}
                album={album}
                activeRecord={activeLibraryRecord}
                activeEntryId={activeEntryId ?? undefined}
                resourceEntries={resourceEntries}
                sceneEntries={sceneLibraryEntries}
                traveler={traveler}
                onSelectRecord={(id) => {
                  setLibraryNpcId(id);
                  setActiveEntryId(null);
                }}
                onSelectEntry={setActiveEntryId}
                onDeleteEntries={deleteLibraryEntries}
                onSetSlot={showLibraryEntryInSlot}
                onUploadReference={(files, record) => void uploadReferenceImages(files, record)}
                onSetReference={setEntryReference}
                operationBusy={albumOperationBusy}
                operationLabel={albumOperationLabel}
                onExport={() => {
                  if (albumOperationBusy) return;
                  setArchiveProgress({ stage: 'hashing', completed: 0, total: album.assets.length });
                  void exportAlbumInWorker(album, (progress) => {
                    setArchiveProgress(progress);
                    setMessage(albumOperationStageLabel(progress));
                  }).then((result) => {
                    setMessage(result.warningCount > 0
                      ? `相册备份已导出；${result.warningCount} 个资源未能打包，请查看清单警告。`
                      : `相册备份已导出：${result.assetCount} 个资源，${result.entryCount} 个条目。`);
                  }).catch((err) => setMessage(`导出失败：${err instanceof Error ? err.message : String(err)}`))
                    .finally(() => setArchiveProgress(null));
                }}
                onImport={(file, target, mode) => {
                  if (albumOperationBusy) return;
                  setArchiveProgress({ stage: 'reading' });
                  void importAlbumInWorker({ file, currentAlbum: album, target, mode, onProgress: (progress) => {
                    setArchiveProgress(progress);
                    setMessage(albumOperationStageLabel(progress));
                  } }).then((result) => {
                    if (!result) return;
                    void actions.importArchive(result.album);
                    const stats = result.stats;
                    setMessage(mode === 'replace'
                      ? `相册已覆盖恢复：${stats.addedAssets} 个资源，${stats.addedEntries} 个条目。`
                      : `相册已合并：新增 ${stats.addedEntries} 项，复用 ${stats.reusedAssets} 个资源，合并 ${stats.mergedEntries} 项。`);
                  }).catch((err) => setMessage(`导入失败：${err instanceof Error ? err.message : String(err)}`))
                    .finally(() => setArchiveProgress(null));
                }}
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
                records={libraryRecords.filter(isNpcLibraryRecord)}
                activeSelection={anchorSelection}
                anchorExtractingTarget={anchorExtractingTarget}
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
            {activeTab === 'manual' && (
              <CreateWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={currentTarget}
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
                travelerName={traveler.姓名 || '主角'}
                selectedCharacterId={currentTarget.targetType === 'traveler' ? 'traveler' : selectedCharacterId}
                onSelectManualTarget={handleManualTargetSelection}
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
                onOpenGallery={openCurrentResultInGallery}
                onSetResultReference={setCurrentResultAsReference}
                onShowResultInSlot={showCurrentResultInTargetSlot}
                resultIsReference={currentResultIsReference}
                referenceStatus={currentReferenceStatus}
              />
            )}
            {activeTab === 'scene' && (
              <StorySnapshotWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={requireGenerationTarget('scene')}
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
                onOpenGallery={openCurrentResultInGallery}
                referenceStatus={nonCharacterReferenceStatus}
              />
            )}
            {activeTab === 'sceneImage' && (
              <SceneImageWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={requireGenerationTarget('scene')}
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
                onOpenGallery={openCurrentResultInGallery}
                sceneSummary={sceneImageSummary}
                analyzing={sceneImageAnalyzing}
                onImportCurrentBody={importCurrentBodyText}
                referenceStatus={nonCharacterReferenceStatus}
              />
            )}
            {activeTab === 'phone' && (
              <PhoneBackgroundWorkspace
                imageEnabled={imageSettings.enabled}
                currentTarget={requireGenerationTarget('phone_wallpaper')}
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
                onOpenGallery={openCurrentResultInGallery}
                referenceStatus={nonCharacterReferenceStatus}
              />
            )}
            {activeTab === 'reference' && (
              <ReferenceInjectionWorkspace
                settings={imageSettings.参考图}
                normalApi={imageSettings.普通接口}
                nsfwApi={imageSettings.NSFW接口}
                onEnabledChange={setReferenceInjectionEnabled}
                onOpenAICompatibleReferenceChange={setOpenAICompatibleReferenceEnabled}
              />
            )}
            {activeTab === 'rules' && (
              <RulesWorkspace
                rules={imageSettings.rules}
                onChange={patchImageRules}
                onSave={handleSaveRules}
              />
            )}
            {activeTab === 'queue' && <ImageTaskWorkspace album={album} includeNsfw={nsfwVisible && showNsfw} onSelectEntry={setActiveEntryId} onRetry={handleRetryTask} />}
            {activeTab === 'settings' && (
              <ImageGenerationSettingsTab
                settings={gameSettings}
                onChange={persistGameSettingsChange}
              />
            )}
          </main>
          {message && (
            <div className="mt-4 px-3 py-2 text-xs leading-relaxed" style={{ color: message.includes('失败') ? 'rgba(var(--tj-danger),0.9)' : 'rgba(var(--tj-ui-success),0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip }}>
              {message}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
