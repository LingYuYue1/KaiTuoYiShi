import type { ReactNode } from 'react';

interface GameViewProps {
  topBar: ReactNode;
  leftPanel: ReactNode;
  chatArea: ReactNode;
  rightPanel?: ReactNode;
}

export function GameView({ topBar, leftPanel, chatArea, rightPanel }: GameViewProps) {
  return (
    <div className="kaituo-app-shell kaituo-game-bg flex h-[100dvh] flex-col overflow-hidden md:h-screen">
      {topBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {leftPanel}
        <div
          className="kaituo-mobile-chat-shell kaituo-chat-surface relative flex min-w-0 flex-1 flex-col overflow-hidden"
        >
          {chatArea}
        </div>
        {rightPanel}
      </div>
    </div>
  );
}
