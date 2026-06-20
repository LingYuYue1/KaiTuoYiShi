export type 队列任务ID = 'main_story' | 'memory' | 'variable' | 'news' | 'world_evolution' | 'yiting' | 'zhiku' | 'phone' | 'autosave' | 'narrative_image_parse' | 'narrative_image_generate';
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
