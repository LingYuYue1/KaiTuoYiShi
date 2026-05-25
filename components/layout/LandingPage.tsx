import { useMemo } from 'react';

interface LandingPageProps {
  onNewGame: () => void;
  onLoadSave: () => void;
  onSettings: () => void;
  onWorldbookManager: () => void;
  onZhikuManager: () => void;
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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
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

      {/* ── Hero Content ── */}
      <div className="relative z-10 flex flex-col items-center animate-fade-in pt-4">
        <div className="flex items-center gap-6 mb-3">
          <span className="text-2xl" style={{ color: 'rgba(245, 217, 122, 0.55)' }}>◆</span>
          <h1
            className="font-serif text-5xl md:text-6xl font-bold tracking-[0.4em]"
            style={{
              background: 'linear-gradient(180deg, #fff4d4 0%, #f5d97a 50%, #c4a35a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 24px rgba(245, 217, 122, 0.35))',
            }}
          >
            开拓轶事
          </h1>
          <span className="text-2xl" style={{ color: 'rgba(245, 217, 122, 0.55)' }}>◆</span>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div
            className="h-px w-14"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.65))' }}
          />
          <p
            className="text-base md:text-lg font-serif tracking-[0.5em]"
            style={{ color: '#e6d4a0' }}
          >
            崩坏·星穹铁道
          </p>
          <div
            className="h-px w-14"
            style={{ background: 'linear-gradient(90deg, rgba(245, 217, 122, 0.65), transparent)' }}
          />
        </div>

        <p
          className="text-sm tracking-[0.22em] mb-4"
          style={{ color: 'rgba(220, 210, 180, 0.6)' }}
        >
          踏上命途，遨游星海，写下你的开拓之旅吧
        </p>

        {/* Four-pointed star */}
        <div className="relative my-1">
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

        <div className="flex flex-col gap-3.5 w-72 mt-3 animate-slide-up">
          <button
            onClick={onNewGame}
            className="kaituo-btn kaituo-btn-primary group px-6 py-3.5 text-base font-medium"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255, 245, 200, 0.45), transparent)' }}
            />
            <span className="relative">踏上旅途</span>
          </button>

          <button
            onClick={onLoadSave}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.25), transparent)' }}
            />
            <span className="relative">读取光锥</span>
          </button>

          <button
            onClick={onWorldbookManager}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.25), transparent)' }}
            />
            <span className="relative"> 如我所书 </span>
          </button>

          <button
            onClick={onZhikuManager}
            className="kaituo-btn kaituo-btn-secondary group px-6 py-3 text-base"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.25), transparent)' }}
            />
            <span className="relative"> 智库 </span>
          </button>

          <div className="flex items-center gap-3 my-1 mx-2">
            <div
              className="h-px flex-1"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.35), transparent)' }}
            />
            <span className="text-[10px]" style={{ color: 'rgba(245, 217, 122, 0.5)' }}>◆</span>
            <div
              className="h-px flex-1"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.35), transparent)' }}
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

      <p className="absolute bottom-4 left-0 right-0 z-10 text-center text-xs opacity-20" style={{ color: 'rgb(var(--tj-text-secondary))' }}>
        开拓轶事 v0.1
      </p>
    </div>
  );
}
