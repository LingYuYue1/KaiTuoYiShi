import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 命途定义, 命途ID } from '@/models/journey';
import type { 命途进度, 命途阶段 } from '@/models/path';
import {
  PATH_STAGE_DEFS,
  获取命途特质,
  STAGE_PROGRESS_MAX,
} from '@/models/path';
import { paths as ALL_PATHS } from '@/data/journeyPresets';

interface PathPanelProps {
  traveler: 角色数据结构;
  onTravelerChange: (next: 角色数据结构) => void;
  onAwakenedNewPath?: (pathId: 命途ID) => void;
}

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const panelStyle = {
  background:
    'linear-gradient(180deg, rgba(18, 16, 18, 0.96), rgba(9, 8, 10, 0.98))',
  boxShadow:
    'inset 0 0 0 1px rgba(245, 217, 122, 0.22), 0 18px 45px rgba(0, 0, 0, 0.22)',
  clipPath: cardClip,
};

export function PathPanel({ traveler, onTravelerChange }: PathPanelProps) {
  const active = traveler.命途列表 ?? [];
  const cards = useMemo(() => ALL_PATHS.filter((p) => p.id !== 'none'), []);

  const defaultSelected: 命途ID = useMemo(() => {
    const primary = active.find((p) => p.是否主命途);
    if (primary) return primary.id;
    if (active.length > 0) return active[0].id;
    return cards[0]?.id ?? 'hunt';
  }, [active, cards]);

  const [selectedId, setSelectedId] = useState<命途ID>(defaultSelected);

  useEffect(() => {
    if (!cards.some((c) => c.id === selectedId)) {
      setSelectedId(defaultSelected);
    }
  }, [cards, defaultSelected, selectedId]);

  const selectedDef = cards.find((c) => c.id === selectedId) ?? cards[0];
  const selectedRecord = active.find((a) => a.id === selectedId);
  const awakenedCount = active.length;
  const primaryRecord = active.find((p) => p.是否主命途);
  const primaryDef = cards.find((p) => p.id === primaryRecord?.id);

  const handleSetPrimary = async (pathId: 命途ID) => {
    const { setPrimaryPath } = await import('@/services/pathService');
    onTravelerChange(setPrimaryPath(traveler, pathId));
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[246px] min-h-0 shrink-0 flex-col gap-3">
        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="命途总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="已承载" value={`${awakenedCount}`} />
            <MetricTile label="主命途" value={primaryDef?.name ?? '未定'} />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {cards.map((def) => {
            const record = active.find((a) => a.id === def.id);
            return (
              <PathListItem
                key={def.id}
                def={def}
                record={record}
                selected={def.id === selectedId}
                onClick={() => setSelectedId(def.id)}
              />
            );
          })}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto pr-1">
        {selectedDef && (
          <PathDetails
            def={selectedDef}
            record={selectedRecord}
            onSetPrimary={() => handleSetPrimary(selectedDef.id)}
          />
        )}
      </main>
    </div>
  );
}

function PathListItem({
  def,
  record,
  selected,
  onClick,
}: {
  def: 命途定义;
  record?: 命途进度;
  selected: boolean;
  onClick: () => void;
}) {
  const walked = Boolean(record);
  const stage = record ? safeStage(record.阶段) : 0;
  const progress = record ? clampProgress(record.进度) : 0;
  const originLabel = record ? getPathOriginLabel(record) : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full px-3 py-3 text-left transition-all"
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.18), rgba(245, 217, 122, 0.045))'
          : walked
            ? 'rgba(245, 217, 122, 0.055)'
            : 'rgba(160, 148, 120, 0.04)',
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.62), inset 3px 0 0 rgba(245, 217, 122, 0.9)'
          : walked
            ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.28)'
            : 'inset 0 0 0 1px rgba(160, 148, 120, 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center gap-3">
        <PathEmblem def={def} active={walked} selected={selected} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-serif text-[15px] font-semibold tracking-[0.18em]"
              style={{ color: walked ? '#f5d97a' : 'rgba(235, 223, 193, 0.9)' }}
            >
              {def.name}
            </span>
            {record?.是否主命途 && <Badge tone="gold">主</Badge>}
          </div>
          <div
            className="mt-1 truncate font-serif text-[12px] tracking-[0.12em]"
            style={{ color: 'rgba(220, 208, 178, 0.82)' }}
          >
            星神 {def.aeon}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className="min-w-0 flex-1 truncate font-serif text-[12px] tracking-[0.16em]"
          style={{ color: walked ? 'rgba(245, 217, 122, 0.9)' : 'rgba(170, 160, 135, 0.78)' }}
        >
          {walked ? `${PATH_STAGE_DEFS[stage].name}${originLabel ? ` · ${originLabel}` : ''}` : '未觉醒'}
        </span>
        <MiniProgress value={progress} active={walked} />
      </div>
    </button>
  );
}

function PathDetails({
  def,
  record,
  onSetPrimary,
}: {
  def: 命途定义;
  record?: 命途进度;
  onSetPrimary: () => void;
}) {
  const walked = Boolean(record);
  const stage = record ? safeStage(record.阶段) : 0;
  const progress = record ? clampProgress(record.进度) : 0;
  const traits = 获取命途特质(def.id);
  const stageDef = PATH_STAGE_DEFS[stage];
  const originText = record
    ? record.是否主命途
      ? '开局选择 · 主命途'
      : record.觉醒于
        ? `觉醒于 · ${record.觉醒于}`
        : '剧情觉醒'
    : '尚未承载';

  return (
    <div className="min-h-full space-y-4 px-5 py-5" style={panelStyle}>
      <PathArchiveHero
        def={def}
        walked={walked}
        record={record}
        stageDef={stageDef}
        progress={progress}
        originText={originText}
      />

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <PanelSection title="星神档案">
          {def.lines && (
            <div className="mb-3 space-y-2">
              {def.lines.map((line, index) => (
                <p
                  key={index}
                  className="font-serif text-[13px] leading-[1.8] tracking-wider"
                  style={{ color: index === 0 ? '#fff4d4' : 'rgba(226, 218, 196, 0.84)' }}
                >
                  {index === 0 ? `「${line}」` : line}
                </p>
              ))}
            </div>
          )}
          <p
            className="font-serif text-[14px] leading-[1.85] tracking-wider"
            style={{ color: 'rgba(226, 218, 196, 0.88)' }}
          >
            {def.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <InfoPill label="星神" value={def.aeon} />
            <InfoPill label="状态" value={walked ? '已承载' : '未觉醒'} />
            {record?.是否主命途 && <InfoPill label="来源" value="开局选择 · 主命途" tone="cyan" />}
            {record && !record.是否主命途 && (
              <InfoPill label="觉醒于" value={record.觉醒于 || '剧情觉醒'} tone="cyan" />
            )}
          </div>
        </PanelSection>

        <PanelSection title="命途特质">
          {traits.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {traits.map((trait) => (
                <TraitChip key={trait.名称} trait={trait} />
              ))}
            </div>
          ) : (
            <EmptyNotice title={walked ? '尚无特质记录' : '尚未形成特质'} text="不同命途会逐步显露出专属特质，供正文和战技系统读取。" />
          )}
        </PanelSection>
      </div>

      <PanelSection title="践行进度">
        {record ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-serif text-[18px] font-semibold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
                  {stageDef.name}
                  <span className="ml-2 text-[13px] font-normal italic" style={{ color: 'rgba(235, 223, 193, 0.92)' }}>
                    {stageDef.title}
                  </span>
                </div>
                <p className="mt-2 font-serif text-[14px] leading-relaxed tracking-wider" style={{ color: 'rgba(235, 223, 193, 0.94)' }}>
                  {stageDef.blurb}
                </p>
              </div>
              <div className="font-serif text-[22px] font-bold" style={{ color: '#fff4d4' }}>
                {progress}
                <span className="text-[13px] font-normal" style={{ color: 'rgba(220, 208, 178, 0.82)' }}>
                  /{STAGE_PROGRESS_MAX}
                </span>
              </div>
            </div>
            <StageTimeline stage={stage} progress={progress} />
            {record.待升阶 && (
              <div className="mt-3">
                <Badge tone="gold">待升阶：等待命途狭间事件</Badge>
              </div>
            )}
          </>
        ) : (
          <EmptyNotice title="你还未踏上该道路" text="命途觉醒由剧情和变量系统推进，玩家无需手动添加进度。" />
        )}
      </PanelSection>

      {record && !record.是否主命途 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSetPrimary}
            className="font-serif text-[13px] tracking-[0.22em] transition-all hover:bg-[rgba(245,217,122,0.18)]"
            style={{
              color: '#fff4d4',
              background: 'rgba(245, 217, 122, 0.1)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
              padding: '8px 18px',
              clipPath: smallClip,
            }}
          >
            设为主命途
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px]" style={{ background: '#f5d97a' }} />
      <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: '#f5d97a' }}>
        {title}
      </span>
      <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(245,217,122,0.35), transparent)' }} />
    </div>
  );
}

function PathArchiveHero({
  def,
  walked,
  record,
  stageDef,
  progress,
  originText,
}: {
  def: 命途定义;
  walked: boolean;
  record?: 命途进度;
  stageDef: (typeof PATH_STAGE_DEFS)[number];
  progress: number;
  originText: string;
}) {
  return (
    <section
      className="relative overflow-hidden px-5 py-5"
      style={{
        background: walked
          ? 'radial-gradient(circle at 8% 12%, rgba(245, 217, 122, 0.26), transparent 30%), radial-gradient(circle at 92% 8%, rgba(245, 217, 122, 0.14), transparent 24%), linear-gradient(135deg, rgba(245, 217, 122, 0.12), rgba(9, 8, 10, 0.72) 48%, rgba(245, 217, 122, 0.055))'
          : 'linear-gradient(135deg, rgba(160, 148, 120, 0.09), rgba(9, 8, 10, 0.76))',
        boxShadow: walked
          ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.42), 0 0 30px rgba(245, 217, 122, 0.08)'
          : 'inset 0 0 0 1px rgba(160, 148, 120, 0.24)',
        clipPath: cardClip,
      }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-px w-full"
        style={{ background: 'linear-gradient(90deg, rgba(245,217,122,0.85), transparent 72%)' }}
      />
      <div
        className="pointer-events-none absolute right-5 top-4 font-serif text-[10px] tracking-[0.42em]"
        style={{ color: 'rgba(245, 217, 122, 0.38)' }}
      >
        PATH ARCHIVE
      </div>

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 flex-1 gap-4">
          <PathEmblem def={def} active={walked} selected={Boolean(record?.是否主命途)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="font-serif text-[28px] font-semibold tracking-[0.28em]"
                style={{ color: walked ? '#f5d97a' : 'rgba(235, 223, 193, 0.92)' }}
              >
                {def.name}
              </h3>
              {record?.是否主命途 && <Badge tone="gold">主命途</Badge>}
              {!walked && <Badge tone="muted">未觉醒</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <InfoPill label="星神" value={def.aeon} />
              <InfoPill label="阶段" value={walked ? stageDef.name : '未觉醒'} />
              <InfoPill label="来源" value={originText} tone="cyan" />
            </div>
            {def.blurb && (
              <p
                className="mt-4 max-w-[780px] font-serif text-[16px] font-semibold leading-relaxed tracking-wider"
                style={{ color: '#fff4d4' }}
              >
                {def.blurb}
              </p>
            )}
            {def.intro && (
              <p
                className="mt-2 max-w-[860px] font-serif text-[13px] leading-relaxed tracking-wider"
                style={{ color: 'rgba(226, 218, 196, 0.84)' }}
              >
                {def.intro}
              </p>
            )}
          </div>
        </div>

        <div
          className="flex w-full shrink-0 flex-col justify-between px-4 py-3 xl:w-[210px]"
          style={{
            background: 'rgba(5, 5, 7, 0.38)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
            clipPath: smallClip,
          }}
        >
          <div>
            <div className="font-serif text-[11px] tracking-[0.3em]" style={{ color: 'rgba(220, 208, 178, 0.78)' }}>
              CURRENT STAGE
            </div>
            <div className="mt-2 font-serif text-[22px] font-bold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
              {walked ? stageDef.name : '未觉醒'}
            </div>
            <div className="mt-1 font-serif text-[12px] italic tracking-wider" style={{ color: 'rgba(235, 223, 193, 0.86)' }}>
              {walked ? stageDef.title : '等待剧情触发'}
            </div>
          </div>
          <div className="mt-4">
            <MiniProgress value={progress} active={walked} />
            <div className="mt-2 text-right font-serif text-[13px]" style={{ color: 'rgba(245, 235, 210, 0.9)' }}>
              {walked ? `${progress}/${STAGE_PROGRESS_MAX}` : '--/--'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="px-4 py-4"
      style={{
        background: 'rgba(245, 217, 122, 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
        clipPath: cardClip,
      }}
    >
      <SectionHeader title={title} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(245, 217, 122, 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[12px] tracking-[0.16em]" style={{ color: 'rgba(220, 208, 178, 0.82)' }}>
        {label}
      </div>
      <div className="mt-1 truncate font-serif text-[15px] font-semibold" style={{ color: '#fff4d4' }}>
        {value}
      </div>
    </div>
  );
}

function PathEmblem({
  def,
  active,
  selected,
  size,
}: {
  def: 命途定义;
  active: boolean;
  selected: boolean;
  size: 'sm' | 'lg';
}) {
  const dimension = size === 'lg' ? 'h-[76px] w-[76px] text-[38px]' : 'h-12 w-12 text-[23px]';
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center font-serif ${dimension}`}
      style={{
        color: active ? '#f5d97a' : 'rgba(245, 217, 122, 0.48)',
        background: active
          ? 'radial-gradient(circle, rgba(245, 217, 122, 0.16), rgba(245, 217, 122, 0.045))'
          : 'rgba(160, 148, 120, 0.05)',
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.58), 0 0 20px rgba(245, 217, 122, 0.18)'
          : 'inset 0 0 0 1px rgba(245, 217, 122, 0.24)',
        clipPath: smallClip,
      }}
    >
      {def.emblem}
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'gold' | 'muted' }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 font-serif text-[12px] tracking-[0.16em]"
      style={{
        color: tone === 'gold' ? '#fff4d4' : 'rgba(210, 198, 168, 0.9)',
        background: tone === 'gold' ? 'rgba(245, 217, 122, 0.16)' : 'rgba(160, 148, 120, 0.08)',
        boxShadow:
          tone === 'gold'
            ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.42)'
            : 'inset 0 0 0 1px rgba(160, 148, 120, 0.24)',
        clipPath: smallClip,
      }}
    >
      {children}
    </span>
  );
}

function InfoPill({ label, value, tone = 'gold' }: { label: string; value: string; tone?: 'gold' | 'cyan' }) {
  const cyan = tone === 'cyan';
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 font-serif text-[12px] tracking-[0.14em]"
      style={{
        color: cyan ? 'rgba(220, 244, 255, 0.94)' : 'rgba(245, 235, 210, 0.95)',
        background: cyan ? 'rgba(108, 212, 255, 0.065)' : 'rgba(245, 217, 122, 0.07)',
        boxShadow: cyan
          ? 'inset 0 0 0 1px rgba(108, 212, 255, 0.22)'
          : 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
        clipPath: smallClip,
      }}
    >
      <span style={{ color: cyan ? 'rgba(170, 226, 255, 0.72)' : 'rgba(220, 208, 178, 0.75)' }}>{label}</span>
      <span>{value}</span>
    </span>
  );
}

function TraitChip({ trait }: { trait: { 名称: string; 说明: string } }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background:
          'linear-gradient(135deg, rgba(108, 212, 255, 0.06), rgba(245, 217, 122, 0.055))',
        boxShadow:
          'inset 0 0 0 1px rgba(108, 212, 255, 0.18), inset 2px 0 0 rgba(245, 217, 122, 0.38)',
        clipPath: smallClip,
      }}
      title={trait.说明}
    >
      <div className="font-serif text-[13px] tracking-[0.2em]" style={{ color: '#f5d97a' }}>
        {trait.名称}
      </div>
      <div className="mt-1 max-w-[220px] font-serif text-[12px] leading-relaxed tracking-wider" style={{ color: 'rgba(226, 218, 196, 0.84)' }}>
        {trait.说明}
      </div>
    </div>
  );
}

function EmptyNotice({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="px-4 py-5 text-center"
      style={{
        background: 'rgba(160, 148, 120, 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(160, 148, 120, 0.2)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[15px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.9)' }}>
        {title}
      </div>
      <div className="mt-2 font-serif text-[13px] leading-relaxed tracking-wider" style={{ color: 'rgba(210, 198, 168, 0.82)' }}>
        {text}
      </div>
    </div>
  );
}

function MiniProgress({ value, active }: { value: number; active: boolean }) {
  return (
    <div className="h-1.5 w-20 overflow-hidden" style={{ background: 'rgba(160, 148, 120, 0.18)' }}>
      <div
        className="h-full transition-all"
        style={{
          width: `${active ? (value / STAGE_PROGRESS_MAX) * 100 : 0}%`,
          background: '#f5d97a',
          boxShadow: '0 0 8px rgba(245, 217, 122, 0.45)',
        }}
      />
    </div>
  );
}

function StageTimeline({ stage, progress }: { stage: 命途阶段; progress: number }) {
  return (
    <div className="mt-4 grid grid-cols-5 gap-2">
      {([0, 1, 2, 3, 4] as 命途阶段[]).map((s) => {
        const isPast = s < stage;
        const isCurrent = s === stage;
        const fill = isPast ? 100 : isCurrent ? (progress / STAGE_PROGRESS_MAX) * 100 : 0;
        return (
          <div key={s} className="min-w-0">
            <div
              className="relative h-2 overflow-hidden"
              style={{
                background: 'rgba(160, 148, 120, 0.14)',
                boxShadow: isCurrent
                  ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)'
                  : 'inset 0 0 0 1px rgba(160, 148, 120, 0.18)',
              }}
            >
              <div
                className="h-full"
                style={{
                  width: `${fill}%`,
                  background: isPast || isCurrent ? '#f5d97a' : 'transparent',
                  boxShadow: isCurrent ? '0 0 9px rgba(245, 217, 122, 0.55)' : undefined,
                }}
              />
            </div>
            <div className="mt-2 truncate font-serif text-[12px]" style={{ color: isCurrent ? '#f5d97a' : 'rgba(210, 198, 168, 0.78)' }}>
              {PATH_STAGE_DEFS[s].name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function safeStage(stage: number): 命途阶段 {
  if (stage <= 0) return 0;
  if (stage >= 4) return 4;
  return stage as 命途阶段;
}

function getPathOriginLabel(record: 命途进度): string {
  if (record.是否主命途) return '主命途';
  return record.觉醒于 ? `觉醒于 ${record.觉醒于}` : '剧情觉醒';
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(STAGE_PROGRESS_MAX, progress));
}
