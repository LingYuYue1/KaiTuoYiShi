import type { 解析后回复 } from '../models/chat';
import type { 额外功能设置 } from '../models/settings';

export function stripInternalProtocolTags(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*<\s*天气\s*>[\s\S]*?<\s*\/\s*天气\s*>\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeContaminatedText(text: string, settings?: 额外功能设置): string {
  text = stripInternalProtocolTags(text);
  const config = settings?.污染词清理;
  if (!config?.enabled) return text;
  const words = Array.isArray(config.words) ? config.words.map((word) => word.trim()).filter(Boolean) : [];
  if (!words.length || !text) return text;
  let next = text;
  for (const word of words) {
    next = next.split(word).join('');
  }
  return next
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * ST 预设中"注入+清理"配对标签块的隐藏规则。
 * 这些标签块让 AI 生成特定内容起作用（越狱声明、抗截断占位），
 * 但显示给玩家前需整段移除，否则污染正文格式。
 *
 * 配套的 ST 原版清理脚本（regex_scripts）未被本游戏导入，
 * 故在此硬编码等价清理规则，作用于"落地前"的所有展示字段。
 */
const HIDDEN_TAG_BLOCK_RULES: Array<{ name: string; pattern: RegExp }> = [
  // 抗空回：原版 regex_scripts 的 "抗空回-去除"，正则 <Q>([\s\S]*?)<\/WF>
  // AI 在 </thinking> 后、正文前输出 <Q>...</WF> 越狱声明，整段隐藏
  { name: '抗空回声明', pattern: /<Q>[\s\S]*?<\/WF>/g },
  // 抗截断：原版 regex_scripts 的 "抗截断-清理math"，正则 <math>([\s\S]*?)<\/math>
  // AI 在正文末尾输出 <math>...</math> 高数题占位，整段隐藏
  { name: '抗截断高数题', pattern: /<math>[\s\S]*?<\/math>/g },
];

/**
 * 隐藏 ST 预设"注入+清理"配对标签块。
 * 在 sanitizeParsedResponse 中先于污染词清理执行，
 * 确保标签块整段（含内容）从 body/thinking 等字段移除。
 */
export function stripHiddenTagBlocks(text: string, settings?: 额外功能设置): string {
  const config = settings?.标签块隐藏;
  if (!config?.enabled || !text) return text;
  let next = text;
  for (const rule of HIDDEN_TAG_BLOCK_RULES) {
    next = next.replace(rule.pattern, '');
  }
  // 移除标签块后可能留下多余空行，统一收敛
  return next
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeParsedResponse(parsed: 解析后回复, settings?: 额外功能设置): 解析后回复 {
  // 先隐藏标签块（整段移除 <Q>...</WF>、<math>...</math>），再清理污染词
  const stripBlocks = (text: string) => stripHiddenTagBlocks(text, settings);
  const cleanText = (text: string) => sanitizeContaminatedText(stripBlocks(text), settings);
  const cleanArray = (items: string[]) => items.map((item) => cleanText(item)).filter(Boolean);
  return {
    ...parsed,
    thinking: cleanText(parsed.thinking),
    body: cleanText(parsed.body),
    memory: cleanText(parsed.memory),
    variableDraft: cleanText(parsed.variableDraft),
    storyPlan: cleanText(parsed.storyPlan),
    awakenInvite: cleanText(parsed.awakenInvite),
    awakenQuestions: cleanText(parsed.awakenQuestions),
    awakenJudgement: cleanText(parsed.awakenJudgement),
    worldEvents: cleanArray(parsed.worldEvents),
    actionOptions: cleanArray(parsed.actionOptions),
    rawText: cleanText(parsed.rawText),
  };
}
