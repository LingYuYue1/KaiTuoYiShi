import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { LandingPage } from '@/components/layout/LandingPage';
import { DesktopHomeScreen } from '@/components/layout/DesktopHomeScreen';
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
import { APP_REPAIR_EVENT, reportAppError, type AppRepairAction } from '@/components/ui/AppErrorReporter';
import { TravelerProfileModal } from '@/components/features/Character/TravelerProfileModal';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { getAppRoot } from '@/src/adaptations/kernel';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { NPC记录, NPC阶位 } from '@/models/npc';
import type { CompanionPlanningProjection, SkillSaveInput } from '@/src/kernel/contract/session';
import type { API配置项 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import { lazyWithRetry } from '@/utils/lazyWithRetry';

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
const MemorySystemPanel = lazyWithRetry(() => import('@/components/features/GameSystems/MemorySystemPanel').then((module) => ({ default: module.MemorySystemPanel })));
const AlbumWorkspace = lazyWithRetry(() => import('@/components/features/GameSystems/AlbumWorkspace').then((module) => ({ default: module.AlbumWorkspace })));
const SkillPanel = lazyWithRetry(() => import('@/components/features/GameSystems/SkillPanel').then((module) => ({ default: module.SkillPanel })));
const InventoryPanel = lazyWithRetry(() => import('@/components/features/GameSystems/InventoryPanel').then((module) => ({ default: module.InventoryPanel })));
const NewsPanel = lazyWithRetry(() => import('@/components/features/GameSystems/NewsPanel').then((module) => ({ default: module.NewsPanel })));
const CompanionPanel = lazyWithRetry(() => import('@/components/features/GameSystems/CompanionPanel').then((module) => ({ default: module.CompanionPanel })));
const PathPanel = lazyWithRetry(() => import('@/components/features/GameSystems/PathPanel').then((module) => ({ default: module.PathPanel })));
const StarMapPanel = lazyWithRetry(() => import('@/components/features/GameSystems/StarMapPanel').then((module) => ({ default: module.StarMapPanel })));
const AIReviewLabModal = lazyWithRetry(() => import('@/components/features/ReviewLab/AIReviewLabModal').then((module) => ({ default: module.AIReviewLabModal })));

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
import { 创建空手机系统 } from '@/models/phone';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { alignStoryWeavingToOpeningArchive, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { TravelerTemplateContext, TravelerTemplateDraft } from '@/services/ai/travelerTemplate';

const JOURNEY_LAUNCH_ANIMATION_MS = 1680;
const HOME_JOURNEY_ANIMATION_MS = 1180;
const HOME_JOURNEY_VIEW_SWITCH_MS = 520;
const SAVE_LOAD_ANIMATION_MS = 1040;
const SAVE_LOAD_VIEW_SWITCH_MS = 430;
const BOOK_OPEN_ANIMATION_MS = 1080;
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

function isCompleteMainApiConfig(config: API配置项 | null | undefined): config is API配置项 {
  return Boolean(config?.provider && config.baseUrl.trim() && config.apiKey.trim() && config.model.trim());
}

function AppContent() {
  const { state, actions } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showWorldbookManager, setShowWorldbookManager] = useState(false);
  const [showZhikuManager, setShowZhikuManager] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showCloudSave, setShowCloudSave] = useState(false);
  const [showReleaseAnnouncements, setShowReleaseAnnouncements] = useState(false);
  const [showMysteryChat, setShowMysteryChat] = useState(false);
  const [showAIReviewLab, setShowAIReviewLab] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('api');
  const [settingsReturnView, setSettingsReturnView] = useState<'new_game' | null>(null);
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

  const handleOpenProfile = useCallback(() => setShowCharacter(true), []);
  const handleOpenPhone = useCallback(() => setShowPhone(true), []);
  const handleOpenSaveLoad = useCallback(() => setShowSaveLoad(true), []);
  const openSettings = useCallback((tab: SettingsTab = 'api') => {
    setSettingsReturnView(null);
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);
  const handleOpenSettings = useCallback(() => openSettings(), [openSettings]);
  const openApiSettings = useCallback((returnTo?: 'new_game') => {
    if (returnTo) {
      setSettingsReturnView(returnTo);
      state.setView('home');
    } else {
      setSettingsReturnView(null);
    }
    setSettingsInitialTab('api');
    setShowSettings(true);
  }, [state.setView]);
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    const returnTo = settingsReturnView;
    setSettingsReturnView(null);
    const activeConfig = state.apiSettings.configs.find((item) => item.id === state.apiSettings.activeConfigId);
    if (returnTo === 'new_game' && isCompleteMainApiConfig(activeConfig)) {
      state.setView('new_game');
    }
  }, [settingsReturnView, state.apiSettings.activeConfigId, state.apiSettings.configs, state.setView]);
  const handleReplaceWorldbooks = useCallback(async (books: 世界书[]) => {
    try {
      const next = await (await getAppRoot()).content.replaceWorldbooks(books);
      state.setWorldbooks(next.slice());
    } catch (error) {
      reportAppError({ source: '世界书保存', error });
    }
  }, [state.setWorldbooks]);

  useEffect(() => {
    const handleRepair = (event: Event) => {
      const repair = (event as CustomEvent<AppRepairAction>).detail;
      if (repair === 'open-api-settings') openApiSettings();
    };
    window.addEventListener(APP_REPAIR_EVENT, handleRepair);
    return () => window.removeEventListener(APP_REPAIR_EVENT, handleRepair);
  }, [openApiSettings]);
  const handleOpenReviewLab = useCallback(() => setShowAIReviewLab(true), []);
  const handleCloseSystemDrawer = useCallback(() => setActiveSystem(null), []);
  const handleToggleStreaming = useCallback(() => {
    state.setGameSettings((prev) => ({
      ...prev,
      enableStreaming: !prev.enableStreaming,
    }));
  }, [state.setGameSettings]);
  const handleCancelJob = useCallback((id: string) => {
    void actions.handleCancelJob(id)
      .catch((error: unknown) => {
        reportAppError({ source: '取消任务', error });
      });
  }, [actions]);
  const handleHomeNewGame = useCallback(async () => {
    if (homeJourneyTransitioning || saveLoadTransitioning || bookOpenTransitioning || launchingJourney) return;
    const activeId = state.apiSettings.activeConfigId;
    const activeConfig = activeId ? state.apiSettings.configs.find((item) => item.id === activeId) : null;
    if (!isCompleteMainApiConfig(activeConfig)) {
      reportAppError({
        source: '新建档案',
        error: new Error('请先配置有效的主 API 接口。'),
        repair: 'open-api-settings',
      });
      openApiSettings('new_game');
      return;
    }
    void NewGameWizard.preload();
    setHomeJourneyTransitioning(true);
    const totalDelay = getHomeJourneyDelay();
    const switchDelay = Math.min(getHomeJourneyViewSwitchDelay(), totalDelay);
    await wait(switchDelay);
    actions.handleNewGame();
    await wait(Math.max(totalDelay - switchDelay, 0));
    setHomeJourneyTransitioning(false);
  }, [actions, bookOpenTransitioning, homeJourneyTransitioning, launchingJourney, openApiSettings, saveLoadTransitioning, state.apiSettings]);

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
  const [currentStoryChapter, setCurrentStoryChapter] = useState('');
  const [storyChapterError, setStoryChapterError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    setStoryChapterError(null);
    void getAppRoot()
      .then((root) => root.content.storyChapterLabel(state.剧情编织))
      .then((label) => {
        if (active) setCurrentStoryChapter(label);
      })
      .catch((error: unknown) => {
        if (active) setStoryChapterError(error instanceof Error ? error : new Error(String(error)));
      });
    return () => { active = false; };
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
  const latestActiveJob = useMemo(() => [...state.jobs].reverse().find((job) =>
    job.state === 'queued' || job.state === 'claimed' || job.state === 'running' || job.state === 'retry' || job.state === 'failed',
  ), [state.jobs]);

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

  // 第 0 回合先由 kernel 消费 durable trigger，再开始模型命令。
  const openingTriggerSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.pendingOpeningTrigger) {
      openingTriggerSentRef.current = null;
      return;
    }
    if (state.view === 'game') {
      const text = state.pendingOpeningTrigger;
      if (openingTriggerSentRef.current === text) return;
      openingTriggerSentRef.current = text;
      void actions.handleOpeningTrigger(text).catch(() => {});
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
      onReviewLab={handleOpenReviewLab}
    />
  );

  const chatArea = (
    <>
      <VariableDrawer
        batches={state.variableBatches}
        jobs={state.jobs}
        onRetryJob={actions.handleRetryJob}
        onCancelJob={handleCancelJob}
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
        onRegenerateNarrativeImage={actions.handleRegenerateNarrativeImage}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        onEditBody={(id, body) => void actions.handleEditMessageBody(id, body)}
      />
      <PathAwakeningInvitation
        world={state.世界}
        onDecline={actions.handleDeclinePathAwakening}
        onTrigger={() => void actions.handleEnterPathAwakening()}
        disabled={state.loading}
      />
      <InputArea
        onSend={actions.handleSend}
        onAbort={actions.handleAbort}
        loading={state.loading}
        canRestartOpening={state.turnCount <= 5}
        canReroll={canReroll}
        onRestartOpening={actions.handleRestartOpening}
        onReroll={actions.handleReroll}
        streamingEnabled={state.gameSettings.enableStreaming}
        onToggleStreaming={handleToggleStreaming}
        workflowHint={state.workflowHint}
        workflowStatus={state.workflowStatus}
        workflowFailed={latestActiveJob?.state === 'failed'}
        workflowFailCount={latestActiveJob?.state === 'failed' ? latestActiveJob.attempt : 0}
        workflowRetrying={latestActiveJob?.state === 'retry'}
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
            onSetPrimaryPath: actions.handleSetPrimaryPath,
            onSaveSkill: actions.handleSaveSkill,
            onGenerateSkillDraft: actions.handleGenerateSkillDraft,
            onDeleteSkill: actions.handleDeleteSkill,
            onSetSkillEnabled: actions.handleSetSkillEnabled,
            onUseInventoryItem: actions.handleUseInventoryItem,
            onDropInventoryItem: actions.handleDropInventoryItem,
            onUndoInventoryDrop: actions.handleUndoInventoryDrop,
            npcRecords: state.NPC,
            loadCompanionPlanning: actions.getCompanionPlanning,
            onSetCompanionTier: actions.handleSetCompanionTier,
            onSetCompanionTraveling: actions.handleSetCompanionTraveling,
            album: state.相册,
            albumActions: {
              importReference: actions.handleAlbumImportReference,
              setReference: actions.handleAlbumSetReference,
              generate: actions.handleAlbumGenerate,
              bindSlot: actions.handleAlbumBindSlot,
              deleteEntries: actions.handleAlbumDeleteEntries,
              importArchive: actions.handleAlbumImportArchive,
              setCharacterAnchor: actions.handleAlbumSetCharacterAnchor,
              extractCharacterAnchor: actions.handleAlbumExtractCharacterAnchor,
              tokenizePrompt: actions.handleAlbumTokenizePrompt,
              parseScene: actions.handleAlbumParseScene,
              parseStorySnapshot: actions.handleAlbumParseStorySnapshot,
            },
            memorySystem: state.记忆,
            onCompressMemory: actions.handleCompressMemory,
            yitingSystem: state.忆庭,
            zhikuSystem: state.智库,
            onCreateZhikuEntry: actions.handleCreateZhikuEntry,
            onUpdateZhikuEntry: actions.handleUpdateZhikuEntry,
            onDeleteZhikuEntry: actions.handleDeleteZhikuEntry,
            onRefreshBundledZhiku: actions.handleRefreshBundledZhiku,
            zhikuSettings: state.gameSettings.智库系统,
            memorySettings: state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
            news: state.新闻,
            plotNodes: state.剧情,
            storyWeaving: state.剧情编织,
            plotActions: {
              importText: actions.handlePlotImportText,
              importJson: actions.handlePlotImportJson,
              restoreBundled: actions.handlePlotRestoreBundled,
              renameSeries: actions.handlePlotRenameSeries,
              rebuildSeries: actions.handlePlotRebuildSeries,
              toggleSeriesInjection: actions.handlePlotToggleSeriesInjection,
              setCurrent: actions.handlePlotSetCurrent,
              setSegmentStatus: actions.handlePlotSetSegmentStatus,
              saveSegment: actions.handlePlotSaveSegment,
              deleteSeries: actions.handlePlotDeleteSeries,
              decompose: actions.handlePlotDecompose,
              decomposeBatch: actions.handlePlotDecomposeBatch,
            },
            gameSettings: state.gameSettings,
            onGameSettingsChange: state.setGameSettings,
            turnCount: state.turnCount,
            mainChatHistory: state.chatHistory,
            worldState: state.世界,
          })}
        </Suspense>
      </SystemDrawer>
    </>
  );

  // ── Home ──
  if (state.view === 'home') {
    return (
      <>
        {isDesktopRuntime() ? (
          <DesktopHomeScreen
            onNewGame={handleHomeNewGame}
            onLoadSave={handleHomeLoadSave}
            onContinue={actions.handleContinue}
            onOpenSettings={openSettings}
            onOpenStorageManager={() => openSettings('storage')}
            onOpenWorldbookManager={handleHomeWorldbookManager}
            onOpenZhikuManager={() => setShowZhikuManager(true)}
            onOpenCloudSave={() => setShowCloudSave(true)}
            onOpenReleaseAnnouncements={() => setShowReleaseAnnouncements(true)}
            onDiscordPost={() => window.open('https://discord.com/channels/1380075940285124724/1509136913792241704', '_blank', 'noopener,noreferrer')}
            onMysteryChat={handleHomeMysteryChat}
          />
        ) : (
          <LandingPage
            onNewGame={handleHomeNewGame}
            onLoadSave={handleHomeLoadSave}
            onSettings={openSettings}
            onWorldbookManager={handleHomeWorldbookManager}
            onZhikuManager={() => setShowZhikuManager(true)}
            onCloudSave={() => setShowCloudSave(true)}
            onReleaseAnnouncements={() => setShowReleaseAnnouncements(true)}
            onDiscordPost={() => window.open('https://discord.com/channels/1380075940285124724/1509136913792241704', '_blank', 'noopener,noreferrer')}
            onMysteryChat={handleHomeMysteryChat}
          />
        )}
        {homeJourneyTransitioning ? <HomeJourneyOverlay /> : null}
        {saveLoadTransitioning ? <SaveLoadOverlay /> : null}
        {bookOpenTransitioning ? <BookOpenOverlay /> : null}
        {showWorldbookManager && (
          <Suspense fallback={<LazySurfaceFallback label="如我所书载入中" />}>
            <WorldbookManagerModal
              worldbooks={state.worldbooks}
              onSave={(books) => void handleReplaceWorldbooks(books)}
              onClose={() => setShowWorldbookManager(false)}
            />
          </Suspense>
        )}
        {showZhikuManager && (
          <Suspense fallback={<LazySurfaceFallback label="智库载入中" />}>
            <ZhikuManagerModal
              zhikuSystem={state.智库}
              onCreateEntry={actions.handleCreateZhikuEntry}
              onUpdateEntry={actions.handleUpdateZhikuEntry}
              onDeleteEntry={actions.handleDeleteZhikuEntry}
              onRefreshBundled={actions.handleRefreshBundledZhiku}
              settings={state.gameSettings.智库系统}
              onClose={() => setShowZhikuManager(false)}
            />
          </Suspense>
        )}
        {showSaveLoad && (
          <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
            <SaveLoadModal
              onSave={actions.handleSave}
              onLoad={async (id) => {
                const ok = await actions.handleLoadSave(id);
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
        {showAIReviewLab && (
          <Suspense fallback={<LazySurfaceFallback label="AI 审查实验室载入中" />}>
            <AIReviewLabModal
              messages={state.chatHistory}
              loading={state.loading}
              onClose={() => setShowAIReviewLab(false)}
            />
          </Suspense>
        )}
        {showSettings && (
          <Suspense fallback={<LazySurfaceFallback label="设置载入中" />}>
            <SettingsModal
              onClose={handleCloseSettings}
              apiSettings={state.apiSettings}
              onApiSettingsChange={state.setApiSettings}
              gameSettings={state.gameSettings}
              onGameSettingsChange={state.setGameSettings}
              currentTheme={state.currentTheme}
              onThemeChange={state.setCurrentTheme}
              onSave={actions.handleSave}
              onContinue={actions.handleContinue}
              onLoadSave={actions.handleLoadSave}
              initialTab={settingsInitialTab}
              旅人={state.旅人}
              世界={state.世界}
              onStoryModeChange={actions.handleSetStoryMode}
              记忆={state.记忆}
              忆庭={state.忆庭}
              智库={state.智库}
              手机={state.手机}
              NPC={state.NPC}
              新闻={state.新闻}
              剧情编织={state.剧情编织}
              getContextSnapshot={actions.getContextSnapshot}
            />
          </Suspense>
        )}
      </>
    );
  }

  // ── New Game Wizard ──
  if (state.view === 'new_game') {
    const getActiveApiConfig = () => {
      if (!state.apiSettings.activeConfigId) return null;
      return state.apiSettings.configs.find((item) => item.id === state.apiSettings.activeConfigId) ?? null;
    };
    const handleGenerateTravelerTemplate = async (context: TravelerTemplateContext): Promise<TravelerTemplateDraft> => {
      const config = getActiveApiConfig();
      if (!isCompleteMainApiConfig(config)) throw new Error('请先在设置中配置有效的主 API 接口。');
      return (await getAppRoot()).onboarding.generateTravelerTemplate(context);
    };

    const handleStartGame = async (traveler: 角色数据结构, worldState: 世界状态, initialNpcRecords: NPC记录[] = []) => {
      // Defensive invariant only: normal onboarding routes to Settings before the wizard opens.
      if (!isCompleteMainApiConfig(getActiveApiConfig())) {
        reportAppError({
          source: '新建档案',
          error: new Error('请先配置有效的主 API 接口。'),
          repair: 'open-api-settings',
        });
        openApiSettings('new_game');
        return;
      }
      const nextStoryWeaving = alignStoryWeavingToOpeningArchive(
        await loadAllBundledStoryWeavingPresets(),
        worldState.开局档案,
      );
      await actions.handleStartSession(
        traveler,
        worldState,
        initialNpcRecords,
        nextStoryWeaving,
        '[系统] 开启第 0 回合',
      );
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
            openingArchiveApiConfig={isCompleteMainApiConfig(getActiveApiConfig()) ? getActiveApiConfig() : null}
            onGenerateTravelerTemplate={handleGenerateTravelerTemplate}
          />
        </Suspense>
        {homeJourneyTransitioning ? <HomeJourneyOverlay /> : null}
        {launchingJourney ? <JourneyLaunchOverlay /> : null}
      </>
    );
  }

  // ── Game ──
  if (storyChapterError) throw storyChapterError;
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
      {!activeSystem && !showSettings && !showWorldbookManager && !showZhikuManager && !showSaveLoad && !showCharacter && !showPhone && !showAIReviewLab && (
        <MobileQuickMenu
          onHome={actions.handleGoHome}
          onCharacter={handleOpenProfile}
          onPhone={handleOpenPhone}
          onSettings={handleOpenSettings}
          onSave={handleOpenSaveLoad}
          onReviewLab={handleOpenReviewLab}
          onSystemSelect={handleMenuSelect}
          phoneUnread={state.手机.unreadTotal}
        />
      )}

      {/* Modals */}
      {showAIReviewLab && (
        <Suspense fallback={<LazySurfaceFallback label="AI 审查实验室载入中" />}>
          <AIReviewLabModal
            messages={state.chatHistory}
            loading={state.loading}
            onClose={() => setShowAIReviewLab(false)}
          />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={<LazySurfaceFallback label="设置载入中" />}>
          <SettingsModal
            onClose={handleCloseSettings}
            apiSettings={state.apiSettings}
            onApiSettingsChange={state.setApiSettings}
            gameSettings={state.gameSettings}
            onGameSettingsChange={state.setGameSettings}
            currentTheme={state.currentTheme}
            onThemeChange={state.setCurrentTheme}
            onSave={actions.handleSave}
            onContinue={actions.handleContinue}
            onLoadSave={actions.handleLoadSave}
            initialTab={settingsInitialTab}
            旅人={state.旅人}
            世界={state.世界}
            onStoryModeChange={actions.handleSetStoryMode}
            记忆={state.记忆}
            忆庭={state.忆庭}
            智库={state.智库}
            手机={state.手机}
            NPC={state.NPC}
            新闻={state.新闻}
            剧情编织={state.剧情编织}
            getContextSnapshot={actions.getContextSnapshot}
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
            news={state.新闻}
            gameSettings={state.gameSettings}
            turnCount={state.turnCount}
            npcRecords={state.NPC}
            album={state.相册}
            actions={{
              dismissSeed: actions.handlePhoneDismissSeed,
              markRead: actions.handlePhoneMarkRead,
              addContact: actions.handlePhoneAddContact,
              openPrivateChat: actions.handlePhoneOpenPrivateChat,
              createGroup: actions.handlePhoneCreateGroup,
              renameGroup: actions.handlePhoneRenameGroup,
              addGroupMember: actions.handlePhoneAddGroupMember,
              setWallpaper: actions.handlePhoneSetWallpaper,
              send: actions.handlePhoneSend,
              generateSeed: actions.handlePhoneGenerateSeed,
            }}
            onClose={() => setShowPhone(false)}
          />
        </Suspense>
      )}

      {showWorldbookManager && (
        <Suspense fallback={<LazySurfaceFallback label="如我所书载入中" />}>
          <WorldbookManagerModal
            worldbooks={state.worldbooks}
            onSave={(books) => void handleReplaceWorldbooks(books)}
            onClose={() => setShowWorldbookManager(false)}
          />
        </Suspense>
      )}

      {showSaveLoad && (
        <Suspense fallback={<LazySurfaceFallback label="存档系统载入中" />}>
          <SaveLoadModal
            onSave={actions.handleSave}
            onLoad={async (id) => {
              const ok = await actions.handleLoadSave(id);
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
            onClose={() => setShowCloudSave(false)}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return <AppContent />;
}

// ── Inline character editor ──

function renderSystemPanel(
  id: GameSystemId | null,
  ctx: {
    traveler: 角色数据结构;
    onSetPrimaryPath: (id: 命途ID) => Promise<void>;
    onSaveSkill: (input: SkillSaveInput) => Promise<void>;
    onGenerateSkillDraft: (input: import('@/src/kernel/contract/session').SkillDraftGenerationInput) => Promise<import('@/src/kernel/contract/session').GeneratedSkillDraft>;
    onDeleteSkill: (skillId: string) => Promise<void>;
    onSetSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>;
    onUseInventoryItem: (itemId: string, count?: number) => Promise<void>;
    onDropInventoryItem: (itemId: string, count?: number) => Promise<import('@/src/kernel/contract').CommandId>;
    onUndoInventoryDrop: (dropCommandId: import('@/src/kernel/contract').CommandId) => Promise<void>;
    npcRecords: NPC记录[];
    loadCompanionPlanning: () => Promise<CompanionPlanningProjection>;
    onSetCompanionTier: (npcId: string, tier: NPC阶位) => Promise<void>;
    onSetCompanionTraveling: (npcId: string, traveling: boolean) => Promise<void>;
    album: 相册系统;
    albumActions: import('@/components/features/GameSystems/AlbumWorkspace').AlbumWorkspaceActions;
    memorySystem: 记忆系统;
    onCompressMemory: (layer: 'immediate' | 'short' | 'middle', force: boolean) => Promise<void>;
    yitingSystem: 忆庭系统;
    zhikuSystem: 智库系统;
    onCreateZhikuEntry: (draft: import('@/models/zhiku').智库条目草稿) => Promise<string>;
    onUpdateZhikuEntry: (entryId: string, patch: Partial<Omit<import('@/models/zhiku').智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
    onDeleteZhikuEntry: (entryId: string) => Promise<void>;
    onRefreshBundledZhiku: () => Promise<void>;
    zhikuSettings: import('@/models/settings').智库系统设置;
    memorySettings: import('@/models/settings').记忆系统设置;
    news: 新闻条目[];
    plotNodes: 剧情节点[];
    storyWeaving: import('@/models/storyWeaving').剧情编织系统;
    plotActions: import('@/components/features/GameSystems/PlotPanel').PlotPanelActions;
    gameSettings: import('@/models/settings').游戏设置;
    onGameSettingsChange: React.Dispatch<React.SetStateAction<import('@/models/settings').游戏设置>>;
    turnCount: number;
    mainChatHistory: import('@/models/chat').聊天消息[];
    worldState: 世界状态;
  },
) {
  switch (id) {
    case 'path':
      return (
        <PathPanel
          traveler={ctx.traveler}
          onSetPrimary={ctx.onSetPrimaryPath}
        />
      );
      case 'skill':
        return (
          <SkillPanel
            traveler={ctx.traveler}
            onGenerateSkillDraft={ctx.onGenerateSkillDraft}
            onSaveSkill={ctx.onSaveSkill}
            onDeleteSkill={ctx.onDeleteSkill}
            onSetSkillEnabled={ctx.onSetSkillEnabled}
          />
        );
    case 'inventory':
      return (
        <InventoryPanel
          traveler={ctx.traveler}
          turnCount={ctx.turnCount}
          onUseItem={ctx.onUseInventoryItem}
          onDropItem={ctx.onDropInventoryItem}
          onUndoDrop={ctx.onUndoInventoryDrop}
        />
      );
    case 'companion':
      return (
        <CompanionPanel
          npcRecords={ctx.npcRecords}
          loadPlanning={ctx.loadCompanionPlanning}
          onSetTier={ctx.onSetCompanionTier}
          onSetTraveling={ctx.onSetCompanionTraveling}
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
        <AlbumWorkspace
          album={ctx.album}
          traveler={ctx.traveler}
          npcs={ctx.npcRecords}
          actions={ctx.albumActions}
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
          turnCount={ctx.turnCount}
        />
      );
    case 'starMap':
      return (
        <StarMapPanel
          worldState={ctx.worldState}
          npcRecords={ctx.npcRecords}
          album={ctx.album}
          plotNodes={ctx.plotNodes}
          gameSettings={ctx.gameSettings}
          onGameSettingsChange={ctx.onGameSettingsChange}
        />
      );
    case 'plot':
      return (
        <PlotPanel
          storyWeaving={ctx.storyWeaving}
          gameSettings={ctx.gameSettings}
          actions={ctx.plotActions}
        />
      );
    case 'yiting':
      return <YitingPanel yitingSystem={ctx.yitingSystem} />;
    case 'zhiku':
      return (
        <ZhikuPanel
          zhikuSystem={ctx.zhikuSystem}
          onCreateEntry={ctx.onCreateZhikuEntry}
          onUpdateEntry={ctx.onUpdateZhikuEntry}
          onDeleteEntry={ctx.onDeleteZhikuEntry}
          onRefreshBundled={ctx.onRefreshBundledZhiku}
          settings={ctx.zhikuSettings}
        />
      );
    case 'memory':
      return (
        <MemorySystemPanel
          memorySystem={ctx.memorySystem}
          onCompress={ctx.onCompressMemory}
          settings={ctx.memorySettings}
        />
      );
    default:
      return null;
  }
}
