// 酒馆预设的 DOM 副作用：文件导入与导出。解析与状态转换逻辑在 utils/tavernPresetParsing.ts / tavernPresetTransitions.ts。
import type { STPresetEntryV2, STRegexScript } from '@/models/stTypes';
import type { 游戏设置 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import { parseSTPresetV2 } from '@/utils/stPresetParser';
import { getPresetWorldInfoEntries } from '@/utils/tavernPresetParsing';
import { devLog } from '@/utils/devLog';

export function exportV2Preset(preset: STPresetEntryV2): void {
  const blob = new Blob([JSON.stringify(preset.preset, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${preset.name || 'st-preset-v2'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importSTPreset(params: {
  settings: 游戏设置;
  worldbooks: 世界书[];
  onWorldbooksChange: (worldbooks: 世界书[]) => void;
  onChange: (settings: 游戏设置) => void;
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
}): void {
  const { settings, worldbooks, onWorldbooksChange, onChange, onExtractTavernRegexScripts } = params;
  // 只保留 Tavern 原始结构（prompts + prompt_order），不再生成 V1 st_import_* 模块。
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedV2 = parseSTPresetV2(text);
      if (!parsedV2.preset) {
        alert(`酒馆预设解析失败：${parsedV2.error ?? '未找到有效结构'}\n请确认文件包含 prompts + prompt_order。`);
        return;
      }

      const now = Date.now();
      const presetId = `stpreset_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const fileBaseName = file.name.replace(/\.json$/i, '').trim();
      const rawName = typeof parsedV2.preset.name === 'string' ? parsedV2.preset.name.trim() : '';
      const presetName = (fileBaseName || rawName || `酒馆预设 · ${parsedV2.preset.prompts.length} 项`).slice(0, 60);
      const newPresetV2: STPresetEntryV2 = {
        id: presetId,
        name: presetName,
        preset: parsedV2.preset,
        characterId: parsedV2.preset.prompt_order[0]?.character_id ?? null,
        importedAt: now,
        updatedAt: now,
        isBuiltin: false,
      };
      const importedWorldInfoCount = getPresetWorldInfoEntries(parsedV2.preset.world_info).length;
      const importedRegexCount = onExtractTavernRegexScripts(parsedV2.preset).length;
      onWorldbooksChange(worldbooks.filter((w) => !w.id.startsWith('stwb_')));
      onChange({
        ...settings,
        enableStPreset: true,
        stPresetsV2: [...(settings.stPresetsV2 ?? []), newPresetV2],
        currentStPresetIdV2: presetId,
        currentStCharacterId: newPresetV2.characterId ?? null,
      });
      devLog('ui', '酒馆预设导入', {
        presetId,
        name: presetName,
        promptCount: parsedV2.preset.prompts.length,
        orderCount: parsedV2.preset.prompt_order[0]?.order.length ?? 0,
        worldInfoCount: importedWorldInfoCount,
        regexScriptCount: importedRegexCount,
        v2RepairUsed: parsedV2.usedRepair,
      });
      alert(`已导入酒馆预设「${presetName}」。\n保留 ${parsedV2.preset.prompts.length} 个内容项 / ${parsedV2.preset.prompt_order[0]?.order.length ?? 0} 个顺序项。\n附带 world_info：${importedWorldInfoCount} 条；regex_scripts：${importedRegexCount} 条。\n不再生成提示词模块副本。`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`ST 预设解析失败：${message}\n请确认文件是 SillyTavern 导出的预设 JSON（含 prompts + prompt_order 字段）。`);
    }
  };
  input.click();
}
