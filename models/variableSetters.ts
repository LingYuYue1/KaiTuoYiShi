/**
 * Legacy Variable Manager write port (React setters).
 *
 * Stage 5.1: extracted from utils/variableExecutor so UI does not import
 * the reduce/commit soup for type-only wiring.
 *
 * Native Kernel path: do NOT use these setters for formal variable writes.
 * Dispatch `variables.apply` (or turn.advance with a variable block) so
 * SessionRepository CAS is the sole formal commit.
 *
 * Legacy production KERNEL_MODE may still inject this port from useGameState
 * until Variable Manager is fully switched to kernel commands.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';

/** Legacy host write port — React setters only, no reduce/commit. */
export interface VariableSetters {
  set旅人: Dispatch<SetStateAction<角色数据结构>>;
  set世界: Dispatch<SetStateAction<世界状态>>;
  set记忆: Dispatch<SetStateAction<记忆系统>>;
  set忆庭: Dispatch<SetStateAction<忆庭系统>>;
  set智库: Dispatch<SetStateAction<智库系统>>;
  set手机: Dispatch<SetStateAction<手机系统>>;
  setNPC: Dispatch<SetStateAction<NPC记录[]>>;
  set新闻: Dispatch<SetStateAction<新闻条目[]>>;
  set剧情: Dispatch<SetStateAction<剧情节点[]>>;
}
