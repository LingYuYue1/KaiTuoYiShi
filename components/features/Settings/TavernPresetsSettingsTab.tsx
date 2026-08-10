import { PromptModulesTab } from './PromptModulesTab';
import type { 游戏设置 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import type { STRegexScript } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/hooks/useGame';

interface TavernPresetsSettingsTabProps {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  worldbooks: 世界书[];
  onWorldbooksChange: (books: 世界书[]) => void;
  /** 提示词模块用例动作（片 panel-p1）：透传给 PromptModulesTab。 */
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
  onAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
  onDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
}

export function TavernPresetsSettingsTab(props: TavernPresetsSettingsTabProps) {
  return <PromptModulesTab {...props} mode="tavern" />;
}
