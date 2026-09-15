// 变量修复中心历史回合扫描（纯查询，不触碰存储与 React）。
// 单条重解析直接调 services/variableRepair 的 重新解析变量计划，此处不包转发层。

import type { 聊天消息 } from '@/models/chat';

export interface 可修复回合 {
  turn: number;
  targetMessageId: string;
}

function 回合正文(message: 聊天消息): string {
  return message.parsedResponse?.body ?? message.content;
}

/**
 * 找出可重解析变量命令的历史助手回合：正文非空、未在流式传输，
 * 新 → 旧排列；回合号取消息 gameTime（Number 失效时用序号兜底）。最多 limit 条。
 * 只返回定位信息：正文与 userInput 由消费方按 targetMessageId 取，避免此处另算一份。
 */
export function 列出可修复回合(
  messages: readonly 聊天消息[],
  limit = 40,
): 可修复回合[] {
  const results: 可修复回合[] = [];
  for (let index = messages.length - 1; index >= 0 && results.length < limit; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || message.isStreaming) continue;
    if (!回合正文(message).trim()) continue;
    const 原始回合 = message.gameTime;
    const 数值回合 = 原始回合 === undefined || 原始回合.trim() === '' ? Number.NaN : Number(原始回合);
    const turn = Number.isFinite(数值回合) && 数值回合 >= 0 ? Math.trunc(数值回合) : index + 1;
    results.push({ turn, targetMessageId: message.id });
  }
  return results;
}
