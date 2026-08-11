export type WorkflowRecoveryPhase = 'main_request' | 'variable_settlement' | 'autosave';

export interface WorkflowRecoveryJournal {
  version: 1;
  workflowId: string;
  startedAt: number;
  updatedAt: number;
  input: string;
  turnAtStart: number;
  phase: WorkflowRecoveryPhase;
  userMessageId?: string;
  assistantMessageId?: string;
  /** 子任务 A（片 5f）：commitTurn 提交协议本次晋升的目标子叶子 nodeId。
   *  建叶前持久化，供崩溃窗口（封版后、写指针前）恢复时按明确身份采纳子叶子，
   *  不依赖「多个子叶中按保存 ID 猜最新」的线性链假设。 */
  pendingChildNodeId?: string;
}

export interface WorkflowHistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
}

function createWorkflowId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  const uuid = cryptoApi?.randomUUID();
  return uuid ? `workflow_${uuid}` : `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkflowRecoveryJournal(input: string, turnAtStart: number): WorkflowRecoveryJournal {
  const now = Date.now();
  return {
    version: 1,
    workflowId: createWorkflowId(),
    startedAt: now,
    updatedAt: now,
    input: input.slice(0, 100_000),
    turnAtStart: Math.max(1, Math.trunc(turnAtStart) || 1),
    phase: 'main_request',
  };
}

export function parseWorkflowRecoveryJournal(value: unknown): WorkflowRecoveryJournal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<WorkflowRecoveryJournal>;
  if (raw.version !== 1 || typeof raw.workflowId !== 'string' || !raw.workflowId.trim()) return null;
  if (typeof raw.input !== 'string' || !raw.input.trim() || raw.input.length > 100_000) return null;
  if (!['main_request', 'variable_settlement', 'autosave'].includes(String(raw.phase))) return null;
  const startedAt = Number(raw.startedAt);
  const updatedAt = Number(raw.updatedAt);
  const turnAtStart = Number(raw.turnAtStart);
  if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt) || !Number.isFinite(turnAtStart)) return null;
  return {
    version: 1,
    workflowId: raw.workflowId,
    startedAt,
    updatedAt,
    input: raw.input,
    turnAtStart: Math.max(1, Math.trunc(turnAtStart)),
    phase: raw.phase as WorkflowRecoveryPhase,
    userMessageId: typeof raw.userMessageId === 'string' ? raw.userMessageId : undefined,
    assistantMessageId: typeof raw.assistantMessageId === 'string' ? raw.assistantMessageId : undefined,
    pendingChildNodeId:
      typeof raw.pendingChildNodeId === 'string' && raw.pendingChildNodeId.trim()
        ? raw.pendingChildNodeId
        : undefined,
  };
}

export function updateWorkflowRecoveryJournal(
  journal: WorkflowRecoveryJournal,
  patch: Partial<Pick<WorkflowRecoveryJournal, 'phase' | 'userMessageId' | 'assistantMessageId' | 'pendingChildNodeId'>>,
): WorkflowRecoveryJournal {
  return { ...journal, ...patch, updatedAt: Date.now() };
}

export function isWorkflowRecoveryComplete(
  journal: WorkflowRecoveryJournal,
  history: WorkflowHistoryMessage[],
): boolean {
  if (journal.assistantMessageId && history.some((message) => message.id === journal.assistantMessageId)) return true;
  if (!journal.userMessageId) return false;
  const userIndex = history.findIndex((message) => message.id === journal.userMessageId);
  if (userIndex < 0) return false;
  return history.slice(userIndex + 1).some((message) => message.role === 'assistant');
}
