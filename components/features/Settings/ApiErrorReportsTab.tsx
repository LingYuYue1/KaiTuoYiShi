import { useEffect, useMemo, useState } from 'react';
import {
  clearApiErrorReports,
  loadApiErrorReports,
  sanitizeRequestUrlForReport,
  type ApiErrorReport,
} from '@/services/ai/apiErrorReportService';

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatReport(report: ApiErrorReport): string {
  return [
    `时间: ${formatTime(report.createdAt)}`,
    `模块: ${report.source}`,
    `供应商: ${report.provider || '-'}`,
    `模型: ${report.model || '-'}`,
    `Base URL: ${report.baseUrl || '-'}`,
    `API Key: ${report.apiKeyHint || '-'}`,
    `状态码: ${report.status ?? '-'}`,
    `请求模式: ${report.requestMode || '-'}`,
    // 纵深保护：展示与复制一律使用脱敏后的请求地址，不允许复制原始 requestUrl。
    `请求地址: ${sanitizeRequestUrlForReport(report.requestUrl) || '-'}`,
    '',
    '错误信息:',
    report.message || '-',
    report.responseText ? `\n原始响应:\n${report.responseText}` : '',
  ].filter(Boolean).join('\n');
}

export function ApiErrorReportsTab() {
  const [reports, setReports] = useState<ApiErrorReport[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const list = await loadApiErrorReports();
    setReports(list);
    setSelectedId((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id ?? ''));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => reports.find((item) => item.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const handleClear = async () => {
    if (!window.confirm('确定清空所有 API 错误报告吗？')) return;
    await clearApiErrorReports();
    setReports([]);
    setSelectedId('');
    setMessage('错误报告已清空。');
  };

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(formatReport(selected));
    setMessage('已复制当前错误报告。');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2
          className="font-serif text-xl font-bold tracking-[0.18em]"
          style={{ color: 'rgb(var(--tj-text-primary))' }}
        >
          API 错误报告
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
          当主剧情、连接测试或模型列表请求失败时，系统会在这里记录供应商、模型、Base URL、状态码和原始错误，方便定位真实原因。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void refresh()} className="kaituo-btn kaituo-btn-secondary px-4 py-2 text-xs">
          刷新
        </button>
        <button onClick={() => void handleCopy()} disabled={!selected} className="kaituo-btn kaituo-btn-secondary px-4 py-2 text-xs disabled:opacity-50">
          复制当前报告
        </button>
        <button onClick={() => void handleClear()} disabled={!reports.length} className="kaituo-btn kaituo-btn-secondary px-4 py-2 text-xs disabled:opacity-50">
          清空报告
        </button>
      </div>

      {message && <div className="text-xs" style={{ color: 'rgba(160, 200, 160, 0.85)' }}>{message}</div>}

      {reports.length === 0 ? (
        <div className="p-4 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.55)', clipPath: smallClip }}>
          暂无 API 错误报告。
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedId(report.id)}
                className="w-full p-3 text-left text-xs transition-all hover:opacity-90"
                style={{
                  color: 'rgba(var(--tj-text-primary), 0.88)',
                  background: report.id === selected?.id ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-bg-secondary), 0.42)',
                  boxShadow: `inset 0 0 0 1px ${report.id === selected?.id ? 'rgba(var(--tj-accent-primary), 0.45)' : 'rgba(var(--tj-border), 0.38)'}`,
                  clipPath: smallClip,
                }}
              >
                <div className="truncate font-serif tracking-[0.12em]">{report.source}</div>
                <div className="mt-1 truncate" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {report.provider || '-'} / {report.model || '-'}
                </div>
                <div className="mt-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  {formatTime(report.createdAt)}
                </div>
              </button>
            ))}
          </div>

          <pre
            className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed"
            style={{
              color: 'rgba(var(--tj-text-primary), 0.86)',
              background: 'rgba(var(--tj-bg-secondary), 0.46)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
              clipPath: smallClip,
            }}
          >
            {selected ? formatReport(selected) : ''}
          </pre>
        </div>
      )}
    </div>
  );
}
