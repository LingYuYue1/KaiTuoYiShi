import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex min-h-screen items-center justify-center p-6"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(245,217,122,0.12), transparent 32%), linear-gradient(180deg, rgb(8,7,9), rgb(14,12,14))',
          }}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden p-6 text-center"
            style={{
              background: 'linear-gradient(180deg, rgba(18,16,18,0.96), rgba(8,7,9,0.98))',
              boxShadow:
                'inset 0 0 0 1px rgba(245,217,122,0.38), 0 24px 70px rgba(0,0,0,0.52), 0 0 36px rgba(245,217,122,0.08)',
              clipPath: 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)',
            }}
          >
            <div
              className="absolute left-0 right-0 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245,217,122,0.85), transparent)' }}
            />
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center font-serif text-2xl"
              style={{
                color: '#f5d97a',
                background: 'radial-gradient(circle, rgba(245,217,122,0.18), rgba(245,217,122,0.03))',
                boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.48), 0 0 18px rgba(245,217,122,0.18)',
                clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              }}
            >
              ◆
            </div>
            <div className="mb-2 font-mono text-[11px] tracking-[0.5em]" style={{ color: 'rgba(117,214,216,0.82)' }}>
              SYSTEM / TIMELINE ALERT
            </div>
            <h1
              className="mb-2 font-serif text-2xl font-bold tracking-[0.18em]"
              style={{
                background: 'linear-gradient(135deg, #fff4d4 0%, #f5d97a 55%, #c4a35a 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              时间线校准中断
            </h1>
            <p className="mx-auto mb-4 max-w-sm text-sm leading-relaxed" style={{ color: 'rgba(220,208,178,0.82)' }}>
              开拓记录遇到未处理的异常。刷新页面会重新接入最近的存档与本地状态。
            </p>
            <pre
              className="mb-5 max-h-36 overflow-auto px-3 py-3 text-left text-xs leading-relaxed"
              style={{
                background: 'rgba(4,4,6,0.58)',
                color: 'rgba(255,190,190,0.95)',
                boxShadow: 'inset 0 0 0 1px rgba(255,120,120,0.24)',
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 font-serif text-sm font-semibold tracking-[0.24em] transition-all hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, rgba(245,217,122,0.98), rgba(196,163,90,0.94))',
                color: '#1a1325',
                boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.52), 0 0 18px rgba(245,217,122,0.2)',
                clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              }}
            >
              重新接入
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
