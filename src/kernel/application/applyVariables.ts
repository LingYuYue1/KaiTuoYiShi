/**
 * applyVariables — manual Variable Manager edits (Stage 5.1).
 *
 * Pipeline:
 * 1. read base snapshot
 * 2. revision check → rejected on conflict
 * 3. reduceVariables (pure)
 * 4. compareAndSwap once
 * 5. yield committed OR rejected
 *
 * No model call. No React setters. Formal write only via SessionRepository CAS.
 */

import type {
  ApplyVariablesEnvelope,
  ExecutionFrame,
  KernelError,
} from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  reduceVariables,
  travelerNameFromVariables,
  type VariableDomainCommand,
} from '@/src/kernel/domain/variables';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type ApplyVariablesDependencies = Readonly<{
  sessions: SessionRepository;
}>;

export async function* applyVariables(
  envelope: ApplyVariablesEnvelope,
  dependencies: ApplyVariablesDependencies,
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
    yield rejected(envelope, {
      code: 'revision_conflict',
      message: `expectedRevision ${envelope.expectedRevision} != actual ${base.revision}`,
      details: { actualRevision: base.revision },
    });
    return;
  }

  const commands = normalizeCommands(envelope.command.commands);
  if (commands.length === 0) {
    yield rejected(envelope, {
      code: 'unknown',
      message: 'variables.apply requires at least one command',
    });
    return;
  }

  const reduced = reduceVariables(commands, base.state.variables);
  if (!reduced.changed) {
    yield rejected(envelope, {
      code: 'no_changes',
      message: 'variables.apply did not change formal state',
      details: { results: reduced.results },
    });
    return;
  }

  const nextName = travelerNameFromVariables(reduced.nextVariables);
  const nextState = {
    ...base.state,
    travelerName: nextName,
    variables: reduced.nextVariables,
  };

  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState,
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejected(envelope, {
      code: 'revision_conflict',
      message: `expectedRevision ${envelope.expectedRevision} != actual ${commit.actualRevision}`,
      details: { actualRevision: commit.actualRevision },
    });
    return;
  }

  yield committedFrame(envelope, commit.snapshot);
}

function normalizeCommands(
  raw: ApplyVariablesEnvelope['command']['commands'],
): VariableDomainCommand[] {
  return raw.map((c) => ({
    action: c.action,
    key: c.key,
    value: c.value,
  }));
}

function rejected(
  envelope: ApplyVariablesEnvelope,
  error: KernelError,
): ExecutionFrame {
  return {
    type: 'rejected',
    commandId: envelope.commandId,
    error,
  };
}

function committedFrame(
  envelope: ApplyVariablesEnvelope,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId: envelope.commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
