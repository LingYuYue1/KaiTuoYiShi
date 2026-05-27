import { useMemo, useState } from 'react';
import type { ContextSnapshot, ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import { formatTokenCount } from '@/utils/tokenEstimate';

interface Props {
  getSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  onRefresh: () => void;
}

type ViewMode = 'all' | 'single';

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const SNAPSHOT_TABS: Array<{ key: ContextSnapshotKind; label: string }> = [
  { key: 'main', label: '主剧情' },
  { key: 'variable', label: '变量模型' },
  { key: 'phone', label: '手机系统' },
  { key: 'news', label: '星际周报' },
  { key: 'yiting', label: '忆庭召回' },
  { key: 'zhiku', label: '智库召回' },
];

export function ContextViewerTab({ getSnapshot, onRefresh }: Props) {
  const [snapshotKind, setSnapshotKind] = useState<ContextSnapshotKind>('main');
  const snapshot = getSnapshot(snapshotKind);
  const [mode, setMode] = useState<ViewMode>('all');
  const [selectedId, setSelectedId] = useState(snapshot.sections[0]?.id ?? '');
  const [copyHint, setCopyHint] = useState('');

  const selected = useMemo(
    () => snapshot.sections.find((section) => section.id === selectedId) ?? snapshot.sections[0],
    [selectedId, snapshot.sections],
  );
  const content = mode === 'all' ? snapshot.fullText : selected?.content ?? '';
  const shownTokens = mode === 'all' ? snapshot.estimatedTokens : selected?.estimatedTokens ?? 0;

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopyHint(`${label}已复制`);
    window.setTimeout(() => setCopyHint(''), 1600);
  };

  return (
    <div className="flex h-full min-h-[620px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-bold tracking-[0.24em] text-[rgb(var(--tj-accent-primary))]">
            {snapshot.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#d8caa4]/80">
            <span>顺序与类目一览</span>
            <span>估算上传 Tokens：{formatTokenCount(snapshot.estimatedTokens)}</span>
            <span>区块：{snapshot.sections.length} 项</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass(false)} onClick={onRefresh}>刷新</button>
          <button className={buttonClass(false)} onClick={() => void copyText(content, mode === 'all' ? '全部上下文' : '当前区块')}>
            复制
          </button>
          {SNAPSHOT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={buttonClass(snapshotKind === tab.key)}
              onClick={() => {
                setSnapshotKind(tab.key);
                setMode('all');
                setSelectedId(getSnapshot(tab.key).sections[0]?.id ?? '');
              }}
            >
              {tab.label}
            </button>
          ))}
          <button className={buttonClass(mode === 'all')} onClick={() => setMode('all')}>全部内容</button>
          <button className={buttonClass(mode === 'single')} onClick={() => setMode('single')}>单项查看</button>
        </div>
      </div>

      <div
        className="px-4 py-3 text-xs leading-6 text-[#d8caa4]/80"
        style={{ border: '1px solid rgba(var(--tj-accent-primary),0.22)', background: 'rgba(0,0,0,0.22)', clipPath: cardClip }}
      >
        <span className="text-[rgb(var(--tj-accent-primary))]">说明：</span>
        当前为本地预览计数，不会调用 API。Token 为估算值，用来判断上下文体量；真实计费以模型服务商为准。
        {snapshot.sourceInput ? <span className="ml-2">参考输入：{snapshot.sourceInput.slice(0, 80)}</span> : null}
        {copyHint ? <span className="ml-3 text-emerald-300">{copyHint}</span> : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4">
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ border: '1px solid rgba(var(--tj-accent-primary),0.2)', background: 'rgba(0,0,0,0.28)', clipPath: cardClip }}
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--tj-accent-primary))]/15 px-4 py-3 text-xs text-[#d8caa4]/75">
            <span>上下文顺序</span>
            <span>{snapshot.sections.length} 项</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#121012] text-[rgb(var(--tj-accent-primary))]/80">
                <tr>
                  <th className="w-10 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-center">#</th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">类目</th>
                  <th className="border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">项目</th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-right">Token</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.sections.map((section) => {
                  const active = section.id === selected?.id;
                  return (
                    <tr
                      key={section.id}
                      className={`cursor-pointer border-b border-white/5 ${active ? 'bg-[rgb(var(--tj-accent-primary))]/12' : 'hover:bg-white/5'}`}
                      onClick={() => {
                        setSelectedId(section.id);
                        setMode('single');
                      }}
                    >
                      <td className="p-2 text-center text-[#d8caa4]/70">{section.order}</td>
                      <td className="p-2 text-[#d8caa4]/75">{section.category}</td>
                      <td className="max-w-[170px] truncate p-2 text-[#f4ead0]" title={section.title}>{section.title}</td>
                      <td className="p-2 text-right text-[#d8caa4]/70">{formatTokenCount(section.estimatedTokens)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ border: '1px solid rgba(var(--tj-accent-primary),0.2)', background: 'rgba(0,0,0,0.28)', clipPath: cardClip }}
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--tj-accent-primary))]/15 px-4 py-3 text-xs text-[#d8caa4]/75">
            <span>{mode === 'all' ? '全部上下文内容' : selected?.title ?? '单项内容'}</span>
            <span>估算上传 {formatTokenCount(shownTokens)} Tokens</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[#eee8d6]">
              {content || '暂无上下文内容'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function buttonClass(active: boolean): string {
  return [
    'px-3 py-2 text-xs transition-colors',
    active
      ? 'border border-[rgb(var(--tj-accent-primary))]/80 bg-[rgb(var(--tj-accent-primary))]/15 text-[rgb(var(--tj-accent-primary))]'
      : 'border border-[#9fb8ff]/50 bg-black/20 text-[#d7e2ff] hover:border-[rgb(var(--tj-accent-primary))]/65 hover:text-[rgb(var(--tj-accent-primary))]',
  ].join(' ');
}
