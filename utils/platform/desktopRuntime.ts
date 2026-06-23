export type RuntimePlatform = 'web' | 'desktop';

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function getRuntimePlatform(): RuntimePlatform {
  return isDesktopRuntime() ? 'desktop' : 'web';
}

export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as TauriWindow).__TAURI_INTERNALS__);
}

