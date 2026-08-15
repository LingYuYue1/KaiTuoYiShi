import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列, 剧情编织运行状态 } from '@/models/storyWeaving';
import { cardClip, runtimeStatusBg, runtimeStatusColor, runtimeStatusOptions, smallClip } from './constants';
import type { SegmentDraft } from './logic';
import { ManualEditor } from './ManualEditor';
import { InfoBlock, InfoGrid, VisibleList } from './primitives';

export function SegmentDetail({
  series,
  segment,
  draft,
  progress,
  onDraftChange,
  busy,
  onDecompose,
  onSetCurrent,
  onSetRuntimeStatus,
  onSaveDraft,
  onResetDraft,
}: {
  series: 剧情编织系列;
  segment: 剧情编织分段;
  draft: SegmentDraft;
  progress?: 剧情编织进度锚点;
  onDraftChange: (draft: SegmentDraft) => void;
  busy: boolean;
  onDecompose: () => void;
  onSetCurrent: () => void;
  onSetRuntimeStatus: (status: 剧情编织运行状态) => void;
  onSaveDraft: () => void;
  onResetDraft: () => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className="px-3 py-3 md:px-4"
        style={{ background: 'rgba(var(--tj-accent-primary),0.045)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: cardClip }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="break-words font-serif text-[15px] font-bold md:text-base" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{segment.标题}</div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
              {series.标题} · {series.来源类型 === 'canon' ? '原著轨道' : '自制轨道'} · {segment.章节范围} · {segment.字数} 字 · {segment.启用注入 ? '参与注入' : '不注入'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>运行状态</span>
              {runtimeStatusOptions.map((status) => {
                const active = segment.运行状态 === status;
                return (
                  <button
                    key={status}
                    type="button"
                    className="px-2 py-1 text-[11px] transition-all"
                    disabled={busy}
                    onClick={() => onSetRuntimeStatus(status)}
                    style={{
                      color: active ? 'rgb(var(--tj-text-primary))' : runtimeStatusColor[status],
                      background: active ? runtimeStatusBg[status] : 'rgba(var(--tj-bg-primary),0.36)',
                      boxShadow: `inset 0 0 0 1px ${active ? runtimeStatusColor[status] : 'rgba(var(--tj-accent-primary),0.12)'}`,
                      clipPath: smallClip,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:justify-end">
            <button className="panel-btn" disabled={busy} onClick={onSetCurrent}>设为当前</button>
            <button className="panel-btn" onClick={onResetDraft}>还原草稿</button>
            <button className="panel-btn" disabled={busy} onClick={onSaveDraft}>保存修改</button>
            <button className="panel-btn strong" disabled={busy} onClick={onDecompose}>
              {busy ? '分解中...' : segment.处理状态 === '已完成' ? '重新分解' : 'AI 分解'}
            </button>
          </div>
        </div>
        {segment.最近错误 && <div className="mt-2 text-xs" style={{ color: 'rgba(var(--tj-danger),0.9)' }}>{segment.最近错误}</div>}
      </div>

      {progress && (
        <InfoBlock title="当前章节进度锚点" empty="暂无锚点。" hasContent>
          <div className="grid gap-2 md:grid-cols-2">
            <div>推进状态：{progress.推进状态}</div>
            <div>当前分段：{progress.当前分段组号}</div>
            <div>最近判定回合：{progress.最近一次推进判定回合 ?? '未记录'}</div>
            <div>最近门禁：{progress.最近门禁结果 ?? '未记录'}</div>
          </div>
          <div className="mt-2 space-y-1">
            {progress.切换说明.slice(-3).map((item, index) => <div key={`${item}_${index}`}>- {item}</div>)}
            {!progress.切换说明.length && <div style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>暂无切换说明</div>}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>
              <div style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>已完成摘要</div>
              {(progress.已完成摘要.slice(-5).length ? progress.已完成摘要.slice(-5) : ['暂无']).map((item, index) => <div key={`${item}_${index}`}>- {item}</div>)}
            </div>
            <div>
              <div style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>最近判定理由</div>
              {(progress.最近判定理由.length ? progress.最近判定理由 : ['暂无']).map((item, index) => <div key={`${item}_${index}`}>- {item}</div>)}
            </div>
          </div>
          {progress.历史归档.length > 0 && (
            <div className="mt-2">
              <div style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>历史归档</div>
              {progress.历史归档.slice(-5).map((item) => (
                <div key={item.id} className="mt-1">
                  - 第{item.分段组号}段「{item.分段标题}」｜{item.归档状态}{item.归档回合 ? `｜回合 ${item.归档回合}` : ''}：{item.摘要 || '无摘要'}
                </div>
              ))}
            </div>
          )}
        </InfoBlock>
      )}

      <ManualEditor draft={draft} onDraftChange={onDraftChange} />

      <InfoBlock title="本段概括" empty="尚未分解。" hasContent={Boolean(segment.本段概括.trim())}>
        {segment.本段概括}
      </InfoBlock>

      <InfoGrid
        items={[
          ['前段延续事实', segment.前段延续事实],
          ['本段结束状态', segment.本段结束状态],
          ['给后续参考', segment.给后续参考],
          ['登场角色', segment.登场角色],
          ['涉及地点', segment.涉及地点],
          ['涉及派系', segment.涉及派系],
        ]}
      />

      <InfoGrid
        items={[
          ['开局已成立事实', segment.开局已成立事实],
          ['时间线起点', segment.时间线起点 ? [segment.时间线起点] : []],
          ['时间线终点', segment.时间线终点 ? [segment.时间线终点] : []],
          ['时间线概览', segment.时间线.map((item) => `${item.时间锚点 || '未知'} · ${item.标题}`)],
        ]}
      />

      <InfoBlock title="原著硬约束" empty="暂无硬约束。" hasContent={segment.原著硬约束.length > 0}>
        <VisibleList items={segment.原著硬约束} />
      </InfoBlock>

      <InfoBlock title="可提前铺垫" empty="暂无可提前铺垫。" hasContent={segment.可提前铺垫.length > 0}>
        <VisibleList items={segment.可提前铺垫} />
      </InfoBlock>

      <InfoBlock title="关键事件" empty="暂无关键事件。" hasContent={segment.关键事件.length > 0}>
        <div className="space-y-2">
          {segment.关键事件.map((event, index) => (
            <div key={`${event.事件名}_${index}`} className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.84)' }}>
              <span style={{ color: 'rgb(var(--tj-accent-primary))' }}>[{index + 1}] {event.事件名 || '未命名事件'}</span>
              {event.事件说明 ? `：${event.事件说明}` : ''}
              {event.触发条件.length > 0 && <div className="mt-1" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>触发：{event.触发条件.join('；')}</div>}
              {event.事件结果.length > 0 && <div style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>结果：{event.事件结果.join('；')}</div>}
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="角色推进" empty="暂无角色推进。" hasContent={segment.角色推进.length > 0}>
        <div className="space-y-2">
          {segment.角色推进.map((item, index) => (
            <div key={`${item.角色名}_${index}`}>
              <div style={{ color: 'rgb(var(--tj-accent-primary))' }}>{item.角色名}</div>
              <div className="mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
                {[...item.本段变化, ...item.本段后状态, ...item.对后续影响].slice(0, 5).join('；') || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="角色档案" empty="暂无角色档案。" hasContent={segment.角色档案.length > 0}>
        <div className="space-y-2">
          {segment.角色档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: 'rgb(var(--tj-accent-primary))' }}>{item.名称} · {item.身份 || '无'}</div>
              <div className="mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
                {item.所属势力 || '无'} · {item.初始立场 || '无'} · {item.重要性}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="势力档案" empty="暂无势力档案。" hasContent={segment.势力档案.length > 0}>
        <div className="space-y-2">
          {segment.势力档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: 'rgb(var(--tj-accent-primary))' }}>{item.名称} · {item.类型 || '无'}</div>
              <div className="mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
                {item.地盘 || '无'} · {item.立场目标 || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="地点档案" empty="暂无地点档案。" hasContent={segment.地图地点档案.length > 0}>
        <div className="space-y-2">
          {segment.地图地点档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: 'rgb(var(--tj-accent-primary))' }}>{item.名称} · {item.层级}</div>
              <div className="mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
                {item.上级地点 || '无'} · {item.所属势力 || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="原文预览" empty="无原文。" hasContent={Boolean(segment.原文内容.trim())}>
        <pre
          className="kaituo-options-scroll max-h-80 overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-relaxed"
          style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}
        >
          {segment.原文内容}
        </pre>
      </InfoBlock>
    </div>
  );
}
