import {
  getPresetWorldInfoTitle,
  isPresetWorldInfoConstant,
  isPresetWorldInfoEnabled,
  readPresetWorldInfoKeys,
  readPresetWorldInfoText,
} from '@/utils/tavernPresetParsing';
import { smallClip } from './settingsShared';
import { TogglePill } from './tavernPresetPrimitives';

interface V2WorldInfoPanelProps {
  viewEntries: Array<{ key: string; entry: Record<string, unknown> }>;
  enabledCount: number;
  constantCount: number;
  canEdit: boolean;
  onToggleEntry: (entryKey: string, enabled: boolean) => void;
}

export function V2WorldInfoPanel({ viewEntries, enabledCount, constantCount, canEdit, onToggleEntry }: V2WorldInfoPanelProps) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.24)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
          预设世界书
        </span>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          启用 {enabledCount}/{viewEntries.length} · 常驻 {constantCount}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto pr-1">
        <div className="grid gap-2 md:grid-cols-2">
          {viewEntries.map(({ key, entry }, index) => {
            const title = getPresetWorldInfoTitle(entry, index);
            const primaryKeys = readPresetWorldInfoKeys(entry.key);
            const secondaryKeys = readPresetWorldInfoKeys(entry.keysecondary);
            const content = readPresetWorldInfoText(entry.content).replace(/\s+/g, ' ').trim();
            const enabled = isPresetWorldInfoEnabled(entry);
            const constant = isPresetWorldInfoConstant(entry);
            const order = readPresetWorldInfoText(entry.order) || '100';
            const probability = readPresetWorldInfoText(entry.probability) || '100';
            return (
              <div
                key={key}
                className="grid gap-2 px-3 py-2 text-xs leading-5"
                style={{
                  background: enabled ? 'rgba(var(--tj-bg-secondary), 0.26)' : 'rgba(var(--tj-bg-primary), 0.18)',
                  color: enabled ? 'rgba(var(--tj-text-primary), 0.76)' : 'rgba(var(--tj-text-secondary), 0.45)',
                  boxShadow: `inset 0 0 0 1px ${enabled ? 'rgba(var(--tj-accent-primary), 0.13)' : 'rgba(var(--tj-text-secondary), 0.08)'}`,
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-sm tracking-[0.08em]" title={title}>
                      {title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span style={{ color: constant ? 'rgba(var(--tj-ui-nsfw), 0.84)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
                        {constant ? '常驻' : '关键词'}
                      </span>
                      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>order {order}</span>
                      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>概率 {probability}%</span>
                    </div>
                  </div>
                  <TogglePill
                    checked={enabled}
                    disabled={!canEdit}
                    onChange={(next) => onToggleEntry(key, next)}
                  />
                </div>
                <div className="grid gap-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                  <div className="truncate" title={primaryKeys.join(' / ') || '无主关键词'}>
                    主关键词：{primaryKeys.length > 0 ? primaryKeys.join(' / ') : '无'}
                  </div>
                  {secondaryKeys.length > 0 && (
                    <div className="truncate" title={secondaryKeys.join(' / ')}>
                      次关键词：{secondaryKeys.join(' / ')}
                    </div>
                  )}
                  <div className="line-clamp-2" title={content}>
                    {content || '无正文'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
        world_info 只在主剧情酒馆消息链中按关键词触发，不写入全局世界书，也不影响独立系统。
      </div>
    </div>
  );
}
