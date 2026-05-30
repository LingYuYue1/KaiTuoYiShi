import { useMemo } from 'react';

interface LandingPageProps {
  onNewGame: () => void;
  onLoadSave: () => void;
  onSettings: () => void;
  onWorldbookManager: () => void;
  onZhikuManager: () => void;
  onCloudSave: () => void;
}

interface TwinkleStar {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
  color: string;
}

export function LandingPage({
  onNewGame,
  onLoadSave,
  onSettings,
  onWorldbookManager,
  onZhikuManager,
  onCloudSave,
}: LandingPageProps) {
  const stars: TwinkleStar[] = useMemo(() => {
    const list: TwinkleStar[] = [];
    for (let i = 0; i < 280; i++) {
      const isBright = Math.random() < 0.12;
      const isWarm = Math.random() < 0.08;

      list.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: isBright ? 2 + Math.random() * 2 : 0.5 + Math.random() * 1.5,
        opacity: isBright ? 0.5 + Math.random() * 0.5 : 0.15 + Math.random() * 0.45,
        delay: Math.random() * 5,
        duration: isBright ? 1.5 + Math.random() * 2 : 2 + Math.random() * 4,
        color: isWarm
          ? `rgba(255, ${200 + Math.floor(Math.random() * 55)}, ${150 + Math.floor(Math.random() * 50)}, OPACITY)`
          : `rgba(${180 + Math.floor(Math.random() * 60)}, ${210 + Math.floor(Math.random() * 35)}, ${240 + Math.floor(Math.random() * 15)}, OPACITY)`,
      });
    }
    return list;
  }, []);

  return (
    <div
      className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-6"
      style={{ background: '#080812' }}
    >
      {/* ── Twinkling star field ── */}
      {stars.map((s, i) => (
        <div
          key={`s-${i}`}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color.replace('OPACITY', String(s.opacity)),
            boxShadow: s.size > 2
              ? `0 0 ${s.size * 3}px ${s.size * 0.8}px ${s.color.replace('OPACITY', String(s.opacity * 0.6))}`
              : 'none',
            animation: `star-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* ── Radial vignette ── */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 48%, rgba(20,28,60,0) 15%, rgba(16,20,40,0) 35%, rgba(10,12,22,0.6) 60%, rgba(5,6,14,0.9) 80%, rgba(2,3,8,1) 100%)',
        }}
      />

      <button
        type="button"
        onClick={onCloudSave}
        className="absolute left-4 top-4 z-20 px-4 py-2 font-serif text-[12px] tracking-[0.18em] transition-all hover:opacity-90 sm:left-5 sm:top-5 sm:text-[13px]"
        style={{
          color: 'rgba(var(--tj-accent-primary), 0.92)',
          background: 'rgba(var(--tj-bg-primary), 0.32)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45), 0 10px 24px rgba(0,0,0,0.22)',
          clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        }}
      >
        GitHub 云存档
      </button>

      {/* ── Hero Content ── */}
      <div className="relative z-10 flex min-h-0 w-full max-w-[520px] flex-col items-center justify-center animate-fade-in">
        <div className="mb-3 flex w-full items-center justify-center gap-3 sm:gap-6">
          <span className="hidden text-2xl sm:inline" style={{ color: 'rgba(var(--tj-accent-primary), 0.55)' }}>◆</span>
          <h1
            className="flex flex-col items-center gap-1 text-center font-serif text-[clamp(2.8rem,17vw,4rem)] font-bold leading-[0.98] tracking-[0.12em] sm:block sm:text-6xl sm:tracking-[0.28em]"
            style={{
              background: 'linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 50%, rgb(var(--tj-accent-secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 24px rgba(var(--tj-accent-primary), 0.35))',
            }}
          >
            <span>开拓</span>
            <span>轶事</span>
          </h1>
          <span className="hidden text-2xl sm:inline" style={{ color: 'rgba(var(--tj-accent-primary), 0.55)' }}>◆</span>
        </div>

        <div className="mb-3 flex w-full items-center justify-center gap-3 sm:mb-4 sm:gap-4">
          <div
            className="h-px w-10 sm:w-14"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.65))' }}
          />
          <p
            className="font-serif text-sm tracking-[0.28em] sm:text-lg sm:tracking-[0.5em]"
            style={{ color: '#e6d4a0' }}
          >
            崩坏·星穹铁道
          </p>
          <div
            className="h-px w-10 sm:w-14"
            style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.65), transparent)' }}
          />
        </div>

        <p
          className="mb-3 text-center text-xs leading-relaxed tracking-[0.16em] sm:mb-4 sm:text-sm sm:tracking-[0.22em]"
          style={{ color: 'rgba(220, 210, 180, 0.6)' }}
        >
          踏上命途，遨游星海，写下你的开拓之旅吧
        </p>

        {/* Four-pointed star */}
        <div className="relative my-0.5 sm:my-1">
          <svg
            width="100"
            height="50"
            viewBox="-50 -25 100 50"
            style={{ display: 'block' }}
          >
            <defs>
              <radialGradient id="hero-star-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,1)" />
                <stop offset="25%" stopColor="rgba(240,245,255,0.9)" />
                <stop offset="60%" stopColor="rgba(180,210,255,0.4)" />
                <stop offset="100%" stopColor="rgba(140,180,240,0)" />
              </radialGradient>
              <filter id="hero-star-glow">
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M 0,-22 Q 0,0 14,0 Q 0,0 0,22 Q 0,0 -14,0 Q 0,0 0,-22 Z"
              fill="url(#hero-star-core)"
              filter="url(#hero-star-glow)"
            />
            <line x1="0" y1="-25" x2="0" y2="25" stroke="rgba(220,235,255,0.4)" strokeWidth="0.6" />
            <line x1="-25" y1="0" x2="25" y2="0" stroke="rgba(220,235,255,0.4)" strokeWidth="0.6" />
          </svg>
          <div
            className="absolute rounded-full"
            style={{
              left: '50%',
              top: '50%',
              width: '80px',
              height: '80px',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(180,210,255,0.4) 0%, rgba(150,180,240,0.1) 40%, transparent 70%)',
              animation: 'star-glow-pulse 3s ease-in-out infinite',
            }}
          />
        </div>

        <div className="mt-3 flex w-full max-w-[340px] flex-col gap-3 animate-slide-up sm:w-72 sm:gap-3.5">
          <button
            onClick={onNewGame}
            className="kaituo-btn kaituo-btn-primary group px-6 py-3.5 text-base font-medium"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-text-primary), 0.45), transparent)' }}
            />
            <span className="relative">踏上旅途</span>
          </button>

          <button
            onClick={onLoadSave}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.25), transparent)' }}
            />
            <span className="relative">读取光锥</span>
          </button>

          <button
            onClick={onWorldbookManager}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.25), transparent)' }}
            />
            <span className="relative"> 如我所书 </span>
          </button>

          <button
            onClick={onZhikuManager}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.25), transparent)' }}
            />
            <span className="relative"> 智库 </span>
          </button>

          <div className="flex items-center gap-3 my-1 mx-2">
            <div
              className="h-px flex-1"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.35), transparent)' }}
            />
            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>◆</span>
            <div
              className="h-px flex-1"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.35), transparent)' }}
            />
          </div>

          <button
            onClick={onSettings}
            className="kaituo-btn kaituo-btn-quiet px-6 py-2.5 text-xs"
          >
            <span className="relative">设置</span>
          </button>
        </div>
      </div>

      <p className="absolute bottom-4 left-0 right-0 z-10 text-center text-xs opacity-60" style={{ color: 'rgb(var(--tj-text-secondary))' }}>
        开拓轶事 v0.4.2
      </p>
    </div>
  );
}
