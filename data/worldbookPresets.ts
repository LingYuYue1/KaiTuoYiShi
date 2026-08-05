import type { 世界书 } from '@/models/worldbook';
import { createBuiltinConfigWorldbooks } from './builtinWorldbookConfig';

// 「内置世界书」= 随包预置的配置类世界书集合。
// 包含：世界观（星海概观）+ 命途纲要。四种剧情模式已迁移为提示词模块(builtin_storymode_*),不再走世界书。
export function createBuiltinWorldbooks(): 世界书[] {
  return [...createBuiltinConfigWorldbooks()];
}
