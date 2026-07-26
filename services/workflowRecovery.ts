import { deleteSetting, loadSetting, saveSetting } from '@/services/dbService';
import {
  parseWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
} from '@/utils/workflowRecoveryModel';
export {
  createWorkflowRecoveryJournal,
  isWorkflowRecoveryComplete,
  parseWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
  type WorkflowRecoveryJournal,
  type WorkflowRecoveryPhase,
} from '@/utils/workflowRecoveryModel';

export const WORKFLOW_RECOVERY_KEY = 'activeWorkflowRecoveryV1';

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
