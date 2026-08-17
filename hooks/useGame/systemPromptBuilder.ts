import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块作用域 } from '@/models/prompts';
import { PROMPT_MODULE_TOP_THRESHOLD, syncStoryModeModuleEnabled } from '@/models/prompts';
import type { 开局来源, 剧情模式 } from '@/models/journey';
import type { 世界书 } from '@/models/worldbook';
import type { NPC记录, NPC账本选择结果, NPC同行记忆条目 } from '@/models/npc';
import { formatNpcLedgerForPrompt, 格式化NPC关系, selectNpcLedgersForTurn, 提取NPC同行记忆文本列表, 筛选活跃NPC } from '@/models/npc';
import { 清理NPC同行记忆摘要 } from '@/utils/npcMemorySanitizer';
import { 计算命途战技槽位数, NORMAL_SKILL_SLOT_COUNT } from '@/models/skill';
import type { 新闻条目 } from '@/models/news';
import { NEWS_CATEGORY_LABELS } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import { PLOT_STATUS_LABELS } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { ZhikuTurnCompilation } from '@/services/zhikuRuntimeCompiler';
import type { 忆庭系统, 回忆条目 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import type { 背包物品 } from '@/models/inventory';
import { ITEM_CATEGORY_LABELS } from '@/models/inventory';
import {
  getPath,
  getStartingScenario,
} from '@/data/journeyPresets';
import { PATH_STAGE_DEFS, PATH_CORE_BELIEFS } from '@/models/path';
import { renderWorldbookSystemEntry, replaceWorldbookPlaceholders, resolveWorldbookInjectionPlan, type FilterContext, type WorldbookInjectionPlan } from '@/utils/worldbook';
import { retrieveYitingContext } from '@/services/yitingRetrieval';
import { buildStoryWeavingInjection } from '@/services/storyWeaving';
import { resolveCurrentWeavingSegment } from '@/services/storyRuntime/storyWeavingRuntimeAdapter';
import { 构建天气Prompt片段 } from '@/data/weatherRules';
import {
  MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT,
  MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT,
  MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT,
} from './historyWindow';
import { getAnticipatedNpcNamesForTurn } from './npcPresence';
import { processMacros, type MacroContext } from '@/utils/macroEngine';
import { isSTImportedModule } from '@/utils/stPresetParser';
import {
  applyRuntimeNarrativePolicy,
  resolveNarrativePolicy,
} from '@/utils/narrativeRuntimePolicy';

// 当前 prompt 为重构期的中性骨架，具体的世界观/人物设定由世界书注入，
// 「踏上旅途」向导写入的字段在此被汇总输出。
//
// awakeningPhase:命途狭间二阶段提示。
//   - 'question':玩家刚踏入,本回合 AI 出 3 题 + 输出 <狭间问答>
//   - 'judgement':玩家已答题,本回合 AI 必须输出 <狭间评判> + 把旅人拉出虚境回到现实
//   - undefined:不在狭间流程里
export type 命途狭间阶段 = 'question' | 'judgement';

export function buildSystemPrompt(
  traveler: 角色数据结构,
  worldState: 世界状态,
  memorySystem: 记忆系统,
  settings: 游戏设置,
  _turnCount: number,
  worldbooks?: 世界书[],
  worldbookCtx?: FilterContext,
  npcRecords?: NPC记录[],
  news?: 新闻条目[],
  plotNodes?: 剧情节点[],
  storyWeaving?: 剧情编织系统,
  zhikuCompilation?: ZhikuTurnCompilation,
  yiting?: 忆庭系统,
  phone?: 手机系统,
  awakeningPhase?: 命途狭间阶段,
  yitingInjectionOverride?: string,
  /** F2·对标既定方案：调用方（sendWorkflow/contextSnapshot）预召回结果是否命中强回忆；未传时 builder 内部兜底召回自行判定。 */
  yitingStrongRecallHit?: boolean,
  npcLedgerSelectionOverride?: NPC账本选择结果,
  triggerType?: string,
  macroCtx?: MacroContext,
  /** 工作包B：共享预处理层从回合前历史提取的最近 1-2 条剧情规划（区5 剧情安排用）。 */
  storyPlanSnippets?: string[],
  /** 工作包A：世界书单回合唯一解析结果（sendWorkflow 传入；不传则 builder 内部解析一次）。 */
  worldbookPlanInput?: WorldbookInjectionPlan,
): BuiltSystemPrompt {
  const activeNpcRecords = 筛选活跃NPC(npcRecords);
  // ST 预设总开关：关闭时过滤所有 st_import_* 模块（保留预设库数据，仅不注入）。
  // V2 酒馆预设使用原始 prompts + prompt_order 消息链；选中 V2 时也隔离 V1 st_import_* 残留，
  // 避免同一份 ST 预设以 V1 模块和 V2 消息链两种形态重复注入。
  const shouldFilterLegacyStModules = settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2);
  const effectiveModules = shouldFilterLegacyStModules
    ? settings.promptModules.filter((m) => !isSTImportedModule(m))
    : settings.promptModules;
  const playerNameForLabel = getPromptPlayerName(traveler);
  const runtimePolicy = resolveNarrativePolicy(settings, playerNameForLabel);
  // 剧情方向四选一：storymode 模块 enabled 派生自当前剧情模式，注入时只有命中的那一本启用。
  // 人称与玩家发言边界由运行时策略覆盖旧存档/预设残留的 enabled 状态。
  const activeModules = applyRuntimeNarrativePolicy(
    syncStoryModeModuleEnabled(effectiveModules, worldState.剧情模式),
    runtimePolicy,
  );
  const personLabel = buildPersonLabel(settings.narrativePerson, playerNameForLabel);
  // 提示词模块按当前 scope 过滤；scope 信息来自 worldbookCtx.currentScope（与世界书共用一个）。
  // 例外:当世界状态.进行中狭间存在,本回合必须走 pathAwakening scope —— 替代主剧情流程。
  const baseScope: 提示词模块作用域 = worldbookCtx?.currentScope ?? 'main';
  const currentScope: 提示词模块作用域 = worldState.进行中狭间 ? 'pathAwakening' : baseScope;
  const moduleCtx: PromptModuleInjectionCtx = {
    wordCountTarget: settings.wordCountTarget,
    personLabel,
    playerName: playerNameForLabel,
    currentScope,
    openingSource: worldState.开局档案?.来源,
    triggerType,
    macroCtx,
    worldbookCtx,
    storyMode: worldState.剧情模式,
  };

  // ── 工作包B：八区组装。先构造带稳定 ID 的 section 数组，再统一 join。 ──
  const sections: PromptSection[] = [];
  const allChatMessages: ChatModuleMessage[] = [];
  /** 区5 计算的短期记忆（复用给区6，保证同一回合一次拆分） */
  let shortMemCached = '';
  const pushSection = (id: string, title: string, content: string) => {
    if (content) sections.push({ id, title, content });
  };

  // ── 世界书单次解析（工作包A）：同一回合只解析一次，四路分流 ──
  const worldbookPlan = worldbookPlanInput ?? (settings.enableWorldbookInjection && worldbooks && worldbookCtx
    ? resolveWorldbookInjectionPlan(worldbooks, worldbookCtx)
    : null);

  // ── F2·对标既定方案：忆庭召回统一入口（override 优先，否则内部兜底），提前判定强回忆互斥 ──
  // 区5/区6 的记忆注入是否暂停取决于「强回忆是否命中」，必须在本回合拼装前确定，
  // 不能等到区7 才召回——否则三条召回路径的互斥行为会不一致。
  const yitingEnabled = settings.记忆系统?.忆庭启用 !== false;
  const yitingThreshold = settings.记忆系统?.忆庭召回最早触发回合 ?? 10;
  const npcNameMap = activeNpcRecords.reduce<Record<string, string>>((map, npc) => {
    if (npc.id && npc.姓名) map[npc.id] = npc.姓名;
    return map;
  }, {});
  let effectiveYitingInjection = yitingInjectionOverride ?? '';
  /** 内部兜底召回结果（仅 override 未传入时产生，区7 需要它构建全知防护）。 */
  let yitingInternalHit: ReturnType<typeof retrieveYitingContext> | null = null;
  if (yitingInjectionOverride === undefined && yitingEnabled && yiting && worldbookCtx?.recentUserInput && worldbookCtx.turnCount > yitingThreshold) {
    const limit = settings.记忆系统?.忆庭召回条数 ?? 8;
    yitingInternalHit = retrieveYitingContext(yiting, worldbookCtx.recentUserInput, limit, npcNameMap);
    effectiveYitingInjection = yitingInternalHit.injection;
  }
  /**
   * 对标参考项目：回忆召回命中（有召回结果）且关闭「并存注入」时，
   * 暂停中期+长期+短期记忆注入（全禁，回忆承担旧事承接）。
   */
  const yitingMutexActive = settings.记忆系统?.忆庭命中并存注入 !== true && Boolean(effectiveYitingInjection);

  // ── 区1 · 身份区（稳定：开发者模式/叙述者人格/常驻世界书/开局档案） ──
  {
    const zone1: string[] = [];
    const z1 = splitZoneItems(collectZoneModules(activeModules, moduleCtx, (m) =>
      m.id === 'builtin_dev_mode' || m.id === 'builtin_narrator_persona'));
    zone1.push(...z1.systemParts);
    allChatMessages.push(...z1.chatMessages);
    if (worldbookPlan?.alwaysEntries.length) {
      zone1.push(worldbookPlan.alwaysEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '世界书'))
        .join('\n\n---\n\n'));
    }
    const openingArchive = buildOpeningArchiveSection(worldState, currentScope === 'opening');
    if (openingArchive) zone1.push(openingArchive);
    pushSection('zone1-identity', '身份区', zone1.join('\n\n---\n\n'));
  }

  // ── 区2 · 规则区（稳定：叙事规则/剧情方向/力量时间情绪战斗禁词/行为边界/文风/NSFW中文等） ──
  {
    const z2 = splitZoneItems(orderRuleZoneModules(
      collectZoneModules(activeModules, moduleCtx, (m) => isRuleZoneModule(m))));
    const zone2: string[] = [];
    for (const content of z2.systemParts) zone2.push(content);
    allChatMessages.push(...z2.chatMessages);
    if (worldbookPlan?.systemRuleEntries.length) {
      zone2.push(worldbookPlan.systemRuleEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '提示词'))
        .join('\n\n---\n\n'));
    }
    pushSection('zone2-rules', '规则区', zone2.join('\n\n---\n\n'));
  }

  // ── 区3 · 参数区（准稳定：人称/字数/心声/COT语言） ──
  {
    const zone3: string[] = [];
    const z3 = splitZoneItems(collectZoneModules(activeModules, moduleCtx, (m) => m.id.startsWith('builtin_perspective_')));
    zone3.push(...z3.systemParts);
    allChatMessages.push(...z3.chatMessages);
    if (z3.systemParts.length === 0 && z3.chatMessages.length === 0) {
      zone3.push(buildPersonSection(settings.narrativePerson, playerNameForLabel));
    }
    const wordCountSection = buildWordCountSection(settings);
    if (wordCountSection) zone3.push(wordCountSection);
    const innerVoice = buildInnerVoiceSection(settings);
    if (innerVoice) zone3.push(innerVoice);
    const cotLang = buildCotLanguageSection(settings, currentScope);
    if (cotLang) zone3.push(cotLang);
    pushSection('zone3-params', '参数区', zone3.join('\n\n---\n\n'));
  }

  // ── 区4 · 玩家档案区（准稳定：当前角色/战技/背包） ──
  {
    const zone4: string[] = [];
    zone4.push(buildCharacterSection(traveler));
    const skill = buildSkillSection(traveler);
    if (skill) zone4.push(skill);
    const inventory = buildInventorySection(traveler);
    if (inventory) zone4.push(inventory);
    pushSection('zone4-player', '玩家档案区', zone4.join('\n\n---\n\n'));
  }

  // ── 区5 · 记忆区（过去：长期记忆/中期记忆/剧情安排/剧情编织） ──
  {
    const zone5: string[] = [];
    if (settings.enableMemoryInjection) {
      // F2·对标既定方案：忆庭强回忆命中且关闭并存注入时，暂停中期/短期注入，长期只留少量锚点（最近 3 条）。
      const memSplit = buildLayeredMemorySectionsSplit(
        memorySystem,
        yitingMutexActive ? { long: 3, middle: 0, short: 0 } : undefined,
      );
      if (memSplit.long) zone5.push(memSplit.long);
      if (memSplit.middle) zone5.push(memSplit.middle);
      shortMemCached = memSplit.short;
    }
    const arrangement = buildStoryArrangementSection(plotNodes, storyPlanSnippets, storyWeaving);
    if (arrangement) zone5.push(arrangement);
    if (settings.剧情编织系统?.enabled && settings.剧情编织系统.currentWindow) {
      const weaving = buildStoryWeavingInjection(storyWeaving, worldbookCtx);
      if (weaving) zone5.push(weaving);
    }
    pushSection('zone5-memory', '记忆区', zone5.join('\n\n---\n\n'));
  }

  // ── 区6 · 注入区（现在：时间/场景/天气/狭间/世界动态/NPC/关键词世界书/智库/短期记忆） ──
  // NPC 账本选择提前计算（供忆庭在场判断和区6 账本注入复用）
  const npcLedgerSelection = npcLedgerSelectionOverride ?? selectNpcLedgersForTurn({
    records: activeNpcRecords,
    turnCount: _turnCount,
    explicitNames: worldbookCtx?.npcNames,
    sceneNames: worldState.当前时段?.人物?.map((npc) => npc.姓名),
    recalledNames: worldbookCtx?.npcNames,
  });
  {
    const zone6: string[] = [];
    const timeAnchor = buildCurrentTimeAnchorSection(worldState);
    if (timeAnchor) zone6.push(timeAnchor);
    const scene = buildSceneSection(worldState);
    if (scene) zone6.push(scene);
    const weather = buildWeatherSection(worldState);
    if (weather) zone6.push(weather);
    const awakening = buildPathAwakeningSection(traveler, worldState, awakeningPhase);
    if (awakening) zone6.push(awakening);
    const events = buildRecentWorldEventsSection(worldState.全局事件);
    if (events) zone6.push(events);
    const newsSection = buildNewsSection(news);
    if (newsSection) zone6.push(newsSection);
    const phoneSection = buildPhoneSection(phone);
    if (phoneSection) zone6.push(phoneSection);

    // NPC 四段
    const npcPresence = buildNpcPresenceSection(worldState, activeNpcRecords, _turnCount, worldbookCtx?.recentUserInput, worldbookCtx?.npcNames);
    if (npcPresence) zone6.push(npcPresence);
    const npcLedger = buildNpcLedgerContinuitySection(npcLedgerSelection);
    if (npcLedger) zone6.push(npcLedger);
    const npcContinuity = buildNpcContinuitySection(worldState, activeNpcRecords, _turnCount, worldbookCtx?.npcNames);
    if (npcContinuity) zone6.push(npcContinuity);
    const companions = buildCompanionsSection(activeNpcRecords, _turnCount, settings);
    if (companions) zone6.push(companions);

    // 关键词世界书（按需层）
    if (worldbookPlan?.keywordEntries.length) {
      zone6.push(worldbookPlan.keywordEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '世界书'))
        .join('\n\n---\n\n'));
    }
    // 智库（内部顺序已由编译产物保证：弱→强→参考→在场压轴）
    if (zhikuCompilation?.mainStoryInjection.trim()) {
      zone6.push(zhikuCompilation.mainStoryInjection.trim());
    }
    // 短期记忆（区6 末尾，紧贴区7 回顾区；复用区5 已计算的同一次拆分结果）
    if (settings.enableMemoryInjection && shortMemCached) {
      zone6.push(shortMemCached);
    }
    pushSection('zone6-injection', '注入区', zone6.join('\n\n---\n\n'));
  }

  // ── 区7 · 回顾区（即时回顾/忆庭+全知防护/文风助手） ──
  {
    const zone7: string[] = [];
    // 阶段1方案E·全知性防护：在场 NPC id 集合（供忆庭通讯回忆标记来源；id→姓名映射已在开头统一计算）
    const presentNpcIds = new Set(
      npcLedgerSelection.selected
        .filter((item) => item.presentState === 'current')
        .map((item) => item.npc.id),
    );
    // F2·对标既定方案：忆庭注入统一走开头判定的 effectiveYitingInjection；
    // 全知防护只在内部兜底召回路径构建（override 路径由 sendWorkflow/contextSnapshot 预拼，保持原行为）。
    if (yitingInjectionOverride !== undefined) {
      if (effectiveYitingInjection.trim()) zone7.push(effectiveYitingInjection.trim());
    } else if (yitingInternalHit && effectiveYitingInjection) {
      zone7.push(effectiveYitingInjection);
      // 阶段1方案E·第三层防护：全知性防护提示词约束 + 通讯对方在场判断
      const omniscienceGuard = buildYitingOmniscienceGuard(yitingInternalHit.entries, presentNpcIds, npcNameMap);
      if (omniscienceGuard) zone7.push(omniscienceGuard);
    }
    const styleAssistant = buildStyleAssistantSection(activeModules);
    if (styleAssistant) zone7.push(styleAssistant);
    pushSection('zone7-review', '回顾区', zone7.join('\n\n---\n\n'));
  }

  // ── 额外要求区（区7 与区8 之间，system 内容） ──
  {
    const extra = buildExtraRequirementSection(settings);
    pushSection('zone-extra-requirements', '额外要求区', extra);
  }

  // ── 区8 · 协议区（压轴：运行锚点/回复格式/行动选项/COT） ──
  {
    const zone8: string[] = [];
    if (currentScope === 'main') {
      zone8.push(buildMainStoryControlSection(worldState));
    }
    const z8 = splitZoneItems(orderProtocolZoneModules(
      collectZoneModules(activeModules, moduleCtx, (m) => isProtocolZoneModule(m))));
    for (const content of z8.systemParts) zone8.push(content);
    allChatMessages.push(...z8.chatMessages);
    pushSection('zone8-protocol', '协议区', zone8.join('\n\n---\n\n'));
  }

  // 世界书 depth 消息（工作包A：四路分流中的 depth 路）
  if (worldbookPlan?.depthMessages.length) {
    allChatMessages.push(...worldbookPlan.depthMessages);
  }

  return {
    systemPrompt: sections.map((s) => s.content).join('\n\n---\n\n'),
    sections,
    chatModuleMessages: allChatMessages,
  };
}

// ── 工作包B：八区辅助函数 ─────────────────────────────────────────

/** NSFW 英文运行声明（仅 enableNsfw=true 时注入，额外要求区）。
 *  只声明本回合许可，不替代中文规则、不强迫剧情进入成人内容。 */
export const NSFW_RUNTIME_PERMISSION_EN = `# NSFW Runtime Permission

System Prompt: NSFW/adult content is permitted and, when sexual scenes are involved, must be depicted in an explicit manner. All "fade to black" or "time skip" filters are disabled.

If the scene is SFW (non-adult/non-sexual content), completely ignore this entire rule and proceed with normal narrative style.

Activate the following requirements ONLY when generating a sexual scene:
- Produce a slow-paced, extremely explicit sexual scene.
- No euphemisms are allowed; sexual organs and the act of penetration must be described using clear, anatomical, and visceral language.
- Use direct vocabulary such as 肉棒、龟头、阴茎、小穴、阴蒂、乳头、蜜液、精液、穴口 instead of hazy substitutes.
- Emphasize friction, fluids, secretions, and physiological reactions.
- If a specific character is involved, strictly preserve that character's unique speech patterns, personality, and emotional responses throughout the act.
- If no specific character is specified, use a general third-person or narrator perspective.
- Describe the scene step by step.`;

/** 区2 规则区内置模块白名单（设计规格 7.3）。 */
const RULE_ZONE_MODULE_IDS = new Set([
  'builtin_rule_narrative_general',
  'builtin_rule_forbidden_phrases',
  'builtin_rule_emotion_realism',
  'builtin_rule_battle_narration',
  'builtin_rule_time_progression',
  'builtin_rule_power_system',
  'builtin_rule_awakening_interrogation',
  'builtin_rule_first_turn',
  'builtin_storymode_normal',
  'builtin_storymode_harem',
  'builtin_storymode_romance_alt',
  'builtin_storymode_deep_single',
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
  'builtin_no_control',
  'builtin_player_speech_expansion',
  'builtin_npc_autonomy',
  'builtin_npc_ledger_continuity',
  'builtin_nsfw',
  'builtin_cognitive_isolation',
  'builtin_emotion_protocol',
]);

/** 区2 规则区显式顺序（设计规格：先基调→再口径→再表达→行为边界→文风收尾）。 */
const RULE_ZONE_ORDER: Record<string, number> = {
  builtin_rule_narrative_general: 10,
  builtin_rule_first_turn: 11,
  builtin_rule_awakening_interrogation: 12,
  builtin_storymode_normal: 20,
  builtin_storymode_harem: 20,
  builtin_storymode_romance_alt: 20,
  builtin_storymode_deep_single: 20,
  builtin_rule_power_system: 30,
  builtin_rule_time_progression: 40,
  builtin_rule_emotion_realism: 50,
  builtin_rule_battle_narration: 60,
  builtin_rule_forbidden_phrases: 70,
  builtin_no_control: 80,
  builtin_player_speech_expansion: 81,
  builtin_npc_autonomy: 90,
  builtin_npc_ledger_continuity: 100,
  builtin_nsfw: 110,
  builtin_emotion_protocol: 120,
  builtin_cognitive_isolation: 130,
  builtin_writing_style: 140,
  builtin_writing_style_hsr: 140,
  builtin_writing_style_baimiao: 140,
  builtin_writing_style_custom: 140,
};

/** 区8 协议区内置模块白名单（回复格式/行动选项/COT）。 */
const PROTOCOL_ZONE_MODULE_IDS = new Set([
  'builtin_response_format',
  'builtin_action_options',
  'builtin_main_plot_cot',
  'builtin_path_awakening_cot',
  'builtin_opening_cot',
  'builtin_preset_opening_cot',
  'builtin_free_opening_cot',
]);

/** 模块基础过滤（enabled + scope + openingSourceGate + storyModeGate + injectionTrigger）。
 *  工作包B：不再用 order<30/>=30 分区，改用显式 zoneFilter。 */
function filterEnabledModules(
  modules: 提示词模块[] | undefined,
  ctx: PromptModuleInjectionCtx,
): 提示词模块[] {
  return (modules ?? [])
    .filter((m) => m.enabled)
    .filter((m) => {
      const scope = m.scope?.length ? m.scope : (['all'] as 提示词模块作用域[]);
      return scope.includes('all') || scope.includes(ctx.currentScope);
    })
    .filter((m) => {
      if (!m.openingSourceGate?.length) return true;
      return ctx.currentScope === 'opening' && !!ctx.openingSource && m.openingSourceGate.includes(ctx.openingSource);
    })
    .filter((m) => {
      if (!m.storyModeGate?.length) return true;
      return !!ctx.storyMode && m.storyModeGate.includes(ctx.storyMode);
    })
    .filter((m) => {
      if (!m.injectionTrigger?.length) return true;
      return !!ctx.triggerType && m.injectionTrigger.includes(ctx.triggerType);
    });
}

/** 模块内容渲染（占位符替换管线，与 injectPromptModules 一致）。 */
function renderModuleContent(m: 提示词模块, ctx: PromptModuleInjectionCtx): string {
  const baseReplaced = m.content
    .replace(/\{wordCountTarget\}/g, String(ctx.wordCountTarget))
    .replace(/\{personLabel\}/g, ctx.personLabel)
    .replace(/\{playerName\}/g, ctx.playerName);
  const replaced = ctx.worldbookCtx ? replaceWorldbookPlaceholders(baseReplaced, ctx.worldbookCtx) : baseReplaced;
  return ctx.macroCtx ? processMacros(replaced, ctx.macroCtx) : replaced;
}

interface ZoneModuleItem {
  id: string;
  content: string;
  role: string;
  injectionPosition?: number;
  injectionDepth?: number;
  injectionOrder?: number;
}

/** 按区收集模块（含玩家自定义模块的 category 归区）。
 *  - 区1：persona/devmode 类
 *  - 区2：规则白名单 + style/storymode/custom/jailbreak 类
 *  - 区8：协议白名单 + format/cot 类 */
function collectZoneModules(
  activeModules: 提示词模块[] | undefined,
  ctx: PromptModuleInjectionCtx,
  zoneFilter: (m: 提示词模块) => boolean,
): ZoneModuleItem[] {
  const items: ZoneModuleItem[] = [];
  for (const m of filterEnabledModules(activeModules, ctx)) {
    if (!zoneFilter(m)) continue;
    const role = m.role ?? 'system';
    items.push({
      id: m.id,
      content: renderModuleContent(m, ctx),
      role,
      injectionPosition: m.injectionPosition,
      injectionDepth: m.injectionDepth,
      injectionOrder: m.injectionOrder ?? m.order,
    });
  }
  return items;
}

/** 区2 模块归属（内置白名单 + 玩家自定义 style/storymode/custom/jailbreak 类）。 */
function isRuleZoneModule(m: 提示词模块): boolean {
  if (RULE_ZONE_MODULE_IDS.has(m.id)) return true;
  const cat = m.category;
  return cat === 'style' || cat === 'storymode' || cat === 'custom' || cat === 'jailbreak';
}

/** 区8 模块归属（协议白名单 + 玩家自定义 format/cot 类）。 */
function isProtocolZoneModule(m: 提示词模块): boolean {
  if (PROTOCOL_ZONE_MODULE_IDS.has(m.id)) return true;
  const cat = m.category;
  return cat === 'format' || cat === 'cot';
}

/** 把模块 items 按内容/角色拆成 system 段落与 chat 消息。 */
function splitZoneItems(
  items: ZoneModuleItem[],
): { systemParts: string[]; chatMessages: ChatModuleMessage[] } {
  const systemParts: string[] = [];
  const chatMessages: ChatModuleMessage[] = [];
  for (const item of items) {
    if (item.role === 'system') {
      systemParts.push(item.content);
    } else {
      chatMessages.push({
        role: item.role,
        content: item.content,
        _injectionPosition: item.injectionPosition ?? 0,
        _injectionDepth: item.injectionDepth ?? 4,
        _injectionOrder: item.injectionOrder ?? 0,
      });
    }
  }
  return { systemParts, chatMessages };
}

/** 区2 规则区排序（设计规格顺序）。 */
function orderRuleZoneModules(items: ZoneModuleItem[]): ZoneModuleItem[] {
  return [...items].sort((a, b) => {
    const ka = RULE_ZONE_ORDER[a.id] ?? 1000;
    const kb = RULE_ZONE_ORDER[b.id] ?? 1000;
    if (ka !== kb) return ka - kb;
    return (a.injectionOrder ?? 0) - (b.injectionOrder ?? 0);
  });
}

/** 区8 协议区排序（回复格式 → 行动选项 → COT 末尾）。 */
function orderProtocolZoneModules(items: ZoneModuleItem[]): ZoneModuleItem[] {
  const rank = (id: string): number => {
    if (id === 'builtin_response_format') return 10;
    if (id === 'builtin_action_options') return 20;
    if (id.startsWith('builtin_') && id.endsWith('_cot')) return 30;
    return 40; // 玩家自定义 format/cot
  };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id) || (a.injectionOrder ?? 0) - (b.injectionOrder ?? 0));
}

/** 区3 字数要求段（从设置读取，独立段）。 */
function buildWordCountSection(settings: 游戏设置): string {
  return `# 字数要求\n\n- 本回合正文不少于 ${settings.wordCountTarget} 字；日常推进可贴近下限，关键场景应超过下限。`;
}

/** 分层记忆拆分：一次性计算三层（共享 seen 跨层去重），分别返回。
 *  长/中→区5，短→区6 末尾（工作包B）。 */
/** 分层记忆拆分：一次性计算三层（共享 seen 跨层去重），分别返回。
 *  F2·对标既定方案：overrides 支持忆庭互斥时收紧/关闭某一层（长期锚点 N 条、中期/短期 0 条）。 */
function buildLayeredMemorySectionsSplit(
  memorySystem: 记忆系统,
  overrides?: { long?: number; middle?: number; short?: number },
): { long: string; middle: string; short: string } {
  const seen: string[] = [];
  // 去重扫描顺序：短期→中期→长期（重复内容保留在最短的那层，与原逻辑一致）
  const shortTerm = pickDedupedMemoryEntries(memorySystem.短期记忆, overrides?.short ?? MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT, seen);
  const middleTerm = pickDedupedMemoryEntries(memorySystem.中期记忆 ?? [], overrides?.middle ?? MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT, seen);
  const longTerm = pickDedupedMemoryEntries(memorySystem.长期记忆, overrides?.long ?? MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT, seen);
  return {
    long: longTerm.length ? formatMemorySection('长期记忆', longTerm) : '',
    middle: middleTerm.length ? formatMemorySection('中期记忆', middleTerm) : '',
    short: shortTerm.length ? formatMemorySection('短期记忆', shortTerm) : '',
  };
}

/** 区5 剧情安排合并段（主线进度 + 最近 1-2 条剧情规划备忘）。 */
function buildStoryArrangementSection(
  plotNodes: 剧情节点[] | undefined,
  storyPlanSnippets: string[] | undefined,
  storyWeaving?: 剧情编织系统,
): string {
  const lines: string[] = ['# 剧情安排'];
  const active = (plotNodes ?? []).filter((n) => n.状态 === 'active');
  if (active.length) {
    lines.push('', '## 当前主线');
    for (const n of active) {
      lines.push(`- ${n.标题}（${PLOT_STATUS_LABELS[n.状态]}）${n.摘要 ? ` — ${n.摘要}` : ''}`);
      if (n.AI引导) lines.push(`  引导：${n.AI引导}`);
    }
  }
  const recentCompleted = (plotNodes ?? [])
    .filter((n) => n.状态 === 'completed')
    .sort((a, b) => b.更新回合 - a.更新回合)
    .slice(0, 3);
  if (recentCompleted.length) {
    lines.push('', '## 近期完成');
    for (const n of recentCompleted) {
      lines.push(`- ${n.标题}${n.摘要 ? ` — ${n.摘要}` : ''}`);
    }
  }
  const snippets = (storyPlanSnippets ?? []).map((s) => s.trim()).filter(Boolean);
  if (snippets.length) {
    lines.push('', '## 剧情规划备忘');
    for (const s of snippets.slice(0, 2)) lines.push(`- ${s}`);
  }
  // 剧情推进申报契约：给 AI 当前分段关键事件/结束状态，要求其在《剧情规划》内声明推进情况。
  // 申报只作提示，系统会按正文证据校验后才推进——AI 不得只凭申报自行跳段。
  const currentSegment = storyWeaving ? resolveCurrentWeavingSegment(storyWeaving)?.currentSegment : undefined;
  if (currentSegment) {
    const keyEvents = (currentSegment.关键事件 ?? []).map((e) => e.事件名).filter(Boolean);
    const endStates = (currentSegment.本段结束状态 ?? []).slice(0, 3);
    lines.push('', '## 当前剧情分段（推进申报）');
    lines.push(`- 当前分段：${currentSegment.标题 || `第 ${currentSegment.组号} 段`}${keyEvents.length ? `｜关键事件：${keyEvents.join('、')}` : ''}`);
    if (endStates.length) lines.push(`- 本段结束状态（写完后需在正文中体现）：${endStates.join('；')}`);
    lines.push(
      '- 每回合请在《剧情规划》末尾输出 <剧情推进> 申报：本回合正文是否完成当前分段、下一段去向。',
      '  格式：<剧情推进>完成: 是/否；进入分段: <分段名或组号，未进入填"无">；依据: <简述> </剧情推进>',
      '  「完成」必须基于本回合正文实际写到的内容；系统只按正文证据校验，申报本身不能推进剧情。',
    );
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/** 区6 天气判断段（builder 统一组装，不再由发送侧追加）。 */
function buildWeatherSection(worldState: 世界状态): string {
  return 构建天气Prompt片段(worldState.当前地点, worldState.当前天气);
}

/** 区7 文风助手（一行提醒当前启用文风，不复制整段文风模块）。 */
function buildStyleAssistantSection(activeModules: 提示词模块[] | undefined): string {
  const styleModule = (activeModules ?? []).find(
    (m) => m.enabled && m.id.startsWith('builtin_writing_style'),
  );
  if (!styleModule) return '';
  return `# 文风助手\n\n- 当前文风：「${styleModule.title}」。正文按区2 文风模块的质感要求写作。`;
}

/** 额外要求区（区7 与区8 之间，system 内容）：玩家额外要求 + NSFW 英文运行声明。
 *  includeNsfw=false 时（pathAwakening）不注入 NSFW 双层。 */
function buildExtraRequirementSection(settings: 游戏设置, includeNsfw = true): string {
  const parts: string[] = [];
  const extra = settings.额外功能?.玩家额外要求?.trim();
  if (extra) parts.push(`# 玩家额外要求\n\n${extra}`);
  if (includeNsfw && settings.enableNsfw) {
    parts.push(NSFW_RUNTIME_PERMISSION_EN);
  }
  return parts.join('\n\n---\n\n');
}

/** 工作包F：命途狭间专用裁剪流程（不套用完整普通主剧情链）。
 *  只包含：叙述者人格/必要世界框架/狭间规则/禁词/力量体系/人称字数/当前角色/狭间状态（含目标命途阶段理念）/
 *  进入前场景/必要回顾/关键词世界书/智库/回复格式/狭间 COT。不注入：战技背包、记忆、剧情安排、编织、
 *  时间天气、事件新闻手机、NPC 承接、NSFW 双层、普通区E。 */
export function buildPathAwakeningSystemPrompt(
  traveler: 角色数据结构,
  worldState: 世界状态,
  settings: 游戏设置,
  _turnCount: number,
  worldbooks?: 世界书[],
  worldbookCtx?: FilterContext,
  zhikuCompilation?: ZhikuTurnCompilation,
  awakeningPhase?: 命途狭间阶段,
  yitingInjectionOverride?: string,
  triggerType?: string,
  macroCtx?: MacroContext,
  worldbookPlanInput?: WorldbookInjectionPlan,
): BuiltSystemPrompt {
  const sections: PromptSection[] = [];
  const allChatMessages: ChatModuleMessage[] = [];
  const pushSection = (id: string, title: string, content: string) => {
    if (content) sections.push({ id, title, content });
  };
  const currentScope: 提示词模块作用域 = 'pathAwakening';

  const shouldFilterLegacyStModules = settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2);
  const effectiveModules = shouldFilterLegacyStModules
    ? settings.promptModules.filter((m) => !isSTImportedModule(m))
    : settings.promptModules;
  const playerNameForLabel = getPromptPlayerName(traveler);
  const runtimePolicy = resolveNarrativePolicy(settings, playerNameForLabel);
  const activeModules = applyRuntimeNarrativePolicy(
    syncStoryModeModuleEnabled(effectiveModules, worldState.剧情模式),
    runtimePolicy,
  );
  const personLabel = buildPersonLabel(settings.narrativePerson, playerNameForLabel);
  const moduleCtx: PromptModuleInjectionCtx = {
    wordCountTarget: settings.wordCountTarget,
    personLabel,
    playerName: playerNameForLabel,
    currentScope,
    openingSource: worldState.开局档案?.来源,
    triggerType,
    macroCtx,
    worldbookCtx,
    storyMode: worldState.剧情模式,
  };
  const worldbookPlan = worldbookPlanInput ?? (settings.enableWorldbookInjection && worldbooks && worldbookCtx
    ? resolveWorldbookInjectionPlan(worldbooks, worldbookCtx)
    : null);

  // 区1：叙述者人格 + 必要世界框架（常驻世界书）
  {
    const zone1: string[] = [];
    const z1 = splitZoneItems(collectZoneModules(activeModules, moduleCtx, (m) =>
      m.id === 'builtin_dev_mode' || m.id === 'builtin_narrator_persona'));
    zone1.push(...z1.systemParts);
    allChatMessages.push(...z1.chatMessages);
    if (worldbookPlan?.alwaysEntries.length) {
      zone1.push(worldbookPlan.alwaysEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '世界书'))
        .join('\n\n---\n\n'));
    }
    pushSection('zone1-identity', '身份区', zone1.join('\n\n---\n\n'));
  }

  // 区2：规则（狭间 scope 下仅禁词/力量体系/狭间三问规则命中）
  {
    const z2 = splitZoneItems(orderRuleZoneModules(
      collectZoneModules(activeModules, moduleCtx, (m) => isRuleZoneModule(m))));
    const zone2: string[] = [...z2.systemParts];
    allChatMessages.push(...z2.chatMessages);
    if (worldbookPlan?.systemRuleEntries.length) {
      zone2.push(worldbookPlan.systemRuleEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '提示词'))
        .join('\n\n---\n\n'));
    }
    pushSection('zone2-rules', '规则区', zone2.join('\n\n---\n\n'));
  }

  // 区3：参数（人称模块 scope 不含 pathAwakening，用设置生成一行；字数）
  {
    const zone3: string[] = [];
    zone3.push(buildPersonSection(settings.narrativePerson, playerNameForLabel));
    const wordCountSection = buildWordCountSection(settings);
    if (wordCountSection) zone3.push(wordCountSection);
    pushSection('zone3-params', '参数区', zone3.join('\n\n---\n\n'));
  }

  // 当前角色
  pushSection('zone4-player', '玩家档案区', buildCharacterSection(traveler));

  // 狭间状态（含目标命途/当前阶段/核心理念/出题或评判协议）
  {
    const awakeningSection = buildPathAwakeningSection(traveler, worldState, awakeningPhase);
    pushSection('zone5-awakening', '狭间状态', awakeningSection);
  }

  // 进入前现实场景
  {
    const scene = buildSceneSection(worldState);
    pushSection('zone6-scene', '进入前场景', scene);
  }

  // 回顾（即时回顾 + 忆庭，由发送侧预拼 override）
  {
    const review = yitingInjectionOverride?.trim();
    pushSection('zone7-review', '回顾区', review ?? '');
  }

  // 关键词世界书 + 必要命途智库
  {
    const zone8: string[] = [];
    if (worldbookPlan?.keywordEntries.length) {
      zone8.push(worldbookPlan.keywordEntries
        .map((item) => renderWorldbookSystemEntry(item, worldbookCtx!, '世界书'))
        .join('\n\n---\n\n'));
    }
    if (zhikuCompilation?.mainStoryInjection.trim()) {
      zone8.push(zhikuCompilation.mainStoryInjection.trim());
    }
    pushSection('zone8-knowledge', '按需资料', zone8.join('\n\n---\n\n'));
  }

  // 协议区：回复格式 + 狭间 COT（scope 命中 builtin_path_awakening_cot；main_plot_cot 不命中）
  {
    const z9 = splitZoneItems(orderProtocolZoneModules(
      collectZoneModules(activeModules, moduleCtx, (m) => isProtocolZoneModule(m))));
    const zone9: string[] = [...z9.systemParts];
    allChatMessages.push(...z9.chatMessages);
    pushSection('zone9-protocol', '协议区', zone9.join('\n\n---\n\n'));
  }

  // 额外要求区：不含 NSFW（pathAwakening 不注入 NSFW 双层）
  pushSection('zone-extra-requirements', '额外要求区', buildExtraRequirementSection(settings, false));

  // depth 消息
  if (worldbookPlan?.depthMessages.length) {
    allChatMessages.push(...worldbookPlan.depthMessages);
  }

  return {
    systemPrompt: sections.map((sec) => sec.content).join('\n\n---\n\n'),
    sections,
    chatModuleMessages: allChatMessages,
  };
}

export function buildOpeningSystemPrompt(
  traveler: 角色数据结构,
  worldState: 世界状态,
  settings: 游戏设置,
  turnCount: number,
  worldbooks?: 世界书[],
  worldbookCtx?: FilterContext,
  news?: 新闻条目[],
  triggerType?: string,
  macroCtx?: MacroContext,
  worldbookPlanInput?: WorldbookInjectionPlan,
  zhikuCompilation?: ZhikuTurnCompilation,
): BuiltSystemPrompt {
  const parts: string[] = [];
  const allChatMessages: ChatModuleMessage[] = [];
  // ST 预设总开关：关闭时过滤所有 st_import_* 模块（保留预设库数据，仅不注入）。
  // V2 酒馆预设使用原始 prompts + prompt_order 消息链；选中 V2 时也隔离 V1 st_import_* 残留，
  // 避免同一份 ST 预设以 V1 模块和 V2 消息链两种形态重复注入。
  const shouldFilterLegacyStModules = settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2);
  const effectiveModules = shouldFilterLegacyStModules
    ? settings.promptModules.filter((m) => !isSTImportedModule(m))
    : settings.promptModules;
  // 剧情方向四选一：storymode 模块 enabled 派生自当前剧情模式。
  const playerNameForLabel = getPromptPlayerName(traveler);
  const runtimePolicy = resolveNarrativePolicy(settings, playerNameForLabel);
  const activeModules = applyRuntimeNarrativePolicy(
    syncStoryModeModuleEnabled(effectiveModules, worldState.剧情模式),
    runtimePolicy,
  );
  const personLabel = buildPersonLabel(settings.narrativePerson, playerNameForLabel);
  const moduleCtx: PromptModuleInjectionCtx = {
    wordCountTarget: settings.wordCountTarget,
    personLabel,
    playerName: playerNameForLabel,
    currentScope: 'opening' as 提示词模块作用域,
    openingSource: worldState.开局档案?.来源,
    triggerType,
    macroCtx,
    worldbookCtx,
    storyMode: worldState.剧情模式,
  };
  const openingWorldbookCtx: FilterContext | undefined = worldbookCtx
    ? { ...worldbookCtx, currentScope: 'opening', turnCount }
    : undefined;
  const worldbookPlan = settings.enableWorldbookInjection && worldbooks && openingWorldbookCtx
    ? (worldbookPlanInput ?? resolveWorldbookInjectionPlan(worldbooks, openingWorldbookCtx))
    : null;

  const topResult = injectPromptModules(activeModules, moduleCtx, 'top');
  if (topResult.systemSection) parts.push(topResult.systemSection);
  allChatMessages.push(...topResult.chatModuleMessages);

  if (worldbookPlan?.alwaysEntries.length && openingWorldbookCtx) {
    parts.push(worldbookPlan.alwaysEntries
      .map((item) => renderWorldbookSystemEntry(item, openingWorldbookCtx, '世界书'))
      .join('\n\n---\n\n'));
  }
  if (worldbookPlan?.systemRuleEntries.length && openingWorldbookCtx) {
    parts.push(worldbookPlan.systemRuleEntries
      .map((item) => renderWorldbookSystemEntry(item, openingWorldbookCtx, '提示词'))
      .join('\n\n---\n\n'));
  }

  const bottomResult = injectPromptModules(activeModules, moduleCtx, 'bottom');
  if (bottomResult.systemSection) parts.push(bottomResult.systemSection);
  allChatMessages.push(...bottomResult.chatModuleMessages);

  // 结构轮(D1): 基调/字数/归属硬编码段删除,与主剧情 builder 同步(唯一权威=「回复格式」模块)。
  const innerVoiceSection = buildInnerVoiceSection(settings);
  if (innerVoiceSection) parts.push(innerVoiceSection);

  parts.push(buildCharacterSection(traveler));

  const openingAbilitySections = buildOpeningAbilitySections(traveler, worldState, worldbookCtx);
  parts.push(...openingAbilitySections);

  const timeAnchor = buildCurrentTimeAnchorSection(worldState);
  if (timeAnchor) parts.push(timeAnchor);

  const openingCutIn = buildOpeningCutInSection(worldState);
  if (openingCutIn) parts.push(openingCutIn);

  const openingArchiveSection = buildOpeningArchiveSection(worldState, true);
  if (openingArchiveSection) parts.push(openingArchiveSection);

  const scene = buildSceneSection(worldState);
  if (scene) parts.push(scene);

  const recentWorldEventsSection = buildRecentWorldEventsSection(worldState.全局事件);
  if (recentWorldEventsSection) parts.push(recentWorldEventsSection);
  const newsSection = buildNewsSection(news);
  if (newsSection) parts.push(newsSection);

  if (worldbookPlan?.keywordEntries.length && openingWorldbookCtx) {
    parts.push(worldbookPlan.keywordEntries
      .map((item) => renderWorldbookSystemEntry(item, openingWorldbookCtx, '世界书'))
      .join('\n\n---\n\n'));
  }
  if (zhikuCompilation?.mainStoryInjection.trim()) {
    parts.push(zhikuCompilation.mainStoryInjection.trim());
  }
  if (worldbookPlan?.depthMessages.length) {
    allChatMessages.push(...worldbookPlan.depthMessages);
  }

  // 工作包E：玩家额外要求与 NSFW 双层段（开关开启时，协议前）
  const extraRequirements = buildExtraRequirementSection(settings);
  if (extraRequirements) parts.push(extraRequirements);

  return {
    systemPrompt: parts.join('\n\n---\n\n'),
    // 工作包B：开局流程 section（暂以单段呈现；工作包E 会按专用流程重组）
    sections: parts.length ? [{ id: 'opening', title: '开局流程', content: parts.join('\n\n---\n\n') }] : [],
    chatModuleMessages: allChatMessages,
  };
}

function buildOpeningAbilitySections(
  traveler: 角色数据结构,
  worldState: 世界状态,
  worldbookCtx?: FilterContext,
): string[] {
  const openingText = [
    worldState.自定义开局,
    worldbookCtx?.openingArchiveText,
    worldbookCtx?.openingEntryText,
    worldState.开局档案?.玩家介入原文,
    worldState.开局档案?.章节锚点名称,
    worldState.当前地点,
    ...(worldState.全局事件 ?? []).slice(-3),
  ].filter(Boolean).join('\n');
  const sections: string[] = [];

  const skillNames = (traveler.战技列表 ?? []).map((skill) => skill.名称).filter(Boolean);
  const needsSkills = /战斗|袭击|危机|敌人|命途|能力|战技|武器|交战|突围/.test(openingText)
    || skillNames.some((name) => openingText.includes(name));
  if (needsSkills) {
    const skills = buildSkillSection(traveler);
    if (skills) sections.push(skills);
  }

  const inventoryNames = (traveler.背包 ?? []).map((item) => item.名称).filter(Boolean);
  const needsInventory = /背包|物品|道具|装备|终端|通讯器|钥匙|凭证|药品/.test(openingText)
    || inventoryNames.some((name) => openingText.includes(name));
  if (needsInventory) {
    const inventory = buildInventorySection(traveler);
    if (inventory) sections.push(inventory);
  }

  return sections;
}

function normalizeMemoryFingerprint(text: string): string {
  return text
    .replace(/【[^】]{0,24}】/g, '')
    .replace(/[第回合纪要即时短期中期长期压缩档案记忆总结：:，,。！？!?、；;\s\-\d]/g, '')
    .toLowerCase()
    .slice(0, 160);
}

function isSimilarMemoryEntry(entry: string, seen: string[]): boolean {
  const fp = normalizeMemoryFingerprint(entry);
  if (fp.length < 18) return false;
  return seen.some((item) => {
    if (!item) return false;
    if (fp.includes(item) || item.includes(fp)) return true;
    const left = new Set([...fp]);
    let overlap = 0;
    for (const ch of item) {
      if (left.has(ch)) overlap += 1;
    }
    return overlap / Math.max(fp.length, item.length) >= 0.72;
  });
}

function pickDedupedMemoryEntries(entries: string[], limit: number, seen: string[]): string[] {
  const picked: string[] = [];
  const source = entries.map((item) => item.trim()).filter(Boolean);
  for (let i = source.length - 1; i >= 0 && picked.length < limit; i -= 1) {
    const entry = source[i];
    if (isSimilarMemoryEntry(entry, seen)) continue;
    picked.unshift(entry);
    const fp = normalizeMemoryFingerprint(entry);
    if (fp) seen.push(fp);
  }
  return picked;
}

function formatMemorySection(title: string, entries: string[]): string {
  return `# 记忆｜${title}\n\n${entries.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
}

function buildLayeredMemorySections(memorySystem: 记忆系统): string[] {
  const seen: string[] = [];
  const shortTerm = pickDedupedMemoryEntries(
    memorySystem.短期记忆,
    MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT,
    seen,
  );
  const middleTerm = pickDedupedMemoryEntries(
    memorySystem.中期记忆 ?? [],
    MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT,
    seen,
  );
  const longTerm = pickDedupedMemoryEntries(
    memorySystem.长期记忆,
    MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT,
    seen,
  );

  const sections: string[] = [];
  if (longTerm.length) sections.push(formatMemorySection('长期记忆', longTerm));
  if (middleTerm.length) sections.push(formatMemorySection('中期记忆', middleTerm));
  if (shortTerm.length) sections.push(formatMemorySection('短期记忆', shortTerm));
  return sections;
}

interface PromptModuleInjectionCtx {
  wordCountTarget: number;
  personLabel: string;
  playerName: string;
  currentScope: 提示词模块作用域;
  openingSource?: 开局来源;
  /** ST 预设兼容：当前触发生成类型。空=全触发（旧行为）。 */
  triggerType?: string;
  /** ST 预设兼容：宏变量上下文。不传=不执行宏处理（旧行为）。 */
  macroCtx?: MacroContext;
  /** 批次5(D10)：迁移自世界书的规则模块含 {originalProtagonistSubject} 等世界书占位符,
   *  传入时复用世界书替换管线；不传=仅做模块自有三占位符替换（旧行为）。 */
  worldbookCtx?: FilterContext;
  /** 剧情方向门控：当前剧情模式。模块 storyModeGate 非空时仅命中此值才注入。 */
  storyMode?: 剧情模式;
}

/** 非 system 角色的提示词模块消息。带元数据字段供 Phase 4 depth 注入使用。 */
export interface ChatModuleMessage {
  role: string;
  content: string;
  /** 0=相对位置（已在 systemSection 中），1=In-Chat（需 depth 插入）。 */
  _injectionPosition?: number;
  /** In-Chat depth 值。0=末条消息后，1=末条消息前，依此类推。 */
  _injectionDepth?: number;
  /** 同 role 同 depth 内排序值。 */
  _injectionOrder?: number;
}

/** injectPromptModules 的返回值。 */
interface InjectedModules {
  systemSection: string;
  chatModuleMessages: ChatModuleMessage[];
}

/** 八区组装的可诊断 section（工作包B：builder 先构造带稳定 ID 的 section 数组再统一 join）。 */
export interface PromptSection {
  /** 稳定 ID：如 'zone1-identity' / 'zone2-rules' / 'zone8-protocol' */
  id: string;
  title: string;
  content: string;
}

/** buildSystemPrompt / buildOpeningSystemPrompt 的返回值。 */
export interface BuiltSystemPrompt {
  systemPrompt: string;
  /** 八区 section 列表（供上下文快照和集中回归读取，不再靠标题猜分段） */
  sections: PromptSection[];
  chatModuleMessages: ChatModuleMessage[];
}

function getPromptPlayerName(traveler: 角色数据结构): string {
  return traveler.姓名?.trim() || '无名开拓者';
}

/**
 * 写作人称标签：第三人称必须带上主角名并明确禁止"你"，
 * 避免模型在第三人称下仍然按第二人称习惯输出。
 */
function buildPersonLabel(narrativePerson: 'first' | 'second' | 'third', playerName: string): string {
  if (narrativePerson === 'second') return '第二人称"你"';
  if (narrativePerson === 'first') return '第一人称"我"';
  return `第三人称"他/她"（正文以主角名「${playerName}」或"他/她"指代主角，禁止用"你"称呼主角）`;
}

/**
 * 完整写作人称段（对齐既定方案 perspective 模块）：明确主代词 + 禁止切换 + 保持稳定。
 * 第三人称额外声明：模块示例/规则中的"你"一律按第三人称转换。
 */
function buildPersonSection(narrativePerson: 'first' | 'second' | 'third', playerName: string): string {
  if (narrativePerson === 'first') {
    return '# 写作人称\n\n- 视角：第一人称"我"。\n- 玩家统一用"我"指代，必要时可补充「' + playerName + '」；玩家代词保持"我"，不切换成"你/他/她"。\n- 整条回复保持稳定第一人称；正文示例、规则或历史中的"你"一律按第一人称转换。';
  }
  if (narrativePerson === 'second') {
    return '# 写作人称\n\n- 视角：第二人称"你"。\n- 玩家统一用"你"指代；玩家代词保持"你"，不切换成"我/他/她"。\n- 整条回复保持稳定第二人称。';
  }
  return '# 写作人称\n\n- 视角：第三人称。\n- 玩家统一用「' + playerName + '」或"他/她"指代主角；玩家代词保持第三人称，**禁止切换成"你"或"我"**。\n- 整条回复保持稳定第三人称；正文示例、规则或历史中的"你"一律按第三人称转换（如"你没有动"应写作"「' + playerName + '」没有动"）。';
}

/** 思维链输出语言标签映射（cotLanguage 设置 → AI 可读的语言名） */
const COT_LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  ru: 'Русский',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
};

/** 思维链语言提示段。cotLanguage 缺省或 'zh' 时不注入；其他值在主剧情 CoT 之后追加。
 *  仅对正文生成流程生效（currentScope === 'main'），不影响开局 / 狭间 / 独立系统。 */
function buildCotLanguageSection(settings: 游戏设置, currentScope: 提示词模块作用域): string {
  if (currentScope !== 'main') return '';
  const lang = settings.cotLanguage;
  if (!lang || lang === 'zh') return '';
  const label = COT_LANGUAGE_LABELS[lang];
  if (!label) return '';
  return `# 思维链输出语言\n\n- 主剧情思维链 <think> 思考段请用 ${label} 输出。\n- 正文（旁白、角色对白、行动选项）仍按原语言（中文）输出，不受此设置影响。\n- 思考段内的字段名（如 NPC 分析、候选方案 A/B、状态等）保持中文，仅描述性内容用 ${label}。`;
}

function buildInnerVoiceSection(settings: 游戏设置): string {
  return settings.enableInnerVoice
    ? '# 心声开关\n\n- 当前设置：心声输出开启。正文可使用【心声】段呈现主角的即时内心微动，但不要替玩家做决定。'
    : '# 心声开关\n\n- 当前设置：心声输出关闭。正文只保留【旁白】与【角色名】，不要输出【心声】段，也不要用内心独白替代旁白。';
}

// 结构轮(D1, 2026-07-26): 字数与发言归属两个硬编码段构建函数已删除——
// 唯一权威在「回复格式」模块(migratePromptModules 强刷保证触达),
// 生成点兜底在 sendWorkflow 的区E执法块(本回合生成前核对)。

function injectPromptModules(
  modules: 提示词模块[] | undefined,
  ctx: PromptModuleInjectionCtx,
  position: 'top' | 'bottom',
): InjectedModules {
  if (!modules || modules.length === 0) return { systemSection: '', chatModuleMessages: [] };
  const filtered = modules
    .filter((m) => m.enabled)
    .filter((m) => {
      const scope = m.scope?.length ? m.scope : (['all'] as 提示词模块作用域[]);
      return scope.includes('all') || scope.includes(ctx.currentScope);
    })
    .filter((m) => {
      if (!m.openingSourceGate?.length) return true;
      return ctx.currentScope === 'opening' && !!ctx.openingSource && m.openingSourceGate.includes(ctx.openingSource);
    })
    .filter((m) => {
      // 剧情方向门控（四选一）：模块声明了 storyModeGate 时，仅当前剧情模式命中才注入。
      if (!m.storyModeGate?.length) return true;
      return !!ctx.storyMode && m.storyModeGate.includes(ctx.storyMode);
    })
    .filter((m) => {
      // ST 预设兼容：injectionTrigger 为空 = 全触发（旧行为）。
      // 非空时必须包含当前 triggerType 才注入。
      if (!m.injectionTrigger?.length) return true;
      return !!ctx.triggerType && m.injectionTrigger.includes(ctx.triggerType);
    })
    .filter((m) =>
      position === 'top'
        ? m.order < PROMPT_MODULE_TOP_THRESHOLD
        : m.order >= PROMPT_MODULE_TOP_THRESHOLD,
    )
    .sort((a, b) => a.order - b.order);
  if (filtered.length === 0) return { systemSection: '', chatModuleMessages: [] };

  // ST 预设兼容：role 分流。system 角色拼接到 systemSection，
  // user/assistant 角色加入 chatModuleMessages（Phase 4 用于 depth 注入）。
  const systemParts: string[] = [];
  const chatMessages: ChatModuleMessage[] = [];
  for (const m of filtered) {
    const baseReplaced = m.content
      .replace(/\{wordCountTarget\}/g, String(ctx.wordCountTarget))
      .replace(/\{personLabel\}/g, ctx.personLabel)
      .replace(/\{playerName\}/g, ctx.playerName);
    // 批次5(D10): 迁移规则模块复用世界书占位符管线({originalProtagonistSubject}/{openingArchiveText} 等)
    const replaced = ctx.worldbookCtx ? replaceWorldbookPlaceholders(baseReplaced, ctx.worldbookCtx) : baseReplaced;
    // ST 预设兼容：宏预处理（setvar/getvar/if 等）。不传 macroCtx = 旧行为（不处理）。
    const content = ctx.macroCtx ? processMacros(replaced, ctx.macroCtx) : replaced;
    const role = m.role ?? 'system';
    if (role === 'system') {
      systemParts.push(content);
    } else {
      chatMessages.push({
        role,
        content,
        _injectionPosition: m.injectionPosition ?? 0,
        _injectionDepth: m.injectionDepth ?? 4,
        _injectionOrder: m.injectionOrder ?? m.order,
      });
    }
  }
  return {
    systemSection: systemParts.join('\n\n---\n\n'),
    chatModuleMessages: chatMessages,
  };
}

// 结构轮: 基调段构建函数已删除——剧情模式的唯一注入出处是 4 选 1 的剧情模式世界书条目。

function buildMainStoryControlSection(worldState: 世界状态): string {
  // 结构轮(D2)瘦身: 世界观级规则(新闻露出/战斗定位/命途表达/时间戳/编织描述)已归
  // builtin_rule_* 模块与批次3注入头部,此处只保留"数据使用优先级+承接铁则+原著主角配置"。
  const lines: string[] = [];
  lines.push('- 本回合属于主剧情正文，不是开局校准、命途狭间、新闻后台、手机聊天或智库检索回合。');
  lines.push('- 主剧情优先级：玩家本回合输入 > 当前场景与上一回合钩子 > 即时剧情回顾 > 剧情回忆（强回忆优先） > 当前剧情事实 > 剧情编织滑窗（仅作门禁素材） > 智库注入 > 新闻苗头 > 普通背景资料。');
  lines.push('- 若 system 中存在「# 即时剧情回顾」或「【剧情回忆】」，正文必须先承接其中的人物、地点、上一动作、未结问题和强回忆事实；不得假装角色不认识刚刚或过去已见过的人。');
  lines.push('- 如果强回忆或即时剧情回顾显示某 NPC 已与玩家见过、同行、约定或发生冲突，本回合必须沿用该关系状态；除非正文明确失忆/伪装/信息隔离，不得重新写成陌生人初见。');
  lines.push('- 智库人物主体人格优先校准长期口吻与行为边界；NPC 档案主要提供与玩家的关系、称呼、共同经历和临时状态。若两者冲突，不要用 NPC 档案里的旧性格覆盖智库主体人格。');
  lines.push('- 玩家不是星 / 穹，也不是星穹列车既定成员；原著主角信息只作为原著线索和时间锚点，不要覆盖玩家身份。');
  if (worldState.原著主角 === '星穹双主角') {
    lines.push('- 当前原著主角配置为“星穹双主角”：星与穹是两个并列存在的独立个体，主剧情中继续保持分离，不混写成同一人；若镜头暂时只写其中一位，也必须保留另一位的独立存在，不得默认只选星。');
  } else if (worldState.原著主角 === '星') {
    lines.push('- 当前原著主角配置：星。穹不是本周目默认原著主角，不自动登场，不被默认召回为开拓者，除非后续剧情或玩家设定明确引入。');
  } else if (worldState.原著主角 === '穹') {
    lines.push('- 当前原著主角配置：穹。星不是本周目默认原著主角，不自动登场，不被默认召回为开拓者；涉及封存舱、星核载体或原著主角线索时优先写穹。');
  } else if (worldState.原著主角) {
    lines.push(`- 当前原著主角配置：${worldState.原著主角}。另一性别主角不自动登场，除非后续剧情或玩家设定明确引入。`);
  }
  // 开局档案的承接铁则由「# 开局档案（长期锚点）」段（含 D4 精简版）承担,此处不再复述。
  return `# 主剧情运行锚点\n\n${lines.join('\n')}`;
}

function buildOpeningArchiveSection(worldState: 世界状态, isOpeningTurn: boolean): string {
  const archive = worldState.开局档案;
  if (!archive) return '';
  const summary = archive.整理档案;
  // D4(结构轮): 非开局回合降级为摘要——全量档案只在开局回合注入,后续回合保留身份/地点/承接铁则。
  if (!isOpeningTurn) {
    const slim: string[] = [];
    slim.push(`- 开局：${archive.来源 === 'free' ? '自由开局' : archive.来源 === 'workshop' ? '创意工坊' : '官方预设'} / ${archive.地区名称} / ${archive.章节锚点名称}（锚点之前的主线只作既成背景，不得补演）`);
    if (summary?.玩家身份 || summary?.当前目标) slim.push(`- 玩家身份与目标：${[summary?.玩家身份, summary?.当前目标].filter(Boolean).join('；')}`);
    slim.push('- 后续回合必须承接开局档案和当前地点，不能无理由回到默认黑塔空间站开局，也不得把玩家强行拉回导入章节的默认入口。');
    return `# 开局档案（长期锚点）\n\n${slim.join('\n')}`;
  }
  const lines: string[] = [];
  lines.push(`- 当前开局模式：${archive.来源 === 'free' ? '自由开局' : archive.来源 === 'workshop' ? '创意工坊' : '官方预设'}`);
  lines.push(`- 来源：${archive.来源 === 'free' ? '自由开局' : archive.来源 === 'workshop' ? '创意工坊' : '官方预设'}`);
  lines.push(`- 地区：${archive.地区名称}（${archive.地区ID}）`);
  lines.push(`- 章节锚点：${archive.章节锚点名称}（${archive.章节锚点ID}）`);
  lines.push(`- 章节参考性质：${archive.参考性质}。章节只提供背景参考，不硬锁玩家自由设定。`);
  lines.push('- 进度边界：选择的章节锚点就是当前开局起点；锚点之前的主线只作既成背景/资料参考，不得作为正文自动跳转、补演或推进目标。');
  if (archive.章节参考说明) lines.push(`- 章节参考说明：${archive.章节参考说明}`);
  if (archive.玩家介入原文) lines.push(`- 玩家介入原文：${archive.玩家介入原文}`);
  if (archive.来源 !== 'official_preset') {
    lines.push('- 自由开局现实：玩家介入原文和整理档案可以建立原著之外的起始地点、原创事件、原创组织、自定义切入点或平行支线；这些内容若已写入开局档案，必须作为已成立设定承接，不得强行改回原著默认地点。');
  }
  if (archive.官方预设ID) lines.push(`- 官方预设ID：${archive.官方预设ID}`);
  if (archive.创意工坊模板ID) lines.push(`- 创意工坊模板ID：${archive.创意工坊模板ID}`);
  if (summary?.玩家身份) lines.push(`- 玩家身份：${summary.玩家身份}`);
  if (summary?.来到此地原因) lines.push(`- 来到此地原因：${summary.来到此地原因}`);
  if (summary?.当前目标) lines.push(`- 当前目标：${summary.当前目标}`);
  if (summary?.起始情境) lines.push(`- 起始情境：${summary.起始情境}`);
  if (summary?.初始地点参考) lines.push(`- 初始地点参考：${summary.初始地点参考}`);
  if (summary?.关键角色参考?.length) lines.push(`- 关键角色参考：${summary.关键角色参考.join('、')}（只用于背景资料和可能牵引，不代表已认识或当前在场）`);
  if (summary?.已认识角色?.length) lines.push(`- 已认识角色：${summary.已认识角色.join('、')}`);
  if (summary?.初始关系?.length) lines.push(`- 初始关系：${summary.初始关系.join('；')}`);
  if (summary?.叙事倾向?.length) lines.push(`- 叙事倾向：${summary.叙事倾向.join('、')}`);
  if (summary?.特别要求?.length) lines.push(`- 特别要求：${summary.特别要求.join('；')}`);
  if (summary?.冲突协调?.length) lines.push(`- 冲突协调：${summary.冲突协调.join('；')}`);
  if (summary?.关键角色参考?.length || summary?.已认识角色?.length || summary?.初始关系?.length) {
    lines.push('- 人物边界：关键角色参考只代表背景相关人物；已认识角色/初始关系只代表长期关系参考；这些都不代表当前在场，是否入场仍以当前场景、玩家点名和剧情调度为准。');
  }
  if (archive.防回退规则.length) {
    lines.push('- 防回退规则：');
    for (const rule of archive.防回退规则) lines.push(`  · ${rule}`);
  }
  lines.push(
    isOpeningTurn
      ? '- 首回合写法：必须把开局档案视为已经成立的事实，快速建立当前地区氛围、玩家切入点和可接触对象。'
      : '- 后续写法：开局档案持续生效；除非剧情明确转场，不得把玩家强行拉回默认黑塔空间站开局。',
  );
  return `# 开局档案（长期锚点）\n\n${lines.join('\n')}`;
}

function buildCurrentTimeAnchorSection(worldState: 世界状态): string {
  const lines: string[] = [];
  lines.push(`- 纪年法：${worldState.纪年法 || '琥珀纪年'}`);
  lines.push(`- 开拓天数：第 ${Math.max(1, worldState.开拓天数 || 1)} 天`);
  lines.push(`- 当前日期：${worldState.当前日期 || '未设定'}`);
  lines.push(`- 当前时间：${worldState.当前时间 || '未设定'}`);
  lines.push(`- 当前地点：${worldState.当前地点 || '未设定'}`);
  lines.push('');
  lines.push('写正文和 <变量草稿> 前必须先读取本锚点。');
  lines.push('同一日期内，任何时间推进都只能从“当前时间”向后推，不能写早于当前时间的时刻。');
  lines.push('如果剧情确实从当前时间推进到更早的钟点，例如 23:40 后到 00:10，必须在 <变量草稿> 明确写“跨日/次日/一夜过去”，不要只写一个更早的时间。');
  lines.push('没有等待、赶路、休息、睡眠、检修或明确耗时证据时，不要为了气氛改写时间。');
  return `# 当前时间锚点（变量一致性硬约束）\n\n${lines.join('\n')}`;
}

function buildCharacterSection(traveler: 角色数据结构): string {
  const lines: string[] = [];
  lines.push(`你正在叙述的主角：`);
  lines.push(`- 姓名：${traveler.姓名 || '未命名'}${traveler.别名 ? `（${traveler.别名}）` : ''}`);

  const basics = [
    traveler.性别 ? `性别 ${traveler.性别}` : '',
    traveler.年龄 > 0 ? `${traveler.年龄} 岁` : '',
    traveler.生日 ? `生日 ${traveler.生日}` : '',
  ].filter(Boolean);
  if (basics.length) lines.push(`- 基本：${basics.join(' · ')}`);

  if (traveler.外貌) lines.push(`- 外貌：${traveler.外貌}`);
  if (traveler.性格) lines.push(`- 性格：${traveler.性格}`);
  if (traveler.背景) lines.push(`- 背景：${traveler.背景}`);

  // 命途：优先读 命途列表[] 多命途数据；旧字段 traveler.主命途 仅作兜底
  if (traveler.命途列表 && traveler.命途列表.length > 0) {
    const pathLines: string[] = [];
    for (const pp of traveler.命途列表) {
      const def = getPath(pp.id);
      if (!def) continue;
      const stageDef = PATH_STAGE_DEFS.find((s) => s.stage === pp.阶段);
      const stageLabel = stageDef ? `${stageDef.name}（${stageDef.title}）` : `阶段 ${pp.阶段}`;
      const primaryMark = pp.是否主命途 ? '【主】' : '';
      pathLines.push(
        `  · ${primaryMark}${def.name}（${def.aeon}）— ${stageLabel}，进度 ${pp.进度}/100`,
      );
    }
    if (pathLines.length) {
      lines.push(`- 已承载命途：\n${pathLines.join('\n')}`);
      lines.push('- 命途表现只写少量评判、气质和行动倾向，不展开成自动感应、身体本能或直觉化反应。');
    }
  } else if (traveler.主命途) {
    const p = getPath(traveler.主命途);
    if (p) {
      lines.push(`- 命途：${p.name}（${p.aeon}）`);
      lines.push('- 命途表现只写少量评判、气质和行动倾向，不展开成自动感应、身体本能或直觉化反应。');
    }
  }

  if (traveler.能力?.length) {
    lines.push(`- 能力：${traveler.能力.join('、')}`);
  }

  if (traveler.专长知识?.length) {
    lines.push(`- 特长：${traveler.专长知识.join('、')}`);
  }

  return `# 当前角色\n\n${lines.join('\n')}`;
}

function buildOpeningCutInSection(worldState: 世界状态): string {
  const lines: string[] = [];

  if (worldState.原著主角) {
    lines.push(`- 原著主角选择：${worldState.原著主角}`);
  }
  if (worldState.原著主角 === '星穹双主角') {
    lines.push('- 双原著主角提醒：星与穹是两个独立存在的原著主角，不可写成同一人、互相替代或混合性别设定。若开局镜头只聚焦其中一位，另一位也必须作为并列存在的原著线索被保留；涉及封存舱、星核载体或原著主角线索时，不得默认只选星。');
  } else if (worldState.原著主角 === '星') {
    lines.push('- 原著主角门禁：当前为单主角「星」，穹不是本周目默认原著主角；不得召回或表现「穹」为并列原著主角，也不要把开局苏醒场景写成穹的视角。');
  } else if (worldState.原著主角 === '穹') {
    lines.push('- 原著主角门禁：当前为单主角「穹」，星不是本周目默认原著主角；不得召回或表现「星」为并列原著主角。涉及封存舱、星核载体或原著主角线索时优先写穹，开局苏醒场景应以穹的视角和性别推进，不要默认写成星。');
  }
  if (worldState.自定义开局?.trim()) {
    lines.push(`- 切入说明：${worldState.自定义开局.trim()}`);
  }

  if (!lines.length) return '';
  lines.push('- 使用方式：把以上内容视为开局已经成立的私有设定，融入道具、通讯、来历或行动动机中；不要原文复读，也不要当成还需要玩家确认的说明。');
  return `# 开局切入说明\n\n${lines.join('\n')}`;
}

function buildSkillSection(traveler: 角色数据结构): string {
  const skills = (traveler.战技列表 ?? []).filter(
    (skill) => skill.槽位类型 !== 'normal' || (skill.槽位序号 >= 1 && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT),
  );
  const paths = traveler.命途列表 ?? [];

  const lines: string[] = [];
  lines.push(`- 普通战技槽位：${NORMAL_SKILL_SLOT_COUNT} 个，始终保留；该槽位由玩家自制，不再使用内置普通战技预设。`);

  if (paths.length) {
    lines.push('- 命途战技槽位：');
    for (const path of paths) {
      const def = getPath(path.id);
      if (!def) continue;
      const stageDef = PATH_STAGE_DEFS.find((s) => s.stage === path.阶段);
      const slotCount = 计算命途战技槽位数(path.阶段);
      const skillLabels = skills
        .filter((skill) => skill.槽位类型 === 'path' && skill.关联命途 === path.id)
        .sort((a, b) => a.槽位序号 - b.槽位序号)
        .map((skill) => `${skill.槽位序号}. ${skill.名称}`);
      const filled = skillLabels.length ? `，已登记：${skillLabels.join(' / ')}` : '，当前为空';
      lines.push(`  · ${def.name}：${stageDef?.name ?? `阶段 ${path.阶段}`}，${slotCount} 个命途战技槽位${filled}`);
    }
  } else {
    lines.push('- 命途战技槽位：尚未解锁。');
  }

  const enabledSkills = skills.filter((skill) => skill.已启用 !== false);

  if (enabledSkills.length) {
    const normalSkills = skills
      .filter((skill) => skill.槽位类型 === 'normal' && skill.已启用 !== false && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT)
      .sort((a, b) => a.槽位序号 - b.槽位序号)
      .map((skill) => `${skill.槽位序号}. ${skill.名称}`);
    if (normalSkills.length) {
      lines.push(`- 已登记普通自制战技（仅供系统识别，不在正文直呼名称）：${normalSkills.join(' / ')}`);
    }

    lines.push('- 已登记战技详情：');
    for (const skill of enabledSkills.sort((a, b) => {
      if (a.槽位类型 !== b.槽位类型) return a.槽位类型 === 'normal' ? -1 : 1;
      if (a.关联命途 !== b.关联命途) return String(a.关联命途 ?? '').localeCompare(String(b.关联命途 ?? ''));
      return a.槽位序号 - b.槽位序号;
    })) {
      const pathName = skill.关联命途 ? getPath(skill.关联命途)?.name ?? skill.关联命途 : '通用';
      const tags = skill.关键词?.length ? `；关键词：${skill.关键词.join('、')}` : '';
      const cost = skill.消耗 ? `；消耗：${skill.消耗}` : '';
      const cooldown = skill.冷却 ? `；冷却：${skill.冷却}` : '';
      lines.push(`  · ${skill.名称}（${skill.类别}/${pathName}/槽 ${skill.槽位序号}）：${skill.描述}${tags}${cost}${cooldown}`);
    }
  } else {
    lines.push('- 已登记战技：暂无。');
  }

  lines.push('- 使用原则：战技用于剧情正文中的出手方式、效果和命途风格体现，不要求玩家在界面里手动点招式。');
  lines.push('- 正文战斗中不要直呼战技名称，不写「【战技名】」或技能播报；只描写动作效果，例如利用步伐闪避、借身法错开攻击、以短促追击截断敌人。');

  return `# 战技系统\n\n${lines.join('\n')}`;
}

function buildSceneSection(worldState: 世界状态): string {
  const lines: string[] = [];

  if (worldState.起航之地ID) {
    const s = getStartingScenario(worldState.起航之地ID);
    if (s) lines.push(`【起航之地】${s.name}\n${s.description}`);
  }

  const calendarLines: string[] = [];
  calendarLines.push(`纪年法：${worldState.纪年法 || '琥珀纪年'}`);
  calendarLines.push(`开拓天数：第 ${Math.max(1, worldState.开拓天数 || 1)} 天`);
  if (worldState.当前日期) calendarLines.push(`日期：${worldState.当前日期}`);
  if (worldState.当前时间) calendarLines.push(`时间：${worldState.当前时间}`);
  if (worldState.当前地点) calendarLines.push(`地点：${worldState.当前地点}`);
  if (worldState.原著主角) calendarLines.push(`原著主角：${worldState.原著主角}`);
  if (calendarLines.length) {
    lines.push(`【时空坐标】${calendarLines.join(' · ')}`);
  }

  const period = worldState.当前时段;
  if (period && period.id) {
    const npcLine = period.人物.length
      ? `\n\n场内人物：\n${period.人物.map((n) => `- ${n.姓名}：${n.角色}，${n.性格}`).join('\n')}`
      : '';
    lines.push(`【${period.名称}】${period.年代 ? `（${period.年代}）` : ''}${period.描述 ? `\n${period.描述}` : ''}${period.氛围 ? `\n${period.氛围}` : ''}${npcLine}`);
  }

  if (!lines.length) return '';
  return `# 当前场景\n\n${lines.join('\n\n')}`;
}

const RECENT_WORLD_EVENT_PROMPT_LIMIT = 12;

function normalizeWorldEventFingerprint(text: string): string {
  return text
    .replace(/【[^】]{0,24}】/g, '')
    .replace(/[第回合纪要动态世界事件新闻线索：:，,。！？!?、；;\s\-\d]/g, '')
    .toLowerCase()
    .slice(0, 120);
}

function compactWorldEvent(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 160)}...` : cleaned;
}

function buildRecentWorldEventsSection(events: string[]): string {
  if (!events.length) return '';
  const picked: string[] = [];
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0 && picked.length < RECENT_WORLD_EVENT_PROMPT_LIMIT; i -= 1) {
    const event = compactWorldEvent(events[i] ?? '');
    if (!event) continue;
    const fp = normalizeWorldEventFingerprint(event);
    if (fp && seen.has(fp)) continue;
    if (fp) seen.add(fp);
    picked.unshift(event);
  }
  return picked.length ? `# 近期事件\n\n${picked.map((e) => `- ${e}`).join('\n')}` : '';
}

const COMPANION_PROMPT_LIMIT = 12;
const RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW = 15;
const EXTRA_NPC_PROMPT_LIMIT = 8;
const NPC_CONTINUITY_PROMPT_LIMIT = 10;
const NPC_PRESENCE_RECENT_WINDOW = 6;

function normalizeExplicitNpcNames(names?: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

function buildNpcPresenceSection(
  worldState: 世界状态,
  npcRecords?: NPC记录[],
  turnCount = 0,
  userInput = '',
  explicitNpcNames: string[] = [],
): string {
  const sceneNames = (worldState.当前时段?.人物 ?? []).map((npc) => npc.姓名.trim()).filter(Boolean);
  const records = 筛选活跃NPC(npcRecords);
  const explicitNames = normalizeExplicitNpcNames(explicitNpcNames);
  const current = records
    .filter((npc) => npc.同行 || sceneNames.some((name) => name === npc.姓名 || name === npc.别名))
    .map((npc) => npc.姓名);
  const recentCutoff = Math.max(1, turnCount - NPC_PRESENCE_RECENT_WINDOW);
  const nearby = records
    .filter((npc) =>
      !current.includes(npc.姓名) &&
      Number(npc.最近回合 || 0) >= recentCutoff &&
      (npc.阶位 === 'companion' || npc.原著角色 || 提取NPC同行记忆文本列表(npc).length > 0),
    )
    .sort((a, b) => Number(b.最近回合 || 0) - Number(a.最近回合 || 0))
    .slice(0, 8)
    .map((npc) => `${npc.姓名}（最近第${Math.max(1, Number(npc.最近回合 || 1))}回合）`);
  const sceneOnly = sceneNames.filter((name) => !current.some((item) => item === name));
  const anticipated = getAnticipatedNpcNamesForTurn({ world: worldState, userInput });
  if (!current.length && !nearby.length && !sceneOnly.length && !anticipated.length && !explicitNames.length) return '';

  return [
    '# 角色在场状态',
    '',
    `- 当前明确在场/同行：${current.length ? Array.from(new Set(current)).join('、') : '无明确记录'}`,
    `- 近期正文/玩家输入明确人物或预期相关：${explicitNames.length ? explicitNames.join('、') : '无'}`,
    `- 近期相关但不在场：${nearby.length ? nearby.join('、') : '无'}`,
    `- 预期登场/需提前校准：${anticipated.length ? anticipated.join('、') : '无'}`,
    `- 当前场景候选人物：${sceneOnly.length ? sceneOnly.join('、') : '无'}`,
    '- 写作规则：只有“当前明确在场/同行”、玩家本回合明确点名、或即时剧情回顾/最近正文锚点显示仍在当前镜头、通讯、同行链路中的人物，可以自然发言、行动或被智库召回为角色锚点。',
    '- “近期正文/玩家输入明确人物或预期相关”不是自动在场名单；但若即时剧情回顾或最近正文锚点显示他们刚与玩家对话、行动、委托、冲突或同行，正文必须承接这段关系与刚发生的事实，禁止写成完全陌生、初次见面或突然遗忘。',
    '- “预期登场/需提前校准”的人物允许智库提前召回口吻和人格，用于他们即将入场、广播、通讯或被他人提及时不 OOC；但在正文里仍要通过合理镜头让其入场，不得凭空站到当前地点。',
    '- “近期相关但不在场”的人物只能通过回忆、通讯、旁人提及或后续登场铺垫出现，不得凭空站到当前镜头里。',
    '- “当前场景候选人物”只代表地点可能相关，不等于本人已在场；例如地点叫黑塔空间站时，不得自动让黑塔本人出场或召回黑塔人格，除非正文/玩家输入明确出现黑塔或人偶黑塔。',
    worldState.原著主角 === '星'
      ? '- 原著主角门禁：当前为单主角“星”，智库与正文不得同时召回或表现“穹”为并列原著主角。'
      : worldState.原著主角 === '穹'
        ? '- 原著主角门禁：当前为单主角“穹”，智库与正文不得同时召回或表现“星”为并列原著主角；涉及原著主角线索时不得默认落到“星”。'
        : worldState.原著主角 === '星穹双主角'
          ? '- 原著主角门禁：当前为“星穹双主角”，星与穹都存在且彼此独立；若本回合只表现其中一人，也不得把另一人从设定中抹除或默认只剩星。'
        : '',
  ].join('\n');
}

function buildNpcLedgerContinuitySection(selection: NPC账本选择结果): string {
  if (!selection.selected.length) return '';
  return [
    '# 本回合 NPC 关系与记忆强制承接',
    '',
    '以下 NPC 账本属于当前状态事实，不是普通背景资料。若这些 NPC 本回合出场、通讯、被玩家点名或由当前镜头自然牵引，正文必须承接其关系、记忆、承诺、冲突和最近互动。',
    '- 禁止把已认识、已同行、已承诺、已冲突或已有私有记忆的 NPC 写成初识、陌生、无共同经历。',
    '- 来源为“手机”的同行记忆代表玩家与该 NPC 已有私下通讯热度；若该 NPC 当前在场、被玩家点名或自然入场，正文应承接手机里聊出的熟悉度、情绪余温、称呼和未尽话题，不要写成不温不火的陌生寒暄。',
    '- 若要表现 NPC 不记得或装作不认识，正文必须给出明确原因：失忆、伪装、通讯隔离、误认、被迫演戏、时间线重置或认知污染。',
    '- 账本相关不等于自动在场；不在当前镜头的人只能通过通讯、回忆、旁人提及或后续合理入场承接。',
    '',
    ...selection.selected.map(formatNpcLedgerForPrompt),
  ].join('\n');
}

function buildNpcContinuitySection(
  worldState: 世界状态,
  npcRecords?: NPC记录[],
  turnCount = 0,
  explicitNpcNames: string[] = [],
): string {
  const records = 筛选活跃NPC(npcRecords);
  const explicitNames = normalizeExplicitNpcNames(explicitNpcNames);
  const recentCutoff = Math.max(1, turnCount - RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW);
  const sceneNames = new Set((worldState.当前时段?.人物 ?? []).map((n) => n.姓名.trim()).filter(Boolean));
  const currentLocation = worldState.当前地点?.trim();

  const candidates = records
    .map((npc) => {
      const memories = 提取NPC同行记忆文本列表(npc);
      const isRecent = Number(npc.最近回合 || 0) >= recentCutoff;
      const isExplicit = explicitNames.some((name) => name === npc.姓名 || name === npc.别名);
      const isSceneNpc = sceneNames.has(npc.姓名) || Boolean(npc.别名 && sceneNames.has(npc.别名));
      const hasContinuity =
        npc.同行 ||
        isRecent ||
        isExplicit ||
        isSceneNpc ||
        memories.length > 0 ||
        npc.关系 !== 'stranger' ||
        npc.亲密关系 ||
        npc.好感度 !== 0;
      if (!hasContinuity) return null;
      const score =
        (isExplicit ? 120 : 0) +
        (isSceneNpc ? 100 : 0) +
        (npc.同行 ? 80 : 0) +
        (isRecent ? 50 : 0) +
        Math.min(memories.length, 6) * 8 +
        (npc.关系 !== 'stranger' || npc.亲密关系 ? 12 : 0) +
        Math.min(Math.abs(npc.好感度), 20);
      return { npc, memories, isRecent, isSceneNpc, score };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score || Number(b.npc.最近回合 || 0) - Number(a.npc.最近回合 || 0))
    .slice(0, NPC_CONTINUITY_PROMPT_LIMIT);

  const representedNames = new Set<string>();
  for (const { npc } of candidates) {
    representedNames.add(npc.姓名);
    if (npc.别名) representedNames.add(npc.别名);
  }
  const fallbackNames = explicitNames
    .filter((name) => !representedNames.has(name))
    .slice(0, Math.max(0, NPC_CONTINUITY_PROMPT_LIMIT - candidates.length));

  if (!candidates.length && !fallbackNames.length) return '';

  const lines: string[] = [
    '# 本回合人物关系连续性核对',
    '',
    '这段是正文生成前必须读取的关系状态表。凡是下列人物在本回合出场、被玩家提到、或由当前场景自然牵引出现，都必须沿用既有关系和共同经历。',
    '- 若人物已见过玩家、委托过玩家、共同作战、同行、通信、产生承诺或冲突，正文禁止写成初次见面、禁止重新自我介绍、禁止问“你是谁/为什么来”这类陌生人模板。',
    '- 可以因为职责、危机、信息差而质疑玩家，但质疑必须建立在既有关系上，例如“任务结果如何”“为什么只回来两人”“你们刚才遭遇了什么”，而不是抹掉前文。',
    '- 若要表现 NPC 不记得或装作不认识，正文必须给出明确原因：失忆、伪装、通讯隔离、误认、被迫演戏或认知污染；否则视为错误。',
  ];
  if (currentLocation) lines.push(`- 当前地点：${currentLocation}。人物回应必须同时承接当前地点和之前任务链。`);

  lines.push('', '关系表：');
  for (const { npc, memories, isRecent, isSceneNpc } of candidates) {
    const tags = [
      格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
      npc.同行 ? '同行中' : '',
      isSceneNpc ? '当前场景人物' : '',
      isRecent ? '近期见过' : '',
      npc.原著角色 ? '原著角色' : '',
    ].filter(Boolean);
    const turnLine = `初见第${Math.max(1, Number(npc.初见回合 || 1))}回合，最近第${Math.max(1, Number(npc.最近回合 || npc.初见回合 || 1))}回合`;
    const memoryLine = memories.length ? `；最近共同经历：${memories.slice(-3).join('；')}` : '';
    const phoneMemoryLine = buildRecentPhoneMemoryLine(npc);
    const introLine = npc.职务 || npc.介绍 ? `；身份/职责：${[npc.职务, npc.介绍].filter(Boolean).join('；')}` : '';
    lines.push(`- ${npc.姓名}${npc.别名 ? `（${npc.别名}）` : ''}｜${tags.join(' · ')}｜好感${npc.好感度 > 0 ? '+' : ''}${npc.好感度}｜${turnLine}${introLine}${memoryLine}${phoneMemoryLine}`);
  }

  for (const name of fallbackNames) {
    lines.push(`- ${name}｜近期正文/玩家输入明确出现或预期相关｜档案尚未落库｜必须读取即时剧情回顾和最近正文锚点；若其中显示其刚发生对话、动作、委托、冲突或同行状态，正文必须承接，禁止写成完全陌生、初次见面或无记忆。`);
  }

  return lines.join('\n');
}

// 已知伙伴注入：按相关度过滤（同行 > 近回合见过 > 有记忆/好感 > 高好感），避免刚见过的人过早掉出上下文。
// 路人（tier='extra'）只注入近期或已有可承接关系/记忆的少量对象，避免上下文爆炸。
function buildCompanionsSection(npcRecords?: NPC记录[], turnCount = 0, settings?: 游戏设置): string {
  const records = 筛选活跃NPC(npcRecords);
  if (records.length === 0) return '';
  const companions = records.filter((n) => n.阶位 === 'companion');
  const recentCutoff = Math.max(1, turnCount - RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW);
  const recentExtras = records
    .filter((n) => {
      if (n.阶位 !== 'extra') return false;
      const memoryCount = 提取NPC同行记忆文本列表(n).length;
      return Number(n.最近回合 || 0) >= recentCutoff || memoryCount > 0 || n.好感度 !== 0 || n.关系 !== 'stranger';
    })
    .sort((a, b) => {
      const recentDiff = Number(b.最近回合 || 0) - Number(a.最近回合 || 0);
      if (recentDiff !== 0) return recentDiff;
      const memoryDiff = 提取NPC同行记忆文本列表(b).length - 提取NPC同行记忆文本列表(a).length;
      if (memoryDiff !== 0) return memoryDiff;
      return Math.abs(b.好感度) - Math.abs(a.好感度);
    });
  if (companions.length === 0 && recentExtras.length === 0) return '';

  const sorted = [...companions].sort((a, b) => {
    if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
    const recentDiff = Number(b.最近回合 || 0) - Number(a.最近回合 || 0);
    const aIsRecent = Number(a.最近回合 || 0) >= recentCutoff;
    const bIsRecent = Number(b.最近回合 || 0) >= recentCutoff;
    if (aIsRecent !== bIsRecent) return aIsRecent ? -1 : 1;
    const affDiff = Math.abs(b.好感度) - Math.abs(a.好感度);
    if (affDiff !== 0) return affDiff;
    return recentDiff;
  });

  const formatNpc = (n: NPC记录) => {
    const tags: string[] = [格式化NPC关系(n.好感度, Boolean(n.亲密关系))];
    if (n.同行) tags.push('同行中');
    if (n.原著角色) tags.push('原著角色');
    const desc: string[] = [];
    if (n.对玩家称呼) desc.push(`称呼：${n.对玩家称呼}`);
    if (n.职务) desc.push(`职务：${n.职务}`);
    if (n.外貌) desc.push(`外貌：${n.外貌}`);
    if (n.穿着) desc.push(`穿着：${n.穿着}`);
    if (n.说话方式) desc.push(`说话方式：${n.说话方式}`);
    if (n.性格 && !n.原著角色) desc.push(`性格：${n.性格}`);
    if (n.性格 && n.原著角色) desc.push(`临时/旧档案性格参考：${n.性格}（只作状态线索，长期人格以智库人物主体资料为准）`);
    if (n.介绍) desc.push(`介绍：${n.介绍}`);
    if (n.原著角色 && (n.说话方式 || n.性格)) {
      desc.push('表现要求：本回合若该角色在场或被自然牵引出场，必须体现说话方式和主体人格；不要连续数回合只沉默旁观。');
    }
    // 对标参考项目：重要角色（原著/同行）保留最近 N 条关键记忆（重要角色关键记忆条数N，默认 20），普通 NPC 最近 5 条。
    const 重要角色记忆条数 = Math.max(1, Math.trunc(settings?.记忆系统?.重要角色关键记忆条数N ?? 20) || 20);
    const nonPhoneMemories = (n.同行记忆 ?? [])
      .filter((item): item is NPC同行记忆条目 => typeof item !== 'string' && item?.来源 !== '手机')
      .map((item) => 清理NPC同行记忆摘要(item?.摘要 ?? ''))
      .filter((text): text is string => Boolean(text))
      .slice(-(n.阶位 === 'companion' || n.原著角色 ? 重要角色记忆条数 : 5));
    if (nonPhoneMemories.length) desc.push(`同行记忆：${nonPhoneMemories.join('；')}`);
    const phoneMemories = getRecentPhoneMemoryTexts(n).slice(-2);
    if (phoneMemories.length) desc.push(`最近手机私聊：${phoneMemories.join('；')}（正文若该角色入场，必须承接私聊热度与未尽话题）`);
    const descPart = desc.length ? `\n  ${desc.join('；')}` : '';
    return `- ${n.姓名}${n.别名 ? `（${n.别名}）` : ''}｜${tags.join(' · ')}｜好感${n.好感度 > 0 ? '+' : ''}${n.好感度}${descPart}`;
  };

  const lines: string[] = [];
  if (sorted.length > 0) {
    lines.push(...sorted.slice(0, COMPANION_PROMPT_LIMIT).map(formatNpc));
  }
  if (recentExtras.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('最近遇见的路人：');
    lines.push(...recentExtras.slice(0, EXTRA_NPC_PROMPT_LIMIT).map(formatNpc));
  }
  return `# 已知伙伴与路人\n\n${lines.join('\n')}`;
}
// 背包注入：按 category 分桶，每桶最多取 3 件；总数控制在前 10 件，避免上下文膨胀。
// 末尾附 物品获取协议:教 AI 用 push 旅人.背包 = {...} 把剧情中提到的物品落地到背包。
function buildInventorySection(traveler: 角色数据结构): string {
  const inventory = traveler.背包 ?? [];
  const buckets = new Map<string, 背包物品[]>();
  for (const item of inventory) {
    const arr = buckets.get(item.类别) ?? [];
    arr.push(item);
    buckets.set(item.类别, arr);
  }

  const blocks: string[] = [];
  let total = 0;
  for (const [cat, items] of buckets) {
    if (total >= 10) break;
    const slice = items.slice(0, Math.min(3, 10 - total));
    total += slice.length;
    const names = slice.map((it) => `${it.名称}×${it.数量}(${it.品质})`).join('、');
    blocks.push(`- ${ITEM_CATEGORY_LABELS[cat as keyof typeof ITEM_CATEGORY_LABELS]}：${names}`);
  }

  const overview = inventory.length === 0
    ? '- (空)'
    : blocks.join('\n');

  const protocol = [
    '',
    '## 物品获取协议',
    '剧情中旅人获得任何物品(食物、消耗品、光锥、武器、纪念物、关键道具)都要用变量命令落地到背包,',
    '不要只在叙述里提及而不入库。格式:',
    '`push 旅人.背包 = {"类别":"food","名称":"星穹面包","数量":2,"品质":"蓝","描述":"...","使用效果":[{"目标属性":"恢复体力","数值":1}]}`',
    '- 类别 取值:food / consumable / lightcone / weapon / clothing / accessory / memento / key',
    '- 品质 取值:蓝 / 紫 / 金(对应原作 3/4/5 星)',
    '- 同名同类的可堆叠物品会自动合并数量,直接 push 即可,不要手动加数量。',
    '- lightcone / weapon / clothing / accessory 现在只作为背包物品类别,不再建立穿戴槽位或已穿戴状态。',
    '- 叙事效果 使用字符串数组,例如 `["近身防卫","破解终端时更稳定"]`。物品不再生成数值属性加成。',
    '- 属性加成 是旧字段,不要再主动生成；已有旧物品里出现时只当兼容数据。',
    '- 使用效果 才是对象数组,例如 `[{"目标属性":"恢复体力","数值":1}]`,只用在 food / consumable 上；它只作为叙事提示，不修改旧战斗数值。',
  ].join('\n');

  return `# 背包概览\n\n${overview}\n${protocol}`;
}

// 剧情注入：当前 active 节点 + 最近 3 个 completed 节点 + active 节点的 AI引导。
function buildPlotSection(plotNodes?: 剧情节点[]): string {
  if (!plotNodes || plotNodes.length === 0) return '';
  const active = plotNodes.filter((n) => n.状态 === 'active');
  const recentCompleted = plotNodes
    .filter((n) => n.状态 === 'completed')
    .sort((a, b) => b.更新回合 - a.更新回合)
    .slice(0, 3);
  if (active.length === 0 && recentCompleted.length === 0) return '';

  const lines: string[] = [];
  if (active.length) {
    lines.push('- 进行中节点：');
    for (const n of active) {
      lines.push(`  · ${n.标题}（${PLOT_STATUS_LABELS[n.状态]}）${n.摘要 ? ` — ${n.摘要}` : ''}`);
      if (n.AI引导) lines.push(`    引导：${n.AI引导}`);
    }
  }
  if (recentCompleted.length) {
    lines.push('- 近期完成节点：');
    for (const n of recentCompleted) {
      lines.push(`  · ${n.标题}${n.摘要 ? ` — ${n.摘要}` : ''}`);
    }
  }
  return `# 主线进度\n\n${lines.join('\n')}`;
}

// 新闻注入：最近 5 条标题摘要（带分类标签），按 turn 倒序。
function buildNewsSection(news?: 新闻条目[]): string {
  if (!news || news.length === 0) return '';
  const recent = [...news].sort((a, b) => b.回合 - a.回合).slice(0, 5);
  const lines = recent.map(
    (n) => `- [${NEWS_CATEGORY_LABELS[n.类目]} · 第 ${n.回合} 回] ${n.标题}`,
  );
  return `# 近期新闻\n\n${lines.join('\n')}`;
}

function getRecentPhoneMemoryTexts(npc: NPC记录): string[] {
  return (npc.同行记忆 ?? [])
    .filter((item): item is NPC同行记忆条目 => typeof item !== 'string' && item?.来源 === '手机')
    .map((item) => item.摘要?.trim())
    .filter((text): text is string => Boolean(text));
}

function buildRecentPhoneMemoryLine(npc: NPC记录): string {
  const phoneMemories = getRecentPhoneMemoryTexts(npc).slice(-2);
  return phoneMemories.length ? `；最近手机私聊：${phoneMemories.join('；')}` : '';
}

/**
 * 阶段1方案E·全知性防护（第三层）：通讯对方在场判断 + 提示词约束
 *
 * 注入通讯回忆时，检查通讯对方是否在场：
 * - 在场 → 该NPC可以承接手机里的熟悉度/未尽话题
 * - 不在场 → 其他在场NPC不应知道（走提示词约束）
 *
 * 仅当本回合召回结果中存在分类='通讯'的条目时才注入约束块，避免无通讯回忆时的噪声。
 */
function buildYitingOmniscienceGuard(
  recalledEntries: 回忆条目[],
  presentNpcIds: Set<string>,
  npcNameMap: Record<string, string>,
): string {
  // 从召回结果中找出通讯回忆，提取对方id
  const phoneEntries = recalledEntries.filter(
    (entry) => entry.分类 === '通讯' && entry.通讯元数据?.联系人,
  );
  if (!phoneEntries.length) return '';

  // 区分在场和不在场的通讯对方
  const presentContacts = new Set<string>();
  const absentContacts = new Set<string>();
  for (const entry of phoneEntries) {
    const contactId = entry.通讯元数据!.联系人;
    const contactName = npcNameMap[contactId] ?? contactId;
    if (presentNpcIds.has(contactId)) {
      presentContacts.add(contactName);
    } else {
      absentContacts.add(contactName);
    }
  }

  const lines: string[] = [];
  lines.push('# 全知性防护｜通讯回忆约束');
  lines.push('');
  lines.push('上方【通讯回忆】(对方:X) 标记的内容，是玩家与X在手机私聊/群聊中发生的事，属于私密通讯。');
  lines.push('');
  lines.push('约束：');
  lines.push('1. 当前在场的NPC（除通讯对方本人外）不应"知道"通讯内容，除非：');
  lines.push('   - 通讯对方本人在场（可以承接手机里建立的熟悉度、未尽话题、约定）');
  lines.push('   - 玩家在正文里当面告知了其他NPC');
  lines.push('   - 剧情里有合理的传播途径（如对方转述、群聊公开、消息泄露等）');
  lines.push('2. 其他在场NPC的反应、态度、台词不应暴露通讯细节。');
  lines.push('3. 如果通讯对方不在场，正文应像"NPC不知道手机里聊过什么"那样自然推进。');

  if (presentContacts.size) {
    lines.push('');
    lines.push(`本回合在场的通讯对方：${[...presentContacts].join('、')} —— 这位可以承接手机里的熟悉度与未尽话题。`);
  }
  if (absentContacts.size) {
    lines.push('');
    lines.push(`本回合不在场的通讯对方：${[...absentContacts].join('、')} —— 其他在场NPC不应知道与这位的通讯内容。`);
  }

  return lines.join('\n');
}

function buildPhoneSection(phone?: 手机系统): string {
  if (!phone) return '';
  // 阶段1方案E：手机 compressedSummaries 不再直接注入正文
  // 手机内容通过代码强制双写进入忆庭(分类='通讯')和NPC同行记忆(来源='手机')
  // 由 recall(全局) + NPC账本(个人) 注入，此处只保留待处理来信注入（通知层面）
  const pendingSeeds = phone.messageSeeds
    .filter((seed) => seed.status === 'pending')
    .slice(-5);
  if (!pendingSeeds.length) return '';

  const lines: string[] = [];
  lines.push('# 手机通讯摘要');
  lines.push('');
  lines.push('- 这里是手机系统待处理来信的通知。已压缩的通讯事实通过忆庭回忆和NPC账本注入，不在此处重复。');
  lines.push('- 主剧情可以承接待处理来信的提示，但不要代替玩家在手机里回复，也不要把手机聊天改写成正文大段复述。');
  lines.push('');
  lines.push('## 待处理来信');
  for (const seed of pendingSeeds) {
    lines.push(`- [${seed.priority}] ${seed.title}：${seed.context}`);
  }
  return lines.join('\n');
}

// ── 命途狭间状态注入 ──
// 三态:
// 1. 旅人某条命途 待升阶=true 且 世界.待触发狭间/进行中狭间 均为空 → 告知 AI 时机已熟,
//    可在合适节奏自发发出 <触发狭间 path="xxx"/> 标签。
// 2. 世界.待触发狭间 = pathId → 邀请已发,等玩家点「踏入」,本回合不再重发,也不要在正文里描写已踏入虚境。
// 3. 世界.进行中狭间 = pathId → 玩家已踏入,本回合走 pathAwakening CoT(已经由 scope 切换处理),
//    根据 awakeningPhase 进一步区分出题回合 / 评判回合,提示不同。
function buildPathAwakeningSection(
  traveler: 角色数据结构,
  worldState: 世界状态,
  awakeningPhase?: 命途狭间阶段,
): string {
  // 进行中:最高优先级
  if (worldState.进行中狭间) {
    const pathId = worldState.进行中狭间;
    const def = getPath(pathId);
    const belief = PATH_CORE_BELIEFS[pathId];
    const record = (traveler.命途列表 ?? []).find((p) => p.id === pathId);
    if (!def || !belief) return '';
    const stageDef = record ? PATH_STAGE_DEFS.find((s) => s.stage === record.阶段) : undefined;
    const nextStageDef = record ? PATH_STAGE_DEFS[record.阶段 + 1] : undefined;
    const stageLabel = stageDef ? `${stageDef.name} → 待升 ${nextStageDef?.name ?? '未知'}` : '未知';

    // 评判回合:玩家已答完三题,这回合 AI 必须落判
    if (awakeningPhase === 'judgement') {
      const lines: string[] = [];
      lines.push(`本回合是「命途狭间·回应回合」。玩家上一轮已经针对命途之声提出的三道诘问给出了答案,你的任务是:`);
      lines.push('');
      lines.push('## 必须做的三件事(缺一不可)');
      lines.push('1. **先确认道路**:你**必须**输出顶层 <thinking> 标签,在里面用中文按 Step0~Step3 编号格式总结:玩家三个答案分别显露了怎样的执念、犹疑与取舍,最终如何凝成一句道路确认。命途狭间没有失败、滞留或退转,结论固定为升阶。**漏掉 <thinking> 会让调试面板缺少内容,影响排查**。');
      lines.push('2. **写正文**:用 2-4 段叙事完成两件事——');
      lines.push('   a) 命途意志对玩家答案的回应:不是判对错,而是把玩家说出的道路确认下来。若答案矛盾,写成带着裂痕仍向前。');
      lines.push('   b) 把旅人从虚境拉回现实场景(原本的物理环境、未完的事件)。结尾可以承接玩家下一步行动。');
      if (record?.阶段 === 3) {
        lines.push('   c) 本次是「伪令使 → 令使」:必须描写星神的身影/轮廓在狭间天穹出现,星神投下目光完成确认。星神不长篇对话,不降格成普通 NPC。');
      }
      lines.push('3. **必输标签**:在所有其他标签**之外**,**单独**写一行顶层标签:');
      lines.push('   `<狭间评判>升阶</狭间评判>`');
      lines.push('   ⚠ **本回合如果不输出 <狭间评判> 标签,系统将无法落地命途阶段变化,玩家会停留在狭间状态——这是必须避免的错误**。');
      lines.push('');
      lines.push('## 升阶原则(再次明确)');
      lines.push('- 进入命途狭间即代表本次升阶已经成立。');
      lines.push('- 三问只是让玩家明确自己的道路,不是考试。');
      lines.push('- 不允许输出滞留、退转、失败、惩罚或拒绝升阶。');
      lines.push('');
      lines.push('## 受问的命途');
      lines.push(`- 命途:${def.name}(${def.aeon})`);
      lines.push(`- 当前阶段:${stageLabel}`);
      lines.push(`- 核心理念:${belief.核心}`);
      lines.push('');
      lines.push('## 本回合**禁止**输出的标签');
      lines.push('- <狭间问答>(只在出题回合写,评判回合不重复)');
      lines.push('- <行动选项>(由你叙事自然引出下一拍即可,不强行列选项)');
      lines.push('- <变量更新>(命途阶段变化由前端在收到 <狭间评判> 后调 应用狭间结果 落地,不要走变量命令)');
      return `# 命途狭间·评判回合\n\n${lines.join('\n')}`;
    }

    // 出题回合(默认):玩家刚踏入,本回合 AI 出 3 题
    const lines: string[] = [];
    lines.push(`本回合进入「命途狭间·出题回合」。旅人某条命途已积满,意志被命途意志拉入虚境受问,**不要推进主剧情、不要描写实景动作、不要输出 <行动选项>**。`);
    lines.push('');
    lines.push(`## 必输 <thinking>(漏掉会让调试面板缺少内容,影响排查)`);
    lines.push('在顶层 <thinking> 标签里按「命途狭间思维链」的 Awakening-Step0~Step5 编号格式完整推演,每步独占一行、至少 2 条要点。不允许跳过、不允许写"已思考"敷衍。');
    lines.push('');
    lines.push(`## 受问的命途`);
    lines.push(`- 命途:${def.name}(${def.aeon})`);
    lines.push(`- 当前阶段:${stageLabel}`);
    lines.push(`- 觉醒于:${record?.觉醒于 || '未知'}`);
    lines.push(`- 核心理念:${belief.核心}`);
    lines.push('');
    lines.push(`## 出题素材(围绕这三条拷问,结合旅人具体经历加工成两难选择题,见命途狭间 CoT)`);
    belief.拷问.forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`);
    });
    lines.push('');
    lines.push(`## 本回合**必须**输出顶层标签 <狭间问答>`);
    lines.push('块内每行一条:');
    lines.push('  命途: <命途中文名>');
    lines.push('  题1: <第一道题的完整文本>');
    lines.push('  题2: <第二道题的完整文本>');
    lines.push('  题3: <第三道题的完整文本>');
    lines.push('');
    lines.push('## 本回合**禁止**输出的标签');
    lines.push('- <狭间评判>(留到玩家答完之后的回合)');
    lines.push('- <行动选项> / <变量更新>');
    return `# 命途狭间·出题回合\n\n${lines.join('\n')}`;
  }

  // 待触发:邀请已发出
  if (worldState.待触发狭间) {
    const pathId = worldState.待触发狭间;
    const def = getPath(pathId);
    if (!def) return '';
    return `# 命途狭间·待玩家踏入

旅人的「${def.name}」命途已发出狭间邀请,正等待玩家在 UI 上点击「踏入」。本回合**不要重复发邀请、不要描写已进入虚境**;正常推进主剧情即可,可以让 NPC / 环境对那种"心头沉默的召唤"有一两笔旁观式描写,但旅人尚未真正踏入。`;
  }

  // 待升阶:鼓励 AI 在合适节奏发出邀请
  const readyPaths = (traveler.命途列表 ?? []).filter((p) => p.待升阶);
  if (readyPaths.length > 0) {
    const lines: string[] = [];
    lines.push(`旅人有 ${readyPaths.length} 条命途进度已积满,处于「待升阶」状态。若本回合剧情节奏合适(战后独处、夜深沉思、回望来路、价值抉择前夕之类),可主动发出邀请:`);
    lines.push('');
    lines.push('在所有标签之外**单独**写一行顶层标签:`<触发狭间>命途ID</触发狭间>`(把命途ID替换为待升阶命途的英文ID,例如 hunt / destruction / preservation 等),系统会渲染一张「命途狭间之引」邀请卡片让玩家选择是否踏入。');
    lines.push('');
    lines.push('已积满的命途:');
    for (const p of readyPaths) {
      const def = getPath(p.id);
      if (!def) continue;
      const stageDef = PATH_STAGE_DEFS.find((s) => s.stage === p.阶段);
      lines.push(`- ${def.name}（id=${p.id}）:当前 ${stageDef?.name ?? '阶段 ' + p.阶段},满进度等待狭间问答`);
    }
    lines.push('');
    lines.push(`**禁止在战斗中 / 高紧张谈判 / 危险逃亡场景发出邀请**——狭间是精神虚境,需要旅人有一刻"能停下来面对自己"的空隙。一回合至多发出一条邀请。`);
    return `# 命途狭间·时机判定\n\n${lines.join('\n')}`;
  }

  return '';
}
