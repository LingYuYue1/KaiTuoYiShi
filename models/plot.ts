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
  locationId?: string;                 // 明确关联的星轨航图地点 id
  anchorId?: string;                   // 可选的四级地图场景锚点 id
}

export function 创建剧情节点(input: {
  标题: string;
  摘要?: string;
  状态?: 剧情节点状态;
  回合: number;
  前置节点ID?: string;
  AI引导?: string;
  locationId?: string;
  anchorId?: string;
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
    locationId: input.locationId,
    anchorId: input.anchorId,
  };
}

export function 归一化剧情节点列表(raw: unknown): 剧情节点[] {
  if (!Array.isArray(raw)) return [];
  const validStatuses = new Set<剧情节点状态>(['pending', 'active', 'completed', 'failed', 'abandoned']);
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Partial<剧情节点> & Record<string, unknown>;
    const title = readPlotString(source.标题 ?? source.title) ?? `未命名剧情 ${index + 1}`;
    const status = typeof source.状态 === 'string' && validStatuses.has(source.状态 as 剧情节点状态)
      ? source.状态 as 剧情节点状态
      : 'pending';
    const createdTurn = Number(source.创建回合 ?? source.createdTurn);
    const updatedTurn = Number(source.更新回合 ?? source.updatedTurn);
    return [{
      id: readPlotString(source.id) ?? `plot_${Date.now()}_${index}`,
      标题: title,
      摘要: readPlotString(source.摘要 ?? source.summary) ?? '',
      状态: status,
      创建回合: Number.isFinite(createdTurn) ? createdTurn : 1,
      更新回合: Number.isFinite(updatedTurn) ? updatedTurn : (Number.isFinite(createdTurn) ? createdTurn : 1),
      前置节点ID: readPlotString(source.前置节点ID ?? source.previousNodeId),
      AI引导: readPlotString(source.AI引导 ?? source.aiGuide),
      locationId: readPlotString(source.locationId ?? source.地图地点ID ?? source.地点ID),
      anchorId: readPlotString(source.anchorId ?? source.地图锚点ID ?? source.锚点ID),
    }];
  });
}

function readPlotString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
