import { useState } from 'react';
import type { TavernSlotFilter, TavernSlotStats, TavernSlotViewModel } from '@/utils/tavernPresetPanel';
import { filterTavernSlotViewModels } from '@/utils/tavernPresetPanel';
import { smallClip } from './settingsShared';
import { TogglePill } from './tavernPresetPrimitives';

interface V2SlotListPanelProps {
  slotViewModels: TavernSlotViewModel[];
  stats: TavernSlotStats;
  selectedSlotId: string | null;
  onSelectSlot: (identifier: string) => void;
  canToggle: boolean;
  onToggleSlot: (identifier: string, enabled: boolean) => void;
}

export function V2SlotListPanel({ slotViewModels, stats, selectedSlotId, onSelectSlot, canToggle, onToggleSlot }: V2SlotListPanelProps) {
  const [slotFilter, setSlotFilter] = useState<TavernSlotFilter>('all');
  const shownOrderSlots = filterTavernSlotViewModels(slotViewModels, slotFilter);
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
          顺序项
        </span>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          启用 {stats.enabledSlotCount}/{slotViewModels.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
      {([
        ['all', '全部'],
        ['enabled', '启用'],
        ['disabled', '关闭'],
        ['runtime', '运行时'],
        ['missing', '未匹配'],
        ['macro', '含宏'],
      ] as const).map(([key, label]) => {
        const active = slotFilter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setSlotFilter(key)}
            className="px-2 py-1 text-xs transition-all"
            style={{
              color: active ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.62)',
              background: active ? 'rgba(var(--tj-ui-nsfw), 0.12)' : 'rgba(var(--tj-bg-primary), 0.35)',
              boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.3)' : 'rgba(var(--tj-accent-primary), 0.12)'}`,
              clipPath: smallClip,
            }}
          >
            {label}
          </button>
        );
      })}
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
      <div style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>运行时 {stats.runtimeSlotCount}</div>
      <div style={{ color: stats.unmatchedSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
        未匹配 {stats.unmatchedSlotCount}
      </div>
      <div style={{ color: stats.macroSlotCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>宏 {stats.macroSlotCount}</div>
      <div style={{ color: stats.advancedMacroSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>高级 {stats.advancedMacroSlotCount}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {shownOrderSlots.map(({ slot, index, prompt, content, macro, isRuntime, isMissing }) => {
        const active = selectedSlotId === slot.identifier;
        const contentPreview = content.replace(/\s+/g, ' ').trim().slice(0, 80);
        return (
          <div
            key={`${slot.identifier}_${index}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectSlot(slot.identifier)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSlot(slot.identifier);
              }
            }}
            className="grid cursor-pointer items-start gap-2 px-3 py-2 text-left text-sm transition-all"
            style={{
              gridTemplateColumns: '2.25rem minmax(0, 1fr) auto',
              background: active ? 'rgba(var(--tj-accent-primary), 0.12)' : 'transparent',
              color: !slot.enabled ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-text-primary), 0.82)',
              clipPath: smallClip,
            }}
          >
            <span style={{ color: !slot.enabled ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
              #{index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate" title={prompt?.name || slot.identifier}>
                {prompt?.name || slot.identifier}
              </span>
              <span className="mt-1 block truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }} title={slot.identifier}>
                {slot.identifier}
              </span>
              {contentPreview && (
                <span className="mt-1 block truncate text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.48)' }} title={contentPreview}>
                  {contentPreview}
                </span>
              )}
              {macro.level !== 'none' && (
                <span className="mt-1 inline-flex px-1.5 py-0.5 text-xs" style={{
                  color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.78)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                  clipPath: smallClip,
                }}>
                  {macro.level === 'advanced' ? '高级宏' : '基础宏'}
                </span>
              )}
            </span>
            <span className="flex flex-col items-end gap-1 text-xs">
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                {isRuntime ? 'runtime' : (isMissing ? 'missing' : (prompt?.role ?? 'system'))}
              </span>
              <TogglePill checked={slot.enabled} disabled={!canToggle} onChange={(next) => onToggleSlot(slot.identifier, next)} />
            </span>
          </div>
        );
      })}
      {shownOrderSlots.length === 0 && (
        <div className="px-3 py-3 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          当前筛选下没有顺序项。
        </div>
      )}
      </div>
    </div>
  );
}
