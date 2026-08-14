import { useState } from 'react';
import { ApiSettingsOverviewTab, type ApiSettingsOverviewProps } from './ApiSettingsOverview';
import { MemorySystemSettingsTab } from './MemorySystemSettings';
import { YitingSettingsTab } from './YitingSettingsTab';
import { NewsSystemSettingsTab } from './NewsSystemSettingsTab';
import { PhoneSystemSettingsTab } from './PhoneSystemSettingsTab';
import { ZhikuSettingsTab } from './ZhikuSettingsTab';
import { StoryWeavingSettingsTab } from './StoryWeavingSettingsTab';
import { VariableUpdateTab } from './VariableUpdateSettings';
import { cardClip, smallClip } from './settingsShared';

type ApiSubview = 'overview' | 'variable' | 'memory' | 'yiting' | 'news' | 'zhiku' | 'story' | 'phone';

const apiSubViews: { key: ApiSubview; label: string; hint: string }[] = [
  { key: 'overview', label: '总接口设置', hint: '主 API、方案、API 包' },
  { key: 'variable', label: '变量', hint: '变量独立接口' },
  { key: 'memory', label: '记忆', hint: '记忆检索与精炼' },
  { key: 'yiting', label: '忆庭', hint: '回忆库与召回' },
  { key: 'news', label: '新闻', hint: '星际周报接口' },
  { key: 'zhiku', label: '智库', hint: '原著资料接口' },
  { key: 'story', label: '剧情', hint: '剧情编织接口' },
  { key: 'phone', label: '手机', hint: '私聊与主动来信' },
];

function ApiSubviewButton({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 w-full items-center gap-3 px-3 py-3 text-left transition-all hover:opacity-95"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.24), rgba(var(--tj-accent-primary), 0.08))'
          : 'rgba(var(--tj-bg-secondary), 0.34)',
        color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary), 0.86)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.56), 0 0 18px rgba(var(--tj-accent-primary), 0.10)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div
        className="h-8 w-1.5 flex-shrink-0"
        style={{
          background: active
            ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-primary), 0.88))'
            : 'rgba(var(--tj-accent-primary), 0.18)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0)',
          opacity: active ? 1 : 0.75,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-serif text-xs tracking-[0.2em]">{label}</div>
          <div
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{
              background: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.28)',
              boxShadow: active ? '0 0 10px rgba(var(--tj-accent-primary), 0.35)' : 'none',
            }}
          />
        </div>
        <div
          className="mt-0.5 truncate text-[10px] tracking-wider"
          style={{ color: active ? 'rgba(var(--tj-ui-body), 0.82)' : 'rgba(var(--tj-text-secondary), 0.58)' }}
        >
          {hint}
        </div>
      </div>
      <div
        className="flex-shrink-0 text-[11px] transition-transform group-hover:translate-x-0.5"
        style={{ color: active ? 'rgba(var(--tj-accent-primary), 0.92)' : 'rgba(var(--tj-text-secondary), 0.42)' }}
      >
        →
      </div>
    </button>
  );
}

/** API 设置页宿主：左侧子页导航 + 右侧子页内容。总接口设置见 ApiSettingsOverviewTab。 */
export function ApiSettingsTab(props: ApiSettingsOverviewProps) {
  const {
    deviceSettings,
    onChange,
    onGameSettingsChange,
    onPersistApiSettings,
    onPersistGameSettings,
    onPersistApiProfile,
    onLoadApiProfileSlots,
    onPersistApiProfileSlots,
    onLoadAuxApiProfiles,
    onPersistAuxApiProfiles,
    fetchModels,
    testConnection,
  } = props;
  const { apiSettings: settings, gameSettings } = deviceSettings;
  const [activeSubview, setActiveSubview] = useState<ApiSubview>('overview');
  const activeSubviewMeta = apiSubViews.find((item) => item.key === activeSubview) ?? apiSubViews[0];

  const renderSubview = () => {
    switch (activeSubview) {
      case 'overview':
        return (
          <ApiSettingsOverviewTab
            deviceSettings={deviceSettings}
            onChange={onChange}
            onGameSettingsChange={onGameSettingsChange}
            onPersistApiSettings={onPersistApiSettings}
            onPersistGameSettings={onPersistGameSettings}
            onPersistApiProfile={onPersistApiProfile}
            onLoadApiProfileSlots={onLoadApiProfileSlots}
            onPersistApiProfileSlots={onPersistApiProfileSlots}
            onLoadAuxApiProfiles={onLoadAuxApiProfiles}
            onPersistAuxApiProfiles={onPersistAuxApiProfiles}
            fetchModels={fetchModels}
            testConnection={testConnection}
          />
        );
      case 'variable':
        return (
          <VariableUpdateTab
            gameSettings={gameSettings}
            onGameSettingsChange={onGameSettingsChange}
            apiSettings={settings}
            onPersistSettings={onPersistGameSettings}
            fetchModels={fetchModels}
          />
        );
      case 'memory':
        return <MemorySystemSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} testConnection={testConnection} />;
      case 'yiting':
        return <YitingSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} testConnection={testConnection} />;
      case 'news':
        return <NewsSystemSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} />;
      case 'zhiku':
        return <ZhikuSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} />;
      case 'story':
        return <StoryWeavingSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} />;
      case 'phone':
        return <PhoneSystemSettingsTab settings={gameSettings} onChange={onGameSettingsChange} apiSettings={settings} onPersistSettings={onPersistGameSettings} fetchModels={fetchModels} />;
    }
  };

  return (
    <div className="kaituo-settings-pane flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pr-1">
      <div
        className="lg:hidden flex min-w-0 flex-col gap-2 px-3 py-3 sm:px-4"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.54), rgba(var(--tj-bg-secondary), 0.34))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18), 0 8px 18px rgba(var(--tj-shadow), 0.06)',
          clipPath: cardClip,
        }}
      >
        <div className="font-serif text-xs tracking-[0.28em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
          {activeSubviewMeta.label}
        </div>
        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
          {activeSubviewMeta.hint}
        </div>
        <select
          value={activeSubview}
          onChange={(e) => setActiveSubview(e.target.value as ApiSubview)}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        >
          {apiSubViews.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside
          className="hidden min-h-0 flex-col overflow-hidden lg:flex"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.44), rgba(var(--tj-bg-primary), 0.18))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14), 0 10px 22px rgba(var(--tj-shadow), 0.05)',
            clipPath: cardClip,
          }}
        >
          <div className="px-4 py-4">
            <div className="font-serif text-xs tracking-[0.28em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
              API 子页
            </div>
            <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
              左侧选择功能页，右侧查看并编辑对应接口。
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {apiSubViews.map((item) => (
              <ApiSubviewButton
                key={item.key}
                active={activeSubview === item.key}
                label={item.label}
                hint={item.hint}
                onClick={() => setActiveSubview(item.key)}
              />
            ))}
          </div>
        </aside>

        <section className="min-h-0 min-w-0">
          <div
            className="hidden items-center justify-between px-4 py-3 lg:flex"
            style={{
              background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.42), rgba(var(--tj-bg-secondary), 0.22))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
              clipPath: cardClip,
            }}
            >
            <div>
              <div className="font-serif text-xs tracking-[0.28em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
                {activeSubviewMeta.label}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                {activeSubviewMeta.hint}
              </div>
            </div>
            <div className="text-[10px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.5)' }}>
              子页导航
            </div>
          </div>

          <div className="min-h-0 pt-3 lg:pt-3">
            {renderSubview()}
          </div>
        </section>
      </div>
    </div>
  );
}
