// 剧情系统数据模型（v1）。
// 主线节点图：每节点一段，状态在 pending/active/completed/failed/abandoned 之间流转。
// AI引导 是给 AI 的下回合引导（"接下来应该让玩家遇到 X"），玩家通常不直接读。

export type 剧情节点状态 = 'pending' | 'active' | 'completed' | 'failed' | 'abandoned';

export const PLOT_STATUS_LABELS: Record<剧情节点状态, string> = {
  pending: '待启',
  active: '进行中',
  completed: '已完成',
  failed: '已失败',
  abandoned: '已放弃',
};

export interface 剧情节点 {
  id: string;
  标题: string;
  摘要: string;
  状态: 剧情节点状态;
  创建回合: number;
  更新回合: number;
  前置节点ID?: string;
  AI引导?: string;
}

export function 创建剧情节点(input: {
  标题: string;
  摘要?: string;
  状态?: 剧情节点状态;
  回合: number;
  前置节点ID?: string;
  AI引导?: string;
}): 剧情节点 {
  return {
    id: `plot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    标题: input.标题,
    摘要: input.摘要 ?? '',
    状态: input.状态 ?? 'pending',
    创建回合: input.回合,
    更新回合: input.回合,
    前置节点ID: input.前置节点ID,
    AI引导: input.AI引导,
  };
}
