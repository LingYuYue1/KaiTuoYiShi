import { useEffect, useMemo, useState } from 'react';
import type { NPC记录, NPC阶位 } from '@/models/npc';
import { 归一化NPC记录列表 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 智库系统 } from '@/models/zhiku';
import { buildNpcRelationshipPlanning } from '@/services/npcRelationshipPlanning';
import { enrichNpcArchives } from '@/utils/npcArchiveEnrichment';
import { NpcDetail } from './companion/npcDetail';
import { EmptyRoster, NoSelection, NpcListItem } from './companion/roster';
import { TabButton } from './companion/primitives';
import { accentColor, mutedColor, panelStyle } from './companion/constants';
import { sortNpcRecords } from './companion/sortNpcRecords';

interface CompanionPanelProps {
  npcRecords: NPC记录[];
  onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  album?: 相册系统;
  turnCount: number;
  nsfwEnabled: boolean;
  maleNsfwArchiveEnabled?: boolean;
  zhikuSystem?: 智库系统;
  devMode?: boolean;
}

export function CompanionPanel({ npcRecords, onNpcRecordsChange, album, nsfwEnabled, maleNsfwArchiveEnabled = false, zhikuSystem, devMode = false }: CompanionPanelProps) {
  const [tab, setTab] = useState<NPC阶位>('companion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedRecords = useMemo(() => {
    const normalized = 归一化NPC记录列表(npcRecords);
    return enrichNpcArchives(normalized, {
      nsfwEnabled,
      maleNsfwArchiveEnabled,
      zhiku: zhikuSystem,
    }).records;
  }, [npcRecords, nsfwEnabled, maleNsfwArchiveEnabled, zhikuSystem]);

  useEffect(() => {
    const normalized = 归一化NPC记录列表(npcRecords);
    const enriched = enrichNpcArchives(normalized, {
      nsfwEnabled,
      maleNsfwArchiveEnabled,
      zhiku: zhikuSystem,
    });
    if (enriched.changed) onNpcRecordsChange(enriched.records);
  }, [npcRecords, nsfwEnabled, maleNsfwArchiveEnabled, zhikuSystem, onNpcRecordsChange]);

  const companions = useMemo(
    () => sortNpcRecords(normalizedRecords.filter((n) => n.阶位 === 'companion')),
    [normalizedRecords],
  );
  const extras = useMemo(
    () => sortNpcRecords(normalizedRecords.filter((n) => n.阶位 === 'extra' && n.关系 !== 'enemy')),
    [normalizedRecords],
  );
  const visible = tab === 'companion' ? companions : extras;

  const travelingCount = companions.filter((n) => n.同行).length;
  const friendCount = companions.filter((n) => ['friend', 'close'].includes(n.关系)).length;

  const effectiveSelectedId = selectedId && visible.some((n) => n.id === selectedId) ? selectedId : (visible.at(0)?.id ?? null);

  const selected = visible.find((n) => n.id === effectiveSelectedId) ?? null;
  const relationshipPlanning = useMemo(
    () => buildNpcRelationshipPlanning(normalizedRecords, Math.max(...normalizedRecords.map((npc) => npc.最近回合 || 0), 1)),
    [normalizedRecords],
  );
  const selectedPlanning = selected ? relationshipPlanning.条目.find((item) => item.npcId === selected.id) : undefined;

  const updateRecord = (id: string, patch: Partial<NPC记录>) => {
    onNpcRecordsChange((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const promoteToCompanion = (id: string) => updateRecord(id, { 阶位: 'companion' });
  const demoteToExtra = (id: string) => updateRecord(id, { 阶位: 'extra', 同行: false });
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden md:flex-row md:gap-4 md:overflow-hidden">
      <aside className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:w-[260px]">
        <div className="hidden px-3 py-3 md:block" style={panelStyle}>
          <div>
            <div>
              <div
                className="font-serif text-[12px] tracking-[0.3em]"
                style={{ color: accentColor }}
              >
                人际档案
              </div>
              <div
                className="mt-1 font-serif text-[12px] tracking-[0.12em]"
                style={{ color: mutedColor }}
              >
                同行 {travelingCount} / 朋友 {friendCount} / 全部 {normalizedRecords.length}
              </div>
            </div>
            <div className="mt-3 text-[11px] leading-relaxed" style={{ color: mutedColor }}>
              关系规划：{relationshipPlanning.总览}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TabButton active={tab === 'companion'} onClick={() => setTab('companion')}>
            伙伴 {companions.length}
          </TabButton>
          <TabButton active={tab === 'extra'} onClick={() => setTab('extra')}>
            路人 {extras.length}
          </TabButton>
        </div>

        <div className="flex min-w-0 gap-2 overflow-x-auto overflow-y-hidden pb-1 md:min-h-0 md:flex-1 md:block md:space-y-2 md:overflow-y-auto md:overflow-x-hidden md:pb-0 md:pr-1">
          {visible.length ? (
            visible.map((npc) => (
              <NpcListItem
                key={npc.id}
                npc={npc}
                album={album}
                selected={npc.id === effectiveSelectedId}
                onClick={() => {
                  setSelectedId(npc.id);
                }}
              />
            ))
          ) : (
            <EmptyRoster tab={tab} />
          )}
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-visible md:overflow-y-auto md:pr-1">
        {selected ? (
          <NpcDetail
            npc={selected}
            album={album}
            nsfwEnabled={nsfwEnabled}
            onPromote={() => promoteToCompanion(selected.id)}
            onDemote={() => demoteToExtra(selected.id)}
            onToggleTraveling={() => updateRecord(selected.id, { 同行: !selected.同行 })}
            planning={selectedPlanning}
            devMode={devMode}
          />
        ) : (
          <NoSelection tab={tab} />
        )}
      </main>
    </div>
  );
}
