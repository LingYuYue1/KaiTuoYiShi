import { useState } from 'react';
import { Layers3 } from 'lucide-react';

import { ContextViewerTab } from '../ContextViewer';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ContextSection({ getContextSnapshot }: SettingsSectionContext) {
  const [refreshKey, setRefreshKey] = useState(0);
  void refreshKey;
  return (
    <ContextViewerTab
      getSnapshot={getContextSnapshot}
      onRefresh={() => setRefreshKey((v) => v + 1)}
    />
  );
}

export const contextSection: SettingsSectionDefinition = {
  key: 'context',
  label: '上下文',
  icon: '▤',
  navIcon: Layers3,
  group: 'data',
  subtitle: '主剧情 Token 计数',
  Component: ContextSection,
};
