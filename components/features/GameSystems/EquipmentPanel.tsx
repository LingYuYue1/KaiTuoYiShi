import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 装备槽位ID } from '@/models/equipment';
import { EQUIP_SLOT_LABELS, EQUIP_SLOT_ORDER } from '@/models/equipment';
import type { 背包物品 } from '@/models/inventory';
import { ITEM_QUALITY_COLORS, 是装备类 } from '@/models/inventory';
import { 卸下槽位 } from '@/utils/inventoryActions';

interface EquipmentPanelProps {
  traveler: 角色数据结构;
  onTravelerChange: React.Dispatch<React.SetStateAction<角色数据结构>>;
}

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const SLOT_GROUPS: { title: string; note: string; slots: 装备槽位ID[] }[] = [
  { title: '战斗核心', note: '光锥与武装', slots: ['lightcone', 'weapon'] },
  { title: '衣装', note: '帽衣裤鞋', slots: ['head', 'outfit', 'legs', 'feet'] },
  { title: '饰品', note: '随身信物', slots: ['accessory1', 'accessory2'] },
];

const slotGlyphs: Record<装备槽位ID, string> = {
  lightcone: '◇',
  weapon: '✦',
  head: '◠',
  outfit: '▣',
  legs: 'Ⅱ',
  feet: '⌁',
  accessory1: '✧',
  accessory2: '✧',
};

const panelStyle = {
  background:
    'radial-gradient(circle at 10% 0%, rgba(117, 214, 216, 0.075), transparent 34%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))',
  boxShadow:
    'inset 0 0 0 1px rgba(var(--tj-border), 0.62), 0 14px 32px rgba(var(--tj-shadow), 0.1)',
  clipPath: cardClip,
};

function 查询装备(traveler: 角色数据结构, slot: 装备槽位ID): 背包物品 | null {
  const id = (traveler.装备 ?? {})[slot];
  if (!id) return null;
  return (traveler.背包 ?? []).find((it) => it.id === id) ?? null;
}

export function EquipmentPanel({ traveler, onTravelerChange }: EquipmentPanelProps) {
  const equippedBySlot = useMemo(() => {
    const result = new Map<装备槽位ID, 背包物品 | null>();
    for (const slot of EQUIP_SLOT_ORDER) result.set(slot, 查询装备(traveler, slot));
    return result;
  }, [traveler]);

  const firstEquipped =
    EQUIP_SLOT_ORDER.find((slot) => Boolean(equippedBySlot.get(slot))) ?? EQUIP_SLOT_ORDER[0];
  const [selectedSlot, setSelectedSlot] = useState<装备槽位ID>(firstEquipped);

  useEffect(() => {
    if (!EQUIP_SLOT_ORDER.includes(selectedSlot)) setSelectedSlot(firstEquipped);
  }, [firstEquipped, selectedSlot]);

  const selectedItem = equippedBySlot.get(selectedSlot) ?? null;
  const equippedCount = EQUIP_SLOT_ORDER.filter((slot) => Boolean(equippedBySlot.get(slot))).length;
  const narrativeEffects = collectNarrativeEffects(Array.from(equippedBySlot.values()).filter(Boolean) as 背包物品[]);

  const unequip = (slot: 装备槽位ID) => {
    onTravelerChange((prev) => {
      const res = 卸下槽位(prev, slot);
      return res.ok ? res.traveler : prev;
    });
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[270px] min-h-0 shrink-0 flex-col gap-3">
        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="装备总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="已装备" value={`${equippedCount}/8`} />
            <MetricTile label="可穿戴" value={`${(traveler.背包 ?? []).filter(是装备类).length}`} />
          </div>
          <div className="mt-3">
            <MiniEquipBar value={equippedCount} />
          </div>
          <div className="mt-3">
            <SlotMatrix
              selectedSlot={selectedSlot}
              equippedBySlot={equippedBySlot}
              onSelect={setSelectedSlot}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {SLOT_GROUPS.map((group) => (
            <SlotGroup
              key={group.title}
              title={group.title}
              note={group.note}
              slots={group.slots}
              selectedSlot={selectedSlot}
              equippedBySlot={equippedBySlot}
              onSelect={setSelectedSlot}
            />
          ))}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="min-h-full px-5 py-5" style={panelStyle}>
          <SelectedEquipment
            slot={selectedSlot}
            item={selectedItem}
            onUnequip={() => unequip(selectedSlot)}
          />

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <PanelSection title="行装效果">
              {narrativeEffects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {narrativeEffects.map((effect) => (
                    <EffectChip key={effect} text={effect} />
                  ))}
                </div>
              ) : (
                <EmptyNotice title="暂无行装效果" text="穿戴带有叙事效果的物品后，这里会显示可被正文调用的资源。" />
              )}
            </PanelSection>

            <PanelSection title="穿戴说明">
              <p
                className="font-serif text-[14px] leading-[1.85] tracking-wider"
                style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}
              >
                光锥、武装、衣装与随身信物会在这里汇成一份统一的行装记录。槽位状态、叙事效果与已持有装备都能在此读取。
              </p>
            </PanelSection>
          </div>
        </div>
      </main>
    </div>
  );
}

function SlotMatrix({
  selectedSlot,
  equippedBySlot,
  onSelect,
}: {
  selectedSlot: 装备槽位ID;
  equippedBySlot: Map<装备槽位ID, 背包物品 | null>;
  onSelect: (slot: 装备槽位ID) => void;
}) {
  return (
    <div>
      <div className="mb-2 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
        槽位矩阵
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {EQUIP_SLOT_ORDER.map((slot) => {
          const item = equippedBySlot.get(slot) ?? null;
          const active = slot === selectedSlot;
          const color = item ? getQualityColor(item) : 'rgba(var(--tj-text-secondary),0.24)';
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(slot)}
              title={`${EQUIP_SLOT_LABELS[slot]}${item ? ` · ${item.名称}` : ' · 空'}`}
              className="h-3 transition-all hover:brightness-110"
              style={{
                background: active
                  ? color
                  : item
                    ? color.replace(/0\.\d+\)/, '0.42)')
                    : 'rgba(var(--tj-text-secondary), 0.16)',
                boxShadow: active
                  ? `0 0 10px ${color}, inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)`
                  : item
                    ? `inset 0 0 0 1px ${color}`
                    : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.16)',
                clipPath: smallClip,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SlotGroup({
  title,
  note,
  slots,
  selectedSlot,
  equippedBySlot,
  onSelect,
}: {
  title: string;
  note: string;
  slots: 装备槽位ID[];
  selectedSlot: 装备槽位ID;
  equippedBySlot: Map<装备槽位ID, 背包物品 | null>;
  onSelect: (slot: 装备槽位ID) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <div className="font-serif text-[13px] font-semibold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
          {title}
        </div>
        <div className="font-serif text-[12px] tracking-[0.14em]" style={{ color: 'rgba(210, 198, 168, 0.72)' }}>
          {note}
        </div>
      </div>
      <div className="space-y-2">
        {slots.map((slot) => (
          <SlotButton
            key={slot}
            slot={slot}
            item={equippedBySlot.get(slot) ?? null}
            selected={slot === selectedSlot}
            onClick={() => onSelect(slot)}
          />
        ))}
      </div>
    </section>
  );
}

function SlotButton({
  slot,
  item,
  selected,
  onClick,
}: {
  slot: 装备槽位ID;
  item: 背包物品 | null;
  selected: boolean;
  onClick: () => void;
}) {
  const qualityColor = item ? getQualityColor(item) : 'rgba(var(--tj-text-secondary), 0.75)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-3 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.16), rgba(var(--tj-accent-primary), 0.04))'
          : item
            ? 'rgba(var(--tj-accent-primary), 0.05)'
            : 'rgba(var(--tj-text-secondary), 0.04)',
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), inset 3px 0 0 rgba(var(--tj-accent-primary), 0.9)'
          : item
            ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)'
            : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center font-serif text-[22px]"
          style={{
            color: qualityColor,
            background: item ? `${qualityColor.replace('0.95', '0.12').replace('0.9', '0.12').replace('0.85', '0.12')}` : 'rgba(var(--tj-text-secondary), 0.05)',
            boxShadow: `inset 0 0 0 1px ${item ? qualityColor : 'rgba(var(--tj-text-secondary), 0.22)'}`,
            clipPath: smallClip,
          }}
        >
          {slotGlyphs[slot]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
              {EQUIP_SLOT_LABELS[slot]}
            </span>
            {item && <QualityBadge item={item} />}
          </div>
          <div
            className="mt-1 truncate font-serif text-[14px] font-semibold"
            style={{ color: item ? 'rgba(245, 235, 210, 0.98)' : 'rgba(170, 160, 135, 0.78)' }}
          >
            {item?.名称 ?? '未装备'}
          </div>
        </div>
      </div>
    </button>
  );
}

function SelectedEquipment({
  slot,
  item,
  onUnequip,
}: {
  slot: 装备槽位ID;
  item: 背包物品 | null;
  onUnequip: () => void;
}) {
  const qualityColor = item ? getQualityColor(item) : 'rgba(var(--tj-text-secondary), 0.72)';
  const effectTags = item?.叙事效果 ?? [];
  const effectEntries = (item?.使用效果 ?? []).filter(
    (effect) => typeof effect?.目标属性 === 'string' && typeof effect?.数值 === 'number',
  );

  return (
    <div
      className="relative overflow-hidden px-5 py-5"
      style={{
        background: item
          ? `radial-gradient(circle at 10% 12%, ${qualityColor.replace('0.95', '0.2').replace('0.9', '0.18').replace('0.85', '0.18')}, transparent 34%), linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.09), rgba(var(--tj-accent-primary), 0.02))`
          : 'linear-gradient(135deg, rgba(var(--tj-text-secondary), 0.08), rgba(var(--tj-text-secondary), 0.025))',
        boxShadow: item
          ? `inset 0 0 0 1px ${qualityColor}`
          : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.2)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-[82px] w-[82px] shrink-0 items-center justify-center font-serif text-[40px]"
          style={{
            color: qualityColor,
            background: item ? 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.82), rgba(var(--tj-surface-strong), 0.72))' : 'rgba(var(--tj-text-secondary), 0.05)',
            boxShadow: `inset 0 0 0 1px ${qualityColor}, 0 0 24px rgba(var(--tj-accent-primary), 0.1)`,
            clipPath: smallClip,
          }}
        >
          {slotGlyphs[slot]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-serif text-[13px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.86)' }}>
              {EQUIP_SLOT_LABELS[slot]}
            </div>
            {item && <QualityBadge item={item} />}
          </div>
          <h3
            className="mt-1 break-words font-serif text-[24px] font-semibold tracking-[0.12em]"
            style={{ color: item ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.86)' }}
          >
            {item?.名称 ?? '空槽位'}
          </h3>
          <p
            className="mt-3 font-serif text-[14px] leading-[1.85] tracking-wider"
            style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}
          >
            {item?.描述 || '该槽位尚无同步记录。'}
          </p>
        </div>
        {item && (
          <button
            type="button"
            onClick={onUnequip}
            className="shrink-0 px-3 py-2 font-serif text-[12px] tracking-[0.2em] transition-all hover:bg-[rgba(220,150,150,0.14)]"
            style={{
              color: 'rgba(245, 190, 190, 0.96)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 150, 150, 0.46)',
              clipPath: smallClip,
            }}
          >
            卸下
          </button>
        )}
      </div>

      {item && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <DetailBlock title="叙事效果">
            {effectTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {effectTags.map((effect) => (
                  <EffectChip key={effect} text={effect} />
                ))}
              </div>
            ) : (
              <MutedText>暂无可调用的叙事效果</MutedText>
            )}
          </DetailBlock>

          <DetailBlock title="来源记录">
            <div className="space-y-1">
              <InfoLine label="来源" value={item.来源 ?? '未记录'} />
              <InfoLine label="时间" value={item.获得时间 ?? `第 ${item.获得回合} 回合`} />
              {item.来源描述 && <InfoLine label="备注" value={item.来源描述} />}
            </div>
          </DetailBlock>

          {effectEntries.length > 0 && (
            <DetailBlock title="使用效果">
              <div className="flex flex-wrap gap-2">
                {effectEntries.map((effect, index) => (
                  <StatChip key={`${effect.目标属性}-${index}`} label={effect.目标属性} value={effect.数值} />
                ))}
              </div>
            </DetailBlock>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
      <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </span>
      <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.35), transparent)' }} />
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="px-4 py-4"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: cardClip,
      }}
    >
      <SectionHeader title={title} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.72), rgba(var(--tj-surface-strong), 0.56))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.86)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {label}
      </div>
      <div className="mt-1 truncate font-serif text-[15px] font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {value}
      </div>
    </div>
  );
}

function QualityBadge({ item }: { item: 背包物品 }) {
  const color = getQualityColor(item);
  return (
    <span
      className="inline-flex px-2 py-0.5 font-serif text-[12px] tracking-[0.16em]"
      style={{
        color,
        background: 'rgba(var(--tj-bubble), 0.72)',
        boxShadow: `inset 0 0 0 1px ${color}`,
        clipPath: smallClip,
      }}
    >
      {item.品质 ?? '蓝'}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 font-serif text-[12px] tracking-[0.14em]"
      style={{
        color: 'rgba(var(--tj-text-primary), 0.96)',
        background: 'rgba(var(--tj-accent-primary), 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
        clipPath: smallClip,
      }}
    >
      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{label}</span>
      <span>+{value}</span>
    </span>
  );
}

function EffectChip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex px-3 py-1 font-serif text-[12px] tracking-[0.14em]"
      style={{
        color: 'rgba(var(--tj-text-primary), 0.96)',
        background: 'rgba(117, 214, 216, 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(117, 214, 216, 0.28)',
        clipPath: smallClip,
      }}
    >
      {text}
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 font-serif text-[13px] leading-relaxed">
      <span className="shrink-0 tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
        {label}
      </span>
      <span className="min-w-0 break-words" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
        {value}
      </span>
    </div>
  );
}

function EmptyNotice({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="px-4 py-5 text-center"
      style={{
        background: 'rgba(var(--tj-text-secondary), 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.2)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[15px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
        {title}
      </div>
      <div className="mt-2 font-serif text-[13px] leading-relaxed tracking-wider" style={{ color: 'rgba(210, 198, 168, 0.82)' }}>
        {text}
      </div>
    </div>
  );
}

function MutedText({ children }: { children: ReactNode }) {
  return (
    <div className="font-serif text-[13px] italic tracking-wider" style={{ color: 'rgba(210, 198, 168, 0.78)' }}>
      {children}
    </div>
  );
}

function MiniEquipBar({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {EQUIP_SLOT_ORDER.map((slot, index) => (
        <div
          key={slot}
          className="h-1.5 flex-1"
          style={{
            background: index < value ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.18)',
            boxShadow: index < value ? '0 0 8px rgba(var(--tj-accent-primary), 0.45)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

function collectNarrativeEffects(items: 背包物品[]): string[] {
  const result = new Set<string>();
  for (const item of items) {
    item.叙事效果?.forEach((effect) => {
      const text = effect.trim();
      if (text) result.add(text);
    });
  }
  return Array.from(result);
}

function getQualityColor(item: 背包物品): string {
  return ITEM_QUALITY_COLORS[item.品质] ?? ITEM_QUALITY_COLORS.蓝;
}
