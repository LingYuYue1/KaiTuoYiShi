// 首页的全部逻辑：四个转场的编排（计时、重叠保护、减少动效降级）、入口命令，
// 以及页面要展示的数据（版本、署名、忙态）。
//
// 界面组件因此只剩纯渲染。转场遮罩会跨越视图切换，所以本钩子必须挂在 App 顶层，
// 不能挂在首页分支内部——否则开局向导期间遮罩会被卸载。

import { useCallback, useRef, useState } from 'react';
import { APP_CREDITS, APP_VERSION } from '@/data/appMeta';

export type HomeTransition = 'none' | 'journeyLaunch' | 'homeJourney' | 'saveLoad' | 'bookOpen';

export interface HomePageCommands {
  /** 首页 → 开局向导。 */
  newGame: () => void;
  /** 首页 → 存档界面。 */
  loadSave: () => void;
  /** 首页 → 如我所书。 */
  openWorldbook: () => void;
  /** 开局向导 → 游戏本体。 */
  launchJourney: () => void;
  openZhiku: () => void;
  openSettings: () => void;
  openCloudSave: () => void;
  openAnnouncements: () => void;
  openMysteryChat: () => void;
  openDiscord: () => void;
}

export interface HomePageView {
  version: string;
  author: string;
  contributors: readonly string[];
  /** 任一转场进行中。界面据此禁用入口，避免转场叠加。 */
  busy: boolean;
  /**
   * 依赖内置预置数据（原著正文 / 智库目录）的入口是否可用。
   * 载入中为 false——此时打开智库会看到一份尚未合并的空档案；载入失败也为 true，
   * 因为降级缓存仍可玩，玩家不该被永久挡住。
   */
  dataReady: boolean;
}

export interface UseHomePageOptions {
  /** 转场走到切换帧时的落点。落点之后剩余时间继续盖着遮罩，用来收尾。 */
  onEnterNewGame: () => void;
  onEnterLoadSave: () => void;
  onEnterWorldbook: () => void;
  onEnterGame: () => void;
  onOpenZhiku: () => void;
  onOpenSettings: () => void;
  onOpenCloudSave: () => void;
  onOpenAnnouncements: () => void;
  onOpenMysteryChat: () => void;
  /** 内置预置数据是否已落定（ready 或 failed 都算）。 */
  dataReady: boolean;
}

interface TransitionPlan {
  /** 遮罩存活时长。 */
  overlayMs: number;
  /** 切换落点的时刻，不晚于 overlayMs。 */
  switchMs: number;
  reducedOverlayMs: number;
  reducedSwitchMs: number;
}

const PLANS: Record<Exclude<HomeTransition, 'none'>, TransitionPlan> = {
  journeyLaunch: { overlayMs: 1680, switchMs: 1680, reducedOverlayMs: 320, reducedSwitchMs: 320 },
  homeJourney: { overlayMs: 1180, switchMs: 520, reducedOverlayMs: 260, reducedSwitchMs: 90 },
  saveLoad: { overlayMs: 1040, switchMs: 430, reducedOverlayMs: 260, reducedSwitchMs: 90 },
  bookOpen: { overlayMs: 1080, switchMs: 460, reducedOverlayMs: 260, reducedSwitchMs: 90 },
};

const DISCORD_INVITE_URL = 'https://discord.com/channels/1380075940285124724/1509136913792241704';

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const openDiscordInvite = (): void => {
  window.open(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
};

export function useHomePage(options: UseHomePageOptions): {
  view: HomePageView;
  commands: HomePageCommands;
  transition: HomeTransition;
} {
  const [transition, setTransition] = useState<HomeTransition>('none');
  // 守卫用 ref 而非 transition 状态：命令在闭包里读状态会读到渲染时的旧值，
  // 连点两下就会叠加两条转场。
  const running = useRef(false);

  const runTransition = useCallback(async (
    kind: Exclude<HomeTransition, 'none'>,
    atSwitch: () => void,
  ): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setTransition(kind);

    const plan = PLANS[kind];
    const reduced = prefersReducedMotion();
    const overlayMs = reduced ? plan.reducedOverlayMs : plan.overlayMs;
    const switchMs = Math.min(reduced ? plan.reducedSwitchMs : plan.switchMs, overlayMs);

    await wait(switchMs);
    atSwitch();
    const remaining = overlayMs - switchMs;
    if (remaining > 0) await wait(remaining);

    running.current = false;
    setTransition('none');
  }, []);

  const view: HomePageView = {
    version: APP_VERSION,
    author: APP_CREDITS.author,
    contributors: APP_CREDITS.contributors,
    busy: transition !== 'none',
    dataReady: options.dataReady,
  };

  const commands: HomePageCommands = {
    newGame: () => { void runTransition('homeJourney', options.onEnterNewGame); },
    loadSave: () => { void runTransition('saveLoad', options.onEnterLoadSave); },
    openWorldbook: () => { void runTransition('bookOpen', options.onEnterWorldbook); },
    launchJourney: () => { void runTransition('journeyLaunch', options.onEnterGame); },
    openZhiku: options.onOpenZhiku,
    openSettings: options.onOpenSettings,
    openCloudSave: options.onOpenCloudSave,
    openAnnouncements: options.onOpenAnnouncements,
    openMysteryChat: options.onOpenMysteryChat,
    openDiscord: openDiscordInvite,
  };

  return { view, commands, transition };
}
