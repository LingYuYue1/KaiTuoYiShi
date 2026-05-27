import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { NPC记录, NPC阶位, NPC_NSFW年龄确认 } from '@/models/npc';
import { NPC_RELATION_LABELS, 归一化NPC记录列表, 提取NPC同行记忆文本列表, 读取NPC头像 } from '@/models/npc';

interface CompanionPanelProps {
  npcRecords: NPC记录[];
  onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  turnCount: number;
  nsfwEnabled: boolean;
}

type DetailTab = 'archive' | 'memory' | 'nsfw';

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const panelStyle: CSSProperties = {
  background: 'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan), 0.12), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface), 0.74), rgba(var(--tj-bg-primary), 0.92))',
  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.36)',
  clipPath: cardClip,
};
const titleColor = 'rgb(var(--tj-ui-title))';
const bodyColor = 'rgba(var(--tj-ui-body), 0.95)';
const mutedColor = 'rgba(var(--tj-ui-muted), 0.82)';
const faintColor = 'rgba(var(--tj-ui-faint), 0.74)';
const accentColor = 'rgb(var(--tj-accent-primary))';
const activeTextColor = 'rgb(var(--tj-ui-active-text))';
const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
const activeSurface = 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.16), rgba(var(--tj-tech-cyan), 0.055))';
const quietSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel), 0.62), rgba(var(--tj-ui-panel-strong), 0.72))';

export function CompanionPanel({ npcRecords, onNpcRecordsChange, nsfwEnabled }: CompanionPanelProps) {
  const [tab, setTab] = useState<NPC阶位>('companion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedRecords = useMemo(() => 归一化NPC记录列表(npcRecords), [npcRecords]);

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

  useEffect(() => {
    if (selectedId && visible.some((n) => n.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [selectedId, visible]);

  const selected = visible.find((n) => n.id === selectedId) ?? null;

  const updateRecord = (id: string, patch: Partial<NPC记录>) => {
    onNpcRecordsChange((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const promoteToCompanion = (id: string) => updateRecord(id, { 阶位: 'companion' });
  const demoteToExtra = (id: string) => updateRecord(id, { 阶位: 'extra', 同行: false });
  const deleteRecord = (id: string) => {
    if (!confirm('确认删除这份 NPC 档案？此操作不可撤销。')) return;
    onNpcRecordsChange((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[260px] min-h-0 shrink-0 flex-col gap-3">
        <div className="px-3 py-3" style={panelStyle}>
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

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {visible.length ? (
            visible.map((npc) => (
              <NpcListItem
                key={npc.id}
                npc={npc}
                selected={npc.id === selectedId}
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

      <main className="min-w-0 min-h-0 flex-1 overflow-y-auto pr-1">
        {selected ? (
          <NpcDetail
            npc={selected}
            nsfwEnabled={nsfwEnabled}
            onPromote={() => promoteToCompanion(selected.id)}
            onDemote={() => demoteToExtra(selected.id)}
            onDelete={() => deleteRecord(selected.id)}
            onToggleTraveling={() => updateRecord(selected.id, { 同行: !selected.同行 })}
          />
        ) : (
          <NoSelection tab={tab} />
        )}
      </main>
    </div>
  );
}

function sortNpcRecords(records: NPC记录[]) {
  return [...records].sort((a, b) => {
    const weight = (n: NPC记录) => (n.同行 ? 0 : n.原著角色 ? 1 : 2);
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    return (b.好感度 ?? 0) - (a.好感度 ?? 0);
  });
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 whitespace-nowrap px-2.5 py-2 font-serif text-[12px] tracking-[0.18em] transition-all"
      style={{
        color: active ? titleColor : faintColor,
        background: active
          ? activeSurface
          : 'rgba(var(--tj-accent-primary), 0.035)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.56), 0 8px 18px rgba(var(--tj-shadow), 0.08)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function NpcListItem({
  npc,
  selected,
  onClick,
}: {
  npc: NPC记录;
  selected: boolean;
  onClick: () => void;
}) {
  const relation = NPC_RELATION_LABELS[npc.关系] ?? npc.关系;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-all hover:bg-[rgba(245,217,122,0.07)]"
      style={{
        background: selected
          ? activeSurface
          : quietSurface,
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.56), inset 3px 0 0 rgba(var(--tj-accent-primary), 0.82)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
        clipPath: smallClip,
      }}
    >
      <Avatar npc={npc} size={46} selected={selected} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-serif text-[14px] font-semibold tracking-[0.08em]"
            style={{ color: selected ? titleColor : bodyColor }}
          >
            {npc.姓名}
          </span>
          {npc.同行 && <PresenceDot />}
        </div>
        <div
          className="mt-0.5 truncate font-serif text-[12px] tracking-[0.1em]"
          style={{ color: mutedColor }}
        >
          {relation}
          {npc.原著角色 ? ' / 原著' : ''}
        </div>
        <AffinityMeter value={npc.好感度} compact />
      </div>
    </button>
  );
}

function Avatar({
  npc,
  size,
  selected = false,
  slot = '档案',
}: {
  npc: NPC记录;
  size: number;
  selected?: boolean;
  slot?: '档案' | '正文' | '手机';
}) {
  const src = 读取NPC头像(npc, slot);
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(145deg, rgba(var(--tj-accent-primary), 0.14), rgba(var(--tj-tech-cyan), 0.055))',
    boxShadow: selected
      ? '0 0 0 1px rgba(var(--tj-accent-primary), 0.72), 0 0 18px rgba(var(--tj-accent-primary), 0.16)'
      : '0 0 0 1px rgba(var(--tj-border), 0.72)',
  };

  if (src) {
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <img
          src={src}
          alt={npc.姓名}
          className="h-full w-full object-cover"
          style={style}
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: 'inset 0 0 12px rgba(255, 244, 212, 0.12)' }}
        />
      </span>
    );
  }

  return (
    <div
      className="relative shrink-0 flex items-center justify-center overflow-hidden font-serif font-semibold"
      style={{
        ...style,
        fontSize: Math.max(16, Math.floor(size * 0.42)),
        color: selected ? titleColor : accentColor,
      }}
    >
      <span
        className="absolute inset-[6px] rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)' }}
      />
      {npc.姓名.slice(0, 1)}
    </div>
  );
}

function PresenceDot() {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{
        background: 'rgb(128, 224, 166)',
        boxShadow: '0 0 8px rgba(128, 224, 166, 0.7)',
      }}
    />
  );
}

function NpcDetail({
  npc,
  onPromote,
  onDemote,
  onDelete,
  onToggleTraveling,
  nsfwEnabled,
}: {
  npc: NPC记录;
  onPromote: () => void;
  onDemote: () => void;
  onDelete: () => void;
  onToggleTraveling: () => void;
  nsfwEnabled: boolean;
}) {
  const isCompanion = npc.阶位 === 'companion';
  const [detailTab, setDetailTab] = useState<DetailTab>('archive');

  useEffect(() => {
    if (!nsfwEnabled && detailTab === 'nsfw') setDetailTab('archive');
  }, [detailTab, nsfwEnabled]);

  return (
    <div className="flex min-h-full flex-col gap-4">
      <section className="px-5 py-4" style={panelStyle}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="relative shrink-0">
            <Avatar npc={npc} size={88} selected />
            {npc.同行 && (
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 font-serif text-[11px] tracking-[0.18em]"
                style={{
                  color: 'rgba(185, 245, 204, 0.96)',
                  background: 'rgba(14, 26, 18, 0.92)',
                  boxShadow: 'inset 0 0 0 1px rgba(128, 224, 166, 0.48)',
                  clipPath: smallClip,
                }}
              >
                在场
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="truncate font-serif text-[24px] font-semibold tracking-[0.18em]"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--tj-ui-title)) 0%, rgb(var(--tj-accent-primary)) 58%, rgb(var(--tj-accent-secondary)) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {npc.姓名}
              </h3>
              {npc.别名 && <span className="font-serif text-[13px] italic text-[#d8ccb0]">({npc.别名})</span>}
              {npc.原著角色 && <Chip tone="gold">原著角色</Chip>}
              {nsfwEnabled && npc.NSFW档案?.enabled && <Chip tone="silver">NSFW 预留</Chip>}
              {npc.图像档案?.状态 && <Chip tone="silver">{npc.图像档案.状态 === 'pending' ? '图像生成中' : '图像档案'}</Chip>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <InfoPill label="性别" value={npc.性别 || '未知'} />
              <InfoPill label="关系" value={NPC_RELATION_LABELS[npc.关系] ?? npc.关系} />
              <InfoPill label="最近" value={`第 ${npc.最近回合} 回合`} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {isCompanion && (
                <ActionChip active={npc.同行} onClick={onToggleTraveling}>
                  {npc.同行 ? '当前在场' : '设为在场'}
                </ActionChip>
              )}
              {isCompanion ? (
                npc.原著角色 ? (
                  <Chip tone="gold">常驻伙伴</Chip>
                ) : (
                  <ActionChip active onClick={onDemote}>
                    重要伙伴
                  </ActionChip>
                )
              ) : (
                <ActionChip active={false} onClick={onPromote}>
                  标为伙伴
                </ActionChip>
              )}
              <span
                className="font-serif text-[12px] tracking-[0.12em] px-2 py-1"
                style={{ color: faintColor }}
              >
                初见第 {npc.初见回合} 回合
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 xl:w-[278px] xl:items-stretch">
            <div className="flex justify-end">
              <AffinityBadge value={npc.好感度} />
            </div>
            <div className="flex gap-2">
              <TabButton active={detailTab === 'archive'} onClick={() => setDetailTab('archive')}>
                伙伴档案
              </TabButton>
              <TabButton active={detailTab === 'memory'} onClick={() => setDetailTab('memory')}>
                同行记忆
              </TabButton>
              {nsfwEnabled && (
                <TabButton active={detailTab === 'nsfw'} onClick={() => setDetailTab('nsfw')}>
                  NSFW档案
                </TabButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {detailTab === 'archive' && (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <DetailBlock title="人物介绍">
              <Paragraph text={npc.介绍 || npc.性格} placeholder="尚无人物介绍" />
            </DetailBlock>
            <DetailBlock title="对你的称呼">
              <Paragraph text={npc.对玩家称呼} placeholder="尚未形成固定称呼" italic />
            </DetailBlock>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <DetailBlock title="外貌">
              <Paragraph text={npc.外貌} placeholder="尚无外貌记录" />
            </DetailBlock>
            <DetailBlock title="穿着">
              <Paragraph text={npc.穿着} placeholder="尚无穿着记录" />
            </DetailBlock>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <DetailBlock title="说话方式">
              <Paragraph text={npc.说话方式} placeholder="尚无说话方式记录" />
            </DetailBlock>
            <DetailBlock title="性格">
              <Paragraph text={npc.性格} placeholder="尚无性格记录" />
            </DetailBlock>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <DetailBlock title="装备面板">
              <Paragraph text={npc.装备摘要} placeholder="尚未记录其装备与随身物" italic />
            </DetailBlock>
            <VisualArchivePanel npc={npc} />
          </section>
        </>
      )}

      {detailTab === 'memory' && <MemoryPanel npc={npc} />}

      {nsfwEnabled && detailTab === 'nsfw' && <NSFWArchivePanel npc={npc} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-1.5 font-serif text-[12px] tracking-[0.18em] transition-all hover:bg-[rgba(220,80,80,0.08)]"
          style={{
            color: 'rgba(238, 142, 142, 0.88)',
            boxShadow: 'inset 0 0 0 1px rgba(238, 142, 142, 0.36)',
            clipPath: smallClip,
          }}
        >
          删除档案
        </button>
      </div>
    </div>
  );
}

function VisualArchivePanel({ npc }: { npc: NPC记录 }) {
  return (
    <DetailBlock title="视觉档案预留">
      <div className="grid gap-3 sm:grid-cols-3">
        <AvatarSlotCard npc={npc} slot="档案" label="档案头像" description="伙伴面板" />
        <AvatarSlotCard npc={npc} slot="正文" label="正文头像" description="剧情气泡" />
        <AvatarSlotCard npc={npc} slot="手机" label="小手机头像" description="短讯名片" />
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <InfoPill label="图像状态" value={npc.图像档案?.状态 ?? 'none'} />
        <InfoPill label="图像来源" value={npc.图像档案?.来源 ?? (读取NPC头像(npc) ? '手动 / 原著' : '未设定')} />
      </div>
      <div className="mt-3 space-y-1">
        <Paragraph text={npc.图像档案?.头像提示词} placeholder="未记录头像提示词" italic />
        <Paragraph text={npc.图像档案?.立绘提示词} placeholder="未记录立绘提示词" italic />
      </div>
    </DetailBlock>
  );
}

function AvatarSlotCard({
  npc,
  slot,
  label,
  description,
}: {
  npc: NPC记录;
  slot: '档案' | '正文' | '手机';
  label: string;
  description: string;
}) {
  const src = 读取NPC头像(npc, slot);
  return (
    <div
      className="flex min-w-0 items-center gap-3 px-3 py-3"
      style={{
        background: src ? 'rgba(var(--tj-accent-primary), 0.075)' : quietSurface,
        boxShadow: src
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
        clipPath: smallClip,
      }}
    >
      <Avatar npc={npc} size={42} slot={slot} selected={Boolean(src)} />
      <div className="min-w-0">
        <div className="truncate font-serif text-[12px] font-semibold tracking-[0.16em]" style={{ color: titleColor }}>
          {label}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] tracking-[0.12em]" style={{ color: faintColor }}>
          {src ? description : `${description} · 待生成`}
        </div>
      </div>
    </div>
  );
}

function NSFWArchivePanel({ npc }: { npc: NPC记录 }) {
  const archive = npc.NSFW档案;
  const tags = archive?.标签 ?? [];
  const femaleBodyArchive = archive?.女性身体档案;
  const maleBodyArchive = archive?.男性身体档案;
  const bodyPane = npc.性别 === '男' ? 'male' : 'female';
  return (
    <DetailBlock title="NSFW档案">
      <div
        className="px-4 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.13), rgba(var(--tj-ui-panel), 0.72))',
          boxShadow: 'inset 0 0 0 1px rgba(214, 142, 174, 0.22)',
          clipPath: smallClip,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-[13px] font-semibold tracking-[0.22em]" style={{ color: titleColor }}>
              独立档案接口
            </div>
            <div className="mt-1 text-[11px] tracking-[0.12em]" style={{ color: faintColor }}>
              后续 NSFW 模式读取，普通剧情默认不调用
            </div>
          </div>
          <Chip tone={archive?.enabled ? 'gold' : 'silver'}>
            {archive?.enabled ? '已启用' : '预留'}
          </Chip>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <InfoPill label="年龄确认" value={formatNsfwAge(archive?.年龄确认)} />
          <InfoPill label="亲密阶段" value={archive?.亲密阶段 ?? '未记录'} />
          <InfoPill label="边界" value={archive?.边界 ?? '未记录'} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TagGroup title="偏好" items={archive?.偏好 ?? []} empty="暂无偏好记录" />
          <TagGroup title="敏感点" items={archive?.敏感点 ?? []} empty="暂无敏感点记录" />
          <TagGroup title="禁忌" items={archive?.禁忌 ?? []} empty="暂无禁忌记录" />
        </div>

        <div className="mt-4">
          {bodyPane === 'female' ? (
            <BodyArchiveSection title="女性身体档案">
              <ArchiveField title="胸部" text={femaleBodyArchive?.胸部} />
              <ArchiveField title="女性私处" text={femaleBodyArchive?.女性私处} />
              <ArchiveField title="后庭" text={femaleBodyArchive?.后庭} />
              <ArchiveField title="体态" text={femaleBodyArchive?.体态} />
              <ArchiveField title="体味" text={femaleBodyArchive?.体味} />
            </BodyArchiveSection>
          ) : (
            <BodyArchiveSection title="男性身体档案">
              <ArchiveField title="男性器" text={maleBodyArchive?.男性器} />
              <ArchiveField title="后庭" text={maleBodyArchive?.后庭} />
              <ArchiveField title="体态" text={maleBodyArchive?.体态} />
              <ArchiveField title="体味" text={maleBodyArchive?.体味} />
            </BodyArchiveSection>
          )}
        </div>

        {archive?.部位图片 && (
          <div className="mt-4">
            <BodyArchiveSection title="NSFW 部位图片">
              <PartImageSlot title="女性胸部" src={archive.部位图片.女性胸部} />
              <PartImageSlot title="女性私处" src={archive.部位图片.女性私处} />
              <PartImageSlot title="男性器" src={archive.部位图片.男性器} />
              <PartImageSlot title="后庭" src={archive.部位图片.后庭} />
              <PartImageSlot title="体态参考" src={archive.部位图片.体态参考} />
            </BodyArchiveSection>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ListBlock title="经历" items={archive?.经历 ?? []} empty="暂无亲密经历记录" />
          <ListBlock title="长期事实" items={archive?.长期事实 ?? []} empty="暂无长期事实记录" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {tags.length ? (
            tags.map((tag) => <Chip key={tag} tone="silver">{tag}</Chip>)
          ) : (
            <span className="font-serif text-[12px] italic tracking-[0.12em]" style={{ color: faintColor }}>
              暂无标签，等待后续模式写入
            </span>
          )}
        </div>

        <div className="mt-3">
          <Paragraph text={archive?.备注} placeholder="暂无 NSFW 备注" italic />
        </div>
      </div>
    </DetailBlock>
  );
}

function PartImageSlot({ title, src }: { title: string; src?: string }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: src ? 'rgba(var(--tj-ui-nsfw), 0.075)' : 'rgba(var(--tj-ui-nsfw), 0.035)',
        boxShadow: src ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.28)' : 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="aspect-[4/3]" style={{ background: 'rgba(var(--tj-ui-panel-strong), 0.58)' }}>
        {src ? <img src={src} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[11px]" style={{ color: 'rgba(220, 180, 200, 0.56)' }}>待挂载</div>}
      </div>
      <div className="px-2 py-1.5 text-[11px]" style={{ color: nsfwColor }}>{title}</div>
    </div>
  );
}

function BodyArchiveSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-serif text-[12px] tracking-[0.24em]" style={{ color: accentColor }}>
        {title}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function formatNsfwAge(age: NPC_NSFW年龄确认 | undefined): string {
  if (age === 'adult') return '成人';
  if (age === 'minor_blocked') return '禁止写入';
  return '未确认';
}

function TagGroup({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0 px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.68)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.18)', clipPath: smallClip }}>
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => <Chip key={item} tone="silver">{item}</Chip>)}
        </div>
      ) : (
        <EmptyText text={empty} />
      )}
    </div>
  );
}

function ArchiveField({ title, text }: { title: string; text?: string }) {
  return (
    <div className="min-w-0 px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.66)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.16)', clipPath: smallClip }}>
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {title}
      </div>
      <Paragraph text={text} placeholder="未记录" />
    </div>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0 px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.66)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.16)', clipPath: smallClip }}>
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {title}
      </div>
      {items.length ? (
        <ul className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="font-serif text-[13px] leading-relaxed tracking-[0.06em]" style={{ color: bodyColor }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyText text={empty} />
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
        clipPath: smallClip,
      }}
    >
      <div
        className="font-serif text-[11px] tracking-[0.24em]"
        style={{ color: 'rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.86)' }}
      >
        {label}
      </div>
      <div className="mt-1 truncate font-serif text-[13px] tracking-[0.08em]" style={{ color: titleColor }}>
        {value}
      </div>
    </div>
  );
}

function ActionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 font-serif text-[12px] tracking-[0.16em] transition-all hover:bg-[rgba(245,217,122,0.08)]"
      style={{
        color: active ? accentColor : faintColor,
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.52)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function AffinityBadge({ value }: { value: number }) {
  const tone = getAffinityTone(value);
  return (
    <div
      className="flex w-[92px] shrink-0 flex-col items-center justify-center px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: `inset 0 0 0 1px ${tone.stroke}`,
        clipPath: cardClip,
      }}
    >
      <div className="font-serif text-[34px] leading-none" style={{ color: tone.color }}>
        ♥
      </div>
      <div className="mt-1 font-mono text-[17px] font-semibold" style={{ color: tone.color }}>
        {value > 0 ? '+' : ''}
        {value}
      </div>
      <div className="mt-1 font-serif text-[11px] tracking-[0.22em]" style={{ color: mutedColor }}>
        好感度
      </div>
    </div>
  );
}

function AffinityMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = getAffinityTone(value);
  const percent = Math.max(0, Math.min(100, (value + 100) / 2));
  return (
    <div className={compact ? 'mt-1.5 flex items-center gap-2' : 'mt-2 flex items-center gap-2'}>
      <span className="font-serif text-[12px]" style={{ color: tone.color }}>
        ♥
      </span>
      <div
        className="relative h-1.5 flex-1 overflow-hidden"
        style={{
          background: 'rgba(var(--tj-surface-strong),0.72)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
        }}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${percent}%`,
            background: tone.fill,
          }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[11px]" style={{ color: mutedColor }}>
        {value > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  );
}

function getAffinityTone(value: number) {
  if (value >= 60) {
    return {
      color: 'rgba(255, 132, 170, 0.98)',
      stroke: 'rgba(255, 132, 170, 0.45)',
      fill: 'linear-gradient(90deg, rgba(245, 120, 160, 0.62), rgba(255, 185, 205, 0.96))',
    };
  }
  if (value >= 30) {
    return {
      color: 'rgba(235, 160, 178, 0.96)',
      stroke: 'rgba(235, 160, 178, 0.38)',
      fill: 'linear-gradient(90deg, rgba(220, 120, 150, 0.5), rgba(235, 160, 178, 0.9))',
    };
  }
  if (value >= 0) {
    return {
      color: 'rgba(222, 207, 205, 0.9)',
      stroke: 'rgba(var(--tj-border), 0.42)',
      fill: 'linear-gradient(90deg, rgba(160, 150, 150, 0.4), rgba(222, 207, 205, 0.78))',
    };
  }
  return {
    color: 'rgba(150, 160, 186, 0.86)',
    stroke: 'rgba(130, 145, 175, 0.34)',
    fill: 'linear-gradient(90deg, rgba(75, 85, 110, 0.75), rgba(130, 145, 175, 0.62))',
  };
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-4" style={panelStyle}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-3 w-[3px]" style={{ background: 'rgba(var(--tj-accent-primary), 0.82)' }} />
      <h4 className="font-serif text-[13px] tracking-[0.26em]" style={{ color: accentColor }}>
        {children}
      </h4>
      <span className="h-px flex-1" style={{ background: 'rgba(var(--tj-border), 0.46)' }} />
    </div>
  );
}

function Paragraph({ text, placeholder, italic = false }: { text?: string; placeholder: string; italic?: boolean }) {
  if (!text?.trim()) return <EmptyText text={placeholder} />;
  return (
    <p
      className={`font-serif text-[13.5px] leading-relaxed tracking-[0.06em] ${italic ? 'italic' : ''}`}
      style={{ color: bodyColor }}
    >
      {text}
    </p>
  );
}

function MemoryPanel({ npc }: { npc: NPC记录 }) {
  const memories = 提取NPC同行记忆文本列表(npc);
  return (
      <DetailBlock title="与你同行的记忆">
      {memories.length ? (
        <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {memories.map((memory, index) => (
            <li
              key={`${index}-${memory}`}
              className="px-3 py-2 font-serif text-[13px] leading-relaxed tracking-[0.06em]"
              style={{
                color: bodyColor,
                background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
                boxShadow: 'inset 2px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.62), inset 0 0 0 1px rgba(var(--tj-border), 0.56)',
                clipPath: smallClip,
              }}
            >
              {memory}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyText text="尚未记录共同经历的关键时刻" />
      )}
    </DetailBlock>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="font-serif text-[12.5px] italic tracking-[0.12em]" style={{ color: faintColor }}>
      {text}
    </p>
  );
}

function Chip({ tone, children }: { tone: 'gold' | 'silver'; children: ReactNode }) {
  const palette =
    tone === 'gold'
      ? { color: 'rgba(var(--tj-accent-primary), 0.94)', stroke: 'rgba(var(--tj-accent-primary), 0.45)' }
      : { color: mutedColor, stroke: 'rgba(var(--tj-border), 0.54)' };
  return (
    <span
      className="px-2 py-0.5 font-serif text-[12px] tracking-[0.18em]"
      style={{ color: palette.color, boxShadow: `inset 0 0 0 1px ${palette.stroke}`, clipPath: smallClip }}
    >
      {children}
    </span>
  );
}

function EmptyRoster({ tab }: { tab: NPC阶位 }) {
  return (
    <div className="px-4 py-8 text-center" style={panelStyle}>
      <div className="font-serif text-[20px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>
        ✦
      </div>
      <div className="mt-2 font-serif text-[13px] tracking-[0.18em]" style={{ color: faintColor }}>
        {tab === 'companion' ? '尚未结识伙伴' : '尚无路人档案'}
      </div>
    </div>
  );
}

function NoSelection({ tab }: { tab: NPC阶位 }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center" style={panelStyle}>
      <div>
        <div className="font-serif text-[28px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.42)' }}>
          ✦
        </div>
        <div className="mt-3 font-serif text-[14px] tracking-[0.22em]" style={{ color: faintColor }}>
          从左侧选择一位{tab === 'companion' ? '伙伴' : '路人'}
        </div>
      </div>
    </div>
  );
}
