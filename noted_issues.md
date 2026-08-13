# noted_issues — 代码质量扫描详细发现

> 本文档是 `ideal_design.md` §1 现状画像的完整数据底稿。扫描时间 2026-08-12，范围全库源码（289 个 .ts/.tsx），排除 node_modules/dist/.git。
> 每条附 文件:行号，供 executor 逐项定位。

## 1. 类型安全缺口

**整体极干净**：`@ts-ignore` / `@ts-expect-error` 0 处，非空断言 `!` 0 处。

### `as any`（2 处）
- `utils/lazyWithRetry.ts:5` — `ComponentType<any>` 泛型约束
- `utils/lazyWithRetry.ts:36` — 同上

### `: any`（2 处）
- `services/ai/chatCompletionClient.ts:1207` — `readOpenAICompatibleStreamDelta(parsed: any, ...)`
- `services/ai/chatCompletionClient.ts:1783` — `readOpenCodeResponsesStreamDelta(parsed: any)`

### `eslint-disable`（3 处）
- `hooks/useGame/saveLoadWorkflow.ts:435` — `@typescript-eslint/no-deprecated`（无树/过渡期路径）
- `hooks/useGame/saveLoadWorkflow.ts:463` — 同上（legacy 恢复点）
- `components/features/Settings/PromptModulesTab.tsx:336` — `react-hooks/exhaustive-deps`

### `as unknown as`（15 处，双断言是类型安全缺口）
| 文件 | 行号 | 处数 |
| --- | --- | --- |
| `services/dbService.ts` | 464, 470, 548, 1166, 2358 | 5 |
| `data/builtinPresets/index.ts` | 96, 105 | 2 |
| `hooks/useGame/saveLoadWorkflow.ts` | 117, 496 | 2 |
| `services/ai/responseParser.ts` | 237 | 1 |
| `utils/variableExecutor.ts` | 384 | 1 |
| `data/zhikuPreset.ts` | 297 | 1 |
| `components/features/Settings/ApiSettings.tsx` | 203 | 1 |
| `data/storyWeavingPreset.ts` | 340 | 1 |
| `workers/cloudBackup.worker.ts` | 21 | 1 |

## 2. lint 现状

- **1 error**：`hooks/useGameState.ts:570` — `react-hooks/set-state-in-effect`
- **2 warning**：
  - `components/features/GameSystems/album/workspaces.tsx:467`
  - `components/features/Settings/ApiErrorReportsTab.tsx:52`
- **47 条 suppression**：集中在异构厂商 JSON 解析层与工具链强制 `export default` 等协议豁免项。

## 3. 死代码（未引用导出）—— 75 处

> 定义：全库仅出现 1 次（即定义处）的导出符号。需逐个确认非动态 import、非测试用、非预留 API。

### utils/（19 处）
- `utils/nsfwArchivePolicy.ts:3` — `HERTA_REAL_BODY_ARCHIVE_GUIDANCE`
- `utils/presetMerger.ts:49` — `mergeWithBuiltin`
- `utils/macroEngine.ts:430` — `processMacrosBatch`
- `utils/devLog.ts:60` — `dumpDevLog`
- `utils/albumObjectUrl.ts:117` — `clearAlbumAssetObjectUrlCache`
- `utils/albumObjectUrl.ts:123` — `getAlbumAssetCacheStats`
- `utils/stPresetMigration.ts:85` — `migrateSTPresetsV1ToV2`
- `utils/stPresetParser.ts:31` — `BUILTIN_MAIN_COT_ID`
- `utils/stPresetParser.ts:434` — `parseSTPresetWithDetection`
- `utils/stPresetParser.ts:493` — `detectSTImportConflicts`
- `utils/stPresetParser.ts:514` — `mergeSTImportedModules`
- `utils/jsonRepair.ts:152` — `formatJsonWithRepair`
- `utils/worldbook.ts:89` — `addEntryToBook`
- `utils/worldbook.ts:93` — `removeEntryFromBook`
- `utils/worldbook.ts:97` — `updateEntryInBook`
- `utils/worldbook.ts:109` — `addBook`
- `utils/worldbook.ts:113` — `removeBook`
- `utils/worldbook.ts:481` — `splitEntriesByInjectMode`
- `utils/stSettingsNormalizer.ts:164` — `normalizeSTSettings`

### models/（5 处）
- `models/inventory.ts:45` — `ITEM_QUALITY_ORDER`
- `models/news.ts:12` — `NEWS_CATEGORY_ORDER`
- `models/settings.ts:1296` — `extractDeviceSettings`
- `models/settings.ts:1305` — `stripDeviceSettings`
- `models/npc.ts:152` — `NPC_RELATION_LABELS`

### data/（8 处）
- `data/journeyPresets.ts:45` — `getDifficulty`
- `data/journeyPresets.ts:566` — `freeOpeningWritingQuestions`
- `data/journeyPresets.ts:938` — `getWorkshopOpeningTemplatePack`
- `data/timePeriodPresets.ts:5` — `getTimePeriodById`
- `data/characterPresets.ts:13` — `getCharacterPresetById`
- `data/lore/openingCoreLore.ts:7` — `OPENING_CORE_LORE_ARCHIVE`
- `data/builtinPresets/index.ts:36` — `isBuiltinPreset`
- `data/builtinPresets/index.ts:43` — `getBuiltinPresetById`

### services/（14 处）
- `services/pathService.ts:284` — `manualBumpProgress`
- `services/dbService.ts:1291` — `isSaveTreeNodeLeaf`
- `services/dbService.ts:1716` — `replaceAllSaves`
- `services/dbService.ts:2085` — `exportSaveJson`
- `services/dbService.ts:2139` — `importSaveFile`
- `services/githubCloudSave.ts:376` — `listGitHubCloudSaves`
- `services/githubCloudSave.ts:392` — `downloadSaveFromGitHubCloud`
- `services/storage/saveCatalog.ts:203` — `isDisplaySaveCatalogRecord`
- `services/storage/cloudBackupTransferStore.ts:68` — `getCloudBackupTransfer`
- `services/storage/cloudBackupTransferStore.ts:105` — `listCloudBackupTransferParts`
- `services/ai/narrativeImageParse.ts:390` — `parseNarrativeImagePrompts`
- `services/ai/openAICompatibleModels.ts:79` — `clearOpenAICompatibleModelCache`
- `services/ai/structuredOutputRepair.ts:53` — `parseNumberedRecallLines`
- `styles/themes.ts:163` — `getThemeById`

### hooks/useGame/（10 处）
- `hooks/useGame/memoryUtils.ts:248` — `createTurnRecallEntry`
- `hooks/useGame/memoryUtils.ts:290` — `autoCompressMemorySystem`
- `hooks/useGame/memoryUtils.ts:312` — `autoCompressMemorySystemWithArchives`
- `hooks/useGame/memoryUtils.ts:432` — `compressNpcMemories`
- `hooks/useGame/memoryUtils.ts:651` — `formatMemoryForPrompt`
- `hooks/useGame/worldEvolution.ts:4` — `switchTimePeriod`
- `hooks/useGame/worldEvolution.ts:20` — `advanceGameTime`
- `hooks/useGame/saveLoadWorkflow.ts:152` — `buildSaveGameSettingsSnapshot`
- `hooks/useGame/tavernFormatGuard.ts:21` — `applyTavernFormatGuard`

### components/（19 处）
- `components/ui/Icons.tsx:1` — `Icons`
- `components/features/Chat/MessageRenderers.tsx:14` — `ThinkingBlock`
- `components/features/Chat/MessageRenderers.tsx:632` — `MemoryBlock`
- `components/features/Path/PathDebugView.tsx:42` — `PathDebugView`
- `components/features/GameSystems/album/workspaces.tsx:560` — `EntryGrid`
- `components/features/GameSystems/album/workspaces.tsx:1350` — `displayAlbumEntryTitle`
- `components/features/GameSystems/album/workspaces.tsx:2197` — `sceneLibraryFilterLabel`
- `components/features/GameSystems/album/workspaces.tsx:2206` — `sceneLibraryKindColor`
- `components/features/GameSystems/album/workspaces.tsx:2214` — `sceneLibraryKindSurface`
- `components/features/GameSystems/album/workspaces.tsx:2222` — `sceneLibraryKindBorder`
- `components/features/GameSystems/album/workspaces.tsx:2230` — `formatAlbumDate`
- `components/features/GameSystems/album/workspaces.tsx:2362` — `mapMountedSlotToNpcAvatarSlot`
- `components/features/GameSystems/album/workspaces.tsx:2368` — `mapMountedSlotToTravelerSlot`
- `components/features/GameSystems/album/workspaces.tsx:2399` — `characterAnchorHasPersistentContent`
- `components/features/GameSystems/album/workspaces.tsx:2624` — `deleteAlbumEntry`
- `components/features/GameSystems/album/albumArchive.ts:62` — `exportAlbum`
- `components/features/GameSystems/album/albumArchive.ts:105` — `importAlbum`
- `components/features/GameSystems/album/foundation.ts:71` — `imageGenerationTargets`
- `components/features/GameSystems/album/visualTokens.ts:19` — `quietAccentSurface`
- `components/features/GameSystems/album/referenceInjection.ts:66` — `referenceBackendSupport`

## 4. 过度防御 / 不可能兜底 —— 16 处

### 不可能 `default`（4 处，union 已穷举仍写 default）
- `utils/worldbook.ts:277-278` — `logic` 已穷举 `AND_ANY/AND_ALL/NOT_ANY/NOT_ALL`，仍 `default: return secondary.every(...)`
- `hooks/useGame/contextSnapshot.ts:471-473` — `case 'main'` 后仍有 `default`（`ContextSnapshotKind` 已穷举）
- `services/ai/newsModel.ts:247-248` — `NPC关系类型` 六分支已全部处理，仍 `default: return '公开关系不明'`
- `services/ai/imageGeneration.ts:407-409` — `文生图后端类型` 四分支已覆盖，仍 `case 'openai_compatible'` + `default`

### 静默 `catch`（12 处）
- `utils/devLog.ts:64-65` — `catch { return [] }` 吞异常返回空数组（日志读取失败静默）
- `utils/lazyWithRetry.ts:66-68` — 空闲预加载异常静默吞（有注释说明意图，可保留）
- `services/githubRequest.ts:110-112` — JSON 解析异常静默吞（代理返回非 JSON 错误页）
- `services/ai/narrativeImageParse.ts:304` — `catch { /* fall through */ }`
- `services/ai/narrativeImageParse.ts:311` — `catch { /* fall through */ }`
- `services/ai/chatCompletionClient.ts:1522-1524` — `// skip malformed SSE lines`
- `services/ai/chatCompletionClient.ts:1621-1623` — `// skip`
- `services/ai/chatCompletionClient.ts:1884-1886` — `// skip`
- `services/ai/chatCompletionClient.ts:1976-1978` — `// skip`
- `services/ai/chatCompletionClient.ts:2048-2050` — `// skip`
- `services/ai/chatCompletionClient.ts:2120-2122` — `// skip`
- `services/ai/chatCompletionClient.ts:2346-2348` — `// skip`

> 裁决：chatCompletionClient 的 7 处 `// skip` 是流式解析的合理容错，保留；devLog/lazyWithRetry/githubRequest/narrativeImageParse 的 5 处吞异常需补 `devLog` 或显式传播。

## 5. 长段解释注释 —— 20+ 处

> 类型：spec 复制型（把阶段/ticket/片 编号和描述抄进注释）、任务叙述型（讲「先做什么再做什么」）、自我确认型。应收敛为「why」式短注释或删除。

### stage 头注释（12 处，全部 spec 复制型）
- `hooks/useGame/stage2_preModel.ts:1-11`、`stage3_promptAssembly.ts:1-18`、`stage4_aiRequest.ts:1-13`、`stage5_replyLanding.ts:1-12`、`stage6_memory.ts:1-8`、`stage7_worldTraveler.ts:1-10`、`stage8_variable.ts:1-16`、`stage9_npcLedger.ts:1-10`、`stage10_storyZhiku.ts:1-17`、`stage11_backgroundJobs.ts:1-23`、`stage12_save.ts:1-6`、`turnTypes.ts:1-6`

### 领域核心（任务叙述型）
- `hooks/useGame/commitTurn.ts:1-23` — 连续列出「读活跃叶子→创建新叶子→封版旧叶子→移动指针」
- `hooks/useGame/saveLoadWorkflow.ts:71-78` — 引用「片 5e D4」「reviewer P1-1」
- `hooks/useGame/saveLoadWorkflow.ts:245-249` — 引用「子任务 A」
- `hooks/useGame.ts:156-160` — 引用「片 panel-p7」「子任务 A」
- `hooks/useGameState.ts:463-466` — 引用旧版本拆书迁移
- `services/dbService.ts:209-213` — v9 迁移说明
- `services/dbService.ts:378-396` — v10 迁移说明（含历史缺口辩解）
- `services/dbService.ts:1040-1047` — 崩溃窗口恢复叙述

## 6. patch / workaround 标记

> 全库 1416 命中，其中 data/ JSON 数据文件占大头（非代码）。代码命中集中如下：

| 文件 | 命中数 |
| --- | --- |
| `services/ai/newsModel.ts` | 48 |
| `components/features/Settings/ImageGenerationSettingsTab.tsx` | 36 |
| `components/features/GameSystems/AlbumPanel.tsx` | 34 |
| `hooks/useGameState.ts` | 32 |
| `components/features/Settings/PromptModulesTab.tsx` | 31 |
| `utils/variableRegistry.ts` | 29 |
| `utils/imagePromptRules.ts` | 27 |
| `services/ai/chatCompletionClient.ts` | 25 |
| `hooks/useGame/stage4_aiRequest.ts` | 24 |

> 数据文件（非代码，不计入 patch 整改）：`data/storyWeavingCanonDecomposed.json` 230。

## 7. 透传层 / 浅模块

### 真透传（12 处，接口几乎等于实现）
- `hooks/useGame/saveLoadWorkflow.ts:324-328` — `handleLoadById` → `loadSaveIntoSession`
- `hooks/useGame/saveLoadWorkflow.ts:337-342` — `handleBranchFromSave` → `loadSaveIntoSession`
- `utils/saveTree.ts:16-18` — `createId` → `createUnifiedId`
- `utils/saveTree.ts:61-63` — `getSaveTreeMeta` → `ensureSaveTreeRoot`
- `utils/saveAssetStorage.ts:38-40` — `isDataImage` → `isDataImageUrl`
- `utils/albumActions.ts:134-143` — `解析相册资源地址` → `pickAssetDisplayUrl`
- `utils/worldEvents.ts:33-39` — `appendWorldEvents` → `compactWorldEvents`
- `services/githubCloudSave.ts:392-397` — `downloadSaveFromGitHubCloud` → `downloadLegacySaveFromGitHub`
- `services/yitingRetrieval.ts:136-139` — `buildYitingRecallPromptModulesSection` → `buildIndependentPromptModulesSection`
- `services/yitingArchive.ts:291-294` — `buildYitingArchiveFormatSection` → 同上
- `services/storyWeaving.ts:641-644` — `buildStoryWeavingPromptModulesSection` → 同上

### 多层转发链（4 条）
1. **存档树 ID 链**：`getSaveTreeMeta` → `ensureSaveTreeRoot` → `createId` → `createUnifiedId`
2. **读档链**：`handleLoadById` / `handleBranchFromSave` → `loadSaveIntoSession` → `loadSave` → `enterSession`
3. **云存档链**：`downloadSaveFromGitHubCloud` → `downloadLegacySaveFromGitHub` → `readFileBytes` → `parseSavePackage`
4. **提示词模块链（×4 同构）**：`buildYitingRecall/ArchiveFormat/StoryWeaving/ZhikuPromptModulesSection` → `buildIndependentPromptModulesSection` → `filterIndependentPromptModules`（`services/promptModuleScopes.ts:33-58`）

## 8. 直连耦合 —— 15 文件

### 直连 `@/services/dbService`（4）
- `components/features/SaveLoad/SaveLoadModal.tsx:8`
- `components/features/Settings/SettingsModal.tsx:42`
- `components/features/Settings/StorageManager.tsx:8`
- `components/features/CloudSave/GitHubCloudSaveModal.tsx:4`

### 直连 `@/hooks/useGame`（11）
- `components/features/Phone/PhoneModal.tsx:20`
- `components/features/NewGame/wizard/steps.tsx:6`
- `components/features/NewGame/NewGameWizard.tsx:7`
- `components/features/GameSystems/SkillPanel.tsx:8`
- `components/features/GameSystems/MemoryPanel.tsx:14`（memoryUtils）
- `components/features/GameSystems/AlbumPanel.tsx:20`
- `components/features/Settings/SettingsModal.tsx:32`（contextSnapshot）、`:46`
- `components/features/Settings/PromptModulesTab.tsx:18`
- `components/features/Settings/TavernPresetsSettingsTab.tsx:5`
- `components/features/Settings/ContextViewer.tsx:2`（contextSnapshot）
- `components/features/Chat/InputArea.tsx:3`（turnStatus）

### 直连 `@/services/` 其他（领域服务）
- `components/features/Path/PathAwakeningInvitation.tsx:11`、`PathDebugView.tsx:18`（pathService）
- `components/features/GameSystems/PathPanel.tsx:12`（pathService）
- `components/features/GameSystems/PlotPanel.tsx:9,10`（storyWeaving、storyPlanningAnalysis）
- `components/features/GameSystems/CompanionPanel.tsx:7`（npcRelationshipPlanning）
- `components/features/CloudSave/GitHubCloudSaveModal.tsx:5,6,18`（cloudBackupBuilder、cloudBackupMerge、githubCloudSave）

## 9. 巨型文件 —— 37 个 >800 行（28 个 >1000 行）

| 文件 | 行数 | 上帝对象嫌疑 |
| --- | --- | --- |
| `components/features/Settings/PromptModulesTab.tsx` | 2831 | 高（提示词模块+世界书+Tavern 正则+拖拽排序混合） |
| `components/features/GameSystems/ZhikuPanel.tsx` | 2807 | 高（浏览+筛选+编辑+迁移+保存集中） |
| `components/features/GameSystems/album/workspaces.tsx` | 2650 | 极高（99 导出符号） |
| `services/dbService.ts` | 2623 | 极高（46 导出符号，IndexedDB+存档树+云合并+目录修复混合） |
| `services/ai/chatCompletionClient.ts` | 2519 | 中高（多供应商协议+流式解析+重试） |
| `components/features/Phone/PhoneModal.tsx` | 2443 | 高（19 useState） |
| `components/features/NewGame/wizard/steps.tsx` | 2285 | 中高（多步骤集中） |
| `components/features/Settings/ApiSettings.tsx` | 1526 | 中 |
| `components/features/GameSystems/PlotPanel.tsx` | 1525 | 中 |
| `hooks/useGame.ts` | 1487 | 高（状态门面+回合+读档+手机+图片+正则混合） |
| `components/features/GameSystems/AlbumPanel.tsx` | 1418 | 中 |
| `models/settings.ts` | 1379 | — |
| `hooks/useGame/systemPromptBuilder.ts` | 1374 | — |
| `components/features/SaveLoad/SaveLoadModal.tsx` | 1340 | — |
| `App.tsx` | 1318 | — |
| `models/npc.ts` | 1313 | — |
| `components/features/Worldbook/WorldbookManagerModal.tsx` | 1263 | — |
| `components/features/Chat/TurnItem.tsx` | 1261 | — |
| `components/features/Settings/VariableManager.tsx` | 1256 | — |
| `data/builtinPromptModules.ts` | 1215 | — |
| `components/features/GameSystems/CompanionPanel.tsx` | 1149 | — |
| `utils/imagePromptRules.ts` | 1134 | — |
| `hooks/useGame/contextSnapshot.ts` | 1088 | — |
| `services/zhikuRetrieval.ts` | 1085 | — |
| `models/world.ts` | 1038 | — |
| `services/storyProgressService.ts` | 1029 | — |
| `components/features/Settings/ImageGenerationSettingsTab.tsx` | 1026 | — |
| `components/features/NewGame/NewGameWizard.tsx` | 1016 | — |
| `services/ai/imageGeneration.ts` | 1014 | — |
| `utils/variableFacts.ts` | 976 | — |
| `utils/variableExecutor.ts` | 962 | — |
| `components/features/ImageGeneration/ImageRuleTemplateEditor.tsx` | 962 | — |
| `data/journeyPresets.ts` | 954 | — |
| `data/builtinWorldbookConfig.ts` | 937 | — |
| `services/githubCloudSave.ts` | 876 | — |
| `components/features/GameSystems/SkillPanel.tsx` | 863 | — |
| `models/storyWeaving.ts` | 816 | — |
