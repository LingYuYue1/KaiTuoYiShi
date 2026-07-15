/**
 * Kernel phone domain (Stage 5.3) — pure surface.
 *
 * Private-chat append and minimal prompt build.
 * Integration into application / PhoneModal adapters is Agent B's job.
 */

export { appendPhoneReply } from './appendPhoneReply';
export type { AppendPhoneReplyInput } from './appendPhoneReply';
export { buildPhonePrompt } from './buildPhonePrompt';
export type { BuildPhonePromptInput } from './buildPhonePrompt';
export { ensureThread } from './ensureThread';

export type {
  KernelPhoneMessage,
  KernelPhoneSystem,
  KernelPhoneThread,
} from './types';
export {
  cloneKernelPhone,
  createEmptyKernelPhone,
  findPhoneThread,
} from './types';
