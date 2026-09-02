import { selectNpcLedgersForTurn } from '@/models/npc';
import {
  resolvePromptWorldbookPlan,
  renderWorldbookSystemEntry,
  type FilterContext,
  type WorldbookInjectionPlan,
} from '@/utils/worldbook';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { retrieveYitingContext } from '@/services/yitingRetrieval';
import { buildStoryWeavingInjection } from '@/services/storyWeaving';
import {
  assemblePromptChunks,
  injectBucket,
  makeModuleCtx,
  type BuiltSystemPrompt,
  type ChatModuleMessage,
  type SystemPromptInput,
  type 命途狭间阶段,
} from './promptAssembly';
import { buildPathAwakeningMainHookSection, buildPathAwakeningSystemPrompt } from './pathAwakeningPromptBuilder';
import {
  buildCharacterSection,
  buildCompanionsSection,
  buildCotLanguageSection,
  buildCurrentTimeAnchorSection,
  buildExtraRequirementSection,
  buildInnerVoiceSection,
  buildInventorySection,
  buildMainStoryControlSection,
  buildNewsSection,
  buildNpcContinuitySection,
  buildNpcLedgerContinuitySection,
  buildNpcPresenceSection,
  buildOpeningArchiveSection,
  buildOpeningCutInSection,
  buildPhoneSection,
  buildRecentWorldEventsSection,
  buildSceneSection,
  buildSkillSection,
  buildStoryArrangementSection,
  buildStyleAssistantSection,
  buildWeatherSection,
  buildWordCountSection,
  splitLayeredMemory,
} from './systemPromptSections';

export type { BuiltSystemPrompt, ChatModuleMessage, SystemPromptInput, 命途狭间阶段 };
export { assemblePromptChunks, injectBucket, makeModuleCtx } from './promptAssembly';
export { buildPathAwakeningSystemPrompt } from './pathAwakeningPromptBuilder';

function resolvePlan(input: Omit<SystemPromptInput, 'worldbookPlan'> & { worldbookPlan?: WorldbookInjectionPlan | null }): WorldbookInjectionPlan | null {
  return resolvePromptWorldbookPlan(
    input.worldbooks,
    input.worldbookCtx,
    input.settings.enableWorldbookInjection,
  );
}

function renderPlanGroup(
  items: WorldbookInjectionPlan['alwaysEntries'],
  ctx: FilterContext | undefined,
  category: '世界书' | '提示词',
): string {
  if (!ctx || !items.length) return '';
  return items.map((item) => renderWorldbookSystemEntry(item, ctx, category)).join('\n\n---\n\n');
}

export function buildSystemPrompt(input: SystemPromptInput): BuiltSystemPrompt {
  if (input.scope === 'pathAwakening' || input.world.进行中狭间) {
    return buildPathAwakeningSystemPrompt({ ...input, scope: 'pathAwakening' });
  }
  if (input.scope === 'opening') {
    return buildOpeningSystemPrompt(input);
  }

  const ctx = makeModuleCtx(input, 'main');
  const plan = input.worldbookPlan;
  const identity = injectBucket(input.modules, ctx, 'identity');
  const rules = injectBucket(input.modules, ctx, 'rules');
  const params = injectBucket(input.modules, ctx, 'params');
  const protocol = injectBucket(input.modules, ctx, 'protocol');
  ctx.chat.push(
    ...identity.chatModuleMessages,
    ...rules.chatModuleMessages,
    ...params.chatModuleMessages,
    ...protocol.chatModuleMessages,
  );
  if (plan) ctx.chat.push(...plan.depthMessages);

  // 阶段1：忆庭命中不再互斥暂停普通记忆注入，两套并存互补
  const memory = input.settings.enableMemoryInjection && input.memory
    ? splitLayeredMemory(input.memory)
    : { long: '', middle: '', short: '' };

  const npcLedger = input.npcLedgerSelection ?? selectNpcLedgersForTurn({
    records: input.npcRecords,
    turnCount: input.turnCount,
    explicitNames: input.worldbookCtx?.npcNames,
    sceneNames: input.world.当前时段.人物.map((npc) => npc.姓名),
    recalledNames: input.worldbookCtx?.npcNames,
  });

  let yitingSection = '';
  if (input.yitingInjectionOverride !== undefined) {
    yitingSection = input.yitingInjectionOverride.trim();
  } else if (
    input.settings.记忆系统.忆庭启用
    && input.yiting
    && input.worldbookCtx?.recentUserInput
    && input.worldbookCtx.turnCount > input.settings.记忆系统.忆庭召回最早触发回合
  ) {
    const hit = retrieveYitingContext(input.yiting, input.worldbookCtx.recentUserInput, input.settings.记忆系统.忆庭召回条数);
    yitingSection = hit.injection;
  }

  let zhikuSection = '';
  if (input.zhikuInjectionOverride !== undefined) {
    zhikuSection = input.zhikuInjectionOverride.trim();
  } else if (input.settings.智库系统.enabled && input.zhiku && input.worldbookCtx?.recentUserInput) {
    const hit = retrieveZhikuContext(
      input.zhiku,
      input.worldbookCtx.recentUserInput,
      input.settings.智库系统.maxRelatedEntries,
      input.worldbookCtx,
    );
    zhikuSection = hit.injection;
  }

  const weaving = input.settings.剧情编织系统.enabled && input.settings.剧情编织系统.currentWindow
    ? buildStoryWeavingInjection(input.storyWeaving, input.worldbookCtx)
    : '';

  return assemblePromptChunks([
    identity.systemSection,
    renderPlanGroup(plan?.alwaysEntries ?? [], input.worldbookCtx, '世界书'),
    buildOpeningArchiveSection(input.world, false),
    rules.systemSection,
    renderPlanGroup(plan?.systemRuleEntries ?? [], input.worldbookCtx, '提示词'),
    params.systemSection,
    buildWordCountSection(input.settings),
    buildInnerVoiceSection(input.settings),
    buildCotLanguageSection(input.settings, 'main'),
    buildCharacterSection(input.traveler),
    buildSkillSection(input.traveler),
    buildInventorySection(input.traveler),
    memory.long,
    memory.middle,
    buildStoryArrangementSection(input.plotNodes, input.storyPlanSnippets),
    weaving,
    buildCurrentTimeAnchorSection(input.world),
    buildSceneSection(input.world),
    buildWeatherSection(input.world),
    buildPathAwakeningMainHookSection(input.traveler, input.world),
    buildRecentWorldEventsSection(input.world.全局事件),
    buildNewsSection(input.news),
    buildPhoneSection(input.phone),
    buildNpcPresenceSection(input.world, input.npcRecords, input.turnCount, input.worldbookCtx?.recentUserInput, input.worldbookCtx?.npcNames),
    buildNpcLedgerContinuitySection(npcLedger),
    buildNpcContinuitySection(input.world, input.npcRecords, input.turnCount, input.worldbookCtx?.npcNames),
    buildCompanionsSection(input.npcRecords, input.turnCount),
    renderPlanGroup(plan?.keywordEntries ?? [], input.worldbookCtx, '世界书'),
    zhikuSection,
    memory.short,
    yitingSection,
    buildStyleAssistantSection(input.modules),
    buildExtraRequirementSection(input.settings),
    buildMainStoryControlSection(input.world),
    protocol.systemSection,
  ], ctx.chat);
}

export function buildOpeningSystemPrompt(input: SystemPromptInput): BuiltSystemPrompt {
  const ctx = makeModuleCtx(input, 'opening');
  const plan = input.worldbookPlan;
  const openingCtx = input.worldbookCtx;
  const identity = injectBucket(input.modules, ctx, 'identity');
  const rules = injectBucket(input.modules, ctx, 'rules');
  const params = injectBucket(input.modules, ctx, 'params');
  const protocol = injectBucket(input.modules, ctx, 'protocol');
  ctx.chat.push(
    ...identity.chatModuleMessages,
    ...rules.chatModuleMessages,
    ...params.chatModuleMessages,
    ...protocol.chatModuleMessages,
  );
  if (plan) ctx.chat.push(...plan.depthMessages);

  return assemblePromptChunks([
    identity.systemSection,
    renderPlanGroup(plan?.alwaysEntries ?? [], openingCtx, '世界书'),
    rules.systemSection,
    renderPlanGroup(plan?.systemRuleEntries ?? [], openingCtx, '提示词'),
    params.systemSection,
    buildWordCountSection(input.settings),
    buildInnerVoiceSection(input.settings),
    buildCharacterSection(input.traveler),
    buildCurrentTimeAnchorSection(input.world),
    buildOpeningCutInSection(input.world),
    buildOpeningArchiveSection(input.world, true),
    buildSceneSection(input.world),
    buildWeatherSection(input.world),
    buildRecentWorldEventsSection(input.world.全局事件),
    buildNewsSection(input.news),
    renderPlanGroup(plan?.keywordEntries ?? [], openingCtx, '世界书'),
    buildExtraRequirementSection(input.settings),
    protocol.systemSection,
  ], ctx.chat);
}

export function createSystemPromptInput(
  partial: Omit<SystemPromptInput, 'worldbookPlan' | 'modules'> & { worldbookPlan?: WorldbookInjectionPlan | null },
): SystemPromptInput {
  const modules = partial.settings.promptModules;
  const worldbookPlan = partial.worldbookPlan !== undefined
    ? partial.worldbookPlan
    : resolvePlan({ ...partial, modules });
  return { ...partial, modules, worldbookPlan };
}
