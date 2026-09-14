/** 横幅内联小按钮：RecoveryBanner 与 ContinuityBanner 共用同一套尺寸与描边。 */
export function BannerButton({ label, accent, onClick }: { label: string; accent: boolean; onClick: () => void }) {
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
