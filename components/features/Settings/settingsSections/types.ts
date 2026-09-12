import type { ComponentType, Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { API设置, DeviceSettings, 游戏设置, 主题预设 } from '@/models/settings';
import type { API方案槽位, AuxApiProfileState } from '@/models/apiProfiles';
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
import type { SaveCatalogRepairResult, SaveCatalogRepairScope, SaveCatalogRepairState, SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import type { 世界书 } from '@/models/worldbook';
import type { 剧情节点 } from '@/models/plot';
import type { STRegexScript } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/contracts/ai';
import type { ApiErrorReport, ConnectionTestConfig, ConnectionTestResult } from '@/hooks/useAiTools';

export type SettingsTab =
  | 'api' | 'apiErrors' | 'game' | 'visual' | 'context' | 'nsfw' | 'variables'
  | 'prompts' | 'tavernPresets' | 'extra' | 'theme' | 'storage'
  | 'variableUpdate' | 'memory' | 'yiting' | 'news' | 'zhiku' | 'storyWeaving' | 'phone';

export interface SettingsModalProps {
  onClose: () => void;
  deviceSettings: DeviceSettings;
  onApiSettingsChange: (s: API设置) => void;
  onGameSettingsChange: (s: 游戏设置) => void;
  onThemeChange: (t: 主题预设) => void;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
  /** 回档（分支）用例动作：转发给存档管理页签（SaveManager settingsTab），App 从 useGame 门面注入。 */
  onBranchSave?: (id: number) => Promise<boolean>;
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
  on剧情编织Change: Dispatch<SetStateAction<剧情编织系统>>;
  /** 变量管理面板所需的 setter 切片（与 VariableSetters 结构性一致，避免引用已弃用接口）。 */
  variableSetters: {
    set旅人: Dispatch<SetStateAction<角色数据结构>>;
    set世界: Dispatch<SetStateAction<世界状态>>;
    set记忆: Dispatch<SetStateAction<记忆系统>>;
    set忆庭: Dispatch<SetStateAction<忆庭系统>>;
    set智库: Dispatch<SetStateAction<智库系统>>;
    set手机: Dispatch<SetStateAction<手机系统>>;
    setNPC: Dispatch<SetStateAction<NPC记录[]>>;
    set新闻: Dispatch<SetStateAction<新闻条目[]>>;
    set剧情: Dispatch<SetStateAction<剧情节点[]>>;
  };
  variableEditingLocked?: boolean;
  getContextSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  initialTab?: SettingsTab;
  /** Phase 7.2：世界书变更回调（同时负责持久化到 IndexedDB）。 */
  onWorldbooksChange: (books: 世界书[]) => void;
  /** 面板用例动作（片 panel-p1）：存档删除 resolve→级联删除，转发给存档管理页签。 */
  onDeleteSave: (save: SaveListItemSummary) => Promise<boolean>;
  /** 面板用例动作（片 panel-p1）：整棵存档树删除，转发给存档管理页签。 */
  onDeleteSaveTree: (rootId: string) => Promise<void>;
  /** 面板用例动作（片 panel-p7）：活动存档树元信息清理，转发给存档管理页签。 */
  onClearActiveSaveTreeMeta: (target?: { rootId?: string; nodeId?: string } | null) => void;
  /** 面板用例动作（片 panel-p7）：存档目录快照 / 修复 / 订阅 / 历史恢复点清理 / 导出前读取 / 导入落库，转发给存档管理页签。 */
  onGetSaveCatalogSnapshot: () => Promise<SaveCatalogSnapshot>;
  onStartSaveCatalogRepair: (scope?: SaveCatalogRepairScope) => Promise<SaveCatalogRepairResult>;
  onSubscribeSaveCatalogRepair: (listener: (state: SaveCatalogRepairState) => void) => () => void;
  onRepairSaveDatabase: () => Promise<void>;
  onDeleteLegacyBackupSaves: () => Promise<number>;
  /** 面板用例动作（片 panel-p7）：导出单节点 / 整树存档包 + 导入存档包，转发给存档管理页签。 */
  onExportSavePackage: (id: number) => Promise<void>;
  onExportSaveTreePackage: (rootId: string) => Promise<void>;
  onImportSaveFileAsMany: (file: File) => Promise<number>;
  /** 面板用例动作（片 panel-p1）：tavernRegex 提取/分析/试运行，转发给提示词模块页签。 */
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
  onAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
  onDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
  /** 设置持久化用例动作（片 panel-p2）：写入侧统一经 useDeviceSettings 管理器收敛，不再直连 dbService。 */
  onPersistGameSettings: (s: 游戏设置) => Promise<void>;
  onPersistApiSettings: (s: API设置) => Promise<void>;
  onPersistTheme: (t: 主题预设) => Promise<void>;
  onPersistApiProfile: (api: API设置, game: 游戏设置) => Promise<void>;
  /** 本机 API 方案槽位 / 辅助 API 配置读写动作（片 panel-p9）：经 useDeviceSettings 收敛，不直连 dbService。 */
  onLoadApiProfileSlots: () => Promise<API方案槽位[]>;
  onPersistApiProfileSlots: (slots: API方案槽位[]) => Promise<void>;
  onLoadAuxApiProfiles: () => Promise<Record<string, AuxApiProfileState>>;
  onPersistAuxApiProfiles: (profiles: Record<string, AuxApiProfileState>) => Promise<void>;
  /** AI 探测用例动作（片 panel-p3）：模型列表获取 / 连接测试，取代 Services tab 直连 services/ai。 */
  fetchModels: (config: ConnectionTestConfig) => Promise<string[]>;
  testConnection: (config: ConnectionTestConfig) => Promise<ConnectionTestResult>;
  /** AI 错误报告用例动作（片 panel-p3）：加载 / 清空，取代直连 services/ai。 */
  loadApiErrorReports: () => Promise<ApiErrorReport[]>;
  clearApiErrorReports: () => Promise<void>;
}

/**
 * 各 section 的统一契约：只消费本 context，自身完成 props 映射，SettingsModal 不感知组件细节。
 *
 * 草稿语义：子系统设置（变量更新/记忆/忆庭/新闻/智库/剧情/手机）使用原始 onGameSettingsChange，
 * 仅更新内存，关闭/重开设置保留草稿，只有各页「保存」才落盘；浏览器刷新会丢弃未保存草稿。
 * 其余设置页维持原有即时落盘（persistGameSettingsChange）。
 */
export interface SettingsSectionContext extends SettingsModalProps {
  /** deviceSettings.gameSettings 的投影，减少各 section 的重复解构。 */
  gameSettings: 游戏设置;
  persistGameSettingsChange: (next: 游戏设置) => void;
  persistThemeChange: (next: 主题预设) => void;
}

export type SettingsSectionGroupId =
  | 'appearance' | 'narrative' | 'connection' | 'subsystems' | 'data' | 'private';

export interface SettingsSectionGroup {
  id: SettingsSectionGroupId;
  label: string;
}

export interface SettingsSectionDefinition {
  key: SettingsTab;
  label: string;
  icon: string;
  navIcon: LucideIcon;
  group: SettingsSectionGroupId;
  subtitle: string;
  fullHeight?: boolean;
  Component: ComponentType<SettingsSectionContext>;
}
