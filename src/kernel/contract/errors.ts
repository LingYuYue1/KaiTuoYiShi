/**
 * IKernel error contract.
 * Must not import old models, services, hooks, or UI types.
 *
 * `details` is a discriminated payload keyed by the error code — no untyped
 * bag.
 */

export type KernelErrorCode =
  | 'revision_conflict'
  | 'duplicate_command'
  | 'command_in_progress'
  | 'model_failure'
  | 'illegal_variable'
  | 'no_changes'
  | 'cancelled'
  | 'unsupported_command'
  | 'not_implemented'
  | 'unknown';

/** Discriminated per-code payloads. Codes without structured data omit details. */
export type KernelErrorDetails =
  | Readonly<{ kind: 'revision_conflict'; actualRevision: number }>
  | Readonly<{ kind: 'duplicate_command'; commandId: string }>
  | Readonly<{ kind: 'model_failure'; provider?: string; attempt?: number }>
  | Readonly<{ kind: 'schema'; field: string }>;

export type KernelError = Readonly<{
  code: KernelErrorCode;
  message: string;
  details?: KernelErrorDetails;
}>;
