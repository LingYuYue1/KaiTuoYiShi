/** Marks an abort whose durable state transition is owned by a paired command. */
export const PAIRED_COMMAND_CANCELLATION = Symbol('paired-command-cancellation');

export function hasPairedCancellation(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason === PAIRED_COMMAND_CANCELLATION;
}
