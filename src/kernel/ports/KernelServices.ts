type AnyFunction = (...args: never[]) => unknown;

export type AsyncFunctions<Module> = {
  [Key in keyof Module as Module[Key] extends AnyFunction ? Key : never]:
    Module[Key] extends (...args: infer Args) => infer Result
      ? (...args: Args) => Promise<Awaited<Result>>
      : never;
};

/** Browser/application capabilities exposed only through IKernel. */
export interface KernelServices {
  readonly contextSnapshot: AsyncFunctions<typeof import('@/src/kernel/workflows/contextSnapshot')>;
  readonly mainResponse: AsyncFunctions<typeof import('@/src/kernel/protocol/mainResponse')>;
  readonly path: AsyncFunctions<typeof import('@/src/kernel/domain/path/pathOperations')>;
  readonly storyProgress: AsyncFunctions<typeof import('@/src/kernel/domain/story/storyProgress')>;
  readonly storyPlanning: AsyncFunctions<typeof import('@/src/kernel/domain/story/storyPlanningAnalysis')>;
  readonly npcRelationship: AsyncFunctions<typeof import('@/src/kernel/domain/npc/npcRelationshipPlanning')>;
  readonly memory: AsyncFunctions<typeof import('@/src/kernel/workflows/memoryUtils')>;
  readonly tavernRegex: AsyncFunctions<typeof import('@/src/kernel/workflows/tavernRegexProcessor')>;
  readonly album: AsyncFunctions<typeof import('@/src/kernel/workflows/albumOperations')>;
  readonly apiTools: AsyncFunctions<typeof import('@/services/ai/apiTools')>;
  readonly imageGeneration: AsyncFunctions<typeof import('@/services/ai/imageGeneration')>;
  readonly phone: AsyncFunctions<typeof import('@/services/ai/phoneService')>;
  readonly openingArchive: AsyncFunctions<typeof import('@/services/ai/openingArchive')>;
  readonly skillGenerator: AsyncFunctions<typeof import('@/services/ai/skillGenerator')>;
  readonly travelerTemplate: AsyncFunctions<typeof import('@/services/ai/travelerTemplate')>;
  readonly narrativeImage: AsyncFunctions<typeof import('@/services/ai/narrativeImageParse')>;
  readonly characterAnchor: AsyncFunctions<typeof import('@/services/ai/characterAnchorExtract')>;
  readonly imageTokenizer: AsyncFunctions<typeof import('@/services/ai/imagePromptTokenizer')>;
  readonly storyWeaving: AsyncFunctions<typeof import('@/src/kernel/workflows/storyWeaving')>;
  readonly workflowRecovery: AsyncFunctions<typeof import('@/services/workflowRecovery')>;
  readonly githubCloudSave: AsyncFunctions<typeof import('@/services/githubCloudSave')>;
  readonly apiErrorReports: AsyncFunctions<typeof import('@/services/ai/apiErrorReportService')>;
  readonly desktopBridge: AsyncFunctions<typeof import('@/services/desktop/desktopBridge')>;
  readonly desktopDiagnostics: AsyncFunctions<typeof import('@/services/desktop/desktopDiagnostics')>;
  readonly desktopReleaseInfo: AsyncFunctions<typeof import('@/services/desktop/desktopReleaseInfo')>;
  readonly desktopAssetMirror: AsyncFunctions<typeof import('@/services/desktop/desktopAssetMirror')>;
  readonly desktopSaveBackup: AsyncFunctions<typeof import('@/services/desktop/desktopSaveBackup')>;
  readonly desktopMigrationBackup: AsyncFunctions<typeof import('@/services/desktop/desktopMigrationBackup')>;
  readonly desktopSaveDeltaMirror: AsyncFunctions<typeof import('@/services/desktop/desktopSaveDeltaMirror')>;
  readonly desktopSaveMirror: AsyncFunctions<typeof import('@/services/desktop/desktopSaveMirror')>;
  readonly desktopSettingsMirror: AsyncFunctions<typeof import('@/services/desktop/desktopSettingsMirror')>;
}
