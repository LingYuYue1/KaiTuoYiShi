/**
 * phoneReply — Stage 5.3 phone contact reply application use case.
 *
 * Pipeline:
 * 1. findByCommandId idempotency
 * 2. read session; revision check
 * 3. validate envelope fields (rejected if empty)
 * 4. ensureThread (requires non-empty contactName)
 * 5. buildPhonePrompt
 * 6. model.complete → collect completed text
 * 7. appendPhoneReply
 * 8. compareAndSwap once
 * 9. committed | rejected
 *
 * Model failure / domain throw after model → rejected, state unchanged.
 * Expanding ModelGateway is forbidden — only model.complete(request).
 */

import type {
  ExecutionFrame,
  KernelError,
  PhoneReplyEnvelope,
  Revision,
} from '@/src/kernel/contract';
import type { ModelGateway, ModelRequest } from '@/src/kernel/ports/ModelGateway';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  appendPhoneReply,
  buildPhonePrompt,
  ensureThread,
} from '@/src/kernel/domain/phone';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { streamModelText } from './streamModelText';

export type PhoneReplyDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
}>;

export async function* phoneReply(
  envelope: PhoneReplyEnvelope,
  dependencies: PhoneReplyDependencies,
): AsyncIterable<ExecutionFrame> {
  const priorCommit = await dependencies.sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    yield committedFrame(envelope, priorCommit);
    return;
  }

  const base = await dependencies.sessions.read(envelope.sessionId);
  if (base.revision !== envelope.expectedRevision) {
    yield rejectedRevisionConflict(envelope, base.revision);
    return;
  }

  const validationError = validatePhoneReplyCommand(envelope);
  if (validationError) {
    yield rejected(envelope, validationError);
    return;
  }

  const { contactId, contactName, userText } = envelope.command;

  let phoneWithThread;
  try {
    phoneWithThread = ensureThread(base.state.phone, contactId, contactName);
  } catch (err) {
    yield rejected(envelope, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prompt: string;
  try {
    prompt = buildPhonePrompt(phoneWithThread, {
      contactId,
      userText,
      turnCount: base.state.turnCount,
    });
  } catch (err) {
    yield rejected(envelope, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const request: ModelRequest = {
    playerText: userText,
    turnCount: base.state.turnCount,
    messages: base.state.messages,
    prompt,
  };

  const streamResult = yield* streamModelText(
    envelope.commandId,
    dependencies.model,
    request,
  );
  if (streamResult.kind === 'failure') {
    yield rejected(envelope, {
      code: 'model_failure',
      message: streamResult.message,
    });
    return;
  }

  let nextPhone;
  try {
    nextPhone = appendPhoneReply(phoneWithThread, {
      contactId,
      contactName,
      userText,
      replyText: streamResult.completedText,
      turn: base.state.turnCount,
      userMessageId: `${envelope.commandId}:user`,
      replyMessageId: `${envelope.commandId}:contact`,
    });
  } catch (err) {
    // Domain throw after model → no half message write.
    yield rejected(envelope, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: {
      ...base.state,
      phone: nextPhone,
    },
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejectedRevisionConflict(envelope, commit.actualRevision);
    return;
  }

  yield committedFrame(envelope, commit.snapshot);
}

function validatePhoneReplyCommand(
  envelope: PhoneReplyEnvelope,
): KernelError | null {
  const { contactId, contactName, userText } = envelope.command;
  if (typeof contactId !== 'string' || contactId.trim().length === 0) {
    return { code: 'unknown', message: 'phone.reply requires non-empty contactId' };
  }
  if (typeof contactName !== 'string' || contactName.trim().length === 0) {
    return { code: 'unknown', message: 'phone.reply requires non-empty contactName' };
  }
  if (typeof userText !== 'string' || userText.trim().length === 0) {
    return { code: 'unknown', message: 'phone.reply requires non-empty userText' };
  }
  return null;
}

function rejectedRevisionConflict(
  envelope: PhoneReplyEnvelope,
  actualRevision: Revision,
): ExecutionFrame {
  return rejected(envelope, {
    code: 'revision_conflict',
    message: `expectedRevision ${envelope.expectedRevision} != actual ${actualRevision}`,
    details: { actualRevision },
  });
}

function rejected(
  envelope: PhoneReplyEnvelope,
  error: KernelError,
): ExecutionFrame {
  return {
    type: 'rejected',
    commandId: envelope.commandId,
    error,
  };
}

function committedFrame(
  envelope: PhoneReplyEnvelope,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId: envelope.commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
