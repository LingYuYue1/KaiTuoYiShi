import type { CreateSession, SessionCommand } from '@/src/kernel/contract/commands';

export type CommandFingerprint = string & { readonly __brand: 'CommandFingerprint' };

export function fingerprintCommand(command: CreateSession | SessionCommand): CommandFingerprint {
  return JSON.stringify(canonicalize(command)) as CommandFingerprint;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}
