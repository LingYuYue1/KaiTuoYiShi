import { memo, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 相册系统 } from '@/models/imageGeneration';
import { getPath } from '@/data/journeyPresets';
import { PATH_STAGE_DEFS } from '@/models/path';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';

interface LeftPanelProps {
  traveler: 角色数据结构;
  /** 点击头像 / 名字时触发，打开旅人档案只读弹窗。 */
  onOpenProfile?: () => void;
  onOpenPhone?: () => void;
  phoneUnread?: number;
  album?: 相册系统;
  currentStoryChapter?: string;
  recallSummary?: string;
  recallFullContent?: string;
  desktop?: boolean;
}

export const LeftPanel = memo(function LeftPanel({
  traveler,
  onOpenProfile,
  onOpenPhone,
  phoneUnread = 0,
  album,
  currentStoryChapter,
  recallSummary = '',
  recallFullContent = '',
  desktop = true,
}: LeftPanelProps) {
  const mainPath = traveler.命途列表?.find((path) => path.是否主命途) ?? traveler.命途列表?.[0];
  const pathDef = mainPath ? getPath(mainPath.id) : traveler.主命途 ? getPath(traveler.主命途) : undefined;
  const pathStageDef = mainPath ? PATH_STAGE_DEFS.find((stage) => stage.stage === mainPath.阶段) : undefined;
  const pathLabel = pathDef
    ? [
        mainPath?.是否主命途 ? '主命途' : '',
        pathDef.name,
        pathStageDef?.name,
      ].filter(Boolean).join(' · ')
    : '尚未踏上';
  const avatarUrl = 解析相册资源引用(album, traveler.头像?.trim() || traveler.图像档案?.头像?.trim());

  if (!desktop) return null;

  return (
    <div className="kaituo-left-panel relative hidden md:flex md:w-[16%] min-w-[200px] max-w-[240px] flex-col">
      {/* 顶部金线装饰条 */}
      <div
        className="px-4 py-3.5 text-center"
        style={{ borderBottom: '1px solid rgba(var(--tj-border), 0.72)' }}
      >
        <div
          className="font-serif text-[11px] tracking-[0.5em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
        >
          ◆ TRAVELER
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {/* 头像 + 姓名：整块可点击，打开只读档案弹窗 */}
        <button
          type="button"
          onClick={onOpenProfile}
          disabled={!onOpenProfile}
          title={onOpenProfile ? '查看旅人档案' : undefined}
          className="group mt-1 flex flex-col items-center transition-all hover:opacity-95 disabled:cursor-default disabled:hover:opacity-100"
        >
          {/* Avatar */}
          <div className="relative">
            <div
              className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden font-serif text-4xl font-bold transition-all group-hover:scale-[1.03]"
              style={{
                background:
                  avatarUrl
                    ? 'rgba(var(--tj-surface-strong), 0.72)'
                    : 'radial-gradient(circle, rgba(var(--tj-bubble), 0.98) 0%, rgba(var(--tj-surface-strong), 0.95) 100%)',
                boxShadow:
                  'inset 0 0 0 1.5px rgba(var(--tj-border), 0.9), 0 10px 18px rgba(var(--tj-shadow), 0.1)',
                color: 'rgb(var(--tj-accent-primary))',
                clipPath:
                  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
              }}
            >
              {avatarUrl ? (
                <ResilientImage src={avatarUrl} alt={`${traveler.姓名 || '旅人'} 头像`} className="h-full w-full object-cover" />
              ) : (
                traveler.姓名 ? traveler.姓名[0] : '?'
              )}
            </div>
            <span
              className="absolute -top-1.5 -right-1.5 text-base"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.8)', textShadow: '0 0 6px rgba(var(--tj-accent-primary), 0.6)' }}
            >
              ✦
            </span>
            <span
              className="absolute -bottom-1.5 -left-1.5 text-base"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}
            >
              ◆
            </span>
          </div>

          {/* Name */}
          <div className="mt-4 text-center">
            <div
              className="font-serif text-xl font-bold tracking-[0.2em]"
              style={{
                background: 'linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {traveler.姓名 || '无名开拓者'}
            </div>
            {traveler.别名 && (
              <div
                className="mt-1 font-serif text-[11px] italic tracking-[0.22em]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
              >
                「{traveler.别名}」
              </div>
            )}
            {onOpenProfile && (
              <div
                className="mt-2 font-serif text-[10px] tracking-[0.3em] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
              >
                ✦ 查看档案
              </div>
            )}
          </div>
        </button>

        {/* 旅人摘要 */}
        <div className="mt-5 space-y-3">
          <InfoLine label="身份" value={traveler.身份 || traveler.背景 || '未记录'} />
          <InfoLine label="命途" value={pathLabel} />
        </div>

        <button
          type="button"
          onClick={onOpenPhone}
          disabled={!onOpenPhone}
          className="mt-4 flex items-center justify-between px-3 py-2.5 transition-all hover:opacity-90 disabled:cursor-default"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.08), rgba(var(--tj-accent-primary), 0.025))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.78)',
            clipPath:
              'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
          }}
          title="打开手机"
        >
          <span className="flex items-center gap-2">
            <span className="font-serif text-base" style={{ color: 'rgb(var(--tj-accent-primary))' }}>▣</span>
            <span className="font-serif text-[13px] font-semibold tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.92)' }}>
              手机
            </span>
          </span>
          {phoneUnread > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                color: 'rgb(var(--tj-ui-active-text))',
                background: 'rgba(220, 80, 80, 0.42)',
                boxShadow: '0 0 10px rgba(220, 80, 80, 0.35)',
              }}
            >
              {phoneUnread}
            </span>
          )}
        </button>
        {currentStoryChapter && (
          <div
            className="mt-2 px-3 py-2"
style={{
          background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.07), rgba(var(--tj-accent-primary), 0.04))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.22)',
              clipPath:
                'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            }}
          >
            <div className="font-serif text-[10px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}>
              当前注入章节
            </div>
            <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary),0.9)' }}>
              {currentStoryChapter}
            </div>
          </div>
        )}
        <RecallSummaryWindow content={recallSummary} fullContent={recallFullContent} />
      </div>
    </div>
  );
});

function RecallSummaryWindow({ content, fullContent }: { content: string; fullContent: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = content.trim();
  const full = fullContent.trim();
  const lines = trimmed ? trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  const entryCount = lines.reduce((sum, line) => {
    const [, value = ''] = line.split(/[:：]/);
    if (!value.trim() || value.trim() === '无') return sum;
    return sum + value.split(/[，,|]/).map((item) => item.trim()).filter(Boolean).length;
  }, 0);
  return (
    <section
      className="mt-3 flex min-h-[150px] flex-1 flex-col overflow-hidden px-3 py-2.5"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.055), rgba(var(--tj-accent-primary),0.035))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.22)',
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-serif text-[10px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.86)' }}>
          召回摘要
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="font-serif text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>
            {entryCount > 0 ? `${entryCount} 条` : '无命中'}
          </div>
          <button
            type="button"
            disabled={!full}
            onClick={() => setExpanded((value) => !value)}
            className="px-1.5 py-0.5 font-serif text-[10px] tracking-[0.14em] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
            style={{
              color: 'rgba(var(--tj-tech-cyan),0.9)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.22)',
              background: 'rgba(var(--tj-tech-cyan),0.055)',
              clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            }}
            title={full ? '显示完整召回内容' : '本回合没有完整召回内容'}
          >
            {expanded ? '收起' : '完整'}
          </button>
        </div>
      </div>
      <div
        className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 text-[11px] leading-relaxed"
        style={{ color: 'rgba(var(--tj-text-primary),0.88)' }}
      >
        {expanded && full ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[10.5px] leading-relaxed">{full}</pre>
        ) : lines.length ? (
          <div className="space-y-2">
            {lines.map((line, index) => {
              const [label, ...rest] = line.split(/[:：]/);
              const value = rest.join('：').trim();
              return (
                <div key={`${label}-${index}`}>
                  <div className="font-serif text-[10px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}>
                    {label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary),0.9)' }}>
                    {value || '无'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="font-serif tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary),0.64)' }}>
            本回合无召回摘要
          </div>
        )}
      </div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.045)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
        clipPath:
          'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
      }}
    >
      <div className="font-serif text-[11px] tracking-[0.32em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
        ◆ {label}
      </div>
      <div className="mt-1 truncate font-serif text-[13px] font-semibold tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary), 0.95)' }}>
        {value}
      </div>
    </div>
  );
}
