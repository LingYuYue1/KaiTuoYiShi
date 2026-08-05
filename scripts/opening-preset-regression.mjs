import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const wizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const journeyModel = fs.readFileSync('models/journey.ts', 'utf8');
const journeyPresets = fs.readFileSync('data/journeyPresets.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const openingCot = fs.readFileSync('prompts/cot/openingCot.ts', 'utf8');
const builtinWorldbook = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const openingCoreLore = fs.readFileSync('data/lore/openingCoreLore.json', 'utf8');
const openingCorePreset = fs.readFileSync('public/worldbook-presets/opening-core.json', 'utf8');
const worldbookUtil = fs.readFileSync('utils/worldbook.ts', 'utf8');
const worldModel = fs.readFileSync('models/world.ts', 'utf8');
const openingArchiveService = fs.readFileSync('services/ai/openingArchive.ts', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const zhikuRetrieval = fs.readFileSync('services/zhikuRetrieval.ts', 'utf8');
const zhikuRuntimeCompiler = fs.readFileSync('services/zhikuRuntimeCompiler.ts', 'utf8');
const storyWeaving = fs.readFileSync('services/storyWeaving.ts', 'utf8');
const storyWeavingPreset = fs.readFileSync('data/storyWeavingPreset.ts', 'utf8');
const useGame = fs.readFileSync('hooks/useGame.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const travelerTemplate = fs.readFileSync('services/ai/travelerTemplate.ts', 'utf8');
const newsModel = fs.readFileSync('services/ai/newsModel.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const systemPanels = fs.readFileSync('components/features/GameSystems/SystemPanels.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert(
  wizard.includes("OPENING_PLAYER_PRESETS_KEY = 'openingPlayerPresets'") &&
    wizard.includes('loadSetting<OpeningPlayerPreset[]>') &&
    wizard.includes('saveSetting(OPENING_PLAYER_PRESETS_KEY'),
  '开局预设必须保存到 settings，而不是游戏存档。',
);

assert(
    journeyPresets.includes('export const openingRegions') &&
    journeyPresets.includes('export const openingChapterAnchors') &&
    journeyPresets.includes('export const officialOpeningPresets') &&
    journeyPresets.includes('export const freeOpeningWritingQuestions') &&
    journeyPresets.includes('export const freeOpeningGuides') &&
    journeyPresets.includes('export const workshopOpeningTemplates') &&
    journeyPresets.includes('export const workshopOpeningTemplatePacks') &&
    journeyPresets.includes("id: 'xianzhou_luofu'") &&
    journeyPresets.includes("id: 'luofu_arrival'") &&
    journeyPresets.includes("id: 'official_luofu_arrival'") &&
    journeyPresets.includes("id: 'official_belobog_arrival'") &&
    journeyPresets.includes("id: 'official_penacony_invitation'") &&
    journeyPresets.includes("id: 'belobog_underworld'") &&
    journeyPresets.includes("id: 'belobog_cocolia_crisis'") &&
    journeyPresets.includes("id: 'luofu_kafka_interrogation'") &&
    journeyPresets.includes("id: 'luofu_phantylia_crisis'") &&
    journeyPresets.includes("id: 'penacony_dream_edge'") &&
    journeyPresets.includes("id: 'penacony_reverie_crisis'") &&
    journeyPresets.includes("id: 'official_belobog_underworld'") &&
    journeyPresets.includes("id: 'official_luofu_kafka_interrogation'") &&
    journeyPresets.includes("id: 'official_penacony_dream_edge'") &&
    journeyPresets.includes("officialPresetId: 'official_herta_station_incident'") &&
    journeyPresets.includes("officialPresetId: 'official_belobog_arrival'") &&
    journeyPresets.includes("officialPresetId: 'official_belobog_underworld'") &&
    journeyPresets.includes("officialPresetId: 'official_belobog_cocolia_crisis'") &&
    journeyPresets.includes("officialPresetId: 'official_luofu_arrival'") &&
    journeyPresets.includes("officialPresetId: 'official_luofu_kafka_interrogation'") &&
    journeyPresets.includes("officialPresetId: 'official_luofu_phantylia_crisis'") &&
    journeyPresets.includes("officialPresetId: 'official_penacony_invitation'") &&
    journeyPresets.includes("officialPresetId: 'official_penacony_dream_edge'") &&
    journeyPresets.includes("officialPresetId: 'official_penacony_reverie_crisis'") &&
    journeyPresets.includes('export function getOfficialOpeningPresetByChapterId') &&
    journeyPresets.includes('export function getOfficialOpeningPresetsByRegion') &&
    journeyPresets.includes('export function getFreeOpeningGuide') &&
    journeyPresets.includes('export function getWorkshopOpeningTemplate') &&
    journeyPresets.includes('export function getWorkshopOpeningTemplatesByRegion') &&
    journeyPresets.includes('export function getWorkshopOpeningTemplatePack') &&
    journeyPresets.includes('export function getOpeningScenarioBundle'),
  '开局数据层必须包含地区、章节锚点和官方预设骨架，且至少覆盖黑塔、贝洛伯格、罗浮、匹诺康尼入口。',
);

assert(
  journeyPresets.includes("id: 'belobog_underworld',\n    name: '贝洛伯格 · 下层区暗流'") &&
    journeyPresets.includes("id: 'belobog_cocolia_crisis',\n    name: '贝洛伯格 · 可可利亚危机前夜'") &&
    journeyPresets.includes("id: 'luofu_kafka_interrogation',\n    name: '罗浮仙舟 · 太卜司审问前后'") &&
    journeyPresets.includes("id: 'luofu_phantylia_crisis',\n    name: '罗浮仙舟 · 建木灾变'") &&
    journeyPresets.includes("id: 'penacony_dream_edge',\n    name: '匹诺康尼 · 梦境边界异动'") &&
    journeyPresets.includes("id: 'penacony_reverie_crisis',\n    name: '匹诺康尼 · 美梦崩塌前夜'"),
  '临时起始场景列表必须暴露所有已内置的章节锚点，不要只让玩家选到四个地区入口。',
);

assert(
  journeyPresets.includes('你是谁') &&
    journeyPresets.includes('你为什么在这里') &&
    journeyPresets.includes('从哪里开始') &&
    journeyPresets.includes('你认识谁') &&
    journeyPresets.includes('你想要什么氛围') &&
    journeyPresets.includes("regionId: 'xianzhou_luofu'") &&
    journeyPresets.includes('罗浮仙舟适合写成云骑盘查') &&
    journeyPresets.includes('不要把朱明、曜青等其他仙舟角色默认塞进罗浮开局'),
  '自由开局必须提供可复用的写作问题与地区引导，尤其罗浮开局不能混入其他仙舟。',
);

assert(
  journeyPresets.includes("id: 'workshop_herta_curio_distress'") &&
    journeyPresets.includes("id: 'workshop_luofu_trade_commission'") &&
    journeyPresets.includes("source: 'workshop'") &&
    journeyPresets.includes('playerEntryTemplate') &&
    journeyPresets.includes('editableFields') &&
    journeyPresets.includes("id: 'workshop_belobog_clinic_request'") &&
    journeyPresets.includes("id: 'workshop_penacony_misdelivered_invitation'") &&
    journeyPresets.includes("regionId: 'herta_space_station'") &&
    journeyPresets.includes("regionId: 'penacony'") &&
    journeyPresets.includes("schema: 'kaituo-opening-workshop-pack'") &&
    journeyPresets.includes('templates: workshopOpeningTemplates'),
  '创意工坊开局必须先有覆盖四个地区的本地模板骨架和可导入导出的模板包，后续 UI 和导入导出才能接入。',
);

assert(
  openingCot.includes('PRESET_OPENING_COT_PROMPT') &&
    openingCot.includes('FREE_OPENING_COT_PROMPT') &&
    openingCot.includes('预设开局附加思维链') &&
    openingCot.includes('自由 / 创意工坊开局附加思维链') &&
    openingCot.includes('只有开局档案地区是黑塔空间站时') &&
    openingCot.includes('必须贴合当前开局档案的地区与地点参考') &&
    openingCot.includes('必定以某种方式接收到当前地区开局压力') &&
    openingCot.includes('来源为自由开局或创意工坊') &&
    openingCot.includes('模板只提供骨架和初始文本'),
  '开局 CoT 必须拆出预设开局和自由开局两套附加规则。',
);

assert(
  openingCot.includes('不等于当前在场人物') &&
    openingCot.includes('不等于相关角色已经在当前镜头中'),
  '开局 CoT 必须区分已认识角色/关键 NPC 与当前在场人物，避免首回合塞满角色。',
);

const promptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
assert(
  promptModules.includes('builtin_preset_opening_cot') &&
    promptModules.includes('builtin_free_opening_cot') &&
    promptModules.includes('PRESET_OPENING_COT_CONTENT') &&
    promptModules.includes('FREE_OPENING_COT_CONTENT') &&
    promptModules.includes("openingSourceGate: ['official_preset']") &&
    promptModules.includes("openingSourceGate: ['free', 'workshop']"),
  '内置提示词模块必须注册预设开局和自由/创意工坊开局 CoT 入口。',
);

assert(
  systemPromptBuilder.includes("import type { 开局来源") &&
    systemPromptBuilder.includes('openingSource?: 开局来源') &&
    systemPromptBuilder.includes('m.openingSourceGate?.length') &&
    systemPromptBuilder.includes('m.openingSourceGate.includes(ctx.openingSource)'),
  '系统提示词模块注入必须按开局档案来源过滤预设/自由开局 CoT。',
);

assert(
  wizard.includes('openingSource') &&
    wizard.includes('openingRegions') &&
    wizard.includes('selectedRegionId') &&
    wizard.includes('onOpeningRegion') &&
    wizard.includes('getOfficialOpeningPresetsByRegion') &&
    wizard.includes('getWorkshopOpeningTemplatesByRegion') &&
    wizard.includes('getFreeOpeningGuide') &&
    wizard.includes('const selectedScenarioPreset = useMemo') &&
    wizard.includes('const selectedOpeningLocation') &&
    wizard.includes('let resolvedOpeningLocation = selectedOpeningLocation') &&
    wizard.includes('worldState.当前地点 = resolvedOpeningLocation') &&
    wizard.includes('const scenarioBundle = getOpeningScenarioBundle(startingScenarioId)') &&
    wizard.includes("worldState.起航之地ID = scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? startingScenarioId ?? 'herta_station_incident'") &&
    wizard.includes('selectedOpeningTitle={selectedOpeningTitle}') &&
    wizard.includes("openingSource === 'official_preset'") &&
    wizard.includes('根据官方开局预设创建开局档案') &&
    wizard.includes('根据自由开局整理创建开局档案') &&
    wizard.includes('根据起始场景创建开局档案') &&
    wizard.includes('const scenarioBundle = getOpeningScenarioBundle') &&
    wizard.includes("regionId: scenarioPreset?.regionId ?? scenarioBundle.region?.id ?? 'herta_space_station'") &&
    wizard.includes("regionName: scenarioPreset?.regionName ?? scenarioBundle.region?.name ?? '黑塔空间站'") &&
    wizard.includes('defaultLocationHint: selectedOpeningLocation'),
  '新游戏向导必须按开局来源分流：官方预设走官方档案，自由开局走自由整理档案。',
);

assert(
  wizard.includes('FREE_OPENING_PLANET_SOURCE_OPTIONS') &&
    wizard.includes("freeOpeningPlanetSource, setFreeOpeningPlanetSource") &&
    wizard.includes('地点来源') &&
    wizard.includes('已有地点') &&
    wizard.includes('自创地点') &&
    wizard.includes('雅利洛-VI') &&
    wizard.includes('仙舟罗浮') &&
    wizard.includes('开启后从左侧选择地点，然后选择主线锚点') &&
    wizard.includes('customNpcName') &&
    wizard.includes('customNpcBackground') &&
    wizard.includes('customNpcPathstrider') &&
    wizard.includes('customNpcAbility') &&
    wizard.includes('customNpcs') &&
    wizard.includes('保存 NPC') &&
    wizard.includes('已保存 NPC') &&
    wizard.includes('sanitizeFreeOpeningCustomNpcs') &&
    wizard.includes('主线坐标') &&
    wizard.includes('关闭主线后，原作主线不会自动注入正文') &&
    wizard.includes('开局工作台') &&
    wizard.includes('freeOpeningMainlineEnabled') &&
    wizard.includes('freeOpeningWorkshop') &&
    wizard.includes('formatFreeOpeningWorkshopDraft') &&
    wizard.includes('mergeFreeOpeningPrompt') &&
    wizard.includes('worldState.开局档案.整理档案?.自定义起始地点') &&
    wizard.includes('planetSource: freeOpeningPlanetSource') &&
    wizard.includes('mainlineEnabled: effectiveFreeMainlineEnabled') &&
    journeyModel.includes('export type 自由开局地点来源') &&
    !journeyModel.includes("'if_rewrite'") &&
    worldModel.includes('自定义起始地点?: string') &&
    worldModel.includes('自定义星球?: string') &&
    worldModel.includes('初始NPC详情?: string[]') &&
    worldModel.includes('主线启用?: boolean') &&
    worldModel.includes('星球来源?: 自由开局地点来源') &&
    worldModel.includes('原创地点说明?: string') &&
    worldModel.includes('buildFreeOpeningRule') &&
    openingArchiveService.includes('自定义起始地点') &&
    openingArchiveService.includes('玩家自定义现实') &&
    openingArchiveService.includes('主线坐标关闭') &&
    openingArchiveService.includes('地点来源为已有地点') &&
    openingArchiveService.includes('"初始NPC详情": []') &&
    openingCot.includes('不得强行改写回原著默认地点') &&
    systemPromptBuilder.includes('自由开局现实'),
  '自由开局必须只保留主线开关、地点来源与开局工作台，并允许整理档案覆盖真实开局地点。',
);

assert(
  !wizard.includes("title: 'IF 改写'") &&
    !worldModel.includes('return \'IF 改写\'') &&
    !openingArchiveService.includes('return \'IF 改写\''),
  '自由开局 UI 与新档案口径不得继续暴露 IF 改写；旧预设可在归一化时迁移为自创地点。',
);

assert(
  wizard.includes('getOpeningChapterBadge') &&
    wizard.includes('getOpeningPriorStoryState') &&
    wizard.includes('前置处理：{getOpeningPriorStoryState(item)}') &&
    wizard.includes("openingSource === 'official_preset' ? '章节锚点' : effectiveMainlineEnabled ? '主线进度' : '主线已关闭'") &&
    wizard.includes('这里只决定原作世界推进到哪里，不限制你的起始地点、原创事件和真实开局设定。') &&
    wizard.includes('原作世界坐标') &&
    wizard.includes('选择地区与主线进度后，自由书写真实起点和介入方式。') &&
    journeyPresets.includes('officialChapterName') &&
    journeyPresets.includes('officialChapterPhase') &&
    journeyPresets.includes('priorStoryState') &&
    worldModel.includes('buildOpeningPriorStoryRule') &&
    systemPromptBuilder.includes('锚点之前的主线只作既成背景/资料参考，不得作为正文自动跳转、补演或推进目标') &&
    storyWeaving.includes('章节锚点之前的主线段落视为前置背景'),
  '官方开局必须保留章节锚点；自由开局必须改为主线进度坐标，并把前置剧情作为既成背景，禁止正文补演或转跳推进。',
);

assert(
  wizard.includes('当前地区：{selectedRegion?.name') &&
    wizard.includes('自由开局引导') &&
    wizard.includes('freeGuide.overview') &&
    wizard.includes('onCustomStartPrompt(customStartPrompt.trim()') &&
    wizard.includes('visibleScenarios') &&
    wizard.includes('filteredWorkshopTemplates'),
  '开局向导必须把地区作为内容入口，并把自由开局地区引导接入切入说明。',
);

assert(
  wizard.includes('interface OpeningPresetDraft') &&
    wizard.includes('openingSource: OpeningSource') &&
    wizard.includes('selectedWorkshopTemplateId: string') &&
    wizard.includes('storyMode: 剧情模式') &&
    wizard.includes('customStartPrompt: string') &&
    wizard.includes('canonicalTrailblazer: CanonicalTrailblazer') &&
    wizard.includes('selectedAbilityIds: string[]'),
  '开局预设必须覆盖世界模式、角色、命途能力、原著主角和切入说明。',
);

assert(
  wizard.includes('function OpeningPresetControls') &&
    wizard.includes('我的开局预设') &&
    wizard.includes('保存') &&
    wizard.includes('套用') &&
    wizard.includes('删除'),
  '开局向导必须提供保存、套用、删除玩家预设的 UI。',
);

assert(
  wizard.includes('applyOpeningPreset') &&
    wizard.includes('setStoryMode(draft.storyMode)') &&
    wizard.includes('setCustomStartPrompt(draft.customStartPrompt)') &&
    wizard.includes('setCanonicalTrailblazer(draft.canonicalTrailblazer)') &&
    wizard.includes('setSelectedWorkshopTemplateId(draft.selectedWorkshopTemplateId)'),
  '套用开局预设必须恢复核心开局字段。',
);

assert(
  wizard.includes('selectedWorkshopTemplateId') &&
    wizard.includes('onSelectedWorkshopTemplateId={selectWorkshopTemplate}') &&
    wizard.includes('onOpeningSource={selectOpeningSource}') &&
    wizard.includes("workshopTemplateId: openingSource === 'workshop' ? selectedWorkshopTemplateId : undefined") &&
    wizard.includes('selectedOpeningRegionName={selectedOpeningRegion?.name ??') &&
    wizard.includes('开局来源') &&
    wizard.includes('地区'),
  '创意工坊开局必须把来源、模板和最终入档字段联动起来，避免套用预设后状态错位。',
);

assert(
  useGame.includes('handleRestartOpening') &&
    useGame.includes('生成开局已成立事实(openingArchive') &&
    useGame.includes('根据开局档案创建初始NPC记录') &&
    useGame.includes('const restartOpeningArchive = 归一化开局档案(s.世界.开局档案, s.世界)') &&
    useGame.includes('s.setNPC(根据开局档案创建初始NPC记录(restartOpeningArchive))') &&
    useGame.includes('s.set世界((prev) => {') &&
    useGame.includes('alignStoryWeavingToOpeningArchive(s.剧情编织, restartOpeningArchive)') &&
    useGame.includes("saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving))") &&
    useGame.includes('开局档案: openingArchive') &&
    useGame.includes('openingSummary?.初始日期参考') &&
    useGame.includes('openingSummary?.初始时间参考') &&
    useGame.includes('当前日期: nextDate') &&
    useGame.includes('全局事件: 生成开局已成立事实(openingArchive'),
  '重新开局必须保留并重建开局档案事实与初始 NPC 关系种子，不能只清空运行时数据。',
);

assert(
  worldModel.includes('export interface 开局档案') &&
    worldModel.includes('export interface 开局自制NPC') &&
    worldModel.includes('export function 创建默认开局档案') &&
    worldModel.includes('export function 根据官方开局预设创建开局档案') &&
    worldModel.includes('export function 根据起始场景创建开局档案') &&
    worldModel.includes('export function 根据自由开局整理创建开局档案') &&
    worldModel.includes('export function 根据创意工坊模板创建开局档案') &&
    worldModel.includes('export function 归一化创意工坊开局模板包') &&
    worldModel.includes('export function 归一化创意工坊开局模板') &&
    worldModel.includes('export function 生成开局已成立事实') &&
    worldModel.includes('export function 归一化开局档案') &&
    worldModel.includes('export function 整理自由开局草稿') &&
    worldModel.includes('关键角色参考: sanitizeStringArray(input.keyNpcs).slice(0, 8)') &&
    worldModel.includes('初始日期参考?: string') &&
    worldModel.includes('初始时间参考?: string') &&
    worldModel.includes('关键角色参考?: string[]') &&
    worldModel.includes('自制NPC?: 开局自制NPC[]') &&
    worldModel.includes('summary?.初始日期参考 || summary?.初始时间参考') &&
    worldModel.includes('关键角色参考: preset.keyNpcs.slice') &&
    !worldModel.includes('已认识角色: preset.keyNpcs.slice') &&
    worldModel.includes("来源: input.workshopTemplateId ? 'workshop' : 'free'") &&
    worldModel.includes('开局档案?: 开局档案'),
  '世界状态必须拥有可长期读取的开局档案结构；官方预设关键 NPC 只能作为关键角色参考，不能直接写成玩家已认识角色，自由开局自制 NPC 必须结构化保存。',
);

assert(
  wizard.includes('开局战技') &&
    wizard.includes('openingSkills') &&
    wizard.includes('战技列表: openingSkills.map') &&
    wizard.includes('openingSkills={openingSkills}') &&
    wizard.includes('开局战技：${skills?.length') &&
    wizard.includes('创建默认开局档案'),
  '开局向导必须能把命途与能力页里的战技写入旅人、总览和开局摘要。',
);

assert(
  worldModel.includes('export function 根据开局档案创建初始NPC记录') &&
    worldModel.includes('archive.来源 === \'official_preset\' && relationHints.length === 0') &&
    worldModel.includes('关系: 获取NPC兼容关系(openingAffinity)') &&
    worldModel.includes('当前关系阶段: 获取NPC关系阶段(openingAffinity)') &&
    worldModel.includes('同行: false') &&
    worldModel.includes('代表长期关系参考，不代表当前镜头在场') &&
    worldModel.includes('OPENING_NON_PERSON_NAMES') &&
    worldModel.includes('isValidOpeningInitialNpcName') &&
    worldModel.includes('OPENING_NON_PERSON_NAMES.has(text)') &&
    worldModel.includes('OPENING_NON_PERSON_NAME_RE.test(text)') &&
    worldModel.includes('sanitizeOpeningCustomNpcs(summary.自制NPC)') &&
    worldModel.includes('由开局档案建立的自制 NPC') &&
    wizard.includes('根据开局档案创建初始NPC记录(worldState.开局档案)') &&
    wizard.includes('await onStart(traveler, worldState, initialNpcRecords)') &&
    app.includes('initialNpcRecords: NPC记录[] = []') &&
    app.includes('state.setNPC(initialNpcRecords)'),
  '自由/工坊开局的明确初始关系与自制 NPC 必须写入 NPC 账本，但不能把官方预设关键 NPC 或组织群体误当成当前在场。',
);

assert(
  storyWeavingPreset.includes('OPENING_STORY_WEAVING_ANCHORS') &&
    storyWeavingPreset.includes('luofu_arrival') &&
    storyWeavingPreset.includes('belobog_arrival') &&
    storyWeavingPreset.includes('belobog_underworld') &&
    storyWeavingPreset.includes('belobog_cocolia_crisis') &&
    storyWeavingPreset.includes("seriesId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters'") &&
    storyWeavingPreset.includes('luofu_kafka_interrogation') &&
    storyWeavingPreset.includes('segmentGroup: 8') &&
    storyWeavingPreset.includes('luofu_phantylia_crisis') &&
    storyWeavingPreset.includes("seriesId: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters'") &&
    storyWeavingPreset.includes('直接从鳞渊境与建木玄根危机注入') &&
    storyWeavingPreset.includes('penacony_invitation') &&
    storyWeavingPreset.includes('penacony_dream_edge') &&
    storyWeavingPreset.includes('penacony_reverie_crisis') &&
    storyWeavingPreset.includes('buildCanonOpeningFacts') &&
    storyWeavingPreset.includes('雅利洛-VI 与贝洛伯格相关主线已成为当前剧情轨道') &&
    storyWeavingPreset.includes('仙舟罗浮相关主线已成为当前剧情轨道') &&
    storyWeavingPreset.includes('匹诺康尼相关主线已成为当前剧情轨道') &&
    storyWeavingPreset.includes('export function alignStoryWeavingToOpeningArchive') &&
    storyWeavingPreset.includes('archive.主线启用 === false') &&
    storyWeavingPreset.includes("运行状态: '已跳过'") &&
    storyWeavingPreset.includes('新开局按章节锚点') &&
    app.includes('alignStoryWeavingToOpeningArchive(') &&
    app.includes('worldState.开局档案'),
  '新开局必须按所选章节锚点对齐内置剧情编织系列/分段，雅利洛、仙舟、匹诺康尼和自由开局都不得继续停留在黑塔当前段。',
);

assert(
  openingArchiveService.includes('export async function parseOpeningArchiveWithAI') &&
    openingArchiveService.includes('OPENING_ARCHIVE_SYSTEM_PROMPT') &&
    openingArchiveService.includes('只输出合法 JSON') &&
    openingArchiveService.includes('玩家文本优先，地区与章节锚点只作为背景参考') &&
    openingArchiveService.includes('defaultDateHint?: string') &&
    openingArchiveService.includes('defaultTimeHint?: string') &&
    openingArchiveService.includes('"初始日期参考": ""') &&
    openingArchiveService.includes('"初始时间参考": ""') &&
    openingArchiveService.includes('初始日期参考: readText(raw.初始日期参考) || input.defaultDateHint') &&
    openingArchiveService.includes('初始时间参考: normalizeClock(readText(raw.初始时间参考)) || normalizeClock(input.defaultTimeHint)') &&
    openingArchiveService.includes('"关键角色参考": []') &&
    openingArchiveService.includes('"自制NPC"') &&
    openingArchiveService.includes('不要把已知关键角色自动搬进已认识角色') &&
    openingArchiveService.includes('不要把云骑军、公司、家族、列车组') &&
    openingArchiveService.includes('关键角色参考: uniqueStrings(keyNpcList).length ? uniqueStrings(keyNpcList) : uniqueStrings(input.keyNpcs ?? [])') &&
    openingArchiveService.includes('normalizeCustomNpcs') &&
    openingArchiveService.includes('初始时间参考：${[input.defaultDateHint, input.defaultTimeHint]') &&
    openingArchiveService.includes('normalizeOpeningArchive') &&
    openingArchiveService.includes('chatCompletionNonStream'),
  '开局整理必须有独立 AI 服务骨架，能结构化解析自制 NPC 和初始关系；失败时仍可回落本地整理。',
);

assert(
    wizard.includes('parseOpeningArchiveWithAI(') &&
    wizard.includes('openingArchiveApiConfig') &&
    wizard.includes('正在整理开局档案...') &&
    wizard.includes('开局整理失败，已改用本地兜底。') &&
    wizard.includes('defaultDateHint: selectedOpeningDate') &&
    wizard.includes('defaultTimeHint: selectedOpeningTime') &&
    wizard.includes('整理档案: parsedArchive'),
  '自由/工坊开局必须优先尝试 AI 整理并在失败时回落本地整理。',
);

assert(
  wizard.includes('生成开局已成立事实') &&
    wizard.includes('worldState.全局事件 = 生成开局已成立事实(worldState.开局档案') &&
    wizard.includes('extraFacts: [') &&
    worldModel.includes('开局档案：${formatOpeningSource(archive.来源)}') &&
    worldModel.includes('防回退规则：${rule}'),
  '开局创建时必须把结构化开局档案写成全局事件里的已成立事实，而不是只写 UI 摘要。',
);

assert(
  systemPromptBuilder.includes('buildOpeningArchiveSection') &&
    systemPromptBuilder.includes('开局档案（长期锚点）') &&
    systemPromptBuilder.includes('后续回合必须承接开局档案和当前地点') &&
    systemPromptBuilder.includes('关键角色参考只代表背景相关人物') &&
    systemPromptBuilder.includes('已认识角色/初始关系只代表长期关系参考') &&
    systemPromptBuilder.includes('不能无理由回到默认黑塔空间站开局') &&
    systemPromptBuilder.includes('不得把玩家强行拉回默认黑塔空间站开局'),
  '系统提示词必须读取开局档案并防止后续回退到默认黑塔开局。',
);

assert(
  !journeyPresets.includes('星之苏醒') &&
    !wizard.includes('星之苏醒') &&
    !openingCoreLore.includes('星之苏醒') &&
    !openingCorePreset.includes('星之苏醒'),
  '开局锚点、UI fallback 和开局核心资料不得硬编码“星之苏醒”，避免选择穹时被默认星偏置覆盖。',
);

const openingBiasTargets = [wizard, journeyPresets, builtinWorldbook, openingCoreLore, openingCorePreset, openingCot, sendWorkflow];
const forbiddenOpeningBiasTerms = [
  '原作的两位主角',
  '原作主角(星 / 穹)',
  '原作主角（星 / 穹）',
  '原作主角星 / 穹',
  '星 / 穹尚未以',
  '星/穹苏醒前夕',
  '故事固定从星/穹',
];
assert(
  forbiddenOpeningBiasTerms.every((term) => openingBiasTargets.every((source) => !source.includes(term))),
  '开局相关资料、UI 与新闻预处理不得继续静态写死星/穹或两位主角。',
);

assert(
  journeyPresets.includes('黑塔空间站 · 主线苏醒前夕') &&
    journeyPresets.includes('贝洛伯格 · 初抵贝洛伯格') &&
    journeyPresets.includes('罗浮仙舟 · 初抵罗浮') &&
    journeyPresets.includes('匹诺康尼 · 盛会邀约') &&
    wizard.includes('selectedOpeningDate') &&
    wizard.includes('selectedOpeningTime') &&
    wizard.includes('selectedOpeningLocation'),
  '开局摘要与开局档案必须按当前起始场景派生，不再只依赖默认黑塔模板。',
);

assert(
  systemPromptBuilder.includes('星不是本周目默认原著主角') &&
    systemPromptBuilder.includes('涉及封存舱、星核载体或原著主角线索时优先写穹') &&
    systemPromptBuilder.includes('不得默认只选星'),
  'system prompt 必须强化单穹与双主角门禁，防止模型回落到默认星。',
);

assert(
  worldbookUtil.includes('openingRegionName') &&
    worldbookUtil.includes('openingChapterName') &&
    worldbookUtil.includes('openingEntryText') &&
    worldbookUtil.includes('openingArchiveText') &&
    worldbookUtil.includes('function formatOriginalProtagonistSubject'),
  '世界书召回上下文必须接入开局地区、章节锚点、玩家介入文本和结构化开局档案。',
);

assert(
  worldModel.includes('关键角色参考：${summary.关键角色参考.join') &&
    worldModel.includes('人物边界：关键角色参考只代表背景相关人物；已认识角色/初始关系只代表长期关系参考；这些都不代表当前在场。'),
  '开局档案上下文必须说明关键角色参考与已认识角色都不等于当前在场，避免智库和剧情编织过度召回。',
);

assert(
  sendWorkflow.includes('openingRegionName: effectiveWorld.开局档案?.地区名称') &&
    sendWorkflow.includes('openingChapterName: effectiveWorld.开局档案?.章节锚点名称') &&
    sendWorkflow.includes('openingEntryText: effectiveWorld.开局档案?.玩家介入原文') &&
    sendWorkflow.includes('openingSource: effectiveWorld.开局档案?.来源') &&
    sendWorkflow.includes('openingArchiveText') &&
    sendWorkflow.includes('startSceneName: effectiveWorld.开局档案?.章节锚点名称 ?? effectiveWorld.当前地点') &&
    sendWorkflow.includes('const openingNewsBody = [') &&
    sendWorkflow.includes('当前开局为${openingArchive?.地区名称') &&
    sendWorkflow.includes('章节参考：${openingArchive?.章节参考说明') &&
    !sendWorkflow.includes('原著主线即将从黑塔空间站危机开始'),
  '主流程上下文和开局新闻预处理必须优先使用开局档案章节名与地区信息。',
);

assert(
  contextSnapshot.includes('openingArchiveText') &&
    contextSnapshot.includes('openingSource: state.世界.开局档案?.来源') &&
    contextSnapshot.includes('格式化开局档案上下文(state.世界.开局档案)'),
  '回合快照必须把结构化开局档案写进世界书 / 剧情编织上下文和诊断结构。',
);

assert(
  zhikuRuntimeCompiler.includes("return scope === 'main' || scope === 'diagnostic'") &&
    sendWorkflow.includes("? 'opening'") &&
    sendWorkflow.includes("? 'pathAwakeningQuestion'") &&
    sendWorkflow.includes("? 'pathAwakeningJudgement'") &&
    zhikuRetrieval.includes('openingArchiveText?: string'),
  '智库唯一编译器必须显式排除开局与命途狭间请求；开局档案由世界书和剧情编织链路消费。',
);

assert(
  storyWeaving.includes('openingArchiveText') &&
    storyWeaving.includes('StoryWeavingRuntimeContext') &&
    storyWeaving.includes('当前开局档案锚点') &&
    storyWeaving.includes('开局档案命中') &&
    storyWeaving.includes('relocateCurrentSegmentByOpeningArchive') &&
    storyWeaving.includes('scoreSegmentAgainstOpening') &&
    storyWeaving.includes('已跳过与开局地区不符的默认滑窗'),
  '剧情编织门禁必须能读取开局档案并按开局地区/章节重定位滑窗，避免仙舟等非黑塔开局仍注入黑塔段。',
);

assert(
  builtinWorldbook.includes('开局切入说明') &&
    builtinWorldbook.includes('黑塔空间站') &&
    builtinWorldbook.includes('黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼和自由 / 创意工坊开局都可以成为当前起点') &&
    builtinWorldbook.includes('仅在「黑塔空间站 · 主线苏醒前夕」开局中') &&
    builtinWorldbook.includes('按开局档案把此前主线视为既成背景') &&
    !builtinWorldbook.includes('当前游戏内仅有「黑塔空间站·反物质入侵」一条线') &&
    !builtinWorldbook.includes('本作目前只做「登上星穹列车」这一条线') &&
    !builtinWorldbook.includes('开局时已抵达黑塔空间站'),
  '内置世界书必须保留黑塔开局兼容，但不得再把所有开局硬锁到黑塔空间站。',
);

assert(
  travelerTemplate.includes('openingRegionName?: string') &&
    travelerTemplate.includes('openingMainlineEnabled?: boolean') &&
    travelerTemplate.includes('不要默认回到黑塔空间站危机') &&
    travelerTemplate.includes('一个能进入当前开局地点或当前自定义事件的身份动因') &&
    !travelerTemplate.includes('一个能进入黑塔空间站开局的身份动因') &&
    wizard.includes('templateOpeningContext') &&
    wizard.includes('openingRegionName: selectedOpeningRegion?.name') &&
    wizard.includes('openingEntryText: effectiveCustomStartPrompt'),
  '旅人随机模板必须读取当前开局上下文，不能继续默认生成黑塔空间站动因。',
);

assert(
  newsModel.includes('formatNewsOpeningArchive') &&
    newsModel.includes('开局档案: formatNewsOpeningArchive(request.world.开局档案)') &&
    newsModel.includes('章节锚点：${archive.章节锚点名称}'),
  '新闻模型必须显式读取结构化开局档案，避免非黑塔开局新闻回落旧默认线。',
);

assert(
  !phoneService.includes('formatPhoneOpeningArchive') && !phoneService.includes('ctx.world.开局档案'),
  '手机联系人不得读取玩家开局介入和初始关系等私有档案。',
);

assert(
  zhikuRetrieval.includes('belobog_arrival') &&
    zhikuRetrieval.includes('belobog_underworld') &&
    zhikuRetrieval.includes('belobog_cocolia_crisis') &&
    zhikuRetrieval.includes('luofu_arrival') &&
    zhikuRetrieval.includes('luofu_kafka_interrogation') &&
    zhikuRetrieval.includes('luofu_phantylia_crisis') &&
    zhikuRetrieval.includes('penacony_invitation') &&
    zhikuRetrieval.includes('penacony_dream_edge') &&
    zhikuRetrieval.includes('penacony_reverie_crisis') &&
    zhikuRetrieval.includes('ZHIKU_SCENE_HINTS.penacony_entry'),
  '智库场景提示必须覆盖黑塔之外的雅利洛、仙舟、匹诺康尼各章节锚点。',
);

assert(
  worldbookUtil.includes('function formatOriginalProtagonistSubject') &&
    worldbookUtil.includes("if (originalProtagonist === '星') return '原作主角星';") &&
    worldbookUtil.includes("if (originalProtagonist === '穹') return '原作主角穹';") &&
    worldbookUtil.includes("if (originalProtagonist === '星穹双主角') return '原作主角星与穹';"),
  '世界书占位符必须能按星、穹、双主角动态渲染原著主角。',
);

assert(
  builtinWorldbook.includes('涉及封存舱、星核载体或原著主角线索时优先写穹') &&
    builtinWorldbook.includes('仅在「黑塔空间站 · 主线苏醒前夕」开局中，不要让{originalProtagonistSubject}在首回合提前苏醒') &&
    openingCoreLore.includes('{openingArchiveText}') &&
    openingCorePreset.includes('{openingArchiveText}') &&
    openingCoreLore.includes('只有开局档案明确处于「黑塔空间站 · 主线苏醒前夕」') &&
    openingCorePreset.includes('只有开局档案明确处于「黑塔空间站 · 主线苏醒前夕」') &&
    !openingCoreLore.includes('此刻是原作主线开始之前的最后几个小时') &&
    !openingCorePreset.includes('此刻是原作主线开始之前的最后几个小时') &&
    sendWorkflow.includes('formatOriginalProtagonistForOpening(effectiveWorld.原著主角)'),
  '开局资料与新闻预处理必须读取动态原著主角和开局档案；封存舱限制只能作为黑塔序章限定规则。',
);

assert(
  openingCot.includes('若原著主角选择为「穹」') &&
    openingCot.includes('不得因为默认记忆把场景写成星') &&
    openingCot.includes('不得默认只剩星') &&
    builtinWorldbook.includes('涉及封存舱、星核载体或原著主角线索时优先写穹'),
  '开局 COT 与内置世界书必须同步约束穹/双主角，不只依赖 UI 状态。',
);

assert(
  wizard.includes('只保存开局表单，不保存 API key 或存档进度。'),
  '预设 UI 必须说明不会保存 API key 或存档进度。',
);

assert(
  systemPanels.includes('黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼和自由开局的章节锚点') &&
    !systemPanels.includes('第一阶段聚焦「登上星穹列车」一条线'),
  '剧情编织占位文案不得再宣称只做登上星穹列车一条线。',
);

assert(
  pkg.scripts?.['test:opening-preset'] === 'node scripts/opening-preset-regression.mjs',
  'package.json 必须提供 test:opening-preset 回归脚本。',
);

console.log('opening preset regression passed');
