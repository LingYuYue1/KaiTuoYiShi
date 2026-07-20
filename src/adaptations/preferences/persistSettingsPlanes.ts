import type { API设置, 游戏设置 } from '@/models/settings';
import { 创建空API设置 } from '@/models/settings';
import { createDefaultSettingsPlanes, splitSettings, type AppearancePreferences, type ContentLibrary } from '@/models/settingsPlanes';
import { APP_SESSION_ID, getAppRoot } from '@/src/adaptations/kernel';
import { getPreference } from '@/src/adaptations/preferences';
import { APPEARANCE_PREFERENCES_KEY, CONTENT_LIBRARY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';

/**
 * Split one settings-form submission into its four independent authorities.
 * The flat form value is ephemeral and is never stored under a compatibility key.
 */
export async function persistSettingsPlanes(settings: 游戏设置): Promise<void> {
  const defaults = createDefaultSettingsPlanes();
  const [root, apiProfiles, appearance, content] = await Promise.all([
    getAppRoot(),
    getPreference<API设置>('apiSettings'),
    getPreference<AppearancePreferences>(APPEARANCE_PREFERENCES_KEY),
    getPreference<ContentLibrary>(CONTENT_LIBRARY_KEY),
  ]);
  const planes = splitSettings(
    settings,
    apiProfiles ?? 创建空API设置(),
    appearance?.theme ?? defaults.appearance.theme,
  );
  const nextContent = { ...planes.content, worldbooks: content?.worldbooks ?? defaults.content.worldbooks };
  await Promise.all([
    root.device.replaceExecutionPolicy(planes.execution),
    root.device.replaceAppearance(planes.appearance),
    root.device.replaceContentLibrary(nextContent),
    root.device.replaceSavePolicy(planes.save),
  ]);
  if (!await root.sessions.exists(APP_SESSION_ID)) return;
  const terminal = await (await root.sessions.open(APP_SESSION_ID)).policy.replace(planes.story).result;
  if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
}
