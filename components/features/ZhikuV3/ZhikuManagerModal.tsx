import type { Dispatch, SetStateAction } from 'react';
import type { BundledZhikuCatalogLoadResult } from '@/data/zhikuCatalogRepository';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { ZhikuSystemPanel } from './ZhikuSystemPanel';

interface Props {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  settings: 智库系统设置;
  onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
  onZhikuMigration: (current: 智库系统) => Promise<BundledZhikuCatalogLoadResult>;
  onClose: () => void;
}

export function ZhikuManagerModal({
  zhikuSystem,
  storyWeavingSystem,
  onZhikuSystemChange,
  settings,
  onSaveZhikuSystem,
  onZhikuMigration,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] min-h-0 min-w-0 overflow-hidden bg-[#090c0f]"
      role="dialog"
      aria-modal="true"
      aria-label="智库"
    >
      <ZhikuSystemPanel
        zhikuSystem={zhikuSystem}
        storyWeavingSystem={storyWeavingSystem}
        onZhikuSystemChange={onZhikuSystemChange}
        settings={settings}
        onSaveZhikuSystem={onSaveZhikuSystem}
        onZhikuMigration={onZhikuMigration}
        onClose={onClose}
      />
    </div>
  );
}
