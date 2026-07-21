import type { 游戏设置 } from '@/models/settings';
import { splitSettings } from '@/models/settingsPlanes';
import { APP_SESSION_ID, getAppRoot } from '@/src/adaptations/kernel';

/**
 * Split one settings-form submission into its four independent authorities.
 * The flat form value is ephemeral and is never stored under a compatibility key.
 */
export async function persistSettingsPlanes(settings: 游戏设置): Promise<void> {
  const root = await getAppRoot();
  const current = await root.device.loadSettings();
  const planes = splitSettings(
    settings,
    current.apiSettings,
    current.appearance.theme,
  );
  const nextContent = { ...planes.content, worldbooks: current.content.worldbooks };
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
