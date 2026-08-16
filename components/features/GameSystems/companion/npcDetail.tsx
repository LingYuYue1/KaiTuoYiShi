import { useState } from 'react';
import type { ReactNode } from 'react';
import type { NPC记录, NPC_NSFW年龄确认 } from '@/models/npc';
import { 格式化NPC关系, 读取NPC头像 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import type { NPC关系规划条目 } from '@/services/npcRelationshipPlanning';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';
import { AffinityBadge } from './affinity';
import { accentColor, bodyColor, faintColor, mutedColor, nsfwColor, panelStyle, quietSurface, smallClip, titleColor } from './constants';
import { MemoryPanel } from './memory';
import { ActionChip, Avatar, Chip, DetailBlock, EmptyText, InfoPill, Paragraph, TabButton } from './primitives';

type DetailTab = 'archive' | 'planning' | 'memory' | 'nsfw';

export function NpcDetail({
  npc,
  album,
  onPromote,
  onDemote,
  onToggleTraveling,
  nsfwEnabled,
  planning,
  devMode,
}: {
  npc: NPC记录;
  album?: 相册系统;
  onPromote: () => void;
  onDemote: () => void;
  onToggleTraveling: () => void;
  nsfwEnabled: boolean;
  planning?: NPC关系规划条目;
  devMode: boolean;
}) {
  const isCompanion = npc.阶位 === 'companion';
  const [detailTab, setDetailTab] = useState<DetailTab>('archive');

  const effectiveDetailTab: DetailTab =
    detailTab === 'nsfw' && !nsfwEnabled
      ? 'archive'
      : detailTab === 'planning' && !planning
        ? 'archive'
        : detailTab;

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
              {npc.图像档案?.状态 && <Chip tone="silver">{npc.图像档案.状态 === 'pending' ? '图像生成中' : '图像档案'}</Chip>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <InfoPill label="性别" value={npc.性别 || '未知'} />
              <InfoPill label="关系" value={格式化NPC关系(npc.好感度, Boolean(npc.亲密关系))} />
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

          <div className="flex shrink-0 flex-col gap-3 xl:w-[360px] xl:items-stretch">
            <div className="flex justify-end">
              <AffinityBadge value={npc.好感度} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
              <TabButton active={effectiveDetailTab === 'archive'} onClick={() => setDetailTab('archive')}>
                伙伴档案
              </TabButton>
              {planning && (
                <TabButton active={effectiveDetailTab === 'planning'} onClick={() => setDetailTab('planning')}>
                  关系规划
                </TabButton>
              )}
              <TabButton active={effectiveDetailTab === 'memory'} onClick={() => setDetailTab('memory')}>
                {devMode ? '记忆账本' : '同行记忆'}
              </TabButton>
              {nsfwEnabled && (
                <TabButton active={effectiveDetailTab === 'nsfw'} onClick={() => setDetailTab('nsfw')}>
                  NSFW档案
                </TabButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {planning && effectiveDetailTab === 'planning' && (
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

      {effectiveDetailTab === 'archive' && (
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

      {effectiveDetailTab === 'memory' && <MemoryPanel npc={npc} devMode={devMode} />}

      {nsfwEnabled && effectiveDetailTab === 'nsfw' && <NSFWArchivePanel npc={npc} />}
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
        {src ? <ResilientImage src={src} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[11px]" style={{ color: 'rgba(var(--tj-ui-nsfw),0.56)' }}>待挂载</div>}
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

function compactListText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 71)}…`;
}
