import { useState } from 'react';
import { smallClip } from './settingsShared';

export function V2DiagnosticsPanel({ scanIssues }: { scanIssues: string[] }) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.24)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <button
        type="button"
        onClick={() => setDiagnosticsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm"
        style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}
      >
        <span className="font-serif tracking-[0.14em]">运行诊断</span>
        <span className="text-xs" style={{ color: scanIssues.length > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.62)' }}>
          {scanIssues.length > 0 ? `${scanIssues.length} 项提示` : '结构正常'} · {diagnosticsOpen ? '收起' : '展开'}
        </span>
      </button>
      {diagnosticsOpen && (
        <div className="mt-2 grid gap-2 text-xs leading-6" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
          {(scanIssues.length > 0 ? scanIssues : ['暂未发现结构性问题']).map((item) => (
            <div key={item}>- {item}</div>
          ))}
          <div>- 格式保护层会在消息链末尾兜底 CoT、回复格式和行动选项。</div>
          <div>- 高级宏条目建议先查看右侧宏检测，再决定是否关闭。</div>
        </div>
      )}
    </div>
  );
}
