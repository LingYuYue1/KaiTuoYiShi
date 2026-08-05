import type { ReactNode } from 'react';
import { CategoryField } from './CategoryField';
import { DataOrbitLayer } from './DataOrbitLayer';
import { ZhikuHeader } from './ZhikuHeader';
import { ZhikuPageFrame } from './ZhikuPageFrame';
import { ZHIKU_MOBILE_NODE_LAYOUT } from './mobileLayout';
import type { ZhikuCategory, ZhikuLayout, ZhikuNodePlacement } from './types';
import './zhiku-v3.css';

interface ZhikuScreenProps {
  categories: ZhikuCategory[];
  layout: ZhikuLayout;
  selectedId?: string | null;
  reducedMotion?: boolean;
  entering?: boolean;
  showGrid?: boolean;
  showSafeArea?: boolean;
  onSelect?: (id: ZhikuCategory['id']) => void;
  onClose?: () => void;
  renderNode?: (category: ZhikuCategory, placement: ZhikuNodePlacement) => ReactNode;
}

export function ZhikuScreen({
  categories,
  layout,
  selectedId,
  reducedMotion = false,
  entering = false,
  showGrid = false,
  showSafeArea = false,
  onSelect,
  onClose,
  renderNode,
}: ZhikuScreenProps) {
  return (
    <section
      className="zhiku-v3-screen"
      data-entering={entering ? 'true' : 'false'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <ZhikuPageFrame
        brightness={layout.background.brightness}
        dimmer={layout.background.dimmer}
        showGrid={showGrid}
        showSafeArea={showSafeArea}
      />
      <div className="zhiku-v3-screen__stage">
        <DataOrbitLayer
          nodes={layout.nodes}
          layoutVariant="desktop"
          selectedId={selectedId}
          opacity={layout.background.orbitOpacity}
          reducedMotion={reducedMotion}
          entering={entering}
        />
        <DataOrbitLayer
          nodes={ZHIKU_MOBILE_NODE_LAYOUT}
          layoutVariant="mobile"
          selectedId={selectedId}
          opacity={layout.background.orbitOpacity}
          reducedMotion={reducedMotion}
          entering={entering}
        />
        <CategoryField
          categories={categories}
          nodes={layout.nodes}
          mobileNodes={ZHIKU_MOBILE_NODE_LAYOUT}
          selectedId={selectedId}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
          renderNode={renderNode}
        />
        <div className="zhiku-v3-screen__index" aria-hidden="true">
          <span>ARCHIVE // 09</span>
          <i />
        </div>
      </div>
      <ZhikuHeader onClose={onClose} />
    </section>
  );
}
