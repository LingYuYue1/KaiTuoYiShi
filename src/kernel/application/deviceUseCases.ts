/**
 * PreferenceDeviceUseCases — kernel.device implementation over PreferenceStore.
 *
 * The projection is a redacted DTO (hasApiKey flags, never key material).
 * Writers here are the ONLY sanctioned device-plane mutation path for
 * presentation code; they never touch StoryState or the session repository.
 */

import type { ApiConnectionDraft, DeviceProjection, DeviceProjectionListener, DeviceUseCases } from '@/src/kernel/contract/device';
import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import type { API设置, 主题预设, 文生图API配置 } from '@/models/settings';
import { 创建空API设置 } from '@/models/settings';
import { createDefaultSettingsPlanes, type AppearancePreferences, type ContentLibrary, type ExecutionPolicy, type SavePolicy } from '@/models/settingsPlanes';
import { API_PROFILE_SLOTS_KEY, AUX_API_PROFILE_KEY, type API方案槽位, type AuxApiProfileState } from '@/models/apiProfile';
import { APPEARANCE_PREFERENCES_KEY, CONTENT_LIBRARY_KEY, EXECUTION_POLICY_KEY, SAVE_POLICY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';

export class PreferenceDeviceUseCases implements DeviceUseCases {
  private readonly listeners = new Set<DeviceProjectionListener>();

  constructor(private readonly preferences: PreferenceStore) {}

  async projection(): Promise<DeviceProjection> {
    const defaults = createDefaultSettingsPlanes();
    const [api, execution, appearance, content, save] = await Promise.all([
      this.preferences.get<API设置>('apiSettings'),
      this.preferences.get<ExecutionPolicy>(EXECUTION_POLICY_KEY),
      this.preferences.get<AppearancePreferences>(APPEARANCE_PREFERENCES_KEY),
      this.preferences.get<ContentLibrary>(CONTENT_LIBRARY_KEY),
      this.preferences.get<SavePolicy>(SAVE_POLICY_KEY),
    ]);
    return buildProjection(
      api ?? 创建空API设置(),
      execution ?? defaults.execution,
      appearance ?? defaults.appearance,
      content ?? defaults.content,
      save ?? defaults.save,
    );
  }

  subscribe(listener: DeviceProjectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async applyApiProfile(configId: string): Promise<DeviceProjection> {
    const api = (await this.preferences.get<API设置>('apiSettings')) ?? 创建空API设置();
    if (!api.configs.some((config) => config.id === configId)) {
      throw new Error(`API 配置不存在：${configId}`);
    }
    const next: API设置 = { ...api, activeConfigId: configId };
    await this.preferences.set('apiSettings', next);
    return this.emit();
  }

  async replaceApiSettings(settings: API设置): Promise<DeviceProjection> {
    await this.preferences.set('apiSettings', structuredClone(settings));
    return this.emit();
  }

  async replaceExecutionPolicy(policy: ExecutionPolicy): Promise<DeviceProjection> {
    await this.preferences.set(EXECUTION_POLICY_KEY, structuredClone(policy));
    return this.emit();
  }

  async replaceAppearance(preferences: AppearancePreferences): Promise<DeviceProjection> {
    await this.preferences.set(APPEARANCE_PREFERENCES_KEY, structuredClone(preferences));
    return this.emit();
  }

  async replaceContentLibrary(content: ContentLibrary): Promise<DeviceProjection> {
    await this.preferences.set(CONTENT_LIBRARY_KEY, structuredClone(content));
    return this.emit();
  }

  async replaceSavePolicy(policy: SavePolicy): Promise<DeviceProjection> {
    await this.preferences.set(SAVE_POLICY_KEY, structuredClone(policy));
    return this.emit();
  }

  async loadApiEditorProfiles() {
    const [slots, auxiliaryByConfig] = await Promise.all([
      this.preferences.get<API方案槽位[]>(API_PROFILE_SLOTS_KEY),
      this.preferences.get<Record<string, AuxApiProfileState>>(AUX_API_PROFILE_KEY),
    ]);
    return {
      slots: Array.isArray(slots) ? structuredClone(slots) : [],
      auxiliaryByConfig: auxiliaryByConfig && typeof auxiliaryByConfig === 'object'
        ? structuredClone(auxiliaryByConfig)
        : {},
    };
  }

  async replaceApiProfileSlots(slots: readonly API方案槽位[]): Promise<void> {
    await this.preferences.set(API_PROFILE_SLOTS_KEY, structuredClone(slots));
  }

  async replaceAuxiliaryApiProfiles(profiles: Readonly<Record<string, AuxApiProfileState>>): Promise<void> {
    await this.preferences.set(AUX_API_PROFILE_KEY, structuredClone(profiles));
  }

  async fetchModels(config: ApiConnectionDraft) {
    const { fetchModels } = await import('@/services/ai/apiTools');
    return fetchModels(config);
  }

  async testConnection(config: ApiConnectionDraft) {
    const { testConnection } = await import('@/services/ai/apiTools');
    return testConnection(config);
  }

  async testImageConnection(config: 文生图API配置) {
    const { testImageGenerationConnection } = await import('@/services/ai/imageGeneration');
    return testImageGenerationConnection(config);
  }

  async fetchImageModels(config: 文生图API配置) {
    const { fetchImageGenerationModels } = await import('@/services/ai/imageGeneration');
    return fetchImageGenerationModels(config);
  }

  async fetchImageWorkflows(config: 文生图API配置, source: 'queue' | 'history') {
    const { fetchComfyWorkflowCandidates } = await import('@/services/ai/imageGeneration');
    return fetchComfyWorkflowCandidates(config, source);
  }

  async updateTheme(theme: 主题预设): Promise<DeviceProjection> {
    const defaults = createDefaultSettingsPlanes(theme);
    const current = await this.preferences.get<AppearancePreferences>(APPEARANCE_PREFERENCES_KEY);
    await this.preferences.set(APPEARANCE_PREFERENCES_KEY, { ...(current ?? defaults.appearance), theme });
    return this.emit();
  }

  private async emit(): Promise<DeviceProjection> {
    const projection = await this.projection();
    for (const listener of [...this.listeners]) listener(projection);
    return projection;
  }
}

function buildProjection(
  api: API设置,
  execution: ExecutionPolicy,
  appearance: AppearancePreferences,
  content: ContentLibrary,
  save: SavePolicy,
): DeviceProjection {
  return {
    api: {
      activeConfigId: api.activeConfigId ?? null,
      configs: api.configs.map((config) => ({
        id: config.id,
        name: (config as { name?: string }).name ?? config.model ?? config.id,
        provider: String(config.provider ?? ''),
        baseUrl: String(config.baseUrl ?? ''),
        model: String(config.model ?? ''),
        hasApiKey: typeof config.apiKey === 'string' && config.apiKey.length > 0,
      })),
    },
    appearance: { theme: appearance.theme },
    execution: {
      autoRetryOnError: execution.autoRetryOnError,
      autoRetryCount: execution.autoRetryCount,
      backgroundTaskMode: execution.backgroundTaskMode,
    },
    save: { autosaveOnTurn: save.autosaveOnTurn },
    content: { promptModuleCount: content.promptModules.length, stPresetCount: content.stPresetsV2.length },
  };
}
