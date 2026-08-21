import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { LandingPage } from '@/components/layout/LandingPage';
import { GameView } from '@/components/layout/GameView';
import { TopBar } from '@/components/layout/TopBar';
import { LeftPanel } from '@/components/layout/LeftPanel';
import { RightMenu } from '@/components/layout/RightMenu';
import { SystemDrawer } from '@/components/layout/SystemDrawer';
import { MobileQuickMenu } from '@/components/layout/MobileQuickMenu';
import { ChatList } from '@/components/features/Chat/ChatList';
import { InputArea } from '@/components/features/Chat/InputArea';
import { VariableDrawer } from '@/components/features/Variable/VariableDrawer';
import { VariableRepairPreviewModal } from '@/components/features/Variable/VariableRepairPreviewModal';
import type { VariableRepairPlan } from '@/utils/variableRepair';
import type { SettingsTab } from '@/components/features/Settings/SettingsModal';
import { PathAwakeningInvitation } from '@/components/features/Path/PathAwakeningInvitation';
import { Modal } from '@/components/ui/Modal';
import { TravelerProfileModal } from '@/components/features/Character/TravelerProfileModal';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { saveSetting } from '@/services/dbService';
import { handleLoadById } from '@/hooks/useGame/saveLoadWorkflow';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { NPC记录 } from '@/models/npc';
import type { 记忆失败草稿 } from '@/models/memory';
import type { MemoryRebuildProgress, MemoryRebuildTask } from '@/services/memoryRebuild';
import type { VariableHistoryRepairProgress } from '@/services/variableHistoryRepair';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { setStreamingMessage } from '@/utils/streamingMessageStore';

const NewGameWizard = lazyWithRetry(() => import('@/components/features/NewGame/NewGameWizard').then((module) => ({ default: module.NewGameWizard })));
const SettingsModal = lazyWithRetry(() => import('@/components/features/Settings/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const SaveLoadModal = lazyWithRetry(() => import('@/components/features/SaveLoad/SaveLoadModal').then((module) => ({ default: module.SaveLoadModal })));
const PhoneModal = lazyWithRetry(() => import('@/components/features/Phone/PhoneModal').then((module) => ({ default: module.PhoneModal })));
const WorldbookManagerModal = lazyWithRetry(() => import('@/components/features/Worldbook/WorldbookManagerModal').then((module) => ({ default: module.WorldbookManagerModal })));
const ZhikuManagerModal = lazyWithRetry(() => import('@/components/features/ZhikuV3/ZhikuManagerModal').then((module) => ({ default: module.ZhikuManagerModal })));
const GitHubCloudSaveModal = lazyWithRetry(() => import('@/components/features/CloudSave/GitHubCloudSaveModal').then((module) => ({ default: module.GitHubCloudSaveModal })));
const ReleaseAnnouncementsModal = lazyWithRetry(() => import('@/components/features/Release/ReleaseAnnouncementsModal').then((module) => ({ default: module.ReleaseAnnouncementsModal })));
const PlotPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PlotPanel').then((module) => ({ default: module.PlotPanel })));
const YitingPanel = lazyWithRetry(() => import('@/components/features/GameSystems/YitingPanel').then((module) => ({ default: module.YitingPanel })));
const MemoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/MemoryPanel').then((module) => ({ default: module.MemoryPanel })));
const AlbumPanel = lazyWithRetry(() => import('@/components/features/GameSystems/AlbumPanel').then((module) => ({ default: module.AlbumPanel })));
const SkillPanel = lazyWithRetry(() => import('@/components/features/GameSystems/SkillPanel').then((module) => ({ default: module.SkillPanel })));
const InventoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/InventoryPanel').then((module) => ({ default: module.InventoryPanel })));
const NewsPanel = lazyWithRetry(() => import('@/components/features/GameSystems/NewsPanel').then((module) => ({ default: module.NewsPanel })));
const CompanionPanel = lazyWithRetry(() => import('@/components/features/GameSystems/CompanionPanel').then((module) => ({ default: module.CompanionPanel })));
const PathPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PathPanel').then((module) => ({ default: module.PathPanel })));

const memoryRebuildPanelStyle = {
  background: 'rgba(var(--tj-surface-strong),0.72)',
  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.55)',
};

function LazySurfaceFallback({ label = '系统载入中' }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
      {label}
    </div>
  );
}

function MemoryCompressRetryModal({ failedCount, onRetry, onClose }: { failedCount: number; onRetry: () => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="记忆压缩失败" className="max-w-md">
      <div className="px-4 py-3 text-sm" style={{ color: "rgba(var(--tj-text-primary), 0.9)" }}>
        <p className="mb-3">有 {failedCount} 条记忆总结未能通过 AI 生成摘要，原始材料已保留在记忆系统的「失败草稿」中。</p>
        <p className="mb-3 text-xs" style={{ color: "rgba(var(--tj-text-secondary), 0.75)" }}>可立即重试，或稍后到记忆面板的失败草稿页手动重试。</p>
      </div>
      <div className="flex justify-end gap-2 px-4 pb-3">
        <button onClick={onClose} className="rounded-sm px-4 py-2 text-sm" style={{ color: "rgba(var(--tj-text-secondary), 0.85)", background: "rgba(var(--tj-surface), 0.6)" }}>稍后</button>
        <button onClick={() => { onRetry(); onClose(); }} className="rounded-sm px-4 py-2 text-sm" style={{ color: "#fff", background: "rgb(var(--tj-accent-primary))" }}>立即重试</button>
      </div>
    </Modal>
  );
}

function VariableRepairBatchProgressModal({
  progress,
  onCancel,
}: {
  progress: VariableHistoryRepairProgress;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} title="批量重新解析变量" className="max-w-md">
      <div className="space-y-3 px-4 py-3">
        <div className="text-sm" style={{ color: 'rgba(var(--tj-text-primary),0.9)' }}>
          正在串行解析历史回合，完成后会合并成一次修复预览。
        </div>
        <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>
          已完成 {progress.completed} / {progress.total}{progress.currentMessageId ? ` · 当前 ${progress.currentMessageId.slice(0, 8)}` : ''}
        </div>
        <div className="h-1.5 overflow-hidden" style={{ background: 'rgba(var(--tj-accent-primary),0.14)' }}>
          <div className="h-full transition-all" style={{ width: `${progress.total ? Math.round(progress.completed / progress.total * 100) : 0}%`, background: 'rgb(var(--tj-accent-primary))' }} />
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs" style={{ color: 'rgba(255,145,145,0.94)', boxShadow: 'inset 0 0 0 1px rgba(255,145,145,0.36)' }}>暂停并保留草稿</button>
        </div>
      </div>
    </Modal>
  );
}

function StoryContinuityConfirmationModal({
  confirmation,
  onAccept,
  onReject,
}: {
  confirmation: { kind: string; proposal: Record<string, unknown>; reasons: string[] };
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Modal onClose={onReject} title="剧情跨区确认" className="max-w-lg">
      <div className="space-y-3 px-4 py-3">
        <div className="text-sm" style={{ color: 'rgba(var(--tj-text-primary),0.92)' }}>检测到剧情可能跨越当前区域，系统暂未自动切换世界位置。</div>
        <div className="space-y-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
          {confirmation.reasons.map((reason) => <div key={reason}>· {reason}</div>)}
        </div>
        <div className="font-mono text-xs" style={{ color: 'rgba(var(--tj-tech-cyan),0.86)' }}>{JSON.stringify(confirmation.proposal)}</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onReject} className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.55)' }}>保持当前区域</button>
          <button type="button" onClick={onAccept} className="px-3 py-2 text-xs" style={{ color: 'rgb(var(--tj-on-accent))', background: 'rgb(var(--tj-accent-primary))' }}>确认转场</button>
        </div>
      </div>
    </Modal>
  );
}

function MemoryRebuildModal({
  defaultEnd,
  onClose,
  onAbort,
  onRun,
}: {
  defaultEnd: number;
  onClose: () => void;
  onAbort: () => void;
  onRun: (options: {
    batchSize: number;
    range: { start: number; end: number };
    task?: MemoryRebuildTask;
    onProgress: (progress: MemoryRebuildProgress) => void;
  }) => Promise<MemoryRebuildTask>;
}) {
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.max(1, defaultEnd));
  const [batchSize, setBatchSize] = useState(15);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MemoryRebuildProgress | null>(null);
  const [result, setResult] = useState<MemoryRebuildTask | null>(null);
  const [error, setError] = useState('');

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const task = await onRun({
        batchSize: Math.max(1, Math.min(100, Math.trunc(batchSize) || 15)),
        range: {
          start: Math.max(1, Math.trunc(start) || 1),
          end: Math.max(1, Math.trunc(end) || Math.max(1, defaultEnd)),
        },
        task: result?.status === 'paused_failed' ? result : undefined,
        onProgress: setProgress,
      });
      setResult(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量重建失败。');
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    if (running) onAbort();
    onClose();
  };
  const statusText = result?.status === 'committed'
    ? `已重建 ${result.progress.processedTurns} 回合，四层记忆已一次性替换并自动保存。`
    : result?.status === 'paused_failed'
      ? `在第 ${result.failedBatch?.sourceTurns.start ?? '?'}-${result.failedBatch?.sourceTurns.end ?? '?'} 回合暂停；原记忆未改动，失败批次已保存到失败草稿。`
      : result?.status === 'blocked'
        ? result.blockedReason ?? '当前设置不允许批量重建。'
        : result?.status === 'cancelled'
          ? '重建已取消，原记忆未改动。'
          : '';

  return (
    <Modal title="批量重建记忆" onClose={handleClose} className="max-w-xl">
      <div className="grid gap-4">
        <div className="px-3 py-3 text-[13px] leading-relaxed" style={{ ...memoryRebuildPanelStyle, color: 'rgba(var(--tj-text-secondary),0.86)' }}>
          系统会从存档中的历史正文按回合顺序重新总结。处理中只写入临时 staging；全部批次成功后才替换即时、短期、中期、长期记忆，失败或取消都不会覆盖原记忆。
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="开始回合" value={start} min={1} max={Math.max(1, defaultEnd)} disabled={running || result?.status === 'paused_failed'} onChange={setStart} />
          <NumberField label="结束回合" value={end} min={1} max={Math.max(1, defaultEnd)} disabled={running || result?.status === 'paused_failed'} onChange={setEnd} />
          <NumberField label="每批回合" value={batchSize} min={1} max={100} disabled={running || result?.status === 'paused_failed'} onChange={setBatchSize} />
        </div>
        {progress && (
          <div className="px-3 py-3" style={memoryRebuildPanelStyle}>
            <div className="flex items-center justify-between gap-3 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.84)' }}>
              <span>{running ? '正在重建' : '处理结果'}</span>
              <span>{progress.completedBatches}/{progress.totalBatches} 批 · {progress.processedTurns}/{progress.totalTurns} 回合</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-[rgba(var(--tj-text-secondary),0.12)]">
              <div
                className="h-full bg-[rgb(var(--tj-accent-primary))] transition-[width] duration-200"
                style={{ width: `${progress.totalBatches ? Math.round(progress.completedBatches / progress.totalBatches * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
        {(statusText || error) && (
          <div className="px-3 py-3 text-[13px] leading-relaxed" style={{ ...memoryRebuildPanelStyle, color: error || result?.status === 'paused_failed' || result?.status === 'blocked' ? 'rgba(var(--tj-danger),0.95)' : 'rgba(var(--tj-ui-success),0.95)' }}>
            {error || statusText}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {!running && result?.status === 'paused_failed' && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setProgress(null);
              }}
              className="kaituo-close-btn px-4 py-2 text-sm"
            >
              放弃本次进度
            </button>
          )}
          {running ? (
            <button type="button" onClick={onAbort} className="kaituo-close-btn px-4 py-2 text-sm">取消重建</button>
          ) : (
            <button type="button" onClick={handleClose} className="kaituo-close-btn px-4 py-2 text-sm">关闭</button>
          )}
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={running}
            className="px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
            style={{ color: 'rgb(var(--tj-text-primary))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.5)', background: 'rgba(var(--tj-accent-primary),0.12)' }}
          >
            {running ? '重建中...' : result?.status === 'paused_failed' ? '从失败批次继续' : '开始重建'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 bg-[rgba(var(--tj-bg-primary),0.55)] px-3 py-2 outline-none disabled:opacity-50"
        style={{ color: 'rgb(var(--tj-text-primary))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.6)' }}
      />
    </label>
  );
}

function JourneyLaunchOverlay() {
  const starSeeds = useMemo(
    () => Array.from({ length: 34 }, (_, index) => ({
      id: index,
      x: 8 + ((index * 17) % 84),
      y: 10 + ((index * 29) % 78),
      delay: (index % 8) * 0.045,
      size: 1 + (index % 4) * 0.42,
    })),
    [],
  );

  return (
    <div className="kaituo-journey-launch" role="status" aria-live="polite" aria-label="星轨已接入">
      <div className="kaituo-journey-launch__field" />
      <div className="kaituo-journey-launch__vignette" />
      {starSeeds.map((star) => (
        <span
          key={star.id}
          className="kaituo-journey-launch__star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--a" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--b" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--c" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--d" />
      <div className="kaituo-journey-launch__core">
        <div className="kaituo-journey-launch__ring" />
        <div className="kaituo-journey-launch__glyph" aria-hidden="true">
          <span className="kaituo-journey-launch__starburst kaituo-journey-launch__starburst--main" />
          <span className="kaituo-journey-launch__starburst kaituo-journey-launch__starburst--cross" />
          <span className="kaituo-journey-launch__starburst-core" />
        </div>
        <div className="kaituo-journey-launch__title">星轨已接入</div>
        <div className="kaituo-journey-launch__subtitle">正在校准你的开拓坐标</div>
      </div>
      <div className="kaituo-journey-launch__flash" />
    </div>
  );
}

function HomeJourneyOverlay() {
  const glints = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({
      id: index,
      x: 10 + ((index * 23) % 80),
      y: 14 + ((index * 31) % 70),
      delay: (index % 6) * 0.055,
      drift: index % 2 === 0 ? -1 : 1,
    })),
    [],
  );

  return (
    <div className="kaituo-home-journey" role="status" aria-live="polite" aria-label="旅途入口开启中">
      <div className="kaituo-home-journey__backdrop" />
      <div className="kaituo-home-journey__tracks" />
      {glints.map((glint) => (
        <span
          key={glint.id}
          className="kaituo-home-journey__glint"
          style={{
            left: `${glint.x}%`,
            top: `${glint.y}%`,
            animationDelay: `${glint.delay}s`,
            ['--glint-drift' as string]: glint.drift,
          }}
        />
      ))}
      <div className="kaituo-home-journey__door kaituo-home-journey__door--left" />
      <div className="kaituo-home-journey__door kaituo-home-journey__door--right" />
      <div className="kaituo-home-journey__threshold">
        <div className="kaituo-home-journey__seal">启</div>
        <div className="kaituo-home-journey__title">旅途入口已开启</div>
        <div className="kaituo-home-journey__subtitle">正在进入开拓档案</div>
      </div>
      <div className="kaituo-home-journey__wipe" />
    </div>
  );
}

function SaveLoadOverlay() {
  const dataNodes = useMemo(
    () => Array.from({ length: 24 }, (_, index) => ({
      id: index,
      x: 8 + ((index * 19) % 84),
      y: 12 + ((index * 37) % 74),
      delay: (index % 8) * 0.045,
      size: 2 + (index % 3),
    })),
    [],
  );

  return (
    <div className="kaituo-save-load" role="status" aria-live="polite" aria-label="存档读取中">
      <div className="kaituo-save-load__backdrop" />
      <div className="kaituo-save-load__grid" />
      {dataNodes.map((node) => (
        <span
          key={node.id}
          className="kaituo-save-load__node"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: `${node.size}px`,
            height: `${node.size}px`,
            animationDelay: `${node.delay}s`,
          }}
        />
      ))}
      <div className="kaituo-save-load__archive">
        <div className="kaituo-save-load__frame" />
        <div className="kaituo-save-load__seal">档</div>
        <div className="kaituo-save-load__title">存档索引已唤醒</div>
        <div className="kaituo-save-load__subtitle">正在同步开拓记忆</div>
        <div className="kaituo-save-load__bar"><span /></div>
      </div>
      <div className="kaituo-save-load__scan kaituo-save-load__scan--a" />
      <div className="kaituo-save-load__scan kaituo-save-load__scan--b" />
    </div>
  );
}

function BookOpenOverlay() {
  const motes = useMemo(
    () => Array.from({ length: 22 }, (_, index) => ({
      id: index,
      x: 12 + ((index * 21) % 76),
      y: 18 + ((index * 29) % 62),
      delay: (index % 7) * 0.05,
      drift: index % 2 === 0 ? -1 : 1,
    })),
    [],
  );

  return (
    <div className="kaituo-book-open" role="status" aria-live="polite" aria-label="书页展开中">
      <div className="kaituo-book-open__backdrop" />
      {motes.map((mote) => (
        <span
          key={mote.id}
          className="kaituo-book-open__mote"
          style={{
            left: `${mote.x}%`,
            top: `${mote.y}%`,
            animationDelay: `${mote.delay}s`,
            ['--book-mote-drift' as string]: mote.drift,
          }}
        />
      ))}
      <div className="kaituo-book-open__book">
        <div className="kaituo-book-open__spine" />
        <div className="kaituo-book-open__page kaituo-book-open__page--left"><span /><span /><span /></div>
        <div className="kaituo-book-open__page kaituo-book-open__page--right"><span /><span /><span /></div>
        <div className="kaituo-book-open__leaf kaituo-book-open__leaf--a" />
        <div className="kaituo-book-open__leaf kaituo-book-open__leaf--b" />
      </div>
      <div className="kaituo-book-open__copy">
        <div className="kaituo-book-open__title">如我所书</div>
        <div className="kaituo-book-open__subtitle">正在翻开未署名的页</div>
      </div>
      <div className="kaituo-book-open__glow" />
    </div>
  );
}

function MysteryChatModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="神秘聊天" className="max-w-lg">
      <div className="space-y-4">
        <div
          className="rounded-sm px-4 py-4 text-sm leading-7"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.34)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.7)',
          }}
        >
          <div className="font-serif text-base tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
            960494342
          </div>
          <p className="mt-3" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
            本群只进行内部交流与聊天，禁止对外宣传。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2 font-serif text-sm tracking-[0.18em]"
          style={{
            color: 'rgb(var(--tj-ui-active-text))',
            background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgb(var(--tj-tech-cyan)) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.46)',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
          }}
        >
          关闭
        </button>
      </div>
    </Modal>
  );
}
import type { 相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 命途ID } from '@/models/journey';
import type { 队列任务ID } from '@/models/queueTask';
import { 创建空手机系统 } from '@/models/phone';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { alignStoryWeavingToOpeningArchive, buildPersistedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { getCurrentStoryChapterLabel } from '@/services/storyProgressService';
import { generateTravelerTemplate, type TravelerTemplateContext, type TravelerTemplateDraft } from '@/services/ai/travelerTemplate';

const JOURNEY_LAUNCH_ANIMATION_MS = 1680;
const HOME_JOURNEY_ANIMATION_MS = 1180;
const HOME_JOURNEY_VIEW_SWITCH_MS = 520;
const SAVE_LOAD_ANIMATION_MS = 1040;
const SAVE_LOAD_VIEW_SWITCH_MS = 430;
const BOOK_OPEN_ANIMATION_MS = 1080;
const CANCELLABLE_TASK_TITLES: Partial<Record<队列任务ID, string>> = {
  main_story: '主剧情生成',
  memory: '记忆整理',
  variable: '变量生成',
  news: '星际和平周报',
  yiting: '忆庭召回',
  zhiku: '智库检索',
  phone: '手机来信',
};
const BOOK_OPEN_VIEW_SWITCH_MS = 460;
const JOURNEY_LAUNCH_REDUCED_MOTION_MS = 320;
const HOME_JOURNEY_REDUCED_MOTION_MS = 260;
const HOME_JOURNEY_REDUCED_VIEW_SWITCH_MS = 90;
const SAVE_LOAD_REDUCED_MOTION_MS = 260;
const SAVE_LOAD_REDUCED_VIEW_SWITCH_MS = 90;
const BOOK_OPEN_REDUCED_MOTION_MS = 260;
const BOOK_OPEN_REDUCED_VIEW_SWITCH_MS = 90;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const getJourneyLaunchDelay = () => prefersReducedMotion() ? JOURNEY_LAUNCH_REDUCED_MOTION_MS : JOURNEY_LAUNCH_ANIMATION_MS;
const getHomeJourneyDelay = () => prefersReducedMotion() ? HOME_JOURNEY_REDUCED_MOTION_MS : HOME_JOURNEY_ANIMATION_MS;
const getHomeJourneyViewSwitchDelay = () => prefersReducedMotion() ? HOME_JOURNEY_REDUCED_VIEW_SWITCH_MS : HOME_JOURNEY_VIEW_SWITCH_MS;
const getSaveLoadDelay = () => prefersReducedMotion() ? SAVE_LOAD_REDUCED_MOTION_MS : SAVE_LOAD_ANIMATION_MS;
const getSaveLoadViewSwitchDelay = () => prefersReducedMotion() ? SAVE_LOAD_REDUCED_VIEW_SWITCH_MS : SAVE_LOAD_VIEW_SWITCH_MS;
const getBookOpenDelay = () => prefersReducedMotion() ? BOOK_OPEN_REDUCED_MOTION_MS : BOOK_OPEN_ANIMATION_MS;
const getBookOpenViewSwitchDelay = () => prefersReducedMotion() ? BOOK_OPEN_REDUCED_VIEW_SWITCH_MS : BOOK_OPEN_VIEW_SWITCH_MS;

export default function App() {
  const { state, actions } = useGame();
  const pendingMemoryDraftCount = (state.记忆.失败草稿 ?? []).filter(
    (draft) => draft.status === 'pending' || draft.status === 'retrying',
  ).length;
  const [showSettings, setShowSettings] = useState(false);
  const [showWorldbookManager, setShowWorldbookManager] = useState(false);
  const [showZhikuManager, setShowZhikuManager] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showCloudSave, setShowCloudSave] = useState(false);
  const [showReleaseAnnouncements, setShowReleaseAnnouncements] = useState(false);
  const [showMysteryChat, setShowMysteryChat] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [showMemoryRebuild, setShowMemoryRebuild] = useState(false);
  const [variableRepairPlan, setVariableRepairPlan] = useState<VariableRepairPlan | null>(null);
  const [variableRepairingMessageId, setVariableRepairingMessageId] = useState<string | null>(null);
  const [variableRepairBatchProgress, setVariableRepairBatchProgress] = useState<VariableHistoryRepairProgress | null>(null);
  const variableRepairBatchAbortRef = useRef<AbortController | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('api');
  const [settingsInitialVariableWorkspace, setSettingsInitialVariableWorkspace] = useState<'state' | 'repair'>('state');
  const [activeSystem, setActiveSystem] = useState<GameSystemId | null>(null);
  const [launchingJourney, setLaunchingJourney] = useState(false);
  const [homeJourneyTransitioning, setHomeJourneyTransitioning] = useState(false);
  const [saveLoadTransitioning, setSaveLoadTransitioning] = useState(false);
  const [bookOpenTransitioning, setBookOpenTransitioning] = useState(false);

  const handleMenuSelect = useCallback((id: GameSystemId) => {
    if (id === 'worldbook') {
      setActiveSystem(null);
      setShowWorldbookManager(true);
      return;
    }
    if (id === 'zhiku') {
      setActiveSystem(null);
      setShowZhikuManager(true);
      return;
    }
    setActiveSystem((current) => (current === id ? null : id));
  }, []);

  const handleOpenNews = useCallback(() => setActiveSystem('news'), []);
  const handleOpenProfile = useCallback(() => setShowCharacter(true), []);
  const handleOpenPhone = useCallback(() => setShowPhone(true), []);
  const handleOpenMemoryRebuild = useCallback(() => setShowMemoryRebuild(true), []);
  // 主链压缩手动入口：记忆面板点击"立即压缩记忆"直接静默压缩（不弹确认窗），
  // 失败草稿保留并弹重试提示。
  const handleTriggerManualCompress = useCallback(() => {
    void actions.handleSilentMemoryCompress();
  }, [actions]);
  const handleOpenSaveLoad = useCallback(() => setShowSaveLoad(true), []);
  const handleOpenSettings = useCallback(() => {
    setSettingsInitialVariableWorkspace('state');
    setShowSettings(true);
  }, []);
  const handleOpenVariableRepairCenter = useCallback(() => {
    setSettingsInitialTab('variables');
    setSettingsInitialVariableWorkspace('repair');
    setShowSettings(true);
  }, []);
  const handleCloseSystemDrawer = useCallback(() => setActiveSystem(null), []);
  const handleToggleStreaming = useCallback(() => {
    state.setGameSettings((prev) => ({
      ...prev,
      enableStreaming: !prev.enableStreaming,
    }));
  }, [state.setGameSettings]);
  const handleEditBody = useCallback((id: string, newBody: string) => {
    state.setChatHistory((prev) =>
      prev.map((m) =>
        m.id === id && m.parsedResponse
          ? {
              ...m,
              content: newBody,
              parsedResponse: { ...m.parsedResponse, body: newBody },
            }
          : m,
      ),
    );
  }, [state.setChatHistory]);
  const handleReparseVariables = useCallback(async (messageId: string) => {
    if (state.loading || state.pendingVariable || variableRepairingMessageId) return;
    setVariableRepairingMessageId(messageId);
    try {
      setVariableRepairPlan(await actions.buildVariableRepairPlan(messageId));
    } catch (error) {
      state.setWorkflowHint(error instanceof Error ? error.message : '变量重新解析失败。');
    } finally {
      setVariableRepairingMessageId(null);
    }
  }, [actions, state.loading, state.pendingVariable, state.setWorkflowHint, variableRepairingMessageId]);
  const handleBatchReparseVariables = useCallback(async (messageIds: string[]) => {
    if (state.loading || state.pendingVariable || variableRepairBatchAbortRef.current) return;
    const controller = new AbortController();
    variableRepairBatchAbortRef.current = controller;
    setVariableRepairBatchProgress({ total: messageIds.length, completed: 0 });
    try {
      const plan = await actions.buildVariableRepairBatch(messageIds, {
        signal: controller.signal,
        onProgress: setVariableRepairBatchProgress,
      });
      setVariableRepairPlan(plan);
    } catch (error) {
      if (!controller.signal.aborted) state.setWorkflowHint(error instanceof Error ? error.message : '批量变量重新解析失败。');
    } finally {
      variableRepairBatchAbortRef.current = null;
      setVariableRepairBatchProgress(null);
    }
  }, [actions, state.loading, state.pendingVariable, state.setWorkflowHint]);
  const handleCancelBatchReparse = useCallback(() => {
    variableRepairBatchAbortRef.current?.abort();
  }, []);
  const handleCancelTask = useCallback((id: 队列任务ID) => {
    const title = CANCELLABLE_TASK_TITLES[id];
    if (!title) return;

    state.abortControllerRef.current?.abort();
    state.setQueueTasks((prev) => [
      ...prev,
      {
        id,
        title,
        turn: state.turnCount,
        timestamp: Date.now(),
        status: 'cancelled',
        detail: '玩家已取消本次任务。',
        cancelled: true,
      },
    ]);
    state.setPendingVariable(false);
    state.setLoading(false);
    setStreamingMessage('');
  }, [
    state.abortControllerRef,
    state.setQueueTasks,
    state.turnCount,
    state.setPendingVariable,
    state.setLoading,
  ]);
  const handlePathAwakeningTrigger = useCallback(() => {
    void actions.handleSend('[系统] 踏入命途狭间');
  }, [actions]);
  const handleAwakenedNewPath = useCallback((id: 命途ID) => {
    // TODO: 这里以后接入命途狭间剧情触发。当前只 console。
    console.info('[path] 命途狭间触发:', id);
  }, []);

  const handleHomeNewGame = useCallback(async () => {
    if (homeJourneyTransitioning || saveLoadTransitioning || bookOpenTransitioning || launchingJourney) return;
    void NewGameWizard.preload();
    setHomeJourneyTransitioning(true);
    const totalDelay = getHomeJourneyDelay();
    const switchDelay = Math.min(getHomeJourneyViewSwitchDelay(), totalDelay);
    await wait(switchDelay);
    actions.handleNewGame();
    await wait(Math.max(totalDelay - switchDelay, 0));
    setHomeJourneyTransitioning(false);
  }, [actions, bookOpenTransitioning, homeJourneyTransitioning, launchingJourney, saveLoadTransitioning]);

  const handleHomeLoadSave = useCallback(async () => {
    if (saveLoadTransitioning || homeJourneyTransitioning || bookOpenTransitioning || launchingJourney) return;
    void SaveLoadModal.preload();
    setSaveLoadTransitioning(true);
    const totalDelay = getSaveLoadDelay();
    const switchDelay = Math.min(getSaveLoadViewSwitchDelay(), totalDelay);
    await wait(switchDelay);
    setShowSaveLoad(true);
    await wait(Math.max(totalDelay - switchDelay, 0));
    setSaveLoadTransitioning(false);
  }, [bookOpenTransitioning, homeJourneyTransitioning, launchingJourney, saveLoadTransitioning]);

  const handleHomeWorldbookManager = useCallback(async () => {
    if (bookOpenTransitioning || saveLoadTransitioning || homeJourneyTransitioning || launchingJourney) return;
    void WorldbookManagerModal.preload();
    setBookOpenTransitioning(true);
    const totalDelay = getBookOpenDelay();
    const switchDelay = Math.min(getBookOpenViewSwitchDelay(), totalDelay);
    await wait(switchDelay);
    setShowWorldbookManager(true);
    await wait(Math.max(totalDelay - switchDelay, 0));
    setBookOpenTransitioning(false);
  }, [bookOpenTransitioning, homeJourneyTransitioning, launchingJourney, saveLoadTransitioning]);

  const handleHomeMysteryChat = useCallback(() => {
    if (bookOpenTransitioning || saveLoadTransitioning || homeJourneyTransitioning || launchingJourney) return;
    setShowMysteryChat(true);
  }, [bookOpenTransitioning, homeJourneyTransitioning, launchingJourney, saveLoadTransitioning]);

  const activeMenuItem = activeSystem
    ? GAME_MENU_ITEMS.find((item) => item.id === activeSystem) ?? null
    : null;
  const currentStoryChapter = useMemo(() => {
    return getCurrentStoryChapterLabel(state.剧情编织);
  }, [state.剧情编织]);
  const latestRecallSummary = useMemo(() => {
    if (state.loading && state.liveRecallSummary.trim()) return state.liveRecallSummary.trim();
    const latest = [...state.chatHistory]
      .reverse()
      .find((msg) =>
        msg.role === 'assistant' &&
        (
          msg.debugContext?.recallSummary?.trim() ||
          msg.debugContext?.zhikuRecallPreview?.trim()
        ),
      );
    return latest?.debugContext?.recallSummary?.trim()
      || latest?.debugContext?.zhikuRecallPreview?.trim()
      || '';
  }, [state.chatHistory, state.liveRecallSummary, state.loading]);
  const latestRecallFullContent = useMemo(() => {
    if (state.loading && state.liveRecallFullContent.trim()) return state.liveRecallFullContent.trim();
    const latest = [...state.chatHistory]
      .reverse()
      .find((msg) =>
        msg.role === 'assistant' &&
        (
          msg.debugContext?.recallFullContent?.trim() ||
          msg.debugContext?.zhikuRecallInjection?.trim()
        ),
      );
    return latest?.debugContext?.recallFullContent?.trim()
      || latest?.debugContext?.zhikuRecallInjection?.trim()
      || '';
  }, [state.chatHistory, state.liveRecallFullContent, state.loading]);
  const latestActiveTask = useMemo(() => (
    [...state.queueTasks].reverse().find((task) =>
      ['main_story', 'memory', 'variable', 'news', 'yiting', 'zhiku'].includes(task.id),
    )
  ), [state.queueTasks]);

  const actionOptions = useMemo(() => (
    [...state.chatHistory]
      .reverse()
      .find((m) => m.role === 'assistant')?.parsedResponse?.actionOptions ?? []
  ), [state.chatHistory]);

  const canReroll = useMemo(
    () => state.chatHistory.some((m) => m.role === 'assistant'),
    [state.chatHistory],
  );

  const narrativeImageManualEnabled = Boolean(
    state.gameSettings.文生图系统?.正文生图?.enabled
    && state.gameSettings.文生图系统.正文生图.mode === 'manual',
  );

  const recoveryDraft = useMemo(() => (
    state.interruptedWorkflow ? {
      workflowId: state.interruptedWorkflow.workflowId,
      input: state.interruptedWorkflow.input,
    } : null
  ), [state.interruptedWorkflow]);

  // 自动触发第 0 回合：handleStartGame 把触发文本写入 pendingOpeningTrigger，
  // 此 effect 在 view 切到 'game' 且标记存在时调一次 handleSend，然后清空标记。
  // 注意：先清空再 send，避免 React 18 StrictMode 下重复触发。
  useEffect(() => {
    if (state.view === 'game' && state.pendingOpeningTrigger) {
      const text = state.pendingOpeningTrigger;
      state.setPendingOpeningTrigger(null);
      void actions.handleSend(text);
    }
  }, [state.view, state.pendingOpeningTrigger, state, actions]);

  useEffect(() => {
    if (window.location.pathname === '/oauth/github/callback') {
      setShowCloudSave(true);
    }
  }, []);

  useEffect(() => {
    if (state.view !== 'home') return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preloadZhiku = () => {
      void ZhikuManagerModal.preload();
    };

    if (idleWindow.requestIdleCallback) {
      const idleHandle = idleWindow.requestIdleCallback(preloadZhiku, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(idleHandle);
    }

    const timer = window.setTimeout(preloadZhiku, 300);
    return () => window.clearTimeout(timer);
  }, [state.view]);

  // ── Game shell slots ──
  const topBar = (
    <TopBar
      worldState={state.世界}
      currentTheme={state.currentTheme}
      onHome={actions.handleGoHome}
      news={state.新闻}
      onOpenNews={handleOpenNews}
    />
  );

  const leftPanel = (
    <LeftPanel
      traveler={state.旅人}
      album={state.相册}
      onOpenProfile={handleOpenProfile}
      onOpenPhone={handleOpenPhone}
      phoneUnread={state.手机.unreadTotal}
      currentStoryChapter={currentStoryChapter}
      recallSummary={latestRecallSummary}
      recallFullContent={latestRecallFullContent}
    />
  );

  const rightPanel = (
    <RightMenu
      activeId={activeSystem}
      onSelect={handleMenuSelect}
      onSaveGame={handleOpenSaveLoad}
      onLoadGame={handleOpenSaveLoad}
      onSettings={handleOpenSettings}
      memoryUnread={pendingMemoryDraftCount}
    />
  );

  const chatArea = (
    <>
      <VariableDrawer
        batches={state.variableBatches}
        tasks={state.queueTasks}
        pending={state.pendingVariable}
        onRetryTask={actions.handleRetryQueueTask}
        onCancelTask={handleCancelTask}
        onOpenRepairCenter={handleOpenVariableRepairCenter}
      />
      <ChatList
        messages={state.chatHistory}
        loading={state.loading}
        scrollRef={state.scrollRef}
        npcRecords={state.NPC}
        traveler={state.旅人}
        album={state.相册}
        showInnerVoice={state.gameSettings.enableInnerVoice}
        visualTextSettings={state.gameSettings.visualTextSettings}
        devMode={state.gameSettings.devMode}
        onRegenerateNarrativeImage={actions.handleRegenerateNarrativeImage}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        onEditBody={handleEditBody}
        onReparseVariables={handleReparseVariables}
        variableRepairingMessageId={variableRepairingMessageId}
      />
      <PathAwakeningInvitation
        world={state.世界}
        setWorld={state.set世界}
        onTrigger={handlePathAwakeningTrigger}
        disabled={state.loading || state.pendingVariable}
      />
      <InputArea
        onSend={actions.handleSend}
        onAbort={actions.handleAbort}
        loading={state.loading}
        disabled={state.pendingVariable}
        inputText={state.inputText}
        onInputTextChange={state.setInputText}
        canRestartOpening={state.turnCount <= 5}
        canReroll={canReroll}
        onRestartOpening={actions.handleRestartOpening}
        onReroll={actions.handleReroll}
        streamingEnabled={state.gameSettings.enableStreaming}
        onToggleStreaming={handleToggleStreaming}
        workflowHint={state.workflowHint}
        workflowStatus={state.workflowStatus}
        workflowFailed={latestActiveTask?.status === 'failed'}
        workflowFailCount={latestActiveTask?.failCount ?? (latestActiveTask?.status === 'failed' ? 1 : 0)}
        workflowRetrying={latestActiveTask?.retrying === true}
        onCancelWorkflow={actions.handleAbort}
        actionOptions={actionOptions}
        recoveryDraft={recoveryDraft}
      />
      <SystemDrawer
        open={activeSystem !== null}
        title={activeMenuItem?.label ?? ''}
        subtitle={activeMenuItem?.subtitle}
        glyph={activeMenuItem?.glyph}
        onClose={handleCloseSystemDrawer}
      >
        <Suspense fallback={<LazySurfaceFallback label="系统面板载入中" />}>
          {renderSystemPanel(activeSystem, {
            traveler: state.旅人,
            onTravelerChange: state.set旅人,
            onAwakenedNewPath: handleAwakenedNewPath,
            npcRecords: state.NPC,
            onNpcRecordsChange: state.setNPC,
            album: state.相册,
            onAlbumChange: state.set相册,
            phone: state.手机,
            onPhoneChange: state.set手机,
            memorySystem: state.记忆,
            onMemorySystemChange: state.set记忆,
            failedDrafts: state.记忆.失败草稿 ?? [],
            onRetryFailedDraft: (draft) => void actions.handleRetryMemoryFailureDraft(draft.id),
            onIgnoreFailedDraft: (draft) => void actions.handleIgnoreMemoryFailureDraft(draft.id),
            onOpenMemoryRebuild: handleOpenMemoryRebuild,
            onTriggerManualCompress: handleTriggerManualCompress,
            yitingSystem: state.忆庭,
            zhikuSystem: state.智库,
            memorySettings: state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
            news: state.新闻,
            onNewsChange: state.set新闻,
            plotNodes: state.剧情,
            onPlotNodesChange: state.set剧情,
            storyWeaving: state.剧情编织,
            onStoryWeavingChange: state.set剧情编织,
            gameSettings: state.gameSettings,
            onGameSettingsChange: state.setGameSettings,
            apiSettings: state.apiSettings,
            turnCount: state.turnCount,
            mainChatHistory: state.chatHistory,
          })}
        </Suspense>
      </SystemDrawer>
    </>
  );

  // ── Home ──
  if (state.view === 'home') {
    return (
      <>
        <LandingPage
          onNewGame={handleHomeNewGame}
          onLoadSave={handleHomeLoadSave}
          onSettings={() => {
            setSettingsInitialTab('api');
            setShowSettings(true);
          }}
          onWorldbookManager={handleHomeWorldbookManager}
          onZhikuManager={() => setShowZhikuManager(true)}
          onCloudSave={() => setShowCloudSave(true)}
          onReleaseAnnouncements={() => setShowReleaseAnnouncements(true)}
          onDiscordPost={() => window.open('https://discord.com/channels/1380075940285124724/1509136913792241704', '_blank', 'noopener,noreferrer')}
          onMysteryChat={handleHomeMysteryChat}
        />
        {homeJourneyTransitioning ? <HomeJourneyOverlay /> : null}
        {saveLoadTransitioning ? <SaveLoadOverlay /> : null}
        {bookOpenTransitioning ? <BookOpenOverlay /> : null}
        {showWorldbookManager && (
          <Suspense fallback={<LazySurfaceFallback label="如我所书载入中" />}>
            <WorldbookManagerModal
              worldbooks={state.worldbooks}
              onSave={(books) => {
                state.setWorldbooks(books);
                saveSetting('worldbooks', books);
              }}
              onClose={() => setShowWorldbookManager(false)}
            />
          </Suspense>
        )}
        {showZhikuManager && (
          <Suspense fallback={<LazySurfaceFallback label="智库载入中" />}>
            <ZhikuManagerModal
              zhikuSystem={state.智库}
              storyWeavingSystem={state.剧情编织}
              onZhikuSystemChange={state.set智库}
              onClose={() => setShowZhikuManager(false)}
            />
          </Suspense>
        )}
        {showSaveLoad && (
          <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
            <SaveLoadModal
              onSave={actions.handleSave}
              onLoad={async (id) => {
                const ok = await handleLoadById(id, state);
                if (ok) setShowSaveLoad(false);
                return ok;
              }}
              onClose={() => setShowSaveLoad(false)}
            />
          </Suspense>
        )}
        {showCloudSave && (
          <Suspense fallback={<LazySurfaceFallback label="云存档载入中" />}>
            <GitHubCloudSaveModal
              onSave={actions.handleSave}
              onClose={() => setShowCloudSave(false)}
            />
          </Suspense>
        )}
        {showReleaseAnnouncements && (
          <Suspense fallback={<LazySurfaceFallback label="公告载入中" />}>
            <ReleaseAnnouncementsModal
              onClose={() => setShowReleaseAnnouncements(false)}
            />
          </Suspense>
        )}
        {showMysteryChat && (
          <MysteryChatModal onClose={() => setShowMysteryChat(false)} />
        )}
        {showSettings && (
          <Suspense fallback={<LazySurfaceFallback label="设置载入中" />}>
            <SettingsModal
              onClose={() => setShowSettings(false)}
              apiSettings={state.apiSettings}
              onApiSettingsChange={state.setApiSettings}
              gameSettings={state.gameSettings}
              onGameSettingsChange={state.setGameSettings}
              currentTheme={state.currentTheme}
              onThemeChange={state.setCurrentTheme}
              onSave={actions.handleSave}
              onContinue={actions.handleContinue}
              onLoadSave={(id) => handleLoadById(id, state)}
              initialTab={settingsInitialTab}
              initialVariableWorkspace={settingsInitialVariableWorkspace}
              旅人={state.旅人}
              世界={state.世界}
              on世界Change={state.set世界}
              记忆={state.记忆}
              忆庭={state.忆庭}
              智库={state.智库}
              手机={state.手机}
              NPC={state.NPC}
              新闻={state.新闻}
              剧情编织={state.剧情编织}
              on剧情编织Change={state.set剧情编织}
              getContextSnapshot={actions.getContextSnapshot}

              worldbooks={state.worldbooks}

              onWorldbooksChange={(books) => {

                state.setWorldbooks(books);

                saveSetting('worldbooks', books);

              }}
              variableSetters={{
                set旅人: state.set旅人,
                set世界: state.set世界,
                set记忆: state.set记忆,
                set忆庭: state.set忆庭,
                set智库: state.set智库,
                set手机: state.set手机,
                setNPC: state.setNPC,
                set新闻: state.set新闻,
                set剧情: state.set剧情,
              }}
              variableEditingLocked={state.loading || state.pendingVariable}
              chatHistory={state.chatHistory}
              variableBatches={state.variableBatches}
              onRepairMessage={handleReparseVariables}
              onBatchRepair={handleBatchReparseVariables}
            />
          </Suspense>
        )}
      </>
    );
  }

  // ── New Game Wizard ──
  if (state.view === 'new_game') {
    const getActiveApiConfig = () => {
      if (state.apiSettings.activeConfigId) {
        return state.apiSettings.configs.find((item) => item.id === state.apiSettings.activeConfigId) ?? state.apiSettings.configs[0] ?? null;
      }
      return state.apiSettings.configs[0] ?? null;
    };
    const handleGenerateTravelerTemplate = async (context: TravelerTemplateContext): Promise<TravelerTemplateDraft> => {
      const config = getActiveApiConfig();
      if (!config) throw new Error('请先在设置中配置至少一个 API 接口。');
      return generateTravelerTemplate(config, context);
    };

    const handleStartGame = async (traveler: 角色数据结构, worldState: 世界状态, initialNpcRecords: NPC记录[] = []) => {
      // 预检 API：configs 为空时给出明确提示，不切换 view，避免玩家被困在空白游戏页。
      if (state.apiSettings.configs.length === 0) {
        alert('请先在设置中配置至少一个 API 接口，再开始旅途。');
        return;
      }
      state.set旅人(traveler);
      state.set世界(worldState);
      state.setChatHistory([]);
      state.setTurnCount(1);
      state.set记忆({ 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] });
      state.set忆庭({ 回忆档案: [] });
      // 重置运行时游戏系统切片，避免上一局存档残留污染新局
      state.setNPC(initialNpcRecords);
      state.set手机(创建空手机系统());
      state.set新闻([]);
      state.set剧情([]);
      try {
        const nextStoryWeaving = alignStoryWeavingToOpeningArchive(
          await loadAllBundledStoryWeavingPresets(),
          worldState.开局档案,
        );
        state.set剧情编织(nextStoryWeaving);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
      } catch (err) {
        console.warn('[story-weaving] 新开局加载内置原著剧情失败，保留当前剧情编织状态:', err);
      }
      state.setPendingOpeningTrigger('[系统] 开启第 0 回合');
      setLaunchingJourney(true);
      await wait(getJourneyLaunchDelay());
      state.setView('game');
      setLaunchingJourney(false);
    };

    return (
      <>
        <Suspense fallback={<LazySurfaceFallback label="开局档案载入中" />}>
          <NewGameWizard
            onStart={handleStartGame}
            onBack={() => state.setView('home')}
            currentTheme={state.currentTheme}
            openingArchiveApiConfig={getActiveApiConfig()}
            onGenerateTravelerTemplate={handleGenerateTravelerTemplate}
          />
        </Suspense>
        {homeJourneyTransitioning ? <HomeJourneyOverlay /> : null}
        {launchingJourney ? <JourneyLaunchOverlay /> : null}
      </>
    );
  }

  // ── Game ──
  return (
    <>
      <GameView
        weatherId={state.世界.当前天气}
        topBar={topBar}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        chatArea={chatArea}
      />

      {/* Mobile bottom menu */}
      {!activeSystem && !showSettings && !showWorldbookManager && !showZhikuManager && !showSaveLoad && !showCharacter && !showPhone && !showMemoryRebuild && (
        <MobileQuickMenu
          onHome={actions.handleGoHome}
          onCharacter={handleOpenProfile}
          onPhone={handleOpenPhone}
          onSettings={handleOpenSettings}
          onSave={handleOpenSaveLoad}
          onSystemSelect={handleMenuSelect}
          phoneUnread={state.手机.unreadTotal}
          memoryUnread={pendingMemoryDraftCount}
        />
      )}

      {/* Modals */}
      {showSettings && (
        <Suspense fallback={<LazySurfaceFallback label="设置载入中" />}>
          <SettingsModal
            onClose={() => setShowSettings(false)}
            apiSettings={state.apiSettings}
            onApiSettingsChange={state.setApiSettings}
            gameSettings={state.gameSettings}
            onGameSettingsChange={state.setGameSettings}
            currentTheme={state.currentTheme}
            onThemeChange={state.setCurrentTheme}
            onSave={actions.handleSave}
            onContinue={actions.handleContinue}
            onLoadSave={(id) => handleLoadById(id, state)}
            initialTab={settingsInitialTab}
            initialVariableWorkspace={settingsInitialVariableWorkspace}
            旅人={state.旅人}
            世界={state.世界}
            on世界Change={state.set世界}
            记忆={state.记忆}
            忆庭={state.忆庭}
            智库={state.智库}
            手机={state.手机}
            NPC={state.NPC}
            新闻={state.新闻}
            剧情编织={state.剧情编织}
            on剧情编织Change={state.set剧情编织}
            getContextSnapshot={actions.getContextSnapshot}
            worldbooks={state.worldbooks}
            onWorldbooksChange={(books) => {
              state.setWorldbooks(books);
              saveSetting('worldbooks', books);
            }}
            variableSetters={{
              set旅人: state.set旅人,
              set世界: state.set世界,
              set记忆: state.set记忆,
              set忆庭: state.set忆庭,
              set智库: state.set智库,
              set手机: state.set手机,
              setNPC: state.setNPC,
              set新闻: state.set新闻,
              set剧情: state.set剧情,
            }}
            variableEditingLocked={state.loading || state.pendingVariable}
            chatHistory={state.chatHistory}
            variableBatches={state.variableBatches}
            onRepairMessage={handleReparseVariables}
            onBatchRepair={handleBatchReparseVariables}
          />
        </Suspense>
      )}

      {showCharacter && (
        <TravelerProfileModal
          traveler={state.旅人}
          album={state.相册}
          onClose={() => setShowCharacter(false)}
        />
      )}

      {showPhone && (
        <Suspense fallback={<LazySurfaceFallback label="手机载入中" />}>
          <PhoneModal
            phone={state.手机}
            traveler={state.旅人}
            world={state.世界}
            memory={state.记忆}
            yiting={state.忆庭}
            news={state.新闻}
            storyWeaving={state.剧情编织}
            zhiku={state.智库}
            apiSettings={state.apiSettings}
            gameSettings={state.gameSettings}
            turnCount={state.turnCount}
            mainChatHistory={state.chatHistory}
            npcRecords={state.NPC}
            album={state.相册}
            onPhoneChange={state.set手机}
            onMemoryChange={state.set记忆}
            onYitingChange={state.set忆庭}
            onNpcRecordsChange={state.setNPC}
            onCommitPhoneMemory={actions.commitPhoneMemory}
            onClose={() => setShowPhone(false)}
          />
        </Suspense>
      )}

      {state.记忆压缩失败 && (
        <MemoryCompressRetryModal
          failedCount={state.记忆压缩失败.条数}
          onRetry={() => { void actions.handleSilentMemoryCompress(); }}
          onClose={() => state.set记忆压缩失败(null)}
        />
      )}

      {showMemoryRebuild && (
        <MemoryRebuildModal
          defaultEnd={Math.max(1, state.turnCount - 1)}
          onClose={() => setShowMemoryRebuild(false)}
          onAbort={actions.handleAbort}
          onRun={actions.handleBatchMemoryRebuild}
        />
      )}

      {variableRepairPlan && (
        <VariableRepairPreviewModal
          plan={variableRepairPlan}
          onClose={() => setVariableRepairPlan(null)}
          onCommit={(confirmedItemIds) => actions.commitVariableRepairPlan(variableRepairPlan, confirmedItemIds)}
        />
      )}

      {variableRepairBatchProgress && (
        <VariableRepairBatchProgressModal progress={variableRepairBatchProgress} onCancel={handleCancelBatchReparse} />
      )}

      {state.storyContinuityConfirmation && (
        <StoryContinuityConfirmationModal
          confirmation={state.storyContinuityConfirmation}
          onReject={() => state.setStoryContinuityConfirmation(null)}
          onAccept={() => {
            const proposal = state.storyContinuityConfirmation?.proposal;
            if (proposal?.location && typeof proposal.location === 'string') {
              state.set世界((world) => ({ ...world, 当前地点: proposal.location as string, 当前区域ID: String(proposal.toRegionId ?? world.当前区域ID) }));
              // setter 发布后再落一个独立存档，避免确认转场只停留在 React 内存里。
              window.setTimeout(() => { void actions.handleSave(); }, 0);
            }
            state.setStoryContinuityConfirmation(null);
          }}
        />
      )}

      {showWorldbookManager && (
        <Suspense fallback={<LazySurfaceFallback label="如我所书载入中" />}>
          <WorldbookManagerModal
            worldbooks={state.worldbooks}
            onSave={(books) => {
              state.setWorldbooks(books);
              saveSetting('worldbooks', books);
            }}
            onClose={() => setShowWorldbookManager(false)}
          />
        </Suspense>
      )}

      {showZhikuManager && (
        <Suspense fallback={<LazySurfaceFallback label="智库载入中" />}>
          <ZhikuManagerModal
            zhikuSystem={state.智库}
            storyWeavingSystem={state.剧情编织}
            onZhikuSystemChange={state.set智库}
            onClose={() => setShowZhikuManager(false)}
          />
        </Suspense>
      )}

      {showSaveLoad && (
        <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
          <SaveLoadModal
            onSave={actions.handleSave}
            onLoad={async (id) => {
              const ok = await handleLoadById(id, state);
              if (ok) setShowSaveLoad(false);
              return ok;
            }}
            onClose={() => setShowSaveLoad(false)}
          />
        </Suspense>
      )}

      {showCloudSave && (
        <Suspense fallback={<LazySurfaceFallback label="云存档载入中" />}>
          <GitHubCloudSaveModal
            onSave={actions.handleSave}
            onClose={() => setShowCloudSave(false)}
          />
        </Suspense>
      )}
    </>
  );
}

// ── Inline character editor ──

function renderSystemPanel(
  id: GameSystemId | null,
  ctx: {
    traveler: 角色数据结构;
    onTravelerChange: React.Dispatch<React.SetStateAction<角色数据结构>>;
    onAwakenedNewPath: (id: 命途ID) => void;
    npcRecords: NPC记录[];
    onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
    album: 相册系统;
    onAlbumChange: React.Dispatch<React.SetStateAction<相册系统>>;
    phone: import('@/models/phone').手机系统;
    onPhoneChange: React.Dispatch<React.SetStateAction<import('@/models/phone').手机系统>>;
    memorySystem: 记忆系统;
    onMemorySystemChange: React.Dispatch<React.SetStateAction<记忆系统>>;
    failedDrafts?: 记忆失败草稿[];
    onRetryFailedDraft?: (draft: 记忆失败草稿) => void;
    onIgnoreFailedDraft?: (draft: 记忆失败草稿) => void;
    onOpenMemoryRebuild?: () => void;
    /** 阶段1·主链压缩手动入口：触发三阶段压缩弹窗 */
    onTriggerManualCompress?: () => void;
    yitingSystem: 忆庭系统;
    zhikuSystem: 智库系统;
    memorySettings: import('@/models/settings').记忆系统设置;
    news: 新闻条目[];
    onNewsChange: React.Dispatch<React.SetStateAction<新闻条目[]>>;
    plotNodes: 剧情节点[];
    onPlotNodesChange: React.Dispatch<React.SetStateAction<剧情节点[]>>;
    storyWeaving: import('@/models/storyWeaving').剧情编织系统;
    onStoryWeavingChange: React.Dispatch<React.SetStateAction<import('@/models/storyWeaving').剧情编织系统>>;
    gameSettings: import('@/models/settings').游戏设置;
    onGameSettingsChange: React.Dispatch<React.SetStateAction<import('@/models/settings').游戏设置>>;
    apiSettings: import('@/models/settings').API设置;
    turnCount: number;
    mainChatHistory: import('@/models/chat').聊天消息[];
  },
) {
  switch (id) {
    case 'path':
      return (
        <PathPanel
          traveler={ctx.traveler}
          onTravelerChange={ctx.onTravelerChange}
          onAwakenedNewPath={ctx.onAwakenedNewPath}
        />
      );
      case 'skill':
        return <SkillPanel traveler={ctx.traveler} onTravelerChange={ctx.onTravelerChange} apiSettings={ctx.apiSettings} />;
    case 'inventory':
      return (
        <InventoryPanel
          traveler={ctx.traveler}
          onTravelerChange={ctx.onTravelerChange}
          turnCount={ctx.turnCount}
        />
      );
    case 'companion':
      return (
        <CompanionPanel
          npcRecords={ctx.npcRecords}
          onNpcRecordsChange={ctx.onNpcRecordsChange}
          album={ctx.album}
          turnCount={ctx.turnCount}
          nsfwEnabled={ctx.gameSettings.enableNsfw}
          maleNsfwArchiveEnabled={ctx.gameSettings.enableMaleNsfwArchive}
          devMode={ctx.gameSettings.devMode}
        />
      );
    case 'album':
      return (
        <AlbumPanel
          album={ctx.album}
          onAlbumChange={ctx.onAlbumChange}
          traveler={ctx.traveler}
          onTravelerChange={ctx.onTravelerChange}
          phone={ctx.phone}
          onPhoneChange={ctx.onPhoneChange}
          npcs={ctx.npcRecords}
          onNpcChange={ctx.onNpcRecordsChange}
          apiSettings={ctx.apiSettings}
          gameSettings={ctx.gameSettings}
          onGameSettingsChange={ctx.onGameSettingsChange}
          imageSettings={ctx.gameSettings.文生图系统}
          nsfwEnabled={ctx.gameSettings.enableNsfw}
          nsfwImageEnabled={ctx.gameSettings.文生图系统.enableNsfwImageGeneration}
          mainChatHistory={ctx.mainChatHistory}
        />
      );
    case 'news':
      return (
        <NewsPanel
          news={ctx.news}
          onNewsChange={ctx.onNewsChange}
          turnCount={ctx.turnCount}
        />
      );
    case 'plot':
      return (
        <PlotPanel
          storyWeaving={ctx.storyWeaving}
          onStoryWeavingChange={ctx.onStoryWeavingChange}
          gameSettings={ctx.gameSettings}
          apiSettings={ctx.apiSettings}
        />
      );
    case 'yiting':
      return <YitingPanel yitingSystem={ctx.yitingSystem} />;
    case 'memory':
      return (
        <MemoryPanel
          memorySystem={ctx.memorySystem}
          onMemorySystemChange={ctx.onMemorySystemChange}
          turnCount={ctx.turnCount}
          settings={ctx.memorySettings}
          failedDrafts={ctx.failedDrafts}
          onRetryFailedDraft={ctx.onRetryFailedDraft}
          onIgnoreFailedDraft={ctx.onIgnoreFailedDraft}
          onOpenBatchRebuild={ctx.onOpenMemoryRebuild}
          onTriggerManualCompress={ctx.onTriggerManualCompress}
        />
      );
    default:
      return null;
  }
}
