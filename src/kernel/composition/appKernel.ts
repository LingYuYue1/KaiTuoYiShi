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
  RandomIdGenerator,
  SystemClock,
  DbPortableSaveMigrationStorage,
} from '@/src/kernel/adapters/browser';
import { PreferenceExecutionContextProvider } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import { IndexedDbSessionMigrationStorage } from '@/src/kernel/adapters/indexeddb/IndexedDbSessionMigrationStorage';
import { SessionMigrationUseCases } from '@/src/kernel/application/sessionMigration';
import { PortableSaveMigrationUseCases } from '@/src/kernel/application/portableSaveMigration';
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
      const sessionMigration = new SessionMigrationUseCases(new IndexedDbSessionMigrationStorage(), preferences);
      const portableMigration = new PortableSaveMigrationUseCases(new DbPortableSaveMigrationStorage(), preferences);
      const sessions = new KernelSessionDirectory(
        kernel,
        context,
        new BrowserSkillDraftGenerator(),
        new BrowserContextSnapshotBuilder(),
        new BrowserAlbumAuthoring(),
        clock,
        ids,
      );
      return {
        sessions,
        device: new PreferenceDeviceUseCases(preferences),
        saves: createSavesUseCases(saves, sessions, preferences, clock),
        migration: {
          inspect: (sessionId) => sessionMigration.inspect(sessionId),
          migrateV2: (sessionId, options) => sessionMigration.migrateV2(sessionId, options),
          inspectPortableSaves: () => portableMigration.inspect(),
          migratePortableSaves: (options) => portableMigration.migrate(options),
        },
        content: createContentUseCases(preferences),
        onboarding: createOnboardingUseCases(preferences),
        diagnostics: createDiagnosticsUseCases(),
        cloud: createCloudUseCases(preferences, saves),
        host: createHostUseCases(),
      } satisfies IKernel;
    })();
  }
  return rootPromise;
}
