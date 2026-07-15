/**
 * Kernel phone-domain types (Stage 5.3).
 *
 * Minimal formal shapes for pure private-chat append and prompt build.
 * Not a full dump of models/phone (groups, seeds, archives, etc.).
 */

export type KernelPhoneMessage = Readonly<{
  id: string;
  role: 'user' | 'contact' | 'system';
  contactId: string;
  content: string;
  turn: number;
}>;

export type KernelPhoneThread = Readonly<{
  contactId: string;
  contactName: string;
  messages: readonly KernelPhoneMessage[];
}>;

export type KernelPhoneSystem = Readonly<{
  threads: readonly KernelPhoneThread[];
}>;

/** Empty formal phone system — valid state for new sessions / schema ingress. */
export function createEmptyKernelPhone(): KernelPhoneSystem {
  return { threads: [] };
}

export function cloneKernelPhone(phone: KernelPhoneSystem): KernelPhoneSystem {
  return {
    threads: phone.threads.map((thread) => ({
      contactId: thread.contactId,
      contactName: thread.contactName,
      messages: thread.messages.map((message) => ({ ...message })),
    })),
  };
}

export function findPhoneThread(
  phone: KernelPhoneSystem,
  contactId: string,
): KernelPhoneThread | undefined {
  return phone.threads.find((thread) => thread.contactId === contactId);
}
