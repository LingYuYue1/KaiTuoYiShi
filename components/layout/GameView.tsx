import type { ReactNode } from 'react';

interface GameViewProps {
  topBar: ReactNode;
  leftPanel: ReactNode;
  chatArea: ReactNode;
  rightPanel?: ReactNode;
}

export function GameView({ topBar, leftPanel, chatArea, rightPanel }: GameViewProps) {
  return (
    <div className="flex h-screen flex-col">
      {topBar}
      <div className="flex flex-1 overflow-hidden">
        {leftPanel}
        <div
          className="relative flex flex-1 flex-col overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(14, 12, 14, 0.98), rgba(6, 5, 7, 0.98))',
          }}
        >
          {chatArea}
        </div>
        {rightPanel}
      </div>
    </div>
  );
}
