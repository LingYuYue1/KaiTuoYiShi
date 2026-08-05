import type { Dispatch, SetStateAction } from 'react';
import { ZhikuExperience } from '@/components/features/ZhikuV3/ZhikuExperience';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';

interface Props {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  onClose: () => void;
}

export function ZhikuManagerModal({
  zhikuSystem,
  storyWeavingSystem,
  onZhikuSystemChange,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] min-h-0 min-w-0 overflow-hidden bg-[#090c0f]"
      role="dialog"
      aria-modal="true"
      aria-label="智库"
    >
      <ZhikuExperience
        zhikuSystem={zhikuSystem}
        storyWeavingSystem={storyWeavingSystem}
        onZhikuSystemChange={onZhikuSystemChange}
        onClose={onClose}
      />
    </div>
  );
}
