import { asSessionId, type IKernel } from '@/src/kernel/contract';
import { createKernel } from '@/src/kernel/createKernel';
import { createIndexedDbSessionRepository } from '@/src/kernel/adapters/indexeddb';
import {
  BrowserRuntimeActionEngine,
  createBrowserKernelServices,
  BrowserTurnEngine,
  createIndexedDbPreferenceStore,
  createDbServiceSaveCatalog,
} from '@/src/kernel/adapters/browser';
let kernelPromise: Promise<IKernel> | null = null;
export const APP_SESSION_ID = asSessionId('local-session');

/** Single browser composition root shared by hooks and non-React kernel clients. */
export function getAppKernel(): Promise<IKernel> {
  if (!kernelPromise) {
    kernelPromise = Promise.all([
      createIndexedDbPreferenceStore(),
      createDbServiceSaveCatalog(),
    ]).then(([preferences, saves]) => {
      return createKernel({
        sessions: createIndexedDbSessionRepository(),
        turns: new BrowserTurnEngine(),
        actions: new BrowserRuntimeActionEngine(),
        preferences,
        saves,
        services: createBrowserKernelServices(),
      });
    });
  }
  return kernelPromise;
}
