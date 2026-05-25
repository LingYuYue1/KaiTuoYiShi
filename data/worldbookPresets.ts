import type { 世界书 } from '@/models/worldbook';
import { createBuiltinConfigWorldbooks } from './builtinWorldbookConfig';
import { createStoryModeWorldbooks } from './storyModeWorldbooks';

// 「内置世界书」= 随包预置的配置类世界书集合。
// 包含：核心配置（开局规范 / 世界总览 / 命途 / 列车 / 组织关系 / 地点）+ 四种剧情模式各一本。
export function createBuiltinWorldbooks(): 世界书[] {
  return [...createBuiltinConfigWorldbooks(), ...createStoryModeWorldbooks()];
}
