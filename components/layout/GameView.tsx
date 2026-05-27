import type { ReactNode } from 'react';

interface GameViewProps {
  topBar: ReactNode;
  leftPanel: ReactNode;
  chatArea: ReactNode;
  rightPanel?: ReactNode;
}

export function GameView({ topBar, leftPanel, chatArea, rightPanel }: GameViewProps) {
  return (
    <div className="kaituo-game-bg flex h-screen flex-col">
      {topBar}
      <div className="flex flex-1 overflow-hidden">
        {leftPanel}
        <div
          className="kaituo-chat-surface relative flex flex-1 flex-col overflow-hidden"
        >
          {chatArea}
        </div>
        {rightPanel}
      </div>
    </div>
  );
}
