import {
  asCommandId,
  asRevision,
  asSessionId,
  type IKernel,
} from '@/src/kernel/contract';
import { consumeExecution, type ExecutionSink } from './consumeExecution';

export type TurnIntent = Readonly<{
  text: string;
  commandId: string;
  sessionId: string;
  expectedRevision: number;
}>;

/** Production UI intent → IKernel command boundary. */
export async function executeTurnIntent(
  kernel: IKernel,
  intent: TurnIntent,
  sink: ExecutionSink,
): Promise<void> {
  await consumeExecution(kernel, {
    protocolVersion: 1,
    commandId: asCommandId(intent.commandId),
    sessionId: asSessionId(intent.sessionId),
    expectedRevision: asRevision(intent.expectedRevision),
    command: { type: 'turn.advance', input: { text: intent.text } },
  }, sink);
}
