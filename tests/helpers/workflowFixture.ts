import { loadActiveLeaf } from '@/services/storage/saveTree';
import { 创建空解析回复, type 聊天消息, type 解析后回复 } from '@/models/chat';
import type { 队列任务记录 } from '@/models/queueTask';
import type { TurnRecoveryContext } from '@/models/turnRecovery';

export function userMessage(id: string, content = '继续前进'): 聊天消息 {
  return { id, role: 'user', content, timestamp: 1 };
}

export function assistantMessage(id: string, body = '正文内容'): 聊天消息 {
  return {
    id,
    role: 'assistant',
    content: body,
    timestamp: 2,
    gameTime: '2',
    parsedResponse: { ...创建空解析回复(), body, rawText: body },
  };
}

export function latestTask(
  queueTasks: 队列任务记录[],
  id: 队列任务记录['id'],
): 队列任务记录 | undefined {
  return [...queueTasks].reverse().find((task) => task.id === id);
}

/** 读取活跃叶子；不可读时抛与原各文件一致的错误。 */
export async function loadActiveLeafOrThrow() {
  const active = await loadActiveLeaf();
  if (active.status !== 'ok') throw new Error(`活跃叶子不可读：${active.status}`);
  return active;
}

export function parsedStub(body: string): 解析后回复 {
  return { body } as unknown as 解析后回复;
}

/** 注意：默认 turnAtStart=1（leaf-recovery 原值）；resume-recovery 原默认 2，迁移时调用方显式传 2。 */
export function recoveryFor(
  input: string,
  userMessageId: string,
  extra: Partial<TurnRecoveryContext> = {},
  turnAtStart = 1,
): TurnRecoveryContext {
  return { turnAtStart, userInput: input, userMessageId, ...extra };
}
