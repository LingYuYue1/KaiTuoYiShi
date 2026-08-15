// 酒馆预设配置面板的纯派生逻辑：顺序项视图模型、统计、扫描提示与本地审查文本。
// 不触碰 React state、onChange 或 DOM。
import type { STPresetOrderSlot, STPresetPrompt } from '@/models/stTypes';
import type { TavernRegexScriptSafety } from '@/contracts/ai';
import { detectTavernMacroInfo, type TavernMacroLevel } from '@/utils/tavernMacroDetect';
import { isPresetWorldInfoConstant, isPresetWorldInfoEnabled } from '@/utils/tavernPresetParsing';

export const TAVERN_RUNTIME_SLOT_IDS = new Set([
  'worldInfoBefore',
  'worldInfoAfter',
  'chatHistory',
  'personaDescription',
  'userInput',
  'user_input',
  'latestUserInput',
  'input',
]);

export type TavernSlotFilter = 'all' | 'enabled' | 'disabled' | 'runtime' | 'missing' | 'macro';

export interface TavernSlotViewModel {
  slot: STPresetOrderSlot;
  index: number;
  prompt: STPresetPrompt | undefined;
  content: string;
  macro: { level: TavernMacroLevel; macros: string[] };
  isRuntime: boolean;
  isMissing: boolean;
}

export interface TavernSlotStats {
  enabledSlotCount: number;
  runtimeSlotCount: number;
  unmatchedSlotCount: number;
  macroSlotCount: number;
  advancedMacroSlotCount: number;
  disabledRuntimeCount: number;
}

export function buildTavernSlotViewModels(
  orderSlots: STPresetOrderSlot[],
  promptMap: Map<string, STPresetPrompt>,
): TavernSlotViewModel[] {
  return orderSlots.map((slot, index) => {
    const prompt = promptMap.get(slot.identifier);
    const content = prompt?.content ?? '';
    const macro = detectTavernMacroInfo(content);
    const isRuntime = TAVERN_RUNTIME_SLOT_IDS.has(slot.identifier);
    const isMissing = !isRuntime && !prompt;
    return { slot, index, prompt, content, macro, isRuntime, isMissing };
  });
}

export function buildTavernSlotStats(slotViewModels: TavernSlotViewModel[]): TavernSlotStats {
  const enabledSlotCount = slotViewModels.filter((item) => item.slot.enabled).length;
  const runtimeSlotCount = slotViewModels.filter((item) => item.isRuntime).length;
  const unmatchedSlotCount = slotViewModels.filter((item) => item.isMissing).length;
  const macroSlotCount = slotViewModels.filter((item) => item.macro.level !== 'none').length;
  const advancedMacroSlotCount = slotViewModels.filter((item) => item.macro.level === 'advanced').length;
  const disabledRuntimeCount = slotViewModels.filter((item) => item.isRuntime && !item.slot.enabled).length;
  return { enabledSlotCount, runtimeSlotCount, unmatchedSlotCount, macroSlotCount, advancedMacroSlotCount, disabledRuntimeCount };
}

export function filterTavernSlotViewModels(slotViewModels: TavernSlotViewModel[], filter: TavernSlotFilter): TavernSlotViewModel[] {
  if (filter === 'enabled') return slotViewModels.filter((item) => item.slot.enabled);
  if (filter === 'disabled') return slotViewModels.filter((item) => !item.slot.enabled);
  if (filter === 'runtime') return slotViewModels.filter((item) => item.isRuntime);
  if (filter === 'missing') return slotViewModels.filter((item) => item.isMissing);
  if (filter === 'macro') return slotViewModels.filter((item) => item.macro.level !== 'none');
  return slotViewModels;
}

export function findDuplicateSlotIdentifiers(orderSlots: STPresetOrderSlot[]): string[] {
  return Array.from(new Set(orderSlots.map((slot) => slot.identifier).filter((id, index, arr) => arr.indexOf(id) !== index)));
}

export function countWorldInfoEntries(worldInfoEntries: Array<Record<string, unknown>>): {
  enabledWorldInfoCount: number;
  constantWorldInfoCount: number;
} {
  const enabledWorldInfoCount = worldInfoEntries.filter(isPresetWorldInfoEnabled).length;
  const constantWorldInfoCount = worldInfoEntries.filter((entry) => isPresetWorldInfoEnabled(entry) && isPresetWorldInfoConstant(entry)).length;
  return { enabledWorldInfoCount, constantWorldInfoCount };
}

export function countRegexScripts(safety: TavernRegexScriptSafety[]): {
  enabledRegexScriptCount: number;
  riskyRegexScriptCount: number;
  enabledRiskyRegexScriptCount: number;
  blockedRegexScriptCount: number;
} {
  const enabledRegexScriptCount = safety.filter((item) => !item.disabled).length;
  const riskyRegexScriptCount = safety.filter((item) => item.risky).length;
  const enabledRiskyRegexScriptCount = safety.filter((item) => !item.disabled && item.risky).length;
  const blockedRegexScriptCount = safety.filter((item) => item.kind === 'blocked').length;
  return { enabledRegexScriptCount, riskyRegexScriptCount, enabledRiskyRegexScriptCount, blockedRegexScriptCount };
}

export interface TavernScanIssueInput {
  unmatchedSlotCount: number;
  disabledRuntimeCount: number;
  duplicateSlotCount: number;
  advancedMacroSlotCount: number;
  enabledWorldInfoCount: number;
  constantWorldInfoCount: number;
  regexScriptCount: number;
  enabledRiskyRegexScriptCount: number;
}

export function buildTavernScanIssues(input: TavernScanIssueInput): string[] {
  return [
    input.unmatchedSlotCount > 0 ? `${input.unmatchedSlotCount} 个顺序项没有匹配内容` : '',
    input.disabledRuntimeCount > 0 ? `${input.disabledRuntimeCount} 个运行时槽位被关闭` : '',
    input.duplicateSlotCount > 0 ? `${input.duplicateSlotCount} 个重复 identifier` : '',
    input.advancedMacroSlotCount > 0 ? `${input.advancedMacroSlotCount} 个条目含高级宏` : '',
    input.enabledWorldInfoCount > 80 ? `${input.enabledWorldInfoCount} 个 world_info 已启用，可能挤占上下文` : '',
    input.constantWorldInfoCount > 20 ? `${input.constantWorldInfoCount} 个 world_info 常驻条目，建议确认是否必要` : '',
    input.regexScriptCount > 0 ? `${input.regexScriptCount} 个 regex_scripts 已保留；安全输出清理类会在主剧情后处理执行` : '',
    input.enabledRiskyRegexScriptCount > 0 ? `${input.enabledRiskyRegexScriptCount} 个高风险 regex_scripts 处于启用状态（仍不会执行）` : '',
  ].filter(Boolean);
}

export interface TavernReviewContext {
  presetName: string;
  promptCount: number;
  orderSlotCount: number;
  enabledSlotCount: number;
  runtimeSlotCount: number;
  unmatchedSlotCount: number;
  macroSlotCount: number;
  advancedMacroSlotCount: number;
  disabledRuntimeCount: number;
  worldInfoEntryCount: number;
  enabledWorldInfoCount: number;
  constantWorldInfoCount: number;
  regexScriptCount: number;
  enabledRegexScriptCount: number;
  riskyRegexScriptCount: number;
  postProcessMode: string;
  scanIssues: string[];
}

export function buildTavernLocalReviewText(ctx: TavernReviewContext): string {
  const lines = [
    `预设：${ctx.presetName}`,
    `内容项：${ctx.promptCount}`,
    `顺序项：${ctx.orderSlotCount}`,
    `启用项：${ctx.enabledSlotCount}`,
    `运行时槽位：${ctx.runtimeSlotCount}`,
    `未匹配：${ctx.unmatchedSlotCount}`,
    `宏条目：${ctx.macroSlotCount}（高级宏 ${ctx.advancedMacroSlotCount}）`,
    `世界书：${ctx.worldInfoEntryCount}（启用 ${ctx.enabledWorldInfoCount}，常驻 ${ctx.constantWorldInfoCount}）`,
    `正则脚本：${ctx.regexScriptCount}（未禁用 ${ctx.enabledRegexScriptCount}，高风险 ${ctx.riskyRegexScriptCount}）`,
    `后处理：${ctx.postProcessMode}`,
    '',
    '本地扫描：',
    ...(ctx.scanIssues.length > 0 ? ctx.scanIssues.map((item) => `- ${item}`) : ['- 暂未发现结构性问题']),
    '',
    '建议：',
    ctx.disabledRuntimeCount > 0 ? '- 建议重新启用 chatHistory / userInput / worldInfo* 等运行时槽位。' : '- 运行时槽位状态正常。',
    ctx.unmatchedSlotCount > 0 ? '- 未匹配项不会注入正文，建议确认是否为预设占位符。' : '- prompt_order 引用基本完整。',
    ctx.advancedMacroSlotCount > 0 ? '- 高级宏集中条目不要轻易关闭，建议逐条查看右侧宏检测。' : '- 未发现高级宏集中风险。',
    ctx.enabledWorldInfoCount > 0 ? '- world_info 会按关键词命中后进入主剧情酒馆消息链，不影响独立系统。' : '- 未检测到附带 world_info。',
    ctx.regexScriptCount > 0 ? '- regex_scripts 仅放开安全输出清理类；HTML 注释、抗截断/抗空回占位等会在主剧情后处理清理，高风险脚本仍只展示和干跑。' : '- 未检测到附带 regex_scripts。',
    '- 我们会在消息链末尾保留格式保护和行动选项兜底，降低正文格式被预设破坏的风险。',
  ];
  return lines.join('\n');
}
