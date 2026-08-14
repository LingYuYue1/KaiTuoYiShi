import { useMemo, useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import type { STPresetEntryV2, STRegexScript, STWorldInfoEntry } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/contracts/ai';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { detectTavernMacroInfo } from '@/utils/tavernMacroDetect';
import {
  DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE,
  getPresetRegexFindText,
  getPresetRegexKindLabel,
  getPresetRegexReplaceText,
  getPresetRegexTitle,
  getPresetWorldInfoEntries,
  getPresetWorldInfoViewEntries,
  getPresetWorldInfoTitle,
  isPresetWorldInfoConstant,
  isPresetWorldInfoEnabled,
  readPresetWorldInfoKeys,
  readPresetWorldInfoText,
} from '@/utils/tavernPresetParsing';
import {
  deleteV2Preset as computeV2PresetDelete,
  patchPresetOrderSlot,
  patchPresetPrompt,
  patchPresetWorldInfoEntry,
  patchV2Preset as computeV2PresetPatch,
} from '@/utils/tavernPresetTransitions';
import { exportV2Preset, importSTPreset as importSTPresetFromFile } from '@/services/tavernPresetIO';

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

const TAVERN_RUNTIME_SLOT_IDS = new Set([
  'worldInfoBefore',
  'worldInfoAfter',
  'chatHistory',
  'personaDescription',
  'userInput',
  'user_input',
  'latestUserInput',
  'input',
]);

interface TavernPresetsTabProps {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  worldbooks: 世界书[];
  onWorldbooksChange: (books: 世界书[]) => void;
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
  onAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
  onDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
}

function TogglePill({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className="inline-flex items-center gap-2 text-xs transition-all disabled:cursor-not-allowed"
      style={{ color: checked ? 'rgba(var(--tj-ui-nsfw), 0.92)' : 'rgba(var(--tj-text-secondary), 0.58)' }}
    >
      {label && <span>{label}</span>}
      <span
        className="relative inline-flex h-5 w-9 items-center"
        style={{
          background: checked ? 'rgba(var(--tj-ui-nsfw), 0.2)' : 'rgba(var(--tj-bg-primary), 0.42)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(var(--tj-ui-nsfw), 0.42)' : 'rgba(var(--tj-text-secondary), 0.18)'}`,
          clipPath: smallClip,
          opacity: disabled ? 0.62 : 1,
        }}
      >
        <span
          className="absolute top-1 h-3 w-3 transition-all"
          style={{
            left: checked ? 'calc(100% - 1rem)' : '0.25rem',
            background: checked ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.66)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        />
      </span>
    </button>
  );
}

export function TavernPresetsTab({ settings, onChange, worldbooks, onWorldbooksChange, onExtractTavernRegexScripts, onAnalyzeTavernRegexScript, onDryRunTavernRegexScript }: TavernPresetsTabProps) {
  const currentV2Preset = useMemo(() => {
    const id = settings.currentStPresetIdV2 ?? null;
    return [...getBuiltinPresetsV2(), ...(settings.stPresetsV2 ?? [])].find((p) => p.id === id) ?? null;
  }, [settings.currentStPresetIdV2, settings.stPresetsV2]);
  const allPresetsV2 = useMemo<STPresetEntryV2[]>(
    () => [...getBuiltinPresetsV2(), ...(settings.stPresetsV2 ?? [])],
    [settings.stPresetsV2],
  );

  const importSTPreset = () => {
    importSTPresetFromFile({
      settings,
      worldbooks,
      onWorldbooksChange,
      onChange,
      onExtractTavernRegexScripts,
    });
  };

  const switchPresetV2 = (presetId: string | null) => {
    const target = presetId ? allPresetsV2.find((p) => p.id === presetId) : null;
    onChange({
      ...settings,
      currentStPresetIdV2: target?.id ?? null,
      currentStCharacterId: target?.characterId ?? target?.preset.prompt_order[0]?.character_id ?? null,
    });
  };

  const setV2CharacterId = (characterId: number | null) => {
    onChange({ ...settings, currentStCharacterId: characterId });
  };

  const patchV2RuntimeSettings = (partial: Pick<游戏设置, 'stPostProcessMode'>) => {
    onChange({ ...settings, ...partial });
  };

  const patchV2Preset = (presetId: string, preset: STPresetEntryV2['preset']) => {
    const result = computeV2PresetPatch(
      settings.stPresetsV2 ?? [],
      allPresetsV2,
      presetId,
      preset,
      Date.now(),
      settings.currentStCharacterId,
    );
    onChange({
      ...settings,
      stPresetsV2: result.nextPresets,
      ...(result.currentStPresetIdV2 !== undefined ? { currentStPresetIdV2: result.currentStPresetIdV2 } : {}),
      ...(result.currentStCharacterId !== undefined ? { currentStCharacterId: result.currentStCharacterId } : {}),
    });
  };

  const deletePresetV2 = (presetId: string) => {
    const target = (settings.stPresetsV2 ?? []).find((entry) => entry.id === presetId);
    if (!target || target.isBuiltin) return;
    if (!confirm(`确定删除酒馆预设「${target.name}」？\n该操作只会删除玩家导入的预设，不会影响内置预设和原生提示词模块。`)) return;

    const result = computeV2PresetDelete(
      settings.stPresetsV2 ?? [],
      presetId,
      settings.currentStPresetIdV2,
      settings.currentStCharacterId,
    );
    onChange({
      ...settings,
      stPresetsV2: result.nextPresets,
      currentStPresetIdV2: result.currentStPresetIdV2,
      currentStCharacterId: result.currentStCharacterId,
    });
  };

  const currentV2Order =
    currentV2Preset?.preset.prompt_order.find((item) => item.character_id === (settings.currentStCharacterId ?? currentV2Preset.characterId ?? null)) ??
    currentV2Preset?.preset.prompt_order.find((item) => item.character_id === 100001) ??
    currentV2Preset?.preset.prompt_order[0];
  const currentV2EnabledSlots = currentV2Order?.order.filter((slot) => slot.enabled).length ?? 0;
  const tavernV2Ready = (settings.enableStPreset ?? true) && Boolean(currentV2Preset && currentV2Order);

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto pr-1" style={{ minHeight: 0 }}>
      <div
        className="flex flex-col gap-3 p-3"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.35)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
          clipPath: smallClip,
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div
              className="font-serif text-base font-bold tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-ui-nsfw), 0.95)' }}
            >
              酒馆预设
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
              ST / Tavern 预设导入与酒馆消息链集中在这里；提示词模块页只保留开拓轶事原生底座。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ ...settings, enableStPreset: !(settings.enableStPreset ?? true) })}
              title={settings.enableStPreset === false ? '当前酒馆预设已关闭：预设库数据保留，但不参与主剧情发送' : '当前酒馆预设已开启：当前酒馆预设可参与主剧情发送'}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-serif tracking-wider transition-all hover:opacity-90"
              style={{
                background: (settings.enableStPreset ?? true)
                  ? 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.22), rgba(var(--tj-ui-nsfw), 0.1))'
                  : 'rgba(var(--tj-bg-secondary), 0.5)',
                color: (settings.enableStPreset ?? true)
                  ? 'rgba(var(--tj-ui-nsfw), 0.98)'
                  : 'rgba(var(--tj-text-secondary), 0.7)',
                boxShadow: (settings.enableStPreset ?? true)
                  ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.45)'
                  : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.2)',
                clipPath: smallClip,
                cursor: 'pointer',
              }}
            >
              <span
                role="switch"
                aria-checked={settings.enableStPreset ?? true}
                className="relative inline-flex h-4 w-7 flex-shrink-0 items-center transition-all"
                style={{
                  background: (settings.enableStPreset ?? true)
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
                    : 'rgba(var(--tj-bg-secondary), 0.68)',
                  boxShadow: (settings.enableStPreset ?? true)
                    ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                  clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                }}
              >
                <span
                  className="absolute top-0.5 h-3 w-3 transition-transform"
                  style={{
                    left: (settings.enableStPreset ?? true) ? 'calc(100% - 0.875rem)' : '0.125rem',
                    background: (settings.enableStPreset ?? true) ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
                    clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
                  }}
                />
              </span>
              <span>启用酒馆预设</span>
            </button>
            <button
              onClick={importSTPreset}
              className="px-3.5 py-1.5 text-sm font-serif tracking-wider transition-all hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.18), rgba(var(--tj-ui-nsfw), 0.08))',
                color: 'rgba(var(--tj-ui-nsfw), 0.95)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.35)',
                clipPath: smallClip,
              }}
              title="导入 SillyTavern 预设文件"
            >
              导入酒馆预设
            </button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {[
            {
              label: '总开关',
              value: (settings.enableStPreset ?? true) ? '已开启' : '已关闭',
              detail: (settings.enableStPreset ?? true) ? '酒馆预设可参与主剧情' : '预设保留，但发送时不注入',
              active: settings.enableStPreset ?? true,
            },
            {
              label: '酒馆预设',
              value: currentV2Preset ? currentV2Preset.name : '未选择',
              detail: currentV2Preset ? `${currentV2Preset.preset.prompts.length} 内容项 / ${currentV2Order?.order.length ?? 0} 顺序项` : '主剧情走原生流程',
              active: Boolean(currentV2Preset),
            },
            {
              label: '发送路径',
              value: tavernV2Ready ? '酒馆消息链' : '原生主流程',
              detail: tavernV2Ready ? `${currentV2EnabledSlots} 条启用，失败自动 fallback` : '酒馆预设未满足生效条件',
              active: tavernV2Ready,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 px-3 py-2.5"
              style={{
                background: item.active ? 'rgba(var(--tj-ui-nsfw), 0.08)' : 'rgba(var(--tj-bg-primary), 0.32)',
                boxShadow: `inset 0 0 0 1px ${item.active ? 'rgba(var(--tj-ui-nsfw), 0.26)' : 'rgba(var(--tj-accent-primary), 0.12)'}`,
                clipPath: smallClip,
              }}
            >
              <div className="text-[11px] font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                {item.label}
              </div>
              <div className="mt-1 truncate text-base font-semibold" style={{ color: item.active ? 'rgba(var(--tj-ui-nsfw), 0.96)' : 'rgb(var(--tj-text-primary))' }}>
                {item.value}
              </div>
              <div className="mt-0.5 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
                {item.detail}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-3">
            <V2PresetSwitcher
              presets={allPresetsV2}
              currentId={settings.currentStPresetIdV2 ?? null}
              currentCharacterId={settings.currentStCharacterId ?? null}
              postProcessMode={settings.stPostProcessMode ?? '未选择'}
              enabled={settings.enableStPreset ?? true}
              onSwitch={switchPresetV2}
              onCharacterChange={setV2CharacterId}
              onRuntimeChange={patchV2RuntimeSettings}
              onPresetChange={patchV2Preset}
              onExport={exportV2Preset}
              onDelete={deletePresetV2}
              onExtractTavernRegexScripts={onExtractTavernRegexScripts}
              onAnalyzeTavernRegexScript={onAnalyzeTavernRegexScript}
              onDryRunTavernRegexScript={onDryRunTavernRegexScript}
            />
          </div>
          <div
            className="min-w-0 p-4 text-sm leading-7"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.32)',
              color: 'rgba(var(--tj-text-secondary), 0.74)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-base tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
              运行诊断
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div className="px-2 py-1.5" style={{ background: 'rgba(var(--tj-bg-secondary), 0.28)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)', clipPath: smallClip }}>
                <div className="text-xs font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>原始结构</div>
                <div className="mt-1 leading-5">酒馆预设保持 `prompts + prompt_order` 原结构，不再转译成提示词模块。</div>
              </div>
              <div className="px-2 py-1.5" style={{ background: 'rgba(var(--tj-bg-secondary), 0.28)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)', clipPath: smallClip }}>
                <div className="text-xs font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>消息链</div>
                <div className="mt-1 leading-5">只有总开关开启且选中有效预设时，主剧情才会尝试使用酒馆消息链。</div>
              </div>
            </div>
            <div className="mt-3 grid gap-1.5 text-xs">
              <div style={{ color: tavernV2Ready ? 'rgba(var(--tj-ui-nsfw), 0.88)' : 'rgba(var(--tj-text-secondary), 0.68)' }}>
                当前路径：{tavernV2Ready ? '本回合会尝试酒馆消息链，构建失败会自动 fallback。' : '当前仍走原生主流程。'}
              </div>
              <div>
                运行时槽位：`worldInfo*`、`chatHistory`、`userInput` 等由项目上下文注入，不一定有 prompt 正文。
              </div>
              <div>
                原生 CoT、回复格式、变量协议、行动选项、天气和独立系统提示词不在这里编辑。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ST 预设切换器：下拉选当前预设 + 重命名按钮 + 删除按钮。 */
function V2PresetSwitcher({
  presets,
  currentId,
  currentCharacterId,
  postProcessMode,
  enabled,
  onSwitch,
  onCharacterChange,
  onRuntimeChange,
  onPresetChange,
  onExport,
  onDelete,
  onExtractTavernRegexScripts,
  onAnalyzeTavernRegexScript,
  onDryRunTavernRegexScript,
}: {
  presets: STPresetEntryV2[];
  currentId: string | null;
  currentCharacterId: number | null;
  postProcessMode: NonNullable<游戏设置['stPostProcessMode']>;
  enabled: boolean;
  onSwitch: (presetId: string | null) => void;
  onCharacterChange: (characterId: number | null) => void;
  onRuntimeChange: (partial: Pick<游戏设置, 'stPostProcessMode'>) => void;
  onPresetChange: (presetId: string, preset: STPresetEntryV2['preset']) => void;
  onExport: (preset: STPresetEntryV2) => void;
  onDelete: (presetId: string) => void;
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
  onAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
  onDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
}) {
  const current = presets.find((p) => p.id === currentId) ?? null;
  const characterIds = current?.preset.prompt_order.map((item) => item.character_id) ?? [];
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<'all' | 'enabled' | 'disabled' | 'runtime' | 'missing' | 'macro'>('all');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiReviewText, setAiReviewText] = useState('');
  const [selectedRegexIndex, setSelectedRegexIndex] = useState(0);
  const [regexDryRunSample, setRegexDryRunSample] = useState(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE);
  const selectedCharacterId = currentCharacterId ?? current?.characterId ?? current?.preset.prompt_order[0]?.character_id ?? null;
  const selectedOrder = current
    ? current.preset.prompt_order.find((item) => item.character_id === selectedCharacterId) ??
      current.preset.prompt_order.find((item) => item.character_id === 100001) ??
      current.preset.prompt_order[0]
    : undefined;
  const selectedSlot = selectedOrder?.order.find((slot) => slot.identifier === selectedSlotId) ?? selectedOrder?.order.at(0);
  const promptMap = new Map(current?.preset.prompts.map((prompt) => [prompt.identifier, prompt]) ?? []);
  const selectedPrompt = selectedSlot ? promptMap.get(selectedSlot.identifier) : undefined;
  const canEdit = Boolean(current && !current.isBuiltin);
  const canToggleOrderSlot = Boolean(current);
  const orderSlots = selectedOrder?.order ?? [];
  const slotViewModels = orderSlots.map((slot, index) => {
    const prompt = promptMap.get(slot.identifier);
    const content = prompt?.content ?? '';
    const macro = detectTavernMacroInfo(content);
    const isRuntime = TAVERN_RUNTIME_SLOT_IDS.has(slot.identifier);
    const isMissing = !isRuntime && !prompt;
    return { slot, index, prompt, content, macro, isRuntime, isMissing };
  });
  const shownOrderSlots = slotViewModels.filter((item) => {
    if (slotFilter === 'enabled') return item.slot.enabled;
    if (slotFilter === 'disabled') return !item.slot.enabled;
    if (slotFilter === 'runtime') return item.isRuntime;
    if (slotFilter === 'missing') return item.isMissing;
    if (slotFilter === 'macro') return item.macro.level !== 'none';
    return true;
  });
  const enabledSlotCount = orderSlots.filter((slot) => slot.enabled).length;
  const runtimeSlotCount = slotViewModels.filter((item) => item.isRuntime).length;
  const unmatchedSlotCount = slotViewModels.filter((item) => item.isMissing).length;
  const macroSlotCount = slotViewModels.filter((item) => item.macro.level !== 'none').length;
  const advancedMacroSlotCount = slotViewModels.filter((item) => item.macro.level === 'advanced').length;
  const disabledRuntimeCount = slotViewModels.filter((item) => item.isRuntime && !item.slot.enabled).length;
  const duplicateIds = Array.from(new Set(orderSlots.map((slot) => slot.identifier).filter((id, index, arr) => arr.indexOf(id) !== index)));
  const worldInfoEntries = getPresetWorldInfoEntries(current?.preset.world_info);
  const worldInfoViewEntries = getPresetWorldInfoViewEntries(current?.preset.world_info);
  const enabledWorldInfoCount = worldInfoEntries.filter(isPresetWorldInfoEnabled).length;
  const constantWorldInfoCount = worldInfoEntries.filter((entry) => isPresetWorldInfoEnabled(entry) && isPresetWorldInfoConstant(entry)).length;
  const regexScripts = onExtractTavernRegexScripts(current?.preset);
  const regexScriptSafety = regexScripts.map(onAnalyzeTavernRegexScript);
  const enabledRegexScriptCount = regexScriptSafety.filter((item) => !item.disabled).length;
  const riskyRegexScriptCount = regexScriptSafety.filter((item) => item.risky).length;
  const enabledRiskyRegexScriptCount = regexScriptSafety.filter((item) => !item.disabled && item.risky).length;
  const blockedRegexScriptCount = regexScriptSafety.filter((item) => item.kind === 'blocked').length;
  const effectiveRegexIndex = regexScripts.length > 0 ? Math.min(selectedRegexIndex, regexScripts.length - 1) : 0;
  const selectedRegexScript = regexScripts.at(effectiveRegexIndex);
  const selectedRegexSafety = selectedRegexScript ? regexScriptSafety[effectiveRegexIndex] : null;
  const selectedRegexDryRun = selectedRegexScript ? onDryRunTavernRegexScript(selectedRegexScript, regexDryRunSample) : null;
  const scanIssues = [
    unmatchedSlotCount > 0 ? `${unmatchedSlotCount} 个顺序项没有匹配内容` : '',
    disabledRuntimeCount > 0 ? `${disabledRuntimeCount} 个运行时槽位被关闭` : '',
    duplicateIds.length > 0 ? `${duplicateIds.length} 个重复 identifier` : '',
    advancedMacroSlotCount > 0 ? `${advancedMacroSlotCount} 个条目含高级宏` : '',
    enabledWorldInfoCount > 80 ? `${enabledWorldInfoCount} 个 world_info 已启用，可能挤占上下文` : '',
    constantWorldInfoCount > 20 ? `${constantWorldInfoCount} 个 world_info 常驻条目，建议确认是否必要` : '',
    regexScripts.length > 0 ? `${regexScripts.length} 个 regex_scripts 已保留；安全输出清理类会在主剧情后处理执行` : '',
    enabledRiskyRegexScriptCount > 0 ? `${enabledRiskyRegexScriptCount} 个高风险 regex_scripts 处于启用状态（仍不会执行）` : '',
  ].filter(Boolean);

  const patchCurrentPreset = (nextPreset: STPresetEntryV2['preset']) => {
    if (!current) return;
    onPresetChange(current.id, nextPreset);
  };

  const patchOrderSlot = (identifier: string, partial: Partial<NonNullable<typeof selectedSlot>>) => {
    if (!current || !selectedOrder) return;
    patchCurrentPreset(patchPresetOrderSlot(current.preset, selectedOrder.character_id, identifier, partial));
  };

  const patchSelectedSlot = (partial: Partial<NonNullable<typeof selectedSlot>>) => {
    if (!selectedSlot) return;
    patchOrderSlot(selectedSlot.identifier, partial);
  };

  const patchSelectedPrompt = (partial: Partial<NonNullable<typeof selectedPrompt>>) => {
    if (!current || !selectedPrompt || current.isBuiltin) return;
    patchCurrentPreset(patchPresetPrompt(current.preset, selectedPrompt.identifier, partial));
  };

  const patchWorldInfoEntry = (entryKey: string, partial: Partial<STWorldInfoEntry>) => {
    if (!current || current.isBuiltin) return;
    patchCurrentPreset(patchPresetWorldInfoEntry(current.preset, entryKey, partial));
  };

  const buildLocalReviewText = () => {
    const selectedName = current?.name ?? '未选择';
    const lines = [
      `预设：${selectedName}`,
      `内容项：${current?.preset.prompts.length ?? 0}`,
      `顺序项：${orderSlots.length}`,
      `启用项：${enabledSlotCount}`,
      `运行时槽位：${runtimeSlotCount}`,
      `未匹配：${unmatchedSlotCount}`,
      `宏条目：${macroSlotCount}（高级宏 ${advancedMacroSlotCount}）`,
      `世界书：${worldInfoEntries.length}（启用 ${enabledWorldInfoCount}，常驻 ${constantWorldInfoCount}）`,
      `正则脚本：${regexScripts.length}（未禁用 ${enabledRegexScriptCount}，高风险 ${riskyRegexScriptCount}）`,
      `后处理：${postProcessMode}`,
      '',
      '本地扫描：',
      ...(scanIssues.length > 0 ? scanIssues.map((item) => `- ${item}`) : ['- 暂未发现结构性问题']),
      '',
      '建议：',
      disabledRuntimeCount > 0 ? '- 建议重新启用 chatHistory / userInput / worldInfo* 等运行时槽位。' : '- 运行时槽位状态正常。',
      unmatchedSlotCount > 0 ? '- 未匹配项不会注入正文，建议确认是否为预设占位符。' : '- prompt_order 引用基本完整。',
      advancedMacroSlotCount > 0 ? '- 高级宏集中条目不要轻易关闭，建议逐条查看右侧宏检测。' : '- 未发现高级宏集中风险。',
      enabledWorldInfoCount > 0 ? '- world_info 会按关键词命中后进入主剧情酒馆消息链，不影响独立系统。' : '- 未检测到附带 world_info。',
      regexScripts.length > 0 ? '- regex_scripts 仅放开安全输出清理类；HTML 注释、抗截断/抗空回占位等会在主剧情后处理清理，高风险脚本仍只展示和干跑。' : '- 未检测到附带 regex_scripts。',
      '- 我们会在消息链末尾保留格式保护和行动选项兜底，降低正文格式被预设破坏的风险。',
    ];
    return lines.join('\n');
  };

  const runLocalReview = () => {
    if (!current) return;
    const localReport = buildLocalReviewText();
    setAiReviewOpen(true);
    setAiReviewText(`${localReport}\n\n说明：当前版本已移除外部 AI 审查，只保留本地结构扫描。后续可加入由项目内置规则维护的审查模型。`);
  };
  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1.5"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-base font-serif tracking-[0.14em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.92)' }}
        >
          酒馆预设
        </span>
        <TogglePill checked={enabled} disabled onChange={() => undefined} label={enabled ? '总开关已启用' : '总开关关闭'} />
        <span className="ml-auto text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          {canEdit ? '导入预设可编辑' : '内置正文只读 · 条目可配置'}
        </span>
      </div>
      <div className="grid gap-2 xl:grid-cols-[minmax(220px,1.3fr)_minmax(140px,0.7fr)_minmax(140px,0.7fr)_auto_auto]">
        <select
          value={currentId ?? ''}
          onChange={(e) => onSwitch(e.target.value || null)}
          className="min-w-0 px-3 py-2 text-sm"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.6)',
            color: 'rgb(var(--tj-text-primary))',
            border: '1px solid rgba(var(--tj-accent-primary), 0.3)',
            borderRadius: '2px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">不使用酒馆消息链</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.preset.prompts.length} 项
            </option>
          ))}
        </select>
        {current && (
          <>
            <select
              value={currentCharacterId ?? current.characterId ?? current.preset.prompt_order.at(0)?.character_id ?? ''}
              onChange={(e) => onCharacterChange(e.target.value ? Number(e.target.value) : null)}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.55)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                borderRadius: '2px',
                outline: 'none',
              }}
            >
              {characterIds.map((id) => (
                <option key={id} value={id}>
                  顺序槽位 {id}
                </option>
              ))}
            </select>
            <select
              value={postProcessMode}
              onChange={(e) => onRuntimeChange({ stPostProcessMode: e.target.value as NonNullable<游戏设置['stPostProcessMode']> })}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.55)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                borderRadius: '2px',
                outline: 'none',
              }}
            >
              {(['未选择', '单一用户', '严格', '半严格'] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onExport(current)}
              className="px-3 py-2 text-xs transition-all hover:opacity-85"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.52)',
                color: 'rgba(var(--tj-text-primary), 0.82)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                clipPath: smallClip,
              }}
            >
              导出
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(current.id)}
                className="px-3 py-2 text-xs transition-all hover:opacity-85"
                style={{
                  background: 'rgba(var(--tj-danger), 0.08)',
                  color: 'rgba(var(--tj-danger), 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.24)',
                  clipPath: smallClip,
                }}
              >
                删除
              </button>
            )}
            <button
              type="button"
              onClick={runLocalReview}
              className="px-3 py-2 text-xs transition-all hover:opacity-85"
              style={{
                background: 'rgba(var(--tj-ui-nsfw), 0.12)',
                color: 'rgba(var(--tj-ui-nsfw), 0.95)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.28)',
                clipPath: smallClip,
              }}
            >
              本地审查
            </button>
          </>
        )}
      </div>
      {current && (
        <>
          <div
            className="px-3 py-2 text-xs leading-6"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.32)',
              color: 'rgba(var(--tj-text-secondary), 0.68)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            {'{{char}}'} 已由项目内置兼容层接管：会被理解为当前剧情中的主要互动对象、出场 NPC 与 AI 负责扮演的角色集合，无需玩家手动填写。
          </div>
          <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
            酒馆预设只影响主剧情消息链；独立系统和内置模块保持原路径。
          </div>
          <div
            className="grid h-[min(68vh,760px)] min-h-[520px] gap-3 overflow-hidden px-3 py-2.5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.28)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
              clipPath: smallClip,
            }}
          >
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  顺序项
                </span>
                <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  启用 {enabledSlotCount}/{orderSlots.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
              {([
                ['all', '全部'],
                ['enabled', '启用'],
                ['disabled', '关闭'],
                ['runtime', '运行时'],
                ['missing', '未匹配'],
                ['macro', '含宏'],
              ] as const).map(([key, label]) => {
                const active = slotFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSlotFilter(key)}
                    className="px-2 py-1 text-xs transition-all"
                    style={{
                      color: active ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.62)',
                      background: active ? 'rgba(var(--tj-ui-nsfw), 0.12)' : 'rgba(var(--tj-bg-primary), 0.35)',
                      boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.3)' : 'rgba(var(--tj-accent-primary), 0.12)'}`,
                      clipPath: smallClip,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
              <div style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>运行时 {runtimeSlotCount}</div>
              <div style={{ color: unmatchedSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
                未匹配 {unmatchedSlotCount}
              </div>
              <div style={{ color: macroSlotCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>宏 {macroSlotCount}</div>
              <div style={{ color: advancedMacroSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>高级 {advancedMacroSlotCount}</div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {shownOrderSlots.map(({ slot, index, prompt, content, macro, isRuntime, isMissing }) => {
                const active = selectedSlot?.identifier === slot.identifier;
                const contentPreview = content.replace(/\s+/g, ' ').trim().slice(0, 80);
                return (
                  <div
                    key={`${slot.identifier}_${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSlotId(slot.identifier)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSlotId(slot.identifier);
                      }
                    }}
                    className="grid cursor-pointer items-start gap-2 px-3 py-2 text-left text-sm transition-all"
                    style={{
                      gridTemplateColumns: '2.25rem minmax(0, 1fr) auto',
                      background: active ? 'rgba(var(--tj-accent-primary), 0.12)' : 'transparent',
                      color: !slot.enabled ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-text-primary), 0.82)',
                      clipPath: smallClip,
                    }}
                  >
                    <span style={{ color: !slot.enabled ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
                      #{index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate" title={prompt?.name || slot.identifier}>
                        {prompt?.name || slot.identifier}
                      </span>
                      <span className="mt-1 block truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }} title={slot.identifier}>
                        {slot.identifier}
                      </span>
                      {contentPreview && (
                        <span className="mt-1 block truncate text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.48)' }} title={contentPreview}>
                          {contentPreview}
                        </span>
                      )}
                      {macro.level !== 'none' && (
                        <span className="mt-1 inline-flex px-1.5 py-0.5 text-xs" style={{
                          color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.78)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                          clipPath: smallClip,
                        }}>
                          {macro.level === 'advanced' ? '高级宏' : '基础宏'}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1 text-xs">
                      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                        {isRuntime ? 'runtime' : (isMissing ? 'missing' : (prompt?.role ?? 'system'))}
                      </span>
                      <TogglePill checked={slot.enabled} disabled={!canToggleOrderSlot} onChange={(next) => patchOrderSlot(slot.identifier, { enabled: next })} />
                    </span>
                  </div>
                );
              })}
              {shownOrderSlots.length === 0 && (
                <div className="px-3 py-3 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  当前筛选下没有顺序项。
                </div>
              )}
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  详细预览
                </span>
                {selectedSlot && (
                  <TogglePill
                    checked={selectedSlot.enabled}
                    disabled={!canToggleOrderSlot}
                    onChange={(next) => patchSelectedSlot({ enabled: next })}
                    label={!selectedSlot.enabled ? '已关闭' : '已启用'}
                  />
                )}
              </div>
            {selectedSlot ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {selectedPrompt ? (
                  <>
                    <input
                      value={selectedPrompt.name ?? ''}
                      readOnly={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ name: e.target.value })}
                      className="min-w-0 px-3 py-2 text-sm"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                        opacity: canEdit ? 1 : 0.72,
                      }}
                    />
                    <select
                      value={selectedPrompt.role}
                      disabled={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ role: e.target.value as typeof selectedPrompt.role })}
                      className="min-w-0 px-3 py-2 text-sm"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                      }}
                    >
                      <option value="system">system</option>
                      <option value="user">user</option>
                      <option value="assistant">assistant</option>
                    </select>
                    <textarea
                      value={selectedPrompt.content}
                      readOnly={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ content: e.target.value })}
                      className="min-h-[280px] resize-y px-3 py-2 font-mono text-sm leading-6"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                        opacity: canEdit ? 1 : 0.72,
                      }}
                    />
                    <MacroInspector content={selectedPrompt.content} />
                  </>
                ) : (
                  <div className="text-sm leading-7" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                    {TAVERN_RUNTIME_SLOT_IDS.has(selectedSlot.identifier)
                      ? '运行时槽位由项目上下文注入：聊天历史、世界书、角色描述或玩家输入会在发送时填充。'
                      : '该顺序项未匹配到 prompts 内容，可能是预设占位符。'}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
                从左侧选择一个顺序项查看正文和宏检测。
              </div>
            )}
            </div>
          </div>
          {worldInfoViewEntries.length > 0 && (
            <div
              className="px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.24)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  预设世界书
                </span>
                <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  启用 {enabledWorldInfoCount}/{worldInfoViewEntries.length} · 常驻 {constantWorldInfoCount}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="grid gap-2 md:grid-cols-2">
                  {worldInfoViewEntries.map(({ key, entry }, index) => {
                    const title = getPresetWorldInfoTitle(entry, index);
                    const primaryKeys = readPresetWorldInfoKeys(entry.key);
                    const secondaryKeys = readPresetWorldInfoKeys(entry.keysecondary);
                    const content = readPresetWorldInfoText(entry.content).replace(/\s+/g, ' ').trim();
                    const enabled = isPresetWorldInfoEnabled(entry);
                    const constant = isPresetWorldInfoConstant(entry);
                    const order = readPresetWorldInfoText(entry.order) || '100';
                    const probability = readPresetWorldInfoText(entry.probability) || '100';
                    return (
                      <div
                        key={key}
                        className="grid gap-2 px-3 py-2 text-xs leading-5"
                        style={{
                          background: enabled ? 'rgba(var(--tj-bg-secondary), 0.26)' : 'rgba(var(--tj-bg-primary), 0.18)',
                          color: enabled ? 'rgba(var(--tj-text-primary), 0.76)' : 'rgba(var(--tj-text-secondary), 0.45)',
                          boxShadow: `inset 0 0 0 1px ${enabled ? 'rgba(var(--tj-accent-primary), 0.13)' : 'rgba(var(--tj-text-secondary), 0.08)'}`,
                          clipPath: smallClip,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-serif text-sm tracking-[0.08em]" title={title}>
                              {title}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span style={{ color: constant ? 'rgba(var(--tj-ui-nsfw), 0.84)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
                                {constant ? '常驻' : '关键词'}
                              </span>
                              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>order {order}</span>
                              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>概率 {probability}%</span>
                            </div>
                          </div>
                          <TogglePill
                            checked={enabled}
                            disabled={!canEdit}
                            onChange={(next) => patchWorldInfoEntry(key, { enabled: next })}
                          />
                        </div>
                        <div className="grid gap-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                          <div className="truncate" title={primaryKeys.join(' / ') || '无主关键词'}>
                            主关键词：{primaryKeys.length > 0 ? primaryKeys.join(' / ') : '无'}
                          </div>
                          {secondaryKeys.length > 0 && (
                            <div className="truncate" title={secondaryKeys.join(' / ')}>
                              次关键词：{secondaryKeys.join(' / ')}
                            </div>
                          )}
                          <div className="line-clamp-2" title={content}>
                            {content || '无正文'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
                world_info 只在主剧情酒馆消息链中按关键词触发，不写入全局世界书，也不影响独立系统。
              </div>
            </div>
          )}
          <div
            data-tavern-regex-panel="true"
            className="px-3 py-2"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-bg-primary), 0.26), rgba(var(--tj-ui-nsfw), 0.045))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
              clipPath: smallClip,
            }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.88)' }}>
                  预设正则脚本
                </span>
                <span className="px-2 py-0.5 text-xs" style={{
                  color: 'rgba(var(--tj-text-secondary), 0.66)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                  clipPath: smallClip,
                }}>
                  仅审查 / 干跑
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
                <span>总数 {regexScripts.length}</span>
                <span>未禁用 {enabledRegexScriptCount}</span>
                <span style={{ color: riskyRegexScriptCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  高风险 {riskyRegexScriptCount}
                </span>
                <span style={{ color: blockedRegexScriptCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  阻断 {blockedRegexScriptCount}
                </span>
              </div>
            </div>
            {regexScripts.length === 0 ? (
              <div
                className="grid gap-2 px-3 py-4 text-sm leading-6"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.22)',
                  color: 'rgba(var(--tj-text-secondary), 0.66)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                  clipPath: smallClip,
                }}
              >
                <div className="font-serif tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-primary), 0.76)' }}>
                  当前预设没有附带 regex_scripts
                </div>
                <div>
                  如果导入的 ST 预设包含正则脚本，这里会显示脚本列表、风险类型、协议标签检查和干跑预览。主剧情只会执行安全输出清理类正则。
                </div>
              </div>
            ) : (
            <div
              className="grid min-h-[360px] gap-3 overflow-hidden lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]"
            >
                <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                  <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                    regex_scripts 会被保留并分析风险；安全输出清理类会在主剧情后处理执行，高风险脚本仍不会改写正文输出。
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                    {regexScripts.map((script, index) => {
                      const safety = regexScriptSafety[index];
                      const active = effectiveRegexIndex === index;
                      const title = getPresetRegexTitle(script, index);
                      const findPreview = getPresetRegexFindText(script).replace(/\s+/g, ' ').trim();
                      return (
                        <button
                          key={`${title}_${index}`}
                          type="button"
                          onClick={() => setSelectedRegexIndex(index)}
                          className="grid gap-2 px-3 py-2 text-left text-xs transition-all"
                          style={{
                            background: active ? 'rgba(var(--tj-ui-nsfw), 0.1)' : 'rgba(var(--tj-bg-primary), 0.18)',
                            color: safety.disabled ? 'rgba(var(--tj-text-secondary), 0.45)' : 'rgba(var(--tj-text-primary), 0.78)',
                            boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.28)' : 'rgba(var(--tj-accent-primary), 0.1)'}`,
                            clipPath: smallClip,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate font-serif text-sm tracking-[0.06em]" title={title}>
                              {title}
                            </span>
                            <span style={{ color: safety.disabled ? 'rgba(var(--tj-text-secondary), 0.52)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
                              {safety.disabled ? '禁用' : '未禁用'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-1.5 py-0.5" style={{
                              color: safety.kind === 'blocked' ? 'rgba(var(--tj-danger), 0.92)' : safety.risky ? 'rgba(var(--tj-ui-nsfw), 0.9)' : 'rgba(var(--tj-accent-primary), 0.82)',
                              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
                              clipPath: smallClip,
                            }}>
                              {getPresetRegexKindLabel(safety.kind)}
                            </span>
                            {safety.blocksProtocolTags && (
                              <span className="px-1.5 py-0.5" style={{
                                color: 'rgba(var(--tj-danger), 0.9)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.22)',
                                clipPath: smallClip,
                              }}>
                                协议标签风险
                              </span>
                            )}
                          </div>
                          <div className="truncate font-mono" title={findPreview || 'find_regex 为空'} style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                            {findPreview || 'find_regex 为空'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                  {selectedRegexScript && selectedRegexSafety && selectedRegexDryRun ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-4">
                        {[
                          ['类型', getPresetRegexKindLabel(selectedRegexSafety.kind)],
                          ['状态', selectedRegexSafety.disabled ? '禁用' : '未禁用'],
                          ['风险', selectedRegexSafety.risky ? '高' : '低'],
                          ['命中', `${selectedRegexDryRun.matches}`],
                        ].map(([label, value]) => (
                          <div key={label} className="px-2 py-1.5 text-xs" style={{
                            background: 'rgba(var(--tj-bg-primary), 0.26)',
                            color: 'rgba(var(--tj-text-primary), 0.74)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                            clipPath: smallClip,
                          }}>
                            <div style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>{label}</div>
                            <div className="mt-1 truncate">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden xl:grid-cols-2">
                        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                          <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>脚本内容</div>
                          <div className="grid gap-2 overflow-y-auto pr-1">
                            <div>
                              <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>find_regex</div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                                background: 'rgba(var(--tj-bg-primary), 0.36)',
                                color: 'rgba(var(--tj-text-primary), 0.76)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                                clipPath: smallClip,
                              }}>{getPresetRegexFindText(selectedRegexScript) || '空'}</pre>
                            </div>
                            <div>
                              <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>replace_string</div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                                background: 'rgba(var(--tj-bg-primary), 0.36)',
                                color: 'rgba(var(--tj-text-primary), 0.76)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                                clipPath: smallClip,
                              }}>{getPresetRegexReplaceText(selectedRegexScript) || '空'}</pre>
                            </div>
                            <div className="text-xs leading-5" style={{ color: selectedRegexSafety.risky ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.64)' }}>
                              {selectedRegexSafety.reason}
                            </div>
                            {selectedRegexDryRun.warnings.length > 0 && (
                              <div className="grid gap-1 text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                                {selectedRegexDryRun.warnings.map((warning) => (
                                  <div key={warning}>- {warning}</div>
                                ))}
                              </div>
                            )}
                            {selectedRegexDryRun.error && (
                              <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                                正则错误：{selectedRegexDryRun.error}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>干跑预览</span>
                            <button
                              type="button"
                              onClick={() => setRegexDryRunSample(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE)}
                              className="px-2 py-1 text-xs"
                              style={{
                                color: 'rgba(var(--tj-text-secondary), 0.65)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                                clipPath: smallClip,
                              }}
                            >
                              重置样例
                            </button>
                          </div>
                          <textarea
                            value={regexDryRunSample}
                            onChange={(e) => setRegexDryRunSample(e.target.value)}
                            className="min-h-[120px] resize-y px-3 py-2 font-mono text-xs leading-5"
                            style={{
                              background: 'rgba(var(--tj-bg-primary), 0.38)',
                              color: 'rgba(var(--tj-text-primary), 0.76)',
                              border: '1px solid rgba(var(--tj-accent-primary), 0.12)',
                              borderRadius: '2px',
                              outline: 'none',
                            }}
                          />
                          <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                            background: selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.055)' : 'rgba(var(--tj-ui-nsfw), 0.06)',
                            color: 'rgba(var(--tj-text-primary), 0.78)',
                            boxShadow: `inset 0 0 0 1px ${selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
                            clipPath: smallClip,
                          }}>
                            {selectedRegexDryRun.after}
                          </pre>
                        </div>
                      </div>
                      <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
                    当前仅展示替换结果和风险判断，不会写入预设；真实运行只放开安全输出清理类正则。
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
                      从左侧选择一个正则脚本查看详情。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className="px-3 py-2"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.24)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            <button
              type="button"
              onClick={() => setDiagnosticsOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm"
              style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}
            >
              <span className="font-serif tracking-[0.14em]">运行诊断</span>
              <span className="text-xs" style={{ color: scanIssues.length > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.62)' }}>
                {scanIssues.length > 0 ? `${scanIssues.length} 项提示` : '结构正常'} · {diagnosticsOpen ? '收起' : '展开'}
              </span>
            </button>
            {diagnosticsOpen && (
              <div className="mt-2 grid gap-2 text-xs leading-6" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                {(scanIssues.length > 0 ? scanIssues : ['暂未发现结构性问题']).map((item) => (
                  <div key={item}>- {item}</div>
                ))}
                <div>- 格式保护层会在消息链末尾兜底 CoT、回复格式和行动选项。</div>
                <div>- 高级宏条目建议先查看右侧宏检测，再决定是否关闭。</div>
              </div>
            )}
          </div>
          {aiReviewOpen && (
            <div
              className="px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.88)' }}>本地审查报告</span>
                <button type="button" onClick={() => setAiReviewOpen(false)} className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>收起</button>
              </div>
              <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-6" style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}>
                {aiReviewText || buildLocalReviewText()}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MacroInspector({ content }: { content: string }) {
  const macro = detectTavernMacroInfo(content);
  if (macro.level === 'none') {
    return (
      <div className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
        宏检测：未发现宏。
      </div>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 text-xs"
      style={{
        color: 'rgba(var(--tj-text-secondary), 0.72)',
        boxShadow: `inset 0 0 0 1px ${macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.22)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
        clipPath: smallClip,
      }}
    >
      <div className="font-serif tracking-[0.14em]" style={{ color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
        宏检测 · {macro.level === 'advanced' ? '高级宏' : '基础宏'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {macro.macros.map((item) => (
          <span key={item} className="px-1.5 py-0.5" style={{ color: 'rgba(var(--tj-text-primary), 0.72)', background: 'rgba(var(--tj-bg-primary), 0.36)', clipPath: smallClip }}>
            {item}
          </span>
        ))}
      </div>
      {macro.level === 'advanced' && (
        <div className="leading-5">
          该条目可能承担变量赋值、条件分支或随机选择逻辑，建议审查后再关闭。
        </div>
      )}
    </div>
  );
}
