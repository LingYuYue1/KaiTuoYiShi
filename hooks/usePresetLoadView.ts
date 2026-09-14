// 预置载入进度的**展示模型**：所有判断（走不走秒、显不显示跳过/重试、百分比、文案）
// 都在这里，界面组件只做投影。
//
// 计时为什么在这里而不是 useGameState：每秒跳一次会让整个 App 重渲染，而 App 很重。
// 计时是纯展示节奏，放在持有它的叶子视图自己的钩子里，代价只有这一个节点。

import { useEffect, useState } from 'react';
import type { PresetLoadState } from '@/hooks/useGameState';

/** 走秒间隔：只用于显示「已用 Ns」。 */
const TICK_MS = 1000;
/** 等多久才给「跳过」。太早出现会让人以为本来就该跳过。 */
const SKIP_AFTER_MS = 10_000;
/** 成功后退场前停留的时长，让总用时能被读到。 */
const READY_LINGER_MS = 2500;

export interface PresetLoadView {
  /** 是否渲染。ready 停留够久后转 false。 */
  visible: boolean;
  tone: 'pending' | 'ready' | 'failed';
  title: string;
  /** 「12 / 50 · 已用 8s」 */
  counter: string;
  percent: number;
  /** 等够久且仍在载入。 */
  showSkip: boolean;
  /** 终局为失败。 */
  showRetry: boolean;
  /** 失败或跳过时的补充说明。 */
  detail: string | null;
}

export function usePresetLoadView(load: PresetLoadState): PresetLoadView {
  const [now, setNow] = useState(() => Date.now());
  const [retired, setRetired] = useState(false);

  // 只在 pending 期间走秒：终局后不再刷新，用时自然停在最后一次 tick。
  useEffect(() => {
    if (load.status !== 'pending') return;
    const timer = window.setInterval(() => { setNow(Date.now()); }, TICK_MS);
    return () => { window.clearInterval(timer); };
  }, [load.status]);

  useEffect(() => {
    if (load.status !== 'ready') return;
    const timer = window.setTimeout(() => { setRetired(true); }, READY_LINGER_MS);
    return () => { window.clearTimeout(timer); };
  }, [load.status]);

  const { done, total, status, degraded, startedAt } = load;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const elapsedSeconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const unit = status === 'ready' ? '总用时' : '已用';

  return {
    visible: !retired,
    tone: status,
    title: status === 'failed' ? '原著资料未能载入' : status === 'ready' ? '原著资料已就绪' : '正在载入原著资料',
    counter: `${status === 'ready' ? total : done} / ${total} · ${unit} ${elapsedSeconds}s`,
    percent,
    showSkip: status === 'pending' && elapsedSeconds * 1000 >= SKIP_AFTER_MS,
    showRetry: status === 'failed',
    detail: status !== 'failed'
      ? (status === 'pending' && elapsedSeconds * 1000 >= SKIP_AFTER_MS ? '可以先继续，正文稍后补齐。' : null)
      : (degraded ? '已改用本地缓存，正文可能不完整。' : '加载中断。'),
  };
}
