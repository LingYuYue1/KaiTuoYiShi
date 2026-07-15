/**
 * Pure phone prompt builder (Stage 5.3).
 *
 * Minimal deterministic prompt from existing thread history + userText.
 * Missing thread → throw (application must ensure thread exists first).
 */

import type { KernelPhoneMessage, KernelPhoneSystem } from './types';

export type BuildPhonePromptInput = Readonly<{
  contactId: string;
  userText: string;
  turnCount: number;
}>;

/**
 * Build a deterministic phone-reply user prompt from thread history.
 * Sync pure function — no I/O, no invented contacts.
 */
export function buildPhonePrompt(
  phone: KernelPhoneSystem,
  input: BuildPhonePromptInput,
): string {
  requirePhoneSystem(phone);
  requirePromptInput(input);

  const thread = phone.threads.find(
    (item) => item.contactId === input.contactId,
  );
  if (!thread) {
    throw new Error(
      `buildPhonePrompt: thread not found for contactId: ${input.contactId}`,
    );
  }

  const history = formatHistory(thread.messages);
  const lines = [
    `当前回合：${input.turnCount}`,
    `联系人：${thread.contactName}（${thread.contactId}）`,
    '',
    '【会话历史】',
    history,
    '',
    `玩家刚发送：${input.userText}`,
    '请生成对方回复。',
  ];
  return lines.join('\n');
}

function formatHistory(messages: readonly KernelPhoneMessage[]): string {
  if (messages.length === 0) {
    return '（无历史消息）';
  }
  return messages
    .map((message) => `${roleLabel(message.role)}：${message.content}`)
    .join('\n');
}

function roleLabel(role: KernelPhoneMessage['role']): string {
  if (role === 'user') return '玩家';
  if (role === 'contact') return '对方';
  return '系统';
}

function requirePhoneSystem(phone: KernelPhoneSystem): void {
  if (!phone || typeof phone !== 'object') {
    throw new Error('buildPhonePrompt: phone must be a KernelPhoneSystem object');
  }
  if (!Array.isArray(phone.threads)) {
    throw new Error('buildPhonePrompt: phone.threads must be an array');
  }
}

function requirePromptInput(input: BuildPhonePromptInput): void {
  if (!input || typeof input !== 'object') {
    throw new Error('buildPhonePrompt: input must be an object');
  }
  requireNonEmptyString(input.contactId, 'input.contactId');
  requireNonEmptyString(input.userText, 'input.userText');
  if (typeof input.turnCount !== 'number' || !Number.isFinite(input.turnCount)) {
    throw new Error('buildPhonePrompt: input.turnCount must be a finite number');
  }
}

function requireNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`buildPhonePrompt: ${label} must be a non-empty string`);
  }
}
