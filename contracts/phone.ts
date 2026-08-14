import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 手机会话, 手机联系人, 主动来信种子 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 聊天消息 } from '@/models/chat';
import type { 智库系统 } from '@/models/zhiku';

// ── 手机回复（原 services/ai/phoneService.ts）──
export interface 手机回复上下文 {
  traveler: 角色数据结构;
  world: 世界状态;
  npcRecords: NPC记录[];
  news: 新闻条目[];
  turnCount: number;
  chat: 手机会话;
  contacts?: 手机联系人[];
  contact?: 手机联系人;
  userText?: string;
  seed?: 主动来信种子;
  mainChatHistory?: 聊天消息[];
  zhiku?: 智库系统;
}

// ── 手机记忆即时追加 + 归档压缩 + NPC 台账压缩入参（原 hooks/useGame.ts 自建）──
export interface PhoneMemoryCommitInput {
  summary: string;
  npcId?: string | null;
  force?: boolean;
}
