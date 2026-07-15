import type { CommandId, ExecutionFrame } from '@/src/kernel/contract';
import type { ModelGateway, ModelRequest } from '@/src/kernel/ports/ModelGateway';

export type ModelTextResult =
  | Readonly<{ kind: 'success'; completedText: string }>
  | Readonly<{ kind: 'failure'; message: string }>;

/** Stream one model request into kernel progress frames and return its text. */
export async function* streamModelText(
  commandId: CommandId,
  model: ModelGateway,
  request: ModelRequest,
): AsyncGenerator<ExecutionFrame, ModelTextResult, unknown> {
  let text = '';
  try {
    for await (const frame of model.complete(request)) {
      text = frame.text;
      if (frame.type === 'delta') {
        yield { type: 'progress', commandId, delta: { kind: 'narrative', text } };
      }
    }
  } catch (error) {
    return { kind: 'failure', message: error instanceof Error ? error.message : String(error) };
  }
  return text
    ? { kind: 'success', completedText: text }
    : { kind: 'failure', message: 'Model completed without text' };
}
