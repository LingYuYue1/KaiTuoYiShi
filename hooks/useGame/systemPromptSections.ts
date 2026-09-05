import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块作用域 } from '@/models/prompts';
import type { NPC记录, NPC账本选择结果 } from '@/models/npc';
import { formatNpcLedgerForPrompt, 格式化NPC关系, 提取NPC同行记忆文本列表 } from '@/models/npc';
import { 计算命途战技槽位数, NORMAL_SKILL_SLOT_COUNT } from '@/models/skill';
import type { 新闻条目 } from '@/models/news';
import { NEWS_CATEGORY_LABELS } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import { PLOT_STATUS_LABELS } from '@/models/plot';
import type { 手机系统 } from '@/models/phone';
import type { 背包物品 } from '@/models/inventory';
import { ITEM_CATEGORY_LABELS } from '@/models/inventory';
import { getPath, getStartingScenario } from '@/data/journeyPresets';
import { PATH_STAGE_DEFS } from '@/models/path';
import { 构建天气Prompt片段 } from '@/data/weatherRules';
import {
  MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT,
  MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT,
  MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT,
} from './historyWindow';
import { getAnticipatedNpcNamesForTurn } from './npcPresence';

export function normalizeMemoryFingerprint(text: string): string {
  return text
    .replace(/【[^】]{0,24}】/g, '')
    .replace(/[第回合纪要即时短期中期长期压缩档案记忆总结：:，,。！？!?、；;\s\-\d]/g, '')
    .toLowerCase()
    .slice(0, 160);
}

export function isSimilarMemoryEntry(entry: string, seen: string[]): boolean {
  const fp = normalizeMemoryFingerprint(entry);
  if (fp.length < 18) return false;
  return seen.some((item) => {
    if (!item) return false;
    if (fp.includes(item) || item.includes(fp)) return true;
    const left = new Set(Array.from(fp));
    let overlap = 0;
    for (const ch of item) {
      if (left.has(ch)) overlap += 1;
    }
    return overlap / Math.max(fp.length, item.length) >= 0.72;
  });
}

export function pickDedupedMemoryEntries(entries: string[], limit: number, seen: string[]): string[] {
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

export function formatMemorySection(title: string, entries: string[]): string {
  return `# 记忆｜${title}\n\n${entries.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
}

export function splitLayeredMemory(memorySystem: 记忆系统): { long: string; middle: string; short: string } {
  const seen: string[] = [];
  const shortTerm = pickDedupedMemoryEntries(memorySystem.短期记忆, MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT, seen);
  const middleTerm = pickDedupedMemoryEntries(memorySystem.中期记忆, MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT, seen);
  const longTerm = pickDedupedMemoryEntries(memorySystem.长期记忆, MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT, seen);
  return {
    long: longTerm.length ? formatMemorySection('长期记忆', longTerm) : '',
    middle: middleTerm.length ? formatMemorySection('中期记忆', middleTerm) : '',
    short: shortTerm.length ? formatMemorySection('短期记忆', shortTerm) : '',
  };
}

export function getPromptPlayerName(traveler: 角色数据结构): string {
  return traveler.姓名.trim() || '无名开拓者';
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
export function buildCotLanguageSection(settings: 游戏设置, currentScope: 提示词模块作用域): string {
  if (currentScope !== 'main') return '';
  const lang = settings.cotLanguage;
  if (!lang || lang === 'zh') return '';
  const label = COT_LANGUAGE_LABELS[lang];
  if (!label) return '';
  return `# 思维链输出语言\n\n- 主剧情思维链 <think> 思考段请用 ${label} 输出。\n- 正文（旁白、角色对白、行动选项）仍按原语言（中文）输出，不受此设置影响。\n- 思考段内的字段名（如 NPC 分析、候选方案 A/B、状态等）保持中文，仅描述性内容用 ${label}。`;
}

export function buildInnerVoiceSection(settings: 游戏设置): string {
  return settings.enableInnerVoice
    ? '# 心声开关\n\n- 当前设置：心声输出开启。正文可使用【心声】段呈现主角的即时内心微动，但不要替玩家做决定。'
    : '# 心声开关\n\n- 当前设置：心声输出关闭。正文只保留【旁白】与【角色名】，不要输出【心声】段，也不要用内心独白替代旁白。';
}

export function buildMainStoryControlSection(worldState: 世界状态): string {
  const lines: string[] = [];
  lines.push('- 本回合是主线剧情的正文时间，请聚焦于当前的深度叙事与环境互动。');
  lines.push('- 本节是你处理各方素材的“导演工作手册”，请以此来协调剧本与玩家互动的关系：');
  lines.push('- 第一重心：玩家的行为。遵守“不代写玩家”的红线，你的镜头永远跟随着玩家的动作移动。');
  lines.push('- 第二重心：眼前的确凿现实。当前时间、地点、在场人物、即时回顾和既往交集，是你布置场景的硬性积木。');
  lines.push('- 第三重心：化解矛盾的艺术。若玩家的动作、宣称与确凿现实发生碰撞，请运用上一节提到的“小异缝合，大异点明”技巧，用 NPC 的自然反应或平滑的镜头转场来接住玩家的戏。');
  lines.push('- 第四重心：角色与设定的灵魂。利用提供的人物资料和世界设定，精准拿捏角色的语气、行为模式和常识边界，确保他们的举手投足充满原著张力。');
  lines.push('- 第五重心：未来的剧情指引。章节素材库（剧情编织）、新闻和任务是未来的愿景与世界氛围；在它们真正发生前，只作为悬念和压力存在，不可当作既成事实。');
  lines.push('- 第六重心：背景底色。使用普通的背景资料来润色表达、提供伏笔，让环境描写更具质感。');
  lines.push('- 强回忆优先承接：若遇到「# 即时剧情回顾」或「【剧情回忆】」，请务必在正文开头自然承接其中的未结问题、上一动作或在场人物，保持剧情无缝衔接。');
  lines.push('- 关系记忆唤醒：若回顾或记忆显示某 NPC 与玩家有过交集、同行或冲突，请在互动中通过熟稔的称呼、戒备的眼神或默契的举动，生动地展现出这层羁绊。禁止出现“突然失忆”、“重新自我介绍”的生硬局面。');
  lines.push('- 档案调用的艺术：优先用主体设定校准 NPC 的核心气质，辅以特定档案中与玩家的具体交往记录。让角色既符合原著内核，又拥有属于你们两人共同回忆的真实温度。');
  lines.push('- 顺应剧情节奏：提供的章节素材是防剧透的指引。当条件成熟允许直接推进时，请将目标推向台前；若时机未到，请将其作为绝佳的伏笔和环境氛围。已解除的危机无需重播，让大家向前看。');
  lines.push('- 新闻作环境点缀：将新闻播报作为世界在运转的微小侧面，当它与当前地点或人物契合时，通过旁人的闲聊或广播自然透出。');
  lines.push('- 战斗融于叙事：发生冲突时，用连续的动作、角色的战意、呼吸和受伤代价来描写战斗过程，用文字带来压迫感，而非单纯播报技能。');
  lines.push('- 命途作为气质表现：让命途的特性隐晦地流露在角色的动作风格或直觉评语中，使其成为角色魅力的延伸。');
  lines.push('- 时间的自然流转：请在转场或清晨/入夜等关键节点，用优美的环境描写点出时间的流逝，避免在对话中生硬地插入时间戳。');
  lines.push('- 玩家身份独立：请确立玩家独一无二的旅人身份，原著主角（星/穹）的线索仅作为客串或世界观背景，确保玩家拥有属于自己的故事。');
  if (worldState.原著主角 === '星穹双主角') {
    lines.push('- 当前原著主角配置为“星穹双主角”：星与穹是两位独立的个体。描写时请确保他们各自的独立性，若镜头聚焦其一，请通过余光或背景动静保留另一位的存在感。');
  } else if (worldState.原著主角 === '星') {
    lines.push('- 当前原著主角配置：星。穹作为非默认状态隐藏，请专注当前角色阵容的互动。');
  } else if (worldState.原著主角 === '穹') {
    lines.push('- 当前原著主角配置：穹。涉及封存舱或星核载体等原著宿命线索时，请优先将聚光灯打在穹的身上。');
  }
  const archive = worldState.开局档案;
  if (archive) {
    lines.push(`- 当前开局档案：${archive.来源 === 'free' ? '自由开局' : archive.来源 === 'workshop' ? '创意工坊' : '官方预设'} / ${archive.地区名称} / ${archive.章节锚点名称}。`);
    lines.push('- 请以该开局档案和当前地点为绝对起点，稳步推进后续故事，将开局前的原作主线转化为深藏的背景或回忆。');
  }
  return `# 核心叙事基准\n\n${lines.join('\n')}`;
}

export function buildOpeningArchiveSection(worldState: 世界状态, isOpeningTurn: boolean): string {
  const archive = worldState.开局档案;
  if (!archive) return '';
  const sourceLabel = archive.来源 === 'free' ? '自由开局' : archive.来源 === 'workshop' ? '创意工坊' : '官方预设';
  if (!isOpeningTurn) {
    return [
      '# 开局档案（长期锚点）',
      '',
      `- 开局：${sourceLabel} / ${archive.地区名称} / ${archive.章节锚点名称}`,
      '- 锚点之前的主线只作既成背景，不得自动补演或转跳。',
      '- 不得无理由回到默认黑塔空间站开局，也不得重播首回合入场。',
    ].join('\n');
  }
  const summary = archive.整理档案;
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

export function buildCurrentTimeAnchorSection(worldState: 世界状态): string {
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

export function buildCharacterSection(traveler: 角色数据结构): string {
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
  if (traveler.命途列表.length > 0) {
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

  if (traveler.能力.length) {
    lines.push(`- 能力：${traveler.能力.join('、')}`);
  }

  if (traveler.专长知识.length) {
    lines.push(`- 特长：${traveler.专长知识.join('、')}`);
  }

  return `# 当前角色\n\n${lines.join('\n')}`;
}

export function buildOpeningCutInSection(worldState: 世界状态): string {
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

export function buildSkillSection(traveler: 角色数据结构): string {
  const skills = traveler.战技列表.filter(
    (skill) => skill.槽位类型 !== 'normal' || (skill.槽位序号 >= 1 && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT),
  );
  const paths = traveler.命途列表;

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
      if (a.关联命途 !== b.关联命途) return (a.关联命途 ?? '').localeCompare(b.关联命途 ?? '');
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

export function buildSceneSection(worldState: 世界状态): string {
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
  if (period.id) {
    const npcLine = period.人物.length
      ? `\n\n场内人物：\n${period.人物.map((n) => `- ${n.姓名}：${n.角色}，${n.性格}`).join('\n')}`
      : '';
    lines.push(`【${period.名称}】${period.年代 ? `（${period.年代}）` : ''}${period.描述 ? `\n${period.描述}` : ''}${period.氛围 ? `\n${period.氛围}` : ''}${npcLine}`);
  }

  if (!lines.length) return '';
  return `# 当前场景\n\n${lines.join('\n\n')}`;
}

const RECENT_WORLD_EVENT_PROMPT_LIMIT = 12;

export function normalizeWorldEventFingerprint(text: string): string {
  return text
    .replace(/【[^】]{0,24}】/g, '')
    .replace(/[第回合纪要动态世界事件新闻线索：:，,。！？!?、；;\s\-\d]/g, '')
    .toLowerCase()
    .slice(0, 120);
}

export function compactWorldEvent(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 160)}...` : cleaned;
}

export function buildRecentWorldEventsSection(events: string[]): string {
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

export function normalizeExplicitNpcNames(names?: string[]): string[] {
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

export function buildNpcPresenceSection(
  worldState: 世界状态,
  npcRecords?: NPC记录[],
  turnCount = 0,
  userInput = '',
  explicitNpcNames: string[] = [],
): string {
  const sceneNames = worldState.当前时段.人物.map((npc) => npc.姓名.trim()).filter(Boolean);
  const records = npcRecords ?? [];
  const explicitNames = normalizeExplicitNpcNames(explicitNpcNames);
  const current = records
    .filter((npc) => npc.同行 || sceneNames.some((name) => name === npc.姓名 || name === npc.别名))
    .map((npc) => npc.姓名);
  const recentCutoff = Math.max(1, turnCount - NPC_PRESENCE_RECENT_WINDOW);
  const nearby = records
    .filter((npc) =>
      !current.includes(npc.姓名) &&
      npc.最近回合 >= recentCutoff &&
      (npc.阶位 === 'companion' || npc.原著角色 || 提取NPC同行记忆文本列表(npc).length > 0),
    )
    .sort((a, b) => b.最近回合 - a.最近回合)
    .slice(0, 8)
    .map((npc) => `${npc.姓名}（最近第${Math.max(1, npc.最近回合)}回合）`);
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

export function buildNpcLedgerContinuitySection(selection: NPC账本选择结果): string {
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

export function buildNpcContinuitySection(
  worldState: 世界状态,
  npcRecords?: NPC记录[],
  turnCount = 0,
  explicitNpcNames: string[] = [],
): string {
  const records = npcRecords ?? [];
  const explicitNames = normalizeExplicitNpcNames(explicitNpcNames);
  const recentCutoff = Math.max(1, turnCount - RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW);
  const sceneNames = new Set(worldState.当前时段.人物.map((n) => n.姓名.trim()).filter(Boolean));
  const currentLocation = worldState.当前地点.trim();

  const candidates = records
    .map((npc) => {
      const memories = 提取NPC同行记忆文本列表(npc);
      const isRecent = npc.最近回合 >= recentCutoff;
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
    .sort((a, b) => b.score - a.score || b.npc.最近回合 - a.npc.最近回合)
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
    const turnLine = `初见第${Math.max(1, npc.初见回合)}回合，最近第${Math.max(1, npc.最近回合)}回合`;
    const memoryLine = memories.length ? `；最近共同经历：${memories.slice(-3).join('；')}` : '';
    const phoneMemoryLine = buildRecentPhoneMemoryLine(npc);
    const introLine = npc.介绍 ? `；身份/职责：${npc.介绍}` : '';
    lines.push(`- ${npc.姓名}${npc.别名 ? `（${npc.别名}）` : ''}｜${tags.join(' · ')}｜好感${npc.好感度 > 0 ? '+' : ''}${npc.好感度}｜${turnLine}${introLine}${memoryLine}${phoneMemoryLine}`);
  }

  for (const name of fallbackNames) {
    lines.push(`- ${name}｜近期正文/玩家输入明确出现或预期相关｜档案尚未落库｜必须读取即时剧情回顾和最近正文锚点；若其中显示其刚发生对话、动作、委托、冲突或同行状态，正文必须承接，禁止写成完全陌生、初次见面或无记忆。`);
  }

  return lines.join('\n');
}

// 已知伙伴注入：按相关度过滤（同行 > 近回合见过 > 有记忆/好感 > 高好感），避免刚见过的人过早掉出上下文。
// 路人（tier='extra'）只注入近期或已有可承接关系/记忆的少量对象，避免上下文爆炸。
export function buildCompanionsSection(npcRecords?: NPC记录[], turnCount = 0): string {
  if (!npcRecords || npcRecords.length === 0) return '';
  const companions = npcRecords.filter((n) => n.阶位 === 'companion');
  const recentCutoff = Math.max(1, turnCount - RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW);
  const recentExtras = npcRecords
    .filter((n) => {
      if (n.阶位 !== 'extra') return false;
      const memoryCount = 提取NPC同行记忆文本列表(n).length;
      return n.最近回合 >= recentCutoff || memoryCount > 0 || n.好感度 !== 0 || n.关系 !== 'stranger';
    })
    .sort((a, b) => {
      const recentDiff = b.最近回合 - a.最近回合;
      if (recentDiff !== 0) return recentDiff;
      const memoryDiff = 提取NPC同行记忆文本列表(b).length - 提取NPC同行记忆文本列表(a).length;
      if (memoryDiff !== 0) return memoryDiff;
      return Math.abs(b.好感度) - Math.abs(a.好感度);
    });
  if (companions.length === 0 && recentExtras.length === 0) return '';

  const sorted = [...companions].sort((a, b) => {
    if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
    const recentDiff = b.最近回合 - a.最近回合;
    const aIsRecent = a.最近回合 >= recentCutoff;
    const bIsRecent = b.最近回合 >= recentCutoff;
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
    if (n.外貌) desc.push(`外貌：${n.外貌}`);
    if (n.穿着) desc.push(`穿着：${n.穿着}`);
    if (n.说话方式) desc.push(`说话方式：${n.说话方式}`);
    if (n.性格 && !n.原著角色) desc.push(`性格：${n.性格}`);
    if (n.性格 && n.原著角色) desc.push(`临时/旧档案性格参考：${n.性格}（只作状态线索，长期人格以智库人物主体资料为准）`);
    if (n.介绍) desc.push(`介绍：${n.介绍}`);
    if (n.原著角色 && (n.说话方式 || n.性格)) {
      desc.push('表现要求：本回合若该角色在场或被自然牵引出场，必须体现说话方式和主体人格；不要连续数回合只沉默旁观。');
    }
    const memories = 提取NPC同行记忆文本列表(n).slice(-4);
    if (memories.length) desc.push(`同行记忆：${memories.join('；')}`);
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
export function buildInventorySection(traveler: 角色数据结构): string {
  const inventory = traveler.背包;
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
export function buildPlotSection(plotNodes?: 剧情节点[]): string {
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
export function buildNewsSection(news?: 新闻条目[]): string {
  if (!news || news.length === 0) return '';
  const recent = [...news].sort((a, b) => b.回合 - a.回合).slice(0, 5);
  const lines = recent.map(
    (n) => `- [${NEWS_CATEGORY_LABELS[n.类目]} · 第 ${n.回合} 回] ${n.标题}`,
  );
  return `# 近期新闻\n\n${lines.join('\n')}`;
}

export function getRecentPhoneMemoryTexts(npc: NPC记录): string[] {
  return (npc.同行记忆 ?? [])
    .filter((item) => item.来源 === '手机')
    .map((item) => item.摘要.trim())
    .filter((text): text is string => Boolean(text));
}

export function buildRecentPhoneMemoryLine(npc: NPC记录): string {
  const phoneMemories = getRecentPhoneMemoryTexts(npc).slice(-2);
  return phoneMemories.length ? `；最近手机私聊：${phoneMemories.join('；')}` : '';
}

export function buildPhoneSection(phone?: 手机系统): string {
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

export function buildWordCountSection(settings: 游戏设置): string {
  return `# 字数要求\n\n- 本回合正文不少于 ${settings.wordCountTarget} 字；日常推进可贴近下限，关键场景应超过下限。`;
}

export function buildWeatherSection(worldState: 世界状态): string {
  return 构建天气Prompt片段(worldState.当前地点, worldState.当前天气);
}

export function buildExtraRequirementSection(settings: 游戏设置): string {
  const extra = settings.额外功能.玩家额外要求.trim();
  if (!extra) return '';
  return `# 玩家额外要求\n\n${extra}`;
}

export function buildStyleAssistantSection(modules: 提示词模块[] | undefined): string {
  const styleModule = (modules ?? []).find((m) => m.enabled && m.id.startsWith('builtin_writing_style'));
  if (!styleModule) return '';
  return `# 文风助手\n\n- 当前文风：「${styleModule.title}」。正文按规则区文风模块的质感要求写作。`;
}

export function buildStoryArrangementSection(
  plotNodes: 剧情节点[] | undefined,
  storyPlanSnippets?: string[],
): string {
  const plot = buildPlotSection(plotNodes);
  const snippets = (storyPlanSnippets ?? []).map((s) => s.trim()).filter(Boolean);
  if (!plot && !snippets.length) return '';
  const lines: string[] = [];
  if (plot) lines.push(plot);
  if (snippets.length) {
    lines.push('# 剧情规划备忘');
    lines.push('');
    for (const s of snippets.slice(0, 2)) lines.push(`- ${s}`);
  }
  return lines.join('\n\n');
}
