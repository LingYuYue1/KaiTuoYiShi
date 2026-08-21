// 变量模型 service：用独立 API config 把「正文」喂给一个轻量模型。
//
// 新协议：
// - 主输出是 <变量事实> JSON：AI 只提取事实，不直接猜路径、顺序和对象下标。
// - 前端把事实确定性转换成内部变量命令，再复用旧执行器校验/归一化/落库。
// - <变量更新> 继续保留为空块或少量兼容命令，避免旧存档/复杂字段立刻断链。

import type { API配置项 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { buildVariableRegistryPrompt, type VariableState } from '@/utils/variableRegistry';
import { parseVariableFacts } from '@/utils/variableFacts';
import { withRetries } from '@/services/ai/retry';
import { CANONICAL_CHARACTERS } from '@/data/canonicalCharacters';
import { COMPANION_ARCHIVE_WORLDBOOK_CONTENT as VAR_LEGACY_COMPANION_ARCHIVE } from '@/data/companionArchiveWorldbook';
import { VARIABLE_SYSTEM_WORLDBOOK_PROMPT as VAR_LEGACY_WORLDBOOK_PROMPT, NSFW_ARCHIVE_SEPARATION_RULE } from '@/data/variableWorldbook';
import { VARIABLE_COT_PROMPT as VAR_LEGACY_COT_PROMPT } from '@/prompts/cot/variableCot';
import { VARIABLE_OUTPUT_FORMAT_PROMPT as VAR_LEGACY_OUTPUT_FORMAT_PROMPT } from '@/prompts/cot/variableOutputFormat';
import type { 提示词模块 } from '@/models/prompts';
import type { 变量事实, 变量事实类型 } from '@/models/variableCommand';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';
import { 获取地点可用天气, 天气列表, 天气名映射 } from '@/data/weatherRules';

/** NSFW 基线候选：开启 NSFW 后，传给变量模型让它为缺少基线的 NPC 生成完整档案。 */
export interface NsfwBaselineCandidate {
  npcId: string;
  npcName: string;
  gender?: string;
  appearance?: string;
  personality?: string;
  intro?: string;
  existingNsfwArchive?: Record<string, unknown>;
}
/** NSFW 基线结果：从变量模型返回中解析出的基线档案。 */
export interface NsfwBaselineResult {
  npcId: string;
  /** 模型返回的 NSFW 档案对象（已解析为 JSON）；失败时为 null。 */
  archive: Record<string, unknown> | null;
}

export interface VariableModelRequest {
  /** 主模型刚写完的正文（已抽出 <正文> 块，不带其他标签）。 */
  body: string;
  /** 主剧情模型输出的 <变量草稿>，只作为候选线索，不直接落库。 */
  variableDraft?: string;
  /** 玩家本回合的输入（提供上下文，便于 AI 理解状态变化的来由）。 */
  userInput: string;
  /** 当前游戏回合数。 */
  turnCount: number;
  /** 当前变量状态快照（用来生成登记表）。 */
  state: VariableState;
  /** 手机来信种子是否允许落库；关闭时覆盖审计不要求 phone_seed。 */
  phoneSeedsEnabled?: boolean;
  /** NSFW 总开关：关闭时不得写 NSFW档案。 */
  nsfwEnabled?: boolean;
  /** 男性 NSFW 档案开关：默认 false，关闭时不得写男性身体档案。 */
  maleNsfwArchiveEnabled?: boolean;
  /** NSFW 开启时，缺少基线档案的 NPC 候选；变量模型会在同一轮为它们输出 nsfw_archive 事实。 */
  nsfwBaselineCandidates?: NsfwBaselineCandidate[];
  /**
   * 阶段1新增：recall 召回的历史通讯回忆（拼接文本）。
   * variableModel 可从中提取玩家与NPC在手机里建立的约定，写入NPC记录.约定[]（来源='通讯'）。
   * 执行顺序约束：recall 必须在 variableModel 之前执行，recallContext 依赖 recall 结果拼接。
   */
  recallContext?: string;
  signal?: AbortSignal;
  retryCount?: number;
  promptModules?: 提示词模块[];
}

export interface VariableModelResult {
  /** 模型的完整原始返回（含 <变量事实> 与兼容 <变量更新> 块）。 */
  rawText: string;
  /** 正文覆盖审计结果：用于区分完整落地、补写后落地和仍疑似遗漏。 */
  coverage?: VariableCoverageReport;
}

export interface VariableCoverageReport {
  candidateTypes: 变量事实类型[];
  initialTypes: 变量事实类型[];
  missingTypes: 变量事实类型[];
  reviewAttempted: boolean;
  supplementedTypes: 变量事实类型[];
  unresolvedTypes: 变量事实类型[];
}

interface VariableProtocolCheck {
  ok: boolean;
  issues: string[];
}

interface EmptyFactsReview {
  shouldRetry: boolean;
  npcNames: string[];
  cueSummary: string;
  /** 触发的是 NSFW 空档案复审（复审提示需要指向 nsfw_archive）。 */
  nsfwCue?: boolean;
}

interface VariableCoverageReview extends EmptyFactsReview {
  candidateTypes: 变量事实类型[];
  initialTypes: 变量事实类型[];
  missingTypes: 变量事实类型[];
}

const LIGHT_MEMORY_CUE_RE = /(一起|共同|同时|同桌|围坐|招呼|邀请|递给|递来|端出|分享|品尝|尝了|吃|喝|点心|糕点|奶酥|茶|咖啡|料理|手艺|食谱|评价|反馈|称赞|夸|吐槽|玩笑|闲聊|聊天|回应|看向|问|答|陪|安慰|训练|复盘|合照)/;
/** NSFW 开启时用于空档案复审的成人互动线索（只用于提示模型检查是否应写 nsfw_archive，不构成露骨正文）。 */
const NSFW_INTERACTION_CUE_RE = /(亲密|亲吻|拥抱|拥吻|肌肤|裸|褪去|解开|触碰|抚摸|喘息|呻吟|交缠|侵入|进入|结合|高潮|温存|事后|床|睡在|同床|赤裸|敏感|欲望|情欲|性|做爱|缠绵)/;
const TIME_COVERAGE_CUE_RE = /(?:\d{1,3}\s*(?:分钟|小时|天|日)|[一二三四五六七八九十百]+\s*(?:分钟|小时|天|日)|\b\d{1,2}:\d{2}\b|(?:上午|下午|晚上|深夜|凌晨|清晨|傍晚)\s*\d{1,2}(?:点|:\d{2})|几分钟|片刻后|不久后|一会儿后|过了片刻|过了(?:一阵|一段时间)|次日|第二天|翌日|隔天|跨日|跨夜|过夜|一夜过去|睡醒|醒来|天亮后|天黑后)/;
const LOCATION_COVERAGE_CUE_RE = /(?:抵达|到达|赶到|来到|进入|离开|前往|转移到|移动到|返回|回到|走进|踏入|驶入|降落在|登上|来到新的|换到).{0,36}(?:舱段|空间站|车厢|列车|城区|下层区|上层区|诊所|办公室|房间|街道|广场|基地|港口|码头|车站|宫殿|洞天|船|舰|星球|区域|地点|现场|主控|收容|维护|观景|行政|磐岩|贝洛伯格|仙舟|罗浮|匹诺康尼|翁法罗斯|雅利洛|黑塔)/;
const ITEM_COVERAGE_CUE_RE = /(?:获得|拿到|取得|领到|捡到|找到|得到|收下|接过|交给(?:玩家|你)|递给(?:玩家|你)|奖励|掉落).{0,30}(?:钥匙|权限卡|卡片|芯片|装置|武器|光锥|衣服|服装|饰品|徽章|样本|药剂|药|食物|点心|地图|纸条|信件|道具|物品|装备|纪念品|遗物)/;
const WEATHER_COVERAGE_CUE_RE = /(?:下(?:起|着)?雨|降雨|细雨|暴雨|飘雪|下雪|风雪|暴风雪|起雾|雾气弥漫|天气(?:突变|变化|转|骤)|放晴|晴朗的天空|雷声|闪电)/;
const PHONE_COVERAGE_CUE_RE = /(?:留下(?:联络方式|联系方式|通讯码|频道)|加上(?:好友|联系方式)|交换(?:联络|联系方式)|发来短信|收到短信|通讯器响|终端震动|联系我|保持联系|报平安|催进度|通讯码)/;
const AGREEMENT_COVERAGE_CUE_RE = /(?:约定|答应|承诺|说好|约好|保证|应允|履行约定|违约|失约|作废)/;
const WORLD_EVENT_COVERAGE_CUE_RE = /(?:爆炸|坍塌|损坏|修复完成|封锁|解封|撤离完成|公开宣布|正式启动|全员撤离|警报解除|事件结束)/;
const NPC_STATE_COVERAGE_CUE_RE = /(?:认可|认同|信任|更信任|感激|感谢|赞许|欣赏|警惕|怀疑|不满|反感|厌恶|疏远|亲近|和解|决裂|确认关系|成为恋人|分手|加入同行|离开队伍|好感|关系变化)/;

function readObjectString(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return '';
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function readObjectBoolean(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>)[key] === true;
}

function readObjectArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object') return [];
  const raw = (value as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw : [];
}

function nameAppearsInText(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.length > 1) return text.includes(trimmed);
  const escaped = trimmed.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`[【「『（(\\s，。！？；、:]${escaped}[】」』）)\\s，。！？；、:]`).test(text)
    || new RegExp(`${escaped}[：:和与也把将拿递说问笑看尝吃喝]`).test(text);
}

function collectImportantNpcNames(state: VariableState): string[] {
  const names = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) names.add(value.trim());
  };
  for (const def of CANONICAL_CHARACTERS) {
    add(def.name);
    def.aliases?.forEach(add);
  }
  const records = Array.isArray(state.NPC) ? state.NPC : [];
  for (const record of records) {
    const important = !readObjectBoolean(record, '归档') && (
      readObjectString(record, '阶位') === 'companion' ||
      readObjectBoolean(record, '同行') ||
      readObjectBoolean(record, '原著角色') ||
      readObjectArray(record, '同行记忆').length > 0 ||
      Boolean(readObjectString(record, '最近互动')) ||
      Boolean(readObjectString(record, '当前关系阶段'))
    );
    if (!important) continue;
    add(readObjectString(record, '姓名'));
    add(readObjectString(record, '别名'));
  }
  return [...names].filter((name) => name.length >= 1);
}

function collectPlayerNames(state: VariableState): string[] {
  const traveler = state.旅人;
  return [
    readObjectString(traveler, '姓名'),
    readObjectString(traveler, '别名'),
    '玩家',
    '旅人',
    '主角',
    '开拓者',
    '你',
  ].filter(Boolean);
}

function uniqueFactTypes(facts: 变量事实[]): 变量事实类型[] {
  const order: 变量事实类型[] = [
    'time',
    'location',
    'weather',
    'item',
    'npc',
    'phone_seed',
    'agreement',
    'agreement_status',
    'world_event',
    'nsfw_archive',
    'traveler_profile',
  ];
  const present = new Set(facts.map((fact) => fact.type));
  return order.filter((type) => present.has(type));
}

function mergeVariableFacts(initial: 变量事实[], supplement: 变量事实[]): 变量事实[] {
  const output = [...initial];
  const initialTypes = new Set(initial.map((fact) => fact.type));
  for (const fact of supplement) {
    if (fact.type === 'npc') {
      const existingIndex = output.findIndex((candidate) => candidate.type === 'npc' && sameNpcFactIdentity(candidate, fact));
      if (existingIndex >= 0) {
        output[existingIndex] = mergeSameVariableFact(output[existingIndex], fact);
      } else {
        output.push(fact);
      }
      continue;
    }
    // 首轮已经有该类别时，复审只负责补缺失类别；避免时间、地点、天气或物品重复结算。
    if (initialTypes.has(fact.type)) continue;
    output.push(fact);
  }
  return output;
}

function sameNpcFactIdentity(left: Extract<变量事实, { type: 'npc' }>, right: Extract<变量事实, { type: 'npc' }>): boolean {
  const leftId = left.id?.trim();
  const rightId = right.id?.trim();
  if (leftId && rightId && leftId === rightId) return true;
  const leftName = left.name.trim();
  const rightName = right.name.trim();
  return Boolean(leftName && rightName && leftName === rightName);
}

function mergeSameVariableFact(initial: 变量事实, supplement: 变量事实): 变量事实 {
  if (initial.type !== supplement.type) return initial;
  if (initial.type === 'npc' && supplement.type === 'npc') {
    const mergeArray = (left?: string[], right?: string[]) => {
      const values = [...(left ?? []), ...(right ?? [])].map((value) => value.trim()).filter(Boolean);
      return values.length ? [...new Set(values)] : undefined;
    };
    const merged: Record<string, unknown> = { ...supplement };
    for (const [key, value] of Object.entries(initial)) {
      // 归一化事实会保留大量 undefined 可选字段；只有首轮真正给出的字段才覆盖补写。
      if (value !== undefined) merged[key] = value;
    }
    return {
      ...merged,
      sharedExperiences: mergeArray(initial.sharedExperiences, supplement.sharedExperiences),
      openItems: mergeArray(initial.openItems, supplement.openItems),
      unresolvedConflicts: mergeArray(initial.unresolvedConflicts, supplement.unresolvedConflicts),
      mustRemember: mergeArray(initial.mustRemember, supplement.mustRemember),
      doNotForget: mergeArray(initial.doNotForget, supplement.doNotForget),
    } as unknown as typeof initial;
  }
  // 对同一实体的补写，首轮已确认字段优先，复审只补首轮没有的字段。
  const merged: Record<string, unknown> = { ...supplement };
  for (const [key, value] of Object.entries(initial)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as typeof initial;
}

function replaceVariableFactsBlock(rawText: string, facts: 变量事实[]): string {
  const block = `<变量事实>\n${JSON.stringify({ facts }, null, 2)}\n</变量事实>`;
  if (/<变量事实>[\s\S]*?<\/变量事实>/i.test(rawText)) {
    return rawText.replace(/<变量事实>[\s\S]*?<\/变量事实>/i, block);
  }
  return `${rawText.trim()}\n${block}`.trim();
}

function detectCoverageCandidates(request: VariableModelRequest): 变量事实类型[] {
  const bodyAndInput = [request.body, request.userInput].filter(Boolean).join('\n');
  const sourceText = [bodyAndInput, request.variableDraft ?? ''].filter(Boolean).join('\n');
  const candidates = new Set<变量事实类型>();

  if (TIME_COVERAGE_CUE_RE.test(bodyAndInput) || TIME_COVERAGE_CUE_RE.test(request.variableDraft ?? '')) candidates.add('time');
  if (LOCATION_COVERAGE_CUE_RE.test(bodyAndInput) || LOCATION_COVERAGE_CUE_RE.test(request.variableDraft ?? '')) candidates.add('location');
  if (ITEM_COVERAGE_CUE_RE.test(bodyAndInput) || ITEM_COVERAGE_CUE_RE.test(request.variableDraft ?? '')) candidates.add('item');
  if (WEATHER_COVERAGE_CUE_RE.test(bodyAndInput)) candidates.add('weather');
  if (request.phoneSeedsEnabled !== false && PHONE_COVERAGE_CUE_RE.test(bodyAndInput)) candidates.add('phone_seed');
  const agreementStatusCue = /(?:履行|违约|失约|作废).{0,12}(?:约定|承诺)|(?:约定|承诺).{0,12}(?:履行|违约|失约|作废)/.test(bodyAndInput);
  if (agreementStatusCue) candidates.add('agreement_status');
  else if (AGREEMENT_COVERAGE_CUE_RE.test(bodyAndInput)) candidates.add('agreement');
  if (WORLD_EVENT_COVERAGE_CUE_RE.test(bodyAndInput)) candidates.add('world_event');
  if (request.nsfwEnabled && NSFW_INTERACTION_CUE_RE.test(bodyAndInput)) candidates.add('nsfw_archive');

  const npcNames = collectImportantNpcNames(request.state);
  const hasNpcName = npcNames.some((name) => nameAppearsInText(sourceText, name));
  const npcDraftCue = /(?:npc|伙伴|角色|好感|关系|同行|最近互动|共同经历|长期印象)/i.test(request.variableDraft ?? '');
  if (hasNpcName && (LIGHT_MEMORY_CUE_RE.test(bodyAndInput) || NPC_STATE_COVERAGE_CUE_RE.test(bodyAndInput) || npcDraftCue)) candidates.add('npc');

  return uniqueFactTypes([...candidates].map((type) => ({ type } as 变量事实)));
}

function reviewVariableModelCoverage(rawText: string, request: VariableModelRequest): VariableCoverageReview {
  const parsed = parseVariableFacts(rawText);
  const initialTypes = uniqueFactTypes(parsed.facts);
  const candidateTypes = detectCoverageCandidates(request);
  const emptyReview = reviewVariableModelContent(rawText, request);
  if (emptyReview.shouldRetry && !candidateTypes.includes(emptyReview.nsfwCue ? 'nsfw_archive' : 'npc')) {
    candidateTypes.push(emptyReview.nsfwCue ? 'nsfw_archive' : 'npc');
  }
  const missingTypes = candidateTypes.filter((type) => !initialTypes.includes(type));
  return {
    ...emptyReview,
    shouldRetry: missingTypes.length > 0,
    candidateTypes,
    initialTypes,
    missingTypes,
  };
}

function buildVariableCoverageReviewPrompt(review: VariableCoverageReview): string {
  const missing = review.missingTypes.join('、');
  const lines = [
    '变量事实覆盖复审：上一版协议完整，但正文中存在高置信度类别没有出现在已接受 facts 中。',
    `疑似缺失类别：${missing || '无'}。`,
    `上一版已接受类别：${review.initialTypes.join('、') || '无'}。`,
    '只补写下面明确缺失的类别，不要重写、重复或抵消上一版已经接受的事实。',
    '只依据主模型回复正文和玩家输入；变量草稿只能作为线索，不能单独制造事实。',
    '如果复审后确认正文并未真正发生某类变化，可以不输出该类，并在 thinking 中说明依据。',
    '复审输出必须仍包含完整三个标签：<thinking>、<变量事实>、<变量更新>。',
    '允许输出的缺失类别规则：',
  ];
  if (review.missingTypes.includes('time')) lines.push('- time：正文明确写出耗时、跨日、睡醒、次日或具体时间变化时才写；不要机械推进。');
  if (review.missingTypes.includes('location')) lines.push('- location：正文明确抵达、离开、进入或转移到新地点时写当前地点。');
  if (review.missingTypes.includes('item')) lines.push('- item：只有获得具体实体物品时写；坐标、权限、线索等纯信息不得写入背包。');
  if (review.missingTypes.includes('npc')) lines.push('- npc：重要 NPC 与玩家发生具体共同动作、态度变化、关系变化或可承接互动时写低风险 NPC 事实。');
  if (review.missingTypes.includes('phone_seed')) lines.push('- phone_seed：正文出现留下联系方式、建立通讯入口、任务跟进或关系后续时，最多补 1 条低频种子。');
  if (review.missingTypes.includes('agreement')) lines.push('- agreement：正文明确形成新的约定、承诺或答应事项时写。');
  if (review.missingTypes.includes('agreement_status')) lines.push('- agreement_status：正文明确履行、违约、失约或作废既有约定时写。');
  if (review.missingTypes.includes('weather')) lines.push('- weather：只有正文明确天气变化或稳定天气状态时写。');
  if (review.missingTypes.includes('world_event')) lines.push('- world_event：正文明确发生了可被后续引用的客观世界结果时写。');
  if (review.missingTypes.includes('nsfw_archive')) lines.push('- nsfw_archive：NSFW 已开启且正文明确发生成人亲密互动或长期关系变化时写。');
  lines.push('复审确认没有可补事实时，输出 {"facts":[]}，不要为了填类别而猜测。', '请从零输出本次复审协议，不要复述上一版完整 facts。');
  return lines.join('\n');
}

function reviewVariableModelContent(rawText: string, request: VariableModelRequest): EmptyFactsReview {
  const parsed = parseVariableFacts(rawText);
  if (parsed.parseErrors.length || parsed.facts.length > 0) {
    return { shouldRetry: false, npcNames: [], cueSummary: '' };
  }
  const sourceText = [
    request.body,
    request.variableDraft ?? '',
    request.userInput,
  ].join('\n');

  // NSFW 空档案复审：NSFW 开启、facts 为空、正文命中成人互动线索时，
  // 提示模型检查是否应写 nsfw_archive（与日常轻记忆复审互相独立）。
  if (request.nsfwEnabled && NSFW_INTERACTION_CUE_RE.test(sourceText)) {
    const npcNames = collectImportantNpcNames(request.state)
      .filter((name) => nameAppearsInText(sourceText, name))
      .slice(0, 6);
    const hasPlayerReference = collectPlayerNames(request.state)
      .some((name) => nameAppearsInText(sourceText, name));
    if (npcNames.length && (hasPlayerReference || /(玩家|旅人|主角|开拓者|你)/.test(sourceText))) {
      return {
        shouldRetry: true,
        npcNames,
        cueSummary: 'NSFW 总开关已开启且正文命中成人互动线索，但 <变量事实> 为空，未写入 nsfw_archive',
        nsfwCue: true,
      };
    }
  }

  if (!LIGHT_MEMORY_CUE_RE.test(sourceText)) {
    return { shouldRetry: false, npcNames: [], cueSummary: '' };
  }
  const npcNames = collectImportantNpcNames(request.state)
    .filter((name) => nameAppearsInText(sourceText, name))
    .slice(0, 6);
  if (!npcNames.length) {
    return { shouldRetry: false, npcNames: [], cueSummary: '' };
  }
  const hasPlayerReference = collectPlayerNames(request.state)
    .some((name) => nameAppearsInText(sourceText, name));
  if (!hasPlayerReference && !/(玩家|旅人|主角|开拓者|你|一同|一起|共同|同时)/.test(sourceText)) {
    return { shouldRetry: false, npcNames: [], cueSummary: '' };
  }
  return {
    shouldRetry: true,
    npcNames,
    cueSummary: '正文命中重要 NPC 与玩家的共同日常互动线索，但 <变量事实> 为空',
  };
}

/** 变量模型的 system prompt：事实协议 + 登记表 + 兼容命令协议。 */
export function buildVariableModelPrompt(
  state: VariableState,
  nsfwPolicy?: { enabled?: boolean; maleArchiveEnabled?: boolean; baselineCandidates?: NsfwBaselineCandidate[] },
  promptModules?: 提示词模块[],
): string {
  const registry = buildVariableRegistryPrompt(state);
  const nsfwEnabled = Boolean(nsfwPolicy?.enabled);
  const maleArchiveEnabled = Boolean(nsfwPolicy?.maleArchiveEnabled);
  const baselineCandidates = nsfwPolicy?.baselineCandidates?.filter((c) => c.npcName) ?? [];

  // 天气判断所需上下文：当前地点、当前天气、可用天气列表
  const worldState = (state.世界 ?? {}) as { 当前地点?: string; 当前天气?: string };
  const currentLocation = worldState.当前地点?.trim() || '未知';
  const currentWeatherId = worldState.当前天气?.trim() || 'clear';
  const currentWeatherName = 天气名映射[currentWeatherId] ?? currentWeatherId;
  const availableWeatherIds = 获取地点可用天气(currentLocation);
  const availableWeatherDesc = availableWeatherIds
    .map((id) => {
      const def = 天气列表.find((w) => w.id === id);
      return def ? `${def.emoji} ${def.name}` : id;
    })
    .join('、');

  const modulesSection = buildVariablePromptModulesSection(promptModules, nsfwEnabled);

  return [
    modulesSection || [
    '你是一个变量事实提取与结算模型，不是主剧情叙述者。',
    '你的任务是阅读本回合正文和主模型的 <变量草稿>，提取“已经台前发生、可以落库”的事实。',
    '默认不要直接写底层变量路径命令；路径、顺序、日期/天数对齐、NPC 建档和对象归一化由前端规则层处理。',
    '',
    '## 输出协议（必须严格遵守）',
    '',
    '输出顺序固定为：',
    '1. 一个 <thinking>...</thinking> 调试段；',
    '2. 一个 <变量事实>...</变量事实> JSON 块；',
    '3. 一个 <变量更新>...</变量更新> 兼容块。',
    '',
    '<变量事实> 必须是合法 JSON，推荐格式：',
    '```json',
    '{"facts":[{"type":"location","location":"黑塔空间站·主控舱段","evidence":"正文写明抵达主控舱段"}]}',
    '```',
    '',
    '没有可落库事实时输出：',
    '```json',
    '{"facts":[]}',
    '```',
    '',
    '<变量更新> 是旧协议兼容层：默认留空。只有事实协议无法表达、且登记表明确允许、且正文证据非常清楚的复杂字段，才可以少量写旧命令。',
    '时间、地点、天气、NPC、物品、世界事件、手机来信种子必须优先写进 <变量事实>，不要再用旧命令直接写这些路径。旅人核心档案由玩家手写维护，不由变量系统修改。',
    '',
    '## 变量事实类型',
    '',
    '### 旅人核心档案只读',
    '- 旅人的姓名、别名、性别、年龄、生日、身高、身份、外貌、性格、背景、能力、专长知识、头像和图像档案由玩家手写维护。',
    '- 变量模型不得输出 traveler_profile，也不得在旧 <变量更新> 中 set/push/delete 这些字段。',
    '- 剧情中获得的新身份称呼、临时伪装、别人对玩家能力的认知，写入 NPC.memory、world_event、item 或正文承接；不要改旅人档案本体。',
    '- 玩家服装变化、外观变化若未通过玩家档案编辑确认，不落库；可以在正文和短期记忆中承接。',
    '',
    '### 时间：time',
    '- 字段：mode、minutes、targetTime、evidence。',
    '- mode 可用：no_change / elapsed / set_time / overnight / next_day。',
    '- elapsed 只写分钟数，普通回合 1-5 分钟；复杂回合通常不超过 15 分钟；超过 30 分钟必须有正文明确证据。',
    '- 如果正文明确“第二天 / 次日 / 一夜过去 / 睡醒 / 跨夜后凌晨”，用 next_day 或 overnight，并可带 targetTime。',
    '- 如果同日只是“几分钟后”，用 elapsed；不要自己重算日期。',
    '- 不要直接在旧命令里写 `世界.当前日期`、`世界.开拓天数`、`世界.当前时间`，让代码处理。',
    '',
    '示例：',
    '{"type":"time","mode":"elapsed","minutes":4,"evidence":"正文写到几分钟后终端读条结束"}',
    '{"type":"time","mode":"next_day","targetTime":"00:02","evidence":"正文写明一夜过去，场景结束在次日凌晨"}',
    '',
    '### 地点：location',
    '- 字段：location、evidence。',
    '- 只有地点明显变化或正文首次明确当前地点时输出。',
    '',
    '### 天气：weather',
    '- 字段：weather（中文名）、evidence。',
    `- 当前地点：${currentLocation}`,
    `- 当前天气：${currentWeatherName}`,
    `此地可用天气：${availableWeatherDesc}`,
    '- 根据正文氛围和地点特征判断本回合天气是否变化。',
    '- 如果正文没有明显天气暗示（如"下雨了""风雪交加""星空璀璨"），不输出 weather 事实（保持上一回合天气不变）。',
    '- 不要频繁切换天气（至少持续 3-5 回合）。',
    '- weather 字段必须严格从「此地可用天气」的中文名中选择，如 "暴风雪"、"星海潮汐"。',
    '',
    '示例：',
    '{"type":"weather","weather":"小雨","evidence":"正文写明窗外开始飘起细雨"}',
    '',
    '### NPC：npc',
    '- 字段：id、name、alias、job、tier、gender、affinityDelta、affinitySet、intimateRelationship、following、appearance、clothing、speechStyle、personality、intro、playerAddress、memory、recentInteraction、longTermImpression、sharedExperiences、openItems、unresolvedConflicts、mustRemember、doNotForget、evidence。',
    '- gender 表示角色性别，可选值：男 / 女 / 其他。新建 NPC 时应尽量提供 gender；从正文可判断角色性别时也应输出。',
    '- name 是必填字段；即使已经写了 id，也要写中文姓名，例如 `{"id":"npc_march7th","name":"三月七"}`。姓名必须是真实姓名或稳定专名；“女科员”“店员”“年轻人”等泛称不得新建 NPC，职业/身份写入 job。',
    '- 单条 memory、recentInteraction 或一次 affinityDelta 不得直接把路人晋升为 companion；自动晋升要求好感度 >=20 且累计有效互动 >=2 次，玩家手动降级优先。',
    '- 完整写入规则见下方“变量系统世界书（必须遵守）”中的 `<NPC档案记忆写入法则>`；本节只列事实字段和示例。',
    '- 原著角色的长期 personality / 性格 不由变量系统改写；长期口吻、人格与行为边界以智库人物主体资料校准。',
    '- 不要把“本回合沉默/紧张/冷淡”固化成长期性格；这类单回合状态只写进 memory、recentInteraction、openItems、unresolvedConflicts、mustRemember、doNotForget 或 world_event。',
    '- 好感度范围是 -50..150；关系阶段由前端自动派生，禁止输出 relation/relationshipStage。intimateRelationship 只在正文明确建立或解除亲密关系时输出，不能由好感度推断，也不受 NSFW 开关控制。',
    '',
    '重要 NPC 的低风险日常轻记忆：',
    '- 对已入档、原著角色、同行角色、当前镜头重点角色、具名原创角色，只要正文写明他们与玩家发生了具体共同互动，就应审计 npc 事实；不要求一定有任务、冲突或好感变化。',
    '- 具名原创角色（非原著、由剧情或玩家互动产生的有名字角色）同样可以是重要 NPC。判断标准：有具体姓名或稳定称呼、与玩家发生过可承接的互动、后续剧情中可能再次出现或被引用。不要因为不是原著角色就默认跳过。',
    '- 共同互动包括：一起吃饭/喝茶/品尝点心、一起训练或复盘、共同观看/调查某物、互相开玩笑、角色招呼玩家参与日常、等待玩家评价自己的手艺、对玩家反应作出明确回应。',
    '- 这类事实只写低风险字段：memory、recentInteraction、sharedExperiences、longTermImpression。没有明确升温/冲突时，不写 affinityDelta 或 intimateRelationship。',
    '- 多人日常场景优先写 1-3 位与玩家直接交集最强的 NPC：递东西/发起邀请者、与玩家同步行动者、等待玩家反馈者。只在旁边说一句无承接价值的话的角色可以跳过。',
    '- “纯寒暄不落库”只适用于没有具体对象、没有共同动作、没有可下次引用细节的问候；不要把重要 NPC 的共同日常全部判成无事实。',
    '- affinityDelta / affinitySet 的审计一视同仁：同等互动强度对男性 NPC、女性 NPC、其他性别 NPC 都应给出同等级别的好感变化；不要因为角色性别不同就只写 memory 不写好感。',
    '',
    'NPC 账本示例：',
    '{"type":"npc","id":"npc_march7th","name":"三月七","memory":"三月七把寻找失踪科员的请求交给玩家，并给了备用通讯码。","recentInteraction":"三月七在主控舱段委托玩家寻找失踪科员，并约定用备用通讯码联系。","sharedExperiences":["在主控舱段约定一起追查失踪科员"],"openItems":["帮三月七寻找失踪科员并回传线索"],"mustRemember":["三月七给过玩家备用通讯码，后续联系不能写成陌生人"],"evidence":"正文写明三月七交给玩家备用通讯码并委托追查"}',
    '{"type":"npc","id":"npc_danheng","name":"丹恒","memory":"丹恒发现玩家隐瞒了星核线索，暂时压下质问但保留警惕。","recentInteraction":"丹恒要求玩家解释星核线索来源，玩家没有完全说明。","unresolvedConflicts":["玩家隐瞒星核线索来源，丹恒尚未完全信任解释"],"doNotForget":["丹恒已经察觉玩家隐瞒星核线索，冲突解决前不能写成毫无芥蒂"],"evidence":"正文写明丹恒沉默片刻后要求玩家之后给出完整解释"}',
    '{"type":"npc","id":"npc_danheng","name":"丹恒","gender":"男","affinityDelta":2,"memory":"丹恒在玩家按约带回星核调查线索后，认可了玩家在关键环节上的可靠性。","recentInteraction":"玩家按约带回线索，丹恒明确表示这次配合很稳妥。","sharedExperiences":["一起完成星核线索复核"],"evidence":"正文写明丹恒因玩家兑现调查承诺而认可其判断"}',
    '{"type":"npc","id":"npc_march7th","name":"三月七","intimateRelationship":true,"memory":"三月七与玩家明确确认彼此为恋人。","mustRemember":["三月七与玩家已明确建立恋爱关系，除非正文明确分手否则持续有效"],"evidence":"正文写明双方确认恋爱关系"}',
    '{"type":"npc","id":"npc_march7th","name":"三月七","memory":"三月七在观景车厢招呼玩家一起品尝帕姆做的蜂蜜奶酥，记下玩家愿意参与列车日常。","recentInteraction":"三月七和玩家在观景车厢一起尝蜂蜜奶酥，气氛轻松。","sharedExperiences":["在观景车厢一起品尝帕姆做的蜂蜜奶酥"],"evidence":"正文写明三月七主动招呼玩家吃点心，玩家实际品尝"}',
    '{"type":"npc","id":"npc_stelle","name":"星","memory":"星和玩家在观景车厢同步拿起蜂蜜奶酥，并用营养膏玩笑给出正面评价。","recentInteraction":"星与玩家一起尝点心，用轻松吐槽回应帕姆的手艺。","sharedExperiences":["在观景车厢一起尝蜂蜜奶酥并评价味道"],"evidence":"正文写明星和玩家同时拿点心，星给出正面评价"}',
    '{"type":"npc","name":"陈老伯","gender":"男","memory":"陈老伯在玩家帮助修复通讯塔后，留下自己的联络频道，表示以后有需要可以找他。","recentInteraction":"陈老伯委托玩家修复通讯塔，事后主动留下联络方式。","openItems":["陈老伯留给玩家的联络频道，后续可主动联系"],"evidence":"正文写明陈老伯委托修复并留下联络频道"}',
    '',
    '### 物品：item',
    '- 字段：action="gain"、category、name、description、quantity、quality、stackable、source、sourceDescription、narrativeEffects、evidence。',
    '- category 只能是 food / consumable / lightcone / weapon / clothing / accessory / memento / key。',
    '- 物品必须有具体名称和描述；模糊的“一些东西”不落库。',
    '- 坐标、位置、路线、权限信息、口令、线索、情报、消息、资料、名单、地址等“信息本身”不是背包物品，不得写 item；请改写为 world_event、npc.memory、phone_seed 或正文承接。',
    '- 只有实体载体才可入背包，例如权限卡、纸质地图、数据芯片、纸条、钥匙、徽章、样本、装置、存储器；名称必须体现实体载体，不能把“黑塔办公室坐标”这类纯信息伪装成 key 道具。',
    '- 物品只写叙事效果，不写旧属性加成，不写装备槽位或穿戴状态。',
    '',
    '### 世界事件：world_event',
    '- 字段：text、evidence。',
    '- 用于可被后续剧情引用的客观结果，例如区域损坏、撤离完成、组织动向、公开事件。',
    '- 新闻 root 由独立新闻系统维护，不写新闻变量。',
    '',
    '### 手机来信种子：phone_seed',
    '- 字段：targetType、targetId、targetName、title、context、triggerType、priority、relatedNpcIds、evidence。',
    '- 只生成“稍后可能发短信”的种子，不写完整 messages。',
    '- 每回合最多 0-2 条，普通寒暄不生成；但出现新约定、分头行动、任务进展、关系变化、危机收束、抵达新地点、关键物品、新闻苗头或 NPC 合理会追问/报平安/催进度时，必须审计是否写 1 条低频 phone_seed。',
    '- phone_seed 可以是 low/normal，不必都写 high；低频跟进也能让手机系统保持活性。不要因为担心打扰而完全不写。',
    '- targetName 必填：写中文 NPC 名（如"三月七"）。relatedNpcIds 尽量写对应 NPC id；系统会转成联系人入口。',
    '- 群聊种子 targetType 用 "group"，targetName 写群名或发起者名，relatedNpcIds 写至少 2 个参与者 id 或中文名。',
    '',
    '## 变量系统世界书（必须遵守）',
    '',
    VAR_LEGACY_WORLDBOOK_PROMPT,
    '',
    '## 伙伴档案写作规范',
    '',
    VAR_LEGACY_COMPANION_ARCHIVE,
    '',
    '## 变量系统思维链（内部执行，用于 thinking 结构）',
    '',
    VAR_LEGACY_COT_PROMPT,
    '',
    '## 旧 <变量更新> 兼容命令格式',
    '',
    '```',
    '<action> <path> = <json_value>',
    '```',
    '- action 可用 set / add / sub / push / delete。',
    '- path 必须出现在下面登记表中。',
    '- delete 可省略值。',
    '- 兼容命令不得用于 time / location / item / world_event / phone_seed 能表达的事实；不得写旅人核心档案；NPC 的关系、好感、同行、称呼、档案字段和同行记忆也默认用 npc fact 表达。',
    `- 只有事实协议无法表达、且登记表明确允许的复杂 NPC 子档案（例如${nsfwEnabled ? ' NSFW档案、' : ''}图像档案等）才少量使用旧命令；不要用旧命令重复写 npc.memory 已能表达的同行记忆。`,
    '',
    '## thinking 输出规范',
    '',
    '<thinking> 必须按 6 步写，方便玩家调试：',
    '1. 提取事实：正文中已发生、已确认、可落库的事实。',
    '2. 排除项：纯氛围、猜测、未来计划、智库/忆庭/新闻/旧战斗字段等为什么不落库。',
    '3. 对象合并：NPC、物品、联系人是否已有对象，是否应合并。',
    '4. 时间地点：是否真的耗时、是否跨日、地点是否变化。',
    '5. 事实计划：准备写入哪些 <变量事实>，逐条列出 type。',
    '6. 兼容命令：是否需要旧 <变量更新>；通常写“无，事实协议已覆盖”。',
    '',
    '## 严格约束',
    '',
    '- 禁止在三个标签以外输出解释、正文复述或闲聊。',
    '- <变量事实> 只允许 JSON，不要 Markdown 列表、注释或省略号。',
    '- 只记录正文和变量草稿能相互印证的已发生事实；变量草稿不是命令，不能直接照抄落库。',
    '- 剧情编织滑窗、智库资料、新闻苗头、即时剧情回顾和剧情回忆都是主剧情生成前的参考材料；只有它们被本回合 <正文> 写成台前已发生事实后，才允许落库。',
    '- 不要把剧情编织当前段、后续段、原著分段结果、未触发敌人、未抵达地点或未登场 NPC 当成本回合变量事实。',
    '- 不要输出 traveler_profile；旅人核心档案保护优先于正文里的临时描述。',
    '- 不确定就不写。宁可漏掉轻微变量，也不要写错对象、错日期、错路径。',
    ].filter(Boolean).join('\n'),
    ...(nsfwEnabled ? [
      '',
      '### NSFW 档案：nsfw_archive',
      '- 字段：npcId、npcName、enabled、ageConfirm、intimacyStage、boundaries、preferences、sensitivePoints、taboos、femaleBodyArchive、maleBodyArchive、experiences、longTermFacts、tags、notes、evidence。',
      '- 对象是已入档重要 NPC（companion / 同行 / 原著角色）、本回合正文出现成人向亲密互动或长期关系变化时，应输出 nsfw_archive 事实。',
      '- 年龄门禁已解除：ageConfirm 只作展示信息（adult / unknown / minor_blocked），不再限制身体档案、偏好、敏感点或经历的写入。unknown 也能正常写入完整档案。',
      '- 亲密事实/偏好/敏感点/身体档案必须来自本回合正文证据或已成立的关系基础，不凭空编造。',
      '- femaleBodyArchive 字段使用中文 key：胸部、女性私处、后庭、体态、体味。maleBodyArchive 字段使用：男性器、后庭、体态、体味。',
      maleArchiveEnabled === false ? '- 男性 NSFW 档案开关关闭时，不写 maleBodyArchive 或男性私密长期事实。' : '',
      '- 帕姆、史瓦罗等智械/机械/非人形对象禁止写 nsfw_archive；其余角色（包括年龄未标注的）按 NSFW 总开关正常处理。',
      '- 黑塔 / 大黑塔 / Herta / The Herta 是同一身份并明确允许建档；她的身体档案描述大黑塔的真实身体，不描述空间站傀儡、人偶或投影。',
      `- 示例：{"type":"nsfw_archive","npcName":"三月七","enabled":true,"ageConfirm":"unknown","intimacyStage":"暧昧试探","boundaries":"需要明确同意，不接受公开场合越界。","longTermFacts":["第12回合与玩家确认亲近前先确认边界。"],"tags":["慢热"],"evidence":"正文写明双方确认边界"}`,
    ] : []),
    ...(nsfwEnabled ? [
      '',
      '## NSFW 档案开关',
      `- 当前 NSFW 总开关：开启。`,
      `- 当前男性 NSFW 档案：${maleArchiveEnabled ? '开启' : '关闭'}。关闭时禁止写男性身体档案、男性私密部位和男性长期私密事实。`,
      '- NSFW 档案目前仍属于兼容旧命令范围；只有角色成人确认、且正文有稳定长期事实时才少量写入旧 <变量更新>。',
      '- NSFW 档案优先使用 <变量事实> 的 nsfw_archive，不要依赖旧路径命令；旧命令只作兜底。',
      '- 帕姆、佩佩、史瓦罗等智械/机械/非人形对象，以及怪物、裂界生物禁止写 NSFW 档案；其余角色（包括年龄未标注的）按 NSFW 总开关正常处理。',
      '- 黑塔 / 大黑塔 / Herta / The Herta 不受傀儡、人偶、投影关键词拦截；身体档案只描述大黑塔的真实身体。',
    ] : []),
    ...(nsfwEnabled && baselineCandidates.length > 0 ? [
      '',
      '## NSFW 基线档案补建',
      '- 本回合或近期对话暗示以下 NPC 与玩家已建立亲密关系，但还没有初始 NSFW 档案。如果正文有相关证据，优先为以下候选补建 nsfw_archive 基线档案：',
      ...baselineCandidates.map((c) => `  - ${c.npcName}${c.gender ? `（${c.gender}）` : ''}`),
      '',
      '- 基线档案要求：',
      '- 身体档案、经历可以尽量补齐（女性身体档案尽量补齐：胸部、女性私处、后庭、体态、体味；男性尽量补齐：男性器、后庭、体态、体味），但不确定的部位不硬凑。',
      '- 没有正文证据时不写经历、边界、偏好、敏感点、标签或占位文案；空档案壳由前端确定性建立。',
      '- ageConfirm 可先写 unknown，运行时会根据 NPC 档案自动修正。',
    ] : []),
    '',
    '---',
    '',
    '## 当前变量路径登记表（仅供兼容命令与对象识别参考）',
    '',
    registry,
  ].filter(Boolean).join('\n');
}

export function buildVariablePromptModulesSection(
  promptModules?: 提示词模块[],
  nsfwEnabled?: boolean,
): string {
  if (!promptModules || promptModules.length === 0) return '';
  const base = buildIndependentPromptModulesSection(promptModules, 'variable');
  if (!base) return '';
  if (nsfwEnabled) {
    return base + '\n\n' + NSFW_ARCHIVE_SEPARATION_RULE;
  }
  return base;
}

/** 调用变量模型，返回原始文本（待 parseVariableFacts / parseVariableCommands 解析）。 */
export async function callVariableModel(
  config: API配置项,
  request: VariableModelRequest,
): Promise<VariableModelResult> {
  const systemPrompt = buildVariableModelPrompt(request.state, {
    enabled: request.nsfwEnabled,
    maleArchiveEnabled: request.maleNsfwArchiveEnabled,
    baselineCandidates: request.nsfwBaselineCandidates,
  }, request.promptModules);

  const userMessage = [
    `## 第 ${request.turnCount} 回合的正文`,
    '',
    '玩家输入：',
    request.userInput || '（无）',
    '',
    '主模型变量草稿（候选事实，不是命令）：',
    request.variableDraft?.trim() || '（无）',
    '',
    '主模型回复正文：',
    request.body,
    '',
    '---',
    '',
    '请阅读上面的正文，输出 <thinking>、<变量事实> JSON 和兼容 <变量更新> 块。默认让 <变量更新> 留空。',
    '再次强调：只按"主模型回复正文"里实际发生的台前事实落库；剧情编织/智库/新闻/回忆材料如果没有进入正文，不是变量事实。',
    '重要补充：不要把重要 NPC 与玩家的共同日常全部判成无事实；一起吃点心、喝茶、训练、复盘、玩笑、等待评价等有具体对象和共同动作的场景，应审计低风险 npc 轻记忆。',
    '协议硬要求：即使没有任何可落库事实，也必须输出 `<变量事实>{"facts":[]}</变量事实>` 和空的 `<变量更新></变量更新>`；禁止只输出 thinking。',
  ].join('\n');

  // 阶段1约定系统·写入环：如果提供了 recallContext（通讯回忆），追加到 userMessage
  // 让 AI 从通讯回忆中提取玩家与NPC在手机里建立的约定，用 agreement 事实输出
  const recallContextText = request.recallContext?.trim();
  const finalUserMessage = recallContextText
    ? `${userMessage}\n\n---\n\n## 历史通讯回忆（来自忆庭recall，用于约定提取）\n\n以下是本回合召回的历史通讯回忆。这些回忆里的内容不是本回合正文发生的事，不应作为本回合变量事实落库（除非正文也写了）。但你可以从中提取玩家与NPC在手机里建立的"约定/承诺"，用 agreement 事实输出。\n\n${recallContextText}`
    : userMessage;

  const requestOnce = (messages: Array<{ role: string; content: string }>) =>
    chatCompletionNonStream(config, {
      messages,
      systemPrompt,
      signal: request.signal,
      // 变量模型需要保留可检查的 thinking + facts + 少量兼容命令。
      // 未单独配置时给完整审计留足空间；显式覆盖仍尊重玩家设置。
      maxTokens: config.maxTokens ?? 3200,
      // 较低温度，减少幻觉。
      temperature: config.temperature ?? 0.25,
    });

  let rawText = await withRetries(
    () => requestOnce([{ role: 'user', content: finalUserMessage }]),
    { retries: request.retryCount ?? 0, signal: request.signal, label: '变量模型' },
  );

  let protocol = checkVariableModelProtocol(rawText);
  let coverage: VariableCoverageReport | undefined;
  if (!protocol.ok) {
    rawText = await withRetries(
      () => requestOnce([
        { role: 'user', content: finalUserMessage },
        { role: 'assistant', content: '（上一版输出协议不完整，请按下方指令从零重新输出完整三个标签，不要延续上一版残缺结构。）' },
        { role: 'user', content: buildVariableProtocolRepairPrompt(protocol) },
      ]),
      { retries: 1, signal: request.signal, label: '变量模型协议修复' },
    );
    protocol = checkVariableModelProtocol(rawText);
  }

  if (!protocol.ok) {
    rawText = ensureVariableProtocolFallback(rawText);
  } else {
    const contentReview = reviewVariableModelCoverage(rawText, request);
    const initialFacts = parseVariableFacts(rawText).facts;
    coverage = {
      candidateTypes: contentReview.candidateTypes,
      initialTypes: contentReview.initialTypes,
      missingTypes: contentReview.missingTypes,
      reviewAttempted: false,
      supplementedTypes: [],
      unresolvedTypes: contentReview.missingTypes,
    };
    if (contentReview.shouldRetry) {
      coverage.reviewAttempted = true;
      const initialRawText = rawText;
      const supplementRawText = await withRetries(
        () => requestOnce([
          { role: 'user', content: finalUserMessage },
          { role: 'assistant', content: initialRawText },
          { role: 'user', content: buildVariableCoverageReviewPrompt(contentReview) },
        ]),
        { retries: 1, signal: request.signal, label: '变量模型覆盖复审' },
      );
      protocol = checkVariableModelProtocol(supplementRawText);
      const normalizedSupplement = protocol.ok
        ? supplementRawText
        : ensureVariableProtocolFallback(supplementRawText);
      const supplement = parseVariableFacts(normalizedSupplement);
      const mergedFacts = mergeVariableFacts(initialFacts, supplement.facts);
      const supplementTypes = uniqueFactTypes(supplement.facts);
      const mergedTypes = uniqueFactTypes(mergedFacts);
      // 覆盖复审只负责补缺失事实，不能让首轮已接受的兼容命令消失或重复结算。
      rawText = replaceVariableFactsBlock(initialRawText, mergedFacts);
      coverage.supplementedTypes = supplementTypes.filter((type) => !contentReview.initialTypes.includes(type));
      coverage.unresolvedTypes = contentReview.missingTypes.filter((type) => !mergedTypes.includes(type));
    }
  }

  return { rawText, coverage };
}

function checkVariableModelProtocol(rawText: string): VariableProtocolCheck {
  const issues: string[] = [];
  if (!/<thinking>[\s\S]*?<\/thinking>/i.test(rawText) && !/<think>[\s\S]*?<\/think>/i.test(rawText)) {
    issues.push('缺少 <thinking>');
  }
  if (!/<变量事实>[\s\S]*?<\/变量事实>/i.test(rawText)) {
    issues.push('缺少 <变量事实>');
  }
  if (!/<变量更新>[\s\S]*?<\/变量更新>/i.test(rawText)) {
    issues.push('缺少 <变量更新>');
  }
  return { ok: issues.length === 0, issues };
}

function buildVariableProtocolRepairPrompt(protocol: VariableProtocolCheck): string {
  return [
    '变量模型协议修复：上一版输出不完整。',
    `失败项：${protocol.issues.join('；') || '未知协议错误'}。`,
    '请不要继续解释，不要复述正文，只重新输出完整三个标签：',
    '1. <thinking>：简短说明提取到什么事实；',
    '2. <变量事实>：必须是合法 JSON。没有可落库事实时输出 {"facts":[]}；',
    '3. <变量更新>：必须存在，默认留空。',
    '请从零开始重新输出，不要延续上一版的残缺结构，也不要复述上一版内容。',
  ].join('\n');
}

function ensureVariableProtocolFallback(rawText: string): string {
  const thinking = (() => {
    const matched = rawText.match(/<thinking>([\s\S]*?)<\/thinking>/i)
      ?? rawText.match(/<think>([\s\S]*?)<\/think>/i);
    const text = matched?.[1]?.trim();
    return text || '变量模型未返回完整协议；前端使用空事实兜底，避免错误落库。';
  })();
  const factsBlock = rawText.match(/<变量事实>[\s\S]*?<\/变量事实>/i)?.[0]
    ?? '<变量事实>\n{"facts":[]}\n</变量事实>';
  const updatesBlock = rawText.match(/<变量更新>[\s\S]*?<\/变量更新>/i)?.[0]
    ?? '<变量更新>\n</变量更新>';
  return [
    '<thinking>',
    thinking,
    '</thinking>',
    factsBlock,
    updatesBlock,
  ].join('\n');
}
