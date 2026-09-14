import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { useDeviceSettings } from '@/hooks/useDeviceSettings';
import { useAiTools, type AiToolsActions } from '@/hooks/useAiTools';
import { useHomePage } from '@/hooks/useHomePage';
import { LandingPage } from '@/components/features/Home/LandingPage';
import { HomeTransitionOverlay, MysteryChatModal } from '@/components/features/Home/HomeOverlays';
import { GameView } from '@/components/layout/GameView';
import { TopBar } from '@/components/layout/TopBar';
import { LeftPanel } from '@/components/layout/LeftPanel';
import { RightMenu } from '@/components/layout/RightMenu';
import { SystemDrawer } from '@/components/layout/SystemDrawer';
import { MobileQuickMenu } from '@/components/layout/MobileQuickMenu';
import { ChatList } from '@/components/features/Chat/ChatList';
import { InputArea } from '@/components/features/Chat/InputArea';
import { RecoveryBanner } from '@/components/features/Chat/RecoveryBanner';
import { VariableDrawer } from '@/components/features/Variable/VariableDrawer';
import type { SettingsTab } from '@/components/features/Settings/SettingsModal';
import { PathAwakeningInvitation } from '@/components/features/Path/PathAwakeningInvitation';
import { ContinuityBanner } from '@/components/features/Chat/ContinuityBanner';
import { TravelerProfileModal } from '@/components/features/Character/TravelerProfileModal';
import { VariableRepairPreviewModal } from '@/components/features/Variable/VariableRepairPreviewModal';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { saveSetting } from '@/services/storage/settings';
import { getCurrentStoryChapterLabel } from '@/services/storyProgressService';
import { generateTravelerTemplate } from '@/services/ai/travelerTemplate';
import { isOpeningLanded, shouldStartOpening } from '@/models/opening';
import { 正文生图手动模式 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录, NPC角色锚点档案 } from '@/models/npc';
import type { 世界书 } from '@/models/worldbook';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 命途ID } from '@/models/journey';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { TravelerTemplateContext, TravelerTemplateDraft, 战技生成草稿, 战技生成上下文, ImageGenerationRequest, ImageGenerationResult, 解析上下文, 场景图解析结果, 故事快照解析结果, CharacterAnchorExtractInput, ImagePromptTokenizerInput, ImagePromptTokenizerResult } from '@/contracts/ai';
import {
  AlbumPanel,
  CompanionPanel,
  GitHubCloudSaveModal,
  InventoryPanel,
  LazySurface,
  MemoryPanel,
  NewGameWizard,
  NewsPanel,
  PathPanel,
  PhoneModal,
  PlotPanel,
  ReleaseAnnouncementsModal,
  SaveManager,
  SettingsModal,
  SkillPanel,
  WorldbookManagerModal,
  YitingPanel,
  ZhikuManagerModal,
  ZhikuSystemPanel,
} from '@/components/lazy/surfaces';
import { useSurfaceWarmup } from '@/hooks/useSurfaceWarmup';
import { PresetLoadBar } from '@/components/ui/PresetLoadBar';

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
  // 撤销未落地回合后交还输入区的文本（一次性的输入草稿，不进入存档）。
  const [undoDraft, setUndoDraft] = useState<{ id: string; text: string } | null>(null);

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
  // 队列任务取消收敛到 useGame.handleCancelTask（单一取消通道）；
  // App 不再持有 abort / 队列项 / 瞬时态的私有清理副本。
  const handlePathAwakeningTrigger = useCallback(() => {
    void actions.handleSend('[系统] 踏入命途狭间');
  }, [actions]);
  const handleAwakenedNewPath = useCallback((id: 命途ID) => {
    // TODO: 这里以后接入命途狭间剧情触发。当前只 console。
    console.info('[path] 命途狭间触发:', id);
  }, []);

  // 首页入口：转场计时、重叠保护、减少动效降级都在 useHomePage 里。
  // 钩子只负责编排，落点是什么界面由这里注入，它自己不认识任何一个界面。
  // 依赖内置预置数据（原著正文 + 智库目录）的入口门禁。fail-fail：失败不解除门禁，
  // 只显示「哪一路失败 + 重试」——AI 本就需要联网，残缺世界没有意义，所以「两路都 ready」是唯一放行条件。
  const presetDataReady = state.presetDataReady;
  const zhikuCatalogStatus = state.zhikuCatalogStatus;
  // 首页与开局向导各挂一次，属性完全相同：进度条不属于任何单一视图，它属于 boot 门禁本身。
  const presetBar = (
    <PresetLoadBar loader={state.presetLoader} onRetry={state.retryPresetLoad} />
  );

  const home = useHomePage({
    onEnterNewGame: () => { actions.handleNewGame(); },
    onEnterLoadSave: () => setShowSaveLoad(true),
    onEnterWorldbook: () => setShowWorldbookManager(true),
    onEnterGame: () => state.setView('game'),
    onOpenZhiku: () => setShowZhikuManager(true),
    onOpenSettings: () => {
      setSettingsInitialTab('api');
      setShowSettings(true);
    },
    onOpenCloudSave: () => setShowCloudSave(true),
    onOpenAnnouncements: () => setShowReleaseAnnouncements(true),
    onOpenMysteryChat: () => setShowMysteryChat(true),
    dataReady: presetDataReady,
  });

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

  const narrativeImageManualEnabled = 正文生图手动模式(gameSettings.文生图系统.正文生图);

  // 回合忙碌门：主流程或变量结算任一在跑，就禁止变更类操作（发送/编辑/触发）。
  // loading 与 pendingVariable 是管线的两条独立轨道，这里只在 UI 层合成展示用谓词。
  const turnBusy = state.activeWorkflow.loading || state.activeWorkflow.pendingVariable;

  // 回合卡片动作的调用期快照（账本 + 忙态 + 设置）：账本变化时刷新，界面据此重算动作视图。
  const turnActionContext = useMemo(() => ({
    queueTasks: state.queueTasks,
    busy: turnBusy,
    正文生图手动模式: narrativeImageManualEnabled,
    变量更新启用: gameSettings.enableVariableUpdate,
  }), [state.queueTasks, turnBusy, narrativeImageManualEnabled, gameSettings.enableVariableUpdate]);
  const recoveryPhase = state.turnPhase;
  const hasRecovery = Boolean(state.activeWorkflow.recovery);

  // 开局引导派发：唯一判定是 shouldStartOpening（水合边界写入叶子相位投影，派发常量由模型给出）。
  // 界面不回读字段文本，也不依赖「先清空再 send」的批次时序。
  // openingLanded 单独 memo 成布尔值：chatHistory 换引用不进入效果依赖，只有开局落地事实
  // 或相位 / 恢复态变化才会重新判定，避免无关更新反复触发派发。
  const openingLanded = useMemo(
    () => isOpeningLanded(state.turnCount, state.chatHistory),
    [state.turnCount, state.chatHistory],
  );
  useEffect(() => {
    if (state.view !== 'game') return;
    if (!shouldStartOpening({
      turnPhase: state.turnPhase,
      openingLanded,
      hasRecovery,
    })) return;
    void actions.handleStartOpening();
  }, [state.view, state.turnPhase, openingLanded, hasRecovery, actions]);

  // 懒加载界面的预热统一交给钩子排程：boot 落定后点亮首页可达界面，
  // 进入游戏且模型请求让出带宽后再补游戏内界面。此前是三个点击时预热加一个 idle 预热，
  // 分散在四处且各自决定时机，现在只在这里声明「按什么条件放开多大的范围」。
  useSurfaceWarmup({
    bootSettled: state.bootSettled,
    view: state.view,
    busy: state.activeWorkflow.loading,
  });

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
        onCancelTask={actions.handleCancelTask}
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
        turnActions={actions.turnActions}
        turnActionContext={turnActionContext}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        onEditBody={handleEditBody}
      />
      <PathAwakeningInvitation
        world={state.世界}
        setWorld={state.set世界}
        onTrigger={handlePathAwakeningTrigger}
        disabled={turnBusy}
      />
      <ContinuityBanner
        world={state.世界}
        storyWeaving={state.剧情编织}
        setWorld={state.set世界}
        setStoryWeaving={state.set剧情编织}
      />
      {hasRecovery && !turnBusy ? (
        <RecoveryBanner
          phase={recoveryPhase}
          onResume={() => { void actions.handleResumeRecovery(); }}
          onAbandon={() => { void actions.handleAbandonRecovery(); }}
          onRetry={() => { void actions.handleRetryRecovery(); }}
          onUndo={() => {
            void actions.handleUndoRecovery().then((text) => {
              if (text) setUndoDraft({ id: `undo-${Date.now()}`, text });
            });
          }}
        />
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
        draft={undoDraft}
        onParseActionOptions={actions.handleParseActionOptionsBlock}
      />
      <SystemDrawer
        open={activeSystem !== null}
        title={activeMenuItem?.label ?? ''}
        subtitle={activeMenuItem?.subtitle}
        glyph={activeMenuItem?.glyph}
        onClose={handleCloseSystemDrawer}
      >
        <LazySurface label="系统面板载入中">
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
            onRetryMemoryDraft: actions.handleRetryMemoryDraft,
            onIgnoreMemoryDraft: actions.handleIgnoreMemoryDraft,
            yitingSystem: state.忆庭,
            zhikuSystem: state.智库,
            onZhikuSystemChange: state.set智库,
            zhikuSettings: gameSettings.智库系统,
            onSaveZhikuSystem: actions.handleSaveZhikuSystem,
            onZhikuMigration: actions.handleZhikuMigration,
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
            onGenerateAlbumImage: actions.handleGenerateAlbumImage,
            onParseSceneImagePrompt: actions.handleParseSceneImagePrompt,
            onParseStorySnapshotPrompt: actions.handleParseStorySnapshotPrompt,
            onExtractCharacterAnchor: actions.handleExtractCharacterAnchor,
            onTokenizeImagePrompt: actions.handleTokenizeImagePrompt,
          })}
        </LazySurface>
      </SystemDrawer>
    </>
  );

  // ── Home ──
  if (state.view === 'home') {
    return (
      <>
        <LandingPage view={home.view} commands={home.commands} />
        <HomeTransitionOverlay transition={home.transition} />
        {presetBar}
        {showWorldbookManager && (
          <LazySurface label="如我所书载入中">
            <WorldbookManagerModal
              worldbooks={worldbooks}
              onSave={(books: 世界书[]) => {
                state.setDeviceWorldbooks(books);
                void saveSetting('worldbooks', books);
              }}
              onClose={() => setShowWorldbookManager(false)}
            />
          </LazySurface>
        )}
        {showZhikuManager && (
          <LazySurface label="智库载入中">
            <ZhikuManagerModal
              zhikuSystem={state.智库}
              storyWeavingSystem={state.剧情编织}
              onZhikuSystemChange={state.set智库}
              settings={gameSettings.智库系统}
              onSaveZhikuSystem={actions.handleSaveZhikuSystem}
              onZhikuMigration={actions.handleZhikuMigration}
              onClose={() => setShowZhikuManager(false)}
              catalogStatus={zhikuCatalogStatus}
            />
          </LazySurface>
        )}
        {showSaveLoad && (
          <LazySurface label="存档系统载入中">
            <SaveManager
              variant="modal"
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
          </LazySurface>
        )}
        {showCloudSave && (
          <LazySurface label="云存档载入中">
            <GitHubCloudSaveModal
              onClose={() => setShowCloudSave(false)}
              onLoadCloudConfig={loadGitHubCloudSaveConfig}
              onPersistCloudConfig={persistGitHubCloudSaveConfig}
              onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
              onLoadSaveForCloudTransfer={actions.handleLoadSaveForCloudTransfer}
            />
          </LazySurface>
        )}
        {showReleaseAnnouncements && (
          <LazySurface label="公告载入中">
            <ReleaseAnnouncementsModal
              onClose={() => setShowReleaseAnnouncements(false)}
            />
          </LazySurface>
        )}
        {showMysteryChat && (
          <MysteryChatModal onClose={() => setShowMysteryChat(false)} />
        )}
        {showSettings && (
          <LazySurface label="设置载入中">
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
          </LazySurface>
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
        <LazySurface label="开局档案载入中">
          <NewGameWizard
            onStart={async (draft) => {
              // 预检失败（无 API 配置）时 handlePrepareNewGame 返回 false，不切 view，玩家留在开局页。
              const ok = await actions.handlePrepareNewGame(draft);
              if (!ok) return;
              home.commands.launchJourney();
            }}
            onBack={() => state.setView('home')}
            onLoadOpeningPresets={actions.handleLoadOpeningPresets}
            onSaveOpeningPresets={actions.handleSaveOpeningPresets}
            onParseOpeningArchive={actions.handleParseOpeningArchive}
            onGenerateTravelerTemplate={handleGenerateTravelerTemplate}
            presetReady={presetDataReady}
          />
        </LazySurface>
        <HomeTransitionOverlay transition={home.transition} />
        {presetBar}
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
        <LazySurface label="设置载入中">
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
        </LazySurface>
      )}

      {showCharacter && (
        <TravelerProfileModal
          traveler={state.旅人}
          album={state.相册}
          onClose={() => setShowCharacter(false)}
        />
      )}

      {actions.变量修复.计划 && (
        <VariableRepairPreviewModal
          plan={actions.变量修复.计划}
          receipt={actions.变量修复.回执}
          committing={actions.变量修复.提交中}
          onClose={actions.变量修复.关闭}
          onCommit={(confirmedItemIds) => { void actions.变量修复.提交(confirmedItemIds); }}
        />
      )}

      {showPhone && (
        <LazySurface label="手机载入中">
          <PhoneModal
            phone={state.手机}
            traveler={state.旅人}
            world={state.世界}
            news={state.新闻}

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
        </LazySurface>
      )}

      {showWorldbookManager && (
        <LazySurface label="如我所书载入中">
          <WorldbookManagerModal
            worldbooks={worldbooks}
            onSave={(books: 世界书[]) => {
              state.setDeviceWorldbooks(books);
              void saveSetting('worldbooks', books);
            }}
            onClose={() => setShowWorldbookManager(false)}
          />
        </LazySurface>
      )}

      {showZhikuManager && (
        <LazySurface label="智库载入中">
          <ZhikuManagerModal
            zhikuSystem={state.智库}
            storyWeavingSystem={state.剧情编织}
            onZhikuSystemChange={state.set智库}
            settings={gameSettings.智库系统}
            onSaveZhikuSystem={actions.handleSaveZhikuSystem}
            onZhikuMigration={actions.handleZhikuMigration}
            onClose={() => setShowZhikuManager(false)}
            catalogStatus={zhikuCatalogStatus}
          />
        </LazySurface>
      )}

      {showSaveLoad && (
        <LazySurface label="存档系统载入中">
          <SaveManager
            variant="modal"
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
        </LazySurface>
      )}

      {showCloudSave && (
        <LazySurface label="云存档载入中">
          <GitHubCloudSaveModal
            onClose={() => setShowCloudSave(false)}
            onLoadCloudConfig={loadGitHubCloudSaveConfig}
            onPersistCloudConfig={persistGitHubCloudSaveConfig}
            onGetSaveCatalogSnapshot={actions.handleGetSaveCatalogSnapshot}
            onLoadSaveForCloudTransfer={actions.handleLoadSaveForCloudTransfer}
          />
        </LazySurface>
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
    /** 记忆失败草稿重试：走 hook 的独立工作流事务（S4b）。 */
    onRetryMemoryDraft: (draftId: string) => Promise<void>;
    /** 记忆失败草稿忽略：仅置 ignored，不消费原始批次（S4b）。 */
    onIgnoreMemoryDraft: (draftId: string) => Promise<void>;
    yitingSystem: 忆庭系统;
    zhikuSystem: 智库系统;
    onZhikuSystemChange: React.Dispatch<React.SetStateAction<智库系统>>;
    zhikuSettings: import('@/models/settings').智库系统设置;
    /** 智库保存（片 panel-p8）：ZhikuPanel 的 saveSetting('zhikuSystem') 直连收敛到门面。 */
    onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
    /** 智库目录刷新：全成或全败地重载内置目录并合并当前系统。 */
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
    /** 剧情编织持久化（片 panel-p6）：PlotPanel 的存储层直连收敛到门面。 */
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
        <ZhikuSystemPanel
          zhikuSystem={ctx.zhikuSystem}
          storyWeavingSystem={ctx.storyWeaving}
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
          onRetryFailedDraft={ctx.onRetryMemoryDraft}
          onIgnoreFailedDraft={ctx.onIgnoreMemoryDraft}
        />
      );
    case 'worldbook':
    case null:
      return null;
  }
}
