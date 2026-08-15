import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';

export type BatchDecomposeMode = 'pending' | 'fromCurrent' | 'all';

export function selectBatchTargets(series: 剧情编织系列, mode: BatchDecomposeMode): 剧情编织分段[] {
  return series.分段列表.filter((segment) => {
    if (mode === 'pending') return segment.处理状态 !== '已完成';
    if (mode === 'fromCurrent') return segment.组号 >= series.当前分段组号;
    return true;
  });
}

export function batchModeLabel(mode: BatchDecomposeMode): string {
  if (mode === 'pending') return '待处理分段';
  if (mode === 'fromCurrent') return '当前以后分段';
  return '全部分段';
}

/**
 * 顺序批量分解执行器。单段失败标记「失败」后继续；persist 失败立即中断。
 * 不直接依赖 React：UI 只负责注入 decompose/persist 与进度回调。
 */
export async function runBatchDecompose(params: {
  series: 剧情编织系列;
  targets: 剧情编织分段[];
  decompose: (segment: 剧情编织分段, previousSegment?: 剧情编织分段) => Promise<剧情编织分段>;
  persist: (series: 剧情编织系列) => Promise<boolean>;
  onProgress: (index: number, total: number, segment: 剧情编织分段) => void;
}): Promise<{ workingSeries: 剧情编织系列; persistFailed: boolean }> {
  const { series, targets, decompose, persist, onProgress } = params;
  let workingSeries = series;
  for (let index = 0; index < targets.length; index += 1) {
    const target = workingSeries.分段列表.find((item) => item.id === targets[index].id);
    if (!target) continue;
    onProgress(index, targets.length, target);

    workingSeries = {
      ...workingSeries,
      分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? { ...item, 处理状态: '处理中', 最近错误: '', updatedAt: Date.now() } : item),
      updatedAt: Date.now(),
    };
    if (!await persist(workingSeries)) return { workingSeries, persistFailed: true };

    try {
      const processingSegment = workingSeries.分段列表.find((item) => item.id === target.id) ?? target;
      const previousSegment = workingSeries.分段列表
        .filter((item) => item.组号 < processingSegment.组号 && item.处理状态 === '已完成')
        .sort((a, b) => b.组号 - a.组号)[0];
      const parsed = await decompose(processingSegment, previousSegment);
      workingSeries = {
        ...workingSeries,
        分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? parsed : item),
        updatedAt: Date.now(),
      };
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      workingSeries = {
        ...workingSeries,
        分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? { ...item, 处理状态: '失败', 最近错误: text, updatedAt: Date.now() } : item),
        updatedAt: Date.now(),
      };
    }
    if (!await persist(workingSeries)) return { workingSeries, persistFailed: true };
  }
  return { workingSeries, persistFailed: false };
}

export function toBatchSystem(system: 剧情编织系统, series: 剧情编织系列): 剧情编织系统 {
  return {
    ...system,
    系列列表: system.系列列表.map((item) => item.id === series.id ? series : item),
    当前系列ID: series.id,
  };
}
