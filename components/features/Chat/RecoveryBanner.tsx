import type { TurnPhase } from '@/models/turnRecovery';

export interface RecoveryBannerCallbacks {
  onResume: () => void;
  onAbandon: () => void;
  onRetry: () => void;
  onUndo: () => void;
}

function BannerButton({
  label,
  accent,
  onClick,
}: {
  label: string;
  accent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="border px-3 py-1 text-xs hover:opacity-80"
      style={{ borderColor: accent ? 'rgba(var(--tj-accent-primary),0.5)' : 'rgba(var(--tj-text-secondary),0.35)' }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * 未封版回合的恢复横幅：settling → 继续结算 / 放弃，awaitingLanding → 重试 / 撤销。
 * 纯展示组件；可见性（hasRecovery && !turnBusy）由调用方判定。
 */
export function RecoveryBanner({
  phase,
  onResume,
  onAbandon,
  onRetry,
  onUndo,
}: RecoveryBannerCallbacks & { phase: TurnPhase | null }) {
  return (
    <div
      className="mx-3 mb-2 flex flex-wrap items-center gap-2 border px-3 py-2 text-sm"
      style={{
        borderColor: 'rgba(var(--tj-accent-primary),0.35)',
        background: 'rgba(var(--tj-surface),0.94)',
        color: 'rgb(var(--tj-text-primary))',
      }}
      role="status"
    >
      {phase === 'settling' ? (
        <>
          <span className="min-w-0 flex-1">上次生成被中断，回复已落地、结算未完成。</span>
          <BannerButton label="继续结算" accent onClick={onResume} />
          <BannerButton label="放弃" accent={false} onClick={onAbandon} />
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">上一回合还没落地，可重试本回合或撤销。</span>
          <BannerButton label="重试" accent onClick={onRetry} />
          <BannerButton label="撤销" accent={false} onClick={onUndo} />
        </>
      )}
    </div>
  );
}
