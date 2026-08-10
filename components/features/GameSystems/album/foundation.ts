import type { 图片槽位, 图片生成任务来源, 图片目标类型 } from '@/models/imageGeneration';
import type { 文生图API配置 } from '@/models/settings';

export type WorkTab = 'manual' | 'gallery' | 'anchor' | 'scene' | 'sceneImage' | 'phone' | 'reference' | 'rules' | 'queue' | 'settings';
export type GenerateTarget = 'traveler_avatar' | 'traveler_portrait' | 'npc_avatar' | 'npc_portrait' | 'scene' | 'phone_wallpaper' | 'nsfw_reference';
export type NsfwPartImageSlot = '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考';
export type LibraryStatusFilter = 'all' | 'ready' | 'empty';
export type PromptMeta = { anchorMode: boolean; anchorSummary: string; sourcePrompt?: string };
export type StorySnapshotSource = 'latest_assistant' | 'previous_turn' | 'manual';
export type AnchorSelection = string;
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

export type NavGroupId = 'generate' | 'library' | 'tasks' | 'settings';

export const tabs: { id: WorkTab; label: string; desc: string; groupId: NavGroupId }[] = [
  { id: 'manual', label: '图片生成', desc: '生成图片与构图', groupId: 'generate' },
  { id: 'scene', label: '故事快照', desc: '正文插图与场景', groupId: 'generate' },
  { id: 'sceneImage', label: '场景图', desc: '地点与新闻配图', groupId: 'generate' },
  { id: 'phone', label: '手机背景', desc: '壁纸与聊天背景', groupId: 'generate' },
  { id: 'anchor', label: '角色视觉', desc: '头像与立绘锚点', groupId: 'generate' },
  { id: 'gallery', label: '图库', desc: '角色、场景与导入导出', groupId: 'library' },
  { id: 'rules', label: '规则中心', desc: 'Prompt 规范', groupId: 'settings' },
  { id: 'queue', label: '生成任务', desc: '图片任务流与记录', groupId: 'tasks' },
  { id: 'reference', label: '参考图', desc: '全局注入控制', groupId: 'settings' },
  { id: 'settings', label: '设置', desc: '接口与正文插图', groupId: 'settings' },
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
  { id: 'nsfw_reference', label: 'NSFW 参考图', desc: '用于角色 NSFW 体态与部位参考。', targetType: 'nsfw_part', slot: 'nsfw_body_reference', tokenizerMode: 'portrait', nsfw: true },
];

export const imageGenerationTargets = generateTargets.filter((target) => target.id !== 'scene' && target.id !== 'phone_wallpaper');
export type GenerateOverride = {
  source?: 图片生成任务来源;
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

export const navGroups: { id: NavGroupId; label: string }[] = [
  { id: 'generate', label: '生成' },
  { id: 'library', label: '图库' },
  { id: 'tasks', label: '任务' },
  { id: 'settings', label: '设置' },
];

export function groupForTab(tab: WorkTab): NavGroupId {
  return tabs.find((item) => item.id === tab)?.groupId ?? 'generate';
}
