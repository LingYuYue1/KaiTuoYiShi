/**
 * ExecutionContextProvider — captures the immutable device-plane execution
 * configuration for exactly one command.
 *
 * Contract (IKernelIdealRefactorPlan §5.1 'context-captured', §6):
 *   - Captured once per command, after registration and before the first model call.
 *   - Immutable for the command's lifetime: applying a new API profile mid-stream
 *     affects only the NEXT command.
 *   - The overlay exists in memory only. SessionRepository sanitizes device
 *     fields at every CAS, so a captured overlay can never leak into a stored
 *     record, projection, save, or export.
 *   - Command rejection/cancellation NEVER writes the overlay back to the
 *     preference authority.
 */

import type { API设置 } from '@/models/settings';
import type { AppearancePreferences, ContentLibrary, ExecutionPolicy, SavePolicy } from '@/models/settingsPlanes';
import type { 世界书 } from '@/models/worldbook';

/** Device-plane fields required to execute a command. */
export type DeviceExecutionOverlay = Readonly<{
  apiSettings: API设置;
  executionPolicy: ExecutionPolicy;
  appearance: AppearancePreferences;
  content: ContentLibrary;
  savePolicy: SavePolicy;
  worldbooks: readonly 世界书[];
}>;

export interface ExecutionContextProvider {
  /** Capture the current device configuration. Called once per command. */
  captureDeviceOverlay(): Promise<DeviceExecutionOverlay>;
}
