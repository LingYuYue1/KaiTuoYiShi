import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { ZhikuMaintenancePanel } from '@/components/features/ZhikuV3/ZhikuMaintenancePanel';
import { loadSetting, saveSetting } from '@/services/dbService';
import {
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
  buildPersistedZhikuSystem,
  mergeBundledZhikuSystem,
} from '@/data/zhikuPreset';
import { loadBundledZhikuCatalogWithFallback } from '@/data/zhikuCatalogRepository';
import { ArchiveBrowser } from './ArchiveBrowser';
import { buildZhikuProductionData } from './productionAdapter';
import type { ReaderRefreshStatus } from './ReaderFontSizeControl';
import { StoryArchiveReader } from './StoryArchiveReader';
import { useZhikuReaderFontSize } from './readerFontSize';
import {
  ZHIKU_PRODUCTION_LAYOUT,
  type ZhikuCategoryId,
} from './types';
import { ZhikuHeader } from './ZhikuHeader';
import { ZhikuPageFrame } from './ZhikuPageFrame';
import { ZhikuScreen } from './ZhikuScreen';
import './zhiku-v3.css';

const isDevBuild = typeof import.meta !== 'undefined'
  && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

interface ZhikuExperienceProps {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  settings: 智库系统设置;
  initialCategoryId?: ZhikuCategoryId;
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<ZhikuCategoryId | null>(
    initialCategoryId ?? null,
  );
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<ReaderRefreshStatus>('idle');
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

  const handleRefreshBundled = async () => {
    if (!isDevBuild || refreshStatus === 'loading') return;
    setRefreshStatus('loading');
    try {
      const catalogResult = await loadBundledZhikuCatalogWithFallback({ cacheBust: Date.now() });
      if (catalogResult.source === 'cache') throw catalogResult.loadError ?? new Error('新目录加载失败，已保留上一完整目录。');
      const bundled = catalogResult.system;
      const savedMigrationAt = await loadSetting<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
      const migrationAt = savedMigrationAt ?? Date.now();
      if (!savedMigrationAt) {
        await saveSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, migrationAt);
      }
      const next = mergeBundledZhikuSystem(bundled, zhikuSystem, migrationAt);
      onZhikuSystemChange(next);
      await saveSetting('zhikuSystem', buildPersistedZhikuSystem(next));
      setRefreshStatus('done');
      window.setTimeout(() => setRefreshStatus('idle'), 1600);
    } catch (error) {
      console.warn('[zhiku-v3] refresh bundled presets failed:', error);
      setRefreshStatus('error');
      window.setTimeout(() => setRefreshStatus('idle'), 2400);
    }
  };

  if (showMaintenance) {
    return (
      <section
        className="zhiku-v3-maintenance"
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
        <main className="zhiku-v3-maintenance__content">
          <ZhikuMaintenancePanel
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
        onRefreshBundled={isDevBuild ? handleRefreshBundled : undefined}
        refreshStatus={refreshStatus}
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
        onRefreshBundled={isDevBuild ? handleRefreshBundled : undefined}
        refreshStatus={refreshStatus}
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
