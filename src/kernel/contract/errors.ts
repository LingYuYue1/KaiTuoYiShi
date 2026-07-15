/**
 * IKernel error contract (Phase 1).
 * Must not import old models, services, hooks, or UI types.
 */

export type KernelErrorCode =
  | 'revision_conflict'
  | 'duplicate_command'
  | 'model_failure'
  | 'illegal_variable'
  | 'cancelled'
  | 'unsupported_command'
  | 'not_implemented'
  | 'unknown';

export type KernelError = Readonly<{
  code: KernelErrorCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;
