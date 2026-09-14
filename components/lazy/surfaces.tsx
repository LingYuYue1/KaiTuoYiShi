// 全部懒加载界面的唯一登记处。
//
// 此前这些声明散在 App.tsx 顶部，等待态是另一处，预热又是第三、第四处（三个点击时预热
// 加一个 idle 预热），四处各自演化。现在收敛到这里：**声明、等待态、预热顺序** 同源，
// 「哪些界面是懒的、怎么等待、按什么顺序提前点亮」只在这一个文件里回答。
//
// 预热顺序即优先级：首页可达界面在前，游戏内界面在后（见 SURFACE_WARMUP）。
// 真正的排程纪律在 hooks/useSurfaceWarmup，此处只声明意图。

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { lazyWithRetry } from '@/utils/lazyWithRetry';

// ── 首页可达界面 ──

export const NewGameWizard = lazyWithRetry(() => import('@/components/features/NewGame/NewGameWizard').then((module) => ({ default: module.NewGameWizard })), '开局档案');
export const SettingsModal = lazyWithRetry(() => import('@/components/features/Settings/SettingsModal').then((module) => ({ default: module.SettingsModal })), '设置');
export const SaveManager = lazyWithRetry(() => import('@/components/features/SaveLoad/SaveManager').then((module) => ({ default: module.SaveManager })), '存档系统');
export const WorldbookManagerModal = lazyWithRetry(() => import('@/components/features/Worldbook/WorldbookManagerModal').then((module) => ({ default: module.WorldbookManagerModal })), '如我所书');
export const ZhikuManagerModal = lazyWithRetry(() => import('@/components/features/ZhikuV3/ZhikuManagerModal').then((module) => ({ default: module.ZhikuManagerModal })), '智库');
export const GitHubCloudSaveModal = lazyWithRetry(() => import('@/components/features/CloudSave/GitHubCloudSaveModal').then((module) => ({ default: module.GitHubCloudSaveModal })), '云存档');
export const ReleaseAnnouncementsModal = lazyWithRetry(() => import('@/components/features/Release/ReleaseAnnouncementsModal').then((module) => ({ default: module.ReleaseAnnouncementsModal })), '更新公告');

// ── 游戏内界面 ──

export const PhoneModal = lazyWithRetry(() => import('@/components/features/Phone/PhoneModal').then((module) => ({ default: module.PhoneModal })), '手机');
export const PlotPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PlotPanel').then((module) => ({ default: module.PlotPanel })), '剧情');
export const YitingPanel = lazyWithRetry(() => import('@/components/features/GameSystems/YitingPanel').then((module) => ({ default: module.YitingPanel })), '忆庭');
export const ZhikuSystemPanel = lazyWithRetry(() => import('@/components/features/ZhikuV3/ZhikuSystemPanel').then((module) => ({ default: module.ZhikuSystemPanel })), '智库');
export const MemoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/MemoryPanel').then((module) => ({ default: module.MemoryPanel })), '记忆');
export const AlbumPanel = lazyWithRetry(() => import('@/components/features/GameSystems/AlbumPanel').then((module) => ({ default: module.AlbumPanel })), '相册');
export const SkillPanel = lazyWithRetry(() => import('@/components/features/GameSystems/SkillPanel').then((module) => ({ default: module.SkillPanel })), '战技');
export const InventoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/InventoryPanel').then((module) => ({ default: module.InventoryPanel })), '物品');
export const NewsPanel = lazyWithRetry(() => import('@/components/features/GameSystems/NewsPanel').then((module) => ({ default: module.NewsPanel })), '新闻');
export const CompanionPanel = lazyWithRetry(() => import('@/components/features/GameSystems/CompanionPanel').then((module) => ({ default: module.CompanionPanel })), '同行');
export const PathPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PathPanel').then((module) => ({ default: module.PathPanel })), '命途');

/** 等待态文案。曾经是 `LazySurfaceFallback` 的入参，现在只由 {@link LazySurface} 传。 */
function LazySurfaceFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
      {label}
    </div>
  );
}

/**
 * 懒加载界面的统一边界。等待态的样子只在这里定义一次。
 *
 * 注意：等待态目前是文档流里的一段文字，在首页（LandingPage 高 100dvh、body overflow:hidden）
 * 会被排到视口之外——首页点击冷 chunk 时玩家看不到反馈，直到 lazyWithRetry 的 12s 超时
 * 换上可见的失败卡片。已知并接受；背景预热已把大多数点击变成热路径。
 */
export function LazySurface({ label, children }: { label: string; children: ReactNode }) {
  return <Suspense fallback={<LazySurfaceFallback label={label} />}>{children}</Suspense>;
}

/** 可供背景预热的一项懒加载界面。 */
export interface SurfaceWarmup {
  /** 稳定标识，用于「已预热」去重。 */
  readonly id: string;
  readonly label: string;
  readonly load: () => Promise<void>;
}

const HOME_SURFACES: readonly SurfaceWarmup[] = [
  { id: 'settings', label: '设置', load: SettingsModal.preload },
  { id: 'cloudSave', label: '云存档', load: GitHubCloudSaveModal.preload },
  { id: 'announcements', label: '更新公告', load: ReleaseAnnouncementsModal.preload },
  { id: 'newGameWizard', label: '开局档案', load: NewGameWizard.preload },
  { id: 'saveManager', label: '存档系统', load: SaveManager.preload },
  { id: 'worldbook', label: '如我所书', load: WorldbookManagerModal.preload },
  { id: 'zhiku', label: '智库', load: ZhikuManagerModal.preload },
];

const GAME_SURFACES: readonly SurfaceWarmup[] = [
  { id: 'phone', label: '手机', load: PhoneModal.preload },
  { id: 'plot', label: '剧情', load: PlotPanel.preload },
  { id: 'yiting', label: '忆庭', load: YitingPanel.preload },
  { id: 'zhikuPanel', label: '智库', load: ZhikuSystemPanel.preload },
  { id: 'memory', label: '记忆', load: MemoryPanel.preload },
  { id: 'album', label: '相册', load: AlbumPanel.preload },
  { id: 'skill', label: '战技', load: SkillPanel.preload },
  { id: 'inventory', label: '物品', load: InventoryPanel.preload },
  { id: 'news', label: '新闻', load: NewsPanel.preload },
  { id: 'companion', label: '同行', load: CompanionPanel.preload },
  { id: 'path', label: '命途', load: PathPanel.preload },
];

/** 预热总清单，顺序即优先级：首页可达界面在前，游戏内界面在后。 */
export const SURFACE_WARMUP: readonly SurfaceWarmup[] = [...HOME_SURFACES, ...GAME_SURFACES];

/** 首页可达界面在 {@link SURFACE_WARMUP} 中的前缀长度。 */
export const HOME_SURFACE_COUNT = HOME_SURFACES.length;
