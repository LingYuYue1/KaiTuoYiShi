import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { NPC记录, NPC阶位, NPC_NSFW年龄确认, 约定结构, 约定状态 } from '@/models/npc';
import { NPC_AFFINITY_MAX, NPC_AFFINITY_MIN, buildNpcMemoryLedgerView, 格式化NPC关系, 归一化NPC记录列表, 提取NPC同行记忆文本列表, 读取NPC头像 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { buildNpcRelationshipPlanning, type NPC关系规划条目 } from '@/services/npcRelationshipPlanning';
import { enrichNpcArchives } from '@/utils/npcArchiveEnrichment';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';

interface CompanionPanelProps {
  npcRecords: NPC记录[];
  onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  album?: 相册系统;
  turnCount: number;
  nsfwEnabled: boolean;
  maleNsfwArchiveEnabled?: boolean;
  devMode?: boolean;
}

type DetailTab = 'archive' | 'planning' | 'memory' | 'agreement' | 'nsfw';
type RosterTab = NPC阶位 | 'archived';

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
const activeSurface = 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-tech-cyan), 0.055))';
const quietSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel), 0.62), rgba(var(--tj-ui-panel-strong), 0.72))';

/**
 * 稳定的 NPC 持久化指纹：只覆盖整理/归一化可能改写的字段，
 * 与整表深比较相比，不受记忆内容、外貌等无关字段变化影响。
 */
function buildNpcPersistFingerprint(records: NPC记录[]): string {
  return JSON.stringify(records.map((n) => [
    n.id,
    n.阶位,
    n.阶位来源,
    n.手动阶位覆盖,
    n.归档,
    n.归档回合,
    n.同行,
    n.累计互动次数,
    n.好感度,
    n.关系,
    n.亲密关系,
    n.职务,
    n.原著角色,
    n.NPC来源,
    n.合并来源ID,
  ]));
}

export function CompanionPanel({ npcRecords, onNpcRecordsChange, album, turnCount, nsfwEnabled, maleNsfwArchiveEnabled = false, devMode = false }: CompanionPanelProps) {
  const [tab, setTab] = useState<RosterTab>('companion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedRecords = useMemo(() => {
    const normalized = 归一化NPC记录列表(npcRecords, turnCount);
    return enrichNpcArchives(normalized, {
      nsfwEnabled,
      maleNsfwArchiveEnabled,
    }).records;
  }, [npcRecords, turnCount, nsfwEnabled, maleNsfwArchiveEnabled]);

  useEffect(() => {
    const normalized = 归一化NPC记录列表(npcRecords, turnCount);
    const enriched = enrichNpcArchives(normalized, {
      nsfwEnabled,
      maleNsfwArchiveEnabled,
    });
    // 稳定持久化指纹：只比较整理/归一化可能改写的字段，避免整表深比较
    // 因无关字段变化或重复渲染误回写（tab 切换、选中项变化不触发回写）。
    if (enriched.changed || buildNpcPersistFingerprint(enriched.records) !== buildNpcPersistFingerprint(npcRecords)) {
      onNpcRecordsChange(enriched.records);
    }
  }, [npcRecords, turnCount, nsfwEnabled, maleNsfwArchiveEnabled, onNpcRecordsChange]);

  const companions = useMemo(
    () => sortNpcRecords(normalizedRecords.filter((n) => !n.归档 && n.阶位 === 'companion')),
    [normalizedRecords],
  );
  const extras = useMemo(
    () => sortNpcRecords(normalizedRecords.filter((n) => !n.归档 && n.阶位 === 'extra' && n.关系 !== 'enemy')),
    [normalizedRecords],
  );
  const archived = useMemo(() => sortNpcRecords(normalizedRecords.filter((n) => n.归档)), [normalizedRecords]);
  const visible = tab === 'companion' ? companions : tab === 'extra' ? extras : archived;

  const travelingCount = companions.filter((n) => n.同行).length;
  const friendCount = companions.filter((n) => ['friend', 'close'].includes(n.关系)).length;

  useEffect(() => {
    if (selectedId && visible.some((n) => n.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [selectedId, visible]);

  const selected = visible.find((n) => n.id === selectedId) ?? null;
  const relationshipPlanning = useMemo(
    () => buildNpcRelationshipPlanning(normalizedRecords, Math.max(...normalizedRecords.map((npc) => Number(npc.最近回合) || 0), 1)),
    [normalizedRecords],
  );
  const selectedPlanning = selected ? relationshipPlanning.条目.find((item) => item.npcId === selected.id) : undefined;

  const updateRecord = (id: string, patch: Partial<NPC记录>) => {
    onNpcRecordsChange((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const promoteToCompanion = (id: string) => updateRecord(id, { 阶位: 'companion', 手动阶位覆盖: 'companion', 阶位来源: 'manual', 归档: false });
  const demoteToExtra = (id: string) => updateRecord(id, { 阶位: 'extra', 手动阶位覆盖: 'extra', 阶位来源: 'manual', 同行: false });
  const restoreArchived = (id: string) => updateRecord(id, { 归档: false, 归档回合: undefined });
  const deleteArchived = (id: string, name: string, mergedFromIds?: string[]) => {
    // 两步确认：第一步确认意图，第二步明确提示姓名与不可恢复性。
    if (!window.confirm('确定要永久删除归档 NPC 记录吗？')) return;
    if (!window.confirm(`确认永久删除「${name}」？该操作不可恢复，且会一并删除其合并来源记录。`)) return;
    const idSet = new Set([id, ...(mergedFromIds ?? [])]);
    onNpcRecordsChange((prev) => prev.filter((n) => !idSet.has(n.id)));
  };
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

        <div className="grid grid-cols-3 gap-2">
          <TabButton active={tab === 'companion'} onClick={() => setTab('companion')}>
            伙伴 {companions.length}
          </TabButton>
          <TabButton active={tab === 'extra'} onClick={() => setTab('extra')}>
            路人 {extras.length}
          </TabButton>
          <TabButton active={tab === 'archived'} onClick={() => setTab('archived')}>
            已归档 {archived.length}
          </TabButton>
        </div>

        <div className="flex min-w-0 gap-2 overflow-x-auto overflow-y-hidden pb-1 md:min-h-0 md:flex-1 md:block md:space-y-2 md:overflow-y-auto md:overflow-x-hidden md:pb-0 md:pr-1">
          {visible.length ? (
            visible.map((npc) => (
              <NpcListItem
                key={npc.id}
                npc={npc}
                album={album}
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

      <main className="min-h-0 min-w-0 flex-1 overflow-y-visible md:overflow-y-auto md:pr-1">
        {selected ? (
          <NpcDetail
            npc={selected}
            album={album}
            nsfwEnabled={nsfwEnabled}
            onPromote={() => promoteToCompanion(selected.id)}
            onDemote={() => demoteToExtra(selected.id)}
            onRestore={() => restoreArchived(selected.id)}
            onDelete={() => deleteArchived(selected.id, selected.姓名, selected.合并来源ID)}
            onToggleTraveling={() => updateRecord(selected.id, { 同行: !selected.同行 })}
            onUpdateNpc={(patch) => updateRecord(selected.id, patch)}
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
          : 'rgba(var(--tj-btn-primary-start), 0.035)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.56), 0 8px 18px rgba(var(--tj-shadow), 0.08)'
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
  album,
  selected,
  onClick,
}: {
  npc: NPC记录;
  album?: 相册系统;
  selected: boolean;
  onClick: () => void;
}) {
  const relation = 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系));
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[132px] shrink-0 flex-col items-center gap-2 px-2 py-3 text-center transition-all hover:bg-[rgba(var(--tj-btn-primary-start),0.07)] md:w-full md:flex-row md:gap-3 md:px-3 md:text-left"
      style={{
        background: selected
          ? activeSurface
          : quietSurface,
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.56), inset 3px 0 0 linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
        clipPath: smallClip,
      }}
    >
      <Avatar npc={npc} album={album} size={46} selected={selected} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-center gap-2 md:justify-start">
          <span
            className="max-w-full truncate font-serif text-[13px] font-semibold tracking-[0.08em] md:text-[14px]"
            style={{ color: selected ? titleColor : bodyColor }}
          >
            {npc.姓名}
          </span>
          {npc.同行 && <PresenceDot />}
        </div>
        <div
          className="mt-0.5 truncate font-serif text-[11px] tracking-[0.1em] md:text-[12px]"
          style={{ color: mutedColor }}
        >
          {relation}
          {npc.职务 ? ` / ${npc.职务}` : ''}
          {npc.原著角色 ? ' / 原著' : ''}
        </div>
        <AffinityMeter value={npc.好感度} compact />
      </div>
    </button>
  );
}

function Avatar({
  npc,
  album,
  size,
  selected = false,
  slot = '档案',
}: {
  npc: NPC记录;
  album?: 相册系统;
  size: number;
  selected?: boolean;
  slot?: '档案' | '正文' | '手机';
}) {
  const src = 解析相册资源引用(album, 读取NPC头像(npc, slot));
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(145deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-tech-cyan), 0.055))',
    boxShadow: selected
      ? '0 0 0 1px rgba(var(--tj-btn-primary-start), 0.72), 0 0 18px rgba(var(--tj-btn-primary-start), 0.16)'
      : '0 0 0 1px rgba(var(--tj-border), 0.72)',
  };

  if (src) {
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <ResilientImage
          src={src}
          alt={npc.姓名}
          className="h-full w-full object-cover"
          style={style}
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: 'inset 0 0 12px rgba(var(--tj-text-primary),0.12)' }}
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
        boxShadow: '0 0 8px rgba(var(--tj-ui-success),0.7)',
      }}
    />
  );
}

function NpcDetail({
  npc,
  album,
  onPromote,
  onDemote,
  onRestore,
  onDelete,
  onToggleTraveling,
  onUpdateNpc,
  nsfwEnabled,
  planning,
  devMode,
}: {
  npc: NPC记录;
  album?: 相册系统;
  onPromote: () => void;
  onDemote: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onToggleTraveling: () => void;
  onUpdateNpc: (patch: Partial<NPC记录>) => void;
  nsfwEnabled: boolean;
  planning?: NPC关系规划条目;
  devMode: boolean;
}) {
  const isCompanion = npc.阶位 === 'companion';
  const [detailTab, setDetailTab] = useState<DetailTab>('archive');

  useEffect(() => {
    if (!nsfwEnabled && detailTab === 'nsfw') setDetailTab('archive');
    if (!planning && detailTab === 'planning') setDetailTab('archive');
  }, [detailTab, nsfwEnabled, planning]);

  return (
    <div className="flex min-h-full flex-col gap-4">
      <section className="px-5 py-4" style={panelStyle}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="relative shrink-0">
            <Avatar npc={npc} album={album} size={88} selected />
            {npc.同行 && (
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 font-serif text-[11px] tracking-[0.18em]"
                style={{
                  color: 'rgba(var(--tj-ui-success),0.96)',
                  background: 'rgba(var(--tj-panel-bg-start),0.92)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-success),0.48)',
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
              {npc.别名 && <span className="font-serif text-[13px] italic text-[rgb(var(--tj-text-secondary))]">({npc.别名})</span>}
              {npc.原著角色 && <Chip tone="gold">原著角色</Chip>}
              {npc.职务 && <Chip tone="silver">{npc.职务}</Chip>}
              {npc.阶位来源 === 'manual' && <Chip tone="silver">手动覆盖</Chip>}
              {npc.归档 && <Chip tone="silver">已归档</Chip>}
              {npc.图像档案?.状态 && <Chip tone="silver">{npc.图像档案.状态 === 'pending' ? '图像生成中' : '图像档案'}</Chip>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <InfoPill label="性别" value={npc.性别 || '未知'} />
              <InfoPill label="关系" value={格式化NPC关系(npc.好感度, Boolean(npc.亲密关系))} />
              <InfoPill label="最近" value={`第 ${npc.最近回合} 回合`} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {npc.归档 && onRestore && (
                <ActionChip active={false} onClick={onRestore}>恢复为活跃路人</ActionChip>
              )}
              {npc.归档 && onDelete && (
                <ActionChip active={false} onClick={onDelete}>永久删除</ActionChip>
              )}
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

          <div className="flex shrink-0 flex-col gap-3 xl:w-[360px] xl:items-stretch">
            <div className="flex justify-end">
              <AffinityBadge value={npc.好感度} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
              <TabButton active={detailTab === 'archive'} onClick={() => setDetailTab('archive')}>
                伙伴档案
              </TabButton>
              {planning && (
                <TabButton active={detailTab === 'planning'} onClick={() => setDetailTab('planning')}>
                  关系规划
                </TabButton>
              )}
              <TabButton active={detailTab === 'memory'} onClick={() => setDetailTab('memory')}>
                {devMode ? '记忆账本' : '同行记忆'}
              </TabButton>
              <TabButton active={detailTab === 'agreement'} onClick={() => setDetailTab('agreement')}>
                约定
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

      {planning && detailTab === 'planning' && (
        <section className="px-4 py-3 text-xs leading-relaxed" style={panelStyle}>
          <div className="font-serif text-[12px] tracking-[0.22em]" style={{ color: accentColor }}>
            关系规划
          </div>
          <div className="mt-2 flex flex-wrap gap-2" style={{ color: bodyColor }}>
            <span>优先级：{planning.优先级}</span>
            <span>建议：{planning.建议动作}</span>
          </div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <MiniList title="理由" items={planning.理由} />
            <MiniList title="关注点" items={planning.关注点} />
          </div>
        </section>
      )}

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
            <VisualArchivePanel npc={npc} album={album} />
          </section>
        </>
      )}

      {detailTab === 'memory' && <MemoryPanel npc={npc} devMode={devMode} />}

      {detailTab === 'agreement' && (
        <AgreementPanel npc={npc} onUpdateNpc={onUpdateNpc} />
      )}

      {nsfwEnabled && detailTab === 'nsfw' && <NSFWArchivePanel npc={npc} />}
    </div>
  );
}

function VisualArchivePanel({ npc, album }: { npc: NPC记录; album?: 相册系统 }) {
  return (
    <DetailBlock title="视觉档案预留">
      <div className="grid gap-3 sm:grid-cols-3">
        <AvatarSlotCard npc={npc} album={album} slot="档案" label="档案头像" description="伙伴面板" />
        <AvatarSlotCard npc={npc} album={album} slot="正文" label="正文头像" description="剧情气泡" />
        <AvatarSlotCard npc={npc} album={album} slot="手机" label="小手机头像" description="短讯名片" />
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
  album,
  slot,
  label,
  description,
}: {
  npc: NPC记录;
  album?: 相册系统;
  slot: '档案' | '正文' | '手机';
  label: string;
  description: string;
}) {
  const src = 解析相册资源引用(album, 读取NPC头像(npc, slot));
  return (
    <div
      className="flex min-w-0 items-center gap-3 px-3 py-3"
      style={{
        background: src ? 'rgba(var(--tj-btn-primary-start), 0.075)' : quietSurface,
        boxShadow: src
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.32)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
        clipPath: smallClip,
      }}
    >
      <Avatar npc={npc} album={album} size={42} slot={slot} selected={Boolean(src)} />
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

// 阶段1补充·约定展示环：玩家可查看/筛选/编辑/删除 NPC 约定
type AgreementFilter = 'all' | 'waiting' | 'completed';

const agreementFilterItems: { id: AgreementFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'waiting', label: '等待中' },
  { id: 'completed', label: '已完结' },
];

const agreementStatusConfig: Record<约定状态, { label: string; color: string; bg: string }> = {
  等待中: { label: '等待中', color: 'rgb(var(--tj-ui-warning, #f59e0b))', bg: 'rgba(var(--tj-ui-warning, 245,158,11), 0.16)' },
  已履行: { label: '已履行', color: 'rgb(var(--tj-ui-success, #10b981))', bg: 'rgba(var(--tj-ui-success, 16,185,129), 0.16)' },
  已违约: { label: '已违约', color: 'rgb(var(--tj-ui-error, #ef4444))', bg: 'rgba(var(--tj-ui-error, 239,68,68), 0.16)' },
  已作废: { label: '已作废', color: 'rgba(var(--tj-ui-muted), 0.8)', bg: 'rgba(var(--tj-ui-muted), 0.14)' },
};

const agreementStatusOptions: 约定状态[] = ['等待中', '已履行', '已违约', '已作废'];

function AgreementPanel({ npc, onUpdateNpc }: { npc: NPC记录; onUpdateNpc: (patch: Partial<NPC记录>) => void }) {
  const [filter, setFilter] = useState<AgreementFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<约定状态>('等待中');

  const agreements = npc.约定 ?? [];
  const filtered = useMemo(() => {
    const sorted = [...agreements].sort((a, b) => b.回合 - a.回合);
    if (filter === 'waiting') return sorted.filter((a) => a.当前状态 === '等待中');
    if (filter === 'completed') return sorted.filter((a) => a.当前状态 !== '等待中');
    return sorted;
  }, [agreements, filter]);

  const stats = useMemo(() => {
    const waiting = agreements.filter((a) => a.当前状态 === '等待中').length;
    const completed = agreements.filter((a) => a.当前状态 !== '等待中').length;
    return { total: agreements.length, waiting, completed };
  }, [agreements]);

  const handleUpdateStatus = (id: string) => {
    const next = agreements.map((a) => (a.id === id ? { ...a, 当前状态: editStatus } : a));
    onUpdateNpc({ 约定: next });
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const next = agreements.filter((a) => a.id !== id);
    onUpdateNpc({ 约定: next });
    if (editingId === id) setEditingId(null);
  };

  return (
    <section className="px-4 py-4" style={panelStyle}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-serif text-[12px] tracking-[0.28em]" style={{ color: accentColor }}>
            约定
          </div>
          <div className="mt-1 text-xs" style={{ color: mutedColor }}>
            共 {stats.total} 条 · 等待中 {stats.waiting} · 已完结 {stats.completed}
          </div>
        </div>
        <div className="flex gap-1.5">
          {agreementFilterItems.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className="px-3 py-1.5 text-xs transition-all"
                style={{
                  color: active ? activeTextColor : mutedColor,
                  background: active ? activeSurface : quietSurface,
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5)'
                    : 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
                  clipPath: smallClip,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: mutedColor }}>
            {agreements.length === 0 ? '尚未建立任何约定。' : '当前筛选条件下没有约定。'}
          </div>
        ) : (
          filtered.map((agreement) => {
            const config = agreementStatusConfig[agreement.当前状态];
            const isEditing = editingId === agreement.id;
            return (
              <div
                key={agreement.id}
                className="px-4 py-3"
                style={{
                  background: quietSurface,
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="shrink-0 px-2 py-0.5 text-[11px] font-serif tracking-[0.16em]"
                        style={{ color: config.color, background: config.bg, clipPath: smallClip }}
                      >
                        {config.label}
                      </span>
                      <span className="truncate font-serif text-sm tracking-[0.14em]" style={{ color: titleColor }}>
                        {agreement.标题}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: faintColor }}>
                      回合 {agreement.回合}
                      {agreement.约定时间 ? ` · ${agreement.约定时间}` : ''}
                      {agreement.来源 ? ` · 来源：${agreement.来源}` : ''}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: bodyColor }}>
                      {agreement.内容}
                    </p>
                    {agreement.后果 && (
                      <p className="mt-2 text-xs leading-relaxed" style={{ color: mutedColor }}>
                        后果：{agreement.后果}
                      </p>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs" style={{ color: mutedColor }}>改为：</span>
                    {agreementStatusOptions.map((status) => {
                      const active = editStatus === status;
                      const cfg = agreementStatusConfig[status];
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setEditStatus(status)}
                          className="px-2 py-1 text-[11px] transition-all"
                          style={{
                            color: active ? cfg.color : mutedColor,
                            background: active ? cfg.bg : 'transparent',
                            boxShadow: active ? `inset 0 0 0 1px ${cfg.color}` : 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
                            clipPath: smallClip,
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(agreement.id)}
                      className="ml-auto px-3 py-1 text-xs"
                      style={{ color: activeTextColor, background: activeSurface, clipPath: smallClip }}
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-xs"
                      style={{ color: mutedColor, clipPath: smallClip }}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(agreement.id);
                        setEditStatus(agreement.当前状态);
                      }}
                      className="px-3 py-1 text-xs"
                      style={{ color: mutedColor, clipPath: smallClip }}
                    >
                      改状态
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(agreement.id)}
                      className="px-3 py-1 text-xs"
                      style={{ color: 'rgb(var(--tj-ui-error, #ef4444))', clipPath: smallClip }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
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
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.22)',
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
        {src ? <img src={src} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[11px]" style={{ color: 'rgba(var(--tj-ui-nsfw),0.56)' }}>待挂载</div>}
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
  // 年龄确认已降级为纯展示信息，不再控制写入或显示。
  if (age === 'adult') return '成人';
  if (age === 'minor_blocked') return '标注未成年';
  if (age === 'unknown') return '未标注';
  return '未标注';
}

function TagGroup({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0 px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.68)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.18)', clipPath: smallClip }}>
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-ui-nsfw),0.82)' }}>
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
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-ui-nsfw),0.82)' }}>
        {title}
      </div>
      <Paragraph text={text} placeholder="未记录" />
    </div>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0 px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel),0.66)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.16)', clipPath: smallClip }}>
      <div className="mb-2 font-serif text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-ui-nsfw),0.82)' }}>
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
      className="px-3 py-1.5 font-serif text-[12px] tracking-[0.16em] transition-all hover:bg-[rgba(var(--tj-btn-primary-start),0.08)]"
      style={{
        color: active ? accentColor : faintColor,
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52)'
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
  const percent = Math.max(0, Math.min(100, ((value - NPC_AFFINITY_MIN) / (NPC_AFFINITY_MAX - NPC_AFFINITY_MIN)) * 100));
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
      color: 'rgba(var(--tj-ui-nsfw),0.98)',
      stroke: 'rgba(var(--tj-ui-nsfw),0.45)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw),0.62), rgba(var(--tj-ui-nsfw),0.96))',
    };
  }
  if (value >= 30) {
    return {
      color: 'rgba(var(--tj-ui-nsfw),0.96)',
      stroke: 'rgba(var(--tj-ui-nsfw),0.38)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw),0.5), rgba(var(--tj-ui-nsfw),0.9))',
    };
  }
  if (value >= 0) {
    return {
      color: 'rgba(var(--tj-text-secondary),0.9)',
      stroke: 'rgba(var(--tj-border), 0.42)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-text-secondary),0.4), rgba(var(--tj-text-secondary),0.78))',
    };
  }
  return {
    color: 'rgba(var(--tj-tech-blue),0.86)',
    stroke: 'rgba(var(--tj-tech-blue),0.34)',
    fill: 'linear-gradient(90deg, rgba(var(--tj-panel-bg-start),0.75), rgba(var(--tj-tech-blue),0.62))',
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
      <span className="h-3 w-[3px]" style={{ background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }} />
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

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-serif text-[11px] tracking-[0.18em]" style={{ color: accentColor }}>{title}</div>
      <div className="mt-1 space-y-1" style={{ color: mutedColor }}>
        {(items.length ? items : ['暂无']).slice(0, 5).map((item, index) => (
          <div key={`${title}_${item}_${index}`}>- {compactListText(item)}</div>
        ))}
      </div>
    </div>
  );
}

function LedgerListCard({ title, items, tone = 'normal' }: { title: string; items: string[]; tone?: 'normal' | 'danger' }) {
  const visibleItems = items.length ? items : ['暂无'];
  const toneColor = tone === 'danger' ? 'rgba(var(--tj-ui-nsfw),0.92)' : accentColor;
  const railColor = tone === 'danger'
    ? 'rgba(var(--tj-ui-nsfw),0.45)'
    : 'rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.52)';

  return (
    <div
      className="flex h-[214px] min-w-0 flex-col px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.58), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: `inset 2px 0 0 ${railColor}, inset 0 0 0 1px rgba(var(--tj-border), 0.46)`,
        clipPath: smallClip,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-serif text-[11px] tracking-[0.2em]" style={{ color: toneColor }}>
          {title}
        </div>
        <div
          className="shrink-0 px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            color: toneColor,
            background: 'rgba(var(--tj-bg-primary), 0.42)',
            boxShadow: `inset 0 0 0 1px ${railColor}`,
          }}
        >
          {items.length}
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <ul className="space-y-1.5">
          {visibleItems.map((item, index) => {
            const empty = !items.length;
            return (
              <li
                key={`${title}_${item}_${index}`}
                className={`min-w-0 break-words font-serif text-[12.5px] leading-relaxed tracking-[0.04em] ${empty ? 'italic' : ''}`}
                style={{ color: empty ? faintColor : bodyColor }}
              >
                <span style={{ color: empty ? faintColor : railColor }}>- </span>
                {item}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function compactListText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 71)}…`;
}

function MemoryPanel({ npc, devMode = false }: { npc: NPC记录; devMode?: boolean }) {
  const ledger = buildNpcMemoryLedgerView(npc, 8);
  const memories = 提取NPC同行记忆文本列表(npc).filter((item) => !item.startsWith('[压缩]'));
  const protectedCount =
    ledger.必须记得.length +
    ledger.禁止遗忘.length +
    ledger.未完成事项.length +
    ledger.未解决冲突.length;
  return (
    <div className="grid gap-4">
      {devMode && (
        <section className="grid gap-4 2xl:grid-cols-[0.86fr_1.14fr]">
          <DetailBlock title="账本状态">
            <div className="grid gap-2 sm:grid-cols-2">
              <LedgerFact label="关系阶段" value={ledger.当前关系阶段} />
              <LedgerFact label="好感度" value={`${ledger.好感度 > 0 ? '+' : ''}${ledger.好感度}`} />
              <LedgerFact label="最近回合" value={`第 ${ledger.最近回合} 回合`} />
              <LedgerFact label="称呼" value={ledger.对玩家称呼 || '未固定'} />
            </div>
            <div className="mt-3 space-y-2">
              <Paragraph text={ledger.最近互动} placeholder="尚无最近互动" />
              <Paragraph text={ledger.对玩家长期印象} placeholder="尚未形成长期印象" italic />
            </div>
          </DetailBlock>

          <DetailBlock title="必须承接">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-serif text-[12px] tracking-[0.12em]" style={{ color: mutedColor }}>
                长期保护事项 {protectedCount} 条
              </div>
              <Chip tone={protectedCount ? 'gold' : 'silver'}>{protectedCount ? '需要承接' : '暂无压力'}</Chip>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <LedgerListCard title="必须记得" items={ledger.必须记得} />
              <LedgerListCard title="禁止遗忘" items={ledger.禁止遗忘} tone="danger" />
              <LedgerListCard title="未完成事项" items={ledger.未完成事项} />
              <LedgerListCard title="未解决冲突" items={ledger.未解决冲突} tone="danger" />
            </div>
          </DetailBlock>
        </section>
      )}

      <section className={devMode ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
        {devMode && (
          <DetailBlock title="共同经历">
            <LedgerListCard title="共同经历" items={ledger.共同经历} />
          </DetailBlock>
        )}

        <DetailBlock title="总结记忆">
          {ledger.总结记忆.length ? (
            <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {ledger.总结记忆.slice(-8).map((summary, index) => (
                <li
                  key={`${summary.id}_${index}`}
                  className="px-3 py-2 font-serif text-[13px] leading-relaxed tracking-[0.06em]"
                  style={{
                    color: bodyColor,
                    background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.56), rgba(var(--tj-surface-strong),0.66))',
                    boxShadow: 'inset 2px 0 0 rgba(var(--tj-btn-primary-start), 0.54), inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="mb-1 text-[11px] tracking-[0.18em]" style={{ color: accentColor }}>
                    {summary.回合范围 || '长期摘要'}{summary.条数 ? ` · ${summary.条数} 条` : ''}
                  </div>
                  {summary.摘要}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText text="尚未形成压缩后的长期关系记忆" />
          )}
        </DetailBlock>
      </section>

      <DetailBlock title={devMode ? '原始同行记忆' : '同行记忆'}>
        {memories.length ? (
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {memories.slice(-12).map((memory, index) => (
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
    </div>
  );
}

function LedgerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-serif text-[11px] tracking-[0.18em]" style={{ color: accentColor }}>{label}</div>
      <div className="mt-1 truncate font-serif text-[13px] tracking-[0.08em]" style={{ color: bodyColor }}>{value}</div>
    </div>
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
      ? { color: 'rgba(var(--tj-btn-primary-start), 0.94)', stroke: 'rgba(var(--tj-btn-primary-start), 0.45)' }
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

function EmptyRoster({ tab }: { tab: RosterTab }) {
  return (
    <div className="px-4 py-8 text-center" style={panelStyle}>
      <div className="font-serif text-[20px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.45)' }}>
        ✦
      </div>
      <div className="mt-2 font-serif text-[13px] tracking-[0.18em]" style={{ color: faintColor }}>
        {tab === 'companion' ? '尚未结识伙伴' : tab === 'extra' ? '尚无路人档案' : '暂无已归档 NPC'}
      </div>
    </div>
  );
}

function NoSelection({ tab }: { tab: RosterTab }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center" style={panelStyle}>
      <div>
        <div className="font-serif text-[28px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.42)' }}>
          ✦
        </div>
        <div className="mt-3 font-serif text-[14px] tracking-[0.22em]" style={{ color: faintColor }}>
          从左侧选择一位{tab === 'companion' ? '伙伴' : tab === 'extra' ? '路人' : '已归档 NPC'}
        </div>
      </div>
    </div>
  );
}
