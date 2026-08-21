import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import {
  BookOpen,
  Cable,
  Database,
  FileText,
  HardDrive,
  Import as ImportIcon,
  Layers3,
  Palette,
  ShieldAlert,
  TriangleAlert,
  Type as TypeIcon,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { ApiSettingsTab } from './ApiSettings';
import { ThemeSettingsTab } from './ThemeSettings';
import { GameSettingsTab } from './GameSettings';
import { VisualSettingsTab } from './VisualSettingsTab';
import { NsfwSettingsTab } from './NsfwSettingsTab';
import { PromptModulesTab } from './PromptModulesTab';
import { TavernPresetsSettingsTab } from './TavernPresetsSettingsTab';
import { ExtraFeaturesSettingsTab } from './ExtraFeaturesSettingsTab';
import { ApiErrorReportsTab } from './ApiErrorReportsTab';
import { StorageManagerTab } from './StorageManager';
import { VariableManagerTab } from './VariableManager';
import { ContextViewerTab } from './ContextViewer';
import type { API设置, 游戏设置, 主题预设 } from '@/models/settings';
import type { ContextSnapshot, ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { VariableSetters } from '@/utils/variableExecutor';
import { saveSetting } from '@/services/dbService';
import type { 世界书 } from '@/models/worldbook';
import type { 聊天消息 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';

export type SettingsTab = Tab;

interface SettingsModalProps {
  onClose: () => void;
  apiSettings: API设置;
  onApiSettingsChange: (s: API设置) => void;
  gameSettings: 游戏设置;
  onGameSettingsChange: (s: 游戏设置) => void;
  currentTheme: 主题预设;
  onThemeChange: (t: 主题预设) => void;
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
  // 变量管理需要的 state 切片
  旅人: 角色数据结构;
  世界: 世界状态;
  on世界Change: (s: 世界状态) => void;
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: NPC记录[];
  新闻: 新闻条目[];
  剧情编织: 剧情编织系统;
  on剧情编织Change: React.Dispatch<React.SetStateAction<剧情编织系统>>;
  variableSetters: VariableSetters;
  variableEditingLocked?: boolean;
  getContextSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  initialTab?: Tab;
  /** Phase 7.2：世界书数组（用于 ST 预设导入时注入 ST 世界书条目）。 */
  worldbooks: 世界书[];
  /** Phase 7.2：世界书变更回调（同时负责持久化到 IndexedDB）。 */
  onWorldbooksChange: (books: 世界书[]) => void;
  chatHistory?: 聊天消息[];
  variableBatches?: 变量命令批次[];
  onRepairMessage?: (messageId: string) => void | Promise<void>;
  onBatchRepair?: (messageIds: string[]) => void | Promise<void>;
  initialVariableWorkspace?: 'state' | 'repair';
}

type Tab = 'api' | 'apiErrors' | 'game' | 'visual' | 'context' | 'nsfw' | 'variables' | 'prompts' | 'tavernPresets' | 'extra' | 'theme' | 'storage';

const tabs: { key: Tab; label: string; icon: string; navIcon: LucideIcon; subtitle: string }[] = [
  { key: 'visual', label: '视觉设置', icon: '◇', navIcon: TypeIcon, subtitle: '正文显示与字号' },
  { key: 'game', label: '游戏设定', icon: '❖', navIcon: BookOpen, subtitle: '叙述风格与人格' },
  { key: 'api', label: 'API 接口', icon: '✦', navIcon: Cable, subtitle: 'AI 模型、密钥与子功能接口' },
  { key: 'apiErrors', label: '错误报告', icon: '!', navIcon: TriangleAlert, subtitle: 'API 失败原因记录' },
  { key: 'context', label: '上下文', icon: '▤', navIcon: Layers3, subtitle: '主剧情 Token 计数' },
  { key: 'nsfw', label: 'NSFW', icon: '◇', navIcon: ShieldAlert, subtitle: '成人内容与私密档案' },
  { key: 'variables', label: '变量管理', icon: '◈', navIcon: Database, subtitle: '存档数据查看与调试' },
  { key: 'prompts', label: '提示词模块', icon: '❘', navIcon: FileText, subtitle: 'AI 系统级硬规则' },
  { key: 'tavernPresets', label: '酒馆预设', icon: '◆', navIcon: ImportIcon, subtitle: 'ST 导入与消息链' },
  { key: 'extra', label: '额外功能', icon: '✦', navIcon: WandSparkles, subtitle: '污染词清理与扩展功能' },
  { key: 'theme', label: '主题风格', icon: '◇', navIcon: Palette, subtitle: '配色与氛围' },
  { key: 'storage', label: '存档管理', icon: '✧', navIcon: HardDrive, subtitle: '本地存档与导入导出' },
];

export function SettingsModal({
  onClose,
  apiSettings,
  onApiSettingsChange,
  gameSettings,
  onGameSettingsChange,
  currentTheme,
  onThemeChange,
  onSave,
  onContinue,
  onLoadSave,
  旅人,
  世界,
  on世界Change,
  记忆,
  忆庭,
  智库,
  手机,
  NPC,
  新闻,
  剧情编织,
  on剧情编织Change,
  variableSetters,
  variableEditingLocked = false,
  getContextSnapshot,
  initialTab = 'api',
  worldbooks,
  onWorldbooksChange,
  chatHistory,
  variableBatches,
  onRepairMessage,
  onBatchRepair,
  initialVariableWorkspace = 'state',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);

  const persistGameSettingsChange = useCallback((next: 游戏设置) => {
    onGameSettingsChange(next);
    void saveSetting('gameSettings', next);
  }, [onGameSettingsChange]);

  const persistThemeChange = useCallback((next: 主题预设) => {
    onThemeChange(next);
    void saveSetting('theme', next);
  }, [onThemeChange]);

  const renderTab = (): ReactNode => {
    switch (activeTab) {
      case 'api':
        return (
          <ApiSettingsTab
            settings={apiSettings}
            onChange={onApiSettingsChange}
            gameSettings={gameSettings}
            onGameSettingsChange={persistGameSettingsChange}
          />
        );
      case 'apiErrors':
        return <ApiErrorReportsTab />;
      case 'game':
        return (
          <GameSettingsTab
            settings={gameSettings}
            onChange={persistGameSettingsChange}
            worldState={世界}
            onWorldStateChange={on世界Change}
          />
        );
      case 'visual':
        return <VisualSettingsTab settings={gameSettings} onChange={persistGameSettingsChange} />;
      case 'context':
        void contextRefreshKey;
        return (
          <ContextViewerTab
            getSnapshot={getContextSnapshot}
            onRefresh={() => setContextRefreshKey((v) => v + 1)}
            devMode={gameSettings.devMode}
          />
        );
      case 'nsfw':
        return <NsfwSettingsTab settings={gameSettings} onChange={persistGameSettingsChange} />;
      case 'prompts':
        return (
          <PromptModulesTab
            settings={gameSettings}
            onChange={persistGameSettingsChange}
            worldbooks={worldbooks}
            onWorldbooksChange={onWorldbooksChange}
            apiSettings={apiSettings}
            onApiSettingsChange={onApiSettingsChange}
            storyMode={世界.剧情模式}
          />
        );
      case 'tavernPresets':
        return (
          <TavernPresetsSettingsTab
            settings={gameSettings}
            onChange={persistGameSettingsChange}
            worldbooks={worldbooks}
            onWorldbooksChange={onWorldbooksChange}
            apiSettings={apiSettings}
            onApiSettingsChange={onApiSettingsChange}
            storyMode={世界.剧情模式}
          />
        );
      case 'extra':
        return <ExtraFeaturesSettingsTab settings={gameSettings} onChange={persistGameSettingsChange} />;
      case 'variables':
        return (
          <VariableManagerTab
            旅人={旅人}
            世界={世界}
            记忆={记忆}
            忆庭={忆庭}
            智库={智库}
            手机={手机}
            NPC={NPC}
            新闻={新闻}
            剧情编织={剧情编织}
            set剧情编织={on剧情编织Change}
            setters={variableSetters}
            editingLocked={variableEditingLocked}
            chatHistory={chatHistory}
            variableBatches={variableBatches}
            onRepairMessage={onRepairMessage}
            onBatchRepair={onBatchRepair}
            initialWorkspace={initialVariableWorkspace}
          />
        );
      case 'theme':
        return <ThemeSettingsTab current={currentTheme} onChange={persistThemeChange} />;
      case 'storage':
        return <StorageManagerTab onSave={onSave} onContinue={onContinue} onLoadSave={onLoadSave} />;
    }
  };

  const activeMeta = tabs.find((t) => t.key === activeTab)!;
  const usesFullHeightPane = activeTab === 'prompts' || activeTab === 'tavernPresets';

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

          {/* Tab list */}
          <nav className="flex gap-2 overflow-x-auto px-3 py-2 md:block md:flex-1 md:overflow-x-hidden md:overflow-y-auto md:px-0 md:py-3">
            {tabs.map((t) => {
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
                    clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
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
                  {activeMeta.icon}
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
                  {activeMeta.label}
                </h2>
              </div>
              <p
                className="mt-1 text-xs tracking-wider"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
              >
                {activeMeta.subtitle}
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
            <div className={`kaituo-settings-pane ${usesFullHeightPane ? 'md:h-full' : ''}`}>{renderTab()}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
