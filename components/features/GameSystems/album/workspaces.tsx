import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { slotLabel } from '@/models/imageGeneration';
import type { 图片生成任务 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { 文生图规则中心设置 } from '@/models/settings';
import type { NPC记录, NPC角色锚点档案 } from '@/models/npc';
import { ImageRuleTemplateEditor } from '@/components/features/ImageGeneration/ImageRuleTemplateEditor';

import {
  cardClip, smallClip, heroSurface, titleColor, activeAccentSurface, cardSurface, heroGridBackgroundStyle,
  labelColor, insetBorder, panelStrongSurface,
} from './visualTokens';
import { tabs, generateTargets, navGroups, groupForTab } from './foundation';
import type { ReferenceInjectionStatus } from './referenceInjection';
import type {
  WorkTab, GenerateTarget, PromptMeta, StorySnapshotSource,
  AnchorSelection, StorySnapshotSummary,
  SceneImageSummary, StorySnapshotSourceOption, GenerateOverride,
} from './foundation';
import { AnchorModeBadge, AnchorStat, AnchorToggle, Button, DraftActionButton, EmptyLibraryBox, Field, GenerationSummary, ImagePreviewModal, MiniInfo, OptionButtonGroup, Panel, ParsedPanel, ReferenceInjectionHint, SafeAlbumImage, SceneParameterPanel, Spinner, StateCard, StorySnapshotSummaryCard } from './workspaceComponents';
import { buildBatchExtractPlan, buildPngStyleOptions, resolvePromptMeta, statusLabel } from './albumWorkspaceLogic';
import type { NpcLibraryRecord } from './albumWorkspaceLogic';

export function WorkspaceTabs({ activeTab, setActiveTab }: { activeTab: WorkTab; setActiveTab: (tab: WorkTab) => void }) {
  const activeGroupId = groupForTab(activeTab);
  const subTabs = tabs.filter((tab) => tab.groupId === activeGroupId);
  return (
    <Panel title="工作台">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {navGroups.map((group) => {
            const active = group.id === activeGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveTab(tabs.find((tab) => tab.groupId === group.id)?.id ?? 'manual')}
                className="px-3 py-2.5 text-center font-serif text-sm font-bold tracking-[0.16em] transition-all"
                style={{
                  color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.86)',
                  background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.13), rgba(var(--tj-tech-cyan),0.045))' : panelStrongSurface,
                  boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24), inset 0 -3px 0 rgba(var(--tj-tech-cyan),0.46)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)',
                  clipPath: smallClip,
                }}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {subTabs.map((tab, index) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all"
                style={{
                  color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.86)',
                  background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.13), rgba(var(--tj-tech-cyan),0.045))' : panelStrongSurface,
                  boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.46)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)',
                  clipPath: smallClip,
                }}
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center font-mono text-[10px]" style={{ color: active ? 'rgba(var(--tj-tech-cyan),0.95)' : 'rgba(var(--tj-btn-primary-start),0.55)', background: 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: insetBorder, clipPath: smallClip }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-sm font-bold tracking-[0.16em]">{tab.label}</span>
                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: active ? 'rgba(var(--tj-ui-body),0.68)' : 'rgba(var(--tj-ui-faint),0.68)' }}>{tab.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function NsfwVisibilityToggle({
  nsfwVisible,
  showNsfw,
  setShowNsfw,
}: {
  nsfwVisible: boolean;
  showNsfw: boolean;
  setShowNsfw: (v: boolean) => void;
}) {
  if (!nsfwVisible) return null;
  return (
    <Panel title="NSFW 资源">
      <div className="mb-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>
        成人图片与普通图片隔离显示，关闭后不会出现在成品库和角色槽位。
      </div>
      <button type="button" onClick={() => setShowNsfw(!showNsfw)} className="w-full px-3 py-2 text-xs font-serif tracking-[0.14em]" style={{ color: showNsfw ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-nsfw),0.88)', background: showNsfw ? 'linear-gradient(135deg, rgb(var(--tj-ui-nsfw)), rgb(var(--tj-ui-nsfw)))' : 'rgba(var(--tj-ui-nsfw),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.28)', clipPath: smallClip }}>
        {showNsfw ? '隐藏 NSFW 图片' : '显示 NSFW 图片'}
      </button>
    </Panel>
  );
}

export function CharacterAnchorWorkspace({
  traveler,
  travelerRequirement,
  setTravelerRequirement,
  onSaveTravelerAnchor,
  onDeleteTravelerAnchor,
  onExtractTravelerAnchor,
  records,
  activeRecord,
  activeSelection,
  anchorExtractingTarget,
  anchorBatchExtracting,
  setAnchorBatchExtracting,
  onSelectAnchor,
  requirement,
  setRequirement,
  onSaveAnchor,
  onDeleteAnchor,
  onExtractAnchor,
}: {
  traveler: 角色数据结构;
  travelerRequirement: string;
  setTravelerRequirement: (value: string) => void;
  onSaveTravelerAnchor: (anchor: NPC角色锚点档案) => void;
  onDeleteTravelerAnchor: () => void;
  onExtractTravelerAnchor: (requirement: string) => Promise<void>;
  records: NpcLibraryRecord[];
  activeRecord: NpcLibraryRecord | null;
  activeSelection: AnchorSelection;
  anchorExtractingTarget: AnchorSelection | null;
  setAnchorExtractingTarget: React.Dispatch<React.SetStateAction<AnchorSelection | null>>;
  anchorBatchExtracting: boolean;
  setAnchorBatchExtracting: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectAnchor: (selection: AnchorSelection) => void;
  requirement: string;
  setRequirement: (value: string) => void;
  onSaveAnchor: (npcId: string, anchor: NonNullable<NPC记录['图像档案']>['角色锚点']) => void;
  onDeleteAnchor: (npcId: string) => void;
  onExtractAnchor: (npcId: string, requirement: string) => Promise<void>;
}) {
  const [batchMessage, setBatchMessage] = useState('批量操作会应用到左侧当前列表，单个锚点编辑已改为自动保存。');
  const anchoredCount = records.filter((record) => record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词).length;
  const enabledCount = records.filter((record) => record.npc.图像档案?.角色锚点?.是否启用 !== false && (record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词)).length;
  const travelerAnchor = traveler.图像档案?.角色锚点;
  const travelerHasAnchor = Boolean(travelerAnchor?.正面提示词 || travelerAnchor?.负面提示词);
  const activeNpcRecord = activeSelection === 'traveler'
    ? null
    : records.find((record) => record.npc.id === activeSelection) ?? activeRecord;
  const batchMissingCount = records.filter((record) => !(record.npc.图像档案?.角色锚点?.正面提示词 || record.npc.图像档案?.角色锚点?.负面提示词)).length + (travelerHasAnchor ? 0 : 1);
  const handleBatchExtract = () => {
    setAnchorBatchExtracting(true);
    void (async () => {
      try {
        const plan = buildBatchExtractPlan(records, travelerHasAnchor);
        let count = 0;
        for (const item of plan) {
          if (item.kind === 'traveler') {
            await onExtractTravelerAnchor(travelerRequirement);
          } else {
            await onExtractAnchor(item.npcId, requirement);
          }
          count += 1;
        }
        setBatchMessage(count > 0
          ? `已为 ${count} 个缺失对象生成锚点，并写入对应档案。`
          : '当前列表没有缺失锚点。');
      } finally {
        setAnchorBatchExtracting(false);
      }
    })();
  };
  const handleBatchSave = () => {
    setBatchMessage('当前版本已改为自动保存：单个锚点编辑、批量提取和批量清理都会立即写入档案。');
  };
  const handleBatchClean = () => {
    let count = 0;
    if (travelerAnchor) {
      onDeleteTravelerAnchor();
      count += 1;
    }
    records.forEach((record) => {
      const anchor = record.npc.图像档案?.角色锚点;
      if (!anchor) return;
      onDeleteAnchor(record.npc.id);
      count += 1;
    });
    setBatchMessage(count > 0 ? `已清理当前列表中的 ${count} 个锚点。` : '当前列表没有可清理的锚点。');
  };

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <Panel title="锚点角色">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <AnchorStat label="已建立" value={anchoredCount + (travelerHasAnchor ? 1 : 0)} />
          <AnchorStat label="启用中" value={enabledCount + (travelerHasAnchor && travelerAnchor?.是否启用 !== false ? 1 : 0)} />
        </div>
        <button
          type="button"
          onClick={() => onSelectAnchor('traveler')}
          className="mb-2 w-full px-3 py-3 text-left transition-all"
          style={{ background: activeSelection === 'traveler' ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.18), rgba(var(--tj-btn-primary-start),0.05))' : panelStrongSurface, boxShadow: activeSelection === 'traveler' ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : insetBorder, clipPath: smallClip }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>主控 · {traveler.姓名 || '旅人'}</div>
              <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.62)' }}>
                {travelerHasAnchor ? travelerAnchor?.名称 || '主控锚点' : '未建立锚点'}
              </div>
            </div>
            <span className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: travelerHasAnchor ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.66)', background: travelerHasAnchor ? activeAccentSurface : 'rgba(var(--tj-btn-primary-start),0.06)', clipPath: smallClip }}>
              {travelerHasAnchor ? (travelerAnchor?.是否启用 === false ? '停用' : '启用') : '空'}
            </span>
          </div>
          {travelerAnchor?.场景生图自动注入 && (
            <div className="mt-2 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.7)' }}>场景联动</div>
          )}
        </button>
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {records.length ? (
            records.map((record) => {
              const anchor = record.npc.图像档案?.角色锚点;
              const hasAnchor = Boolean(anchor?.正面提示词 || anchor?.负面提示词);
              const active = activeSelection === record.npc.id;
              return (
                <button
                  key={record.npc.id}
                  type="button"
                  onClick={() => onSelectAnchor(record.npc.id)}
                  className="w-full px-3 py-3 text-left transition-all"
                  style={{
                    background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.16), rgba(var(--tj-btn-primary-start),0.04))' : panelStrongSurface,
                    boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : insetBorder,
                    clipPath: smallClip,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{record.npc.姓名}</div>
                      <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.62)' }}>
                        {hasAnchor ? anchor?.名称 || '角色锚点' : '未建立锚点'}
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]" style={{ color: hasAnchor ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-muted),0.66)', background: hasAnchor ? activeAccentSurface : 'rgba(var(--tj-btn-primary-start),0.06)', clipPath: smallClip }}>
                      {hasAnchor ? (anchor?.是否启用 === false ? '停用' : '启用') : '空'}
                    </span>
                  </div>
                  {anchor?.场景生图自动注入 && (
                    <div className="mt-2 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.7)' }}>场景联动</div>
                  )}
                </button>
              );
            })
          ) : (
            <EmptyLibraryBox title="暂无角色" desc="伙伴系统写入角色后，才会在这里建立角色锚点。" />
          )}
        </div>
      </Panel>

      <div className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Panel title="批量处理">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.88)' }}>角色视觉批量工作区</div>
              <div>用于批量提取缺失锚点、确认自动保存状态，或一键清空当前列表内的全部锚点。</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <MiniInfo label="角色数" value={String(records.length + 1)} />
                <MiniInfo label="缺失锚点" value={String(batchMissingCount)} />
                <MiniInfo label="场景联动" value={String(records.filter((record) => record.npc.图像档案?.角色锚点?.场景生图自动注入).length + (travelerAnchor?.场景生图自动注入 ? 1 : 0))} />
              </div>
              <div className="px-3 py-2 text-[11px]" style={{ color: 'rgba(var(--tj-tech-cyan),0.82)', background: 'rgba(var(--tj-tech-cyan),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.18)', clipPath: smallClip }}>
                {batchMessage}
              </div>
            </div>
            <div className="grid gap-2">
              <Button disabled={anchorBatchExtracting} onClick={handleBatchExtract}>
                <span className="inline-flex items-center gap-2">
                  {anchorBatchExtracting && <Spinner />}
                  {anchorBatchExtracting ? '批量提取中' : 'AI 批量提取锚点'}
                </span>
              </Button>
              <Button onClick={handleBatchSave}>保存状态说明</Button>
              <Button onClick={handleBatchClean}>清理全部锚点</Button>
            </div>
          </div>
        </Panel>

        <Panel title={activeSelection === 'traveler' ? `${traveler.姓名 || '旅人'} · 主控锚点档案` : activeNpcRecord ? `${activeNpcRecord.npc.姓名} · 角色锚点档案` : '角色锚点档案'}>
          {activeSelection === 'traveler' ? (
            <CharacterAnchorPanel
              label="主控锚点管理"
              desc="主控锚点用于稳定旅人外观，角色图和场景图都会优先读取它。"
              nameFallback={traveler.姓名 || '旅人'}
              anchor={traveler.图像档案?.角色锚点}
              requirement={travelerRequirement}
              setRequirement={setTravelerRequirement}
              onExtract={() => { void onExtractTravelerAnchor(travelerRequirement); }}
              onSave={onSaveTravelerAnchor}
              onDelete={onDeleteTravelerAnchor}
              isExtracting={anchorExtractingTarget === 'traveler'}
              extractLabel="主控锚点提取"
            />
          ) : activeNpcRecord ? (
            <CharacterAnchorPanel
              label="角色锚点管理"
              desc="角色锚点用于稳定 NPC 外观，每名角色只保留一个锚点。"
              nameFallback={activeNpcRecord.npc.姓名}
              anchor={activeNpcRecord.npc.图像档案?.角色锚点}
              requirement={requirement}
              setRequirement={setRequirement}
              onExtract={() => { void onExtractAnchor(activeNpcRecord.npc.id, requirement); }}
              onSave={(anchor) => onSaveAnchor(activeNpcRecord.npc.id, anchor)}
              onDelete={() => onDeleteAnchor(activeNpcRecord.npc.id)}
              isExtracting={anchorExtractingTarget === activeNpcRecord.npc.id}
              extractLabel="AI提取锚点"
            />
          ) : (
            <EmptyLibraryBox title="未选择角色" desc="先在左侧选择一个伙伴，再建立用于稳定外观的角色锚点。" />
          )}
        </Panel>
      </div>
    </div>
  );
}

export function CharacterAnchorPanel({
  label,
  desc,
  nameFallback,
  anchor,
  requirement,
  setRequirement,
  onExtract,
  onSave,
  onDelete,
  isExtracting = false,
  extractLabel = 'AI提取锚点',
}: {
  label: string;
  desc: string;
  nameFallback: string;
  anchor?: NPC角色锚点档案;
  requirement: string;
  setRequirement: (value: string) => void;
  onExtract: () => void;
  onSave: (anchor: NPC角色锚点档案) => void;
  onDelete: () => void;
  isExtracting?: boolean;
  extractLabel?: string;
}) {
  const [name, setName] = useState(anchor?.名称 || nameFallback);
  const [enabled, setEnabled] = useState(anchor?.是否启用 !== false);
  const [defaultApply, setDefaultApply] = useState(anchor?.生成时默认附加 !== false);
  const [sceneInject, setSceneInject] = useState(anchor?.场景生图自动注入 !== false);
  const [positive, setPositive] = useState(anchor?.正面提示词 || '');
  const [negative, setNegative] = useState(anchor?.负面提示词 || '');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const autosaveTimerRef = useRef<number | null>(null);
  const skipAutosaveRef = useRef(true);

  // anchor / 回退名变化时重置表单：渲染期校正（React 官方「props 变化调整 state」模式）。
  const [prevAnchor, setPrevAnchor] = useState(anchor);
  const [prevNameFallback, setPrevNameFallback] = useState(nameFallback);
  if (prevAnchor !== anchor || prevNameFallback !== nameFallback) {
    setPrevAnchor(anchor);
    setPrevNameFallback(nameFallback);
    setName(anchor?.名称 || nameFallback);
    setEnabled(anchor?.是否启用 !== false);
    setDefaultApply(anchor?.生成时默认附加 !== false);
    setSceneInject(anchor?.场景生图自动注入 !== false);
    setPositive(anchor?.正面提示词 || '');
    setNegative(anchor?.负面提示词 || '');
    setSaveState('saved');
  }

  // anchor 切换时取消挂起的自动保存（无 setState，纯 ref/timer 清理）。
  useEffect(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    skipAutosaveRef.current = true;
  }, [anchor, nameFallback]);

  const save = useCallback(() => onSave({
    ...(anchor ?? {}),
    名称: name,
    是否启用: enabled,
    生成时默认附加: defaultApply,
    场景生图自动注入: sceneInject,
    正面提示词: positive,
    负面提示词: negative,
    中文摘要: anchor?.中文摘要,
    来源: anchor?.来源 ?? 'manual',
  }), [anchor, name, enabled, defaultApply, sceneInject, positive, negative, onSave]);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    setSaveState('dirty');
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      setSaveState('saving');
      save();
      setSaveState('saved');
      autosaveTimerRef.current = null;
    }, 420);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [name, enabled, defaultApply, sceneInject, positive, negative, save]);

  const saveNow = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    save();
    setSaveState('saved');
  };

  return (
    <div className="space-y-3 px-3 py-3" style={{ background: cardSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58)', clipPath: smallClip }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.88)' }}>{label}</div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.64)' }}>{desc}</div>
          <div className="mt-1 text-[10px]" style={{ color: saveState === 'saving' ? 'rgba(var(--tj-tech-cyan),0.82)' : saveState === 'dirty' ? 'rgba(var(--tj-btn-primary-start),0.82)' : 'rgba(var(--tj-ui-muted),0.58)' }}>
            {saveState === 'saving' ? '自动保存中' : saveState === 'dirty' ? '待自动保存' : '已自动保存'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isExtracting} onClick={onExtract}>
            <span className="inline-flex items-center gap-2">
              {isExtracting && <Spinner />}
              {isExtracting ? '提取中' : extractLabel}
            </span>
          </Button>
          <Button onClick={saveNow}>手动保存</Button>
          <Button onClick={onDelete}>删除锚点</Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-3">
          <Field label="锚点名称">
            <input value={name} onChange={(event) => setName(event.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="提取附加要求">
            <input value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：更重视脸部、发色、胸型和常驻衣着" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <AnchorToggle label="启用锚点" desc="关闭后不参与生图" checked={enabled} onChange={setEnabled} />
            <AnchorToggle label="默认附加" desc="NPC 单图自动带入" checked={defaultApply} onChange={setDefaultApply} />
            <AnchorToggle label="场景联动" desc="场景图自动注入" checked={sceneInject} onChange={setSceneInject} />
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <Field label="正面提示词">
            <textarea value={positive} onChange={(event) => setPositive(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="负面提示词">
            <textarea value={negative} onChange={(event) => setNegative(event.target.value)} rows={6} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed" style={{ clipPath: smallClip }} />
          </Field>
        </div>
        <Field label="中文锚点摘要">
          <div className="min-h-[82px] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.28)', color: 'rgba(var(--tj-ui-title),0.86)', boxShadow: insetBorder, clipPath: smallClip }}>
            {anchor?.中文摘要?.trim() || 'AI 提取后会在这里显示中文版本的稳定外观摘要，仅供玩家查看。'}
          </div>
        </Field>
      </div>
    </div>
  );
}

export function CreateWorkspace(props: {
  imageEnabled: boolean;
  currentTarget: typeof generateTargets[number];
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  resolvedSize: string;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  prompt: string; setPrompt: (v: string) => void; negativePrompt: string; setNegativePrompt: (v: string) => void; generateTitle: string; setGenerateTitle: (v: string) => void; onGenerate: () => void; generating: boolean; nsfwVisible: boolean;
  companions: NPC记录[]; travelerName: string; selectedCharacterId: string; onSelectManualTarget: (purpose: 'avatar' | 'portrait' | 'nsfw', characterId: string) => void; onBuildPrompt: () => void | Promise<void>; tokenizing: boolean;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  promptEditorOpen: boolean;
  setPromptEditorOpen: (v: boolean) => void;
  promptMeta: PromptMeta | null;
  canvasTask?: 图片生成任务;
  canvasSrc: string;
  onRetryTask: (task?: 图片生成任务) => void;
  onOpenGallery: () => void;
  onSetResultReference: () => void;
  onMountResultToSlot: () => void;
  resultIsReference: boolean;
  referenceStatus: ReferenceInjectionStatus;
}) {
  const activePromptMeta = resolvePromptMeta(props.canvasTask, props.promptMeta);
  const selectedPurpose = props.currentTarget.nsfw
    ? 'nsfw'
    : props.currentTarget.tokenizerMode === 'portrait' ? 'portrait' : 'avatar';
  const selectedCharacterId = props.currentTarget.targetType === 'traveler' ? 'traveler' : props.selectedCharacterId;
  const selectedCharacterLabel = selectedCharacterId === 'traveler'
    ? `${props.travelerName}（主角）`
    : props.companions.find((npc) => npc.id === selectedCharacterId)?.姓名 || '未选择伙伴';
  const travelerParams = props.currentTarget.targetType === 'traveler' || (props.currentTarget.nsfw && selectedCharacterId === 'traveler');
  const purposeLabel = props.currentTarget.nsfw ? 'NSFW 参考' : props.currentTarget.tokenizerMode === 'portrait' ? '立绘' : '头像';
  const parameterPanel = (
    <Panel title="生成参数">
      <CharacterGenerationParameters
                        sizePreset={props.sizePreset}
                        setSizePreset={props.setSizePreset}
                        customSize={props.customSize}
                        setCustomSize={props.setCustomSize}
                        targetId={props.currentTarget.id}
                        imageRules={props.imageRules}
                        onImageRulesChange={props.onImageRulesChange}
                        extraRequirement={props.extraRequirement}
                        setExtraRequirement={props.setExtraRequirement}
                        anchorLabel={travelerParams ? '主控锚点' : '角色锚点'}
                      />
      <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
    </Panel>
  );
  return (
    <div className="space-y-4">
      <StudioHero
                        imageEnabled={props.imageEnabled}
                        chipText={selectedCharacterLabel + ' · ' + purposeLabel}
                      />
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="生成对象" className="h-full" contentClassName="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3">
              <Field label="选择用途">
                <select
                  value={selectedPurpose}
                  onChange={(event) => props.onSelectManualTarget(event.target.value as 'avatar' | 'portrait' | 'nsfw', selectedCharacterId)}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                >
                  <option value="avatar">头像</option>
                  <option value="portrait">立绘</option>
                  {props.nsfwVisible && <option value="nsfw">NSFW 参考</option>}
                </select>
              </Field>
              <Field label="选择伙伴">
                <select
                  value={selectedCharacterId}
                  onChange={(event) => props.onSelectManualTarget(selectedPurpose, event.target.value)}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                >
                  <option value="">选择伙伴</option>
                  <option value="traveler">{props.travelerName}（主角）</option>
                  {props.companions.map((npc) => <option key={npc.id} value={npc.id}>{npc.姓名}</option>)}
                </select>
              </Field>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="画面草稿" className="h-full">
            <DraftCanvasPreview
              target={props.currentTarget}
              size={props.resolvedSize}
              task={props.canvasTask}
              resultSrc={props.canvasSrc}
              promptMeta={activePromptMeta}
              onRetry={() => props.onRetryTask(props.canvasTask)}
              onOpenGallery={props.onOpenGallery}
              onSetReference={props.currentTarget.targetType === 'traveler' || props.currentTarget.targetType === 'npc' ? props.onSetResultReference : undefined}
              onMountSlot={props.currentTarget.targetType === 'traveler' || props.currentTarget.targetType === 'npc' ? props.onMountResultToSlot : undefined}
              referenceEnabled={props.resultIsReference}
              referenceStatus={props.referenceStatus}
            />
            <div className="grid gap-2">
              <DraftActionButton disabled={props.tokenizing} onClick={() => { void props.onBuildPrompt(); }}>
                {props.tokenizing ? '整理中' : '生成提示词'}
              </DraftActionButton>
              <DraftActionButton disabled={props.generating || (props.currentTarget.nsfw && !props.nsfwVisible)} onClick={props.onGenerate} tone={props.currentTarget.nsfw ? 'nsfw' : 'normal'}>
                {props.generating ? '生成中' : '生成'}
              </DraftActionButton>
            </div>
            <div className="grid gap-2 md:grid-cols-2 md:items-stretch">
              <AnchorModeBadge promptMeta={activePromptMeta} />
              <button
                type="button"
                onClick={() => props.setPromptEditorOpen(!props.promptEditorOpen)}
                className="min-h-[42px] px-3 py-2 font-serif text-xs tracking-[0.12em]"
                style={{
                  color: props.promptEditorOpen ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.82)',
                  background: props.promptEditorOpen ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                  clipPath: smallClip,
                }}
              >
                高级提示词编辑
              </button>
            </div>
            {props.promptEditorOpen && (
              <div className="space-y-3">
                <Field label="最终 Prompt">
                  <textarea rows={7} value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="最终 Negative Prompt">
                  <textarea rows={3} value={props.negativePrompt} onChange={(e) => props.setNegativePrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
              </div>
            )}
          </Panel>
        </div>

        <div className="xl:col-span-2">
          {parameterPanel}
        </div>
      </div>
    </div>
  );
}

export function DraftCanvasPreview({
  target,
  size,
  task,
  resultSrc,
  promptMeta,
  onRetry,
  onOpenGallery,
  onSetReference,
  onMountSlot,
  referenceEnabled = false,
  referenceStatus,
}: {
  target: typeof generateTargets[number];
  size: string;
  task?: 图片生成任务;
  resultSrc: string;
  promptMeta: PromptMeta | null;
  onRetry: () => void;
  onOpenGallery?: () => void;
  onSetReference?: () => void;
  onMountSlot?: () => void;
  referenceEnabled?: boolean;
  referenceStatus: ReferenceInjectionStatus;
}) {
  const [previewTargetSrc, setPreviewTargetSrc] = useState<string | undefined>(undefined);
  const previewOpen = previewTargetSrc !== undefined && previewTargetSrc === resultSrc;
  const displaySize = task?.dimensions ? task.dimensions.replace(/x/i, ' × ') : size ? size.replace(/x/i, ' × ') : '接口默认';
  const stateLabel = task ? statusLabel(task.status) : '草稿';
  const isRunning = task?.status === 'queued' || task?.status === 'running';
  const isFailed = task?.status === 'failed';
  const isSuccess = task?.status === 'success' && Boolean(resultSrc);
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewTargetSrc(undefined);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewOpen]);
  const draftGrid =
    'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.11) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-btn-primary-start),0.08) 1px, transparent 1px), radial-gradient(circle at 18% 12%, rgba(var(--tj-tech-cyan),0.12), transparent 32%), linear-gradient(180deg, rgba(var(--tj-bg-primary),0.92), rgba(var(--tj-bg-primary),0.98))';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="font-serif font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>当前画布</div>
        <div className="flex items-center gap-2">
          <span className="font-serif tracking-[0.12em]" style={{ color: isFailed ? 'rgba(var(--tj-danger),0.9)' : isSuccess ? 'rgba(var(--tj-ui-success),0.9)' : 'rgba(var(--tj-tech-cyan),0.82)' }}>{stateLabel}</span>
          <span className="font-mono" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>{displaySize}</span>
        </div>
      </div>
      <div
        className="relative min-h-[220px] overflow-hidden px-4 py-4 md:min-h-[260px]"
        style={{
          background: draftGrid,
          backgroundSize: '24px 24px, 24px 24px, auto, auto',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28), inset 0 0 0 2px rgba(0,0,0,0.42)',
          clipPath: cardClip,
        }}
      >
        {isSuccess && (
          <SafeAlbumImage src={resultSrc} alt={target.label} className="absolute inset-0 h-full w-full object-cover" emptyLabel="无图片" failedLabel="图片失效" />
        )}
        {isSuccess && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.58))' }} />}
        <div className="absolute left-5 top-4 border px-2.5 py-1 font-mono text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.96)', borderColor: 'rgba(var(--tj-tech-cyan),0.28)', background: 'rgba(0,0,0,0.42)' }}>
          {isSuccess ? 'SCENE SNAPSHOT / READY' : isRunning ? 'SCENE SNAPSHOT / RUNNING' : isFailed ? 'SCENE SNAPSHOT / FAILED' : 'SCENE SNAPSHOT / DRAFT'}
        </div>
        <div className="absolute right-5 top-4 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{slotLabel(target.slot)}</div>
        {promptMeta && (
          <div
            className="absolute left-5 top-12 max-w-[260px] truncate px-2.5 py-1 text-[11px]"
            style={{
              color: promptMeta.anchorMode ? 'rgba(var(--tj-tech-cyan),0.94)' : 'rgba(var(--tj-ui-muted),0.82)',
              background: 'rgba(0,0,0,0.38)',
              boxShadow: `inset 0 0 0 1px ${promptMeta.anchorMode ? 'rgba(var(--tj-tech-cyan),0.22)' : 'rgba(var(--tj-btn-primary-start),0.14)'}`,
              clipPath: smallClip,
            }}
          >
            {promptMeta.anchorMode ? '锚点模式' : '档案回退'} · {promptMeta.anchorSummary}
          </div>
        )}
        {isRunning && (
          <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 px-4 py-3" style={{ color: 'rgba(var(--tj-ui-body),0.9)', background: 'rgba(0,0,0,0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}>
            <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.92)' }}>正在生成画面</div>
            <div className="mt-2 h-1 overflow-hidden" style={{ background: 'rgba(var(--tj-tech-cyan),0.12)' }}>
              <div className="h-full w-2/3 animate-pulse" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.2), rgba(var(--tj-btn-primary-start),0.92))' }} />
            </div>
            <div className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>
              {task.retryCount ? `已重试 ${task.retryCount} 次` : '任务已进入生成流程'}
            </div>
          </div>
        )}
        <div className="absolute bottom-4 right-4 max-w-[340px] px-3 py-2 text-[11px] leading-relaxed" style={{ color: isFailed ? 'rgba(var(--tj-danger),0.92)' : 'rgba(var(--tj-ui-body),0.86)', background: 'rgba(0,0,0,0.62)', boxShadow: `inset 0 0 0 1px ${isFailed ? 'rgba(255,170,170,0.28)' : 'rgba(var(--tj-btn-primary-start),0.22)'}`, clipPath: smallClip }}>
          {isFailed ? (task.error || '生成失败，参数已保留。') : isSuccess ? '图片已生成并加入成品库，可继续重试、改参数或前往成品库挂载。' : '生成失败时保留这个画布卡片，直接显示错误、参数和重新生成按钮，不需要重 roll 主剧情。'}
          {isFailed && (
            <button type="button" onClick={onRetry} className="mt-2 block px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>
              重新生成
            </button>
          )}
          {isSuccess && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewTargetSrc(resultSrc)} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>完整预览</button>{onOpenGallery && <button type="button" onClick={onOpenGallery} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.94)', background: 'rgba(var(--tj-tech-cyan),0.1)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.22)', clipPath: smallClip }}>查看图库</button>}{onSetReference && <button type="button" disabled={referenceEnabled} onClick={onSetReference} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em] disabled:opacity-55" style={{ color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.22)', clipPath: smallClip }}>{referenceEnabled ? '已设为当前角色参考图' : '设为参考图'}</button>}{onMountSlot && <button type="button" onClick={onMountSlot} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>按当前用途挂载</button>}</div>}
        </div>
        <div className="absolute bottom-[78px] left-4 right-4 flex min-w-0 items-center gap-3 md:bottom-4 md:right-[360px]">
          <span className="shrink-0 truncate font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>{target.label}</span>
          <ReferenceInjectionHint status={referenceStatus} />
        </div>
      </div>
      <ImagePreviewModal
        open={previewOpen && isSuccess}
        src={resultSrc}
        title={`完整预览 · ${target.label} · ${displaySize}`}
        onClose={() => setPreviewTargetSrc(undefined)}
      />
    </div>
  );
}

export function CharacterGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  anchorLabel: string;
}) {
  const isAvatar = props.targetId === 'traveler_avatar' || props.targetId === 'npc_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = buildPngStyleOptions(props.imageRules);
  return (
    <div className="space-y-3">
      {!isAvatar && (
        <OptionButtonGroup
          label="构图预设"
          columns="md:grid-cols-3"
          value={props.sizePreset}
          options={[
            { id: '3:4', title: '3:4', desc: '竖图比例' },
            { id: 'default', title: '默认', desc: '跟随用途' },
            { id: 'custom', title: '自定义', desc: '手动尺寸' },
          ]}
          onChange={(id) => props.setSizePreset(id as 'default' | '3:4' | 'custom')}
        />
      )}
      {!isAvatar && props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
      <OptionButtonGroup
        label="画风选择"
        columns="md:grid-cols-5"
        value={props.imageRules.当前NPCPNG画风预设ID}
        options={pngStyleOptions}
        onChange={(id) => props.onImageRulesChange({ 当前NPCPNG画风预设ID: id })}
      />
      <Field label="画师串预设">
        <select value={props.imageRules.当前NPC画师串预设ID} onChange={(e) => props.onImageRulesChange({ 当前NPC画师串预设ID: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
          <option value="">不启用</option>
          {artistPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
        </select>
      </Field>
      <Field label="额外要求">
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder={'可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用' + props.anchorLabel + '。'} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}

export function StudioHero({ imageEnabled, eyebrow = '◆ 生成工作室', title = '图片生成', chipText, description = '先确定用途、构图和提示词，再把结果送进队列。生成后的图片进入成品库，由玩家决定是否挂到角色、正文快照或手机背景。' }: { imageEnabled: boolean; eyebrow?: string; title?: string; chipText: string; description?: string }) {
  return (
    <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>{eyebrow}</div>
        <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>{title}</div>
        </div>
        <div className="px-3 py-2 text-xs" style={{ color: imageEnabled ? 'rgba(var(--tj-ui-success),0.9)' : 'rgba(255,180,180,0.86)', background: panelStrongSurface, boxShadow: insetBorder, clipPath: smallClip }}>
          {imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{chipText}
        </div>
      </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>{description}</p>
    </section>
  );
}

export type SceneCreationWorkspaceProps = {
  imageEnabled: boolean;
  currentTarget: typeof generateTargets[number];
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  resolvedSize: string;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  onGenerate: (override?: GenerateOverride) => void;
  generating: boolean;
  sceneText: string;
  setSceneText: (v: string) => void;
  onBuildPrompt: () => void | Promise<void>;
  tokenizing: boolean;
  promptEditorOpen: boolean;
  setPromptEditorOpen: (v: boolean) => void;
  promptMeta: PromptMeta | null;
  canvasTask?: 图片生成任务;
  canvasSrc: string;
  onRetryTask: (task?: 图片生成任务) => void;
  onOpenGallery?: () => void;
  sceneSummary?: SceneImageSummary | null;
  analyzing?: boolean;
  onImportCurrentBody?: () => void;
  referenceStatus: ReferenceInjectionStatus;
};

export type StorySnapshotWorkspaceProps = SceneCreationWorkspaceProps & {
  sourceMode: StorySnapshotSource;
  setSourceMode: (value: StorySnapshotSource) => void;
  sourceText: string;
  setSourceText: (value: string) => void;
  sourceOptions: StorySnapshotSourceOption[];
  summary: StorySnapshotSummary | null;
  analyzing: boolean;
  onBuildSnapshotPrompt: () => void | Promise<void>;
};

export function StorySnapshotWorkspace(props: StorySnapshotWorkspaceProps) {
  const selectedOption = props.sourceOptions.find((option) => option.id === props.sourceMode) ?? props.sourceOptions[0];
  const applySource = (option: StorySnapshotSourceOption) => {
    props.setSourceMode(option.id);
    if (option.id !== 'manual') props.setSourceText(option.text);
  };
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 故事快照"
      title="故事快照"
      description="用于正文插图、章节关键画面和剧情瞬间。会读取主控锚点与场景中提到的同行角色锚点。"
      panelTitle="快照描述"
      textareaLabel="场景说明"
      placeholder="写清地点、时间、人物站位、动作关系，以及这张图更像纯场景还是故事快照。"
      parameterTitle="快照参数"
      defaultSizeHint="故事快照默认更适合横图；如果想做竖向海报可改为自定义。"
      promptButtonLabel="生成快照提示词"
      busyLabel="解析中"
      busyWhen={props.tokenizing || props.analyzing}
      hideAdvancedPrompt
      lowerContent={(
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="快照与提示词">
            <div className="space-y-4">
              <OptionButtonGroup
                label="来源选择"
                columns="md:grid-cols-3"
                value={props.sourceMode}
                options={props.sourceOptions.map((option) => ({ id: option.id, title: option.title, desc: option.desc }))}
                onChange={(id) => {
                  const option = props.sourceOptions.find((item) => item.id === id) ?? selectedOption;
                  applySource(option);
                }}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-2">
                  <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: labelColor }}>正文片段</div>
                  <textarea
                    rows={11}
                    value={props.sourceText}
                    onChange={(e) => {
                      props.setSourceMode('manual');
                      props.setSourceText(e.target.value);
                    }}
                    placeholder="粘贴或选择一段最近正文，用来提炼故事快照。"
                    className="kaituo-input min-h-[300px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
                    style={{ clipPath: smallClip }}
                  />
                </div>
                <div className="min-h-[300px]">
                  {props.analyzing ? (
                    <StateCard title="正在解析正文" desc="正在提取画面要素并整理最终提示词，完成后再显示解析结果。" spinning />
                  ) : props.summary ? (
                    <StorySnapshotSummaryCard summary={props.summary} prompt={props.prompt} negativePrompt={props.negativePrompt} />
                  ) : (
                    <StateCard title="等待快照提示词" desc="选择正文来源后，点击画布下方的「生成快照提示词」。这里会展示提炼出的快照草稿和最终 Prompt。" minHeight={280} />
                  )}
                </div>
              </div>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="快照解析">
              {props.analyzing ? (
                <StateCard title="正在解析正文" desc="正在提取画面要素并整理最终提示词，完成后再显示解析结果。" spinning />
              ) : props.summary ? (
                <ParsedPanel titleLabel="快照标题" title={props.summary.title} fields={[['人物', props.summary.characters.length ? props.summary.characters.join('、') : '未明确'], ['地点', props.summary.location], ['氛围', props.summary.atmosphere], ['动作', props.summary.action], ['镜头', props.summary.camera], ['避免', props.summary.avoid]]} />
              ) : (
                <StateCard title="等待解析" desc="选择正文来源后点击「生成快照提示词」，这里会显示从正文解析出的画面要素。" />
              )}
              <Field label="额外要求">
                <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </Panel>
            <Panel title="快照参数">
                                <SceneParameterPanel
                                  generateTitle={props.generateTitle}
                                  setGenerateTitle={props.setGenerateTitle}
                                  sizePreset={props.sizePreset}
                                  setSizePreset={props.setSizePreset}
                                  customSize={props.customSize}
                                  setCustomSize={props.setCustomSize}
                                  hint="故事快照默认更适合横图；如果想做竖向海报可改为自定义。"
                                  target={props.currentTarget}
                                  resolvedSize={props.resolvedSize}
                                />
                              </Panel>
          </div>
        </div>
      )}
    />
  );
}

export function SceneImageWorkspace(props: SceneCreationWorkspaceProps) {
  const lowerContent = (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="场景描述">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={props.onImportCurrentBody}
            disabled={!props.onImportCurrentBody}
            className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em] transition-opacity hover:opacity-90 disabled:opacity-45"
            style={{ color: 'rgba(var(--tj-btn-primary-start),0.92)', background: 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24)', clipPath: smallClip }}
          >
            导入当前正文
          </button>
        </div>
        <Field label="场景说明">
          <textarea rows={7} value={props.sceneText} onChange={(e) => props.setSceneText(e.target.value)} placeholder="写清地点、天气、空间结构、主体在场位置，以及这张图要传达的氛围。" className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="额外要求">
          <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      </Panel>

      <Panel title="场景解析">
        {props.analyzing ? (
          <StateCard title="正在解析场景" desc="正在提取地点、主体、光线与镜头，完成后再显示解析结果。" spinning />
        ) : props.sceneSummary ? (
          <ParsedPanel titleLabel="场景标题" title={props.sceneSummary.title} fields={[['地点', props.sceneSummary.location], ['主体', props.sceneSummary.subject], ['氛围', props.sceneSummary.atmosphere], ['镜头', props.sceneSummary.camera], ['避免', props.sceneSummary.avoid]]} />
        ) : (
          <StateCard title="等待解析" desc="填写场景说明后点击「解析场景提示词」，这里会显示地点、主体、氛围与镜头。" />
        )}
      </Panel>

      <Panel title="场景参数">
                  <SceneParameterPanel
                    generateTitle={props.generateTitle}
                    setGenerateTitle={props.setGenerateTitle}
                    sizePreset={props.sizePreset}
                    setSizePreset={props.setSizePreset}
                    customSize={props.customSize}
                    setCustomSize={props.setCustomSize}
                    hint="场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。"
                    target={props.currentTarget}
                    resolvedSize={props.resolvedSize}
                  />
                </Panel>
    </div>
  );
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 场景图"
      title="场景图"
      description="用于地点、新闻配图和纯环境镜头。更强调空间、天气、光线和整体氛围。"
      panelTitle="场景描述"
      textareaLabel="场景说明"
      placeholder="写清地点、天气、空间结构、主体在场位置，以及这张图要传达的氛围。"
      parameterTitle="场景参数"
      defaultSizeHint="场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。"
      promptButtonLabel="解析场景提示词"
      busyLabel="解析中"
      busyWhen={props.analyzing}
      lowerContent={lowerContent}
    />
  );
}

export function PhoneBackgroundWorkspace(props: SceneCreationWorkspaceProps) {
  return (
    <SceneCreationWorkspaceShell
      {...props}
      eyebrow="◆ 手机背景"
      title="手机背景"
      description="用于手机桌面壁纸或聊天背景。画面需要留出图标、对话气泡和系统栏的可读空间。"
      panelTitle="壁纸描述"
      textareaLabel="背景说明"
      placeholder="写清想要的氛围、地点、主色调、是否出现人物，以及需要给图标或聊天气泡留白的位置。"
      parameterTitle="壁纸参数"
      defaultSizeHint="手机背景会按壁纸用途生成，后续可继续细分桌面壁纸和聊天背景。"
    />
  );
}

export function SceneCreationWorkspaceShell(props: SceneCreationWorkspaceProps & {
  eyebrow: string;
  title: string;
  description: string;
  panelTitle: string;
  textareaLabel: string;
  placeholder: string;
  parameterTitle: string;
  defaultSizeHint: string;
  beforeDescriptionPanel?: ReactNode;
  lowerContent?: ReactNode;
  promptButtonLabel?: string;
  busyLabel?: string;
  busyWhen?: boolean;
  hideAdvancedPrompt?: boolean;
}) {
  const activePromptMeta = resolvePromptMeta(props.canvasTask, props.promptMeta);
  return (
    <div className="space-y-4">
      <StudioHero
                    imageEnabled={props.imageEnabled}
                    eyebrow={props.eyebrow}
                    title={props.title}
                    chipText={props.currentTarget.label}
                    description={props.description}
                  />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="画面草稿">
            <DraftCanvasPreview
              target={props.currentTarget}
              size={props.resolvedSize}
              task={props.canvasTask}
              resultSrc={props.canvasSrc}
              promptMeta={activePromptMeta}
              onRetry={() => props.onRetryTask(props.canvasTask)}
              onOpenGallery={props.onOpenGallery}
              referenceStatus={props.referenceStatus}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <DraftActionButton disabled={props.busyWhen ?? props.tokenizing} onClick={() => { void props.onBuildPrompt(); }}>
                {(props.busyWhen ?? props.tokenizing) ? props.busyLabel || '整理中' : props.promptButtonLabel || '生成提示词'}
              </DraftActionButton>
              <DraftActionButton disabled={props.generating} onClick={() => props.onGenerate()}>
                {props.generating ? '生成中' : '普通生成'}
              </DraftActionButton>
            </div>
            {!props.hideAdvancedPrompt && (
              <div className="grid gap-2 md:grid-cols-2 md:items-stretch">
                <AnchorModeBadge promptMeta={activePromptMeta} />
                <button
                  type="button"
                  onClick={() => props.setPromptEditorOpen(!props.promptEditorOpen)}
                  className="min-h-[42px] px-3 py-2 font-serif text-xs tracking-[0.12em]"
                  style={{
                    color: props.promptEditorOpen ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.82)',
                    background: props.promptEditorOpen ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                    clipPath: smallClip,
                  }}
                >
                  高级提示词编辑
                </button>
              </div>
            )}
            {!props.hideAdvancedPrompt && props.promptEditorOpen && (
              <div className="space-y-3">
                <Field label="最终 Prompt">
                  <textarea rows={7} value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="最终 Negative Prompt">
                  <textarea rows={3} value={props.negativePrompt} onChange={(e) => props.setNegativePrompt(e.target.value)} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
              </div>
            )}
          </Panel>
        </div>

      </div>

      {props.lowerContent ?? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px]">
          {props.beforeDescriptionPanel}
          <Panel title={props.panelTitle}>
            <Field label={props.textareaLabel}>
              <textarea rows={7} value={props.sceneText} onChange={(e) => props.setSceneText(e.target.value)} placeholder={props.placeholder} className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="额外要求">
              <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
          </Panel>

          <Panel title={props.parameterTitle}>
                              <SceneParameterPanel
                                generateTitle={props.generateTitle}
                                setGenerateTitle={props.setGenerateTitle}
                                sizePreset={props.sizePreset}
                                setSizePreset={props.setSizePreset}
                                customSize={props.customSize}
                                setCustomSize={props.setCustomSize}
                                hint={props.defaultSizeHint}
                                target={props.currentTarget}
                                resolvedSize={props.resolvedSize}
                              />
                            </Panel>
        </div>
      )}
    </div>
  );
}

export function RulesWorkspace({
  rules,
  onChange,
  onSave,
}: {
  rules: 文生图规则中心设置;
  onChange: (patch: Partial<文生图规则中心设置>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="规则中心">
        <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
          这里和设置里的文生图规则模板是同一份数据。当前按角色生成规则与场景生成规则维护：旅人/伙伴/NSFW 参考图走角色规则，场景图/故事快照/手机背景走场景规则。
        </div>
        <ImageRuleTemplateEditor rules={rules} onChange={onChange} />
        <div className="max-w-56">
          <Button onClick={onSave}>保存规则中心</Button>
        </div>
      </Panel>
    </div>
  );
}
