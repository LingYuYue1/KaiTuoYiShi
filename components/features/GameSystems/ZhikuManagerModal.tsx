import type { Dispatch, SetStateAction } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ZhikuPanel } from './ZhikuPanel';
import type { 智库系统 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';

interface Props {
  zhikuSystem: 智库系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  settings: 智库系统设置;
  onClose: () => void;
}

export function ZhikuManagerModal({ zhikuSystem, onZhikuSystemChange, settings, onClose }: Props) {
  return (
    <Modal title="智库" onClose={onClose} className="max-w-6xl">
      <div className="h-full min-h-0 min-w-0 overflow-hidden md:h-[78vh]">
        <ZhikuPanel
          zhikuSystem={zhikuSystem}
          onZhikuSystemChange={onZhikuSystemChange}
          settings={settings}
        />
      </div>
    </Modal>
  );
}
