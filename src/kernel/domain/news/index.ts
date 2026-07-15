/**
 * Kernel news domain (Stage 5.3) — pure surface.
 *
 * Patch apply and optional model-text parsing for news entries.
 * Integration into executeTurn / application adapters is Agent B's job.
 */

export { applyNewsPatch } from './applyNewsPatch';
export { parseNewsModelText } from './parseNewsModelText';

export type {
  KernelNewsEntry,
  KernelNewsGenerationPatch,
  KernelNewsSystem,
  KernelNewsUpdate,
} from './types';
export {
  cloneKernelNews,
  createEmptyKernelNews,
  createEmptyNewsPatch,
} from './types';
