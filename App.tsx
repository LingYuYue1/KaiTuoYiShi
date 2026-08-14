import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { useDeviceSettings } from '@/hooks/useDeviceSettings';
import { useAiTools, type AiToolsActions } from '@/hooks/useAiTools';
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
import type { SettingsTab } from '@/components/features/Settings/SettingsModal';
import { PathAwakeningInvitation } from '@/components/features/Path/PathAwakeningInvitation';
import { Modal } from '@/components/ui/Modal';
import { TravelerProfileModal } from '@/components/features/Character/TravelerProfileModal';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { saveSetting } from '@/services/dbService';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录, NPC角色锚点档案 } from '@/models/npc';
import type { 世界书 } from '@/models/worldbook';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { setStreamingMessage } from '@/utils/streamingMessageStore';

const NewGameWizard = lazyWithRetry(() => import('@/components/features/NewGame/NewGameWizard').then((module) => ({ default: module.NewGameWizard })));
const SettingsModal = lazyWithRetry(() => import('@/components/features/Settings/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const SaveLoadModal = lazyWithRetry(() => import('@/components/features/SaveLoad/SaveLoadModal').then((module) => ({ default: module.SaveLoadModal })));
const PhoneModal = lazyWithRetry(() => import('@/components/features/Phone/PhoneModal').then((module) => ({ default: module.PhoneModal })));
const WorldbookManagerModal = lazyWithRetry(() => import('@/components/features/Worldbook/WorldbookManagerModal').then((module) => ({ default: module.WorldbookManagerModal })));
const ZhikuManagerModal = lazyWithRetry(() => import('@/components/features/GameSystems/ZhikuManagerModal').then((module) => ({ default: module.ZhikuManagerModal })));
const GitHubCloudSaveModal = lazyWithRetry(() => import('@/components/features/CloudSave/GitHubCloudSaveModal').then((module) => ({ default: module.GitHubCloudSaveModal })));
const ReleaseAnnouncementsModal = lazyWithRetry(() => import('@/components/features/Release/ReleaseAnnouncementsModal').then((module) => ({ default: module.ReleaseAnnouncementsModal })));
const PlotPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PlotPanel').then((module) => ({ default: module.PlotPanel })));
const YitingPanel = lazyWithRetry(() => import('@/components/features/GameSystems/YitingPanel').then((module) => ({ default: module.YitingPanel })));
const ZhikuPanel = lazyWithRetry(() => import('@/components/features/GameSystems/ZhikuPanel').then((module) => ({ default: module.ZhikuPanel })));
const MemoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/MemoryPanel').then((module) => ({ default: module.MemoryPanel })));
const AlbumPanel = lazyWithRetry(() => import('@/components/features/GameSystems/AlbumPanel').then((module) => ({ default: module.AlbumPanel })));
const SkillPanel = lazyWithRetry(() => import('@/components/features/GameSystems/SkillPanel').then((module) => ({ default: module.SkillPanel })));
const InventoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/InventoryPanel').then((module) => ({ default: module.InventoryPanel })));
const NewsPanel = lazyWithRetry(() => import('@/components/features/GameSystems/NewsPanel').then((module) => ({ default: module.NewsPanel })));
const CompanionPanel = lazyWithRetry(() => import('@/components/features/GameSystems/CompanionPanel').then((module) => ({ default: module.CompanionPanel })));
const PathPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PathPanel').then((module) => ({ default: module.PathPanel })));

function LazySurfaceFallback({ label = '系统载入中' }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
      {label}
    </div>
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
import { getCurrentStoryChapterLabel } from '@/services/storyProgressService';
import { generateTravelerTemplate } from '@/services/ai/travelerTemplate';
import type { TravelerTemplateContext, TravelerTemplateDraft, 战技生成草稿, 战技生成上下文, ImageGenerationRequest, ImageGenerationResult, 解析上下文, 场景图解析结果, 故事快照解析结果, CharacterAnchorExtractInput, ImagePromptTokenizerInput, ImagePromptTokenizerResult } from '@/contracts/ai';
import type { 剧情编织系统 } from '@/models/storyWeaving';

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
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const getJourneyLaunchDelay = () => prefersReducedMotion() ? JOURNEY_LAUNCH_REDUCED_MOTION_MS : JOURNEY_LAUNCH_ANIMATION_MS;
const getHomeJourneyDelay = () => prefersReducedMotion() ? HOME_JOURNEY_REDUCED_MOTION_MS : HOME_JOURNEY_ANIMATION_MS;
const getHomeJourneyViewSwitchDelay = () => prefersReducedMotion() ? HOME_JOURNEY_REDUCED_VIEW_SWITCH_MS : HOME_JOURNEY_VIEW_SWITCH_MS;
const getSaveLoadDelay = () => prefersReducedMotion() ? SAVE_LOAD_REDUCED_MOTION_MS : SAVE_LOAD_ANIMATION_MS;
const getSaveLoadViewSwitchDelay = () => prefersReducedMotion() ? SAVE_LOAD_REDUCED_VIEW_SWITCH_MS : SAVE_LOAD_VIEW_SWITCH_MS;
const getBookOpenDelay = () => prefersReducedMotion() ? BOOK_OPEN_REDUCED_MOTION_MS : BOOK_OPEN_ANIMATION_MS;
const getBookOpenViewSwitchDelay = () => prefersReducedMotion() ? BOOK_OPEN_REDUCED_VIEW_SWITCH_MS : BOOK_OPEN_VIEW_SWITCH_MS;

export function App() {
  const { state, actions, canRerollWithTree, rerollParentStatus } = useGame();
  const { apiSettings, gameSettings, theme: currentTheme, worldbooks } = state.deviceSettings;
  const {
    persistGameSettings,
    persistApiSettings,
    persistTheme,
    persistWorldbooks,
    persistApiProfile,
    loadApiProfileSlots,
    persistApiProfileSlots,
    loadAuxApiProfiles,
    persistAuxApiProfiles,
    loadGitHubCloudSaveConfig,
    persistGitHubCloudSaveConfig,
  } = useDeviceSettings();
  const aiTools = useAiTools();
  const {
    fetchModels,
    testConnection,
    testImageGenerationConnection,
    fetchImageGenerationModels,
    fetchComfyWorkflowCandidates,
    loadApiErrorReports,
    clearApiErrorReports,
  } = aiTools;
  const [showSettings, setShowSettings] = useState(false);
  const [showWorldbookManager, setShowWorldbookManager] = useState(false);
  const [showZhikuManager, setShowZhikuManager] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showCloudSave, setShowCloudSave] = useState(() => window.location.pathname === '/oauth/github/callback');
  const [showReleaseAnnouncements, setShowReleaseAnnouncements] = useState(false);
  const [showMysteryChat, setShowMysteryChat] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('api');
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
    setActiveSystem((current) => (current === id ? null : id));
  }, []);

  const handleOpenNews = useCallback(() => setActiveSystem('news'), []);
  const handleOpenProfile = useCallback(() => setShowCharacter(true), []);
  const handleOpenPhone = useCallback(() => setShowPhone(true), []);
  const handleOpenSaveLoad = useCallback(() => setShowSaveLoad(true), []);
  const handleOpenSettings = useCallback(() => setShowSettings(true), []);
  const handleCloseSystemDrawer = useCallback(() => setActiveSystem(null), []);
  const closeTransientUi = useCallback(() => {
    setActiveSystem(null);
    setShowCharacter(false);
    setShowPhone(false);
    setShowSaveLoad(false);
    setShowSettings(false);
    setShowWorldbookManager(false);
    setShowZhikuManager(false);
  }, []);
  const loadSaveIntoGame = useCallback(async (id: number) => {
    // 片 panel-p7：按 ID 读档收敛到门面 handleLoadSave（复用 handleLoadById 的 enterSession 路径），
    // App 不再持有 UseGameStateReturn 直接参与读档，只负责成功后的 UI 关闭。
    const ok = await actions.handleLoadSave(id);
    if (ok) closeTransientUi();
    return ok;
  }, [actions, closeTransientUi]);
  const branchSaveIntoGame = useCallback(async (id: number) => {
    // 回档（分支）：独立动词名收敛到门面 handleBranch（复用 handleBranchFromSave 的
    // enterSession 检查点分叉路径），App 只负责成功后的 UI 关闭。
    const ok = await actions.handleBranch(id);
    if (ok) closeTransientUi();
    return ok;
  }, [actions, closeTransientUi]);
  const handleGoHomeClick = useCallback(() => {
    closeTransientUi();
    actions.handleGoHome();
  }, [actions, closeTransientUi]);
  const handleToggleStreaming = useCallback(() => {
    state.setDeviceGameSettings((prev) => ({
      ...prev,
      enableStreaming: !prev.enableStreaming,
    }));
  }, [state]);
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
  }, [state]);
  const handleCancelTask = useCallback((id: 队列任务ID) => {
    const title = CANCELLABLE_TASK_TITLES[id];
    if (!title) return;

    state.activeWorkflow.abortControllerRef.current?.abort();
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
    state.activeWorkflow.setPendingVariable(false);
    state.activeWorkflow.setLoading(false);
    setStreamingMessage('');
  }, [state]);
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
    if (state.activeWorkflow.loading && state.activeWorkflow.liveRecallSummary.trim()) return state.activeWorkflow.liveRecallSummary.trim();
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
  }, [state.chatHistory, state.activeWorkflow.liveRecallSummary, state.activeWorkflow.loading]);
  const latestRecallFullContent = useMemo(() => {
    if (state.activeWorkflow.loading && state.activeWorkflow.liveRecallFullContent.trim()) return state.activeWorkflow.liveRecallFullContent.trim();
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
  }, [state.chatHistory, state.activeWorkflow.liveRecallFullContent, state.activeWorkflow.loading]);

  const actionOptions = useMemo(() => (
    [...state.chatHistory]
      .reverse()
      .find((m) => m.role === 'assistant')?.parsedResponse?.actionOptions ?? []
  ), [state.chatHistory]);

  // reroll 可用性 = 已有可滚动的 assistant 回复 && 当前叶子存在可回退的父检查点。
  // canRerollWithTree 由 useGame 依据 useGameState 的响应式 activeTreeMeta 计算
  // （读档水合 / 封版晋升 / 新局初始化 / 整树删除时联动，触发 React 重渲染）；
  // 导入无根单独切片存档或根叶子无父检查点时，UI 直接禁用 reroll 按钮。
  const canReroll = useMemo(
    () => state.chatHistory.some((m) => m.role === 'assistant') && canRerollWithTree,
    [state.chatHistory, canRerollWithTree],
  );
  const rerollDisabledReason = useMemo(
    () => (rerollParentStatus === 'pending'
      ? '正在验证历史存档…'
      : !canRerollWithTree ? '当前没有可以回退的历史存档' : undefined),
    [rerollParentStatus, canRerollWithTree],
  );

  const narrativeImageManualEnabled = gameSettings.文生图系统.正文生图.enabled
    && gameSettings.文生图系统.正文生图.mode === 'manual';

  const recoveryDraft = useMemo(() => (
    state.activeWorkflow.interruptedWorkflow?.phase === 'main_request' ? {
      workflowId: state.activeWorkflow.interruptedWorkflow.workflowId,
      input: state.activeWorkflow.interruptedWorkflow.input,
    } : null
  ), [state.activeWorkflow.interruptedWorkflow]);

  // 回合忙碌门：主流程或变量结算任一在跑，就禁止变更类操作（发送/编辑/触发）。
  // loading 与 pendingVariable 是管线的两条独立轨道，这里只在 UI 层合成展示用谓词。
  const turnBusy = state.activeWorkflow.loading || state.activeWorkflow.pendingVariable;

  // 自动触发第 0 回合：handlePrepareNewGame 初始化时把触发文本写入 pendingOpeningTrigger，
  // 此 effect 在 view 切到 'game' 且标记存在时调一次 handleSend，然后清空标记。
  // 注意：先清空再 send，避免 React 18 StrictMode 下重复触发。
  useEffect(() => {
    if (state.view === 'game' && state.pendingOpeningTrigger && !state.activeWorkflow.interruptedWorkflow) {
      const text = state.pendingOpeningTrigger;
      state.setPendingOpeningTrigger(null);
      void actions.handleSend(text);
    }
  }, [state.view, state.pendingOpeningTrigger, state, actions]);

  useEffect(() => {
    if (state.view !== 'home') return;

    const idleWindow: Partial<Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>> = window;
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
      currentTheme={currentTheme}
      onHome={handleGoHomeClick}
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
    />
  );

  const chatArea = (
    <>
      <VariableDrawer
        batches={state.variableBatches}
        tasks={state.queueTasks}
        pending={state.activeWorkflow.pendingVariable}
        onRetryTask={actions.handleRetryQueueTask}
        onCancelTask={handleCancelTask}
      />
      <ChatList
        messages={state.chatHistory}
        loading={state.activeWorkflow.loading}
        scrollRef={state.scrollRef}
        npcRecords={state.NPC}
        traveler={state.旅人}
        album={state.相册}
        showInnerVoice={gameSettings.enableInnerVoice}
        visualTextSettings={gameSettings.visualTextSettings}
        onRegenerateNarrativeImage={actions.handleRegenerateNarrativeImage}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        onEditBody={handleEditBody}
      />
      <PathAwakeningInvitation
        world={state.世界}
        setWorld={state.set世界}
        onTrigger={handlePathAwakeningTrigger}
        disabled={turnBusy}
      />
      {state.activeWorkflow.interruptedWorkflow && state.activeWorkflow.interruptedWorkflow.phase !== 'main_request'
        && !turnBusy ? (
          <div
            className="mx-3 mb-2 flex flex-wrap items-center gap-2 border px-3 py-2 text-sm"
            style={{
              borderColor: 'rgba(var(--tj-accent),0.35)',
              background: 'rgba(var(--tj-surface),0.94)',
              color: 'rgb(var(--tj-text-primary))',
            }}
            role="status"
          >
            <span className="min-w-0 flex-1">上次生成被中断，回复已落地、结算未完成。</span>
            <button
              type="button"
              className="border px-3 py-1 text-xs hover:opacity-80"
              style={{ borderColor: 'rgba(var(--tj-accent),0.5)' }}
              onClick={() => { void actions.handleResumeInterruptedWorkflow(); }}
            >
              继续结算
            </button>
            <button
              type="button"
              className="border px-3 py-1 text-xs hover:opacity-80"
              style={{ borderColor: 'rgba(var(--tj-text-secondary),0.35)' }}
              onClick={() => { void actions.handleAbandonInterruptedWorkflow(); }}
            >
              放弃
            </button>
          </div>
        ) : null}
      <InputArea
        key={state.activeWorkflow.sessionEpoch}
        onSend={(text) => { void actions.handleSend(text); }}
        onAbort={actions.handleAbort}
        loading={state.activeWorkflow.loading}
        disabled={state.activeWorkflow.pendingVariable}
        canRestartOpening={state.turnCount <= 5}
        canReroll={canReroll}
        rerollDisabledReason={rerollDisabledReason}
        onRestartOpening={() => {
          void actions.handleRestartOpening();
        }}
        onReroll={actions.handleReroll}
        streamingEnabled={gameSettings.enableStreaming}
        onToggleStreaming={handleToggleStreaming}
        turnStatus={state.activeWorkflow.turnStatus}
        onCancelWorkflow={actions.handleAbort}
        actionOptions={actionOptions}
        recoveryDraft={recoveryDraft}
        onParseActionOptions={actions.handleParseActionOptionsBlock}
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
            yitingSystem: state.忆庭,
            zhikuSystem: state.智库,
            onZhikuSystemChange: state.set智库,
            zhikuSettings: gameSettings.智库系统,
            memorySettings: gameSettings.记忆系统,
            news: state.新闻,
            onNewsChange: state.set新闻,
            plotNodes: state.剧情,
            onPlotNodesChange: state.set剧情,
            storyWeaving: state.剧情编织,
            onStoryWeavingChange: state.set剧情编织,
            gameSettings,
            onGameSettingsChange: state.setDeviceGameSettings,
            onPersistGameSettings: persistGameSettings,
            apiSettings,
            turnCount: state.turnCount,
            mainChatHistory: state.chatHistory,
            fetchModels,
            testImageGenerationConnection,
            fetchImageGenerationModels,
            fetchComfyWorkflowCandidates,
            onSaveStoryWeaving: actions.handleSaveStoryWeaving,
            onGenerateSkillDraft: actions.handleGenerateSkillDraft,
            onSaveZhikuSystem: actions.handleSaveZhikuSystem,
            onZhikuMigration: actions.handleZhikuMigration,
            onGenerateAlbumImage: actions.handleGenerateAlbumImage,
            onParseSceneImagePrompt: actions.handleParseSceneImagePrompt,
            onParseStorySnapshotPrompt: actions.handleParseStorySnapshotPrompt,
            onExtractCharacterAnchor: actions.handleExtractCharacterAnchor,
            onTokenizeImagePrompt: actions.handleTokenizeImagePrompt,
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
          onNewGame={() => { void handleHomeNewGame(); }}
          onLoadSave={() => { void handleHomeLoadSave(); }}
          onSettings={() => {
            setSettingsInitialTab('api');
            setShowSettings(true);
          }}
          onWorldbookManager={() => { void handleHomeWorldbookManager(); }}
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
              worldbooks={worldbooks}
              onSave={(books: 世界书[]) => {
                state.setDeviceWorldbooks(books);
                void saveSetting('worldbooks', books);
              }}
              onClose={() => setShowWorldbookManager(false)}
            />
          </Suspense>
        )}
        {showZhikuManager && (
          <Suspense fallback={<LazySurfaceFallback label="智库载入中" />}>
            <ZhikuManagerModal
              zhikuSystem={state.智库}
              onZhikuSystemChange={state.set智库}
              settings={gameSettings.智库系统}
              onSaveZhikuSystem={actions.handleSaveZhikuSystem}
              onZhikuMigration={actions.handleZhikuMigration}
              onClose={() => setShowZhikuManager(false)}
            />
          </Suspense>
        )}
        {showSaveLoad && (
          <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
            <SaveLoadModal
              showAutoArchives={gameSettings.enableAutoSaveEveryTurn}
              onExportActiveLeafPackage={actions.handleExportActiveLeafPackage}
              onLoad={loadSaveIntoGame}
              onBranch={branchSaveIntoGame}
              onDeleteSave={actions.handleDeleteSave}
              onDeleteSaveTree={actions.handleDeleteSaveTree}
              onClearActiveSaveTreeMeta={actions.handleClearActiveSaveTreeMeta}
              onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
              onStartSaveCatalogRepair={actions.handleStartSaveCatalogRepair}
              onSubscribeSaveCatalogRepair={actions.handleSubscribeSaveCatalogRepair}
              onRepairSaveDatabase={actions.handleRepairSaveDatabase}
              onDeleteLegacyBackupSaves={actions.handleDeleteLegacyBackupSaves}
              onExportSavePackage={actions.handleExportSavePackage}
              onExportSaveTreePackage={actions.handleExportSaveTreePackage}
              onImportSaveFileAsMany={actions.handleImportSaveFileAsMany}
              onClose={() => setShowSaveLoad(false)}
            />
          </Suspense>
        )}
        {showCloudSave && (
          <Suspense fallback={<LazySurfaceFallback label="云存档载入中" />}>
            <GitHubCloudSaveModal
              onClose={() => setShowCloudSave(false)}
              onLoadCloudConfig={loadGitHubCloudSaveConfig}
              onPersistCloudConfig={persistGitHubCloudSaveConfig}
              onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
              onLoadSaveForCloudTransfer={actions.handleLoadSaveForCloudTransfer}
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
              deviceSettings={state.deviceSettings}
              onApiSettingsChange={state.setDeviceApiSettings}
              onGameSettingsChange={state.setDeviceGameSettings}
              onThemeChange={state.setDeviceTheme}
              onPersistGameSettings={persistGameSettings}
              onPersistApiSettings={persistApiSettings}
              onPersistTheme={persistTheme}
              onPersistApiProfile={persistApiProfile}
              onLoadApiProfileSlots={loadApiProfileSlots}
              onPersistApiProfileSlots={persistApiProfileSlots}
              onLoadAuxApiProfiles={loadAuxApiProfiles}
              onPersistAuxApiProfiles={persistAuxApiProfiles}
              fetchModels={fetchModels}
              testConnection={testConnection}
              loadApiErrorReports={loadApiErrorReports}
              clearApiErrorReports={clearApiErrorReports}
              onContinue={actions.handleContinue}
              onLoadSave={loadSaveIntoGame}
              onBranchSave={branchSaveIntoGame}
              initialTab={settingsInitialTab}
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

              onWorldbooksChange={(books: 世界书[]) => {

                state.setDeviceWorldbooks(books);

                void persistWorldbooks(books);

              }}
              onDeleteSave={actions.handleDeleteSave}
              onDeleteSaveTree={actions.handleDeleteSaveTree}
              onClearActiveSaveTreeMeta={actions.handleClearActiveSaveTreeMeta}
              onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
              onStartSaveCatalogRepair={actions.handleStartSaveCatalogRepair}
              onSubscribeSaveCatalogRepair={actions.handleSubscribeSaveCatalogRepair}
              onRepairSaveDatabase={actions.handleRepairSaveDatabase}
              onDeleteLegacyBackupSaves={actions.handleDeleteLegacyBackupSaves}
              onExportSavePackage={actions.handleExportSavePackage}
              onExportSaveTreePackage={actions.handleExportSaveTreePackage}
              onImportSaveFileAsMany={actions.handleImportSaveFileAsMany}
              onExtractTavernRegexScripts={actions.handleExtractTavernRegexScripts}
              onAnalyzeTavernRegexScript={actions.handleAnalyzeTavernRegexScript}
              onDryRunTavernRegexScript={actions.handleDryRunTavernRegexScript}
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
              variableEditingLocked={turnBusy}
            />
          </Suspense>
        )}
      </>
    );
  }

  // ── New Game Wizard ──
  if (state.view === 'new_game') {
    const getActiveApiConfig = () => {
      if (apiSettings.activeConfigId) {
        return apiSettings.configs.find((item) => item.id === apiSettings.activeConfigId) ?? apiSettings.configs.at(0) ?? null;
      }
      return apiSettings.configs.at(0) ?? null;
    };
    const handleGenerateTravelerTemplate = async (context: TravelerTemplateContext): Promise<TravelerTemplateDraft> => {
      const config = getActiveApiConfig();
      if (!config) throw new Error('请先在设置中配置至少一个 API 接口。');
      return generateTravelerTemplate(config, context);
    };

    return (
      <>
        <Suspense fallback={<LazySurfaceFallback label="开局档案载入中" />}>
          <NewGameWizard
            onStart={async (draft) => {
              // 预检失败（无 API 配置）时 handlePrepareNewGame 返回 false，不切 view，玩家留在开局页。
              const ok = await actions.handlePrepareNewGame(draft);
              if (!ok) return;
              setLaunchingJourney(true);
              await wait(getJourneyLaunchDelay());
              state.setView('game');
              setLaunchingJourney(false);
            }}
            onBack={() => state.setView('home')}
            onLoadOpeningPresets={actions.handleLoadOpeningPresets}
            onSaveOpeningPresets={actions.handleSaveOpeningPresets}
            onParseOpeningArchive={actions.handleParseOpeningArchive}
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
      {!activeSystem && !showSettings && !showWorldbookManager && !showZhikuManager && !showSaveLoad && !showCharacter && !showPhone && (
        <MobileQuickMenu
          onHome={handleGoHomeClick}
          onCharacter={handleOpenProfile}
          onPhone={handleOpenPhone}
          onSettings={handleOpenSettings}
          onSave={handleOpenSaveLoad}
          onSystemSelect={handleMenuSelect}
          phoneUnread={state.手机.unreadTotal}
        />
      )}

      {/* Modals */}
      {showSettings && (
        <Suspense fallback={<LazySurfaceFallback label="设置载入中" />}>
          <SettingsModal
            onClose={() => setShowSettings(false)}
            deviceSettings={state.deviceSettings}
            onApiSettingsChange={state.setDeviceApiSettings}
            onGameSettingsChange={state.setDeviceGameSettings}
            onThemeChange={state.setDeviceTheme}
            onPersistGameSettings={persistGameSettings}
            onPersistApiSettings={persistApiSettings}
            onPersistTheme={persistTheme}
            onPersistApiProfile={persistApiProfile}
            onLoadApiProfileSlots={loadApiProfileSlots}
            onPersistApiProfileSlots={persistApiProfileSlots}
            onLoadAuxApiProfiles={loadAuxApiProfiles}
            onPersistAuxApiProfiles={persistAuxApiProfiles}
            fetchModels={fetchModels}
            testConnection={testConnection}
            loadApiErrorReports={loadApiErrorReports}
            clearApiErrorReports={clearApiErrorReports}
            onContinue={actions.handleContinue}
            onLoadSave={loadSaveIntoGame}
            onBranchSave={branchSaveIntoGame}
            initialTab={settingsInitialTab}
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
            onWorldbooksChange={(books: 世界书[]) => {
              state.setDeviceWorldbooks(books);
              void persistWorldbooks(books);
            }}
            onDeleteSave={actions.handleDeleteSave}
            onDeleteSaveTree={actions.handleDeleteSaveTree}
            onClearActiveSaveTreeMeta={actions.handleClearActiveSaveTreeMeta}
            onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
            onStartSaveCatalogRepair={actions.handleStartSaveCatalogRepair}
            onSubscribeSaveCatalogRepair={actions.handleSubscribeSaveCatalogRepair}
            onRepairSaveDatabase={actions.handleRepairSaveDatabase}
            onDeleteLegacyBackupSaves={actions.handleDeleteLegacyBackupSaves}
            onExportSavePackage={actions.handleExportSavePackage}
            onExportSaveTreePackage={actions.handleExportSaveTreePackage}
            onImportSaveFileAsMany={actions.handleImportSaveFileAsMany}
            onExtractTavernRegexScripts={actions.handleExtractTavernRegexScripts}
            onAnalyzeTavernRegexScript={actions.handleAnalyzeTavernRegexScript}
            onDryRunTavernRegexScript={actions.handleDryRunTavernRegexScript}
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
            variableEditingLocked={turnBusy}
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
            news={state.新闻}
            storyWeaving={state.剧情编织}
            zhiku={state.智库}
            apiSettings={apiSettings}
            gameSettings={gameSettings}
            turnCount={state.turnCount}
            mainChatHistory={state.chatHistory}
            npcRecords={state.NPC}
            album={state.相册}
            onPhoneChange={state.set手机}
            onPhoneMemoryCommit={actions.handlePhoneMemoryCommit}
            onGeneratePhoneReply={actions.handleGeneratePhoneReply}
            onClose={() => setShowPhone(false)}
          />
        </Suspense>
      )}

      {showWorldbookManager && (
        <Suspense fallback={<LazySurfaceFallback label="如我所书载入中" />}>
          <WorldbookManagerModal
            worldbooks={worldbooks}
            onSave={(books: 世界书[]) => {
              state.setDeviceWorldbooks(books);
              void saveSetting('worldbooks', books);
            }}
            onClose={() => setShowWorldbookManager(false)}
          />
        </Suspense>
      )}

      {showSaveLoad && (
        <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
          <SaveLoadModal
            showAutoArchives={gameSettings.enableAutoSaveEveryTurn}
            onExportActiveLeafPackage={actions.handleExportActiveLeafPackage}
            onLoad={loadSaveIntoGame}
            onBranch={branchSaveIntoGame}
            onDeleteSave={actions.handleDeleteSave}
            onDeleteSaveTree={actions.handleDeleteSaveTree}
            onClearActiveSaveTreeMeta={actions.handleClearActiveSaveTreeMeta}
            onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
            onStartSaveCatalogRepair={actions.handleStartSaveCatalogRepair}
            onSubscribeSaveCatalogRepair={actions.handleSubscribeSaveCatalogRepair}
            onRepairSaveDatabase={actions.handleRepairSaveDatabase}
            onDeleteLegacyBackupSaves={actions.handleDeleteLegacyBackupSaves}
            onExportSavePackage={actions.handleExportSavePackage}
            onExportSaveTreePackage={actions.handleExportSaveTreePackage}
            onImportSaveFileAsMany={actions.handleImportSaveFileAsMany}
            onClose={() => setShowSaveLoad(false)}
          />
        </Suspense>
      )}

      {showCloudSave && (
        <Suspense fallback={<LazySurfaceFallback label="云存档载入中" />}>
          <GitHubCloudSaveModal
            onClose={() => setShowCloudSave(false)}
            onLoadCloudConfig={loadGitHubCloudSaveConfig}
            onPersistCloudConfig={persistGitHubCloudSaveConfig}
            onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
            onLoadSaveForCloudTransfer={actions.handleLoadSaveForCloudTransfer}
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
    yitingSystem: 忆庭系统;
    zhikuSystem: 智库系统;
    onZhikuSystemChange: React.Dispatch<React.SetStateAction<智库系统>>;
    zhikuSettings: import('@/models/settings').智库系统设置;
    /** 智库保存（片 panel-p8）：ZhikuPanel 的 saveSetting('zhikuSystem') 直连收敛到门面。 */
    onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
    /** 智库迁移（片 panel-p8）：ZhikuPanel 的 DEV 刷新内置智库（迁移键/预设加载/合并）收敛到门面。 */
    onZhikuMigration: (current: 智库系统) => Promise<智库系统>;
    memorySettings: import('@/models/settings').记忆系统设置;
    news: 新闻条目[];
    onNewsChange: React.Dispatch<React.SetStateAction<新闻条目[]>>;
    plotNodes: 剧情节点[];
    onPlotNodesChange: React.Dispatch<React.SetStateAction<剧情节点[]>>;
    storyWeaving: import('@/models/storyWeaving').剧情编织系统;
    onStoryWeavingChange: React.Dispatch<React.SetStateAction<import('@/models/storyWeaving').剧情编织系统>>;
    gameSettings: import('@/models/settings').游戏设置;
    onGameSettingsChange: React.Dispatch<React.SetStateAction<import('@/models/settings').游戏设置>>;
    onPersistGameSettings: (next: import('@/models/settings').游戏设置) => Promise<void>;
    apiSettings: import('@/models/settings').API设置;
    turnCount: number;
    mainChatHistory: import('@/models/chat').聊天消息[];
    /** AI 探测用例动作（片 panel-p3）：AlbumPanel 内嵌 ImageGenerationSettingsTab 所需（取自 App 的 useAiTools）。 */
    fetchModels: AiToolsActions['fetchModels'];
    testImageGenerationConnection: AiToolsActions['testImageGenerationConnection'];
    fetchImageGenerationModels: AiToolsActions['fetchImageGenerationModels'];
    fetchComfyWorkflowCandidates: AiToolsActions['fetchComfyWorkflowCandidates'];
    /** 剧情编织持久化（片 panel-p6）：PlotPanel 的 dbService 直连收敛到门面。 */
    onSaveStoryWeaving: (system: 剧情编织系统) => Promise<void>;
    /** 战技 AI 草稿（片 panel-p6）：SkillPanel 的 generateSkillDraft 直连收敛到门面。 */
    onGenerateSkillDraft: (apiConfig: import('@/models/settings').API配置项, context: 战技生成上下文) => Promise<战技生成草稿>;
    /** 文生图请求（片 panel-p10）：AlbumPanel 的 generateImage + runImageGenerationWithRetry 直连收敛到门面，重试回调经参数传入。 */
    onGenerateAlbumImage: (
      config: import('@/models/settings').文生图API配置,
      request: ImageGenerationRequest,
      retry?: {
        maxRetries?: number;
        onAttempt?: (attempt: number, total: number) => void;
        onRetry?: (attempt: number, total: number, errorMessage: string) => void;
      },
    ) => Promise<ImageGenerationResult>;
    /** 场景图解析（片 panel-p10）：AlbumPanel 的 parseSceneImagePrompt 直连收敛到门面，配置缺失返回 null（面板切本地 fallback）。 */
    onParseSceneImagePrompt: (
      settings: import('@/models/settings').游戏设置,
      apiSettings: import('@/models/settings').API设置,
      context: 解析上下文,
    ) => Promise<场景图解析结果 | null>;
    /** 故事快照解析（片 panel-p10）：AlbumPanel 的 parseStorySnapshotPrompt 直连收敛到门面，配置缺失返回 null（面板切本地 fallback）。 */
    onParseStorySnapshotPrompt: (
      settings: import('@/models/settings').游戏设置,
      apiSettings: import('@/models/settings').API设置,
      context: 解析上下文,
    ) => Promise<故事快照解析结果 | null>;
    /** 角色锚点提取（片 panel-p10）：AlbumPanel 的 extractCharacterAnchorWithAI 直连收敛到门面，NPC/旅人保存仍由面板 setter 完成。 */
    onExtractCharacterAnchor: (
      config: import('@/models/settings').API配置项,
      input: CharacterAnchorExtractInput,
    ) => Promise<NPC角色锚点档案>;
    /** 词组转化器（片 panel-p10）：AlbumPanel 的 tokenizer 配置/system prompt/tokenize 三步直连收敛到门面，配置缺失返回 null。 */
    onTokenizeImagePrompt: (
      settings: import('@/models/settings').游戏设置,
      apiSettings: import('@/models/settings').API设置,
      input: ImagePromptTokenizerInput,
    ) => Promise<ImagePromptTokenizerResult | null>;
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
        return <SkillPanel traveler={ctx.traveler} onTravelerChange={ctx.onTravelerChange} apiSettings={ctx.apiSettings} onGenerateSkillDraft={ctx.onGenerateSkillDraft} />;
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
          zhikuSystem={ctx.zhikuSystem}
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
          onPersistGameSettings={ctx.onPersistGameSettings}
          imageSettings={ctx.gameSettings.文生图系统}
          nsfwEnabled={ctx.gameSettings.enableNsfw}
          nsfwImageEnabled={ctx.gameSettings.文生图系统.enableNsfwImageGeneration}
          mainChatHistory={ctx.mainChatHistory}
          fetchModels={ctx.fetchModels}
          testImageGenerationConnection={ctx.testImageGenerationConnection}
          fetchImageGenerationModels={ctx.fetchImageGenerationModels}
          fetchComfyWorkflowCandidates={ctx.fetchComfyWorkflowCandidates}
          onGenerateAlbumImage={ctx.onGenerateAlbumImage}
          onParseSceneImagePrompt={ctx.onParseSceneImagePrompt}
          onParseStorySnapshotPrompt={ctx.onParseStorySnapshotPrompt}
          onExtractCharacterAnchor={ctx.onExtractCharacterAnchor}
          onTokenizeImagePrompt={ctx.onTokenizeImagePrompt}
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
          onSaveStoryWeaving={ctx.onSaveStoryWeaving}
        />
      );
    case 'yiting':
      return <YitingPanel yitingSystem={ctx.yitingSystem} />;
    case 'zhiku':
      return (
        <ZhikuPanel
          zhikuSystem={ctx.zhikuSystem}
          onZhikuSystemChange={ctx.onZhikuSystemChange}
          settings={ctx.zhikuSettings}
          onSaveZhikuSystem={ctx.onSaveZhikuSystem}
          onZhikuMigration={ctx.onZhikuMigration}
        />
      );
    case 'memory':
      return (
        <MemoryPanel
          memorySystem={ctx.memorySystem}
          onMemorySystemChange={ctx.onMemorySystemChange}
          turnCount={ctx.turnCount}
          settings={ctx.memorySettings}
        />
      );
    case 'worldbook':
    case null:
      return null;
  }
}
