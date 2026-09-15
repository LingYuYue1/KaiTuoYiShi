// 变量命令协议：AI 通过 <变量更新>...</变量更新> 块输出一组命令，由系统解析后修改 state。
// 设计参考：墨色项目 TavernCommand（添加 sub 动作，去除 add 的「数值相加」歧义）。

export type 变量命令动作 = 'set' | 'add' | 'sub' | 'push' | 'delete';

export interface 变量命令 {
  /** 动作：
   * - set: 用 value 覆盖目标路径（对象用深合并）
   * - add: 数字相加（非数字按 0 处理）
   * - sub: 数字相减
   * - push: 把 value 推入数组末尾（目标非数组时初始化为 []）
   * - delete: 删除目标字段或数组元素 */
  action: 变量命令动作;
  /** 变量路径,如 "世界.当前地点" / "NPC[2].好感度"
   *  根路径必须是 VARIABLE_ROOT_KEYS 中的一个 */
  key: string;
  /** JSON 值。delete 时忽略 */
  value: unknown;
}

export type 变量事实类型 =
  | 'traveler_profile'
  | 'time'
  | 'location'
  | 'npc'
  | 'item'
  | 'world_event'
  | 'phone_seed'
  | 'nsfw_archive'
  | 'weather';

export interface 旅人档案变量事实 {
  type: 'traveler_profile';
  identity?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  abilityAdd?: string[];
  knowledgeAdd?: string[];
  evidence?: string;
}

export interface 时间变量事实 {
  type: 'time';
  /** no_change 表示明确不推进；elapsed 表示推进若干分钟；set_time 表示同日设定目标时刻；overnight / next_day 表示跨日。 */
  mode: 'no_change' | 'elapsed' | 'set_time' | 'overnight' | 'next_day';
  minutes?: number;
  targetTime?: string;
  evidence?: string;
}

export interface 地点变量事实 {
  type: 'location';
  location: string;
  evidence?: string;
}

export interface 天气变量事实 {
  type: 'weather';
  /** 天气中文名，如 "暴风雪"、"星海潮汐"。解析器会转成内部 ID。 */
  weather: string;
  evidence?: string;
}

export interface NPC变量事实 {
  type: 'npc';
  id?: string;
  name: string;
  alias?: string;
  tier?: 'companion' | 'extra';
  gender?: '男' | '女' | '其他';
  affinityDelta?: number;
  affinitySet?: number;
  relation?: string;
  intimateRelationship?: boolean;
  following?: boolean;
  appearance?: string;
  clothing?: string;
  speechStyle?: string;
  personality?: string;
  intro?: string;
  playerAddress?: string;
  memory?: string;
  recentInteraction?: string;
  longTermImpression?: string;
  relationshipStage?: string;
  sharedExperiences?: string[];
  openItems?: string[];
  unresolvedConflicts?: string[];
  mustRemember?: string[];
  doNotForget?: string[];
  evidence?: string;
}

export interface 物品变量事实 {
  type: 'item';
  action: 'gain';
  category: 'food' | 'consumable' | 'lightcone' | 'weapon' | 'clothing' | 'accessory' | 'memento' | 'key';
  name: string;
  description?: string;
  quantity?: number;
  quality?: '蓝' | '紫' | '金';
  stackable?: boolean;
  source?: '剧情掉落' | '任务奖励' | '商店' | '打造' | '其它';
  sourceDescription?: string;
  narrativeEffects?: string[];
  evidence?: string;
}

export interface 世界事件变量事实 {
  type: 'world_event';
  text: string;
  evidence?: string;
}

export interface 手机来信变量事实 {
  type: 'phone_seed';
  targetType?: 'private' | 'group';
  targetId?: string;
  targetName?: string;
  title: string;
  context: string;
  triggerType?: 'injury' | 'victory' | 'defeat' | 'location_change' | 'important_item' | 'relationship' | 'news' | 'quest' | 'time' | 'custom';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  relatedNpcIds?: string[];
  evidence?: string;
}

export interface NSFW档案变量事实 {
  type: 'nsfw_archive';
  npcId?: string;
  npcName: string;
  enabled?: boolean;
  ageConfirm?: 'adult' | 'unknown' | 'minor_blocked';
  intimacyStage?: string;
  boundaries?: string;
  preferences?: string[];
  sensitivePoints?: string[];
  taboos?: string[];
  femaleBodyArchive?: {
    胸部?: string;
    女性私处?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  maleBodyArchive?: {
    男性器?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  experiences?: string[];
  longTermFacts?: string[];
  tags?: string[];
  notes?: string;
  evidence?: string;
}

export type 变量事实 =
  | 旅人档案变量事实
  | 时间变量事实
  | 地点变量事实
  | 天气变量事实
  | NPC变量事实
  | 物品变量事实
  | 世界事件变量事实
  | 手机来信变量事实
  | NSFW档案变量事实;

export interface 变量事实批次 {
  facts: 变量事实[];
  parseErrors: string[];
}

/** 变量命令应用结果，包含成功失败信息，便于在抽屉里展示给玩家调试。 */
export interface 变量命令结果 {
  command: 变量命令;
  ok: boolean;
  kind?: 'command' | 'warning' | 'error' | 'rejected';
  /** 失败原因：路径未登记 / 类型不匹配 / 解析错误等 */
  reason?: string;
  /** 规范化命令内容指纹（仅 kind=command 的结果写入，用于重放判定「已落地则跳过」）。 */
  commandFingerprint?: string;
}

/** 批次结局：由回执派生，供重试/补结算判定。 */
export type 变量批次结局 = 'completed' | 'partially_applied' | 'preflight_failed' | 'model_failed';

export type 变量诊断严重性 = 'warning' | 'error';

/** 诊断发生的阶段：解析 / 策略 / 落地。 */
export type 变量诊断阶段 = 'parse' | 'policy' | 'commit';

/** 批次级诊断：不依附于某条可执行命令的可见问题（解析错误、事实忽略、策略拒绝、落地失败）。 */
export interface 变量批次诊断 {
  code: string;
  severity: 变量诊断严重性;
  stage: 变量诊断阶段;
  message: string;
  /** 对应结果在批次 results 中的下标，便于定位；批次级问题可缺省。 */
  commandIndex?: number;
  /** 涉及变量根路径，仅命令相关诊断写入。 */
  root?: string;
}

/** 一回合的变量命令批次（一次 AI 调用产出的所有命令 + 结果），存入命令历史。 */
export interface 变量命令批次 {
  id: string;
  turn: number;
  /** 产生这批变量结果的 assistant 消息；优先于按回合号猜测重试目标。 */
  targetMessageId?: string;
  timestamp: number;
  /** 触发来源：'main' 主模型直接输出，'calibration' 变量模型二次校准 */
  source: 'main' | 'calibration';
  /** 是否调用了变量模型（false = 主模型直接出，true = 走了二次校准） */
  modelName?: string;
  results: 变量命令结果[];
  /** 变量模型的额外报告（可选，用于调试展示） */
  report?: string;
  /** 变量模型返回的原始文本，供「查看原始信息」面板展示。失败回执时为空。 */
  rawText?: string;
  /** 归约输入投影（命令落地前）的指纹；缺失 = legacy 批次，不可用于重放判定。 */
  baseStateFingerprint?: string;
  /** 批次结局；缺失由结果派生（legacy 兼容）。 */
  outcome?: 变量批次结局;
  // 批次级诊断不落库：它是 results 的纯函数，读取方按需 派生变量批次诊断(results)。
  /** 长期会话中的旧批次轻量摘要标记；用于避免每回合重复压缩同一批历史。 */
  retentionSummary?: {
    totalResults: number;
    succeededResults: number;
    diagnosticResults: number;
    omittedDiagnosticResults: number;
  };
}

export const 变量模型失败哨兵键 = '(变量模型调用失败)';
export const 解析失败哨兵键 = '(解析失败)';
export const 事实忽略哨兵键 = '(事实忽略)';

/**
 * 已落地命令结果：ok 且非诊断项（warning / error / rejected）。
 * 「落地」的唯一定义——批次结局、重放跳过、旧批次摘要与补结算判定都取自这里。
 */
export function 是已落地命令结果(result: 变量命令结果): boolean {
  return result.ok && (!result.kind || result.kind === 'command');
}

/** 从回执派生批次结局。modelFailed 只在模型调用失败路径显式传入。 */
export function 派生变量批次结局(
  results: readonly 变量命令结果[],
  options?: { modelFailed?: boolean },
): 变量批次结局 {
  if (options?.modelFailed) return 'model_failed';
  let applied = 0;
  let failed = 0;
  for (const result of results) {
    if (是已落地命令结果(result)) applied += 1;
    else if (!result.ok && result.kind !== 'warning') failed += 1;
  }
  if (failed > 0 && applied > 0) return 'partially_applied';
  if (failed > 0) return 'preflight_failed';
  return 'completed';
}

/** 从回执派生批次级诊断：非落地结果按 kind 与哨兵键归类，命令性失败归 commit 阶段。 */
export function 派生变量批次诊断(results: readonly 变量命令结果[]): 变量批次诊断[] {
  const diagnostics: 变量批次诊断[] = [];
  results.forEach((result, index) => {
    if (是已落地命令结果(result)) return;
    const message = result.reason?.trim();
    if (!message) return;
    if (result.kind === 'warning') {
      const isFact = result.command.key === 事实忽略哨兵键;
      diagnostics.push({
        code: isFact ? 'fact_ignored' : 'warning',
        severity: 'warning',
        stage: 'parse',
        message,
        commandIndex: index,
      });
      return;
    }
    if (result.kind === 'error') {
      const code = result.command.key === 变量模型失败哨兵键
        ? 'model_failed'
        : result.command.key === 解析失败哨兵键
          ? 'parse_failed'
          : 'error';
      diagnostics.push({ code, severity: 'error', stage: 'parse', message, commandIndex: index });
      return;
    }
    if (result.kind === 'rejected') {
      diagnostics.push({
        code: 'policy_rejected',
        severity: 'warning',
        stage: 'policy',
        message,
        commandIndex: index,
        root: 诊断根路径(result.command.key),
      });
      return;
    }
    diagnostics.push({
      code: 'command_failed',
      severity: 'error',
      stage: 'commit',
      message,
      commandIndex: index,
      root: 诊断根路径(result.command.key),
    });
  });
  return diagnostics;
}

function 诊断根路径(key: string): string {
  return key.split(/[.[]/, 1)[0];
}

const 变量命令动作集合 = new Set<变量命令动作>(['set', 'add', 'sub', 'push', 'delete']);
const 变量批次结局集合 = new Set<变量批次结局>(['completed', 'partially_applied', 'preflight_failed', 'model_failed']);
const 变量结果类型集合 = new Set<NonNullable<变量命令结果['kind']>>(['command', 'warning', 'error', 'rejected']);
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface 变量批次归一化结果 {
  batches: 变量命令批次[];
  issues: string[];
}

/**
 * 水合边界归一化（K5）：旧批次缺 outcome 时按结果派生，缺指纹保持缺失（= legacy，不可重放判定）。
 * 结构非法项丢弃并记 issue，不静默兜底。
 */
export function 归一化变量命令批次列表(raw: unknown): 变量批次归一化结果 {
  if (typeof raw === 'undefined' || raw === null) return { batches: [], issues: [] };
  if (!Array.isArray(raw)) return { batches: [], issues: ['变量命令批次不是数组，已整体丢弃'] };
  const batches: 变量命令批次[] = [];
  const issues: string[] = [];
  raw.forEach((item, index) => {
    const normalized = 归一化变量命令批次(item);
    if (normalized.batch) {
      batches.push(normalized.batch);
      for (const issue of normalized.issues ?? []) issues.push(`第 ${index + 1} 条批次：${issue}`);
    } else {
      issues.push(`第 ${index + 1} 条变量批次已丢弃：${normalized.issue}`);
    }
  });
  return { batches, issues };
}

function 归一化变量命令批次(raw: unknown): { batch?: 变量命令批次; issue?: string; issues?: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { issue: '不是批次对象' };
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : '';
  const turn = Math.trunc(Number(record.turn));
  const timestamp = Math.trunc(Number(record.timestamp));
  if (!id) return { issue: '缺少批次 id' };
  if (!Number.isFinite(turn) || turn < 0) return { issue: '缺少合法回合数' };
  if (!Number.isFinite(timestamp)) return { issue: '缺少合法时间戳' };
  if (!Array.isArray(record.results)) return { issue: '缺少结果数组' };

  const issues: string[] = [];
  const results: 变量命令结果[] = [];
  record.results.forEach((item, index) => {
    const normalized = 归一化变量命令结果(item);
    if (normalized.result) results.push(normalized.result);
    else issues.push(`第 ${index + 1} 条结果已丢弃：${normalized.issue}`);
  });

  const source = record.source === 'main' || record.source === 'calibration' ? record.source : 'calibration';
  const modelFailed = results.some((result) => result.command.key === 变量模型失败哨兵键);
  const outcome = 变量批次结局集合.has(record.outcome as 变量批次结局)
    ? record.outcome as 变量批次结局
    : 派生变量批次结局(results, { modelFailed });
  return {
    batch: {
      id,
      turn,
      timestamp,
      source,
      results,
      ...(typeof record.targetMessageId === 'string' && record.targetMessageId.trim()
        ? { targetMessageId: record.targetMessageId }
        : {}),
      ...(typeof record.modelName === 'string' ? { modelName: record.modelName } : {}),
      ...(typeof record.report === 'string' ? { report: record.report } : {}),
      ...(typeof record.rawText === 'string' ? { rawText: record.rawText } : {}),
      ...(typeof record.baseStateFingerprint === 'string' && SHA256_HEX.test(record.baseStateFingerprint)
        ? { baseStateFingerprint: record.baseStateFingerprint }
        : {}),
      outcome,
      ...(归一化批次保留摘要(record.retentionSummary)),
    },
    ...(issues.length ? { issues } : {}),
  };
}

function 归一化变量命令结果(raw: unknown): { result?: 变量命令结果; issue?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { issue: '不是结果对象' };
  const record = raw as Record<string, unknown>;
  const commandRaw = record.command;
  const command: 变量命令 | null = typeof commandRaw === 'object' && commandRaw !== null && !Array.isArray(commandRaw)
    ? 归一化变量命令(commandRaw as Record<string, unknown>)
    : null;
  if (!command) return { issue: '缺少合法命令' };
  if (typeof record.ok !== 'boolean') return { issue: '缺少 ok 布尔值' };
  const kind = 变量结果类型集合.has(record.kind as NonNullable<变量命令结果['kind']>)
    ? record.kind as 变量命令结果['kind']
    : 推断结果类型(command.key);
  return {
    result: {
      command,
      ok: record.ok,
      ...(kind ? { kind } : {}),
      ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
      ...(typeof record.commandFingerprint === 'string' && SHA256_HEX.test(record.commandFingerprint)
        ? { commandFingerprint: record.commandFingerprint }
        : {}),
    },
  };
}

function 归一化变量命令(record: Record<string, unknown>): 变量命令 | null {
  const action = record.action;
  if (!变量命令动作集合.has(action as 变量命令动作)) return null;
  if (typeof record.key !== 'string' || !record.key.trim()) return null;
  return { action: action as 变量命令动作, key: record.key, value: record.value };
}

function 推断结果类型(key: string): 变量命令结果['kind'] {
  if (key === 解析失败哨兵键 || key === 变量模型失败哨兵键) return 'error';
  if (key === 事实忽略哨兵键) return 'warning';
  return undefined;
}

function 归一化批次保留摘要(raw: unknown): { retentionSummary?: 变量命令批次['retentionSummary'] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const totalResults = Math.trunc(Number(record.totalResults));
  const succeededResults = Math.trunc(Number(record.succeededResults));
  const diagnosticResults = Math.trunc(Number(record.diagnosticResults));
  const omittedDiagnosticResults = Math.trunc(Number(record.omittedDiagnosticResults));
  if (![totalResults, succeededResults, diagnosticResults, omittedDiagnosticResults].every(Number.isFinite)) return {};
  return { retentionSummary: { totalResults, succeededResults, diagnosticResults, omittedDiagnosticResults } };
}
