export const WORLD_EVENT_STORAGE_LIMIT = 30;

function normalizeWorldEventFingerprint(text: string): string {
  return text
    .replace(/【[^】]{0,24}】/g, '')
    .replace(/[第回合纪要动态世界事件新闻线索：:，,。！？!?、；;\s\-\d]/g, '')
    .toLowerCase()
    .slice(0, 120);
}

function cleanWorldEvent(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

export function compactWorldEvents(
  events: readonly unknown[],
  limit = WORLD_EVENT_STORAGE_LIMIT,
): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0 && picked.length < limit; i -= 1) {
    const event = cleanWorldEvent(events[i]);
    if (!event) continue;
    const fp = normalizeWorldEventFingerprint(event);
    if (fp && seen.has(fp)) continue;
    if (fp) seen.add(fp);
    picked.unshift(event);
  }
  return picked;
}

export function appendWorldEvents(
  current: readonly unknown[],
  incoming: readonly unknown[],
  limit = WORLD_EVENT_STORAGE_LIMIT,
): string[] {
  return compactWorldEvents([...current, ...incoming], limit);
}
