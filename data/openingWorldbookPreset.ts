import type { 世界书, 世界书导出数据 } from '@/models/worldbook';
import { normalizeWorldbooks } from '@/utils/worldbook';

// 第二波起，「随包预设」改由 data/builtinWorldbookConfig.ts 直接生成内置世界书，
// 不再通过 fetch 拉 public 下的 json。本文件保留 fetch 加载工具函数与类型,
// 以便未来「玩家手动从 URL 导入」复用同一管线。

export interface BundledWorldbookPreset {
  id: string;
  title: string;
  description: string;
  path: string;
}

// 显式置空：当前没有自动拉取的 preset。
export const bundledWorldbookPresets: BundledWorldbookPreset[] = [];

export async function loadBundledWorldbookPreset(
  preset: BundledWorldbookPreset,
): Promise<世界书[]> {
  const response = await fetch(preset.path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${preset.title} 读取失败(HTTP ${response.status})`);
  }
  const data = (await response.json()) as 世界书导出数据;
  if (!data.books || !Array.isArray(data.books)) {
    throw new Error(`${preset.title} 文件结构异常`);
  }
  return normalizeWorldbooks(data.books);
}

export async function loadAllBundledWorldbookPresets(): Promise<世界书[]> {
  if (!bundledWorldbookPresets.length) return [];
  const payloads = await Promise.all(
    bundledWorldbookPresets.map((preset) => loadBundledWorldbookPreset(preset)),
  );
  return payloads.flat();
}

