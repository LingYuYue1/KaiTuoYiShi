// 背包系统面板(v4)。
// 左侧概览 + 分类切换，右侧方格网格 + 详情浮层。
// 所有写入走 utils/inventoryActions 服务层，避免直接戳数组遗漏装备槽同步 / 堆叠合并 等副作用。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 物品分类, 背包物品 } from '@/models/inventory';
import {
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_ORDER,
  ITEM_QUALITY_COLORS,
  是装备类,
} from '@/models/inventory';
import {
  使用物品,
  穿戴物品,
  丢弃物品,
  卸下槽位,
} from '@/utils/inventoryActions';
import { EQUIP_SLOT_LABELS, EQUIP_SLOT_ORDER } from '@/models/equipment';

interface InventoryPanelProps {
  traveler: 角色数据结构;
  onTravelerChange: React.Dispatch<React.SetStateAction<角色数据结构>>;
  turnCount: number;
}

type 标签 = 物品分类 | '全部';

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';
const cellClip =
  'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)';

const USABLE_CATEGORIES: 物品分类[] = ['food', 'consumable'];

const CATEGORY_GLYPHS: Record<物品分类, string> = {
  food: '□',
  consumable: '✚',
  lightcone: '◇',
  weapon: '✦',
  clothing: '▣',
  accessory: '✧',
  memento: '◈',
  key: '◆',
};

const panelStyle = {
  background:
    'radial-gradient(circle at 10% 0%, rgba(117, 214, 216, 0.075), transparent 34%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))',
  boxShadow:
    'inset 0 0 0 1px rgba(var(--tj-border), 0.62), 0 14px 32px rgba(var(--tj-shadow), 0.1)',
  clipPath: cardClip,
};

export function InventoryPanel({ traveler, onTravelerChange, turnCount }: InventoryPanelProps) {
  const inventory = traveler.背包 ?? [];
  const [tab, setTab] = useState<标签>('全部');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const flashTimerRef = useRef<number | null>(null);

  const counts = useMemo(() => {
    const c: Record<物品分类, number> = {
      food: 0,
      consumable: 0,
      lightcone: 0,
      weapon: 0,
      clothing: 0,
      accessory: 0,
      memento: 0,
      key: 0,
    };
    for (const it of inventory) c[it.类别] += 1;
    return c;
  }, [inventory]);

  const equippedCount = useMemo(
    () => inventory.filter((it) => Boolean(it.当前装备部位)).length,
    [inventory],
  );

  const usableCount = useMemo(
    () => inventory.filter((it) => USABLE_CATEGORIES.includes(it.类别)).length,
    [inventory],
  );

  const totalQuantity = useMemo(
    () => inventory.reduce((sum, it) => sum + Math.max(1, it.数量 ?? 1), 0),
    [inventory],
  );

  const visible = useMemo(
    () => (tab === '全部' ? inventory : inventory.filter((it) => it.类别 === tab)),
    [inventory, tab],
  );

  const selectedItem = useMemo(
    () => (selectedId ? inventory.find((it) => it.id === selectedId) ?? null : null),
    [inventory, selectedId],
  );

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedId && !inventory.some((it) => it.id === selectedId)) {
      setSelectedId(null);
    }
  }, [inventory, selectedId]);

  const showFlash = (msg: string) => {
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setFlash(msg);
    flashTimerRef.current = window.setTimeout(() => {
      setFlash('');
      flashTimerRef.current = null;
    }, 2400);
  };

  const handleUse = (itemId: string) => {
    onTravelerChange((prev) => {
      const res = 使用物品(prev, itemId, 1);
      showFlash(res.message);
      return res.ok ? res.traveler : prev;
    });
  };

  const handleEquip = (itemId: string) => {
    onTravelerChange((prev) => {
      const res = 穿戴物品(prev, itemId);
      showFlash(res.message);
      return res.ok ? res.traveler : prev;
    });
  };

  const handleUnequip = (itemId: string) => {
    onTravelerChange((prev) => {
      const item = (prev.背包 ?? []).find((it) => it.id === itemId);
      if (!item?.当前装备部位) {
        showFlash('该物品当前未穿戴');
        return prev;
      }
      const res = 卸下槽位(prev, item.当前装备部位);
      showFlash(res.message);
      return res.ok ? res.traveler : prev;
    });
  };

  const handleDrop = (itemId: string, count?: number) => {
    if (!confirm(count ? `确认丢弃 ${count} 件?` : '确认全部丢弃该物品?')) return;
    let willEmpty = false;
    onTravelerChange((prev) => {
      const cur = (prev.背包 ?? []).find((it) => it.id === itemId);
      if (cur && (count == null || count >= cur.数量)) willEmpty = true;
      const res = 丢弃物品(prev, itemId, count);
      showFlash(res.message);
      return res.ok ? res.traveler : prev;
    });
    if (willEmpty) setSelectedId(null);
  };

  const cellMinCount = 12;
  const cells: (背包物品 | null)[] = [
    ...visible,
    ...Array(Math.max(0, cellMinCount - visible.length)).fill(null),
  ];

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[260px] min-h-0 shrink-0 flex-col gap-3">
        <div className="px-4 py-4" style={panelStyle}>
          <SectionHeader title="背包总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="物品总数" value={`${inventory.length}`} />
            <MetricTile label="总堆叠量" value={`${totalQuantity}`} />
            <MetricTile label="可用道具" value={`${usableCount}`} />
            <MetricTile label="已穿戴" value={`${equippedCount}`} />
          </div>
          <div className="mt-3">
            <MiniBar value={inventory.length} />
          </div>
          <EquipmentDots traveler={traveler} />
        </div>

        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="分类切换" />
          <div className="mt-3 grid gap-2">
            {(['全部', ...ITEM_CATEGORY_ORDER] as 标签[]).map((cat) => {
              const label = cat === '全部' ? '全部' : ITEM_CATEGORY_LABELS[cat];
              const count = cat === '全部' ? inventory.length : counts[cat];
              const active = tab === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setTab(cat);
                    setSelectedId(null);
                  }}
                  className="w-full px-3 py-2.5 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.16), rgba(var(--tj-accent-primary), 0.04))'
                      : 'rgba(var(--tj-text-secondary), 0.04)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), inset 3px 0 0 rgba(var(--tj-accent-primary), 0.9)'
                      : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex min-w-0 items-center gap-2 font-serif text-[13px] tracking-[0.2em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.88)' }}
                    >
                      <span className="shrink-0 text-[12px]" style={{ color: active ? '#75d6d8' : 'rgba(117,214,216,0.68)' }}>
                        {cat === '全部' ? '✦' : CATEGORY_GLYPHS[cat]}
                      </span>
                      <span className="truncate">{label}</span>
                    </span>
                    <span
                      className="font-serif text-[12px]"
                      style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(210, 198, 168, 0.8)' }}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="px-4 py-4" style={panelStyle}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <SectionHeader title="物品陈列" />
                <div
                  className="mt-2 font-serif text-[14px] tracking-[0.18em]"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}
                >
                  {tab === '全部' ? '全部物品' : ITEM_CATEGORY_LABELS[tab]} · 共 {visible.length} 件
                </div>
              </div>
              <div
                className="font-serif text-[12px] tracking-[0.16em]"
                style={{ color: 'rgba(200, 188, 160, 0.78)' }}
              >
                第 {turnCount} 回合
              </div>
            </div>

            {flash && (
              <div
                className="mt-3 px-3 py-2 font-serif text-[12px] tracking-[0.14em]"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.95)',
                  background: 'rgba(var(--tj-accent-primary), 0.06)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
                  clipPath: smallClip,
                }}
              >
                {flash}
              </div>
            )}
          </div>

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_330px]">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(4.75rem, 1fr))' }}
              >
                {cells.map((item, i) =>
                  item ? (
                    <ItemCell
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onClick={() => setSelectedId(item.id)}
                    />
                  ) : (
                    <EmptyCell key={`empty-${i}`} />
                  ),
                )}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="sticky top-0">
                <ItemDetailOverlay
                  item={selectedItem}
                  onClose={() => setSelectedId(null)}
                  onUse={() => selectedItem && handleUse(selectedItem.id)}
                  onEquip={() => selectedItem && handleEquip(selectedItem.id)}
                  onUnequip={() => selectedItem && handleUnequip(selectedItem.id)}
                  onDropOne={() => selectedItem && handleDrop(selectedItem.id, 1)}
                  onDropAll={() => selectedItem && handleDrop(selectedItem.id)}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ItemCell({
  item,
  selected,
  onClick,
}: {
  item: 背包物品;
  selected: boolean;
  onClick: () => void;
}) {
  const equipped = Boolean(item.当前装备部位);
  const qualityColor = ITEM_QUALITY_COLORS[item.品质] ?? ITEM_QUALITY_COLORS.蓝;
  const qualityStroke = qualityColor.replace(/0\.\d+\)/, '0.52)');

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.名称}
      className="group relative aspect-square w-full transition-all hover:brightness-110"
      style={{
        background: selected
          ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.05))'
          : 'rgba(20, 16, 22, 0.62)',
        boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? 'rgba(var(--tj-accent-primary), 0.9)' : qualityStroke}`,
        clipPath: cellClip,
      }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at 50% 36%, ${qualityColor.replace(/0\.\d+\)/, '0.22)')}, transparent 58%)`,
        }}
      />

      <div className="absolute left-0 top-0 h-1.5 w-full" style={{ background: qualityColor }} />

      <div
        className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center font-serif text-[12px]"
        style={{
          color: equipped ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-tech-cyan-deep),0.9)',
          background: 'rgba(var(--tj-ui-panel-strong), 0.5)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
          clipPath: smallClip,
        }}
      >
        {CATEGORY_GLYPHS[item.类别]}
      </div>

      <div className="absolute inset-0 flex items-center justify-center pb-2.5">
        <span
          className="font-serif text-[22px] font-semibold leading-none drop-shadow-sm"
          style={{ color: qualityColor }}
        >
          {item.名称.slice(0, 1)}
        </span>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center font-serif text-[12px] leading-tight tracking-wide"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.95)',
          background: 'linear-gradient(180deg, transparent, rgba(var(--tj-surface-strong),0.88))',
        }}
      >
        {item.名称}
      </div>

      {item.数量 > 1 && (
        <div
          className="absolute right-0.5 top-0.5 px-1 font-serif text-[12px] font-semibold leading-none tracking-wider"
          style={{
            color: 'rgb(var(--tj-text-primary))',
            background: 'rgba(var(--tj-bubble), 0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
            paddingTop: 2,
            paddingBottom: 2,
          }}
        >
          ×{item.数量}
        </div>
      )}

      {equipped && (
        <div
          className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full"
          style={{
            background: 'rgba(var(--tj-accent-primary), 0.98)',
            boxShadow: '0 0 6px rgba(var(--tj-accent-primary), 0.7)',
          }}
          title={`已穿戴·${EQUIP_SLOT_LABELS[item.当前装备部位!]}`}
        />
      )}
    </button>
  );
}

function EmptyCell() {
  return (
    <div
      className="aspect-square w-full"
      style={{
        background: 'rgba(var(--tj-surface-strong), 0.46)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.24)',
        clipPath: cellClip,
      }}
    />
  );
}

function ItemDetailOverlay({
  item,
  onClose,
  onUse,
  onEquip,
  onUnequip,
  onDropOne,
  onDropAll,
}: {
  item: 背包物品 | null;
  onClose: () => void;
  onUse: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  onDropOne: () => void;
  onDropAll: () => void;
}) {
  if (!item) {
    return (
      <div
        className="px-4 py-5"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: cardClip,
        }}
      >
        <SectionHeader title="物品详情" />
        <EmptyNotice title="未选择物品" text="点击左侧方格中的任意物品，右侧会显示更完整的详情。" />
      </div>
    );
  }

  const usable = USABLE_CATEGORIES.includes(item.类别);
  const equippable = 是装备类(item);
  const equipped = Boolean(item.当前装备部位);
  const qualityColor = ITEM_QUALITY_COLORS[item.品质] ?? ITEM_QUALITY_COLORS.蓝;
  const effectEntries = item.叙事效果 ?? [];
  const effects = Array.isArray(item.使用效果)
    ? item.使用效果.filter(
        (e) =>
          e &&
          typeof e === 'object' &&
          typeof e.目标属性 === 'string' &&
          typeof e.数值 === 'number',
      )
    : [];

  return (
    <div
      className="relative overflow-hidden px-4 py-4"
      style={{
        background: `radial-gradient(circle at 12% 0%, ${qualityColor.replace(/0\.\d+\)/, '0.16)')}, transparent 38%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.98), rgba(var(--tj-surface-strong), 0.94))`,
        boxShadow: `inset 0 0 0 1px ${qualityColor}, 0 14px 32px rgba(var(--tj-shadow), 0.08)`,
        clipPath: cardClip,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div
            className="flex h-[68px] w-[68px] shrink-0 items-center justify-center font-serif text-[30px]"
            style={{
              color: qualityColor,
              background: 'rgba(var(--tj-bg-primary), 0.56)',
              boxShadow: `inset 0 0 0 1px ${qualityColor}, 0 0 20px rgba(var(--tj-accent-primary), 0.08)`,
              clipPath: smallClip,
            }}
          >
            {CATEGORY_GLYPHS[item.类别]}
          </div>
          <div className="min-w-0">
          <SectionHeader title="物品详情" />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetaChip text={`${item.品质}品`} color={qualityColor} />
            <MetaChip text={`×${item.数量}`} color="rgba(245,235,210,0.92)" />
            <MetaChip text={ITEM_CATEGORY_LABELS[item.类别]} color="rgba(117,214,216,0.9)" />
          </div>
          <h3
            className="mt-2 break-words font-serif text-[24px] font-semibold tracking-[0.12em]"
            style={{ color: qualityColor }}
          >
            {item.名称}
          </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-serif text-[14px] tracking-wider px-2 py-1 transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
          style={{
            color: 'rgba(200, 188, 160, 0.85)',
            boxShadow: 'inset 0 0 0 1px rgba(200, 188, 160, 0.22)',
            clipPath: smallClip,
          }}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {equipped && (
        <div
          className="mt-3 inline-block px-2 py-0.5 font-serif text-[12px] tracking-[0.15em]"
          style={{
            color: 'rgb(var(--tj-text-primary))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)',
            clipPath: smallClip,
          }}
        >
          已穿戴 · {EQUIP_SLOT_LABELS[item.当前装备部位!]}
        </div>
      )}

      {item.描述 && (
        <p
          className="mt-3 font-serif text-[13px] leading-relaxed"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.95)' }}
        >
          {item.描述}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {effectEntries.length > 0 && (
          <DetailBlock title="叙事效果">
            <div className="flex flex-wrap gap-2">
              {effectEntries.map((effect) => (
                <EffectChip key={effect} text={effect} />
              ))}
            </div>
          </DetailBlock>
        )}

        {effects.length > 0 && (
          <DetailBlock title="使用效果">
            <div className="flex flex-wrap gap-2">
              {effects.map((eff, i) => (
                <StatChip key={`${eff.目标属性}-${i}`} label={eff.目标属性} value={eff.数值} />
              ))}
            </div>
          </DetailBlock>
        )}

        <DetailBlock title="来源记录">
          <div className="space-y-1">
            <InfoLine label="来源" value={item.来源 ?? '未记录'} />
            <InfoLine label="时间" value={item.获得时间 ?? `第 ${item.获得回合} 回合`} />
            {item.来源描述 && <InfoLine label="备注" value={item.来源描述} />}
          </div>
        </DetailBlock>

        {item.装备槽位 && (
          <DetailBlock title="装备槽位">
            <InfoLine label="适配" value={EQUIP_SLOT_LABELS[item.装备槽位]} />
          </DetailBlock>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {usable && <ActionButton onClick={onUse} tone="gold">使用</ActionButton>}
        {equippable && !equipped && <ActionButton onClick={onEquip} tone="gold">穿戴</ActionButton>}
        {equippable && equipped && <ActionButton onClick={onUnequip} tone="gold">卸下</ActionButton>}
        {item.数量 > 1 && <ActionButton onClick={onDropOne} tone="red">丢弃 1</ActionButton>}
        <ActionButton onClick={onDropAll} tone="red">
          {item.数量 > 1 ? `全部丢弃 ×${item.数量}` : '丢弃'}
        </ActionButton>
      </div>
    </div>
  );
}

function EquipmentDots({ traveler }: { traveler: 角色数据结构 }) {
  const slots = traveler.装备 ?? {};
  const inventory = traveler.背包 ?? [];
  return (
    <div className="mt-3">
      <div className="mb-2 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
        装备同步
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {EQUIP_SLOT_ORDER.map((slot) => {
          const item = inventory.find((it) => it.id === slots[slot]);
          const color = item ? (ITEM_QUALITY_COLORS[item.品质] ?? ITEM_QUALITY_COLORS.蓝) : 'rgba(var(--tj-text-secondary),0.28)';
          return (
            <div
              key={slot}
              title={`${EQUIP_SLOT_LABELS[slot]}${item ? ` · ${item.名称}` : ' · 空'}`}
              className="h-2.5"
              style={{
                background: color,
                boxShadow: item ? `0 0 8px ${color}` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function MetaChip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="inline-flex px-2 py-0.5 font-serif text-[12px] tracking-[0.14em]"
      style={{
        color,
        background: 'rgba(var(--tj-bubble), 0.78)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      {text}
    </span>
  );
}

function ActionButton({
  onClick,
  tone,
  children,
}: {
  onClick: () => void;
  tone: 'gold' | 'red';
  children: React.ReactNode;
}) {
  const palette =
    tone === 'gold'
      ? { color: 'rgb(var(--tj-text-primary))', stroke: 'rgba(var(--tj-accent-primary), 0.45)' }
      : { color: 'rgba(230, 170, 170, 0.95)', stroke: 'rgba(220, 150, 150, 0.45)' };

  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[12px] tracking-[0.2em] px-3 py-1 transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
      style={{
        color: palette.color,
        boxShadow: `inset 0 0 0 1px ${palette.stroke}`,
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
      <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </span>
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.35), transparent)' }}
      />
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.78), rgba(var(--tj-surface-strong), 0.58))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
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

function MiniBar({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-1.5 flex-1"
          style={{
            background: index < Math.min(8, Math.max(0, value)) ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.18)',
            boxShadow: index < Math.min(8, Math.max(0, value)) ? '0 0 8px rgba(var(--tj-accent-primary), 0.45)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 font-serif text-[12px] tracking-[0.14em]"
      style={{
        color: 'rgba(245, 235, 210, 0.96)',
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
        color: 'rgba(245, 235, 210, 0.96)',
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
      <span className="min-w-0 break-words" style={{ color: 'rgba(245, 235, 210, 0.95)' }}>
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
