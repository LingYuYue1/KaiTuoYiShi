// 预置载入进度的**展示模型**：所有判断（何时出现、如何退场、百分比、文案）都在这里，
// 界面组件只做投影。
//
// 进度条**只投影网络段**：网络完成之后的解析/归一化/合并/落盘属于加工段，不驱动进度显示。
// 计时为什么在这里而不是 loader：每秒跳一次会让整个 App 重渲染，而 App 很重。
// 计时是纯展示节奏，放在持有它的叶子视图自己的钩子里，代价只有这一个节点。

import { useEffect, useState } from 'react';
import type { PresetSnapshot } from '@/services/presetLoader';

/** 走秒间隔：只用于显示「已用 Ns」。 */
const TICK_MS = 1000;
/** 网络段持续超过这个时长才出现：网络在首帧前完成时，进度条根本不渲染，避免 0→100 闪现。 */
const NETWORK_APPEAR_MS = 300;
/** 网络完成后的退场时序：finishDownload 0.1s → stay 0.3s → fade 0.3s。 */
const FINISH_MS = 100;
const HOLD_MS = 300;
const FADE_MS = 300;

type DisplayState = 'idle' | 'showing' | 'finishing' | 'holding' | 'fading' | 'gone';

export interface PresetLoadView {
  /** 是否渲染。 */
  visible: boolean;
  /** 正在淡出（供组件加淡出类名）。 */
  fading: boolean;
  tone: 'pending' | 'finishing' | 'failed';
  title: string;
  /** 「12 / 50 · 已用 8s」 */
  counter: string;
  done: number;
  total: number;
  percent: number;
  /** 终局为失败。 */
  showRetry: boolean;
  /** 失败时指名哪一路、为什么。 */
  detail: string | null;
}

function describeFailure(load: PresetSnapshot): string {
  const problems: string[] = [];
  if (load.story.status === 'failed') problems.push(`原著正文：${load.story.reason}`);
  if (load.zhiku.status === 'failed') problems.push(`智库目录：${load.zhiku.reason}`);
  return problems.join('；');
}

export function usePresetLoadView(load: PresetSnapshot): PresetLoadView {
  const [now, setNow] = useState(() => Date.now());
  // 显示状态与运行号绑定：retry 换了 startedAt 时自动回到 idle，无需在 effect 里重置。
  // 初值用哨兵运行号：首次渲染发生在 start() 之前，绑定当时的 startedAt 会与 start() 后的值错配。
  const [progress, setProgress] = useState<{ run: number; state: DisplayState }>(
    () => ({ run: -1, state: 'idle' }),
  );
  const displayState: DisplayState = progress.run === load.startedAt ? progress.state : 'idle';

  const failed = load.story.status === 'failed' || load.zhiku.status === 'failed';
  const networkActive = load.phase === 'network';

  // 网络段持续够久才出现。
  useEffect(() => {
    if (!networkActive || displayState !== 'idle') return;
    const run = load.startedAt;
    const timer = window.setTimeout(() => {
      setProgress((current) => (current.state === 'idle' ? { run, state: 'showing' } : current));
    }, NETWORK_APPEAR_MS);
    return () => { window.clearTimeout(timer); };
  }, [networkActive, displayState, load.startedAt]);

  // 网络完成后退场：showing → finishing → holding → fading → gone。
  useEffect(() => {
    if (networkActive) return;
    const run = load.startedAt;
    const step: { to: DisplayState; ms: number } | null =
      displayState === 'showing' ? { to: 'finishing', ms: 0 }
        : displayState === 'finishing' ? { to: 'holding', ms: FINISH_MS }
          : displayState === 'holding' ? { to: 'fading', ms: HOLD_MS }
            : displayState === 'fading' ? { to: 'gone', ms: FADE_MS }
              : null;
    if (!step) return;
    const { to, ms } = step;
    const timer = window.setTimeout(() => {
      setProgress((current) => (current.run === run && current.state === displayState ? { run, state: to } : current));
    }, ms);
    return () => { window.clearTimeout(timer); };
  }, [networkActive, displayState, load.startedAt]);

  // 只在「正在显示的网络段」走秒。
  useEffect(() => {
    if (!networkActive || displayState !== 'showing') return;
    const timer = window.setInterval(() => { setNow(Date.now()); }, TICK_MS);
    return () => { window.clearInterval(timer); };
  }, [networkActive, displayState]);

  const { done, total } = load.network;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const elapsedSeconds = Math.max(0, Math.round((now - load.startedAt) / 1000));

  const tone: PresetLoadView['tone'] = failed
    ? 'failed'
    : displayState === 'finishing' || displayState === 'holding'
      ? 'finishing'
      : 'pending';
  const visible = failed || (displayState !== 'idle' && displayState !== 'gone');
  const title = failed
    ? '原著资料未能载入'
    : tone === 'finishing'
      ? '原著资料已接收'
      : '正在接收原著资料';

  return {
    visible,
    fading: !failed && displayState === 'fading',
    tone,
    title,
    counter: `${done} / ${total} · ${tone === 'finishing' ? '总用时' : '已用'} ${elapsedSeconds}s`,
    done,
    total,
    percent,
    showRetry: failed,
    detail: failed ? describeFailure(load) : null,
  };
}
