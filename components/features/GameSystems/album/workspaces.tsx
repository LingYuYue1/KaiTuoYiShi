import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { normalizeNovelAITaskOverrides, normalizeStorySnapshotRenderContext, 读取图片参考目标 } from '@/models/imageGeneration';
import type { NovelAITaskOverrides, StorySnapshotRenderContext, 图片槽位, 图片生成任务, 图片生成任务来源, 图片目标类型, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { NovelAIRequestPayload } from '@/services/ai/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { API设置, PNG画风预设来源, 游戏设置, 文生图API配置, 文生图规则中心设置, 文生图系统设置 } from '@/models/settings';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录, NPC头像槽位, NPC角色锚点档案 } from '@/models/npc';
import { 读取NPC头像 } from '@/models/npc';
import { saveSetting } from '@/services/dbService';
import {
  添加图片到相册,
  创建相册图片条目,
  创建相册资源引用,
  fileToDataUrl,
  挂载NPC头像图片,
  挂载NPC立绘图片,
  挂载NPC_NSFW部位图片,
  挂载旅人图片,
  卸载NPC头像图片,
  卸载NPC立绘图片,
  卸载NPC_NSFW部位图片,
  卸载旅人图片,
  读取相册条目地址,
  解析相册资源引用,
  解析相册资源地址,
} from '@/utils/albumActions';
import {
  revokeAlbumAssets,
} from '@/utils/albumObjectUrl';
import { generateImage } from '@/services/ai/imageGeneration';
import { ImageRuleTemplateEditor } from '@/components/features/ImageGeneration/ImageRuleTemplateEditor';
import { ImageGenerationSettingsTab } from '@/components/features/Settings/ImageGenerationSettingsTab';
import { ResilientImage } from '@/components/ui/ResilientImage';
import { parseSceneImagePrompt } from '@/services/ai/narrativeImageParse';
import {
  selectPresentStorySnapshotNpcs,
  trimStorySnapshotSource,
} from '@/services/ai/storySnapshotPipeline';
import { extractCharacterAnchorWithAI } from '@/services/ai/characterAnchorExtract';
import { buildNpcImagePrompt, buildSceneImagePrompt, buildTravelerImagePrompt, 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { readImageError, runImageGenerationWithRetry } from '@/utils/imageGenerationRetry';
import { buildImagePromptTokenizerConfig, buildImagePromptTokenizerSystemPrompt, tokenizeImagePrompt } from '@/services/ai/imagePromptTokenizer';
import { getBuiltinAvatarSet, getBuiltinAvatarSetForNames } from '@/data/builtinAvatars';
import { matchCanonical } from '@/data/canonicalCharacters';

import {
  cardClip, smallClip, albumGridLayer, albumGridSize, heroSurface, panelSurface, insetSurface,
  imageWellSurface, titleColor, bodyColor, mutedColor, faintColor, activeTextColor, accentColor,
  nsfwColor, activeAccentSurface, quietAccentSurface, cardSurface, heroGridBackgroundStyle,
  tabs, generateTargets, navGroups, groupForTab,
} from './foundation';
import type { ReferenceInjectionStatus } from './referenceInjection';
import type {
  WorkTab, GenerateTarget, NsfwPartImageSlot, LibraryStatusFilter, PromptMeta, StorySnapshotSource,
  AnchorSelection, SceneLibraryFilter, GenerationHistoryFilter, StorySnapshotSummary,
  SceneImageSummary, StorySnapshotSourceOption, GenerateOverride, NavGroupId,
} from './foundation';

export function WorkspaceTabs({ activeTab, setActiveTab }: { activeTab: WorkTab; setActiveTab: (tab: WorkTab) => void }) {
  const activeGroupId = groupForTab(activeTab);
  const activeGroup = navGroups.find((group) => group.id === activeGroupId) ?? navGroups[0];
  const subTabs = activeGroup.members
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is typeof tabs[number] => Boolean(tab));
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
                onClick={() => setActiveTab(group.members[0])}
                className="px-3 py-2.5 text-center font-serif text-sm font-bold tracking-[0.16em] transition-all"
                style={{
                  color: active ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.86)',
                  background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.13), rgba(var(--tj-tech-cyan),0.045))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
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
                  background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.13), rgba(var(--tj-tech-cyan),0.045))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.46)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)',
                  clipPath: smallClip,
                }}
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center font-mono text-[10px]" style={{ color: active ? 'rgba(var(--tj-tech-cyan),0.95)' : 'rgba(var(--tj-btn-primary-start),0.55)', background: 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
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

function CharacterArchiveButton({ record, active, onClick }: { record: CharacterLibraryRecord; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full min-w-0 px-3 py-2.5 text-left transition-all hover:bg-[rgba(var(--tj-btn-primary-start),0.07)]"
      style={{
        background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.16), rgba(var(--tj-btn-primary-start),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="min-w-0">
        <div className="truncate font-serif text-sm font-bold tracking-[0.1em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{record.name}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.66)' }}>
          <span>已装 {record.mountedCount}</span>
          <span>资源 {record.resourceCount}</span>
        </div>
      </div>
    </button>
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
  setAnchorExtractingTarget,
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
        let count = 0;
        if (!travelerHasAnchor) {
          await onExtractTravelerAnchor(travelerRequirement);
          count += 1;
        }
        for (const record of records) {
          const anchor = record.npc.图像档案?.角色锚点;
          if (anchor?.正面提示词 || anchor?.负面提示词) continue;
          await onExtractAnchor(record.npc.id, requirement);
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
          style={{ background: activeSelection === 'traveler' ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.18), rgba(var(--tj-btn-primary-start),0.05))' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: activeSelection === 'traveler' ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}
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
                    background: active ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.16), rgba(var(--tj-btn-primary-start),0.04))' : 'rgba(var(--tj-ui-panel-strong),0.36)',
                    boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.58)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)',
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

export function SafeAlbumImage({
  src,
  alt,
  className,
  emptyLabel = '待写入',
  failedLabel = '图片失效',
}: {
  src?: string;
  alt: string;
  className: string;
  emptyLabel?: string;
  failedLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center px-2 text-center font-serif text-xs tracking-[0.12em]`}
        style={{ background: imageWellSurface, color: failed ? 'rgba(var(--tj-danger),0.88)' : 'rgba(var(--tj-ui-faint),0.58)' }}
      >
        {failed ? failedLabel : emptyLabel}
      </div>
    );
  }
  return <ResilientImage src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}

export function AnchorStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2" style={{ background: insetSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.62)', clipPath: smallClip }}>
      <div className="text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.62)' }}>{label}</div>
      <div className="mt-1 font-serif text-base font-bold" style={{ color: 'rgb(var(--tj-ui-title))' }}>{value}</div>
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

  useEffect(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    skipAutosaveRef.current = true;
    setName(anchor?.名称 || nameFallback);
    setEnabled(anchor?.是否启用 !== false);
    setDefaultApply(anchor?.生成时默认附加 !== false);
    setSceneInject(anchor?.场景生图自动注入 !== false);
    setPositive(anchor?.正面提示词 || '');
    setNegative(anchor?.负面提示词 || '');
    setSaveState('saved');
  }, [anchor, nameFallback]);

  const save = () => onSave({
    ...(anchor ?? {}),
    名称: name,
    是否启用: enabled,
    生成时默认附加: defaultApply,
    场景生图自动注入: sceneInject,
    正面提示词: positive,
    负面提示词: negative,
    中文摘要: anchor?.中文摘要,
    来源: anchor?.来源 ?? 'manual',
  });

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
  }, [name, enabled, defaultApply, sceneInject, positive, negative]);

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
          <div className="min-h-[82px] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.28)', color: 'rgba(var(--tj-ui-title),0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
            {anchor?.中文摘要?.trim() || 'AI 提取后会在这里显示中文版本的稳定外观摘要，仅供玩家查看。'}
          </div>
        </Field>
      </div>
    </div>
  );
}

export function AnchorToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 px-3 py-2 text-left"
      style={{ background: checked ? 'rgba(var(--tj-btn-primary-start),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: checked ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}
    >
      <span className="min-w-0">
        <span className="block font-serif text-xs font-bold tracking-[0.14em]" style={{ color: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.74)' }}>{label}</span>
        <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'rgba(var(--tj-ui-muted),0.58)' }}>{desc}</span>
      </span>
      <span className="h-5 w-9 shrink-0 rounded-full p-0.5" style={{ background: checked ? 'rgba(var(--tj-btn-primary-start),0.36)' : 'rgba(var(--tj-text-secondary),0.28)' }}>
        <span className="block h-4 w-4 rounded-full transition-all" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)', background: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-text-secondary),0.7)' }} />
      </span>
    </button>
  );
}

export function EmptyLibraryBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-none border border-dashed px-6 text-center" style={{ borderColor: 'rgba(var(--tj-border),0.34)', color: 'rgba(var(--tj-ui-faint),0.72)' }}>
      <div>
        <div className="font-serif text-base tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{title}</div>
        <div className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{desc}</div>
      </div>
    </div>
  );
}

export function EntryGrid({ entries, assetMap, activeId, onSelect, onCreate }: { entries: 相册条目[]; assetMap: Map<string, { id?: string; dataUrl?: string; url?: string; localRef?: string; originalUrl?: string }>; activeId?: string; onSelect: (id: string) => void; onCreate: () => void }) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-4 py-16 text-center" style={{ color: 'rgba(var(--tj-ui-faint), 0.72)', background: 'linear-gradient(180deg, rgba(var(--tj-ui-panel),0.45), rgba(var(--tj-ui-panel-strong),0.62))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.15)', clipPath: cardClip }}>
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center font-serif text-2xl" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)', background: 'rgba(var(--tj-btn-primary-start),0.06)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24)', clipPath: smallClip }}>▧</div>
          <div className="font-serif text-base tracking-[0.24em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>暂无图片</div>
          <button type="button" onClick={onCreate} className="mt-5 px-5 py-2.5 font-serif text-xs font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-ui-active-text))', background: activeAccentSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45), 0 0 16px rgba(var(--tj-tech-cyan),0.12)', clipPath: smallClip }}>
            生成 / 导入
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
      {entries.map((entry) => {
        const asset = assetMap.get(entry.assetId);
        const src = 解析相册资源地址(asset) || '';
        return (
          <button key={entry.id} type="button" onClick={() => onSelect(entry.id)} className="group overflow-hidden text-left transition-all" style={{ background: 'rgba(var(--tj-ui-panel), 0.52)', boxShadow: activeId === entry.id ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.78), 0 0 18px rgba(var(--tj-btn-primary-start),0.1)' : entry.nsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.32)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)', clipPath: cardClip }}>
            <div className="aspect-[4/3] ">
              <SafeAlbumImage src={src} alt={entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" />
            </div>
            <div className="px-3 py-2">
              <div className="truncate font-serif text-sm" style={{ color: 'rgb(var(--tj-ui-title))' }}>{entry.title}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted), 0.68)' }}>
                <span>{slotLabel(entry.slot)}</span>
                {entry.nsfw && <span style={{ color: 'rgb(var(--tj-ui-nsfw))' }}>NSFW</span>}
              </div>
            </div>
          </button>
        );
      })}
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
  const activePromptMeta = props.canvasTask
    ? {
        anchorMode: props.canvasTask.anchorMode === true,
        anchorSummary: props.canvasTask.anchorSummary || (props.canvasTask.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
        sourcePrompt: props.canvasTask.sourcePrompt,
      }
    : props.promptMeta;
  const selectedPurpose = props.currentTarget.nsfw
    ? 'nsfw'
    : props.currentTarget.tokenizerMode === 'portrait' ? 'portrait' : 'avatar';
  const selectedCharacterId = props.currentTarget.targetType === 'traveler' ? 'traveler' : props.selectedCharacterId;
  const selectedCharacterLabel = selectedCharacterId === 'traveler'
    ? `${props.travelerName}（主角）`
    : props.companions.find((npc) => npc.id === selectedCharacterId)?.姓名 || '未选择伙伴';
  const parameterPanel = (
    <Panel title="生成参数">
      {props.currentTarget.targetType === 'traveler' || (props.currentTarget.nsfw && selectedCharacterId === 'traveler') ? (
        <TravelerGenerationParameters
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
          targetId={props.currentTarget.id}
          imageRules={props.imageRules}
          onImageRulesChange={props.onImageRulesChange}
          extraRequirement={props.extraRequirement}
          setExtraRequirement={props.setExtraRequirement}
        />
      ) : (
        <NpcGenerationParameters
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
          targetId={props.currentTarget.id}
          imageRules={props.imageRules}
          onImageRulesChange={props.onImageRulesChange}
          extraRequirement={props.extraRequirement}
          setExtraRequirement={props.setExtraRequirement}
        />
      )}
      <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
    </Panel>
  );
  return (
    <div className="space-y-4">
      <StudioHero imageEnabled={props.imageEnabled} currentTarget={props.currentTarget} currentCharacterLabel={selectedCharacterLabel} />
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const displaySize = task?.dimensions ? task.dimensions.replace(/x/i, ' × ') : size ? size.replace(/x/i, ' × ') : '接口默认';
  const stateLabel = task ? statusLabel(task.status) : '草稿';
  const isRunning = task?.status === 'queued' || task?.status === 'running';
  const isFailed = task?.status === 'failed';
  const isSuccess = task?.status === 'success' && Boolean(resultSrc);
  useEffect(() => {
    setPreviewOpen(false);
  }, [resultSrc]);
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
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
              {task?.retryCount ? `已重试 ${task.retryCount} 次` : '任务已进入生成流程'}
            </div>
          </div>
        )}
        <div className="absolute bottom-4 right-4 max-w-[340px] px-3 py-2 text-[11px] leading-relaxed" style={{ color: isFailed ? 'rgba(var(--tj-danger),0.92)' : 'rgba(var(--tj-ui-body),0.86)', background: 'rgba(0,0,0,0.62)', boxShadow: `inset 0 0 0 1px ${isFailed ? 'rgba(255,170,170,0.28)' : 'rgba(var(--tj-btn-primary-start),0.22)'}`, clipPath: smallClip }}>
          {isFailed ? (task?.error || '生成失败，参数已保留。') : isSuccess ? '图片已生成并加入成品库，可继续重试、改参数或前往成品库挂载。' : '生成失败时保留这个画布卡片，直接显示错误、参数和重新生成按钮，不需要重 roll 主剧情。'}
          {isFailed && (
            <button type="button" onClick={onRetry} className="mt-2 block px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>
              重新生成
            </button>
          )}
          {isSuccess && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewOpen(true)} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>完整预览</button>{onOpenGallery && <button type="button" onClick={onOpenGallery} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.94)', background: 'rgba(var(--tj-tech-cyan),0.1)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.22)', clipPath: smallClip }}>查看图库</button>}{onSetReference && <button type="button" disabled={referenceEnabled} onClick={onSetReference} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em] disabled:opacity-55" style={{ color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.22)', clipPath: smallClip }}>{referenceEnabled ? '已设为当前角色参考图' : '设为参考图'}</button>}{onMountSlot && <button type="button" onClick={onMountSlot} className="px-3 py-1.5 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-active-text),1)', background: activeAccentSurface, clipPath: smallClip }}>按当前用途挂载</button>}</div>}
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
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

export function BaseGenerationFields(props: {
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="生成标题"><input value={props.generateTitle} onChange={(e) => props.setGenerateTitle(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} /></Field>
        <Field label="尺寸">
          <select value={props.sizePreset} onChange={(e) => props.setSizePreset(e.target.value as 'default' | '1:1' | '3:4' | '16:9' | 'custom')} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="default">跟随接口默认</option>
            <option value="1:1">头像 1:1</option>
            <option value="3:4">半身/立绘 3:4</option>
            <option value="16:9">场景 16:9</option>
            <option value="custom">自定义</option>
          </select>
        </Field>
      </div>
      {props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
    </>
  );
}

export function ImagePreviewModal({ open, src, title, onClose }: { open: boolean; src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !src) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.86)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-5 top-5 z-[10001] min-h-11 px-4 py-2 font-serif text-xs tracking-[0.16em]"
        style={{
          color: 'rgb(var(--tj-ui-active-text))',
          background: 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.48), 0 12px 36px rgba(0,0,0,0.42)',
          clipPath: smallClip,
        }}
      >
        关闭
      </button>
      <div
        className="relative flex h-[92vh] w-full max-w-6xl items-center justify-center overflow-hidden px-4 py-12"
        style={{
          background: 'linear-gradient(180deg, rgb(var(--tj-bg-primary)), rgb(var(--tj-bg-secondary)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.42), 0 24px 80px rgba(0,0,0,0.62)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-5 top-4 max-w-[70%] truncate font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.82)' }}>
          {title}
        </div>
        <div className="flex h-full w-full items-center justify-center overflow-auto px-2 py-2">
          <ResilientImage src={src} alt={title} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SlotPickerModal({
  open,
  recordName,
  entryTitle,
  recommendedSlot,
  referenceEnabled = false,
  onToggleReference,
  onClose,
  onSelect,
}: {
  open: boolean;
  recordName: string;
  entryTitle: string;
  recommendedSlot?: 图片槽位;
  referenceEnabled?: boolean;
  onToggleReference?: () => void;
  onClose: () => void;
  onSelect: (slot: 图片槽位) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  const slots: Array<{ slot: 图片槽位; title: string; desc: string }> = [
    { slot: 'avatar_profile', title: '档案头像', desc: '用于角色档案、成品库代表图。' },
    { slot: 'avatar_story', title: '正文头像', desc: '用于剧情正文里的角色头像。' },
    { slot: 'avatar_phone', title: '手机头像', desc: '用于手机联系人、聊天头像。' },
    { slot: 'portrait', title: '角色立绘', desc: '用于角色大图与立绘展示。' },
  ];
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="设置到槽位"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl px-4 py-4"
        style={{
          background: 'linear-gradient(180deg, rgb(var(--tj-bg-primary)), rgb(var(--tj-bg-secondary)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.38), 0 24px 80px rgba(0,0,0,0.58)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>设置到槽位</div>
            <div className="mt-1 truncate font-serif text-base font-bold" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{recordName}</div>
            <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>{entryTitle || '当前选中图片'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-3 py-2 font-serif text-xs tracking-[0.14em]"
            style={{ color: 'rgb(var(--tj-ui-active-text))', background: 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))', clipPath: smallClip }}
          >
            关闭
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {slots.map((option) => {
            const recommended = option.slot === recommendedSlot || (recommendedSlot?.startsWith('avatar_') && option.slot === 'avatar_profile');
            return (
              <button
                key={option.slot}
                type="button"
                onClick={() => onSelect(option.slot)}
                className="min-h-[92px] px-4 py-3 text-left transition-all"
                style={{
                  color: recommended ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-text-primary),0.92)',
                  background: recommended ? 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))' : 'rgba(var(--tj-bg-secondary),0.78)',
                  boxShadow: recommended ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.5), 0 0 18px rgba(var(--tj-btn-primary-start),0.12)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif text-sm font-bold tracking-[0.14em]">{option.title}</span>
                  {recommended && <span className="text-[10px] tracking-[0.12em]">推荐</span>}
                </div>
                <div className="mt-2 text-xs leading-relaxed opacity-80">{option.desc}</div>
              </button>
            );
          })}
        </div>
        {onToggleReference && (
          <button
            type="button"
            onClick={onToggleReference}
            className="mt-3 w-full px-4 py-3 text-left transition-all"
            style={{ color: referenceEnabled ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-tech-cyan),0.94)', background: referenceEnabled ? activeAccentSurface : 'rgba(var(--tj-tech-cyan),0.07)', boxShadow: referenceEnabled ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.14em]">{referenceEnabled ? '取消该角色参考图' : '替换为该角色参考图'}</div>
            <div className="mt-1 text-xs leading-relaxed opacity-80">参考图不会改变当前挂载槽位；每个角色只保留一张当前参考图。</div>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function TravelerGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
}) {
  const isAvatar = props.targetId === 'traveler_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = [
    { id: '', title: '无要求', desc: '不附加' },
    ...props.imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
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
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用主控锚点。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}

export function NpcGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
}) {
  const isAvatar = props.targetId === 'npc_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = [
    { id: '', title: '无要求', desc: '不附加' },
    ...props.imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
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
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用角色锚点。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}

export function AnchorModeBadge({ promptMeta }: { promptMeta: PromptMeta | null }) {
  const anchorMode = promptMeta?.anchorMode === true;
  return (
    <div
      className="min-h-[42px] px-3 py-2 text-xs leading-relaxed"
      style={{
        color: anchorMode ? 'rgba(var(--tj-tech-cyan),0.92)' : 'rgba(var(--tj-ui-muted),0.78)',
        background: anchorMode ? 'rgba(var(--tj-tech-cyan),0.06)' : 'rgba(var(--tj-ui-panel-strong),0.34)',
        boxShadow: `inset 0 0 0 1px ${anchorMode ? 'rgba(var(--tj-tech-cyan),0.2)' : 'rgba(var(--tj-btn-primary-start),0.12)'}`,
        clipPath: smallClip,
      }}
    >
      <span className="font-serif font-bold tracking-[0.12em]">{anchorMode ? '角色锚点优先' : '等待提示词'}</span>
      <span className="ml-2" style={{ color: 'rgba(var(--tj-ui-body),0.76)' }}>
        {promptMeta?.anchorSummary || '普通生成会先自动生成提示词；有角色锚点时优先沿用稳定外观。'}
      </span>
    </div>
  );
}

export function OptionButtonGroup(props: {
  label: string;
  value: string;
  options: Array<{ id: string; title: string; desc: string }>;
  onChange: (value: string) => void;
  columns: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>{props.label}</div>
      <div className={`grid gap-3 ${props.columns}`}>
        {props.options.map((option) => {
          const active = props.value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => props.onChange(option.id)}
              className="min-h-[76px] px-3 py-3 text-left transition-all"
              style={{
                color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.86)',
                background: active ? activeAccentSurface : 'rgba(0,0,0,0.34)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.48), 0 0 12px rgba(var(--tj-btn-primary-start),0.12)'
                  : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="font-serif text-base font-bold tracking-[0.14em]">{option.title}</div>
                <div className="mt-1 text-[11px] opacity-78">{option.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DraftActionButton({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  const isNsfw = tone === 'nsfw';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-[54px] w-full px-4 py-3 font-serif text-sm tracking-[0.16em] disabled:opacity-45"
      style={{
        color: isNsfw ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-btn-primary-start),0.94)',
        background: isNsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-btn-primary-start),0.075)',
        boxShadow: isNsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.32)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function ReferenceInjectionHint({ status }: { status: ReferenceInjectionStatus }) {
  const tone = status.code === 'enabled'
    ? {
        color: 'rgba(var(--tj-ui-success),0.98)',
        background: 'rgba(var(--tj-ui-success),0.1)',
        border: 'rgba(var(--tj-ui-success),0.38)',
      }
    : status.code === 'not_applicable'
      ? {
          color: 'rgba(var(--tj-tech-cyan),0.98)',
          background: 'rgba(var(--tj-tech-cyan),0.1)',
          border: 'rgba(var(--tj-tech-cyan),0.36)',
        }
      : {
          color: 'rgba(var(--tj-btn-primary-start),0.98)',
          background: 'rgba(var(--tj-btn-primary-start),0.12)',
          border: 'rgba(var(--tj-btn-primary-start),0.42)',
        };
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-2 py-1 text-[11px] font-medium leading-relaxed"
      style={{ color: tone.color, background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.border}`, clipPath: smallClip }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.color, boxShadow: `0 0 8px ${tone.color}` }} />
      <span>{status.label}</span>
    </div>
  );
}

export function pngStyleSourceLabel(source: PNG画风预设来源): string {
  if (source === 'novelai') return 'NAI 风格';
  if (source === 'sd_webui') return 'SD 风格';
  if (source === 'comfyui') return 'ComfyUI';
  return '通用风格';
}

export function StudioHero({ imageEnabled, currentTarget, currentCharacterLabel }: { imageEnabled: boolean; currentTarget: typeof generateTargets[number]; currentCharacterLabel: string }) {
  const purposeLabel = currentTarget.nsfw ? 'NSFW 参考' : currentTarget.tokenizerMode === 'portrait' ? '立绘' : '头像';
  return (
    <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>◆ 生成工作室</div>
        <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>图片生成</div>
        </div>
        <div className="px-3 py-2 text-xs" style={{ color: imageEnabled ? 'rgba(var(--tj-ui-success),0.9)' : 'rgba(255,180,180,0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
          {imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{currentCharacterLabel} · {purposeLabel}
        </div>
      </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>
          先确定用途、构图和提示词，再把结果送进队列。生成后的图片进入成品库，由玩家决定是否挂到角色、正文快照或手机背景。
        </p>
    </section>
  );
}

export function taskStatusTone(status: 图片生成任务['status']): { color: string; background: string; border: string } {
  if (status === 'failed') return { color: 'rgba(var(--tj-danger),0.94)', background: 'rgba(var(--tj-danger),0.08)', border: 'rgba(var(--tj-danger),0.3)' };
  if (status === 'success') return { color: 'rgba(var(--tj-ui-success),0.94)', background: 'rgba(var(--tj-ui-success),0.08)', border: 'rgba(var(--tj-ui-success),0.28)' };
  if (status === 'cancelled') return { color: 'rgba(var(--tj-ui-faint),0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', border: 'rgba(var(--tj-ui-faint),0.16)' };
  return { color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.08)', border: 'rgba(var(--tj-btn-primary-start),0.28)' };
}

export function taskPromptTitle(task: 图片生成任务): string {
  const kind = task.slot === 'scene' && task.sourcePrompt?.includes('故事快照') ? '故事快照' : slotLabel(task.slot);
  const suffix = task.status === 'failed' ? '失败任务' : task.status === 'success' ? '完成任务' : '生成任务';
  return `${kind} · ${suffix}`;
}

export function displayAlbumEntryTitle(entry: 相册条目, kind?: Exclude<GenerationHistoryFilter, 'all'>): string {
  const title = entry.title.trim();
  if (title && !looksLikeRawPromptTitle(title)) return title;
  return `${historyKindLabel(kind ?? historyKind(entry))} · ${formatGenerationDate(entry.createdAt)}`;
}

export function looksLikeRawPromptTitle(title: string): boolean {
  if (!title) return true;
  if (/[\u4e00-\u9fff]/.test(title)) return false;
  const lower = title.toLowerCase();
  return title.length > 18 || title.includes(',') || /cinematic|fantasy|environment|portrait|masterpiece|prompt|style|anime|illustration|photo/.test(lower);
}

export function imageBackendLabel(backend?: string): string {
  return {
    openai_compatible: 'OpenAI 兼容',
    novelai: 'NovelAI',
    sd_webui: 'SD WebUI',
    comfyui: 'ComfyUI',
  }[backend || ''] ?? (backend || '未记录');
}

export function generationSourceLabel(source?: string): string {
  return {
    manual: '手动生成',
    auto: '正文自动生成',
    retry: '重试生成',
    generated: '生成图片',
    upload: '本地上传',
    remote: '远程图片',
  }[source || ''] ?? (source || '未记录');
}

export function formatGenerationDate(value?: number): string {
  if (!value) return '未记录';
  try {
    return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '未记录';
  }
}

export function historyKind(entry: 相册条目): Exclude<GenerationHistoryFilter, 'all'> {
  const text = [entry.title, entry.note, ...(entry.tags || [])].join(' ');
  if (entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || entry.targetType === 'phone') return 'phone';
  if (/故事快照|快照|正文插图/.test(text)) return 'snapshot';
  if (entry.slot === 'scene' || entry.targetType === 'scene') return 'scene';
  return 'character';
}

export function historyKindLabel(kind: Exclude<GenerationHistoryFilter, 'all'>): string {
  return {
    character: '角色',
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}

export function historyKindTone(kind: Exclude<GenerationHistoryFilter, 'all'>): { color: string; background: string; border: string } {
  if (kind === 'scene') return { color: 'rgba(var(--tj-tech-cyan),0.94)', background: 'rgba(var(--tj-tech-cyan),0.075)', border: 'rgba(var(--tj-tech-cyan),0.24)' };
  if (kind === 'snapshot') return { color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.075)', border: 'rgba(var(--tj-btn-primary-start),0.24)' };
  if (kind === 'phone') return { color: 'rgba(var(--tj-tech-blue),0.94)', background: 'rgba(var(--tj-tech-blue),0.075)', border: 'rgba(var(--tj-tech-blue),0.22)' };
  return { color: 'rgba(var(--tj-ui-body),0.9)', background: 'rgba(var(--tj-ui-panel-strong),0.38)', border: 'rgba(var(--tj-btn-primary-start),0.14)' };
}


export function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-3 py-2" style={{ color: 'rgba(var(--tj-ui-body),0.82)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)', clipPath: smallClip }}>
      <div className="mb-1 font-serif text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>{title}</div>
      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words pr-1">{text}</div>
    </div>
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
  onGenerate: (nsfw?: boolean) => void;
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
  backend: string;
  storySnapshotContext: StorySnapshotRenderContext | null;
  onStorySnapshotContextChange: (value: StorySnapshotRenderContext) => void;
  novelAIOverrides: NovelAITaskOverrides;
  onNovelAIOverridesChange: (value: NovelAITaskOverrides) => void;
  compiledNovelAIPreview: NovelAIRequestPayload | null;
};

function NovelAIStorySnapshotEditor(props: Pick<StorySnapshotWorkspaceProps,
  | 'storySnapshotContext'
  | 'onStorySnapshotContextChange'
  | 'novelAIOverrides'
  | 'onNovelAIOverridesChange'
  | 'compiledNovelAIPreview'
>) {
  const context = props.storySnapshotContext;
  if (!context) return null;
  const patchContext = (patch: Partial<StorySnapshotRenderContext>) => {
    props.onStorySnapshotContextChange({ ...context, ...patch });
  };
  const patchOverride = (patch: NovelAITaskOverrides) => {
    props.onNovelAIOverridesChange({ ...props.novelAIOverrides, ...patch });
  };
  const parameters = props.compiledNovelAIPreview?.parameters;
  const v4Prompt = parameters?.v4_prompt?.caption;
  const v4Negative = parameters?.v4_negative_prompt?.caption;
  return (
    <Panel title="NAI 分层提示词">
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Base Prompt">
            <textarea rows={5} value={context.scenePrompt} onChange={(event) => patchContext({ scenePrompt: event.target.value })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" style={{ clipPath: smallClip }} />
          </Field>
          <Field label="Base Negative">
            <textarea rows={5} value={context.sceneNegativePrompt} onChange={(event) => patchContext({ sceneNegativePrompt: event.target.value })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" style={{ clipPath: smallClip }} />
          </Field>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {context.characters.map((character, index) => (
            <div key={`${character.name}-${index}`} className="space-y-3 p-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.32)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip }}>
              <label className="flex items-center gap-2 text-xs" style={{ color: titleColor }}>
                <input
                  type="checkbox"
                  checked={character.enabled !== false}
                  onChange={(event) => patchContext({
                    characters: context.characters.map((item, characterIndex) => characterIndex === index ? { ...item, enabled: event.target.checked } : item),
                  })}
                />
                <span className="font-serif font-bold">{character.name}</span>
              </label>
              <Field label="Character Prompt">
                <textarea rows={4} value={character.visualPrompt} onChange={(event) => patchContext({ characters: context.characters.map((item, characterIndex) => characterIndex === index ? { ...item, visualPrompt: event.target.value } : item) })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" style={{ clipPath: smallClip }} />
              </Field>
              <Field label="Character Negative">
                <textarea rows={3} value={character.negativePrompt} onChange={(event) => patchContext({ characters: context.characters.map((item, characterIndex) => characterIndex === index ? { ...item, negativePrompt: event.target.value } : item) })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" style={{ clipPath: smallClip }} />
              </Field>
            </div>
          ))}
        </div>
        <details className="p-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
          <summary className="cursor-pointer font-serif text-xs font-bold tracking-[0.12em]" style={{ color: titleColor }}>本次 NAI 覆盖</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Quality 模式">
              <select value={props.novelAIOverrides.qualityMode ?? ''} onChange={(event) => patchOverride({ qualityMode: (event.target.value || undefined) as NovelAITaskOverrides['qualityMode'] })} className="kaituo-input w-full px-3 py-2 text-sm">
                <option value="">沿用接口设置</option><option value="official">官方</option><option value="append">追加</option><option value="replace">替换</option><option value="off">关闭</option>
              </select>
            </Field>
            <Field label="UC 模式">
              <select value={props.novelAIOverrides.ucMode ?? ''} onChange={(event) => patchOverride({ ucMode: (event.target.value || undefined) as NovelAITaskOverrides['ucMode'] })} className="kaituo-input w-full px-3 py-2 text-sm">
                <option value="">沿用接口设置</option><option value="official">官方</option><option value="append">追加</option><option value="replace">替换</option><option value="off">关闭</option>
              </select>
            </Field>
            <Field label="Quality 字符串"><textarea rows={3} value={props.novelAIOverrides.qualityText ?? ''} onChange={(event) => patchOverride({ qualityText: event.target.value })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" /></Field>
            <Field label="UC 字符串"><textarea rows={3} value={props.novelAIOverrides.ucText ?? ''} onChange={(event) => patchOverride({ ucText: event.target.value })} className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs" /></Field>
          </div>
        </details>
        {props.compiledNovelAIPreview && (
          <details className="p-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
            <summary className="cursor-pointer font-serif text-xs font-bold tracking-[0.12em]" style={{ color: titleColor }}>最终编译预览</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="base_caption"><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs" style={{ background: 'rgba(var(--tj-bg-primary),0.48)', color: bodyColor }}>{v4Prompt?.base_caption ?? props.compiledNovelAIPreview.input}</pre></Field>
              <Field label="UC"><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs" style={{ background: 'rgba(var(--tj-bg-primary),0.48)', color: bodyColor }}>{parameters?.uc ?? ''}</pre></Field>
              <Field label="Positive char_captions"><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs" style={{ background: 'rgba(var(--tj-bg-primary),0.48)', color: bodyColor }}>{JSON.stringify(v4Prompt?.char_captions ?? [], null, 2)}</pre></Field>
              <Field label="Negative char_captions"><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs" style={{ background: 'rgba(var(--tj-bg-primary),0.48)', color: bodyColor }}>{JSON.stringify(v4Negative?.char_captions ?? [], null, 2)}</pre></Field>
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

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
      hideAdvancedPrompt={props.backend === 'novelai'}
      lowerContent={(
        <div className="space-y-4">
          {props.backend === 'novelai' && (
            <NovelAIStorySnapshotEditor
              storySnapshotContext={props.storySnapshotContext}
              onStorySnapshotContextChange={props.onStorySnapshotContextChange}
              novelAIOverrides={props.novelAIOverrides}
              onNovelAIOverridesChange={props.onNovelAIOverridesChange}
              compiledNovelAIPreview={props.compiledNovelAIPreview}
            />
          )}
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
                  <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>正文片段</div>
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
                    <StorySnapshotParsingCard />
                  ) : props.summary ? (
                    <StorySnapshotSummaryCard summary={props.summary} prompt={props.prompt} negativePrompt={props.negativePrompt} />
                  ) : (
                    <EmptySnapshotPromptCard />
                  )}
                </div>
              </div>
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="快照解析">
              {props.analyzing ? (
                <StorySnapshotParsingCard />
              ) : props.summary ? (
                <StorySnapshotParsedPanel summary={props.summary} />
              ) : (
                <EmptySnapshotAnalysisCard />
              )}
              <Field label="额外要求">
                <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder="可写镜头、光线、色调、构图禁忌或不想出现的元素。" className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </Panel>
            <Panel title="快照参数">
              <BaseGenerationFields
                generateTitle={props.generateTitle}
                setGenerateTitle={props.setGenerateTitle}
                sizePreset={props.sizePreset}
                setSizePreset={props.setSizePreset}
                customSize={props.customSize}
                setCustomSize={props.setCustomSize}
              />
              <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>故事快照默认更适合横图；如果想做竖向海报可改为自定义。</div>
              <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
            </Panel>
          </div>
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
          <StorySnapshotParsingCard title="正在解析场景" description="正在提取地点、主体、光线与镜头，完成后再显示解析结果。" />
        ) : props.sceneSummary ? (
          <SceneImageParsedPanel summary={props.sceneSummary} />
        ) : (
          <EmptySceneImageAnalysisCard />
        )}
      </Panel>

      <Panel title="场景参数">
        <BaseGenerationFields
          generateTitle={props.generateTitle}
          setGenerateTitle={props.setGenerateTitle}
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
        />
        <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。</div>
        <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
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

export function StorySnapshotSummaryCard({ summary, prompt, negativePrompt }: { summary: StorySnapshotSummary; prompt?: string; negativePrompt?: string }) {
  const rows = [
    ['标题', summary.title],
    ['人物', summary.characters.length ? summary.characters.join('、') : '未明确'],
    ['地点', summary.location],
    ['氛围', summary.atmosphere],
    ['动作', summary.action],
    ['镜头', summary.camera],
    ['避免', summary.avoid],
  ];
  return (
    <div className="space-y-2 px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip }}>
      <div className="font-serif text-sm font-bold tracking-[0.14em]" style={{ color: titleColor }}>{summary.title}</div>
      {rows.slice(1).map(([label, value]) => (
        <InfoLine key={label} label={label} value={value} />
      ))}
      {prompt?.trim() && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.16)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>最终 Prompt</div>
          <div className="max-h-32 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-body),0.78)' }}>{prompt}</div>
        </div>
      )}
      {negativePrompt?.trim() && (
        <div className="border-t pt-3" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.12)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>Negative</div>
          <div className="max-h-20 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{negativePrompt}</div>
        </div>
      )}
    </div>
  );
}

export function StorySnapshotParsedPanel({ summary }: { summary: StorySnapshotSummary }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>快照标题</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{summary.title}</div>
      </div>
      <div className="grid gap-2">
        <SnapshotParsedField label="人物" value={summary.characters.length ? summary.characters.join('、') : '未明确'} />
        <SnapshotParsedField label="地点" value={summary.location} />
        <SnapshotParsedField label="氛围" value={summary.atmosphere} />
        <SnapshotParsedField label="动作" value={summary.action} />
        <SnapshotParsedField label="镜头" value={summary.camera} />
        <SnapshotParsedField label="避免" value={summary.avoid} />
      </div>
    </div>
  );
}

export function SnapshotParsedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.09)', clipPath: smallClip }}>
      <span className="font-serif tracking-[0.12em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.66)' }}>{label}</span>
      <span style={{ color: 'rgba(var(--tj-ui-body),0.82)' }}>{value}</span>
    </div>
  );
}

export function EmptySnapshotAnalysisCard() {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>等待解析</div>
        <div className="mt-2 text-xs leading-relaxed">选择正文来源后点击「生成快照提示词」，这里会显示从正文解析出的画面要素。</div>
      </div>
    </div>
  );
}

export function SceneImageParsedPanel({ summary }: { summary: SceneImageSummary }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>场景标题</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{summary.title}</div>
      </div>
      <div className="grid gap-2">
        <SnapshotParsedField label="地点" value={summary.location} />
        <SnapshotParsedField label="主体" value={summary.subject} />
        <SnapshotParsedField label="氛围" value={summary.atmosphere} />
        <SnapshotParsedField label="镜头" value={summary.camera} />
        <SnapshotParsedField label="避免" value={summary.avoid} />
      </div>
    </div>
  );
}

export function EmptySceneImageAnalysisCard() {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>等待解析</div>
        <div className="mt-2 text-xs leading-relaxed">填写场景说明后点击「解析场景提示词」，这里会显示地点、主体、氛围与镜头。</div>
      </div>
    </div>
  );
}

export function StorySnapshotParsingCard({ title = '正在解析正文', description = '正在提取画面要素并整理最终提示词，完成后再显示解析结果。' }: { title?: string; description?: string }) {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.72)', background: 'rgba(var(--tj-ui-panel-strong),0.3)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip }}>
      <div>
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(var(--tj-btn-primary-start),0.86)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.55)' }} />
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.82)' }}>{title}</div>
        <div className="mt-2 text-xs leading-relaxed">{description}</div>
      </div>
    </div>
  );
}

export function EmptySnapshotPromptCard() {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.7)', background: 'rgba(var(--tj-ui-panel-strong),0.26)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
      <div>
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>等待快照提示词</div>
        <div className="mt-2 text-xs leading-relaxed">选择正文来源后，点击画布下方的「生成快照提示词」。这里会展示提炼出的快照草稿和最终 Prompt。</div>
      </div>
    </div>
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
  const activePromptMeta = props.canvasTask
    ? {
        anchorMode: props.canvasTask.anchorMode === true,
        anchorSummary: props.canvasTask.anchorSummary || (props.canvasTask.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
        sourcePrompt: props.canvasTask.sourcePrompt,
      }
    : props.promptMeta;
  return (
    <div className="space-y-4">
      <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>{props.eyebrow}</div>
            <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>{props.title}</div>
          </div>
          <div className="px-3 py-2 text-xs" style={{ color: props.imageEnabled ? 'rgba(var(--tj-ui-success),0.9)' : 'rgba(255,180,180,0.86)', background: 'rgba(var(--tj-ui-panel-strong),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>
            {props.imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{props.currentTarget.label}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>{props.description}</p>
      </section>

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
              <DraftActionButton disabled={props.generating} onClick={() => props.onGenerate(false)}>
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
            <BaseGenerationFields
              generateTitle={props.generateTitle}
              setGenerateTitle={props.setGenerateTitle}
              sizePreset={props.sizePreset}
              setSizePreset={props.setSizePreset}
              customSize={props.customSize}
              setCustomSize={props.setCustomSize}
            />
            <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{props.defaultSizeHint}</div>
            <GenerationSummary target={props.currentTarget} size={props.resolvedSize} />
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

export function GenerationSummary({ target, size }: { target: typeof generateTargets[number]; size: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <MiniInfo label="分类" value={target.targetType} />
      <MiniInfo label="槽位" value={slotLabel(target.slot)} />
      <MiniInfo label="尺寸" value={size || '接口默认'} />
    </div>
  );
}

export function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-ui-panel-strong),0.38), rgba(var(--tj-ui-panel-strong),0.38))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)', clipPath: smallClip }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.62)' }}>{label}</div>
      <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.82)' }}>{value}</div>
    </div>
  );
}

export function Panel({ title, children, className = '', contentClassName = 'space-y-3' }: { title: string; children: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <div className={`flex flex-col gap-3 px-3 py-3 ${className}`} style={{ background: panelSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.68), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.36)', clipPath: cardClip }}>
      <div className="shrink-0 font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.82)' }}>{title}</div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>{label}</div>{children}</label>;
}

export function Button({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="w-full px-3 py-2 text-xs font-serif tracking-[0.16em] disabled:opacity-45" style={{ color: tone === 'nsfw' ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-btn-primary-start),0.9)', background: tone === 'nsfw' ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: tone === 'nsfw' ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.3)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)', clipPath: smallClip }}>{children}</button>;
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2"><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.68)' }}>{label}</span><span className="truncate">{value}</span></div>;
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border border-transparent"
      style={{ borderTopColor: 'rgba(var(--tj-btn-primary-start),0.88)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.7)' }}
    />
  );
}

export interface CharacterLibraryEntry {
  entry: 相册条目;
  src: string;
  mountSrc?: string;
  sourceLabel?: string;
}

export interface SceneLibraryEntry {
  entry: 相册条目;
  src: string;
  kind: Exclude<SceneLibraryFilter, 'all'>;
  label: string;
}

export interface MountedImageSlot {
  key: string;
  label: string;
  src?: string;
  nsfw?: boolean;
}

export type CharacterLibraryRecord = TravelerLibraryRecord | NpcLibraryRecord;

export interface BaseCharacterLibraryRecord {
  id: string;
  kind: 'traveler' | 'npc';
  name: string;
  alias?: string;
  avatar?: string;
  entries: CharacterLibraryEntry[];
  slots: MountedImageSlot[];
  imageCount: number;
  resourceCount: number;
  mountedCount: number;
}

export interface TravelerLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'traveler';
  traveler: 角色数据结构;
}

export interface NpcLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'npc';
  npc: NPC记录;
}

export function buildCharacterLibraryRecords(
  traveler: 角色数据结构,
  npcs: NPC记录[],
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryRecord[] {
  const entryIndex = buildCharacterAlbumEntryIndex(traveler, npcs, album, includeNsfw);
  const travelerRecord = buildTravelerLibraryRecord(traveler, album, assetMap, entryIndex.get('traveler') ?? []);
  const npcRecords = npcs
    .filter((npc) => !npc.归档 && (npc.阶位 === 'companion' || npc.原著角色))
    .map((npc): NpcLibraryRecord => {
      const slots = [
        { key: 'avatar-profile', label: '档案头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '档案')) },
        { key: 'avatar-story', label: '正文头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '正文')) },
        { key: 'avatar-phone', label: '手机头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '手机')) },
        { key: 'portrait', label: '角色立绘', src: 解析相册资源引用(album, npc.图像档案?.立绘) },
      ];
      const albumEntries = (entryIndex.get(npc.id) ?? [])
        .map((entry) => ({
          entry,
          src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
        }));
      const builtinEntries = buildBuiltinAvatarEntries(npc);
      const entries = [...builtinEntries, ...albumEntries];
      const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
      const resourceCount = entries.length;
      return {
        id: npc.id,
        kind: 'npc',
        name: npc.姓名,
        alias: npc.别名,
        avatar: 解析相册资源引用(album, 读取NPC头像(npc, '档案')),
        npc,
        entries,
        slots,
        imageCount: resourceCount + mountedCount,
        resourceCount,
        mountedCount,
      };
    })
    .sort((a, b) => b.imageCount - a.imageCount || a.npc.姓名.localeCompare(b.npc.姓名, 'zh-Hans-CN'));
  return [travelerRecord, ...npcRecords];
}

export function buildTravelerLibraryRecord(
  traveler: 角色数据结构,
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  indexedEntries?: 相册条目[],
): TravelerLibraryRecord {
  const travelerId = 'traveler';
  const slots: MountedImageSlot[] = [
    { key: 'traveler-avatar-profile', label: '档案头像', src: 解析相册资源引用(album, traveler.图像档案?.头像 || traveler.头像 || undefined) },
    { key: 'traveler-avatar-story', label: '正文头像', src: 解析相册资源引用(album, traveler.图像档案?.正文头像) },
    { key: 'traveler-avatar-phone', label: '手机头像', src: 解析相册资源引用(album, traveler.图像档案?.手机头像) },
    { key: 'traveler-portrait', label: '角色立绘', src: 解析相册资源引用(album, traveler.图像档案?.立绘) },
  ];
  const albumEntries = indexedEntries ?? buildCharacterAlbumEntryIndex(traveler, [], album, false).get(travelerId) ?? [];
  const entries = albumEntries
    .map((entry) => ({
      entry,
      src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
    }));
  const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
  const resourceCount = entries.length;
  return {
    id: travelerId,
    kind: 'traveler',
    name: traveler.姓名 || '旅人',
    alias: traveler.别名,
    avatar: 解析相册资源引用(album, traveler.图像档案?.头像 || traveler.头像 || undefined),
    traveler,
    entries,
    slots,
    imageCount: resourceCount + mountedCount,
    resourceCount,
    mountedCount,
  };
}

export function buildCharacterAlbumEntryIndex(
  traveler: 角色数据结构,
  npcs: NPC记录[],
  album: 相册系统,
  includeNsfw: boolean,
): Map<string, 相册条目[]> {
  const index = new Map<string, 相册条目[]>();
  const indexedEntryIds = new Map<string, Set<string>>();
  const knownIds = new Set(['traveler', ...npcs.map((npc) => npc.id)]);
  const npcNames = npcs.map((npc) => ({
    id: npc.id,
    names: [npc.姓名, npc.别名].map((name) => name?.trim()).filter((name): name is string => Boolean(name)),
  }));

  const add = (targetId: string, entry: 相册条目) => {
    if (!knownIds.has(targetId)) return;
    const entryIds = indexedEntryIds.get(targetId) ?? new Set<string>();
    if (entryIds.has(entry.id)) return;
    entryIds.add(entry.id);
    indexedEntryIds.set(targetId, entryIds);
    const entries = index.get(targetId) ?? [];
    entries.push(entry);
    index.set(targetId, entries);
  };

  for (const entry of album.entries) {
    if (entry.nsfw && !includeNsfw) continue;
    const referenceTargets = 读取图片参考目标(entry);
    const hasCharacterOwner = entry.targetType === 'traveler'
      || (entry.targetType === 'npc' && Boolean(entry.targetId));
    if (!isCharacterLibrarySlot(entry.slot) && referenceTargets.length === 0 && !hasCharacterOwner) continue;

    const targetIds = new Set(referenceTargets);
    if (entry.targetType === 'traveler') targetIds.add('traveler');
    if (entry.targetType === 'npc' && entry.targetId) targetIds.add(entry.targetId);

    if (targetIds.size === 0 && isCharacterLibrarySlot(entry.slot)) {
      const title = entry.title || '';
      if (title.includes(traveler.姓名 || '旅人') || title.includes('旅人')) targetIds.add('traveler');
      const matchedNpc = npcNames.find((npc) => npc.names.some((name) => title.includes(name)));
      if (matchedNpc) targetIds.add(matchedNpc.id);
    }
    for (const targetId of targetIds) add(targetId, entry);
  }
  return index;
}

export function buildAlbumResourceEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryEntry[] {
  return album.entries
    .filter((entry) => {
      if (!includeNsfw && entry.nsfw) return false;
      return (entry.targetType === 'traveler' || entry.targetType === 'npc') && isCharacterLibrarySlot(entry.slot);
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => ({
      entry,
      src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
    }));
}

export function buildSceneLibraryEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
): SceneLibraryEntry[] {
  return album.entries
    .map((entry) => {
      const kind = classifySceneLibraryEntry(entry);
      if (!kind) return null;
      return {
        entry,
        src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
        kind,
        label: sceneLibraryKindLabel(kind),
      };
    })
    .filter((item): item is SceneLibraryEntry => Boolean(item))
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt);
}

export function classifySceneLibraryEntry(entry: 相册条目): Exclude<SceneLibraryFilter, 'all'> | null {
  const tags = new Set((entry.tags ?? []).map((tag) => tag.trim()).filter(Boolean));
  const note = (entry.note ?? '').trim();
  const title = entry.title.trim();
  const kindHint = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (/故事快照|快照|正文插图/.test(kindHint)) return 'snapshot';
  const text = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (tags.has('故事快照') || entry.targetType === 'scene' && /快照|正文插图|剧情瞬间/.test(text)) return 'snapshot';
  if (entry.targetType === 'phone' || entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || tags.has('手机背景') || /手机背景|壁纸/.test(text)) return 'phone';
  if (entry.targetType === 'scene' || entry.slot === 'scene' || tags.has('场景图') || /场景图/.test(text)) return 'scene';
  return null;
}

export function sceneLibraryKindLabel(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}

export function sceneLibraryFilterLabel(filter: SceneLibraryFilter): string {
  return {
    all: '全部资源',
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[filter];
}

export function sceneLibraryKindColor(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.88)',
    snapshot: 'rgba(var(--tj-btn-primary-start),0.88)',
    phone: 'rgba(var(--tj-tech-blue),0.9)',
  }[kind];
}

export function sceneLibraryKindSurface(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.08)',
    snapshot: 'rgba(var(--tj-btn-primary-start),0.08)',
    phone: 'rgba(var(--tj-tech-blue),0.08)',
  }[kind];
}

export function sceneLibraryKindBorder(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: 'rgba(var(--tj-tech-cyan),0.18)',
    snapshot: 'rgba(var(--tj-btn-primary-start),0.18)',
    phone: 'rgba(var(--tj-tech-blue),0.18)',
  }[kind];
}

export function formatAlbumDate(createdAt: number): string {
  if (!createdAt) return '未知时间';
  try {
    return new Date(createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return '未知时间';
  }
}

export function defaultAlbumEntryTags(target: typeof generateTargets[number]): string[] {
  if (target.id === 'scene') return ['场景图'];
  if (target.id === 'phone_wallpaper') return ['手机背景'];
  if (target.targetType === 'traveler' || target.targetType === 'npc') return [slotLabel(target.slot)];
  return [];
}

export function defaultAlbumEntryNote(target: typeof generateTargets[number]): string | undefined {
  if (target.id === 'scene') return '场景图';
  if (target.id === 'phone_wallpaper') return '手机背景';
  return undefined;
}

export function isCharacterLibrarySlot(slot: 图片槽位): boolean {
  return slot === 'avatar_profile' || slot === 'avatar_story' || slot === 'avatar_phone' || slot === 'portrait';
}

export function buildScopedCharacterGalleryEntries(record: CharacterLibraryRecord | null, resourceEntries: CharacterLibraryEntry[]): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = resourceEntries.filter((item) => {
    if (item.entry.targetId === record.id) return true;
    if (record.kind === 'traveler') return item.entry.targetType === 'traveler';
    return item.entry.targetType === 'npc' && item.entry.targetId === record.id;
  });
  const merged = [...record.entries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}

export function buildVisibleCharacterEntries(
  record: CharacterLibraryRecord | null,
  resourceEntries: CharacterLibraryEntry[],
  album: 相册系统,
): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = buildScopedCharacterGalleryEntries(record, resourceEntries);
  const recordEntries = record.entries.filter((item) => isCharacterLibrarySlot(item.entry.slot) || item.entry.targetId === record.id);
  const builtin = record.kind === 'npc' ? buildBuiltinAvatarEntries(record.npc) : buildTravelerBuiltinAvatarEntries(record.traveler, album);
  const merged = [...builtin, ...recordEntries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}

export function isNpcLibraryRecord(record: CharacterLibraryRecord | null | undefined): record is NpcLibraryRecord {
  return record?.kind === 'npc';
}

export function buildBuiltinAvatarEntries(npc: NPC记录): CharacterLibraryEntry[] {
  const canonical = findNpcCanonicalName(npc);
  const set = getBuiltinAvatarSet(canonical);
  if (!set) return [];
  return set.candidates.map((candidate): CharacterLibraryEntry => ({
    entry: {
      id: `builtin-avatar:${npc.id}:${candidate.id}`,
      assetId: candidate.id,
      title: candidate.title,
      targetType: 'npc',
      targetId: npc.id,
      slot: 'avatar_profile',
      tags: ['内置头像', set.canonicalName],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
      referenceTargets: [],
    },
    src: candidate.src,
    mountSrc: candidate.reference,
    sourceLabel: '内置',
  }));
}

export function buildTravelerBuiltinAvatarEntries(traveler: 角色数据结构, album: 相册系统): CharacterLibraryEntry[] {
  const rawAvatar = traveler.图像档案?.头像 || traveler.头像 || '';
  if (rawAvatar.trim().startsWith('asset:')) return [];
  const avatar = 解析相册资源引用(album, rawAvatar) || '';
  if (!avatar) return [];
  return [{
    entry: {
      id: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      assetId: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      title: `${traveler.姓名 || '旅人'}·档案头像`,
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
      tags: ['内置头像', traveler.姓名 || '旅人'],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
      referenceTargets: [],
    },
    src: avatar,
    sourceLabel: '内置',
  }];
}

export function findNpcCanonicalName(npc: NPC记录): string | undefined {
  const avatarSet = getBuiltinAvatarSetForNames(npc.姓名, npc.别名);
  if (avatarSet) return avatarSet.canonicalName;

  const names = [npc.姓名, npc.别名]
    .flatMap((item) => (item ?? '').split(/[\/／|、,，]/))
    .map((item) => item.trim())
    .filter(Boolean);
  for (const name of names) {
    const canonical = matchCanonical(name);
    if (canonical) return canonical.name;
  }
  return undefined;
}

export function mapImageSlotToNpcAvatarSlot(slot: 图片槽位): NPC头像槽位 {
  if (slot === 'avatar_story') return '正文';
  if (slot === 'avatar_phone') return '手机';
  return '档案';
}

export function mapImageSlotToTravelerSlot(slot: 图片槽位): '头像' | '正文头像' | '手机头像' | '立绘' {
  if (slot === 'avatar_story') return '正文头像';
  if (slot === 'avatar_phone') return '手机头像';
  if (slot === 'portrait') return '立绘';
  return '头像';
}

export function mapMountedSlotToNpcAvatarSlot(key: string): NPC头像槽位 {
  if (key === 'avatar-story') return '正文';
  if (key === 'avatar-phone') return '手机';
  return '档案';
}

export function mapMountedSlotToTravelerSlot(key: string): '头像' | '正文头像' | '手机头像' | '立绘' {
  if (key === 'traveler-avatar-story') return '正文头像';
  if (key === 'traveler-avatar-phone') return '手机头像';
  if (key === 'traveler-portrait') return '立绘';
  return '头像';
}

export function buildPresentSceneNpcs(npcs: NPC记录[], sceneText: string): NPC记录[] {
  return selectPresentStorySnapshotNpcs(npcs.filter((npc) => !npc.归档), sceneText);
}

export function buildStorySnapshotSourceOptions(history: 聊天消息[]): StorySnapshotSourceOption[] {
  const assistantMessages = history.filter((message) => message.role === 'assistant' && message.content.trim());
  const latest = assistantMessages[assistantMessages.length - 1]?.content.trim() ?? '';
  const previous = assistantMessages[assistantMessages.length - 2]?.content.trim() ?? latest;
  return [
    { id: 'latest_assistant', title: '最近正文', desc: latest ? '上一条回复' : '暂无正文', text: trimStorySnapshotSource(latest) },
    { id: 'previous_turn', title: '上一回合', desc: previous && previous !== latest ? '再前一条' : '可回退', text: trimStorySnapshotSource(previous) },
    { id: 'manual', title: '手动片段', desc: '自行粘贴', text: '' },
  ];
}

export function characterAnchorHasPersistentContent(anchor?: NPC角色锚点档案): boolean {
  if (!anchor) return false;
  return Boolean(
    anchor.名称?.trim() ||
    anchor.正面提示词?.trim() ||
    anchor.负面提示词?.trim() ||
    Object.values(anchor.结构化特征 ?? {}).some((list) => Array.isArray(list) && list.some((item) => String(item ?? '').trim())),
  );
}

export function buildSceneSourceText(text: string, traveler: 角色数据结构, presentNpcs: NPC记录[]): string {
  const travelerAnchor = traveler.图像档案?.角色锚点;
  return [
    `场景说明：${text || '未填写'}`,
    `主控角色：${traveler.姓名 || '旅人'}`,
    traveler.外貌 ? `主控外貌：${traveler.外貌}` : '',
    travelerAnchor?.正面提示词 ? `主控锚点：${travelerAnchor.正面提示词}` : '',
    travelerAnchor?.负面提示词 ? `主控负面锚点：${travelerAnchor.负面提示词}` : '',
    presentNpcs.length ? `在场角色：${presentNpcs.map((npc) => npc.姓名).join('、')}` : '',
    ...presentNpcs.map((npc) => {
      const anchor = npc.图像档案?.角色锚点;
      return [
        `${npc.姓名}：${[npc.外貌, npc.穿着].filter(Boolean).join('，')}`,
        anchor?.正面提示词 ? `${npc.姓名}锚点：${anchor.正面提示词}` : '',
        anchor?.负面提示词 ? `${npc.姓名}负面锚点：${anchor.负面提示词}` : '',
      ].filter(Boolean).join('\n');
    }),
  ].filter(Boolean).join('\n');
}

export function anchorHasUsableContent(anchor?: NPC角色锚点档案): boolean {
  if (!anchor || anchor.是否启用 === false) return false;
  if (anchor.正面提示词?.trim() || anchor.负面提示词?.trim()) return true;
  return Object.values(anchor.结构化特征 ?? {}).some((list) => Array.isArray(list) && list.some((item) => String(item ?? '').trim()));
}

export function getTravelerAnchorStatus(traveler: 角色数据结构): PromptMeta {
  const anchor = traveler.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `主控锚点：${anchor?.名称 || traveler.姓名 || '旅人'}` : '未使用主控锚点，按旅人档案回退',
  };
}

export function getNpcAnchorStatus(npc: NPC记录): PromptMeta {
  const anchor = npc.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `角色锚点：${anchor?.名称 || npc.姓名}` : '未使用角色锚点，按伙伴档案回退',
  };
}

export function getSceneAnchorStatus(traveler: 角色数据结构, presentNpcs: NPC记录[]): PromptMeta {
  const names: string[] = [];
  const travelerAnchor = traveler.图像档案?.角色锚点;
  if (anchorHasUsableContent(travelerAnchor) && travelerAnchor?.场景生图自动注入 !== false) {
    names.push(travelerAnchor?.名称 || traveler.姓名 || '旅人');
  }
  for (const npc of presentNpcs) {
    const anchor = npc.图像档案?.角色锚点;
    if (anchorHasUsableContent(anchor) && anchor?.场景生图自动注入 !== false) names.push(anchor?.名称 || npc.姓名);
  }
  return {
    anchorMode: names.length > 0,
    anchorSummary: names.length ? `场景锚点：${names.slice(0, 4).join('、')}` : '未使用场景角色锚点',
  };
}

export function buildTravelerSourceText(traveler: 角色数据结构): string {
  return [
    `姓名：${traveler.姓名 || '未命名旅人'}`,
    traveler.性别 ? `性别：${traveler.性别}` : '',
    traveler.年龄 ? `年龄：${traveler.年龄}` : '',
    traveler.身高 ? `身高：${traveler.身高}` : '',
    traveler.身份 ? `身份：${traveler.身份}` : '',
    traveler.外貌 ? `外貌：${traveler.外貌}` : '',
    traveler.性格 ? `性格：${traveler.性格}` : '',
    traveler.背景 ? `背景：${traveler.背景}` : '',
    traveler.能力?.length ? `能力：${traveler.能力.join('、')}` : '',
    traveler.主命途 ? `命途：${traveler.主命途}` : '',
    traveler.图像档案?.角色锚点?.名称 ? `主控锚点名称：${traveler.图像档案.角色锚点.名称}` : '',
    traveler.图像档案?.角色锚点?.正面提示词 ? `主控锚点：${traveler.图像档案.角色锚点.正面提示词}` : '',
    traveler.图像档案?.角色锚点?.负面提示词 ? `主控负面锚点：${traveler.图像档案.角色锚点.负面提示词}` : '',
  ].filter(Boolean).join('\n');
}

export function buildNpcSourceText(npc: NPC记录): string {
  return [
    `姓名：${npc.姓名}`,
    npc.别名 ? `别名：${npc.别名}` : '',
    npc.性别 ? `性别：${npc.性别}` : '',
    npc.原著角色 ? '原著角色：是' : '',
    npc.外貌 ? `外貌：${npc.外貌}` : '',
    npc.穿着 ? `穿着：${npc.穿着}` : '',
    npc.性格 ? `性格：${npc.性格}` : '',
    npc.说话方式 ? `说话方式：${npc.说话方式}` : '',
    npc.介绍 ? `介绍：${npc.介绍}` : '',
    npc.装备摘要 ? `装备：${npc.装备摘要}` : '',
    npc.图像档案?.头像提示词 ? `头像提示词：${npc.图像档案.头像提示词}` : '',
    npc.图像档案?.立绘提示词 ? `立绘提示词：${npc.图像档案.立绘提示词}` : '',
    npc.图像档案?.角色锚点?.名称 ? `角色锚点名称：${npc.图像档案.角色锚点.名称}` : '',
    npc.图像档案?.角色锚点?.正面提示词 ? `角色锚点：${npc.图像档案.角色锚点.正面提示词}` : '',
    npc.图像档案?.角色锚点?.负面提示词 ? `角色负面锚点：${npc.图像档案.角色锚点.负面提示词}` : '',
    npc.NSFW档案?.enabled ? `NSFW档案：${JSON.stringify(npc.NSFW档案)}` : '',
  ].filter(Boolean).join('\n');
}

export function createTask(input: {
  source?: 图片生成任务来源;
  prompt: string;
  negativePrompt?: string;
  sourcePrompt?: string;
  finalPrompt?: string;
  finalNegativePrompt?: string;
  anchorMode?: boolean;
  anchorSummary?: string;
  nsfw: boolean;
  backend: string;
  slot: 图片槽位;
  targetType: 图片目标类型;
  targetId?: string;
  dimensions?: string;
  referenceImageIds?: string[];
  storySnapshotContext?: import('@/models/imageGeneration').StorySnapshotRenderContext;
  novelAIOverrides?: import('@/models/imageGeneration').NovelAITaskOverrides;
}): 图片生成任务 {
  return {
    id: `img_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetType: input.targetType,
    targetId: input.targetId,
    slot: input.slot,
    source: input.source ?? 'manual',
    status: 'running',
    backend: input.backend,
    nsfw: input.nsfw,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    sourcePrompt: input.sourcePrompt,
    finalPrompt: input.finalPrompt,
    finalNegativePrompt: input.finalNegativePrompt,
    anchorMode: input.anchorMode,
    anchorSummary: input.anchorSummary,
    referenceImageIds: input.referenceImageIds ?? [],
    dimensions: input.dimensions,
    storySnapshotContext: normalizeStorySnapshotRenderContext(input.storySnapshotContext),
    novelAIOverrides: normalizeNovelAITaskOverrides(input.novelAIOverrides),
    retryCount: 0,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
}

export function requiresCharacterTarget(target: typeof generateTargets[number]): boolean {
  return target.targetType === 'npc' || target.targetType === 'nsfw_part';
}

export function resolveGenerationTargetId(target: typeof generateTargets[number], overrideTargetId: string | undefined, selectedNpcId: string): string | undefined {
  if (overrideTargetId) return overrideTargetId;
  if (target.targetType === 'traveler') return 'traveler';
  if (requiresCharacterTarget(target)) return selectedNpcId || undefined;
  return undefined;
}

export function deleteAlbumEntry(album: 相册系统, entryId: string): 相册系统 {
  return cleanupAlbumAssets({
    ...album,
    entries: album.entries.filter((entry) => entry.id !== entryId),
  });
}

export function cleanupAlbumAssets(album: 相册系统): 相册系统 {
  const used = new Set(album.entries.map((entry) => entry.assetId));
  const removed = album.assets.filter((asset) => !used.has(asset.id)).map((asset) => asset.id);
  if (removed.length) revokeAlbumAssets(removed);
  return {
    ...album,
    assets: album.assets.filter((asset) => used.has(asset.id)),
  };
}

export function slotLabel(slot: 图片槽位): string {
  const labels: Record<图片槽位, string> = {
    avatar_profile: '档案头像',
    avatar_story: '正文头像',
    avatar_phone: '手机头像',
    portrait: '角色立绘',
    phone_wallpaper: '手机壁纸',
    phone_chat_background: '聊天背景',
    group_avatar: '群聊头像',
    scene: '场景',
    item_icon: '物品图标',
    nsfw_female_chest: 'NSFW 胸部',
    nsfw_female_genital: 'NSFW 女性私处',
    nsfw_male_genital: 'NSFW 男性器',
    nsfw_rear: 'NSFW 后庭',
    nsfw_body_reference: 'NSFW 身体参考',
    reference_image: '参考图',
    misc: '其他',
  };
  return labels[slot] ?? slot;
}

export function statusLabel(status: 图片生成任务['status']): string {
  return {
    queued: '排队中',
    running: '生成中',
    success: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status];
}

export function resolveSize(preset: 'default' | '1:1' | '3:4' | '16:9' | 'custom', customSize: string, slot: 图片槽位): string {
  if (preset === 'custom') return customSize.trim() || defaultSizeForSlot(slot);
  if (preset === '1:1') return '1024x1024';
  if (preset === '3:4') return '1024x1365';
  if (preset === '16:9') return '1280x720';
  return defaultSizeForSlot(slot);
}

export function defaultSizeForSlot(slot: 图片槽位): string {
  if (slot === 'portrait') return '1024x1365';
  if (slot === 'scene' || slot === 'phone_wallpaper' || slot === 'phone_chat_background') return '1280x720';
  return '1024x1024';
}
