import { useMemo } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import type { STPresetEntryV2, STRegexScript } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/contracts/ai';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import {
  deleteV2Preset as computeV2PresetDelete,
  patchV2Preset as computeV2PresetPatch,
} from '@/utils/tavernPresetTransitions';
import { exportV2Preset, importSTPreset as importSTPresetFromFile } from '@/services/tavernPresetIO';
import { smallClip } from './settingsShared';
import { V2PresetSwitcher } from './V2PresetSwitcher';

interface TavernPresetsTabProps {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  worldbooks: 世界书[];
  onWorldbooksChange: (books: 世界书[]) => void;
  onExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
  onAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
  onDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
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
