import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块作用域 } from '@/models/prompts';
import { PROMPT_MODULE_TOP_THRESHOLD } from '@/models/prompts';
import type { 世界书 } from '@/models/worldbook';
import type { NPC记录 } from '@/models/npc';
import { NPC_RELATION_LABELS } from '@/models/npc';
import { 计算命途战技槽位数, NORMAL_SKILL_SLOT_COUNT } from '@/models/skill';
import type { 新闻条目 } from '@/models/news';
import { NEWS_CATEGORY_LABELS } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import { PLOT_STATUS_LABELS } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import type { 装备槽位ID } from '@/models/equipment';
import { EQUIP_SLOT_LABELS, EQUIP_SLOT_ORDER } from '@/models/equipment';
import type { 背包物品 } from '@/models/inventory';
import { ITEM_CATEGORY_LABELS } from '@/models/inventory';
import {
  getPath,
  getStartingScenario,
  getStoryMode,
} from '@/data/journeyPresets';
import { PATH_STAGE_DEFS, PATH_CORE_BELIEFS } from '@/models/path';
import { buildWorldbookInjection, type FilterContext } from '@/utils/worldbook';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { retrieveYitingContext } from '@/services/yitingRetrieval';
import { buildStoryWeavingInjection } from '@/services/storyWeaving';

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
  zhiku?: 智库系统,
  yiting?: 忆庭系统,
  phone?: 手机系统,
  awakeningPhase?: 命途狭间阶段,
  yitingInjectionOverride?: string,
  zhikuInjectionOverride?: string,
): string {
  const parts: string[] = [];

  const personLabel =
    settings.narrativePerson === 'second' ? '第二人称"你"'
    : settings.narrativePerson === 'first' ? '第一人称"我"'
    : '第三人称"他/她"';
  // 提示词模块按当前 scope 过滤；scope 信息来自 worldbookCtx.currentScope（与世界书共用一个）。
  // 例外:当世界状态.进行中狭间存在,本回合必须走 pathAwakening scope —— 替代主剧情流程。
  const baseScope: 提示词模块作用域 = worldbookCtx?.currentScope ?? 'main';
  const currentScope: 提示词模块作用域 = worldState.进行中狭间 ? 'pathAwakening' : baseScope;
  const moduleCtx = {
    wordCountTarget: settings.wordCountTarget,
    personLabel,
    currentScope,
  };

  // ── 提示词模块·顶部（order < 30：开发者模式、叙述者人格等） ──
  const topModules = injectPromptModules(settings.promptModules, moduleCtx, 'top');
  if (topModules) parts.push(topModules);

  // ── 故事基调（剧情模式）──
  const tone = buildToneSection(worldState);
  if (tone) parts.push(tone);

  const innerVoiceSection = buildInnerVoiceSection(settings);
  if (innerVoiceSection) parts.push(innerVoiceSection);

  if (currentScope === 'main') {
    parts.push(buildMainStoryControlSection(worldState));
  }

  // ── 当前角色 ──
  parts.push(buildCharacterSection(traveler));

  // ── 战技（普通槽位 + 命途槽位 + 已登记招式） ──
  const skillSection = buildSkillSection(traveler);
  if (skillSection) parts.push(skillSection);

  // ── 已知伙伴（只把 tier='companion' 的喂给 AI，路人不进上下文） ──
  const companionsSection = buildCompanionsSection(npcRecords, _turnCount);
  if (companionsSection) parts.push(companionsSection);

  // ── 装备（已穿戴的 4 槽位） ──
  const equipmentSection = buildEquipmentSection(traveler);
  if (equipmentSection) parts.push(equipmentSection);

  // ── 背包（最多前 10 件，按 category 分组） ──
  const inventorySection = buildInventorySection(traveler);
  if (inventorySection) parts.push(inventorySection);

  // ── 剧情（active + 最近 3 个 completed + hintForAI） ──
  const plotSection = buildPlotSection(plotNodes);
  if (plotSection) parts.push(plotSection);

  // ── 剧情编织（玩家导入 TXT 后生成的章节滑窗）──
  if (settings.剧情编织系统?.enabled && settings.剧情编织系统.currentWindow) {
    const storyWeavingSection = buildStoryWeavingInjection(storyWeaving);
    if (storyWeavingSection) parts.push(storyWeavingSection);
  }

  // ── 新闻（最近 5 条标题） ──
  const newsSection = buildNewsSection(news);
  if (newsSection) parts.push(newsSection);

  // ── 手机通讯（只注入已压缩摘要与待处理来信，不注入完整聊天原文） ──
  const phoneSection = buildPhoneSection(phone);
  if (phoneSection) parts.push(phoneSection);

  // ── 忆庭（仅控制召回；入库始终执行，不等同于短期/长期记忆） ──
  const yitingEnabled = settings.记忆系统?.忆庭启用 !== false;
  const yitingThreshold = settings.记忆系统?.忆庭召回最早触发回合 ?? 10;
  if (yitingInjectionOverride?.trim()) {
    parts.push(yitingInjectionOverride.trim());
  } else if (yitingEnabled && yiting && worldbookCtx?.recentUserInput && worldbookCtx.turnCount > yitingThreshold) {
    const limit = settings.记忆系统?.忆庭召回条数 ?? 8;
    const yitingHit = retrieveYitingContext(yiting, worldbookCtx.recentUserInput, limit);
    if (yitingHit.injection) parts.push(yitingHit.injection);
  }

  // ── 智库（只注入按本回合输入检索到的摘要，不注入整库） ──
  if (zhikuInjectionOverride?.trim()) {
    parts.push(zhikuInjectionOverride.trim());
  } else if (settings.智库系统?.enabled && zhiku && worldbookCtx?.recentUserInput) {
    const zhikuHit = retrieveZhikuContext(zhiku, worldbookCtx.recentUserInput, settings.智库系统.maxRelatedEntries, worldbookCtx);
    if (zhikuHit.injection) parts.push(zhikuHit.injection);
  }

  // ── 当前场景 ──
  const sceneFromWorldbook = buildSceneSection(worldState);
  if (sceneFromWorldbook) parts.push(sceneFromWorldbook);

  // ── 命途狭间状态（待升阶 / 待触发 / 进行中 三态注入） ──
  const awakeningSection = buildPathAwakeningSection(traveler, worldState, awakeningPhase);
  if (awakeningSection) parts.push(awakeningSection);

  if (worldState.全局事件.length) {
    parts.push(`近期事件：\n${worldState.全局事件.map((e) => `- ${e}`).join('\n')}`);
  }

  // ── 记忆注入 ──
  if (settings.enableMemoryInjection) {
    const memSections: string[] = [];
    if (memorySystem.长期记忆.length) {
      memSections.push(
        `## 长期记忆\n\n${memorySystem.长期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      );
    }
    if (memorySystem.短期记忆.length) {
      memSections.push(
        `## 最近的事\n\n${memorySystem.短期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      );
    }
    if (memorySystem.即时记忆.length) {
      const recentImmediate = memorySystem.即时记忆.slice(-8);
      memSections.push(
        `## 即时记忆\n\n${recentImmediate.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      );
    }
    if (memSections.length) {
      parts.push(`# 记忆\n\n${memSections.join('\n\n')}`);
    }
  }

  // ── 世界书注入（受 settings.enableWorldbookInjection 控制；首回合规范以条目形式存在于内置世界书）──
  if (settings.enableWorldbookInjection && worldbooks && worldbookCtx) {
    const injection = buildWorldbookInjection(worldbooks, worldbookCtx);
    if (injection) {
      parts.push(injection);
    }
  }

  // ── 提示词模块·尾部（order >= 30：CoT、回复格式、玩家自定义模块） ──
  const bottomModules = injectPromptModules(settings.promptModules, moduleCtx, 'bottom');
  if (bottomModules) parts.push(bottomModules);

  return parts.join('\n\n---\n\n');
}

export function buildOpeningSystemPrompt(
  traveler: 角色数据结构,
  worldState: 世界状态,
  settings: 游戏设置,
  turnCount: number,
  worldbooks?: 世界书[],
  worldbookCtx?: FilterContext,
  news?: 新闻条目[],
): string {
  const parts: string[] = [];

  const personLabel =
    settings.narrativePerson === 'second' ? '第二人称"你"'
    : settings.narrativePerson === 'first' ? '第一人称"我"'
    : '第三人称"他/她"';
  const moduleCtx = {
    wordCountTarget: settings.wordCountTarget,
    personLabel,
    currentScope: 'opening' as 提示词模块作用域,
  };

  const topModules = injectPromptModules(settings.promptModules, moduleCtx, 'top');
  if (topModules) parts.push(topModules);

  const tone = buildToneSection(worldState);
  if (tone) parts.push(tone);

  const innerVoiceSection = buildInnerVoiceSection(settings);
  if (innerVoiceSection) parts.push(innerVoiceSection);

  parts.push(buildCharacterSection(traveler));

  const openingCutIn = buildOpeningCutInSection(worldState);
  if (openingCutIn) parts.push(openingCutIn);

  const scene = buildSceneSection(worldState);
  if (scene) parts.push(scene);

  if (worldState.全局事件.length) {
    parts.push(`近期事件：\n${worldState.全局事件.map((e) => `- ${e}`).join('\n')}`);
  }
  const newsSection = buildNewsSection(news);
  if (newsSection) parts.push(newsSection);

  if (settings.enableWorldbookInjection && worldbooks && worldbookCtx) {
    const injection = buildWorldbookInjection(worldbooks, {
      ...worldbookCtx,
      currentScope: 'opening',
      turnCount,
    });
    if (injection) parts.push(injection);
  }

  const bottomModules = injectPromptModules(settings.promptModules, moduleCtx, 'bottom');
  if (bottomModules) parts.push(bottomModules);

  return parts.join('\n\n---\n\n');
}

interface PromptModuleInjectionCtx {
  wordCountTarget: number;
  personLabel: string;
  currentScope: 提示词模块作用域;
}

function buildInnerVoiceSection(settings: 游戏设置): string {
  return settings.enableInnerVoice
    ? '# 心声开关\n\n- 当前设置：心声输出开启。正文可使用【心声】段呈现主角的即时内心微动，但不要替玩家做决定。'
    : '# 心声开关\n\n- 当前设置：心声输出关闭。正文只保留【旁白】与【角色名】，不要输出【心声】段，也不要用内心独白替代旁白。';
}

function injectPromptModules(
  modules: 提示词模块[] | undefined,
  ctx: PromptModuleInjectionCtx,
  position: 'top' | 'bottom',
): string {
  if (!modules || modules.length === 0) return '';
  const filtered = modules
    .filter((m) => m.enabled)
    .filter((m) => {
      const scope = m.scope?.length ? m.scope : (['all'] as 提示词模块作用域[]);
      return scope.includes('all') || scope.includes(ctx.currentScope);
    })
    .filter((m) =>
      position === 'top'
        ? m.order < PROMPT_MODULE_TOP_THRESHOLD
        : m.order >= PROMPT_MODULE_TOP_THRESHOLD,
    )
    .sort((a, b) => a.order - b.order);
  if (filtered.length === 0) return '';
  return filtered
    .map((m) =>
      m.content
        .replace(/\{wordCountTarget\}/g, String(ctx.wordCountTarget))
        .replace(/\{personLabel\}/g, ctx.personLabel),
    )
    .join('\n\n---\n\n');
}

function buildToneSection(worldState: 世界状态): string {
  const lines: string[] = [];
  if (worldState.剧情模式) {
    const m = getStoryMode(worldState.剧情模式);
    if (m) lines.push(`- 剧情模式偏向：${m.name}——${m.description}`);
  }
  if (!lines.length) return '';
  return `# 故事基调\n\n${lines.join('\n')}`;
}

function buildMainStoryControlSection(worldState: 世界状态): string {
  const lines: string[] = [];
  lines.push('- 本回合属于主剧情正文，不是开局校准、命途狭间、新闻后台、手机聊天或智库检索回合。');
  lines.push('- 主剧情优先级：玩家本回合输入 > 当前场景与上一回合钩子 > 剧情编织滑窗 > 忆庭召回 > 智库注入 > 新闻苗头 > 普通背景资料。');
  lines.push('- 智库只提供原著资料、人物、地点、道具、组织等事实锚点；剧情方向不能只靠智库百科硬推。');
  lines.push('- 剧情编织负责“这一段故事应该如何承接和铺垫”；若存在滑窗，应优先把当前段落的目标、人物关系和未结事项写进正文。');
  lines.push('- 新闻系统是世界演变与事件压力，不是强制主线脚本；只在与当前地点、人物或玩家目标有关时自然露出。');
  lines.push('- 战斗不作为独立玩法抢占主剧情。发生冲突时以正文里的动作链、角色气质、战技表现和代价推进。');
  lines.push('- 命途只允许少量落在评语、气质、动作风格或代价上，不要写成巡猎直觉、毁灭本能、自动预警或身体反射。');
  lines.push('- 时间交给变量系统维护。正文只在开场、转场或时间变化确实重要时点出一次，不要反复出现“舰内时间 XX:XX”这类时间戳。');
  lines.push('- 玩家不是星 / 穹，也不是星穹列车既定成员；原著主角信息只作为原著线索和时间锚点，不要覆盖玩家身份。');
  if (worldState.原著主角 === '星穹双主角') {
    lines.push('- 当前原著主角配置为“星穹双主角”：星与穹是两个并列存在的独立个体，主剧情中继续保持分离，不混写成同一人。');
  } else if (worldState.原著主角) {
    lines.push(`- 当前原著主角配置：${worldState.原著主角}。另一性别主角不自动登场，除非后续剧情或玩家设定明确引入。`);
  }
  return `# 主剧情运行锚点\n\n${lines.join('\n')}`;
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
    lines.push('- 双原著主角提醒：星与穹是两个独立存在的原著主角，不可写成同一人、互相替代或混合性别设定。开局叙述只聚焦当前镜头中的那一位，另一位保留为并列存在的另一条原著线索，不要提前让两人合并成一个身份。');
  }
  if (worldState.自定义开局?.trim()) {
    lines.push(`- 切入说明：${worldState.自定义开局.trim()}`);
  }

  if (!lines.length) return '';
  lines.push('- 使用方式：把以上内容视为开局已经成立的私有设定，融入道具、通讯、来历或行动动机中；不要原文复读，也不要当成还需要玩家确认的说明。');
  return `# 开局切入说明\n\n${lines.join('\n')}`;
}

function buildSkillSection(traveler: 角色数据结构): string {
  const skills = traveler.战技列表 ?? [];
  const paths = traveler.命途列表 ?? [];

  const lines: string[] = [];
  lines.push(`- 普通战技槽位：${NORMAL_SKILL_SLOT_COUNT} 个，始终保留。`);

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
      .filter((skill) => skill.槽位类型 === 'normal' && skill.已启用 !== false)
      .sort((a, b) => a.槽位序号 - b.槽位序号)
      .map((skill) => `${skill.槽位序号}. ${skill.名称}`);
    if (normalSkills.length) {
      lines.push(`- 已登记普通战技（仅供系统识别，不在正文直呼名称）：${normalSkills.join(' / ')}`);
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

// 已知伙伴注入：只取 tier='companion'，并按相关度过滤（同行 > 高好感 > 近回合见过），cap 10。
// 路人（tier='extra'）不进 prompt，避免上下文爆炸；路人再现的临时注入由 sendWorkflow 在 npcEncounters 协议落地后处理。
function buildCompanionsSection(npcRecords?: NPC记录[], turnCount = 0): string {
  if (!npcRecords || npcRecords.length === 0) return '';
  const companions = npcRecords.filter((n) => n.阶位 === 'companion');
  const recentExtras = npcRecords.filter(
    (n) => n.阶位 === 'extra' && Number(n.最近回合 || 0) >= Math.max(1, turnCount - 5),
  );
  if (companions.length === 0 && recentExtras.length === 0) return '';

  const sorted = [...companions].sort((a, b) => {
    if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
    const affDiff = Math.abs(b.好感度) - Math.abs(a.好感度);
    if (affDiff !== 0) return affDiff;
    return b.最近回合 - a.最近回合;
  });

  const formatNpc = (n: NPC记录) => {
    const tags: string[] = [NPC_RELATION_LABELS[n.关系]];
    if (n.同行) tags.push('同行中');
    if (n.原著角色) tags.push('原著角色');
    if (n.阵营ID) {
      tags.push(n.阵营ID);
    }
    const desc: string[] = [];
    if (n.对玩家称呼) desc.push(`称呼：${n.对玩家称呼}`);
    if (n.外貌) desc.push(`外貌：${n.外貌}`);
    if (n.性格) desc.push(`性格：${n.性格}`);
    if (n.介绍) desc.push(`介绍：${n.介绍}`);
    if (n.同行记忆?.length) desc.push(`同行记忆：${n.同行记忆.slice(-3).join('；')}`);
    const descPart = desc.length ? `\n  ${desc.join('；')}` : '';
    return `- ${n.姓名}${n.别名 ? `（${n.别名}）` : ''}｜${tags.join(' · ')}｜好感${n.好感度 > 0 ? '+' : ''}${n.好感度}${descPart}`;
  };

  const lines: string[] = [];
  if (sorted.length > 0) {
    lines.push(...sorted.slice(0, 10).map(formatNpc));
  }
  if (recentExtras.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('最近遇见的路人：');
    lines.push(...recentExtras.slice(0, 6).map(formatNpc));
  }
  return `# 已知伙伴与路人\n\n${lines.join('\n')}`;
}
// 装备注入：从背包里找出已穿戴的物品(当前装备部位 == 槽位 ID),
// 列出 名称、描述和叙事效果，供 AI 描述主角可用资源时引用。
function buildEquipmentSection(traveler: 角色数据结构): string {
  const slots = traveler.装备 ?? {};
  const inventory = traveler.背包 ?? [];
  const slotEntries = EQUIP_SLOT_ORDER
    .map((slot) => {
      const itemId = slots[slot];
      if (!itemId) return null;
      const item = inventory.find((it) => it.id === itemId);
      if (!item) return null;
      return { slot, item };
    })
    .filter((e): e is { slot: 装备槽位ID; item: 背包物品 } => Boolean(e));
  if (slotEntries.length === 0) return '';

  const lines = slotEntries.map(({ slot, item }) => {
    const effectText = item.叙事效果?.length ? `（效果：${item.叙事效果.join('、')}）` : '';
    const descPart = item.描述 ? ` —— ${item.描述}` : '';
    return `- ${EQUIP_SLOT_LABELS[slot]}：${item.名称}${effectText}${descPart}`;
  });
  return `# 已穿戴装备\n\n${lines.join('\n')}`;
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
    '- 装备类(lightcone / weapon / clothing / accessory) 默认每件独立(可堆叠=false),不要写 数量>1。',
    '- 装备槽位 取值:lightcone / weapon / head(帽子) / outfit(衣服) / legs(裤子) / feet(鞋子) / accessory1 / accessory2。',
    '  · lightcone 类别 → 装备槽位:lightcone',
    '  · weapon 类别 → 装备槽位:weapon',
    '  · clothing 类别 → 装备槽位 必须是 head/outfit/legs/feet 之一',
    '  · accessory 类别 → 装备槽位 可写 accessory1 或 accessory2(穿戴时会自动选空槽)',
    '- 叙事效果 使用字符串数组,例如 `["近身防卫","破解终端时更稳定"]`。装备和道具不再生成数值属性加成。',
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

function buildPhoneSection(phone?: 手机系统): string {
  if (!phone) return '';
  const compressed = phone.chats
    .flatMap((chat) =>
      (chat.localArchive?.compressedSummaries ?? []).map((summary) => ({
        title: chat.title,
        type: chat.type,
        summary,
      })),
    )
    .filter((item) => item.summary.trim())
    .slice(-6);
  const pendingSeeds = phone.messageSeeds
    .filter((seed) => seed.status === 'pending')
    .slice(-5);
  if (!compressed.length && !pendingSeeds.length) return '';

  const lines: string[] = [];
  lines.push('# 手机通讯摘要');
  lines.push('');
  lines.push('- 这里不是完整聊天原文，只是手机系统已经压缩落地的通讯事实和待处理来信。');
  lines.push('- 主剧情可以承接这些事实、约定、关系变化和未读提示，但不要代替玩家在手机里回复，也不要把手机聊天改写成正文大段复述。');
  if (compressed.length) {
    lines.push('');
    lines.push('## 已压缩通讯摘要');
    for (const item of compressed) {
      const typeLabel = item.type === 'group' ? '群聊' : item.type === 'system' ? '系统' : '私聊';
      lines.push(`- [${typeLabel}] ${item.title}：${item.summary}`);
    }
  }
  if (pendingSeeds.length) {
    lines.push('');
    lines.push('## 待处理来信');
    for (const seed of pendingSeeds) {
      lines.push(`- [${seed.priority}] ${seed.title}：${seed.context}`);
    }
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
