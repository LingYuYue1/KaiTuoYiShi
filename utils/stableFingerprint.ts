function normalizeFingerprintText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(',')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(normalizeFingerprintText(value));
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 32-bit FNV-1a。这里只要求跨刷新稳定，不用于安全或防篡改。 */
export function stableFingerprint(value: unknown): string {
  const text = typeof value === 'string' ? normalizeFingerprintText(value) : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function createStableEntityId(prefix: string, source: unknown): string {
  return `${prefix}_${stableFingerprint(source)}`;
}
