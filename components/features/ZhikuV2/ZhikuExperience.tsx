import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { ZhikuPanel } from '@/components/features/GameSystems/ZhikuPanel';
import { ArchiveBrowser } from './ArchiveBrowser';
import { buildZhikuProductionData } from './productionAdapter';
import { StoryArchiveReader } from './StoryArchiveReader';
import { useZhikuReaderFontSize } from './readerFontSize';
import {
  ZHIKU_PRODUCTION_LAYOUT,
  type ZhikuDesignCategoryId,
} from './types';
import { ZhikuHeader } from './ZhikuHeader';
import { ZhikuPageFrame } from './ZhikuPageFrame';
import { ZhikuScreen } from './ZhikuScreen';
import './zhiku-v2.css';

interface ZhikuExperienceProps {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  settings: 智库系统设置;
  initialCategoryId?: ZhikuDesignCategoryId;
  reducedMotion?: boolean;
  onClose?: () => void;
}

export function ZhikuExperience({
  zhikuSystem,
  storyWeavingSystem,
  onZhikuSystemChange,
  settings,
  initialCategoryId,
  reducedMotion = false,
  onClose,
}: ZhikuExperienceProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<ZhikuDesignCategoryId | null>(
    initialCategoryId ?? null,
  );
  const [showMaintenance, setShowMaintenance] = useState(false);
  const {
    fontSize: readerFontSize,
    decreaseFontSize: decreaseReaderFontSize,
    increaseFontSize: increaseReaderFontSize,
  } = useZhikuReaderFontSize();
  const hasShownLobbyRef = useRef(false);
  const shouldAnimateLobby = selectedCategoryId === null && !hasShownLobbyRef.current;
  const productionData = useMemo(
    () => buildZhikuProductionData(zhikuSystem, storyWeavingSystem),
    [storyWeavingSystem, zhikuSystem],
  );
  const selectedCategory = productionData.categories.find((category) => category.id === selectedCategoryId);

  useEffect(() => {
    if (selectedCategoryId === null) hasShownLobbyRef.current = true;
  }, [selectedCategoryId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (showMaintenance) {
        setShowMaintenance(false);
        return;
      }
      if (selectedCategoryId) {
        setSelectedCategoryId(null);
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedCategoryId, showMaintenance]);

  if (showMaintenance) {
    return (
      <section
        className="zhiku-v2-maintenance"
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        aria-label="智库维护工作台"
      >
        <ZhikuPageFrame brightness={0.56} dimmer={0.58} />
        <ZhikuHeader
          title="维护智库"
          subtitle="资料与运行设置"
          onBack={() => setShowMaintenance(false)}
          onClose={onClose}
        />
        <main className="zhiku-v2-maintenance__content">
          <ZhikuPanel
            zhikuSystem={zhikuSystem}
            onZhikuSystemChange={onZhikuSystemChange}
            settings={settings}
          />
        </main>
      </section>
    );
  }

  if (selectedCategoryId === 'story') {
    return (
      <StoryArchiveReader
        volumes={productionData.storyVolumes}
        readerFontSize={readerFontSize}
        onDecreaseReaderFontSize={decreaseReaderFontSize}
        onIncreaseReaderFontSize={increaseReaderFontSize}
        reducedMotion={reducedMotion}
        onBack={() => setSelectedCategoryId(null)}
        onClose={onClose}
      />
    );
  }

  if (selectedCategory && selectedCategory.id !== 'story') {
    return (
      <ArchiveBrowser
        category={selectedCategory}
        items={productionData.archiveItems[selectedCategory.id]}
        readerFontSize={readerFontSize}
        onDecreaseReaderFontSize={decreaseReaderFontSize}
        onIncreaseReaderFontSize={increaseReaderFontSize}
        reducedMotion={reducedMotion}
        onBack={() => setSelectedCategoryId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <ZhikuScreen
      categories={productionData.categories}
      layout={ZHIKU_PRODUCTION_LAYOUT}
      selectedId={selectedCategoryId}
      reducedMotion={reducedMotion}
      entering={shouldAnimateLobby}
      onSelect={setSelectedCategoryId}
      onOpenMaintenance={() => setShowMaintenance(true)}
      onClose={onClose}
    />
  );
}
