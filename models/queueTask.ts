export type 队列任务ID = 'main_story' | 'memory' | 'variable' | 'news' | 'world_evolution' | 'yiting' | 'zhiku' | 'autosave';
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
  failCount?: number;
  retrying?: boolean;
  cancellable?: boolean;
  cancelled?: boolean;
}
