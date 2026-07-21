/**
 * Device capability contract (IKernelIdealRefactorPlan §3 DeviceUseCases).
 *
 * Device preferences are the device plane's ONLY public surface. Projections
 * are redacted DTOs: an API key never appears in a DeviceProjection — only
 * its presence. Components stop reading/writing arbitrary preference keys.
 */

import type { API设置, 主题预设, 文生图API配置 } from '@/models/settings';
import type { API方案槽位, AuxApiProfileState } from '@/models/apiProfile';
import type { AppearancePreferences, ContentLibrary, ExecutionPolicy, SavePolicy } from '@/models/settingsPlanes';

export type ApiConnectionDraft = Readonly<{
  id?: string;
  name?: string;
  provider?: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  retryCount?: number;
  maxTokens?: number;
  temperature?: number;
  enableClaudeMode?: boolean;
  createdAt?: number;
  updatedAt?: number;
}>;

export type ConnectionTestProjection = Readonly<{
  ok: boolean;
  detail: string;
}>;

export type ImageWorkflowCandidate = Readonly<{
  id: string;
  title: string;
  source: 'queue' | 'history';
  workflowJson: string;
}>;

export type DeviceProjection = Readonly<{
  api: Readonly<{
    activeConfigId: string | null;
    configs: ReadonlyArray<Readonly<{
      id: string;
      name: string;
      provider: string;
      baseUrl: string;
      model: string;
      /** Redacted — presence only, never the key material. */
      hasApiKey: boolean;
    }>>;
  }>;
  appearance: Readonly<{
    theme: 主题预设;
  }>;
  execution: Readonly<{
    autoRetryOnError: boolean;
    autoRetryCount: number;
    backgroundTaskMode: string;
  }>;
  save: Readonly<{ autosaveOnTurn: boolean }>;
  content: Readonly<{ promptModuleCount: number; stPresetCount: number }>;
}>;

export type DeviceProjectionListener = (projection: DeviceProjection) => void;

export type DeviceSettingsSnapshot = Readonly<{
  apiSettings: API设置;
  execution: ExecutionPolicy;
  appearance: AppearancePreferences;
  content: ContentLibrary;
  contentInitialized: boolean;
  save: SavePolicy;
}>;

export interface DeviceUseCases {
  projection(): Promise<DeviceProjection>;
  /** Explicit editor/hydration read; credentials never enter DeviceProjection. */
  loadSettings(): Promise<DeviceSettingsSnapshot>;
  subscribe(listener: DeviceProjectionListener): () => void;
  /** Switch the active API profile. Affects only commands captured AFTER this call. */
  applyApiProfile(configId: string): Promise<DeviceProjection>;
  replaceApiSettings(settings: API设置): Promise<DeviceProjection>;
  replaceExecutionPolicy(policy: ExecutionPolicy): Promise<DeviceProjection>;
  replaceAppearance(preferences: AppearancePreferences): Promise<DeviceProjection>;
  replaceContentLibrary(content: ContentLibrary): Promise<DeviceProjection>;
  replaceSavePolicy(policy: SavePolicy): Promise<DeviceProjection>;
  loadApiEditorProfiles(): Promise<Readonly<{
    slots: readonly API方案槽位[];
    auxiliaryByConfig: Readonly<Record<string, AuxApiProfileState>>;
  }>>;
  replaceApiProfileSlots(slots: readonly API方案槽位[]): Promise<void>;
  replaceAuxiliaryApiProfiles(profiles: Readonly<Record<string, AuxApiProfileState>>): Promise<void>;
  fetchModels(config: ApiConnectionDraft): Promise<string[]>;
  testConnection(config: ApiConnectionDraft): Promise<ConnectionTestProjection>;
  testImageConnection(config: 文生图API配置): Promise<string>;
  fetchImageModels(config: 文生图API配置): Promise<string[]>;
  fetchImageWorkflows(config: 文生图API配置, source: 'queue' | 'history'): Promise<ImageWorkflowCandidate[]>;
  updateTheme(theme: 主题预设): Promise<DeviceProjection>;
}
