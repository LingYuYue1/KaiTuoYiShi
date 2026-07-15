/**
 * Pure phone reply append (Stage 5.3).
 *
 * Appends one user message and one contact reply to a thread.
 * Creates the thread when missing (contactName provided by caller).
 * No quality scoring, I/O, or Date.now side effects.
 */

import type {
  KernelPhoneMessage,
  KernelPhoneSystem,
  KernelPhoneThread,
} from './types';

export type AppendPhoneReplyInput = Readonly<{
  contactId: string;
  contactName: string;
  userText: string;
  replyText: string;
  turn: number;
  userMessageId: string;
  replyMessageId: string;
}>;

/**
 * Append player text + contact reply onto a phone system snapshot.
 * Sync pure function — immutable return.
 */
export function appendPhoneReply(
  phone: KernelPhoneSystem,
  input: AppendPhoneReplyInput,
): KernelPhoneSystem {
  requirePhoneSystem(phone);
  requireAppendInput(input);

  const userMessage: KernelPhoneMessage = {
    id: input.userMessageId,
    role: 'user',
    contactId: input.contactId,
    content: input.userText,
    turn: input.turn,
  };
  const replyMessage: KernelPhoneMessage = {
    id: input.replyMessageId,
    role: 'contact',
    contactId: input.contactId,
    content: input.replyText,
    turn: input.turn,
  };

  const index = phone.threads.findIndex(
    (thread) => thread.contactId === input.contactId,
  );

  if (index < 0) {
    const thread: KernelPhoneThread = {
      contactId: input.contactId,
      contactName: input.contactName,
      messages: [userMessage, replyMessage],
    };
    return { threads: [...phone.threads, thread] };
  }

  const existing = phone.threads[index];
  const nextThread: KernelPhoneThread = {
    contactId: existing.contactId,
    contactName: input.contactName,
    messages: [...existing.messages, userMessage, replyMessage],
  };

  const threads = phone.threads.slice();
  threads[index] = nextThread;
  return { threads };
}

function requirePhoneSystem(phone: KernelPhoneSystem): void {
  if (!phone || typeof phone !== 'object') {
    throw new Error('appendPhoneReply: phone must be a KernelPhoneSystem object');
  }
  if (!Array.isArray(phone.threads)) {
    throw new Error('appendPhoneReply: phone.threads must be an array');
  }
  const seen = new Set<string>();
  for (const thread of phone.threads) {
    requireThread(thread, 'phone.threads');
    if (seen.has(thread.contactId)) {
      throw new Error(
        `appendPhoneReply: duplicate contactId in threads: ${thread.contactId}`,
      );
    }
    seen.add(thread.contactId);
  }
}

function requireThread(thread: KernelPhoneThread, label: string): void {
  if (!thread || typeof thread !== 'object') {
    throw new Error(`appendPhoneReply: ${label} item must be an object`);
  }
  requireNonEmptyString(thread.contactId, `${label}.contactId`);
  requireNonEmptyString(thread.contactName, `${label}.contactName`);
  if (!Array.isArray(thread.messages)) {
    throw new Error(`appendPhoneReply: ${label}.messages must be an array`);
  }
  for (const message of thread.messages) {
    requireMessage(message, `${label}.messages`);
  }
}

function requireMessage(message: KernelPhoneMessage, label: string): void {
  if (!message || typeof message !== 'object') {
    throw new Error(`appendPhoneReply: ${label} item must be an object`);
  }
  requireNonEmptyString(message.id, `${label}.id`);
  if (
    message.role !== 'user'
    && message.role !== 'contact'
    && message.role !== 'system'
  ) {
    throw new Error(
      `appendPhoneReply: ${label}.role must be 'user' | 'contact' | 'system'`,
    );
  }
  requireNonEmptyString(message.contactId, `${label}.contactId`);
  if (typeof message.content !== 'string') {
    throw new Error(`appendPhoneReply: ${label}.content must be a string`);
  }
  if (typeof message.turn !== 'number' || !Number.isFinite(message.turn)) {
    throw new Error(`appendPhoneReply: ${label}.turn must be a finite number`);
  }
}

function requireAppendInput(input: AppendPhoneReplyInput): void {
  if (!input || typeof input !== 'object') {
    throw new Error('appendPhoneReply: input must be an object');
  }
  requireNonEmptyString(input.contactId, 'input.contactId');
  requireNonEmptyString(input.contactName, 'input.contactName');
  requireNonEmptyString(input.userText, 'input.userText');
  requireNonEmptyString(input.replyText, 'input.replyText');
  requireNonEmptyString(input.userMessageId, 'input.userMessageId');
  requireNonEmptyString(input.replyMessageId, 'input.replyMessageId');
  if (typeof input.turn !== 'number' || !Number.isFinite(input.turn)) {
    throw new Error('appendPhoneReply: input.turn must be a finite number');
  }
  if (input.userMessageId === input.replyMessageId) {
    throw new Error('appendPhoneReply: userMessageId and replyMessageId must differ');
  }
}

function requireNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`appendPhoneReply: ${label} must be a non-empty string`);
  }
}
