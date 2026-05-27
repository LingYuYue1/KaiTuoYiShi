import type { ReactNode } from 'react';
import { useState } from 'react';
import { ApiSettingsTab } from './ApiSettings';
import { ThemeSettingsTab } from './ThemeSettings';
import { GameSettingsTab } from './GameSettings';
import { MemorySystemSettingsTab } from './MemorySystemSettings';
import { YitingSettingsTab } from './YitingSettingsTab';
import { NewsSystemSettingsTab } from './NewsSystemSettingsTab';
import { PhoneSystemSettingsTab } from './PhoneSystemSettingsTab';
import { ZhikuSettingsTab } from './ZhikuSettingsTab';
import { StoryWeavingSettingsTab } from './StoryWeavingSettingsTab';
import { NsfwSettingsTab } from './NsfwSettingsTab';
import { ImageGenerationSettingsTab } from './ImageGenerationSettingsTab';
import { PromptModulesTab } from './PromptModulesTab';
import { StorageManagerTab } from './StorageManager';
import { VariableManagerTab } from './VariableManager';
import { VariableUpdateTab } from './VariableUpdateSettings';
import { ContextViewerTab } from './ContextViewer';
import type { API设置, 游戏设置 } from '@/models/settings';
import type { 主题预设 } from '@/models/settings';
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
  getContextSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  initialTab?: Tab;
}

type Tab = 'api' | 'game' | 'memory' | 'yiting' | 'news' | 'phone' | 'zhiku' | 'storyWeaving' | 'context' | 'nsfw' | 'imageGeneration' | 'prompts' | 'variables' | 'varUpdate' | 'theme' | 'storage';

const tabs: { key: Tab; label: string; icon: string; subtitle: string }[] = [
  { key: 'game', label: '游戏设定', icon: '❖', subtitle: '叙述风格与人格' },
  { key: 'api', label: 'API 接口', icon: '✦', subtitle: 'AI 模型与密钥' },
  { key: 'varUpdate', label: '变量更新', icon: '◉', subtitle: '变量模型 API 与开关' },
  { key: 'yiting', label: '忆庭', icon: '◌', subtitle: '回忆档案与召回 API' },
  { key: 'memory', label: '记忆系统', icon: '◐', subtitle: '压缩阈值、API 与提示词' },
  { key: 'news', label: '星际周报', icon: '☉', subtitle: '新闻演进与独立 API' },
  { key: 'phone', label: '手机系统', icon: '▣', subtitle: '通讯终端与主动来信 API' },
  { key: 'zhiku', label: '智库', icon: '◈', subtitle: '原著资料与独立 API' },
  { key: 'storyWeaving', label: '剧情编织', icon: '❖', subtitle: 'TXT 导入与分解 API' },
  { key: 'context', label: '上下文', icon: '▤', subtitle: '主剧情 Token 计数' },
  { key: 'nsfw', label: 'NSFW', icon: '◇', subtitle: '成人内容与私密档案' },
  { key: 'imageGeneration', label: '文生图', icon: '▧', subtitle: '相册与图片生成接口' },
  { key: 'variables', label: '变量管理', icon: '◈', subtitle: '存档数据查看与调试' },
  { key: 'prompts', label: '提示词模块', icon: '❘', subtitle: 'AI 系统级硬规则' },
  { key: 'theme', label: '主题风格', icon: '◇', subtitle: '配色与氛围' },
  { key: 'storage', label: '存档管理', icon: '✧', subtitle: '本地存档与导入导出' },
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
  getContextSnapshot,
  initialTab = 'api',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);

  const renderTab = (): ReactNode => {
    switch (activeTab) {
      case 'api':
        return <ApiSettingsTab settings={apiSettings} onChange={onApiSettingsChange} />;
      case 'game':
        return (
          <GameSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            worldState={世界}
            onWorldStateChange={on世界Change}
          />
        );
      case 'memory':
        return (
          <MemorySystemSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'yiting':
        return (
          <YitingSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'news':
        return (
          <NewsSystemSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'phone':
        return (
          <PhoneSystemSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'zhiku':
        return (
          <ZhikuSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'storyWeaving':
        return (
          <StoryWeavingSettingsTab
            settings={gameSettings}
            onChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'context':
        void contextRefreshKey;
        return (
          <ContextViewerTab
            getSnapshot={getContextSnapshot}
            onRefresh={() => setContextRefreshKey((v) => v + 1)}
          />
        );
      case 'nsfw':
        return <NsfwSettingsTab settings={gameSettings} onChange={onGameSettingsChange} />;
      case 'imageGeneration':
        return <ImageGenerationSettingsTab settings={gameSettings} onChange={onGameSettingsChange} />;
      case 'prompts':
        return <PromptModulesTab settings={gameSettings} onChange={onGameSettingsChange} />;
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
          />
        );
      case 'varUpdate':
        return (
          <VariableUpdateTab
            gameSettings={gameSettings}
            onGameSettingsChange={onGameSettingsChange}
            apiSettings={apiSettings}
          />
        );
      case 'theme':
        return <ThemeSettingsTab current={currentTheme} onChange={onThemeChange} />;
      case 'storage':
        return <StorageManagerTab onSave={onSave} onContinue={onContinue} onLoadSave={onLoadSave} />;
    }
  };

  const activeMeta = tabs.find((t) => t.key === activeTab)!;

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[88vh] w-full max-w-5xl animate-slide-up overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-surface), 0.99), rgba(var(--tj-surface-strong), 0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-border), 0.86), 0 24px 64px rgba(var(--tj-shadow), 0.16)',
          clipPath:
            'polygon(22px 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%, 0 22px)',
        }}
      >
        {/* ── Left sidebar ── */}
        <aside
          className="flex w-[260px] flex-shrink-0 flex-col"
          style={{
            borderRight: '1px solid rgba(var(--tj-border), 0.76)' ,
            background: 'rgba(var(--tj-surface-strong), 0.72)' ,
          }}
        >
          {/* Sidebar header */}
          <div
            className="px-5 py-5"
            style={{ borderBottom: '1px solid rgba(var(--tj-border), 0.72)' }}
          >
            <div
              className="font-serif text-xl font-bold tracking-[0.35em]"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <span style={{ color: 'rgba(var(--tj-accent-primary), 0.6)', WebkitTextFillColor: 'rgba(var(--tj-accent-primary), 0.6)' }}>◆</span>
              <span className="ml-2">设 置</span>
            </div>
            <div
              className="mt-1.5 h-px w-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.55), rgba(var(--tj-accent-primary), 0.1) 60%, transparent)',
              }}
            />
          </div>

          {/* Tab list */}
          <nav className="flex-1 overflow-y-auto py-3">
            {tabs.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-all"
                  style={{
                    background: active
                      ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.14) 0%, rgba(var(--tj-accent-primary), 0.02) 75%, transparent)'
                      : 'transparent',
                    borderLeft: active
                      ? '2px solid rgba(var(--tj-accent-primary), 0.95)'
                      : '2px solid transparent',
                  }}
                >
                  <span
                    className="text-lg transition-all"
                    style={{
                      color: active ? 'rgba(var(--tj-accent-primary), 1)' : 'rgba(var(--tj-accent-primary), 0.5)',
                      textShadow: 'none',
                    }}
                  >
                    {t.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-serif text-sm tracking-[0.25em] transition-colors"
                      style={{
                        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(220, 200, 160, 0.85)',
                      }}
                    >
                      {t.label}
                    </div>
                    <div
                      className="mt-0.5 text-xs tracking-wider transition-colors"
                      style={{
                        color: active ? 'rgba(var(--tj-text-secondary), 0.85)' : 'rgba(var(--tj-text-secondary), 0.6)',
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
            className="px-5 py-3 text-xs font-serif tracking-[0.25em]"
            style={{
              borderTop: '1px solid rgba(var(--tj-border), 0.72)',
              color: 'rgba(var(--tj-text-secondary), 0.55)',
            }}
          >
            <span style={{ color: 'rgba(var(--tj-accent-primary), 0.4)' }}>✦</span>
            <span className="ml-2">开拓轶事 · v0.1</span>
          </div>
        </aside>

        {/* ── Right content ── */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Right header */}
          <header
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid rgba(var(--tj-border), 0.74)' }}
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span className="text-base" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>
                  {activeMeta.icon}
                </span>
                <h2
                  className="font-serif text-lg font-bold tracking-[0.3em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
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
          <div className="flex-1 overflow-y-auto px-6 py-5">{renderTab()}</div>
        </section>
      </div>
    </div>
  );
}
