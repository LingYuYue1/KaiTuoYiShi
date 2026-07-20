import { Modal } from '@/components/ui/Modal';
import { ZhikuPanel } from './ZhikuPanel';
import type { 智库系统, 智库条目, 智库条目草稿 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';

interface Props {
  zhikuSystem: 智库系统;
  onCreateEntry: (draft: 智库条目草稿) => Promise<string>;
  onUpdateEntry: (entryId: string, patch: Partial<Omit<智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onRefreshBundled: () => Promise<void>;
  settings: 智库系统设置;
  onClose: () => void;
}

export function ZhikuManagerModal({ zhikuSystem, onCreateEntry, onUpdateEntry, onDeleteEntry, onRefreshBundled, settings, onClose }: Props) {
  return (
    <Modal title="智库" onClose={onClose} className="max-w-6xl">
      <div className="h-full min-h-0 min-w-0 overflow-hidden md:h-[78vh]">
        <ZhikuPanel
          zhikuSystem={zhikuSystem}
          onCreateEntry={onCreateEntry}
          onUpdateEntry={onUpdateEntry}
          onDeleteEntry={onDeleteEntry}
          onRefreshBundled={onRefreshBundled}
          settings={settings}
        />
      </div>
    </Modal>
  );
}
