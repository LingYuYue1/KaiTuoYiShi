import type { 游戏设置 } from '@/models/settings';
import type { STPresetEntry, STPresetEntryV2, STPresetPrompt, STWorldInfoEntry } from '@/models/stTypes';

export interface STPresetMigrationResult {
  settings: 游戏设置;
  migratedCount: number;
  skippedCount: number;
  idMap: Record<string, string>;
}

function stripSTImportPrefix(id: string): string {
  return id.replace(/^st_import_/, '').replace(/_\d{10,}$/, '') || id;
}

function migrateWorldbookEntries(entry: STPresetEntry): STWorldInfoEntry[] | undefined {
  const worldbookEntries = Array.isArray(entry.worldbookEntries) ? entry.worldbookEntries : [];
  const migrated = worldbookEntries
    .filter((item) => item && typeof item.content === 'string' && item.content.trim())
    .map((item, index): STWorldInfoEntry => ({
      uid: index + 1,
      comment: item.title,
      content: item.content,
      key: Array.isArray(item.keywords) ? item.keywords : [],
      keysecondary: Array.isArray(item.keySecondary) ? item.keySecondary : [],
      constant: item.injectMode === 'always',
      vectorized: false,
      selective: Array.isArray(item.keySecondary) && item.keySecondary.length > 0,
      enabled: item.enabled !== false,
      order: typeof item.priority === 'number' ? item.priority : index + 1,
      probability: typeof item.probability === 'number' ? item.probability : 100,
      depth: typeof item.depth === 'number' ? item.depth : 0,
      position: item.injectAtDepth ? 4 : 0,
      disable: [],
      addMemo: false,
      displayIndex: index,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      logic: 0,
      useGroup: false,
    }));
  return migrated.length > 0 ? migrated : undefined;
}

function migrateV1PresetToV2(entry: STPresetEntry): STPresetEntryV2 | null {
  const modules = Array.isArray(entry.modules) ? entry.modules : [];
  const prompts: STPresetPrompt[] = modules
    .filter((module) => typeof module.content === 'string' && module.content.trim())
    .map((module, index) => ({
      identifier: stripSTImportPrefix(module.id) || `prompt_${index + 1}`,
      name: module.title,
      role: module.role === 'user' || module.role === 'assistant' ? module.role : 'system',
      content: module.content,
      injection_position: module.injectionPosition,
      injection_depth: module.injectionDepth,
      injection_order: module.injectionOrder,
    }));
  if (prompts.length === 0) return null;
  const worldInfo = migrateWorldbookEntries(entry);
  return {
    id: `${entry.id}_v2`,
    name: `${entry.name} · V2迁移副本`,
    preset: {
      prompts,
      prompt_order: [{
        character_id: 100001,
        order: prompts.map((prompt) => ({ identifier: prompt.identifier, enabled: true })),
      }],
      ...(worldInfo ? { world_info: worldInfo } : {}),
      ...(entry.assistantPrefill ? { assistant_prefill: entry.assistantPrefill } : {}),
      ...(entry.samplingParams?.temperature !== undefined ? { temperature: entry.samplingParams.temperature } : {}),
      ...(entry.samplingParams?.topP !== undefined ? { top_p: entry.samplingParams.topP } : {}),
      ...(entry.samplingParams?.topK !== undefined ? { top_k: entry.samplingParams.topK } : {}),
      ...(entry.samplingParams?.maxTokens !== undefined ? { max_tokens: entry.samplingParams.maxTokens } : {}),
      ...(entry.samplingParams?.frequencyPenalty !== undefined ? { frequency_penalty: entry.samplingParams.frequencyPenalty } : {}),
      ...(entry.samplingParams?.presencePenalty !== undefined ? { presence_penalty: entry.samplingParams.presencePenalty } : {}),
    },
    characterId: 100001,
    importedAt: entry.importedAt,
    updatedAt: Date.now(),
    isBuiltin: entry.isBuiltin,
    migratedFromV1: true,
  };
}

export function migrateSTPresetsV1ToV2(settings: 游戏设置): STPresetMigrationResult {
  const existingV2 = settings.stPresetsV2 ?? [];
  const existingIds = new Set(existingV2.map((entry) => entry.id));
  const migrated: STPresetEntryV2[] = [];
  const idMap: Record<string, string> = {};
  let skippedCount = 0;

  for (const entry of settings.stPresets ?? []) {
    const next = migrateV1PresetToV2(entry);
    if (!next || existingIds.has(next.id)) {
      skippedCount += 1;
      if (next && existingIds.has(next.id)) idMap[entry.id] = next.id;
      continue;
    }
    existingIds.add(next.id);
    idMap[entry.id] = next.id;
    migrated.push(next);
  }

  return {
    settings: {
      ...settings,
      stPresetsV2: [...existingV2, ...migrated],
      currentStPresetIdV2: settings.currentStPresetIdV2 ?? null,
      currentStCharacterId: settings.currentStCharacterId ?? null,
    },
    migratedCount: migrated.length,
    skippedCount,
    idMap,
  };
}
