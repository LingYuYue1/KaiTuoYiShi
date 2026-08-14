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

> **处置状态：已清除（阶段 1.1，commit 6819dec）**：71 处删除 + 4 处调试工具有意保留（PathDebugView / manualBumpProgress / dumpDevLog / 相册缓存 API）。下方为执行前扫描清单。
> 执行中发现一批**不在原清单内的残留死代码**（保守保留，待后续清理）：`STPresetParseResult`（stPresetParser）、`WorldbookInjectionSplit`（worldbook）、narrativeImageParse 的 `解析结果`/`叙事插图提示词`/`buildNarrativeImageParsePrompt`/`parseSceneFromJson`/`PARSE_SYSTEM_PROMPT`、albumArchive 的 `parseAlbumFile`/`uniqueZipName`/`extensionFromMime`、`buildTurnRecallSummary`（memoryUtils）、`TavernFormatGuardInput`（tavernFormatGuard）、`timePeriodPresets`/`characterPresets` 空数组常量。

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

> **处置状态：已处置（阶段 1.2，commit 27a86dd）**：7 处 SSE catch 收窄为只包 JSON.parse + 聚合诊断；9 处（4 个 default + 5 个静默 catch）确认为有意防御/误判，保留；2 处枚举字段（worldbook `logic` / imageGeneration `backend`）归一化强化另立 #14。

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

> 裁决（更新）：chatCompletionClient 的 7 处 `// skip` 已收窄为只包 JSON.parse + 聚合诊断（commit 27a86dd）；devLog/lazyWithRetry/githubRequest/narrativeImageParse 的 5 处吞异常确认为有意防御，保留；worldbook `logic` / imageGeneration `backend` 归一化强化见 #14。

## 5. 长段解释注释 —— 20+ 处

> **处置状态：已清除（阶段 1.3，commit 971e36b）**：13 处删除 + 7 处收敛为 why + 1 处保留（dbService 崩溃窗口恢复注释）。下方为执行前扫描清单。

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

## 10. 重复/冗余代码

> 普查时间 2026-08-13，逐段对比（rg + read）。汇总：6 组复制粘贴函数（~650 行）+ 3 组重复类型 + 3 组重复映射块 + 2 组重复 UI 逻辑。

### 10.1 复制粘贴函数（6 组）

#### A. chatCompletionClient 7 流式函数（最高价值）

`services/ai/chatCompletionClient.ts` 的 7 个流函数共用同一段 SSE 解析骨架（逐字相同 ~30 行/个）：

| 函数 | 行号 |
| --- | --- |
| streamOpenAICompatible | 1425–1548 |
| streamClaude | 1552–1649 |
| streamOpenCodeChat | 1831–1926 |
| streamOpenCodeMessages | 1928–2020 |
| streamOpenCodeResponses | 2022–2100 |
| streamOpenCodeGemini | 2102–2180 |
| streamGemini | 2291–2414 |

复制粘贴部分：SSE 骨架 ~30 行 ×7 ≈ 210 行 + fetch/错误上报前导 ~15 行 ×7 ≈ 100 行 ≈ **310 行 / 693 行 ≈ 45%**。差异点仅 4 处：delta 提取函数、`[DONE]` 行跳过（Claude/Gemini 无）、finishReason 两种写法、devLog provider 字符串。

建议抽取 `readSseTextStream(reader, { extractText, provider, onFinishReason, collectFinishReason })`，7 函数只保留「请求体构建 + delta 提取」。

> **处置状态：已收敛（阶段 2.4，commit bc067fd）**：新增 `readSseTextStream` 公共骨架（无开关签名，统一 [DONE] 跳过/畸形行计数/usage/finishReason 采集），7 流函数统一到单一 extractor `readOpenAICompatibleStreamDelta`（其 fallback 链已覆盖 choices/content_block/response.*/gemini-parts 全部格式）；`readOpenCodeResponsesStreamDelta` 已删。fetch 前导未抽：includeUsage 降级递归使 5/7 抽取会制造不对称调用面。

#### B. completionOpenCodeNonStream 4 分支（~100 行）

`chatCompletionClient.ts:2182–2287`，chat/messages/gemini/responses 四分支结构完全一致，差异只在中介 body 构建与 parse 函数。建议抽 `completionOpenCodeEndpoint(endpoint, bodyBuilder, parser)`。

> **处置状态：已收敛（阶段 2.5，commit 8bfc7ff）**：抽 `nonStreamEndpointHandlers` 数据表（Record<OpenCodeEndpoint, {来源标签/构建URL/构建请求体/解析}>）+ 单执行路径，if 链与 default 分支消失（endpoint 类型穷尽 = 编译期 fail fast）。行为等价 harness 4 端点 × 成功/失败 12 项全绿。

#### C. resolveXxxConfig 合并样板（7 处 × 8 行 ≈ 56 行）

同一段「provider/baseUrl/apiKey/model/maxTokens/temperature/retryCount 合并」样板：

| 函数 | 位置 |
| --- | --- |
| resolveYitingArchiveConfig | services/yitingArchive.ts:26–40 |
| resolveYitingRecallConfig | services/yitingRetrieval.ts:141–153 |
| resolveMemoryCompressionConfig | services/memoryCompression.ts:19–30 |
| resolveZhikuRecallConfig | services/zhikuRetrieval.ts:648–660 |
| buildImagePromptTokenizerConfig | services/ai/imagePromptTokenizer.ts:22–40 |
| buildPhoneApiConfig | services/ai/phoneService.ts:64–89 |
| buildStoryWeavingApiConfig | services/storyWeaving.ts:25–44 |

建议抽 `mergeApiOverride(mainConfig, override, extra?)`。

> **处置状态：已收敛（阶段 2.4，commit bc067fd）**：`models/settings.ts` 新增 `resolveApiOverrideFields`（覆盖字段解析，main 可空）+ `mergeApiOverride`（主 API 基底 + 覆盖字段 + extra 叠加）。yitingArchive/yitingRetrieval/memoryCompression/zhikuRetrieval/imagePromptTokenizer/storyWeaving 六处接入；yitingRetrieval 与 zhikuRetrieval 的私有单调用点包装已内联；phoneService 组合 `resolveApiOverrideFields`，保留 phoneFieldsEmpty 与不继承 topP/topK 语义。

#### D. NPC 关系阶段阈值表（同阈值双标签 + 魔法数散落）

- `models/npc.ts:159–167` `获取NPC关系阶段`（affinity→中文阶段）
- `models/npc.ts:169–176` `获取NPC兼容关系`（同一批阈值 -31/-1/19/49/100 →英文）
- `models/world.ts:842–849` `inferOpeningAffinity`（逆映射，硬编码 -31/-1/101/50/20）
- `services/npcRelationshipPlanning.ts:50`（`好感度 <= -31` 魔法数）

应合并为一张 `关系阈值表` 常量，逆映射与魔法数引用同一张表。

> **处置状态：已收敛（阶段 2.4，commit bc067fd）**：`models/npc.ts` 新建 `NPC关系阈值表`（6 行 下限/上限/阶段/兼容，首末行绑定 NPC_AFFINITY_MIN/MAX）+ 派生常量 `NPC敌对阈值`（敌对行上限）/`NPC熟识阈值`（熟识行下限），经 `查NPC关系行`（缺行启动即抛）取行，无位置索引。`获取NPC关系阶段`/`获取NPC兼容关系` 改查表；world.ts 的 `inferOpeningAffinity` 携带私有 `开局关系代表好感度`（与正则同位，显式标注推理取点、非表推导，历史值逐位一致）；npcRelationshipPlanning 的 -31/20 魔法数替换为派生常量。

#### E. buildXxxPromptModulesSection 系列（见 §7，确认属实）

7 个 1–3 行 wrapper 全部收敛到 `buildIndependentPromptModulesSection`（`services/promptModuleScopes.ts:50`）。另有 4 处 legacy 回退样板散落：`phoneService.ts:155–160`、`newsModel.ts:122–130`、`zhikuRetrieval.ts:612–621`、`yitingRetrieval.ts:132–133`。

> **处置状态：已核查（阶段 2.5，commit 8bfc7ff）**：4 处为「同守卫、异领域 legacy 提示词」的伪样板（news 三段拼接/zhiku 带场景锚点/yiting 单常量/phone 内联常量），拒绝强行合一（参数化差异 = 特例汤）。调用面核查确认可达：phone 在模块段为空时经 `buildPhonePromptModulesSection(x) || buildPhoneSystemPrompt(ctx)` 不传模块（contextSnapshot），yiting/zhiku/news 调用方恒传但 modules 可被禁用/为空。保留并为 yiting/phone 补 why 注释（news/zhiku 已有）。

#### F. 信息可见性归一化块（低）

`models/storyWeaving.ts` 内 7 行块在两处逐字复制：`归一化约束列表`（626–632）与 `归一化事件`（646–652）。已有 `默认可见性()`（400）但只抽一半，建议抽 `归一化信息可见性(raw)`。

> **处置状态：已收敛（阶段 2.5，commit 8bfc7ff）**：抽 `归一化信息可见性` 纯函数，两处调用。双层 spread（`...默认可见性()` + `...(x.信息可见性 ?? {})`）为冗余死代码一并删除——`文本列表`（undefined→[]）与 `=== true` 已全量覆盖类型三字段；`默认可见性` 因无调用点删除。行为等价 harness 7 样本 × 约束条目/事件 14 项全绿（typed 字段零差异；未类型化多余字段按数据形状信任有意丢弃）。

### 10.2 重复类型定义（3 组）

| 类型名 | 位置 A | 位置 B | 说明 |
| --- | --- | --- | --- |
| 图片后端类型 / 文生图后端类型 | models/imageGeneration.ts:1 | models/settings.ts:390 | union 逐字相同；图片后端类型全仓无引用（死类型） |
| 消息角色 / STMessageRole | models/chat.ts:3 | models/stTypes.ts:182 | 语义等价（仅顺序不同） |
| Pick<相册条目,…> & {referenceTargets?} | models/imageGeneration.ts:159 | :166 | 同文件相邻内联复制 |

> **处置状态：已收敛（阶段 2.5，commit 8bfc7ff）**：`图片后端类型` 全仓零引用死类型删除，`文生图后端类型` 为唯一真相；`STMessageRole` 别名化 = `消息角色`（stTypes 保留式兼容层保 ST API 面）；Pick 内联类型命名 `相册参考目标` 本地别名（不导出）。

### 10.3 重复 switch/映射块（3 组）

| 块 | 位置 A | 位置 B | 说明 |
| --- | --- | --- | --- |
| backend→路径 | services/ai/imageGeneration.ts:398–411 | ImageGenerationSettingsTab.tsx:81–86 | 4 个路径值完全一致 |
| backend→中文标签 | referenceInjection.ts:34–47 | ImageGenerationSettingsTab.tsx:54–59,61–73 | 文案略异、枚举同源 |
| 关系阶段阈值 if 链 | models/npc.ts:161–166 | :171–175 + world.ts:843–847 | 同 10.1 组 D |

> **处置状态：已收敛（阶段 2.5，commit 8bfc7ff）**：backend→路径收敛为 `文生图预设路径表`（settings.ts 单表：预设接口枚举 ↔ 路径绑定；服务端 readPath 穷尽查表删除 switch default，设置页预设选项由表派生）；`归一化文生图API配置` 增加 backend 成员钳制（垃圾值仍落默认 openai_compatible 路径，行为不变）支撑穷尽查找。backend→中文标签两套文案（短/长）为 UI 语境有意差异，拒绝合并，补互链注释。关系阶段阈值组见 10.1 D。

### 10.4 重复 UI 逻辑（2 组）

| 逻辑 | 位置 A | 位置 B/C | 说明 |
| --- | --- | --- | --- |
| 字节格式化 | services/cloudBackupBuilder.ts:244 formatBytes | SaveLoadModal.tsx:1307 formatSize | 逻辑同源，单位不同 |
| 时间格式化 | StorageManager.tsx:490 formatTime | TurnItem.tsx:985 formatTurnTime、ApiErrorReportsTab.tsx:13 formatTime | 三处 toLocaleString 仅选项不同 |

> **处置状态：已收敛（阶段 2.5，commit 8bfc7ff）**：字节/时间格式化收敛到 `utils/format.ts`（`格式化二进制字节`/`格式化存档体积`/`格式化时间戳`/`格式化ISO时间`），5 处调用点迁移。拒绝 flag 合一——二进制 vs 展示、完整（含秒/24h）vs ISO 透传是不同显示契约。行为修正：StorageManager `timestamp || Date.now()`（缺失时间显示「现在」的误导）→「未记录」；存档/保存组时间展示统一为消息契约（含秒、24h），两处展示变化为有意收敛。毫秒契约与 ISO 无 locale 行为均保留并在 JSDoc 注明。
