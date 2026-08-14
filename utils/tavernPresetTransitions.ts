// 酒馆预设（V2）的纯状态转换：编辑 preset 对象、创建 builtin override、删除预设。
// 不触碰 settings 全量、onChange、DOM 或 React state；时间戳由调用方传入。
import type { STPreset, STPresetEntryV2, STWorldInfoEntry } from '@/models/stTypes';

export interface PatchV2PresetResult {
  nextPresets: STPresetEntryV2[];
  /** 仅 builtin override 场景会切换当前预设 id 与角色 id；普通编辑不返回这两项。 */
  currentStPresetIdV2?: string | null;
  currentStCharacterId?: number | null;
}

export function patchV2Preset(
  editablePresets: STPresetEntryV2[],
  allPresets: STPresetEntryV2[],
  presetId: string,
  nextPreset: STPreset,
  now: number,
  currentStCharacterId: number | null | undefined,
): PatchV2PresetResult {
  const target = allPresets.find((entry) => entry.id === presetId);
  if (!target) return { nextPresets: editablePresets };

  if (target.isBuiltin) {
    const overrideId = `builtin_override_${presetId}`;
    const existingOverride = editablePresets.find((entry) => entry.id === overrideId);
    const overrideEntry: STPresetEntryV2 = {
      ...(existingOverride ?? {
        id: overrideId,
        name: `${target.name}（自定义配置）`,
        characterId: target.characterId ?? target.preset.prompt_order.at(0)?.character_id ?? null,
        importedAt: now,
        isBuiltin: false,
      }),
      preset: nextPreset,
      updatedAt: now,
    };
    const nextPresets = existingOverride
      ? editablePresets.map((entry) => entry.id === overrideId ? overrideEntry : entry)
      : [...editablePresets, overrideEntry];
    return {
      nextPresets,
      currentStPresetIdV2: overrideId,
      currentStCharacterId: currentStCharacterId ?? overrideEntry.characterId ?? null,
    };
  }

  const nextPresets = editablePresets.map((entry) =>
    entry.id === presetId ? { ...entry, preset: nextPreset, updatedAt: now } : entry,
  );
  return { nextPresets };
}

export interface DeleteV2PresetResult {
  nextPresets: STPresetEntryV2[];
  currentStPresetIdV2: string | null | undefined;
  currentStCharacterId: number | null | undefined;
}

export function deleteV2Preset(
  presets: STPresetEntryV2[],
  presetId: string,
  currentStPresetIdV2: string | null | undefined,
  currentStCharacterId: number | null | undefined,
): DeleteV2PresetResult {
  const nextPresets = presets.filter((entry) => entry.id !== presetId);
  const isCurrent = currentStPresetIdV2 === presetId;
  return {
    nextPresets,
    currentStPresetIdV2: isCurrent ? null : currentStPresetIdV2,
    currentStCharacterId: isCurrent ? null : currentStCharacterId,
  };
}

export function patchPresetOrderSlot(
  preset: STPreset,
  orderCharacterId: number,
  identifier: string,
  partial: Partial<STPreset['prompt_order'][number]['order'][number]>,
): STPreset {
  return {
    ...preset,
    prompt_order: preset.prompt_order.map((order) =>
      order.character_id === orderCharacterId
        ? {
            ...order,
            order: order.order.map((slot) =>
              slot.identifier === identifier ? { ...slot, ...partial } : slot,
            ),
          }
        : order,
    ),
  };
}

export function patchPresetPrompt(
  preset: STPreset,
  identifier: string,
  partial: Partial<STPreset['prompts'][number]>,
): STPreset {
  return {
    ...preset,
    prompts: preset.prompts.map((prompt) =>
      prompt.identifier === identifier ? { ...prompt, ...partial } : prompt,
    ),
  };
}

export function patchPresetWorldInfoEntry(
  preset: STPreset,
  entryKey: string,
  partial: Partial<STWorldInfoEntry>,
): STPreset {
  const raw = preset.world_info;
  if (Array.isArray(raw)) {
    const targetIndex = Number(entryKey);
    return {
      ...preset,
      world_info: raw.map((entry, index) => index === targetIndex ? { ...entry, ...partial } : entry),
    };
  }
  if (raw && typeof raw === 'object') {
    const nextWorldInfo: Record<string, STWorldInfoEntry> = {
      ...raw,
      [entryKey]: { ...raw[entryKey], ...partial },
    };
    return { ...preset, world_info: nextWorldInfo };
  }
  return preset;
}
