// A1–E2 旧 lore 归档。第二波拆分后这些内容不再自动加载，
// 等后续波次决定接入方式（直接合并进核心配置 / 拆成多个内置书 / 留给玩家手动导入）时再启用。
// 当前文件仅作为常量保留，不被代码引用。

import type { 世界书导出数据 } from '@/models/worldbook';
import openingCoreLoreJson from './openingCoreLore.json';

export const OPENING_CORE_LORE_ARCHIVE: 世界书导出数据 =
  openingCoreLoreJson as 世界书导出数据;
