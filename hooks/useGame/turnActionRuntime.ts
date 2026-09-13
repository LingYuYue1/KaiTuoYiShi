// 回合卡片动作运行时（过渡层：目标形态是内核的命令注册表 + 投影，见 kernelization §2/§4.1）。
//
// 职责边界：
// - 策略（id / 队列任务 id / 取消 / 重试 / 忙时要求）在此处单点定义；
// - 展示文案与排版留在界面模块；
// - 动作视图是纯函数派生（将来即 projection）：输入是调用期快照，不持有 React/App 状态；
// - 忙时门只在 `执行` 一处强制（§17.3 安全默认值做在通道里）；
// - **队列账本适配器**：本模块是读取 queueTasks 的唯一新入口。queueTasks 目前是过渡
//   账本（目标：各子系统自有任务字段 + 投影聚合，kernelization §14.2/§19），新代码
//   不得再直接依赖它做跨插件协调。

import type { 聊天消息, 叙事插图 } from '@/models/chat';
import type { 队列任务ID, 队列任务记录 } from '@/models/queueTask';

export type 回合动作ID = 'regenerate_snapshot' | 'reparse_variables';

export interface 回合动作策略 {
  readonly id: 回合动作ID;
  readonly taskIds: readonly 队列任务ID[];
  readonly retryable: boolean;
  readonly requiresIdle: boolean;
}

export const 回合动作策略表: Record<回合动作ID, 回合动作策略> = {
  regenerate_snapshot: {
    id: 'regenerate_snapshot',
    taskIds: ['narrative_image_parse', 'narrative_image_generate'],
    retryable: true,
    requiresIdle: true,
  },
  // 重解析带模型成本且结果只进本地草稿：不自动重试，失败后由玩家再次触发。
  reparse_variables: {
    id: 'reparse_variables',
    taskIds: ['variable_reparse'],
    retryable: false,
    requiresIdle: true,
  },
};

/** 队列抽屉的重试白名单：策略表单点派生，替代组件内硬编码。 */
const 可重试队列任务ID: ReadonlySet<队列任务ID> = new Set(
  Object.values(回合动作策略表)
    .filter((策略) => 策略.retryable)
    .flatMap((策略) => 策略.taskIds)
    .concat(['variable', 'news']),
);

export function 队列任务可重试(id: 队列任务ID): boolean {
  return 可重试队列任务ID.has(id);
}

export interface 回合动作视图 {
  visible: boolean;
  enabled: boolean;
  running: boolean;
  /** 最近一次任务失败原因 / 禁用原因，供按钮 tooltip 展示。 */
  detail?: string;
}

/** 调用期快照：由 App 从当前状态派生，是动作视图的唯一数据来源（将来即投影切片）。 */
export interface 回合动作上下文 {
  queueTasks: readonly 队列任务记录[];
  busy: boolean;
  正文生图手动模式: boolean;
  变量更新启用: boolean;
}

const 空视图: Partial<Record<回合动作ID, 回合动作视图>> = Object.freeze({});

/** 纯派生：消息 + 调用期快照 → 每个动作的可见/可用/运行中状态。 */
export function 派生回合动作视图(
  message: 聊天消息,
  context: 回合动作上下文,
): Partial<Record<回合动作ID, 回合动作视图>> {
  if (message.role !== 'assistant') return 空视图;
  const views: Partial<Record<回合动作ID, 回合动作视图>> = {};

  const images: 叙事插图[] = message.narrativeImages ?? [];
  if (images.length > 0 || context.正文生图手动模式) {
    const 最新任务 = 查询最新动作任务(
      context.queueTasks,
      回合动作策略表.regenerate_snapshot.taskIds,
      message.id,
    );
    const running = 最新任务?.status === 'pending'
      || images.some((image) => image.status === 'generating');
    views.regenerate_snapshot = {
      visible: true,
      enabled: !running,
      running,
      ...(最新任务?.status === 'failed' && 最新任务.detail ? { detail: 最新任务.detail } : {}),
    };
  }

  const 有正文 = Boolean(message.parsedResponse?.body.trim() || message.content.trim());
  if (有正文) {
    const 最新任务 = 查询最新动作任务(
      context.queueTasks,
      回合动作策略表.reparse_variables.taskIds,
      message.id,
    );
    const running = 最新任务?.status === 'pending';
    views.reparse_variables = {
      visible: true,
      enabled: context.变量更新启用 && !running,
      running,
      ...(!context.变量更新启用
        ? { detail: '变量更新未启用。' }
        : 最新任务?.status === 'failed' && 最新任务.detail
          ? { detail: 最新任务.detail }
          : {}),
    };
  }

  return Object.keys(views).length > 0 ? views : 空视图;
}

/** 账本适配器：按动作任务 id 集合 + 消息归属查最近一条任务记录。 */
export function 查询最新动作任务(
  queueTasks: readonly 队列任务记录[],
  taskIds: readonly 队列任务ID[],
  messageId: string,
): 队列任务记录 | undefined {
  for (let index = queueTasks.length - 1; index >= 0; index -= 1) {
    const task = queueTasks[index];
    if (!taskIds.includes(task.id)) continue;
    if (task.targetMessageId !== messageId) continue;
    return task;
  }
  return undefined;
}

export interface TurnActionsApi {
  视图状态: (message: 聊天消息, context: 回合动作上下文) => Partial<Record<回合动作ID, 回合动作视图>>;
  执行: (message: 聊天消息, id: 回合动作ID, context: 回合动作上下文) => Promise<回合动作执行结局>;
}

/** 执行结局：拒绝原因由调用方落账（保持 pushQueueTask 单一写入口，策略层无副作用）。 */
export type 回合动作执行结局 =
  | { kind: 'ran' }
  | { kind: 'refused'; taskId: 队列任务ID; detail: string };

/** 忙时拒绝文案（hooks 编排层持有；领域层/models 不持有 UI copy）。 */
export const 回合动作忙时文案: Record<回合动作ID, string> = {
  regenerate_snapshot: '当前有任务进行中，请等待完成后再重新生成。',
  reparse_variables: '当前有任务进行中，请等待完成后再重新解析。',
};

/** 纯判定：忙时门 + 未决任务去重。返回 ran 时由调用方执行对应工作流。 */
export function 评估回合动作执行(
  message: 聊天消息,
  id: 回合动作ID,
  context: 回合动作上下文,
): 回合动作执行结局 {
  const 策略 = 回合动作策略表[id];
  // 两种拒绝共用同一回执文案与落账任务 id：全局忙（requiresIdle）或本动作已有未决任务。
  const 忙时 = (策略.requiresIdle && context.busy)
    || 查询最新动作任务(context.queueTasks, 策略.taskIds, message.id)?.status === 'pending';
  if (忙时) return { kind: 'refused', taskId: 策略.taskIds[0], detail: 回合动作忙时文案[id] };
  return { kind: 'ran' };
}
