import type { API配置项 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { 命途ID } from '@/models/journey';
import type { 命途阶段 } from '@/models/path';
import { PATH_STAGE_DEFS } from '@/models/path';
import { 创建聊天消息 } from '@/models/chat';
import { getPath } from '@/data/journeyPresets';
import { sendChatMessage } from '@/services/ai/text';
import { parseJsonWithRepair } from '@/utils/jsonRepair';

export interface 战技生成上下文 {
  traveler: 角色数据结构;
  slotKind: 'normal' | 'path';
  slotIndex: number;
  pathId?: 命途ID;
  pathStage?: 命途阶段;
  existingSkillNames?: string[];
  currentDraft?: Partial<战技生成草稿>;
  userHint?: string;
}

export interface 战技生成草稿 {
  名称: string;
  描述: string;
  来源: string;
  关键词: string[];
  消耗: string;
  冷却: string;
  备注: string;
}

const PATH_STYLE_GUIDE: Record<string, string> = {
  destruction: '毁灭：强调代价、压迫、破局、以伤换势；可以写承受反噬、撕开阵线、短时爆发后的迟滞。',
  hunt: '巡猎：强调锁定、追击、精准截杀、瞬间判断；可以写步伐、弹道、弱点、截断逃路。',
  erudition: '智识：强调推演、结构拆解、范围控制、战场计算；可以写预判轨迹、解析阵型、连锁扰动。',
  harmony: '同谐：强调协同、节奏增幅、共鸣、队友衔接；可以写让同伴动作接上、稳定队形、放大优势。',
  nihility: '虚无：强调削弱、扰乱、感知偏移、意义剥离；可以写让敌人误判距离、迟疑、行动节奏塌陷。',
  preservation: '存护：强调屏障、承压、守护反制、阵地稳定；可以写替同伴接压、把冲击导入地面、反推出空隙。',
  abundance: '丰饶：强调修复、续航、生命流转、状态稳定；可以写止血、缓解负荷、让伤势暂时不恶化。',
  remembrance: '记忆：强调凝滞、回溯、忆质、印象残留；可以写冻结一瞬、留下残影、让动作被过去的轨迹牵住。',
};

const FORBIDDEN_NUMERIC_TERMS = [
  '倍率', '攻击力', '暴击', '爆伤', '速度', '韧性', '击破', '能量', '技能点', '回合', '概率', '%',
  '增伤', '减防', '抗性穿透', '效果命中', '效果抵抗', '持续伤害', 'DOT', 'buff', 'debuff',
];

function buildSkillGeneratorSystemPrompt(): string {
  return [
    '你是《崩坏：星穹铁道》同人文字 RPG 的战技设计助手。',
    '你的任务是为玩家旅人生成“小说化剧情战技草稿”，供主剧情描写动作效果和命途风格，不是生成回合制数值技能。',
    '',
    '硬性规则：',
    '- 只输出一个 JSON 对象，不要 Markdown，不要解释，不要额外标签。',
    '- 字段必须是：名称、描述、来源、关键词、消耗、冷却、备注。',
    '- 关键词必须是 4-6 个小说化标签，偏动作方式、命途气质、叙事效果、代价限制。',
    '- 禁止输出百分比、倍率、回合数、技能点、暴击率、击破效率、韧性条、速度、效果命中等回合制数值机制。',
    '- 禁止复刻官方角色技能名、官方角色技能效果或官方技能播报。',
    '- 描述要适合正文自然使用：写动作、效果、限制、代价和场景，不写“造成多少伤害”。',
    '- 名称 2-10 个汉字，必须有《崩坏：星穹铁道》的命名味道，但不要复刻官方技能名。',
    '- 战技名称要多元化：可以诗意、可以直白贴合技能、可以带轻微网络梗或冷幽默、可以像角色随口取的名字，也可以有科幻术语感。',
    '- 不要每次都写成四字玄幻招式名；不要只用“星、刃、影、诀、斩、破”堆砌。',
    '- 描述 90-180 字；备注 35-90 字。',
    '- 如果是命途战技，必须体现该命途风格；如果是普通战技，保持通用但不要空泛。',
    '',
    '小说化关键词示例：突进、牵制、截断、反击、掩护、追击、格挡、迂回、巡猎锁定、毁灭回响、智识推演、同谐共振、虚无扰乱、存护承压、丰饶修复、记忆凝滞、制造破绽、保护同伴、干扰感知、短暂脱力、需要蓄势。',
    '',
    '名称风格示例（只学风格，不要照抄）：折光步、先别眨眼、把门关上、晚点再疼、半拍回声、请勿越线、银轨侧写、今天不加班、低温保存、空白处落笔。',
    '',
    'JSON 示例：',
    '{"名称":"先别眨眼","描述":"旅人用一次几乎看不清起点的短促切入迫使敌人重新判断距离。它不追求炫目的正面压制，而是把对方的注意力钉在错误位置，让真正的攻击或救援从半拍之后接上。若连续使用，旅人会短暂丢失对周围细节的把握。","来源":"AI 小说化战技草稿","关键词":["突进","误导视线","制造破绽","短暂脱力"],"消耗":"需要高度集中观察敌方视线和步伐，连续使用会明显消耗精神。","冷却":"无固定冷却，但需要重新捕捉节奏。","备注":"适合接近、救援和打断，不应写成瞬移或无条件必中。"}',
  ].join('\n');
}

function buildSkillGeneratorUserPrompt(context: 战技生成上下文): string {
  const path = context.pathId ? getPath(context.pathId) : undefined;
  const stage = context.pathStage ? PATH_STAGE_DEFS.find((item) => item.stage === context.pathStage) : undefined;
  const pathGuide = context.pathId ? PATH_STYLE_GUIDE[context.pathId] ?? '' : '';
  const traveler = context.traveler;
  const currentDraft = context.currentDraft;
  return [
    '请根据以下信息生成一个战技草稿。',
    '',
    `槽位类型：${context.slotKind === 'normal' ? '普通战技' : '命途战技'}`,
    `槽位序号：${context.slotIndex}`,
    context.slotKind === 'path' ? `关联命途：${path?.name ?? context.pathId ?? '未知'}` : '关联命途：无，保持通用剧情战技。',
    context.slotKind === 'path' ? `命途阶段：${stage?.name ?? context.pathStage ?? '未知'}` : '',
    pathGuide ? `命途设计口径：${pathGuide}` : '',
    '',
    `旅人姓名：${traveler.姓名 || traveler.别名 || '未命名旅人'}`,
    `旅人身份：${traveler.身份 || traveler.背景 || '未填写'}`,
    `旅人性格：${traveler.性格 || '未填写'}`,
    `旅人能力：${(traveler.能力 ?? []).join('、') || '未登记'}`,
    `已有战技名：${context.existingSkillNames?.length ? context.existingSkillNames.join('、') : '暂无'}`,
    '',
    currentDraft?.名称 || currentDraft?.描述 || currentDraft?.关键词?.length
      ? `当前草稿参考：${JSON.stringify(currentDraft)}`
      : '当前草稿参考：无。',
    `玩家额外提示词：${context.userHint?.trim() || '无。'}`,
    context.userHint?.trim()
      ? '请优先吸收玩家额外提示词中的主题、意象、限制、武器、性格或场景需求；若与硬性规则冲突，以硬性规则为准。'
      : '',
    '',
    `禁止词提示：不要使用 ${FORBIDDEN_NUMERIC_TERMS.join('、')}。`,
    '请输出严格 JSON。',
  ].filter(Boolean).join('\n');
}

function normalizeKeywords(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : String(input ?? '').split(/[,，、\s/|]+/g);
  return raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .filter((item) => !FORBIDDEN_NUMERIC_TERMS.some((term) => item.toLowerCase().includes(term.toLowerCase())))
    .slice(0, 6);
}

function cleanText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim();
}

function normalizeGeneratedSkill(value: unknown): 战技生成草稿 {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const keywords = normalizeKeywords(obj.关键词);
  return {
    名称: cleanText(obj.名称, '未命名战技').slice(0, 16),
    描述: cleanText(obj.描述).slice(0, 420),
    来源: cleanText(obj.来源, 'AI 小说化战技草稿').slice(0, 60),
    关键词: keywords.length ? keywords : ['动作变化', '制造破绽', '节奏调整', '代价限制'],
    消耗: cleanText(obj.消耗, '需要集中精神，连续使用会产生负担。').slice(0, 120),
    冷却: cleanText(obj.冷却, '无固定冷却，但需要重新捕捉节奏。').slice(0, 120),
    备注: cleanText(obj.备注, '这是剧情战技草稿，适合在正文中作为动作风格参考。').slice(0, 180),
  };
}

export async function generateSkillDraft(
  config: API配置项,
  context: 战技生成上下文,
  signal?: AbortSignal,
): Promise<战技生成草稿> {
  const result = await sendChatMessage(config, {
    systemPrompt: buildSkillGeneratorSystemPrompt(),
    messages: [创建聊天消息('user', buildSkillGeneratorUserPrompt(context))],
    onDelta: () => {},
    streaming: false,
    signal,
    repairTags: false,
    topP: 0.88,
    maxContext: 6000,
  });
  const raw = result.fullText.trim();
  if (!raw) throw new Error('战技生成模型返回为空。');
  const parsed = parseJsonWithRepair<Record<string, unknown>>(raw);
  if (!parsed.value) {
    throw new Error(`战技生成结果不是有效 JSON：${parsed.error ?? '未知解析错误'}`);
  }
  const draft = normalizeGeneratedSkill(parsed.value);
  if (!draft.名称 || !draft.描述) throw new Error('战技生成结果缺少名称或描述。');
  return draft;
}
