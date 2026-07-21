/**
 * UI projection of the one committed runtime graph.
 */

import type { Revision, SessionId } from './commands';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 记忆系统 } from '@/models/memory';
import type { 新闻条目 } from '@/models/news';
import type { NPC记录 } from '@/models/npc';
import type { 手机系统 } from '@/models/phone';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 世界状态 } from '@/models/world';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { StoryPolicy } from '@/models/settingsPlanes';

export type TurnView = Readonly<{
  id: string;
  createdAt: number;
  playerText: string;
  narrativeText: string;
}>;

export type MessageProjection = Readonly<{
  id: string;
  role: 'assistant';
  content: string;
  timestamp: number;
  gameTime?: string;
}>;

export type JobKind =
  | 'news.generate'
  | 'yiting.archive'
  | 'narrative-image.generate';

export type JobProjection = Readonly<{
  id: string;
  kind: JobKind;
  state: 'queued' | 'claimed' | 'running' | 'retry' | 'succeeded' | 'failed' | 'cancelled';
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  error?: string;
}>;

export type GameProjection = Readonly<{
  traveler: 角色数据结构;
  world: 世界状态;
  conversation: Readonly<{ history: readonly 聊天消息[]; turnCount: number }>;
  memory: Readonly<{ system: 记忆系统; yiting: 忆庭系统 }>;
  characters: Readonly<{ npcs: readonly NPC记录[] }>;
  phone: 手机系统;
  album: 相册系统;
  news: readonly 新闻条目[];
  plot: Readonly<{ nodes: readonly 剧情节点[]; weaving: 剧情编织系统 }>;
  systems: Readonly<{ variableBatches: readonly 变量命令批次[] }>;
  policy: StoryPolicy;
  content: Readonly<{ zhikuRuntime: 智库系统 }>;
  turn: Readonly<{ pendingOpeningTrigger: string | null }>;
}>;

/** One committed projection: the runtime graph and its derived turn identities. */
export type SessionView = Readonly<{
  story: GameProjection;
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
  jobs: readonly JobProjection[];
}>;

export type SessionExistenceView = Readonly<{
  sessionId: SessionId;
  exists: boolean;
}>;

export type QueryResult = SessionView | SessionExistenceView;
