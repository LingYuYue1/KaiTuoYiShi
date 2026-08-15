// 拆分 MANIFEST 共享模块（split-workspaces.mjs 与 rewrite-importers.mjs 共用）
export const LOGIC_BASENAME = 'albumWorkspaceLogic';
export const COMPONENTS_BASENAME = 'workspaceComponents';
export const WORKSPACES_BASENAME = 'workspaces';

export const logicFns = [
  'buildCharacterLibraryRecords', 'buildTravelerLibraryRecord', 'buildCharacterAlbumEntryIndex',
  'buildAlbumResourceEntries', 'buildSceneLibraryEntries', 'buildScopedCharacterGalleryEntries',
  'buildVisibleCharacterEntries', 'buildBuiltinAvatarEntries', 'buildTravelerBuiltinAvatarEntries',
  'classifySceneLibraryEntry', 'sceneLibraryKindLabel', 'defaultAlbumEntryTags', 'defaultAlbumEntryNote',
  'isNpcLibraryRecord', 'findNpcCanonicalName', 'mapImageSlotToNpcAvatarSlot', 'mapImageSlotToTravelerSlot',
  'buildPresentSceneNpcs', 'buildStorySnapshotSourceOptions', 'trimSnapshotSource', 'extractStorySnapshot',
  'pickSentence', 'inferSnapshotAtmosphere', 'buildSnapshotTitle', 'formatStorySnapshotSceneText',
  'buildSceneSourceText', 'anchorHasUsableContent', 'getTravelerAnchorStatus', 'getNpcAnchorStatus',
  'getSceneAnchorStatus', 'buildTravelerSourceText', 'buildNpcSourceText', 'createTask',
  'requiresCharacterTarget', 'resolveGenerationTargetId', 'cleanupAlbumAssets', 'statusLabel',
  'taskPromptTitle', 'looksLikeRawPromptTitle', 'imageBackendLabel', 'generationSourceLabel',
  'formatGenerationDate', 'historyKind', 'historyKindLabel', 'pngStyleSourceLabel',
  'resolvePromptMeta', 'buildPngStyleOptions', 'buildBatchExtractPlan',
];
export const logicTypes = [
  'CharacterLibraryEntry', 'SceneLibraryEntry', 'MountedImageSlot', 'CharacterLibraryRecord',
  'BaseCharacterLibraryRecord', 'TravelerLibraryRecord', 'NpcLibraryRecord',
];
export const componentFns = [
  'SafeAlbumImage', 'AnchorStat', 'AnchorToggle', 'EmptyLibraryBox', 'BaseGenerationFields',
  'ImagePreviewModal', 'SlotPickerModal', 'AnchorModeBadge', 'OptionButtonGroup', 'DraftActionButton',
  'ReferenceInjectionHint', 'taskStatusTone', 'historyKindTone', 'PromptBlock', 'StorySnapshotSummaryCard',
  'ParsedPanel', 'SnapshotParsedField', 'StateCard', 'SceneParameterPanel', 'GenerationSummary',
  'MiniInfo', 'Panel', 'Field', 'Button', 'InfoLine', 'Spinner',
];
export const componentConsts = ['CHARACTER_SLOTS'];

export const movedNames = new Set([...logicFns, ...logicTypes, ...componentFns, ...componentConsts]);

export function ownerBasename(name) {
  if (logicFns.includes(name) || logicTypes.includes(name)) return LOGIC_BASENAME;
  if (componentFns.includes(name) || componentConsts.includes(name)) return COMPONENTS_BASENAME;
  return null;
}
