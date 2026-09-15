// 变量历史修复（V2 单条重解析）：分类 + 计划 + 应用回执，纯域。
//
// 原则：
// - 冲突路径永不静默写（展示为不可选）；
// - 已落地命令（指纹命中历史回执）永不再写；
// - 提交前用基态指纹校验计划是否过期（STALE_PLAN）；
// - 应用只经 reduceVariableCommands（variableExecutor 管线），不新增写入通道。

import type { 变量命令, 变量命令结果 } from '@/models/variableCommand';
import type { VariableState } from '@/utils/variableRegistry';
import { validateCommand } from '@/utils/variableRegistry';
import { 读取路径值 } from '@/utils/variablePath';
import { isTravelerPlayerAuthoredVariablePath } from '@/utils/variableRegistry';
import { reduceVariableCommands } from '@/utils/variableExecutor';
import {
  commandFingerprint,
  filterCommandsByAppliedFingerprints,
  variableStateFingerprint,
} from '@/utils/variableFingerprint';

export type 修复项分类 = 'safe' | 'existing' | 'confirm' | 'conflict' | 'unsupported';

export interface 变量修复项 {
  id: string;
  category: 修复项分类;
  commands: 变量命令[];
  /** 分类原因 / 冲突说明 / 拒绝原因。 */
  reason?: string;
  /** 当前值与目标值（set 类命令，供预览展示）。 */
  currentValue?: unknown;
  proposedValue?: unknown;
  /** NSFW 策略拒绝标记（用于整单被拒时返回 NSFW_POLICY_REJECTED）。 */
  nsfwRejected?: boolean;
}

export interface 变量修复计划 {
  schemaVersion: 1;
  turn: number;
  targetMessageId: string;
  /** 分类型时的归约输入投影指纹（提交前校验过期）。 */
  baseStateFingerprint: string;
  createdAt: number;
  /** 重解析所用的变量模型名（写入批次报告）。 */
  modelName?: string;
  items: 变量修复项[];
}

/** 回执码：每个码只表示一种结局，调用方据此分支，不比 detail 文案。 */
export type 修复回执码 =
  | 'OK'
  | 'STALE_PLAN'
  | 'ALREADY_COMMITTED'
  | 'NO_CHANGES'
  | 'NO_SELECTED_ITEMS'
  | 'INVALID_SELECTION'
  | 'NSFW_POLICY_REJECTED'
  /** 提交事务被占用（有任务进行中）。 */
  | 'BUSY'
  /** 用户取消。 */
  | 'CANCELLED'
  /** 写入失败。 */
  | 'WRITE_FAILED';

export interface 变量修复回执 {
  code: 修复回执码;
  detail: string;
  results?: 变量命令结果[];
  nextState?: VariableState;
}

/** 冲突：确定性事实，历史重解析永不写入。 */
const 冲突路径规则: RegExp[] = [
  /^世界\.(当前日期|当前时间|开拓天数|当前地点|当前天气)$/,
  /^手机\.(messageSeeds|联系人)(\.|\[|$)/,
  /^NPC\[[^\]]*\]\.(最近回合|初见回合|累计互动次数|归档|归档回合)$/,
];

/** 需确认：会显著影响玩法或人设，默认不勾选。 */
const 确认路径规则: RegExp[] = [
  /^NPC\[[^\]]*\]\.(好感度|好感|亲密|亲密关系|关系|阶位|同行|同行记忆|约定|当前关系阶段)$/,
  /^旅人\.背包(\.|\[|$)/,
  /^世界\.全局事件$/,
  /NSFW档案/,
];

function 命中规则(key: string, rules: RegExp[]): boolean {
  return rules.some((rule) => rule.test(key));
}

function 值相等(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 分类历史重解析命令。appliedFingerprints 来自历史批次回执（「已落地则跳过」）。
 */
export async function 分类修复命令(params: {
  commands: readonly 变量命令[];
  state: VariableState;
  appliedFingerprints: ReadonlySet<string>;
}): Promise<变量修复项[]> {
  const items: 变量修复项[] = [];
  for (let index = 0; index < params.commands.length; index += 1) {
    const command = params.commands[index];
    const 判定 = await 判定修复项(command, params.state, params.appliedFingerprints);
    items.push({ id: `item_${index}`, commands: [command], ...判定 });
  }
  return items;
}

/** 单条命令归类：判定顺序即优先级。返回除 id / commands 外的修复项字段。 */
async function 判定修复项(
  command: 变量命令,
  state: VariableState,
  appliedFingerprints: ReadonlySet<string>,
): Promise<Omit<变量修复项, 'id' | 'commands'>> {
  // 已落地命令（指纹命中历史回执）永不再写；无历史回执时省掉这次哈希。
  if (appliedFingerprints.size > 0 && appliedFingerprints.has(await commandFingerprint(command))) {
    return { category: 'existing', reason: '历史回执显示该命令已落地。' };
  }
  if (isTravelerPlayerAuthoredVariablePath(command.key)) {
    return { category: 'unsupported', reason: '玩家手写的旅人核心档案路径不参与修复。' };
  }
  if (命中规则(command.key, 冲突路径规则)) {
    return { category: 'conflict', reason: '确定性事实路径由当前状态维护，历史重解析不写入。' };
  }
  const validation = validateCommand(command, state);
  const { root, rest } = validation;
  if (!validation.allowed || !root || rest === undefined) {
    return { category: 'unsupported', reason: validation.reason ?? '路径未登记。' };
  }
  const 当前值 = 读取路径值(state[root], rest).value;
  if (command.action === 'set' && 值相等(当前值, command.value)) {
    return { category: 'existing', reason: '当前值已与目标值一致。', currentValue: 当前值, proposedValue: command.value };
  }
  if (命令值已在数组内(command.action, 当前值, command.value)) {
    return { category: 'existing', reason: '目标数组已包含该值。', currentValue: 当前值, proposedValue: command.value };
  }
  if (命中规则(command.key, 确认路径规则) || command.action === 'delete') {
    return {
      category: 'confirm',
      reason: command.action === 'delete' ? '删除操作需确认。' : '高影响字段，默认不勾选。',
      currentValue: 当前值,
      proposedValue: command.value,
    };
  }
  return { category: 'safe', currentValue: 当前值, proposedValue: command.value };
}

function 命令值已在数组内(action: 变量命令['action'], current: unknown, value: unknown): boolean {
  if (action !== 'push' || !Array.isArray(current)) return false;
  return current.some((entry) => 值相等(entry, value));
}

export function 构建变量修复计划(params: {
  turn: number;
  targetMessageId: string;
  baseStateFingerprint: string;
  items: 变量修复项[];
  modelName?: string;
  now?: number;
}): 变量修复计划 {
  return {
    schemaVersion: 1,
    turn: params.turn,
    targetMessageId: params.targetMessageId,
    baseStateFingerprint: params.baseStateFingerprint,
    createdAt: params.now ?? Date.now(),
    ...(params.modelName ? { modelName: params.modelName } : {}),
    items: params.items,
  };
}

export interface 应用修复计划参数 {
  plan: 变量修复计划;
  currentState: VariableState;
  confirmedItemIds: readonly string[];
  appliedFingerprints: ReadonlySet<string>;
}

/**
 * 应用计划：校验过期 → 校验选择 → 跳过已落地 → 归约。
 * 回执 nextState 只在 code=OK 时存在，写入由调用方经唯一事务完成；
 * pending 携带同一次计算的指纹，供回执落库。
 */
export async function 应用变量修复计划(
  params: 应用修复计划参数,
): Promise<变量修复回执 & { pending?: Array<{ command: 变量命令; fingerprint: string }> }> {
  const currentFingerprint = await variableStateFingerprint(params.currentState);
  if (currentFingerprint !== params.plan.baseStateFingerprint) {
    return { code: 'STALE_PLAN', detail: '变量状态已变化（可能完成了新的回合），请重新解析。' };
  }

  const confirmIds = new Set(
    params.plan.items.filter((item) => item.category === 'confirm').map((item) => item.id),
  );
  const invalidIds = params.confirmedItemIds.filter((id) => !confirmIds.has(id));
  if (invalidIds.length > 0) {
    return { code: 'INVALID_SELECTION', detail: `存在不可勾选的修复项：${invalidIds.join('、')}` };
  }

  const safeCommands = params.plan.items
    .filter((item) => item.category === 'safe')
    .flatMap((item) => item.commands);
  const confirmedCommands = params.plan.items
    .filter((item) => item.category === 'confirm' && params.confirmedItemIds.includes(item.id))
    .flatMap((item) => item.commands);
  const candidates = [...safeCommands, ...confirmedCommands];

  if (candidates.length === 0) {
    const nsfwRejected = params.plan.items.some((item) => item.nsfwRejected);
    if (nsfwRejected) return { code: 'NSFW_POLICY_REJECTED', detail: '全部命令被 NSFW 策略拒绝。' };
    return { code: 'NO_SELECTED_ITEMS', detail: '没有可提交的修复项。' };
  }

  const pending = await filterCommandsByAppliedFingerprints(candidates, params.appliedFingerprints);
  if (pending.length === 0) {
    return { code: 'ALREADY_COMMITTED', detail: '待提交命令均已在历史中落地，无需重复写入。' };
  }

  const commands = pending.map((item) => item.command);
  const { results, nextState } = reduceVariableCommands(commands, params.currentState);
  if (results.length !== commands.length) {
    throw new Error(`变量修复归约回执数量与命令数量不一致（${results.length}/${commands.length}）`);
  }
  if (!results.some((result) => result.ok)) {
    return { code: 'NO_CHANGES', detail: '命令均未通过归约校验，未产生任何变更。', results };
  }
  return { code: 'OK', detail: '修复命令已归约，待写入。', results, nextState, pending };
}
