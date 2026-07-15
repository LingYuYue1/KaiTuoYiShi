/**
 * Pure: ensure a private contact thread exists before buildPhonePrompt.
 * Requires non-empty contactId and contactName — missing name is illegal.
 */

import type { KernelPhoneSystem } from './types';
import { findPhoneThread } from './types';

export function ensureThread(
  phone: KernelPhoneSystem,
  contactId: string,
  contactName: string,
): KernelPhoneSystem {
  if (typeof contactId !== 'string' || contactId.trim().length === 0) {
    throw new Error('ensureThread: contactId must be a non-empty string');
  }
  if (typeof contactName !== 'string' || contactName.trim().length === 0) {
    throw new Error('ensureThread: contactName must be a non-empty string');
  }

  const existing = findPhoneThread(phone, contactId);
  if (existing) {
    return phone;
  }

  return {
    threads: [
      ...phone.threads,
      {
        contactId,
        contactName,
        messages: [],
      },
    ],
  };
}
