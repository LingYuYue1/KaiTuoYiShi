import type { NPC记录 } from '@/models/npc';

export function sortNpcRecords(records: NPC记录[]) {
  return [...records].sort((a, b) => {
    const weight = (n: NPC记录) => (n.同行 ? 0 : n.原著角色 ? 1 : 2);
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    return (b.好感度) - (a.好感度);
  });
}
