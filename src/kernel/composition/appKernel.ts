import { asSessionId, type IKernel } from '@/src/kernel/contract';
import type { CommandExecutor } from '@/src/kernel/application/CommandExecutor';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { createIndexedDbSessionRepository } from '@/src/kernel/adapters/indexeddb';
import {
  createIndexedDbPreferenceStore,
  createDbServiceSaveCatalog,
  BrowserSkillDraftGenerator,
  BrowserContextSnapshotBuilder,
  BrowserContentResolver,
  BrowserStoryWeavingProcessor,
  BrowserAlbumAuthoring,
  BrowserAlbumImageGenerator,
  BrowserPhoneReplyGenerator,
  BrowserConsoleLogTarget,
  RandomIdGenerator,
  SystemClock,
} from '@/src/kernel/adapters/browser';
import { BoundedKernelLogTarget, createKernelLogger } from '@/src/kernel/observability/kernelLogger';
import { PreferenceExecutionContextProvider } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import { KernelSessionDirectory } from '@/src/kernel/application/sessionDirectory';
import { PreferenceDeviceUseCases } from '@/src/kernel/application/deviceUseCases';
import {
  createCloudUseCases,
  createContentUseCases,
  createDiagnosticsUseCases,
  createHostUseCases,
  createOnboardingUseCases,
  createSavesUseCases,
} from '@/src/kernel/application/rootCapabilities';

let commandKernelPromise: Promise<CommandExecutor> | null = null;
let rootPromise: Promise<IKernel> | null = null;
const clock = new SystemClock();
const ids = new RandomIdGenerator();
const kernelLogBuffer = new BoundedKernelLogTarget(500);
const kernelLogger = createKernelLogger(
  () => clock.now(),
  [new BrowserConsoleLogTarget(), kernelLogBuffer],
);

export const APP_SESSION_ID = asSessionId('local-session');

function getCommandKernel(): Promise<CommandExecutor> {
  if (!commandKernelPromise) {
    commandKernelPromise = createIndexedDbPreferenceStore().then((preferences) => {
      const context = new PreferenceExecutionContextProvider(preferences);
      return new NativeKernel({
        sessions: createIndexedDbSessionRepository(),
        context,
        content: new BrowserContentResolver(),
        storyWeaving: new BrowserStoryWeavingProcessor(),
        albumAuthoring: new BrowserAlbumAuthoring(),
        albumImages: new BrowserAlbumImageGenerator(),
        phoneReplies: new BrowserPhoneReplyGenerator(),
        clock,
        ids,
        logger: kernelLogger,
      });
    });
  }
  return commandKernelPromise;
}

export function getAppRoot(): Promise<IKernel> {
  if (!rootPromise) {
    rootPromise = (async () => {
      const [kernel, preferences, saves] = await Promise.all([
        getCommandKernel(),
        createIndexedDbPreferenceStore(),
        createDbServiceSaveCatalog(),
      ]);
      const context = new PreferenceExecutionContextProvider(preferences);
      const sessions = new KernelSessionDirectory(
        kernel,
        context,
        new BrowserSkillDraftGenerator(),
        new BrowserContextSnapshotBuilder(),
        new BrowserAlbumAuthoring(),
        clock,
        ids,
        kernelLogger,
      );
      return {
        sessions,
        device: new PreferenceDeviceUseCases(preferences),
        saves: createSavesUseCases(saves, sessions, preferences, clock),
        content: createContentUseCases(preferences),
        onboarding: createOnboardingUseCases(preferences),
        diagnostics: createDiagnosticsUseCases(kernelLogger, kernelLogBuffer),
        cloud: createCloudUseCases(preferences, saves),
        host: createHostUseCases(),
      } satisfies IKernel;
    })();
  }
  return rootPromise;
}
