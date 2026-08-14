import { deleteSetting, loadSetting, saveSetting } from '@/services/storage/settings';
import {
  parseWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
} from '@/utils/workflowRecoveryModel';
import type { 聊天消息 } from '@/models/chat';
export {
  createWorkflowRecoveryJournal,
  isWorkflowRecoveryComplete,
  parseWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
  type WorkflowRecoveryPhase,
} from '@/utils/workflowRecoveryModel';

export const WORKFLOW_RECOVERY_KEY = 'activeWorkflowRecoveryV1';

/**
 * 判定中断回合现场是否可续跑：chatHistory 来自活跃叶子（工作区）的最新历史，
 * 必须包含该回合的用户消息且末尾 assistant 消息与日志一致（子任务 A：
 * 工作区数据源从 newest.story 改为活跃叶子载荷）。
 */
export function isResumableWorkspace(
  journal: WorkflowRecoveryJournal,
  chatHistory: 聊天消息[],
): boolean {
  if (journal.phase !== 'variable_settlement' && journal.phase !== 'autosave') return false;
  if (!journal.userMessageId?.trim() || !journal.assistantMessageId?.trim()) return false;
  if (!Array.isArray(chatHistory)) return false;
  if (!chatHistory.some((message) => message.id === journal.userMessageId)) return false;
  const assistant = chatHistory.at(-1);
  const parsedResponse: unknown = assistant ? Reflect.get(assistant, 'parsedResponse') : null;
  return assistant?.role === 'assistant'
    && assistant.id === journal.assistantMessageId
    && typeof parsedResponse === 'object'
    && parsedResponse !== null;
}

export async function loadWorkflowRecoveryJournal(): Promise<WorkflowRecoveryJournal | null> {
  try {
    return parseWorkflowRecoveryJournal(await loadSetting<unknown>(WORKFLOW_RECOVERY_KEY));
  } catch (error) {
    console.warn('[workflow-recovery] failed to load journal', error);
    return null;
  }
}

export async function persistWorkflowRecoveryJournal(journal: WorkflowRecoveryJournal): Promise<void> {
  try {
    await saveSetting(WORKFLOW_RECOVERY_KEY, journal);
  } catch (error) {
    console.warn('[workflow-recovery] failed to persist journal', error);
  }
}

export async function clearWorkflowRecoveryJournal(workflowId?: string): Promise<void> {
  try {
    if (workflowId) {
      const current = await loadWorkflowRecoveryJournal();
      if (current && current.workflowId !== workflowId) return;
    }
    await deleteSetting(WORKFLOW_RECOVERY_KEY);
  } catch (error) {
    console.warn('[workflow-recovery] failed to clear journal', error);
  }
}
