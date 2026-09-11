import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ZhikuPanel } from '@/components/features/GameSystems/ZhikuPanel';
import type { BundledZhikuCatalogLoadResult } from '@/data/zhikuCatalogRepository';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { ZhikuArchiveExperience } from './ZhikuArchiveExperience';

type ZhikuPanelMode = 'archive' | 'maintenance';

interface Props {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  settings: 智库系统设置;
  onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
  onZhikuMigration: (current: 智库系统) => Promise<BundledZhikuCatalogLoadResult>;
  onClose?: () => void;
}

export function ZhikuSystemPanel({
  zhikuSystem,
  storyWeavingSystem,
  onZhikuSystemChange,
  settings,
  onSaveZhikuSystem,
  onZhikuMigration,
  onClose,
}: Props) {
  const [mode, setMode] = useState<ZhikuPanelMode>('archive');

  if (mode === 'maintenance') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="zj-chip"
            onClick={() => setMode('archive')}
            aria-label="返回档案"
            title="返回档案"
          >
            <ArrowLeft size={12} strokeWidth={1.8} aria-hidden="true" />
            返回档案
          </button>
          <span className="zj-kicker">ZHIKU // MAINTENANCE</span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ZhikuPanel
            zhikuSystem={zhikuSystem}
            onZhikuSystemChange={onZhikuSystemChange}
            settings={settings}
            onSaveZhikuSystem={onSaveZhikuSystem}
            onZhikuMigration={onZhikuMigration}
          />
        </div>
      </div>
    );
  }

  return (
    <ZhikuArchiveExperience
      zhikuSystem={zhikuSystem}
      storyWeavingSystem={storyWeavingSystem}
      onZhikuSystemChange={onZhikuSystemChange}
      onRefreshBundled={onZhikuMigration}
      onManage={() => setMode('maintenance')}
      onClose={onClose}
    />
  );
}
