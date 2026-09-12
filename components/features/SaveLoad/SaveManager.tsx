import { useSaveManager, type SaveManagerCallerActions } from '@/hooks/useSaveManager';

import { SaveManagerModalShell } from './saveManagerModalShell';
import { SaveManagerSettingsShell } from './saveManagerSettingsShell';

export type SaveManagerProps =
  | (SaveManagerCallerActions & {
      variant: 'modal';
      /** 导出当前工作区叶子节点（子任务 A）：手动存档已移除，「导出当前节点」改指活跃叶子。 */
      onExportActiveLeafPackage: () => Promise<number | null>;
      onClose: () => void;
    })
  | (SaveManagerCallerActions & {
      variant: 'settingsTab';
      /** 设置页独有的「继续游戏」入口。 */
      onContinue: () => Promise<boolean>;
    });

/**
 * 存档管理单一实现：共享逻辑见 useSaveManager，两个变体只负责布局与独有动作。
 * variant: 'modal' = 存档树控制台；'settingsTab' = 设置页存档管理。
 */
export function SaveManager(props: SaveManagerProps) {
  const model = useSaveManager({
    ...props,
    operationErrorMode: props.variant === 'modal' ? 'alert' : 'inline',
  });

  if (props.variant === 'modal') {
    return (
      <SaveManagerModalShell
        model={model}
        onExportActiveLeafPackage={props.onExportActiveLeafPackage}
        onClose={props.onClose}
      />
    );
  }

  return <SaveManagerSettingsShell model={model} onContinue={props.onContinue} />;
}
