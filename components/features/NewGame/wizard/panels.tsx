import type { ReactNode } from 'react';
import { PATH_STAGE_DEFS } from '@/models/path';
import { getFaction, getPath } from '@/data/journeyPresets';
import type { 战技槽位摘要 } from '@/models/skill';
import { type Step, type OpeningSkillSlotKey, type OpeningPlayerPreset, STEPS, MAX_OPENING_PLAYER_PRESETS, STEP_META, STEP_RAIL_ITEMS, cardClip, smallClip, openingPanelBackground, openingSoftPanelBackground, openingPanelShadow, openingCardBackground, openingCardBorder, toOpeningSkillSlotKey } from './wizardData';

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="p-[10px_12px] text-left"
      style={{
        background: openingSoftPanelBackground,
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.30), inset 0 0 0 2px rgba(var(--tj-btn-primary-end), 0.08)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.64)' }}>
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold" style={{ color: 'rgb(var(--tj-accent-secondary))' }}>
        {value}
      </div>
    </div>
  );
}

export function OpeningPresetControls({
  presets,
  selectedPresetId,
  presetNameDraft,
  status,
  onPresetNameDraft,
  onSelectPreset,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: {
  presets: OpeningPlayerPreset[];
  selectedPresetId: string;
  presetNameDraft: string;
  status: string;
  onPresetNameDraft: (value: string) => void;
  onSelectPreset: (value: string) => void;
  onApplyPreset: (id: string) => void;
  onSavePreset: () => void;
  onDeletePreset: () => void;
}) {
  const hasSelected = Boolean(selectedPresetId && presets.some((item) => item.id === selectedPresetId));

  return (
    <div
      className="p-3 text-left"
      style={{
        background: 'rgba(var(--tj-surface-bg-start), 0.78)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] tracking-[0.26em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.65)' }}>
          我的开局预设
        </div>
        <div className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
          {presets.length}/{MAX_OPENING_PLAYER_PRESETS}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
        <input
          value={presetNameDraft}
          onChange={(event) => onPresetNameDraft(event.target.value)}
          placeholder="预设名，例如：公司调查员"
          className="kaituo-input w-full px-3 py-2 text-xs"
          style={{ clipPath: smallClip }}
        />

        <select
          value={selectedPresetId}
          onChange={(event) => {
            const nextId = event.target.value;
            onSelectPreset(nextId);
            const selected = presets.find((item) => item.id === nextId);
            if (selected) onPresetNameDraft(selected.title);
          }}
          className="kaituo-input w-full px-3 py-2 text-xs"
          style={{ clipPath: smallClip }}
        >
          <option value="">暂无已保存预设</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.title}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSavePreset}
            className="kaituo-btn kaituo-btn-primary px-2 py-2 text-[11px]"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => selectedPresetId && onApplyPreset(selectedPresetId)}
            disabled={!hasSelected}
            className="kaituo-btn kaituo-btn-secondary px-2 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            套用
          </button>
          <button
            type="button"
            onClick={onDeletePreset}
            disabled={!hasSelected}
            className="px-2 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: 'rgba(var(--tj-danger),0.12)',
              color: 'rgba(var(--tj-danger),0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.22)',
              clipPath: smallClip,
            }}
          >
            删除
          </button>
        </div>
      </div>

      <div className="mt-2 text-[10px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
        {status || '只保存开局表单，不保存 API key 或存档进度。'}
      </div>
    </div>
  );
}

export function ProgressBar({ step }: { step: Step }) {
  const currentIdx = STEPS.indexOf(step);
  return (
    <div className="flex min-w-[520px] items-center justify-center gap-1 sm:min-w-0">
      {STEPS.map((item, index) => {
        const active = item === step;
        const passed = index < currentIdx;
        const reached = active || passed;
        return (
          <div key={item} className="flex min-w-[92px] flex-1 items-center gap-1 sm:min-w-0">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center text-xs font-bold"
                style={{
                  background: reached
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))'
                    : 'rgba(var(--tj-panel-bg-end),0.7)',
                  color: reached ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.65)',
                  boxShadow: reached
                    ? '0 0 10px rgba(var(--tj-btn-primary-start), 0.24)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                  clipPath: smallClip,
                }}
              >
                {passed ? '✓' : index + 1}
              </div>
              <div
                className="w-full truncate text-center text-[10px] tracking-[0.1em] sm:tracking-[0.16em]"
                style={{ color: reached ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.84), rgba(var(--tj-btn-primary-end),0.78))' : 'rgba(var(--tj-text-secondary), 0.5)' }}
              >
                {STEP_META[item].title}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="mb-5 h-px w-5 shrink-0"
                style={{
                  background: passed
                    ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.65), rgba(var(--tj-btn-primary-start), 0.18))'
                    : 'rgba(var(--tj-btn-primary-start), 0.14)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function OpeningLedger({
  scenarioTitle,
  storyMode,
  path,
  pathStage,
  faction,
  currentDate,
  currentTime,
  currentLocation,
  abilities,
  highlights,
}: {
  scenarioTitle: string;
  storyMode: string;
  path?: ReturnType<typeof getPath>;
  pathStage?: (typeof PATH_STAGE_DEFS)[number];
  faction?: ReturnType<typeof getFaction>;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  abilities: string[];
  highlights: string[];
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: openingPanelBackground,
        boxShadow: openingPanelShadow,
        backdropFilter: 'blur(5px)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-[15px] pb-[10px] pt-[14px]">
        <div className="text-[11px] tracking-[0.34em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
          {'\u5b9e\u65f6\u5f00\u5c40\u6863\u6848'}
        </div>
        <span
          className="px-2 py-1 text-[10px] tracking-[0.18em]"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
            background: 'rgba(var(--tj-btn-primary-start), 0.10)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
            clipPath: smallClip,
          }}
        >
          LIVE
        </span>
      </div>
      <div className="grid gap-[10px] p-[14px]">
        <div
          className="relative h-[86px] overflow-hidden p-3"
          style={{
            background: openingCardBackground,
            boxShadow: openingCardBorder,
            clipPath: smallClip,
          }}
        >
          <div className="relative z-10 text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            ARCHIVE SIGNAL
          </div>
          <svg viewBox="0 0 320 86" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full opacity-95">
            <path
              d="M0 58 C28 42 34 38 56 48 S94 70 118 50 154 16 178 38 208 62 238 42 274 24 320 30"
              fill="none"
              stroke="rgba(var(--tj-btn-primary-start), 0.66)"
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(var(--tj-btn-primary-start), 0.4))',
                strokeDasharray: 220,
                animation: 'openingDash 4s linear infinite',
              }}
            />
          </svg>
        </div>
        <ArchiveCard label={'\u8d77\u70b9'} title={scenarioTitle || '\u672a\u9009\u62e9'} body={`${currentDate} · ${currentTime}`} />
        <ArchiveCard label={'\u5730\u70b9'} title={currentLocation} body={`\u5267\u60c5\u6a21\u5f0f\uff1a${storyMode}`} />
        <ArchiveCard label={'\u547d\u9014\u4e0e\u9636\u6bb5'} title={path ? `${path.name} · ${path.aeon}` : '\u65e0\u547d\u9014'} body={path && pathStage ? `${pathStage.name} · ${pathStage.title}` : '\u672a\u9009\u62e9'} />
        <ArchiveCard label={'\u7ec4\u7ec7\u80cc\u666f'} title={faction?.name ?? '\u65e0\u56fa\u5b9a\u7ec4\u7ec7'} body={abilities.length ? `\u80fd\u529b\uff1a${abilities.join('\u3001')}` : '\u80fd\u529b\uff1a\u6682\u672a\u9009\u62e9'} />

        {highlights.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              {'\u5f00\u5c40\u8981\u70b9'}
            </div>
            <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
              {highlights.map((item) => (
                <ArchiveCard key={item} label={'\u80cc\u666f\u53c2\u8003'} title={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function OpeningSkillSlotGroup({
  title,
  slots,
  selectedSlotKey,
  onSelect,
  emptyText = '暂无可用槽位。',
}: {
  title: string;
  slots: 战技槽位摘要[];
  selectedSlotKey: OpeningSkillSlotKey;
  onSelect: (key: OpeningSkillSlotKey) => void;
  emptyText?: string;
}) {
  return (
    <div
      className="p-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.45)',
        color: 'rgba(var(--tj-text-secondary), 0.82)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
        {title}
      </div>
      {slots.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const key = toOpeningSkillSlotKey(slot);
            const active = selectedSlotKey === key;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelect(key)}
                className="min-w-[120px] px-3 py-2 text-left transition-transform hover:-translate-y-0.5"
                style={{
background: active
  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-btn-primary-end), 0.06))'
  : 'rgba(var(--tj-surface-strong), 0.56)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 12px rgba(var(--tj-btn-primary-start), 0.10)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div className="text-[10px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
                  {slot.kind === 'normal' ? `普通槽 ${slot.slotIndex}` : `${slot.pathId ? getPath(slot.pathId)?.name : '命途'} 槽 ${slot.slotIndex}`}
                </div>
                <div className="mt-1 truncate font-serif text-sm font-bold tracking-[0.12em]" style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}>
                  {slot.occupiedSkillName ?? '空槽'}
                </div>
                <div className="mt-1 text-[10px]" style={{ color: slot.occupiedSkillId ? 'rgba(var(--tj-btn-primary-start), 0.92)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {slot.occupiedSkillId ? (slot.occupiedSkillEnabled === false ? '已填 · 停用' : '已填') : '未装备'}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="p-3 text-xs leading-relaxed"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.35)',
            color: 'rgba(var(--tj-text-secondary), 0.72)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.10)',
            clipPath: smallClip,
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

export function ArchiveCard({ label, title, body }: { label: string; title: string; body?: string }) {
  return (
    <div
      className="p-3"
      style={{
        background: openingCardBackground,
        boxShadow: openingCardBorder,
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>{label}</div>
      <div className="mt-[5px] break-words text-[13px] font-semibold leading-snug" style={{ color: 'rgb(var(--tj-text-primary))' }}>{title}</div>
      {body ? <div className="mt-[7px] break-words text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>{body}</div> : null}
    </div>
  );
}

export function StepRail({
  step,
  onStepChange,
}: {
  step: Step;
  onStepChange: (step: Step) => void;
}) {
  const currentIdx = STEPS.indexOf(step);
  const visualIdx = currentIdx;
  return (
    <div
      className="overflow-hidden"
      style={{
        background: openingPanelBackground,
        boxShadow: openingPanelShadow,
        backdropFilter: 'blur(5px)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-[15px] pb-[10px] pt-[14px]">
        <div className="text-[11px] tracking-[0.34em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
          建档流程
        </div>
        <div
          className="px-2 py-1 text-[10px] tracking-[0.18em]"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
            background: 'rgba(var(--tj-btn-primary-start), 0.10)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
            clipPath: smallClip,
          }}
        >
          SYNC
        </div>
      </div>
      <div className="grid gap-[9px] p-3">
        {STEP_RAIL_ITEMS.map((item, index) => {
          const active = item.key === step;
          const done = index < visualIdx;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onStepChange(item.key)}
              aria-current={active ? 'step' : undefined}
              className="grid w-full cursor-pointer grid-cols-[34px_minmax(0,1fr)] gap-[10px] p-3 text-left transition duration-200 hover:-translate-y-[1px] hover:shadow-[0_0_18px_rgba(var(--tj-btn-primary-start),0.14)] focus:outline-none focus-visible:shadow-[0_0_0_2px_rgba(var(--tj-btn-primary-start),0.45),0_0_18px_rgba(var(--tj-btn-primary-start),0.18)]"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.08))'
                  : 'rgba(var(--tj-panel-bg-end), 0.58)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.48), 0 0 18px rgba(var(--tj-btn-primary-start), 0.10)'
                  : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.13)',
                clipPath: smallClip,
              }}
            >
              <div
                className="opening-step-badge flex h-[34px] w-[34px] shrink-0 items-center justify-center text-xs font-extrabold"
                style={{
background: done || active
  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.98), rgba(var(--tj-btn-primary-end), 0.9))'
  : 'rgba(var(--tj-surface-strong), 0.74)',
                  color: done || active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: done
                    ? '0 0 12px rgba(var(--tj-btn-primary-start), 0.22)'
                    : active
                      ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.48), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              >
                {done ? '✓' : index + 1}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                >
                  {item.title}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {item.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StepNav({
  onBack,
  onNext,
  backLabel = '上一步',
  nextLabel = '下一步',
  ready = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  ready?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {onBack && (
        <button onClick={onBack} className="kaituo-btn kaituo-btn-secondary flex-1 px-4 py-3 text-sm">
          {backLabel}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={!ready}
        className="kaituo-btn kaituo-btn-primary group flex-1 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 ease-out group-hover:translate-x-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-text-primary), 0.45), transparent)' }}
        />
        <span className="relative tracking-[0.2em] font-bold">{nextLabel}</span>
      </button>
    </div>
  );
}

export function SectionTitle({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  return (
    <div className={`${compact ? '' : 'mb-5'} min-w-0`}>
      <div
        className="mb-2 text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.62)' }}
      >
        {subtitle}
      </div>
      <h3
        className="font-serif text-xl font-bold tracking-[0.12em] sm:text-2xl sm:tracking-[0.18em]"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {title}
      </h3>
    </div>
  );
}

export function LabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function OverviewLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
      {children}
    </div>
  );
}

export function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <div style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>{label}</div>
      <div className="break-words" style={{ color: 'rgba(var(--tj-text-primary),0.96)' }}>
        {value}
      </div>
    </div>
  );
}
