import { SmallTag } from './primitives';
import { cardClip } from './saveLoadStyles';

export function MiniSaveTreeMap({
  nodeCount,
  branchCount,
  sizeText,
}: {
  nodeCount: number;
  branchCount: number;
  sizeText: string;
}) {
  return (
    <div
      className="col-span-2 min-h-[170px] px-3 py-3 font-serif"
      style={{
        background: 'rgba(0,0,0,0.20)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
          当前存档树
        </h3>
        <span className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
          {sizeText}
        </span>
      </div>
      <div className="relative h-[112px]">
        <MiniLine left={26} top={24} width={88} rotate={20} />
        <MiniLine left={105} top={55} width={88} rotate={-18} />
        <MiniLine left={105} top={55} width={68} rotate={42} />
        <MiniDot left={22} top={20} />
        <MiniDot left={102} top={50} />
        <MiniDot left={190} top={25} gold />
        <MiniDot left={167} top={101} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SmallTag>{nodeCount} 节点</SmallTag>
        <SmallTag gold>{branchCount} 分支</SmallTag>
      </div>
    </div>
  );
}

function MiniLine({ left, top, width, rotate }: { left: number; top: number; width: number; rotate: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute h-px"
      style={{
        left,
        top,
        width,
        transform: `rotate(${rotate}deg)`,
        transformOrigin: 'left center',
        background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.36), rgba(var(--tj-accent-secondary),0.3))',
      }}
    />
  );
}

function MiniDot({ left, top, gold = false }: { left: number; top: number; gold?: boolean }) {
  return (
    <i
      aria-hidden="true"
      className="absolute h-[9px] w-[9px] rounded-full"
      style={{
        left,
        top,
        background: gold ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))',
        boxShadow: gold ? '0 0 14px rgba(var(--tj-accent-primary),0.72)' : '0 0 16px rgba(var(--tj-accent-primary),.8)',
      }}
    />
  );
}
