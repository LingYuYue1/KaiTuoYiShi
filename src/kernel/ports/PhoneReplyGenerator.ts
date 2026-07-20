import type { 聊天消息 } from '@/models/chat';
import type { 角色数据结构 } from '@/models/character';
import type { 新闻条目 } from '@/models/news';
import type { NPC记录 } from '@/models/npc';
import type { 手机会话, 手机联系人, 主动来信种子 } from '@/models/phone';
import type { 游戏设置 } from '@/models/settings';
import type { 世界状态 } from '@/models/world';
import type { 智库系统 } from '@/models/zhiku';

export type PhoneReplyRequest = Readonly<{
  traveler: 角色数据结构;
  world: 世界状态;
  npcRecords: readonly NPC记录[];
  news: readonly 新闻条目[];
  turnCount: number;
  chat: 手机会话;
  contacts: readonly 手机联系人[];
  contact?: 手机联系人;
  userText?: string;
  seed?: 主动来信种子;
  mainChatHistory: readonly 聊天消息[];
  zhiku: 智库系统;
}>;

export type PhoneReplyResult = Readonly<{ messages: readonly string[]; summary?: string }>;

export interface PhoneReplyGenerator {
  generate(settings: 游戏设置, request: PhoneReplyRequest, signal: AbortSignal): Promise<PhoneReplyResult>;
}
