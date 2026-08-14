import type { 智库条目 } from '@/models/zhiku';
import type { CharacterGroup, CharacterProfile, CharacterProfileViewModel } from '@/models/zhikuCharacter';
import type { Bucket } from './constants';
import { smallClip } from './constants';
import { EmptyNotice } from './primitives';
import { DetailPanel } from './detail';

export function CharacterWorkspace({
  groups,
  activeProfile,
  activeEntry,
  activeVm,
  visibleCount,
  bucket,
  expandedGroupIds,
  onToggleGroup,
  onSelectProfile,
  onUpdate,
  onDelete,
  onSelectCustomOnly,
}: {
  groups: CharacterGroup[];
  activeProfile: CharacterProfile | null;
  activeEntry: 智库条目 | null;
  activeVm: CharacterProfileViewModel | null;
  visibleCount: number;
  bucket: Bucket;
  expandedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
  onSelectProfile: (entryId: string) => void;
  onUpdate: (patch: Partial<智库条目>) => void;
  onDelete: () => void;
  onSelectCustomOnly: () => void;
}) {
  return (
    <>
      <main className="min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <div className="truncate whitespace-nowrap font-serif text-[13px] tracking-[0.12em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              角色列表
            </div>
            <div className="mt-1 whitespace-nowrap text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              {groups.reduce((total, group) => total + group.profiles.length, 0)} 名 / {visibleCount} 条
            </div>
          </div>
          <div className="hidden shrink-0 whitespace-nowrap text-[11px] font-mono tracking-[0.14em] md:block" style={{ color: 'rgba(190, 224, 190, 0.92)' }}>
            {bucket === 'builtin' ? 'READ ONLY' : bucket === 'custom' ? 'CUSTOM' : 'REBUILD'}
          </div>
        </div>

        {groups.length === 0 ? (
          <EmptyNotice text="暂无人物" />
        ) : (
          groups.map((group) => (
            <CharacterProfileGroup
              key={group.id}
              group={group}
              expanded={expandedGroupIds.includes(group.id)}
              activeProfileId={activeProfile?.id ?? null}
              onToggle={() => onToggleGroup(group.id)}
              onSelectProfile={onSelectProfile}
            />
          ))
        )}
      </main>

      <div className="min-h-0 min-w-0 overflow-hidden md:h-full">
        {activeEntry ? (
          <DetailPanel
            entry={activeEntry}
            vm={activeVm}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSelectCustomOnly={onSelectCustomOnly}
          />
        ) : (
          <CharacterRebuildDetail />
        )}
      </div>
    </>
  );
}

function CharacterProfileGroup({
  group,
  expanded,
  activeProfileId,
  onToggle,
  onSelectProfile,
}: {
  group: CharacterGroup;
  expanded: boolean;
  activeProfileId: string | null;
  onToggle: () => void;
  onSelectProfile: (entryId: string) => void;
}) {
  return (
    <section className="mb-3 last:mb-0">
      <button
        onClick={onToggle}
        className="mb-1.5 w-full min-w-0 overflow-hidden px-2.5 py-2.5 text-left transition-all"
        style={{
          background: expanded
            ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-bg-secondary), 0.54))'
            : 'linear-gradient(135deg, rgba(var(--tj-bg-primary), 0.18), rgba(var(--tj-bg-secondary), 0.4))',
          boxShadow: expanded
            ? 'inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.94), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.44)'
            : 'inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.32), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)',
          clipPath: smallClip,
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-serif text-[13px] font-semibold tracking-[0.16em]" style={{ color: expanded ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.9)' }}>
              {group.label}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span
                className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono tracking-[0.12em]"
                style={{
                  color: 'rgba(var(--tj-btn-primary-start), 0.92)',
                  background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                {group.kind}
              </span>
              <span className="truncate text-[10px] font-mono tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                NAV GROUP
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="px-1.5 py-0.5 text-[10px] font-mono tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)', background: 'rgba(var(--tj-bg-primary), 0.28)', clipPath: smallClip }}>
              {group.profiles.length} 名
            </span>
            <span className="text-[13px] font-mono" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>
      </button>
      {expanded && (
        <div
          className="ml-2 space-y-1.5 border-l pl-2"
          style={{ borderColor: 'rgba(var(--tj-btn-primary-start), 0.22)' }}
        >
          {group.profiles.map((profile) => (
            <CharacterProfileButton
              key={profile.id}
              profile={profile}
              active={activeProfileId === profile.id}
              onClick={() => onSelectProfile(profile.entries[0].id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CharacterProfileButton({ profile, active, onClick }: { profile: CharacterProfile; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full min-w-0 overflow-hidden px-2.5 py-2.5 text-left transition-all"
      style={{
        background: active ? 'rgba(var(--tj-btn-primary-start), 0.11)' : 'rgba(var(--tj-bg-secondary), 0.28)',
        boxShadow: active
          ? 'inset 2px 0 0 rgba(var(--tj-btn-primary-start), 0.9), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)',
        clipPath: smallClip,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-serif text-[13px] font-semibold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {profile.name}
        </div>
        <span className="shrink-0 text-[10px] font-mono tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
          {profile.entries.length}
        </span>
      </div>
      <div className="mt-1 truncate text-[10px] font-mono tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
        {profile.groupLabel}
      </div>
    </button>
  );
}

function CharacterRebuildDetail() {
  return (
    <section
      className="h-full min-h-[18rem] min-w-0 overflow-y-auto px-3 py-4 md:px-4"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.94), rgba(var(--tj-tech-wash),0.58), rgba(var(--tj-surface-strong),0.78))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="text-xs font-mono tracking-[0.3em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.8)' }}>
        CHARACTER REBUILD
      </div>
      <div className="mt-3 font-serif text-[22px] font-semibold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        人物资料待重建
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        <p>旧版人物资料已从智库退出，避免继续用单层百科条目影响角色口吻和剧情阶段。</p>
        <p>下一步重新放入人物时，会按角色主体、形态阶段、命途能力、剧情解锁与 OOC 风险拆成节点。</p>
      </div>
    </section>
  );
}
