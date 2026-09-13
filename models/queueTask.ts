// 队列任务账本（过渡形态）。
//
// 目标形态（kernelization §14.2/§19）：任务账本归属各子系统（正文生成插件的输入队列、
// 相册/记忆/变量等各自的任务字段或 deviceStorage），界面经投影聚合展示；内核不管理队列。
// 现状例外：queueTasks 是跨子系统共享的叶子日志，属于迁移期债务。新增动作/任务时：
// - 不要扩大该字段语义；新动作的任务策略声明在 hooks/useGame/turnActionRuntime；
// - 读取统一经该模块的账本适配器（查询最新动作任务），不要再写第二套「读 queueTasks」逻辑。

export type 队列任务ID = 'main_story' | 'memory' | 'variable' | 'variable_reparse' | 'news' | 'world_evolution' | 'yiting' | 'zhiku' | 'phone' | 'autosave' | 'narrative_image_parse' | 'narrative_image_generate';
export type 队列任务状态 = 'pending' | 'success' | 'failed' | 'idle' | 'skipped' | 'cancelled';

export interface 队列任务记录 {
  id: 队列任务ID;
  title: string;
  subtitle?: string;
  turn: number;
  timestamp: number;
  status: 队列任务状态;
  detail?: string;
  rawText?: string;
  /** 任务对应的聊天消息。正文生图解析/生成重试会用它精准定位原回合。 */
  targetMessageId?: string;
  /** 任务对应的变量批次。变量重试用于避免重复处理已成功批次。 */
  targetBatchId?: string;
  /** 手动重试时的轻量上下文说明，便于队列面板展示。 */
  retryHint?: string;
  failCount?: number;
  retrying?: boolean;
  cancellable?: boolean;
  cancelled?: boolean;
}
