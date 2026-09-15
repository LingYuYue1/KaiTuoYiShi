// 聊天历史查询：跨回合工作流共用的纯查询。
// 「上一条用户输入」是历史重解析 / 重试 / 补结算的共同输入，规则只留一份。

import type { 聊天消息 } from '@/models/chat';

/** 指定助手消息之前最近的一条用户消息正文；消息不存在或之前没有用户消息时返回空串。 */
export function findPreviousUserInput(history: readonly 聊天消息[], assistantId: string): string {
  const assistantIndex = history.findIndex((item) => item.id === assistantId);
  if (assistantIndex < 0) return '';
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (history[index].role === 'user') return history[index].content;
  }
  return '';
}
