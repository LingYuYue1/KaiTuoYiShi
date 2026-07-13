import type { CSSProperties } from 'react';
import type { 图片槽位, 图片目标类型 } from '@/models/imageGeneration';
import type { 文生图API配置 } from '@/models/settings';

export type WorkTab = 'manual' | 'library' | 'sceneLibrary' | 'anchor' | 'reference' | 'scene' | 'sceneImage' | 'phone' | 'rules' | 'queue' | 'history' | 'manage' | 'settings';
export type GenerateTarget = 'traveler_avatar' | 'traveler_portrait' | 'npc_avatar' | 'npc_portrait' | 'scene' | 'phone_wallpaper' | 'nsfw_reference';
export type NsfwPartImageSlot = '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考';
export type LibraryStatusFilter = 'all' | 'ready' | 'empty';
export type PromptMeta = { anchorMode: boolean; anchorSummary: string; sourcePrompt?: string };
export type StorySnapshotSource = 'latest_assistant' | 'previous_turn' | 'manual';
export type AnchorSelection = 'traveler' | string;
export type SceneLibraryFilter = 'all' | 'scene' | 'snapshot' | 'phone';
export type GenerationHistoryFilter = 'all' | 'character' | 'scene' | 'snapshot' | 'phone';
export type AlbumImportTarget = {
  scope: 'character' | 'scene';
  targetType: 图片目标类型;
  targetId?: string;
  sceneKind?: Exclude<SceneLibraryFilter, 'all'>;
};
export type StorySnapshotSummary = {
  title: string;
  characters: string[];
  location: string;
  atmosphere: string;
  action: string;
  camera: string;
  avoid: string;
};
export type SceneImageSummary = {
  title: string;
  location: string;
  atmosphere: string;
  subject: string;
  camera: string;
  avoid: string;
};
export type StorySnapshotSourceOption = { id: StorySnapshotSource; title: string; desc: string; text: string };

export const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
export const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
export const albumGridLayer = 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.062) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-cyan),0.048) 1px, transparent 1px)';
export const albumGridSize = '26px 26px, 26px 26px, auto, auto';
export const heroSurface = `${albumGridLayer}, radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.14), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface),0.78), rgba(var(--tj-bg-primary),0.94))`;
export const panelSurface = 'radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.08), transparent 28%), linear-gradient(180deg, rgba(var(--tj-surface),0.74), rgba(var(--tj-bg-primary),0.94))';
export const insetSurface = 'linear-gradient(135deg, rgba(var(--tj-surface),0.64), rgba(var(--tj-surface-strong),0.76))';
export const imageWellSurface = 'linear-gradient(135deg, rgba(var(--tj-surface-strong),0.8), rgba(var(--tj-bg-primary),0.88))';
export const titleColor = 'rgb(var(--tj-ui-title))';
export const bodyColor = 'rgba(var(--tj-ui-body),0.94)';
export const mutedColor = 'rgba(var(--tj-ui-muted),0.78)';
export const faintColor = 'rgba(var(--tj-ui-faint),0.66)';
export const activeTextColor = 'rgb(var(--tj-ui-active-text))';
export const accentColor = 'rgb(var(--tj-accent-primary))';
export const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
export const activeAccentSurface = 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgba(var(--tj-accent-mid),0.96) 48%, rgb(var(--tj-tech-cyan)) 100%)';
export const quietAccentSurface = 'rgba(var(--tj-btn-primary-start),0.055)';
export const cardSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel),0.76), rgba(var(--tj-ui-panel-strong),0.72))';
export const heroGridBackgroundStyle = {
  backgroundSize: albumGridSize,
  backgroundPosition: '0 0, 0 0, center, center',
} as CSSProperties;


export const tabs: { id: WorkTab; label: string; desc: string; group: 'create' | 'manage' }[] = [
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

export const generateTargets: Array<{
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

export const imageGenerationTargets = generateTargets.filter((target) => target.id !== 'scene' && target.id !== 'phone_wallpaper');
export type GenerateOverride = {
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

export type NavGroupId = 'generate' | 'library' | 'tasks' | 'settings';

export const navGroups: { id: NavGroupId; label: string; members: WorkTab[] }[] = [
  { id: 'generate', label: '生成', members: ['manual', 'scene', 'sceneImage', 'phone', 'anchor', 'reference'] },
  { id: 'library', label: '图库', members: ['library', 'sceneLibrary', 'history'] },
  { id: 'tasks', label: '任务', members: ['queue'] },
  { id: 'settings', label: '设置', members: ['rules', 'manage', 'settings'] },
];

export function groupForTab(tab: WorkTab): NavGroupId {
  return navGroups.find((group) => group.members.includes(tab))?.id ?? 'generate';
}
