import * as apiTools from '@/services/ai/apiTools';
import * as contextSnapshot from '@/src/kernel/workflows/contextSnapshot';
import * as mainResponse from '@/src/kernel/protocol/mainResponse';
import * as path from '@/src/kernel/domain/path/pathOperations';
import * as storyProgress from '@/src/kernel/domain/story/storyProgress';
import * as storyPlanning from '@/src/kernel/domain/story/storyPlanningAnalysis';
import * as npcRelationship from '@/src/kernel/domain/npc/npcRelationshipPlanning';
import * as memory from '@/src/kernel/workflows/memoryUtils';
import * as tavernRegex from '@/src/kernel/workflows/tavernRegexProcessor';
import * as album from '@/src/kernel/workflows/albumOperations';
import * as imageGeneration from '@/services/ai/imageGeneration';
import * as phone from '@/services/ai/phoneService';
import * as openingArchive from '@/services/ai/openingArchive';
import * as skillGenerator from '@/services/ai/skillGenerator';
import * as travelerTemplate from '@/services/ai/travelerTemplate';
import * as narrativeImage from '@/services/ai/narrativeImageParse';
import * as characterAnchor from '@/services/ai/characterAnchorExtract';
import * as imageTokenizer from '@/services/ai/imagePromptTokenizer';
import * as storyWeaving from '@/src/kernel/workflows/storyWeaving';
import * as workflowRecovery from '@/services/workflowRecovery';
import * as githubCloudSave from '@/services/githubCloudSave';
import * as apiErrorReports from '@/services/ai/apiErrorReportService';
import * as desktopBridge from '@/services/desktop/desktopBridge';
import * as desktopDiagnostics from '@/services/desktop/desktopDiagnostics';
import * as desktopReleaseInfo from '@/services/desktop/desktopReleaseInfo';
import * as desktopAssetMirror from '@/services/desktop/desktopAssetMirror';
import * as desktopSaveBackup from '@/services/desktop/desktopSaveBackup';
import * as desktopMigrationBackup from '@/services/desktop/desktopMigrationBackup';
import * as desktopSaveDeltaMirror from '@/services/desktop/desktopSaveDeltaMirror';
import * as desktopSaveMirror from '@/services/desktop/desktopSaveMirror';
import * as desktopSettingsMirror from '@/services/desktop/desktopSettingsMirror';
import type { AsyncFunctions, KernelServices } from '@/src/kernel/ports/KernelServices';

function makeAsync<Module extends object>(module: Module): AsyncFunctions<Module> {
  const methods: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(module)) {
    const value = module[key as keyof Module];
    if (typeof value !== 'function') continue;
    methods[key] = async (...args: unknown[]) => Reflect.apply(value, undefined, args);
  }
  return methods as AsyncFunctions<Module>;
}

export function createBrowserKernelServices(): KernelServices {
  return {
    contextSnapshot: makeAsync(contextSnapshot),
    mainResponse: makeAsync(mainResponse),
    path: makeAsync(path),
    storyProgress: makeAsync(storyProgress),
    storyPlanning: makeAsync(storyPlanning),
    npcRelationship: makeAsync(npcRelationship),
    memory: makeAsync(memory),
    tavernRegex: makeAsync(tavernRegex),
    album: makeAsync(album),
    apiTools: makeAsync(apiTools),
    imageGeneration: makeAsync(imageGeneration),
    phone: makeAsync(phone),
    openingArchive: makeAsync(openingArchive),
    skillGenerator: makeAsync(skillGenerator),
    travelerTemplate: makeAsync(travelerTemplate),
    narrativeImage: makeAsync(narrativeImage),
    characterAnchor: makeAsync(characterAnchor),
    imageTokenizer: makeAsync(imageTokenizer),
    storyWeaving: makeAsync(storyWeaving),
    workflowRecovery: makeAsync(workflowRecovery),
    githubCloudSave: makeAsync(githubCloudSave),
    apiErrorReports: makeAsync(apiErrorReports),
    desktopBridge: makeAsync(desktopBridge),
    desktopDiagnostics: makeAsync(desktopDiagnostics),
    desktopReleaseInfo: makeAsync(desktopReleaseInfo),
    desktopAssetMirror: makeAsync(desktopAssetMirror),
    desktopSaveBackup: makeAsync(desktopSaveBackup),
    desktopMigrationBackup: makeAsync(desktopMigrationBackup),
    desktopSaveDeltaMirror: makeAsync(desktopSaveDeltaMirror),
    desktopSaveMirror: makeAsync(desktopSaveMirror),
    desktopSettingsMirror: makeAsync(desktopSettingsMirror),
  };
}
