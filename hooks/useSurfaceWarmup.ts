// 界面 chunk 的背景预热：把「第一次打开才知道要下载」变成「玩家还没点到就已经下好了」。
//
// 三条纪律，缺一条都会让预热反噬它想改善的东西：
//   1. boot 未落定不预热——那段时间的带宽要留给带超时的内置资源请求，boot 恢复本身
//      还是 IndexedDB 重活，并行只会互相拖慢，甚至把内置资源挤过超时线。
//   2. 串行不并发——弱网下单条连接本来就慢，18 个 import 一起发只会让每个都更慢、
//      更容易撞上 lazyWithRetry 的 12s 超时。项与项之间还留一条缝。
//   3. 让路——页面不可见时停（手机切后台不该继续吃流量），首回合生成期间不补游戏内界面
//      （模型请求优先）。
//
// 全部依赖懒加载界面自己的 preload()（失败静默，不弹任何 UI）。预热失败不影响功能：
// 玩家真点进去时，lazyWithRetry 会走正常的可见失败卡片。

import { useEffect, useRef, useState } from 'react';
import { HOME_SURFACE_COUNT, SURFACE_WARMUP } from '@/components/lazy/surfaces';
import type { ViewState } from '@/hooks/useGameState';

/** 两项预热之间的间隔，给同一连接留出喘息的余地。 */
const WARMUP_GAP_MS = 120;

interface UseSurfaceWarmupOptions {
  /** boot 全流程（内置资源 + 世界书 + 存档恢复）是否已落定。未落定不预热。 */
  bootSettled: boolean;
  view: ViewState;
  /** 是否正有回合在生成。为真时不补游戏内界面，避免和模型请求抢带宽。 */
  busy: boolean;
}

/**
 * 按 {@link SURFACE_WARMUP} 的顺序串行预热懒加载界面。
 *
 * 范围随阶段扩张：boot 落定后先点亮首页可达界面，进入游戏且模型请求让出带宽后再补
 * 游戏内界面。已预热的项按 id 去重，因此重复触发是幂等的。
 */
export function useSurfaceWarmup({ bootSettled, view, busy }: UseSurfaceWarmupOptions): void {
  const warmedRef = useRef<Set<string>>(new Set());
  const runTokenRef = useRef(0);
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const handleVisibilityChange = (): void => { setVisible(!document.hidden); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, []);

  const limit = !bootSettled
    ? 0
    : view === 'game' && !busy
      ? SURFACE_WARMUP.length
      : HOME_SURFACE_COUNT;

  useEffect(() => {
    if (limit === 0) return;

    // 令牌只让最新一轮循环存活：阶段扩张或页面可见性变化时旧循环立即退出，
    // 保证任意时刻只有一路预热在跑（纪律 2）。
    runTokenRef.current += 1;
    const token = runTokenRef.current;

    void (async () => {
      for (const surface of SURFACE_WARMUP.slice(0, limit)) {
        if (runTokenRef.current !== token) return;
        if (!visible) return;
        if (warmedRef.current.has(surface.id)) continue;
        await surface.load();
        warmedRef.current.add(surface.id);
        await new Promise((resolve) => { window.setTimeout(resolve, WARMUP_GAP_MS); });
      }
    })();
  }, [limit, visible]);
}
