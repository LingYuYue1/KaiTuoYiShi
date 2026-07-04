import type { ReactNode } from 'react';
import { WeatherAtmosphere } from '@/components/layout/WeatherAtmosphere';
import { 天气列表 } from '@/data/weatherRules';

interface GameViewProps {
  topBar: ReactNode;
  leftPanel: ReactNode;
  chatArea: ReactNode;
  rightPanel?: ReactNode;
  weatherId?: string | null;
}

export function GameView({ topBar, leftPanel, chatArea, rightPanel, weatherId }: GameViewProps) {
  const effectiveWeatherId = weatherId;
  const activeWeather = 天气列表.find((weather) => weather.id === effectiveWeatherId) ?? 天气列表.find((weather) => weather.id === 'clear');
  const weatherClass = `kaituo-game-weather-${activeWeather?.id ?? 'clear'}`;

  return (
    <div className={`kaituo-app-shell kaituo-game-bg ${weatherClass} relative flex h-[100dvh] flex-col overflow-hidden md:h-screen`}>
      <WeatherAtmosphere weatherId={effectiveWeatherId} />
      <div className="relative z-10 flex min-h-0 flex-none flex-col">
        {topBar}
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {leftPanel}
        <div className="kaituo-mobile-chat-shell kaituo-chat-surface relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {chatArea}
        </div>
        {rightPanel}
      </div>
    </div>
  );
}
