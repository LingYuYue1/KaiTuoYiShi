import type { NPC记录, NPC阶位 } from '@/models/npc';
import { 格式化NPC关系 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { AffinityMeter } from './affinity';
import { activeSurface, bodyColor, faintColor, mutedColor, panelStyle, quietSurface, smallClip, titleColor } from './constants';
import { Avatar } from './primitives';

export function NpcListItem({
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
          {npc.原著角色 ? ' / 原著' : ''}
        </div>
        <AffinityMeter value={npc.好感度} compact />
      </div>
    </button>
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

export function EmptyRoster({ tab }: { tab: NPC阶位 }) {
  return (
    <div className="px-4 py-8 text-center" style={panelStyle}>
      <div className="font-serif text-[20px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.45)' }}>
        ✦
      </div>
      <div className="mt-2 font-serif text-[13px] tracking-[0.18em]" style={{ color: faintColor }}>
        {tab === 'companion' ? '尚未结识伙伴' : '尚无路人档案'}
      </div>
    </div>
  );
}

export function NoSelection({ tab }: { tab: NPC阶位 }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center" style={panelStyle}>
      <div>
        <div className="font-serif text-[28px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.42)' }}>
          ✦
        </div>
        <div className="mt-3 font-serif text-[14px] tracking-[0.22em]" style={{ color: faintColor }}>
          从左侧选择一位{tab === 'companion' ? '伙伴' : '路人'}
        </div>
      </div>
    </div>
  );
}
