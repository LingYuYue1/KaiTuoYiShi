import { HardDrive } from 'lucide-react';

import { SaveManager } from '@/components/features/SaveLoad/SaveManager';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function StorageSection(ctx: SettingsSectionContext) {
  return (
    <SaveManager
      variant="settingsTab"
      showAutoArchives={ctx.gameSettings.enableAutoSaveEveryTurn}
      onContinue={ctx.onContinue}
      onLoad={ctx.onLoadSave}
      onBranch={ctx.onBranchSave}
      onDeleteSave={ctx.onDeleteSave}
      onDeleteSaveTree={ctx.onDeleteSaveTree}
      onClearActiveSaveTreeMeta={ctx.onClearActiveSaveTreeMeta}
      onGetSaveCatalogSnapshot={ctx.onGetSaveCatalogSnapshot}
      onStartSaveCatalogRepair={ctx.onStartSaveCatalogRepair}
      onSubscribeSaveCatalogRepair={ctx.onSubscribeSaveCatalogRepair}
      onRepairSaveDatabase={ctx.onRepairSaveDatabase}
      onDeleteLegacyBackupSaves={ctx.onDeleteLegacyBackupSaves}
      onExportSavePackage={ctx.onExportSavePackage}
      onExportSaveTreePackage={ctx.onExportSaveTreePackage}
      onImportSaveFileAsMany={ctx.onImportSaveFileAsMany}
    />
  );
}

export const storageSection: SettingsSectionDefinition = {
  key: 'storage',
  label: '存档管理',
  icon: '✧',
  navIcon: HardDrive,
  group: 'data',
  subtitle: '本地存档与导入导出',
  Component: StorageSection,
};
