import { useCallback, useState } from 'react';

import { getSettingsSection, settingsSectionGroups, settingsSections } from './settingsSections/registry';
import type { SettingsModalProps, SettingsSectionContext, SettingsTab } from './settingsSections/types';
import type { 游戏设置, 主题预设 } from '@/models/settings';
import { mediumClip } from '@/components/ui/clipPaths';

export type { SettingsTab } from './settingsSections/types';

export function SettingsModal(props: SettingsModalProps) {
  const {
    onClose,
    deviceSettings,
    onGameSettingsChange,
    onThemeChange,
    onPersistGameSettings,
    onPersistTheme,
    initialTab = 'api',
  } = props;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const persistGameSettingsChange = useCallback((next: 游戏设置) => {
    onGameSettingsChange(next);
    void onPersistGameSettings(next);
  }, [onGameSettingsChange, onPersistGameSettings]);

  const persistThemeChange = useCallback((next: 主题预设) => {
    onThemeChange(next);
    void onPersistTheme(next);
  }, [onThemeChange, onPersistTheme]);

  const context: SettingsSectionContext = {
    ...props,
    gameSettings: deviceSettings.gameSettings,
    persistGameSettingsChange,
    persistThemeChange,
  };

  const activeSection = getSettingsSection(activeTab);
  const ActiveComponent = activeSection.Component;
  const usesFullHeightPane = activeSection.fullHeight === true;

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="kaituo-modal-shell kaituo-settings-shell flex h-[100dvh] w-full max-w-none animate-slide-up flex-col overflow-hidden md:h-[90vh] md:max-w-7xl md:flex-row"
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
        }}
      >
        {/* ── Left sidebar ── */}
        <aside
          className="kaituo-settings-sidebar flex max-h-[42dvh] w-full flex-shrink-0 flex-col md:max-h-none md:w-[260px]"
        >
          {/* Sidebar header */}
          <div
            className="kaituo-settings-sidebar-header flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-5"
          >
            <div>
              <div
                className="font-serif text-lg font-bold tracking-[0.28em] md:text-xl md:tracking-[0.35em]"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 44%, rgb(var(--tj-accent-primary)) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                <span style={{ color: 'rgba(var(--tj-accent-primary), 0.6)', WebkitTextFillColor: 'rgba(var(--tj-accent-primary), 0.6)' }}>◆</span>
                <span className="ml-2">设 置</span>
              </div>
              <div
                className="mt-1.5 h-px w-40 md:w-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.55), rgba(var(--tj-accent-primary), 0.1) 60%, transparent)',
                }}
              />
            </div>
            <button onClick={onClose} className="kaituo-close-btn text-xl md:hidden" aria-label="关闭">
              X
            </button>
          </div>

          {/* Tab list：按注册表分组渲染，SettingsModal 不感知任何 section 组件 */}
          <nav className="flex gap-2 overflow-x-auto px-3 py-2 md:block md:flex-1 md:overflow-x-hidden md:overflow-y-auto md:px-0 md:py-3">
            {settingsSectionGroups.map((group) => {
              const groupSections = settingsSections.filter((section) => section.group === group.id);
              if (!groupSections.length) return null;
              return (
                <div key={group.id} className="contents md:block">
                  <div
                    className="hidden px-5 pb-1 pt-3 font-serif text-[10px] tracking-[0.24em] md:block"
                    style={{ color: 'rgba(var(--tj-text-secondary), 0.42)' }}
                  >
                    {group.label}
                  </div>
                  {groupSections.map((t) => {
                    const active = activeTab === t.key;
                    const NavIcon = t.navIcon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`kaituo-settings-nav-item group flex w-[148px] flex-shrink-0 items-center gap-2 px-3 py-2 text-left transition-all md:w-full md:gap-3 md:px-5 md:py-3 ${active ? 'active' : ''}`}
                        style={{
                          background: active
                            ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-primary), 0.03) 68%, transparent)'
                            : 'transparent',
                          borderLeft: active
                            ? '2px solid rgba(var(--tj-accent-primary), 0.96)'
                            : '2px solid transparent',
                          boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)' : 'none',
                          clipPath: mediumClip,
                        }}
                      >
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center transition-colors"
                          style={{
                            color: active ? 'rgba(var(--tj-accent-primary), 1)' : 'rgba(var(--tj-accent-primary), 0.5)',
                            textShadow: 'none',
                          }}
                        >
                          <NavIcon aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate font-serif text-xs tracking-[0.18em] transition-colors md:text-sm md:tracking-[0.25em]"
                            style={{
                              color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(220, 230, 240, 0.85)',
                            }}
                          >
                            {t.label}
                          </div>
                          <div
                            className="mt-0.5 truncate text-[10px] tracking-wider transition-colors md:text-xs"
                            style={{
                              color: active ? 'rgba(var(--tj-ui-body), 0.82)' : 'rgba(var(--tj-text-secondary), 0.6)',
                            }}
                          >
                            {t.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          <div
            className="hidden px-5 py-3 text-xs font-serif tracking-[0.25em] md:block"
            style={{
              borderTop: '1px solid rgba(var(--tj-border), 0.10)',
              color: 'rgba(var(--tj-text-secondary), 0.55)',
            }}
          >
            <span style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>✦</span>
            <span className="ml-2">开拓轶事 · v0.8.1</span>
          </div>
        </aside>

        {/* ── Right content ── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Right header */}
          <header
            className="kaituo-settings-content-header hidden items-center justify-between px-6 py-4 md:flex"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span className="text-base" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))' }}>
                  {activeSection.icon}
                </span>
                <h2
                  className="font-serif text-lg font-bold tracking-[0.3em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 46%, rgb(var(--tj-accent-primary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {activeSection.label}
                </h2>
              </div>
              <p
                className="mt-1 text-xs tracking-wider"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
              >
                {activeSection.subtitle}
              </p>
            </div>
            <button onClick={onClose} className="kaituo-close-btn" aria-label="关闭">
              ✕
            </button>
          </header>

          {/* Right body */}
          <div className={`kaituo-settings-content-body min-w-0 flex-1 overflow-x-hidden px-3 py-4 md:px-6 md:py-5 ${
            usesFullHeightPane ? 'overflow-y-auto md:overflow-hidden' : 'overflow-y-auto'
          }`}>
            <div className={`kaituo-settings-pane ${usesFullHeightPane ? 'md:h-full' : ''}`}>
              <ActiveComponent {...context} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
