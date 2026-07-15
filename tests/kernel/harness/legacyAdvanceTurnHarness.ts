/**
 * ProvisionalAdvanceTurnHarness — test-only model for proposed IKernel semantics.
 *
 * Production path (PathAufCalls §2.2 / §4.8):
 *   UI → useGame.handleSend → executeSendWorkflow
 *
 * Full `executeSendWorkflow` is entangled with React state, IndexedDB, and AI.
 * This harness does **not** call production sendWorkflow. It models only a narrow
 * proposed contract and emits IKernel-shaped frames so contract tests can call an
 * Interface instead of searching source strings.
 *
 * It is not a legacy-characterization harness and must not be used as Phase-0
 * Exit Gate evidence. A production-driven harness must exercise the real workflow
 * through controlled model, persistence, and state ports before that gate passes.
 *
 * Observable mapping (verified against hooks/useGame/sendWorkflow.ts):
 * 1. User input is accepted as the turn player text.
 * 2. Model stream deltas are provisional progress (streaming store / visibility buffer).
 * 3. Success: assistant narrative + formal commit (turnCount +1; revision +1 here).
 * 4. AI failure: formal CAS state/revision unchanged; no assistant turn.
 *    (Legacy also leaves an orphan user message in React history on non-abort failure —
 *     that UI-side partial write is characterized separately and is NOT a formal commit.)
 * 5. Illegal variable blocks: parse errors / rejected commands do not mutate traveler
 *    domain slice when no legal commands remain (uses real parseVariableCommands).
 * 6. Save/re-read: in-memory repository snapshot (no IndexedDB).
 *
 * Provisional revision: production has no CAS revision yet. We use a linear
 * formal-commit counter that only advances on successful terminal commit.
 */

import { parseVariableCommands } from '@/utils/variableExecutor';
import { InMemorySessionRepository } from './inMemorySessionRepository';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type CommandEnvelope,
  type CommandId,
  type ExecutionFrame,
  type IKernel,
  type KernelQuery,
  type QueryResult,
  type Revision,
  type SessionId,
  type SessionSnapshot,
  type SessionView,
  type TurnView,
} from './types';

export type ModelTurnResult =
  | Readonly<{
      kind: 'stream_success';
      chunks: readonly string[];
      /** Full narrative body after stream. */
      narrativeText: string;
      /** Optional `<变量更新>` block text from model (may be illegal). */
      variableBlock?: string;
    }>
  | Readonly<{
      kind: 'stream_failure';
      chunks?: readonly string[];
      message: string;
    }>;

export type ModelFake = {
  complete(input: Readonly<{ text: string; turnCount: number }>): Promise<ModelTurnResult>;
};

export type LegacyHarnessOptions = Readonly<{
  sessionId?: string;
  initialRevision?: number;
  turnCount?: number;
  travelerName?: string;
  model: ModelFake;
}>;

export type ProvisionalAdvanceTurnHarness = IKernel & {
  readonly repository: InMemorySessionRepository;
  readonly sessionId: SessionId;
  advanceTurn(
    text: string,
    opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
  ): CommandEnvelope;
  currentRevision(): Promise<Revision>;
  readSnapshot(): Promise<SessionSnapshot>;
};

function toView(snapshot: SessionSnapshot): SessionView {
  return {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    turnCount: snapshot.turnCount,
    turns: snapshot.turns,
    messages: snapshot.messages,
  };
}

function makeTurnId(commandId: CommandId): string {
  return `turn_${commandId}`;
}

/**
 * Apply only a legal `set 旅人.姓名` when present.
 * Uses real parseVariableCommands so illegal blocks produce parseErrors and no mutation.
 */
function applyLegalTravelerName(
  currentName: string,
  variableBlock: string | undefined,
): { nextName: string; parseErrors: string[]; applied: boolean } {
  if (!variableBlock) {
    return { nextName: currentName, parseErrors: [], applied: false };
  }
  const { commands, parseErrors } = parseVariableCommands(variableBlock);
  if (parseErrors.length > 0 && commands.length === 0) {
    return { nextName: currentName, parseErrors, applied: false };
  }
  const setName = commands.find(
    (c) => c.action === 'set' && c.key === '旅人.姓名' && typeof c.value === 'string',
  );
  if (!setName || typeof setName.value !== 'string') {
    return { nextName: currentName, parseErrors, applied: false };
  }
  return { nextName: setName.value, parseErrors, applied: true };
}

export function createLegacyAdvanceTurnHarness(
  options: LegacyHarnessOptions,
): ProvisionalAdvanceTurnHarness {
  const repository = new InMemorySessionRepository();
  const sessionId = asSessionId(options.sessionId ?? 'session-legacy-1');
  const model = options.model;
  const initial: SessionSnapshot = {
    sessionId,
    revision: asRevision(options.initialRevision ?? 0),
    turnCount: options.turnCount ?? 1,
    messages: [],
    turns: [],
    travelerName: options.travelerName ?? '开拓者',
  };
  repository.seed(initial);

  return {
    repository,
    sessionId,

    advanceTurn(text, opts) {
      return {
        protocolVersion: 1,
        commandId: asCommandId(
          opts?.commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ),
        sessionId,
        expectedRevision: asRevision(opts?.expectedRevision ?? 0),
        command: {
          type: 'turn.advance',
          input: { text },
        },
      };
    },

    async currentRevision() {
      return (await repository.read(sessionId)).revision;
    },

    async readSnapshot() {
      return repository.read(sessionId);
    },

    async read(query: KernelQuery): Promise<QueryResult> {
      if (query.type !== 'session.read') {
        throw new Error(`Unsupported query: ${(query as { type: string }).type}`);
      }
      return toView(await repository.read(query.sessionId));
    },

    async *execute(command: CommandEnvelope): AsyncIterable<ExecutionFrame> {
      if (command.command.type !== 'turn.advance') {
        yield {
          type: 'rejected',
          commandId: command.commandId,
          error: {
            code: 'unknown',
            message: `Unsupported command type: ${(command.command as { type: string }).type}`,
          },
        };
        return;
      }

      // Idempotent retry: same commandId that already committed returns prior snapshot
      // even if the client still holds the old expectedRevision (replay semantics).
      const prior = await repository.findByCommandId(command.sessionId, command.commandId);
      if (prior) {
        yield {
          type: 'committed',
          commandId: command.commandId,
          revision: prior.revision,
          view: toView(prior),
        };
        return;
      }

      const base = await repository.read(command.sessionId);

      if (base.revision !== command.expectedRevision) {
        yield {
          type: 'rejected',
          commandId: command.commandId,
          error: {
            code: 'revision_conflict',
            message: `expectedRevision ${command.expectedRevision} != actual ${base.revision}`,
            details: { actualRevision: base.revision },
          },
        };
        return;
      }

      const playerText = command.command.input.text;
      let modelResult: ModelTurnResult;
      try {
        modelResult = await model.complete({ text: playerText, turnCount: base.turnCount });
      } catch (err) {
        yield {
          type: 'rejected',
          commandId: command.commandId,
          error: {
            code: 'model_failure',
            message: err instanceof Error ? err.message : String(err),
          },
        };
        return;
      }

      if (modelResult.kind === 'stream_failure') {
        for (const chunk of modelResult.chunks ?? []) {
          yield {
            type: 'progress',
            commandId: command.commandId,
            delta: { kind: 'narrative', text: chunk },
          };
        }
        // Formal state must remain unchanged (no repository write).
        yield {
          type: 'rejected',
          commandId: command.commandId,
          error: {
            code: 'model_failure',
            message: modelResult.message,
          },
        };
        return;
      }

      // Progress frames: cumulative stream text (mirrors streaming preview order).
      let cumulative = '';
      const progressTexts: string[] = [];
      for (const chunk of modelResult.chunks) {
        cumulative += chunk;
        progressTexts.push(cumulative);
        yield {
          type: 'progress',
          commandId: command.commandId,
          delta: { kind: 'narrative', text: cumulative },
        };
      }

      // Illegal variable output: parse errors with zero legal commands → travelerName unchanged.
      // Legal set 旅人.姓名 is applied only when parse succeeds (characterization of domain slice).
      const { nextName } = applyLegalTravelerName(base.travelerName, modelResult.variableBlock);

      const turn: TurnView = {
        id: makeTurnId(command.commandId),
        playerText,
        narrativeText: modelResult.narrativeText,
      };

      const nextMessages = [
        ...base.messages,
        { role: 'user' as const, content: playerText },
        { role: 'assistant' as const, content: modelResult.narrativeText },
      ];

      const commit = await repository.compareAndSwap({
        sessionId: command.sessionId,
        expectedRevision: command.expectedRevision,
        commandId: command.commandId,
        next: {
          turnCount: base.turnCount + 1,
          messages: nextMessages,
          turns: [...base.turns, turn],
          travelerName: nextName,
        },
      });

      if (commit.type === 'conflict') {
        yield {
          type: 'rejected',
          commandId: command.commandId,
          error: {
            code: 'revision_conflict',
            message: `CAS conflict; actual revision ${commit.actualRevision}`,
            details: { actualRevision: commit.actualRevision },
          },
        };
        return;
      }

      if (commit.type === 'duplicate') {
        // Same commandId already committed: return prior committed view, no second revision bump.
        yield {
          type: 'committed',
          commandId: command.commandId,
          revision: commit.snapshot.revision,
          view: toView(commit.snapshot),
        };
        return;
      }

      yield {
        type: 'committed',
        commandId: command.commandId,
        revision: commit.snapshot.revision,
        view: {
          ...toView(commit.snapshot),
          lastProgressTexts: progressTexts,
        },
      };
    },
  };
}
