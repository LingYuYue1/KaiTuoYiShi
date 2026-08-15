import { useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { STPresetEntryV2, STRegexScript, STWorldInfoEntry } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/contracts/ai';
import { getPresetWorldInfoEntries, getPresetWorldInfoViewEntries } from '@/utils/tavernPresetParsing';
import { patchPresetOrderSlot, patchPresetPrompt, patchPresetWorldInfoEntry } from '@/utils/tavernPresetTransitions';
import {
  buildTavernLocalReviewText,
  buildTavernScanIssues,
  buildTavernSlotStats,
  buildTavernSlotViewModels,
  countRegexScripts,
  countWorldInfoEntries,
  findDuplicateSlotIdentifiers,
} from '@/utils/tavernPresetPanel';
import { smallClip } from './settingsShared';
import { TogglePill } from './tavernPresetPrimitives';
import { V2DiagnosticsPanel } from './V2DiagnosticsPanel';
import { V2PromptDetailPanel } from './V2PromptDetailPanel';
import { V2RegexPanel } from './V2RegexPanel';
import { V2SlotListPanel } from './V2SlotListPanel';
import { V2WorldInfoPanel } from './V2WorldInfoPanel';

interface V2PresetSwitcherProps {
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
}

/** ST 预设切换器：下拉选当前预设 + 重命名按钮 + 删除按钮。 */
export function V2PresetSwitcher({
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
}: V2PresetSwitcherProps) {
  const current = presets.find((p) => p.id === currentId) ?? null;
  const characterIds = current?.preset.prompt_order.map((item) => item.character_id) ?? [];
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiReviewText, setAiReviewText] = useState('');
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
  const slotViewModels = buildTavernSlotViewModels(orderSlots, promptMap);
  const slotStats = buildTavernSlotStats(slotViewModels);
  const duplicateIds = findDuplicateSlotIdentifiers(orderSlots);
  const worldInfoEntries = getPresetWorldInfoEntries(current?.preset.world_info);
  const worldInfoViewEntries = getPresetWorldInfoViewEntries(current?.preset.world_info);
  const worldInfoCounts = countWorldInfoEntries(worldInfoEntries);
  const regexScripts = onExtractTavernRegexScripts(current?.preset);
  const regexScriptSafety = regexScripts.map(onAnalyzeTavernRegexScript);
  const regexCounts = countRegexScripts(regexScriptSafety);
  const scanIssues = buildTavernScanIssues({
    unmatchedSlotCount: slotStats.unmatchedSlotCount,
    disabledRuntimeCount: slotStats.disabledRuntimeCount,
    duplicateSlotCount: duplicateIds.length,
    advancedMacroSlotCount: slotStats.advancedMacroSlotCount,
    enabledWorldInfoCount: worldInfoCounts.enabledWorldInfoCount,
    constantWorldInfoCount: worldInfoCounts.constantWorldInfoCount,
    regexScriptCount: regexScripts.length,
    enabledRiskyRegexScriptCount: regexCounts.enabledRiskyRegexScriptCount,
  });

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

  const buildLocalReviewText = () => buildTavernLocalReviewText({
    presetName: current?.name ?? '未选择',
    promptCount: current?.preset.prompts.length ?? 0,
    orderSlotCount: orderSlots.length,
    enabledSlotCount: slotStats.enabledSlotCount,
    runtimeSlotCount: slotStats.runtimeSlotCount,
    unmatchedSlotCount: slotStats.unmatchedSlotCount,
    macroSlotCount: slotStats.macroSlotCount,
    advancedMacroSlotCount: slotStats.advancedMacroSlotCount,
    disabledRuntimeCount: slotStats.disabledRuntimeCount,
    worldInfoEntryCount: worldInfoEntries.length,
    enabledWorldInfoCount: worldInfoCounts.enabledWorldInfoCount,
    constantWorldInfoCount: worldInfoCounts.constantWorldInfoCount,
    regexScriptCount: regexScripts.length,
    enabledRegexScriptCount: regexCounts.enabledRegexScriptCount,
    riskyRegexScriptCount: regexCounts.riskyRegexScriptCount,
    postProcessMode,
    scanIssues,
  });

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
            <V2SlotListPanel
              slotViewModels={slotViewModels}
              stats={slotStats}
              selectedSlotId={selectedSlotId}
              onSelectSlot={setSelectedSlotId}
              canToggle={canToggleOrderSlot}
              onToggleSlot={(identifier, next) => patchOrderSlot(identifier, { enabled: next })}
            />
            <V2PromptDetailPanel
              selectedSlot={selectedSlot}
              selectedPrompt={selectedPrompt}
              canEdit={canEdit}
              canToggle={canToggleOrderSlot}
              onToggleSelectedSlot={(next) => patchSelectedSlot({ enabled: next })}
              onPatchSelectedPrompt={patchSelectedPrompt}
            />
          </div>
          {worldInfoViewEntries.length > 0 && (
            <V2WorldInfoPanel
              viewEntries={worldInfoViewEntries}
              enabledCount={worldInfoCounts.enabledWorldInfoCount}
              constantCount={worldInfoCounts.constantWorldInfoCount}
              canEdit={canEdit}
              onToggleEntry={(entryKey, next) => patchWorldInfoEntry(entryKey, { enabled: next })}
            />
          )}
          <V2RegexPanel scripts={regexScripts} safety={regexScriptSafety} onDryRun={onDryRunTavernRegexScript} />
          <V2DiagnosticsPanel scanIssues={scanIssues} />
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
