import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { 图片槽位, 图片生成任务, 图片目标类型, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { API设置, 游戏设置, 文生图规则中心设置, 文生图系统设置 } from '@/models/settings';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录, NPC头像槽位 } from '@/models/npc';
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
import { buildNpcImagePrompt, buildSceneImagePrompt, buildTravelerImagePrompt } from '@/utils/imagePromptRules';
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
}

type WorkTab = 'manual' | 'library' | 'anchor' | 'scene' | 'rules' | 'queue' | 'history' | 'manage';
type GenerateTarget = 'traveler_avatar' | 'traveler_portrait' | 'npc_avatar' | 'npc_portrait' | 'scene' | 'phone_wallpaper' | 'nsfw_reference';
type NsfwPartImageSlot = '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考';
type LibraryStatusFilter = 'all' | 'ready' | 'empty';

const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const panelSurface = 'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan), 0.12), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface),0.74), rgba(var(--tj-bg-primary),0.92))';
const insetSurface = 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))';
const imageWellSurface = 'linear-gradient(135deg, rgba(var(--tj-surface-strong),0.8), rgba(var(--tj-bg-primary),0.88))';
const titleColor = 'rgb(var(--tj-ui-title))';
const bodyColor = 'rgba(var(--tj-ui-body),0.94)';
const mutedColor = 'rgba(var(--tj-ui-muted),0.78)';
const faintColor = 'rgba(var(--tj-ui-faint),0.66)';
const activeTextColor = 'rgb(var(--tj-ui-active-text))';
const accentColor = 'rgb(var(--tj-accent-primary))';
const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
const activeAccentSurface = 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))';
const quietAccentSurface = 'rgba(var(--tj-accent-primary),0.055)';
const cardSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel),0.74), rgba(var(--tj-ui-panel-strong),0.68))';

const tabs: { id: WorkTab; label: string; desc: string }[] = [
  { id: 'manual', label: '手动生成', desc: '按用途生成' },
  { id: 'library', label: '资源库', desc: '查看与挂载' },
  { id: 'anchor', label: '角色锚点', desc: '稳定角色外观' },
  { id: 'scene', label: '场景壁纸', desc: '场景与手机背景' },
  { id: 'rules', label: '规则中心', desc: 'Prompt 规范' },
  { id: 'queue', label: '生成队列', desc: '状态与重试' },
  { id: 'history', label: '历史', desc: '生成记录' },
  { id: 'manage', label: '整理', desc: '导入导出' },
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

export function AlbumPanel({ album, onAlbumChange, traveler, onTravelerChange, phone, onPhoneChange, npcs, onNpcChange, apiSettings, gameSettings, onGameSettingsChange, imageSettings, nsfwEnabled, nsfwImageEnabled }: AlbumPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkTab>('library');
  const [showNsfw, setShowNsfw] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
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
  const [libraryNameFilter, setLibraryNameFilter] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<LibraryStatusFilter>('all');
  const [libraryNpcId, setLibraryNpcId] = useState('');
  const [anchorRequirement, setAnchorRequirement] = useState('');
  const nsfwVisible = nsfwEnabled && nsfwImageEnabled;

  const assetMap = useMemo(() => new Map(album.assets.map((asset) => [asset.id, asset])), [album.assets]);
  const activeEntry = album.entries.find((entry) => entry.id === activeEntryId) ?? album.entries[0] ?? null;
  const companions = npcs.filter((npc) => npc.阶位 === 'companion');
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
  const stats = useMemo(() => ({
    total: album.entries.length,
    generated: album.assets.filter((asset) => asset.source === 'generated').length,
    nsfw: album.entries.filter((entry) => entry.nsfw).length,
    failed: album.tasks.filter((task) => task.status === 'failed').length,
  }), [album]);

  const addAlbumItem = (item: ReturnType<typeof 创建相册图片条目>) => {
    onAlbumChange((prev) => 添加图片到相册(prev, item));
    setActiveEntryId(item.entry.id);
    setActiveTab('library');
    setMessage('图片已加入相册。');
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

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      addAlbumItem(创建相册图片条目({
        title: uploadTitle || file.name,
        src: dataUrl,
        source: 'upload',
        mimeType: file.type,
        targetType: 'misc',
        slot: 'misc',
      }));
      setUploadTitle('');
    } catch (err) {
      setMessage(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRemoteUrl = () => {
    const src = remoteUrl.trim();
    if (!src) {
      setMessage('请先填写图片 URL。');
      return;
    }
    addAlbumItem(创建相册图片条目({
      title: urlTitle || '远程图片',
      src,
      source: 'remote',
      targetType: 'misc',
      slot: 'misc',
    }));
    setRemoteUrl('');
    setUrlTitle('');
  };

  const currentTarget = generateTargets.find((item) => item.id === generateTarget) ?? generateTargets[0];
  const resolvedSize = resolveSize(sizePreset, customSize, currentTarget.slot);

  const handleGenerate = async (nsfw = false, override?: { prompt?: string; negativePrompt?: string; title?: string; target?: typeof currentTarget }) => {
    const target = override?.target ?? currentTarget;
    const promptText = override?.prompt ?? prompt;
    const negativeText = override?.negativePrompt ?? negativePrompt;
    const titleText = override?.title ?? generateTitle;
    if (!imageSettings.enabled) {
      setMessage('请先在设置里启用文生图。');
      return;
    }
    if (nsfw && !nsfwVisible) {
      setMessage('NSFW 生图未开启。');
      return;
    }
    const api = nsfw
      ? imageSettings.NSFW接口
      : target.sceneApi && imageSettings.useSeparateSceneApi
        ? imageSettings.场景接口
        : imageSettings.普通接口;
    const task = createTask({
      prompt: promptText,
      negativePrompt: negativeText,
      nsfw,
      backend: api.backend,
      slot: target.slot,
      targetType: target.targetType,
      dimensions: resolvedSize,
    });
    setLastTaskId(task.id);
    onAlbumChange((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
    setGenerating(true);
    setActiveTab('queue');
    setMessage(nsfw ? '正在调用 NSFW 独立接口...' : '正在调用文生图接口...');
    try {
      const result = await runImageGenerationWithRetry(
        () => generateImage(api, { prompt: promptText, negativePrompt: negativeText, nsfw, size: resolvedSize }),
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
            setMessage(total > 1 ? `正在生成图片（${attempt}/${total}）...` : '正在生成图片...');
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
        slot: target.slot,
        prompt: promptText,
        negativePrompt: negativeText,
        dimensions: resolvedSize,
        model: result.model,
        backend: result.backend,
        mimeType: result.mimeType,
      });
      onAlbumChange((prev) => ({
        ...添加图片到相册(prev, item),
        tasks: prev.tasks.map((old) => old.id === task.id ? { ...old, status: 'success', resultAssetId: item.asset.id, finishedAt: Date.now() } : old),
      }));
      setActiveEntryId(item.entry.id);
      setActiveTab('library');
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
    void handleGenerate(target.nsfw, { prompt: target.prompt, negativePrompt: target.negativePrompt, title: '重试生成' });
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
    setMessage('角色锚点已保存。');
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
    setMessage('角色锚点已删除。');
  };

  const extractNpcAnchor = (npcId: string, requirement: string) => {
    const npc = npcs.find((item) => item.id === npcId);
    if (!npc) return;
    const positive = [
      npc.性别 ? `${npc.性别}` : '',
      npc.外貌,
      npc.穿着,
      npc.装备摘要,
      npc.图像档案?.头像提示词,
      npc.图像档案?.立绘提示词,
      requirement ? `extra focus: ${requirement}` : '',
    ].filter(Boolean).join(', ');
    const tagsFrom = (text?: string) => (text ?? '')
      .split(/[，,、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    saveNpcAnchor(npcId, {
      名称: npc.姓名,
      是否启用: true,
      生成时默认附加: true,
      场景生图自动注入: true,
      正面提示词: positive,
      负面提示词: '',
      结构化特征: {
        外貌标签: tagsFrom(npc.外貌),
        服装基底标签: tagsFrom(npc.穿着),
        特殊特征标签: tagsFrom(npc.装备摘要),
      },
      来源: 'manual',
      原始提取文本: [npc.外貌, npc.穿着, npc.装备摘要, requirement].filter(Boolean).join('\n'),
    });
  };

  const applyTokenizerIfAvailable = async (input: {
    title: string;
    mode: string;
    sourceText: string;
    prompt: string;
    negative: string;
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
        },
        tokenizerConfig.retryCount ?? 2,
      );
      setMessage('已通过词组转化器优化 Prompt 草稿。');
      return { ...input, prompt: refined.prompt, negative: refined.negative };
    } catch (err) {
      setMessage(`词组转化器失败，已保留本地草稿：${err instanceof Error ? err.message : String(err)}`);
      return input;
    } finally {
      setTokenizing(false);
    }
  };

  const handleBuildPrompt = async () => {
    const target = currentTarget;
    if (target.tokenizerMode === 'scene') {
      const built = buildSceneImagePrompt({
        text: sceneText,
        mode: target.id === 'phone_wallpaper' ? 'phone_wallpaper' : 'scene',
        rules: imageSettings.rules,
        extraRequirement,
        size: resolvedSize,
        slot: target.slot,
      });
      const refined = await applyTokenizerIfAvailable({
        title: target.label,
        mode: target.id,
        sourceText: sceneText || target.desc,
        prompt: built.prompt,
        negative: built.negative,
      });
      setPrompt(refined.prompt);
      setNegativePrompt((prev) => prev || refined.negative);
      setGenerateTitle(sceneText.trim().slice(0, 16) || target.label);
      if (!imageSettings.enablePromptTokenizer) setMessage(`已生成${target.label} prompt 草稿，可继续手动编辑。`);
      return;
    }
    if (target.targetType === 'traveler') {
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
      });
      setPrompt(refined.prompt);
      setNegativePrompt((prev) => prev || refined.negative);
      setGenerateTitle(`${traveler.姓名 || '旅人'}${target.label}`);
      if (!imageSettings.enablePromptTokenizer) setMessage(`已根据旅人档案生成${target.label} prompt，可继续手动编辑。`);
      return;
    }
    const npc = npcs.find((item) => item.id === tokenizerNpcId);
    if (!npc) {
      setMessage('请先选择一个伙伴。');
      return;
    }
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
    });
    setPrompt(refined.prompt);
    setNegativePrompt((prev) => prev || refined.negative);
    setGenerateTitle(`${npc.姓名}${target.label}`);
    if (!imageSettings.enablePromptTokenizer) setMessage(`已根据伙伴档案生成${target.label} prompt，可继续手动编辑。`);
  };

  const handleTargetChange = (next: GenerateTarget) => {
    const target = generateTargets.find((item) => item.id === next) ?? generateTargets[0];
    setGenerateTarget(next);
    setTokenizerMode(target.tokenizerMode);
    setGenerateTitle('');
    setPrompt('');
    setNegativePrompt('');
  };

  return (
    <div className="pb-3">
      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          <Header stats={stats} />
          <WorkspaceTabs activeTab={activeTab} setActiveTab={setActiveTab} />
          <NsfwVisibilityToggle nsfwVisible={nsfwVisible} showNsfw={showNsfw} setShowNsfw={setShowNsfw} />
        </aside>

        <section className="min-w-0">
          <main className="min-w-0">
            {activeTab === 'library' && (
              <CharacterLibraryWorkspace
                records={filteredLibraryRecords}
                activeRecord={activeLibraryRecord}
                activeEntryId={activeEntry?.id}
                nameFilter={libraryNameFilter}
                setNameFilter={setLibraryNameFilter}
                statusFilter={libraryStatusFilter}
                setStatusFilter={setLibraryStatusFilter}
                onSelectNpc={setLibraryNpcId}
                onSelectEntry={setActiveEntryId}
                onCreate={() => setActiveTab('manual')}
                onMount={mountSelectedToCharacter}
                onUnmount={unmountCharacterSlot}
                maleNsfwEnabled={gameSettings.enableMaleNsfwArchive}
              />
            )}
            {activeTab === 'anchor' && (
              <CharacterAnchorWorkspace
                records={filteredLibraryRecords.filter(isNpcLibraryRecord)}
                activeRecord={isNpcLibraryRecord(activeLibraryRecord) ? activeLibraryRecord : null}
                activeNpcId={libraryNpcId}
                onSelectNpc={setLibraryNpcId}
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
                generateTarget={generateTarget}
                setGenerateTarget={handleTargetChange}
                sizePreset={sizePreset}
                setSizePreset={setSizePreset}
                customSize={customSize}
                setCustomSize={setCustomSize}
                resolvedSize={resolvedSize}
                extraRequirement={extraRequirement}
                setExtraRequirement={setExtraRequirement}
                uploadTitle={uploadTitle}
                setUploadTitle={setUploadTitle}
                onUpload={handleUpload}
                urlTitle={urlTitle}
                setUrlTitle={setUrlTitle}
                remoteUrl={remoteUrl}
                setRemoteUrl={setRemoteUrl}
                onRemote={handleRemoteUrl}
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
                onBuildPrompt={handleBuildPrompt}
                tokenizing={tokenizing}
              />
            )}
            {activeTab === 'scene' && (
              <SceneWorkspace
                imageSettings={imageSettings}
                sceneText={sceneText}
                setSceneText={setSceneText}
                onSelectScene={() => handleTargetChange('scene')}
                onSelectWallpaper={() => handleTargetChange('phone_wallpaper')}
                onGoManual={() => setActiveTab('manual')}
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
                activeEntry={activeEntry}
                onDelete={() => {
                  if (!activeEntry) return;
                  onAlbumChange((prev) => deleteAlbumEntry(prev, activeEntry.id));
                  setActiveEntryId(null);
                  setMessage('图片条目已删除。');
                }}
                onCleanup={() => {
                  onAlbumChange(cleanupAlbumAssets);
                  setMessage('已清理未引用图片资源。');
                }}
                onExport={() => exportAlbum(album)}
                onImport={(file) => {
                  void importAlbum(file).then((next) => {
                    if (!next) return;
                    onAlbumChange(next);
                    setMessage('相册已导入。');
                  }).catch((err) => setMessage(`导入失败：${err instanceof Error ? err.message : String(err)}`));
                }}
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

function Header({ stats }: { stats: { total: number; generated: number; nsfw: number; failed: number } }) {
  return (
    <div className="px-4 py-3" style={{ background: panelSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.55), 0 10px 24px rgba(var(--tj-shadow), 0.08)', clipPath: cardClip }}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-active-text))', background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))', clipPath: smallClip }}>▧</span>
            <div>
              <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>相册</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.55)' }}>Image Dock</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label="图片" value={stats.total} />
          <Stat label="生成" value={stats.generated} />
          <Stat label="NSFW" value={stats.nsfw} tone="nsfw" />
          <Stat label="失败" value={stats.failed} tone="danger" />
        </div>
      </div>
    </div>
  );
}

function WorkspaceTabs({ activeTab, setActiveTab }: { activeTab: WorkTab; setActiveTab: (tab: WorkTab) => void }) {
  return (
    <Panel title="工作台">
      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all" style={{ color: activeTab === tab.id ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.86)', background: activeTab === tab.id ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'rgba(var(--tj-accent-primary),0.055)', boxShadow: activeTab === tab.id ? 'inset 0 0 0 1px rgba(255,245,200,0.45), 0 0 16px rgba(var(--tj-accent-primary),0.12)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
            <span className="h-2 w-2 flex-shrink-0" style={{ background: activeTab === tab.id ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-accent-primary),0.52)', clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' }} />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-sm font-bold tracking-[0.16em]">{tab.label}</span>
              <span className="mt-0.5 block truncate text-[11px] opacity-70">{tab.desc}</span>
            </span>
          </button>
        ))}
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
        成人图片与普通图片隔离显示，关闭后不会出现在资源库和角色槽位。
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
  nameFilter,
  setNameFilter,
  statusFilter,
  setStatusFilter,
  onSelectNpc,
  onSelectEntry,
  onCreate,
  onMount,
  onUnmount,
  maleNsfwEnabled,
}: {
  records: CharacterLibraryRecord[];
  activeRecord: CharacterLibraryRecord | null;
  activeEntryId?: string;
  nameFilter: string;
  setNameFilter: (value: string) => void;
  statusFilter: LibraryStatusFilter;
  setStatusFilter: (value: LibraryStatusFilter) => void;
  onSelectNpc: (id: string) => void;
  onSelectEntry: (id: string) => void;
  onCreate: () => void;
  onMount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => void;
  onUnmount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; slot: MountedImageSlot }) => void;
  maleNsfwEnabled: boolean;
}) {
  const totals = useMemo(() => ({
    current: records.length,
    images: records.reduce((sum, record) => sum + record.imageCount, 0),
    mounted: records.reduce((sum, record) => sum + record.mountedCount, 0),
  }), [records]);

  return (
    <div className="space-y-4">
      <Panel title="图片筛选">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
          <Field label="角色名称">
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="输入角色名筛选"
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
          </Field>
          <Field label="状态筛选">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LibraryStatusFilter)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
              <option value="all">全部</option>
              <option value="ready">已有图片</option>
              <option value="empty">暂无图片</option>
            </select>
          </Field>
          <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)', clipPath: smallClip }}>
            <div className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.62)' }}>当前统计</div>
            <div className="mt-1 font-serif text-sm tracking-[0.12em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>
              {totals.current} 个角色 / {totals.images} 张图
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[190px_minmax(0,1fr)]">
        <Panel title="角色图库">
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {records.length ? (
              records.map((record) => (
                <CharacterArchiveButton
                  key={record.id}
                  record={record}
                  active={activeRecord?.id === record.id}
                  onClick={() => onSelectNpc(record.id)}
                />
              ))
            ) : (
              <EmptyLibraryBox title="未找到角色" desc="调整筛选条件，或先让剧情写入伙伴档案。" />
            )}
          </div>
        </Panel>

        <Panel title={activeRecord ? `${activeRecord.name} · 图像档案` : '图像档案'}>
          {activeRecord ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {activeRecord.slots.map((slot) => (
                  <MountedSlotPreview
                    key={slot.key}
                    slot={slot}
                    onUnmount={() => onUnmount({ targetKind: activeRecord.kind, targetId: activeRecord.id, slot })}
                  />
                ))}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>
                    相册资源
                  </div>
                  <button type="button" onClick={onCreate} className="px-3 py-1.5 font-serif text-xs tracking-[0.16em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))', clipPath: smallClip }}>
                    生成 / 导入
                  </button>
                </div>
                {activeRecord.entries.length ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                    {activeRecord.entries.map((entry) => (
                      <CharacterEntryCard
                        key={entry.entry.id}
                        item={entry}
                        active={activeEntryId === entry.entry.id}
                        targetKind={activeRecord.kind}
                        targetId={activeRecord.id}
                        maleNsfwEnabled={maleNsfwEnabled}
                        onClick={() => onSelectEntry(entry.entry.id)}
                        onMount={onMount}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyLibraryBox title="未找到匹配图片" desc="这个角色还没有相册资源。生成或导入图片后，挂载到角色槽位即可在这里归档。" />
                )}
              </div>
            </div>
          ) : (
            <EmptyLibraryBox title="未找到匹配图片" desc="未找到符合筛选条件的记录，请调整筛选条件或生成图片。" />
          )}
        </Panel>
      </div>
    </div>
  );
}

function CharacterArchiveButton({ record, active, onClick }: { record: CharacterLibraryRecord; active: boolean; onClick: () => void }) {
  const avatar = record.avatar || record.slots.find((slot) => slot.src)?.src;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.07)]"
      style={{
        background: active ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.16), rgba(var(--tj-accent-primary),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'rgba(var(--tj-accent-primary),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)' }}>
        {avatar ? <img src={avatar} alt={record.name} className="h-full w-full object-cover" /> : <span className="font-serif text-sm" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>{record.name.slice(0, 1)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{record.name}</div>
        <div className="mt-0.5 truncate text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>
          已装 {record.mountedCount} / 资源 {record.resourceCount}
        </div>
      </div>
    </button>
  );
}

function MountedSlotPreview({ slot, onUnmount }: { slot: MountedImageSlot; onUnmount: () => void }) {
  return (
    <div className="overflow-hidden" style={{ background: slot.nsfw ? 'rgba(var(--tj-ui-nsfw),0.055)' : 'rgba(var(--tj-accent-primary),0.035)', boxShadow: slot.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.2)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
      <div className="aspect-[4/3] ">
        {slot.src ? <img src={slot.src} alt={slot.label} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-faint),0.58)' }}>待写入</div>}
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
  records,
  activeRecord,
  activeNpcId,
  onSelectNpc,
  requirement,
  setRequirement,
  onSaveAnchor,
  onDeleteAnchor,
  onExtractAnchor,
}: {
  records: NpcLibraryRecord[];
  activeRecord: NpcLibraryRecord | null;
  activeNpcId: string;
  onSelectNpc: (id: string) => void;
  requirement: string;
  setRequirement: (value: string) => void;
  onSaveAnchor: (npcId: string, anchor: NonNullable<NPC记录['图像档案']>['角色锚点']) => void;
  onDeleteAnchor: (npcId: string) => void;
  onExtractAnchor: (npcId: string, requirement: string) => void;
}) {
  const anchoredCount = records.filter((record) => record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词).length;
  const enabledCount = records.filter((record) => record.npc.图像档案?.角色锚点?.是否启用 !== false && (record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词)).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <Panel title="锚点角色">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <AnchorStat label="已建立" value={anchoredCount} />
          <AnchorStat label="启用中" value={enabledCount} />
        </div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {records.length ? (
            records.map((record) => {
              const anchor = record.npc.图像档案?.角色锚点;
              const hasAnchor = Boolean(anchor?.正面提示词 || anchor?.负面提示词);
              const active = (activeNpcId || activeRecord?.npc.id) === record.npc.id;
              return (
                <button
                  key={record.npc.id}
                  type="button"
                  onClick={() => onSelectNpc(record.npc.id)}
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
                    <span className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: hasAnchor ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.66)', background: hasAnchor ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'rgba(var(--tj-accent-primary),0.06)', clipPath: smallClip }}>
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

      <Panel title={activeRecord ? `${activeRecord.npc.姓名} · 角色锚点` : '角色锚点'}>
        {activeRecord ? (
          <CharacterAnchorPanel
            npc={activeRecord.npc}
            requirement={requirement}
            setRequirement={setRequirement}
            onExtract={() => onExtractAnchor(activeRecord.npc.id, requirement)}
            onSave={(anchor) => onSaveAnchor(activeRecord.npc.id, anchor)}
            onDelete={() => onDeleteAnchor(activeRecord.npc.id)}
          />
        ) : (
          <EmptyLibraryBox title="未选择角色" desc="先在左侧选择一个伙伴，再建立用于稳定外观的角色锚点。" />
        )}
      </Panel>
    </div>
  );
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
  npc,
  requirement,
  setRequirement,
  onExtract,
  onSave,
  onDelete,
}: {
  npc: NPC记录;
  requirement: string;
  setRequirement: (value: string) => void;
  onExtract: () => void;
  onSave: (anchor: NonNullable<NPC记录['图像档案']>['角色锚点']) => void;
  onDelete: () => void;
}) {
  const anchor = npc.图像档案?.角色锚点;
  const [name, setName] = useState(anchor?.名称 || npc.姓名);
  const [enabled, setEnabled] = useState(anchor?.是否启用 !== false);
  const [defaultApply, setDefaultApply] = useState(anchor?.生成时默认附加 !== false);
  const [sceneInject, setSceneInject] = useState(anchor?.场景生图自动注入 !== false);
  const [positive, setPositive] = useState(anchor?.正面提示词 || '');
  const [negative, setNegative] = useState(anchor?.负面提示词 || '');

  useEffect(() => {
    setName(anchor?.名称 || npc.姓名);
    setEnabled(anchor?.是否启用 !== false);
    setDefaultApply(anchor?.生成时默认附加 !== false);
    setSceneInject(anchor?.场景生图自动注入 !== false);
    setPositive(anchor?.正面提示词 || '');
    setNegative(anchor?.负面提示词 || '');
  }, [anchor, npc.姓名]);

  const save = () => onSave({
    ...(anchor ?? {}),
    名称: name,
    是否启用: enabled,
    生成时默认附加: defaultApply,
    场景生图自动注入: sceneInject,
    正面提示词: positive,
    负面提示词: negative,
    来源: anchor?.来源 ?? 'manual',
  });

  return (
    <div className="space-y-3 px-3 py-3" style={{ background: cardSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58)', clipPath: smallClip }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>角色锚点管理</div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.64)' }}>角色锚点用于稳定 NPC 外观，每名角色只保留一个锚点。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExtract}>AI提取锚点</Button>
          <Button onClick={save}>保存锚点</Button>
          <Button onClick={onDelete}>删除锚点</Button>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <Field label="锚点名称">
            <input value={name} onChange={(event) => setName(event.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="提取附加要求">
            <input value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：更重视脸部、发色、胸型和常驻衣着" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <div className="grid gap-2 md:grid-cols-3">
            <AnchorToggle label="启用锚点" desc="关闭后不参与生图" checked={enabled} onChange={setEnabled} />
            <AnchorToggle label="默认附加" desc="NPC 单图自动带入" checked={defaultApply} onChange={setDefaultApply} />
            <AnchorToggle label="场景联动" desc="场景图自动注入" checked={sceneInject} onChange={setSceneInject} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="正面提示词">
            <textarea value={positive} onChange={(event) => setPositive(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="负面提示词">
            <textarea value={negative} onChange={(event) => setNegative(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
        </div>
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
  targetKind: CharacterLibraryRecord['kind'];
  targetId: string;
  maleNsfwEnabled: boolean;
  onClick: () => void;
  onMount: (params: { targetKind: CharacterLibraryRecord['kind']; targetId: string; entryId: string; src: string; slot: 图片槽位 }) => void;
}) {
  const mountSlots = getMountSlotsForEntry(item.entry, maleNsfwEnabled, targetKind);
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
          {item.src ? <img src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-3xl" style={{ color: 'rgba(var(--tj-accent-primary),0.28)' }}>✧</div>}
        </div>
      </button>
      <div className="space-y-2 px-3 py-2">
        <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{item.entry.title}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>
          <span>{slotLabel(item.entry.slot)}</span>
          {item.sourceLabel && <span style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>{item.sourceLabel}</span>}
          {item.entry.nsfw && <span style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {mountSlots.map((slot) => (
            <button
              key={slot.value}
              type="button"
              disabled={!item.src}
              onClick={() => onMount({ targetKind, targetId, entryId: item.entry.id, src: item.src, slot: slot.value })}
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
        <div className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(160,168,185,0.72)' }}>{desc}</div>
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
          <button type="button" onClick={onCreate} className="mt-5 px-5 py-2.5 font-serif text-xs font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))', boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.45), 0 0 16px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
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
              {src ? <img src={src} alt={entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-3xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.28)' }}>✧</div>}
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
  uploadTitle: string; setUploadTitle: (v: string) => void; onUpload: (file: File | null) => void;
  urlTitle: string; setUrlTitle: (v: string) => void; remoteUrl: string; setRemoteUrl: (v: string) => void; onRemote: () => void;
  prompt: string; setPrompt: (v: string) => void; negativePrompt: string; setNegativePrompt: (v: string) => void; generateTitle: string; setGenerateTitle: (v: string) => void; onGenerate: (nsfw?: boolean) => void; generating: boolean; nsfwVisible: boolean;
  companions: NPC记录[]; tokenizerNpcId: string; setTokenizerNpcId: (v: string) => void; tokenizerMode: 'avatar' | 'portrait' | 'scene'; setTokenizerMode: (v: 'avatar' | 'portrait' | 'scene') => void; sceneText: string; setSceneText: (v: string) => void; onBuildPrompt: () => void | Promise<void>; tokenizing: boolean;
}) {
  return (
    <div className="space-y-4">
      <WorkflowGuide imageEnabled={props.imageEnabled} currentTarget={props.currentTarget} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <Panel title="手动生图">
        <Field label="生成用途">
          <div className="grid gap-2 md:grid-cols-3">
            {generateTargets
              .filter((target) => !target.nsfw || props.nsfwVisible)
              .map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => props.setGenerateTarget(target.id)}
                  className="px-3 py-3 text-left transition-all"
                  style={{
                    color: props.generateTarget === target.id ? 'rgb(var(--tj-ui-active-text))' : target.nsfw ? 'rgba(var(--tj-ui-nsfw),0.9)' : 'rgba(var(--tj-ui-muted),0.82)',
                    background: props.generateTarget === target.id
                      ? target.nsfw ? 'linear-gradient(135deg, rgb(var(--tj-ui-nsfw)), #c989a6)' : 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))'
                      : target.nsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.36)',
                    boxShadow: props.generateTarget === target.id
                      ? 'inset 0 0 0 1px rgba(255,245,200,0.42), 0 0 12px rgba(var(--tj-accent-primary),0.1)'
                      : target.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.24)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="font-serif text-sm font-bold tracking-[0.12em]">{target.label}</div>
                  <div className="mt-1 text-[11px] leading-relaxed opacity-72">{target.desc}</div>
                </button>
              ))}
          </div>
        </Field>
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
        {props.currentTarget.tokenizerMode === 'scene' ? (
          <Field label="场景说明">
            <textarea rows={4} value={props.sceneText} onChange={(e) => props.setSceneText(e.target.value)} placeholder="写清地点、时间、人物站位、想要画面像纯场景还是故事快照。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
        ) : props.currentTarget.targetType === 'traveler' ? (
          <div className="px-3 py-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)', background: 'rgba(var(--tj-accent-primary),0.045)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
            当前用途会读取旅人档案中的姓名、性别、身份、外貌、性格、命途与能力生成草稿。
          </div>
        ) : (
          <Field label="来源伙伴">
            <select value={props.tokenizerNpcId} onChange={(e) => props.setTokenizerNpcId(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
              <option value="">选择伙伴</option>
              {props.companions.map((npc) => <option key={npc.id} value={npc.id}>{npc.姓名}</option>)}
            </select>
          </Field>
        )}
        <Field label="额外要求">
          <textarea rows={2} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、表情、服装细节、构图禁忌等。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
        <div className="max-w-52">
          <Button disabled={props.tokenizing} onClick={() => { void props.onBuildPrompt(); }}>{props.tokenizing ? '转化中' : '生成 Prompt 草稿'}</Button>
        </div>
        <Field label="Prompt">
          <textarea rows={7} value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="Negative Prompt">
          <textarea rows={3} value={props.negativePrompt} onChange={(e) => props.setNegativePrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={props.generating || props.currentTarget.nsfw === true} onClick={() => props.onGenerate(false)}>{props.generating ? '生成中' : '普通生成'}</Button>
          {props.nsfwVisible && <Button disabled={props.generating || props.currentTarget.nsfw !== true} tone="nsfw" onClick={() => props.onGenerate(true)}>NSFW 生成</Button>}
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="上传图片">
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>本地图片会直接进入相册，之后可选中并挂载到伙伴头像。</div>
          <Field label="上传标题"><input value={props.uploadTitle} onChange={(e) => props.setUploadTitle(e.target.value)} className="kaituo-input w-full px-2 py-1.5 text-xs" style={{ clipPath: smallClip }} /></Field>
          <input type="file" accept="image/*" onChange={(e) => props.onUpload(e.target.files?.[0] ?? null)} className="block w-full text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }} />
        </Panel>
        <Panel title="远程图片">
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>适合粘贴外部图片链接。部署到网站后，远程图片是否能显示取决于图片源是否允许跨站访问。</div>
          <Field label="图片 URL"><input value={props.remoteUrl} onChange={(e) => props.setRemoteUrl(e.target.value)} className="kaituo-input w-full px-2 py-1.5 text-xs font-mono" style={{ clipPath: smallClip }} /></Field>
          <Field label="标题"><input value={props.urlTitle} onChange={(e) => props.setUrlTitle(e.target.value)} className="kaituo-input w-full px-2 py-1.5 text-xs" style={{ clipPath: smallClip }} /></Field>
          <Button onClick={props.onRemote}>加入远程图片</Button>
        </Panel>
      </div>
      </div>
    </div>
  );
}

function QueueWorkspace({ tasks, onRetry }: { tasks: 图片生成任务[]; onRetry: (task?: 图片生成任务) => void }) {
  if (!tasks.length) {
    return (
      <div className="px-4 py-16 text-center" style={{ color: 'rgba(var(--tj-ui-faint),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}>
        <div className="font-serif text-sm tracking-[0.24em]">暂无生成任务</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="px-4 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: cardClip }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{task.prompt || '未命名任务'}</div>
              <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{task.backend} / {slotLabel(task.slot)}{task.dimensions ? ` / ${task.dimensions}` : ''}</div>
            </div>
            <span className="text-xs" style={{ color: task.status === 'failed' ? 'rgba(255,170,170,0.9)' : task.status === 'success' ? 'rgba(165,230,170,0.9)' : 'rgba(var(--tj-accent-primary),0.78)' }}>{statusLabel(task.status)}</span>
          </div>
          {task.error && <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(255,180,180,0.88)' }}>{task.error}</div>}
          {task.status === 'failed' && <div className="mt-3 max-w-40"><Button onClick={() => onRetry(task)}>重试此任务</Button></div>}
        </div>
      ))}
    </div>
  );
}

function HistoryWorkspace({ album, assetMap, onSelect }: { album: 相册系统; assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>; onSelect: (id: string) => void }) {
  const generatedEntries = album.entries
    .filter((entry) => assetMap.get(entry.assetId))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!generatedEntries.length) {
    return (
      <div className="px-4 py-16 text-center" style={{ color: 'rgba(var(--tj-ui-faint),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}>
        <div className="font-serif text-sm tracking-[0.24em]">暂无图片历史</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {generatedEntries.map((entry) => {
        const asset = assetMap.get(entry.assetId);
        return (
          <button key={entry.id} type="button" onClick={() => onSelect(entry.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" style={{ background: 'rgba(var(--tj-ui-panel),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: cardClip }}>
            <div className="h-14 w-20 flex-shrink-0 overflow-hidden" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.52)', clipPath: smallClip }}>
              {asset?.dataUrl || asset?.url || asset?.localRef ? <img src={asset.dataUrl || asset.url || asset.localRef} alt={entry.title} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{entry.title}</div>
              <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{slotLabel(entry.slot)} · {new Date(entry.createdAt).toLocaleString()}</div>
            </div>
            {entry.nsfw && <span className="text-xs" style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}
          </button>
        );
      })}
    </div>
  );
}

function SceneWorkspace({ imageSettings, sceneText, setSceneText, onSelectScene, onSelectWallpaper, onGoManual }: { imageSettings: 文生图系统设置; sceneText: string; setSceneText: (v: string) => void; onSelectScene: () => void; onSelectWallpaper: () => void; onGoManual: () => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="场景图">
        <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
          场景图适合地点、章节关键画面、新闻配图。若启用独立场景接口，会优先走场景接口。
        </div>
        <Field label="场景说明">
          <textarea rows={6} value={sceneText} onChange={(e) => setSceneText(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => { onSelectScene(); onGoManual(); }}>生成场景图</Button>
          <Button onClick={() => { onSelectWallpaper(); onGoManual(); }}>生成手机背景</Button>
        </div>
      </Panel>
      <Panel title="接口状态">
        <InfoLine label="总开关" value={imageSettings.enabled ? '已开启' : '未开启'} />
        <InfoLine label="场景接口" value={imageSettings.useSeparateSceneApi ? (imageSettings.场景接口.enabled ? '独立接口已启用' : '独立接口未启用') : '复用普通接口'} />
        <InfoLine label="默认尺寸" value={imageSettings.useSeparateSceneApi ? imageSettings.场景接口.defaultSize : imageSettings.普通接口.defaultSize} />
      </Panel>
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
          这里和设置里的文生图规则模板是同一份数据。结构对齐墨色：按 NPC、场景和场景判定三类模板分别维护当前生效规则。
        </div>
        <ImageRuleTemplateEditor rules={rules} onChange={onChange} />
        <div className="max-w-56">
          <Button onClick={onSave}>保存规则中心</Button>
        </div>
      </Panel>
    </div>
  );
}

function ManageWorkspace({ activeEntry, onDelete, onCleanup, onExport, onImport }: { activeEntry: 相册条目 | null; onDelete: () => void; onCleanup: () => void; onExport: () => void; onImport: (file: File | null) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="资源整理">
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!activeEntry} onClick={onDelete}>删除选中</Button>
          <Button onClick={onCleanup}>清理未使用图片</Button>
        </div>
      </Panel>
      <Panel title="导入导出">
        <Button onClick={onExport}>导出相册 JSON</Button>
        <label className="block cursor-pointer">
          <div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>导入相册 JSON</div>
          <div className="px-3 py-2 text-center font-serif text-xs tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.9)', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)', clipPath: smallClip }}>
            选择相册文件
          </div>
          <input type="file" accept="application/json,.json" onChange={(e) => onImport(e.target.files?.[0] ?? null)} className="hidden" />
        </label>
      </Panel>
    </div>
  );
}

function WorkflowGuide({ imageEnabled, currentTarget }: { imageEnabled: boolean; currentTarget: typeof generateTargets[number] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <GuideStep index="1" title="选择用途" desc={`当前：${currentTarget.label}`} active />
      <GuideStep index="2" title="生成草稿" desc={currentTarget.tokenizerMode === 'scene' ? '填写场景说明' : '选择伙伴档案'} active={imageEnabled} />
      <GuideStep index="3" title="进入相册" desc="生成后自动入库，再挂载到槽位" active={imageEnabled} />
    </div>
  );
}

function GuideStep({ index, title, desc, active }: { index: string; title: string; desc: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" style={{ background: active ? 'rgba(var(--tj-accent-primary),0.075)' : 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)', clipPath: smallClip }}>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center font-serif text-sm font-bold" style={{ color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.65)', background: active ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'rgba(var(--tj-accent-primary),0.06)', clipPath: smallClip }}>{index}</span>
      <div className="min-w-0">
        <div className="font-serif text-sm font-bold tracking-[0.12em]" style={{ color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.72)' }}>{title}</div>
        <div className="mt-0.5 truncate text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>{desc}</div>
      </div>
    </div>
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
    <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)', clipPath: smallClip }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.62)' }}>{label}</div>
      <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.82)' }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 px-3 py-3" style={{ background: panelSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.68), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.36)', clipPath: cardClip }}>
      <div className="font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{label}</div>{children}</label>;
}

function Button({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="w-full px-3 py-2 text-xs font-serif tracking-[0.16em] disabled:opacity-45" style={{ color: tone === 'nsfw' ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-accent-primary),0.9)', background: tone === 'nsfw' ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-accent-primary),0.055)', boxShadow: tone === 'nsfw' ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.3)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)', clipPath: smallClip }}>{children}</button>;
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'nsfw' | 'danger' }) {
  const color = tone === 'nsfw' ? 'rgba(156,82,108,0.96)' : tone === 'danger' ? 'rgb(var(--tj-danger))' : 'rgb(var(--tj-accent-primary))';
  return <div className="px-2 py-2" style={{ background: insetSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)', clipPath: smallClip }}><div className="font-serif text-base font-bold" style={{ color }}>{value}</div><div className="text-[11px] font-medium" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>{label}</div></div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2"><span style={{ color: 'rgba(var(--tj-accent-primary),0.68)' }}>{label}</span><span className="truncate">{value}</span></div>;
}

interface CharacterLibraryEntry {
  entry: 相册条目;
  src: string;
  sourceLabel?: string;
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
        ...(includeNsfw ? [
          { key: 'nsfw-female-chest', label: '女性胸部', src: npc.NSFW档案?.部位图片?.女性胸部, nsfw: true },
          { key: 'nsfw-female-genital', label: '女性私处', src: npc.NSFW档案?.部位图片?.女性私处, nsfw: true },
          { key: 'nsfw-male-genital', label: '男性器', src: npc.NSFW档案?.部位图片?.男性器, nsfw: true },
          { key: 'nsfw-rear', label: '后庭', src: npc.NSFW档案?.部位图片?.后庭, nsfw: true },
          { key: 'nsfw-body-reference', label: '体态参考', src: npc.NSFW档案?.部位图片?.体态参考, nsfw: true },
        ] : []),
      ];
      const albumEntries = album.entries
        .filter((entry) => {
          if (entry.nsfw && !includeNsfw) return false;
          if (entry.targetId === npc.id) return true;
          if (entry.targetType !== 'npc' && entry.targetType !== 'nsfw_part') return false;
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
      if (entry.targetType === 'traveler') return true;
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
    npc.NSFW档案?.enabled ? `NSFW档案：${JSON.stringify(npc.NSFW档案)}` : '',
  ].filter(Boolean).join('\n');
}

function createTask(input: { prompt: string; negativePrompt?: string; nsfw: boolean; backend: string; slot: 图片槽位; targetType: 图片目标类型; dimensions?: string }): 图片生成任务 {
  return {
    id: `img_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetType: input.targetType,
    slot: input.slot,
    source: 'manual',
    status: 'running',
    backend: input.backend,
    nsfw: input.nsfw,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    dimensions: input.dimensions,
    retryCount: 0,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
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

function exportAlbum(album: 相册系统) {
  const blob = new Blob([JSON.stringify(album, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kaituo-album-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importAlbum(file: File | null): Promise<相册系统 | null> {
  if (!file) return null;
  const text = await file.text();
  const data = JSON.parse(text) as 相册系统;
  return {
    assets: Array.isArray(data.assets) ? data.assets : [],
    entries: Array.isArray(data.entries) ? data.entries : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
  };
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
