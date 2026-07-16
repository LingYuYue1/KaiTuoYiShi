import {
  asCommandId,
  asRevision,
  asSessionId,
  type IKernel,
  type CommittedFrame,
  type RejectedFrame,
} from '@/src/kernel/contract';
import { consumeExecution, type ExecutionSink } from './consumeExecution';

export type TurnIntent = Readonly<{
  text: string;
  commandId: string;
  sessionId: string;
  expectedRevision: number;
  createdAt: number;
}>;

/** Production UI intent → IKernel command boundary. */
export async function executeTurnIntent(
  kernel: IKernel,
  intent: TurnIntent,
  sink: ExecutionSink,
): Promise<CommittedFrame | RejectedFrame> {
  return consumeExecution(kernel, {
    protocolVersion: 1,
    commandId: asCommandId(intent.commandId),
    sessionId: asSessionId(intent.sessionId),
    expectedRevision: asRevision(intent.expectedRevision),
    command: {
      type: 'turn.advance',
      input: { text: intent.text, createdAt: intent.createdAt },
    },
  }, sink);
}
