/**
 * Kernel Variable Engine (Stage 5.1) — pure domain surface.
 *
 * Temporary dual-path note:
 * - Legacy production KERNEL_MODE / sendWorkflow still uses utils/variableExecutor
 *   for the full 旅人/NPC/世界 graph until later stages migrate those roots.
 * - Native executeTurn / reduceTurn / variables.apply MUST use this module only.
 * - Do not reintroduce a permanent second reducer for the formal GameState slice.
 * - Deletion plan: when Stage 5.x finishes each root, remove the corresponding
 *   branch from utils/variableExecutor and stop re-exporting from utils.
 */

export type {
  KernelVariables,
  NativeVariableScalarPath,
  TravelerVariables,
  VariableAction,
  VariableCommandResult,
  VariableDomainCommand,
} from './types';

export {
  NATIVE_NUMERIC_ATTR_PREFIX,
  NATIVE_VARIABLE_ALLOWED_PATHS,
  cloneKernelVariables,
  cloneTravelerVariables,
  createEmptyKernelVariables,
  createEmptyTravelerVariables,
  travelerNameFromVariables,
  withTravelerName,
} from './types';

export {
  classifyVariablePath,
  isAllowedVariableCommand,
  isNumericActionAllowed,
  isScalarActionAllowed,
  type PathKind,
} from './paths';

export {
  parseVariableBlock,
  stripVariableBlock,
  type ParseVariableBlockResult,
} from './parseVariableBlock';

export {
  reduceVariables,
  type ReduceVariablesResult,
} from './reduceVariables';
