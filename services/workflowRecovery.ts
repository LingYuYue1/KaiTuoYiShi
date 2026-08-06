import { deleteSetting, loadSetting, saveSetting } from '@/services/dbService';
import {
  parseWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
} from '@/utils/workflowRecoveryModel';
import type { NewestStory记录 } from '@/models/newestStory';
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

export function isResumableWorkspace(
  journal: WorkflowRecoveryJournal,
  newest: NewestStory记录,
): boolean {
  if (journal.phase !== 'variable_settlement' && journal.phase !== 'autosave') return false;
  if (!journal.userMessageId?.trim() || !journal.assistantMessageId?.trim()) return false;
  if (!newest.baseCheckpointId || !Array.isArray(newest.story.chatHistory)) return false;
  const history: 聊天消息[] = newest.story.chatHistory;
  if (!history.some((message) => message.id === journal.userMessageId)) return false;
  const assistant = history.at(-1);
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
