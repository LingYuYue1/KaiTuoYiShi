import type { STPreset, STPresetEntryV2, STPresetOrder, STPresetOrderSlot, STPresetPrompt } from '@/models/stTypes';

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ST V2 ${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`ST V2 ${label} 必须是非空字符串`);
  }
  return value.trim();
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`ST V2 ${label} 必须是有限数字`);
  }
  return Math.floor(value);
}

function parsePrompt(raw: unknown, index: number): STPresetPrompt {
  const source = requireObject(raw, `prompts[${index}]`);
  const role = source.role;
  if (role !== 'system' && role !== 'user' && role !== 'assistant') {
    throw new Error(`ST V2 prompts[${index}].role 必须是 system、user 或 assistant`);
  }
  if (typeof source.content !== 'string') {
    throw new Error(`ST V2 prompts[${index}].content 必须是字符串`);
  }
  const identifier = requireText(source.identifier, `prompts[${index}].identifier`);
  return {
    ...source,
    identifier,
    role,
    content: source.content,
  } as STPresetPrompt;
}

function parseOrderSlot(raw: unknown, orderIndex: number, slotIndex: number): STPresetOrderSlot {
  const source = requireObject(raw, `prompt_order[${orderIndex}].order[${slotIndex}]`);
  if (typeof source.enabled !== 'boolean') {
    throw new Error(`ST V2 prompt_order[${orderIndex}].order[${slotIndex}].enabled 必须是布尔值`);
  }
  return {
    ...source,
    identifier: requireText(source.identifier, `prompt_order[${orderIndex}].order[${slotIndex}].identifier`),
    enabled: source.enabled,
  } as STPresetOrderSlot;
}

function parseOrder(raw: unknown, index: number): STPresetOrder {
  const source = requireObject(raw, `prompt_order[${index}]`);
  if (!Array.isArray(source.order) || source.order.length === 0) {
    throw new Error(`ST V2 prompt_order[${index}].order 不能为空`);
  }
  return {
    ...source,
    character_id: requireNumber(source.character_id, `prompt_order[${index}].character_id`),
    order: source.order.map((slot, slotIndex) => parseOrderSlot(slot, index, slotIndex)),
  } as STPresetOrder;
}

export function normalizeSTPreset(raw: unknown): STPreset {
  const source = requireObject(raw, '预设');
  if (!Array.isArray(source.prompts) || source.prompts.length === 0) {
    throw new Error('ST V2 prompts 不能为空');
  }
  if (!Array.isArray(source.prompt_order) || source.prompt_order.length === 0) {
    throw new Error('ST V2 prompt_order 不能为空');
  }
  const prompts = source.prompts.map(parsePrompt);
  const promptIds = new Set<string>();
  for (const prompt of prompts) {
    if (promptIds.has(prompt.identifier)) throw new Error(`ST V2 prompts identifier 重复：${prompt.identifier}`);
    promptIds.add(prompt.identifier);
  }
  const promptOrder = source.prompt_order.map(parseOrder);
  const characterIds = new Set<number>();
  for (const order of promptOrder) {
    if (characterIds.has(order.character_id)) throw new Error(`ST V2 character_id 重复：${order.character_id}`);
    characterIds.add(order.character_id);
    for (const slot of order.order) {
      if (!promptIds.has(slot.identifier)) {
        throw new Error(`ST V2 prompt_order 引用了不存在的提示词：${slot.identifier}`);
      }
    }
  }
  return {
    ...source,
    prompts,
    prompt_order: promptOrder,
  } as STPreset;
}

export function getCurrentSTPresetV2(
  settings: { stPresetsV2?: STPresetEntryV2[]; currentStPresetIdV2?: string | null },
  builtinPresets: STPresetEntryV2[],
): STPresetEntryV2 | null {
  const id = settings.currentStPresetIdV2?.trim();
  if (!id) return null;
  const preset = [...builtinPresets, ...(settings.stPresetsV2 ?? [])].find((entry) => entry.id === id);
  if (!preset) throw new Error(`已选择的酒馆预设不存在：${id}`);
  return { ...preset, preset: normalizeSTPreset(preset.preset) };
}
