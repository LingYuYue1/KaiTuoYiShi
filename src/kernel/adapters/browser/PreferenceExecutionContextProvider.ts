/**
 * PreferenceExecutionContextProvider — browser adapter that captures the
 * device execution overlay from the PreferenceStore.
 *
 * Reads the same preference keys that useGameState hydrates at startup,
 * so a captured overlay always matches what the settings UI last persisted.
 */

import type { ExecutionContextProvider, DeviceExecutionOverlay } from '@/src/kernel/ports/ExecutionContextProvider';
import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import type { API设置 } from '@/models/settings';
import { 创建空API设置 } from '@/models/settings';
import { createDefaultSettingsPlanes, type AppearancePreferences, type ContentLibrary, type ExecutionPolicy, type SavePolicy } from '@/models/settingsPlanes';
import { normalizeWorldbooks } from '@/utils/worldbook';

export const EXECUTION_POLICY_KEY = 'executionPolicy';
export const APPEARANCE_PREFERENCES_KEY = 'appearancePreferences';
export const CONTENT_LIBRARY_KEY = 'contentLibrary';
export const SAVE_POLICY_KEY = 'savePolicy';

export class PreferenceExecutionContextProvider implements ExecutionContextProvider {
  constructor(private readonly preferences: PreferenceStore) {}

  async captureDeviceOverlay(): Promise<DeviceExecutionOverlay> {
    const defaults = createDefaultSettingsPlanes();
    const [apiSettings, executionPolicy, appearance, content, savePolicy] = await Promise.all([
      this.preferences.get<API设置>('apiSettings'),
      this.preferences.get<ExecutionPolicy>(EXECUTION_POLICY_KEY),
      this.preferences.get<AppearancePreferences>(APPEARANCE_PREFERENCES_KEY),
      this.preferences.get<ContentLibrary>(CONTENT_LIBRARY_KEY),
      this.preferences.get<SavePolicy>(SAVE_POLICY_KEY),
    ]);

    return {
      apiSettings: apiSettings ?? 创建空API设置(),
      executionPolicy: executionPolicy ?? defaults.execution,
      appearance: appearance ?? defaults.appearance,
      content: content ?? defaults.content,
      savePolicy: savePolicy ?? defaults.save,
      worldbooks: normalizeWorldbooks([...(content?.worldbooks ?? defaults.content.worldbooks)]),
    };
  }
}
