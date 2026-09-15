// 内置预置资源的载入进度条（纯渲染，只在首页与开局向导渲染）。
//
// 存在的理由：首页出现后还要拉 50 个文件、约 7.3 MB gzip 的原著正文与智库目录（是整个 JS 包的
// 七倍多），而这段时间依赖它们的入口是禁用的——必须让玩家看见「在等什么、等了多久、还有多少」，
// 否则禁用就只是莫名其妙的点不动。全部判断都在 usePresetLoadView，这里只把展示模型铺成 DOM。

import { useSyncExternalStore } from 'react';
import type { PresetLoader } from '@/services/presetLoader';
import { usePresetLoadView } from '@/hooks/usePresetLoadView';

interface PresetLoadBarProps {
  loader: PresetLoader;
  onRetry: () => void;
}

export function PresetLoadBar({ loader, onRetry }: PresetLoadBarProps) {
  // 进度订阅落在本组件：进度变化只重渲染这条进度条，不牵动 App。
  const load = useSyncExternalStore(loader.subscribe, loader.getSnapshot);
  const view = usePresetLoadView(load);

  if (!view.visible) return null;

  const failed = view.tone === 'failed';

  return (
    <div
      className={`${view.fading ? 'animate-preset-fade-out' : 'animate-slide-up'} fixed bottom-20 left-1/2 z-30 w-[min(92vw,26rem)] -translate-x-1/2 px-1`}
      role={failed ? 'alert' : undefined}
    >
      <div
        className="px-3.5 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary),0.94), rgba(var(--tj-bg-primary),0.96))',
          boxShadow: '0 14px 36px rgba(0,0,0,0.42)',
          clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        }}
      >
        <div
          className="mb-2 flex items-center justify-between gap-3 text-[12px]"
          style={{ color: 'rgba(var(--tj-text-secondary),0.86)' }}
        >
          <span className="min-w-0 truncate">{view.title}</span>
          <span className="shrink-0 font-mono">{view.counter}</span>
        </div>

        <div
          className="h-1.5 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={view.total}
          aria-valuenow={view.done}
          aria-label="原著资料载入进度"
          style={{
            background: 'rgba(var(--tj-bg-secondary),0.85)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)',
          }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${view.percent}%`,
              background: failed
                ? 'linear-gradient(90deg, rgba(var(--tj-danger),0.9), rgba(var(--tj-danger),0.7))'
                : 'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.9), rgba(var(--tj-accent-primary),0.95))',
            }}
          />
        </div>

        {view.detail && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span
              className="text-[11px] leading-relaxed"
              style={{ color: failed ? 'rgba(var(--tj-danger),0.92)' : 'rgba(var(--tj-text-secondary),0.72)' }}
            >
              {view.detail}
            </span>
            {view.showRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 px-3 py-1 font-serif text-[12px] tracking-[0.18em] transition-opacity hover:opacity-85"
                style={{
                  color: 'rgb(var(--tj-on-accent))',
                  background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgb(var(--tj-tech-cyan)) 100%)',
                }}
              >
                重试
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
