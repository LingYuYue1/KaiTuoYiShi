import type { 时段定义 } from '@/models/world';

// 时代预设已清空，等待 HSR 题材重构（命途 / 星球 / 列车场景等）。
export const timePeriodPresets: 时段定义[] = [];

export function getTimePeriodById(id: string): 时段定义 | undefined {
  return timePeriodPresets.find((p) => p.id === id);
}
