import { useEffect, useMemo, useState } from 'react';
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
import { NewGameWizard } from '@/components/features/NewGame/NewGameWizard';
import { SettingsModal } from '@/components/features/Settings/SettingsModal';
import type { SettingsTab } from '@/components/features/Settings/SettingsModal';
import { WorldbookManagerModal } from '@/components/features/Worldbook/WorldbookManagerModal';
import { ZhikuManagerModal } from '@/components/features/GameSystems/ZhikuManagerModal';
import { SaveLoadModal } from '@/components/features/SaveLoad/SaveLoadModal';
import { EquipmentPanel } from '@/components/features/GameSystems/EquipmentPanel';
import { SkillPanel } from '@/components/features/GameSystems/SkillPanel';
import { InventoryPanel } from '@/components/features/GameSystems/InventoryPanel';
import { NewsPanel } from '@/components/features/GameSystems/NewsPanel';
import { PlotPanel } from '@/components/features/GameSystems/PlotPanel';
import { YitingPanel } from '@/components/features/GameSystems/YitingPanel';
import { ZhikuPanel } from '@/components/features/GameSystems/ZhikuPanel';
import { CompanionPanel } from '@/components/features/GameSystems/CompanionPanel';
import { MemoryPanel } from '@/components/features/GameSystems/MemoryPanel';
import { PathPanel } from '@/components/features/GameSystems/PathPanel';
import { AlbumPanel } from '@/components/features/GameSystems/AlbumPanel';
import { PathAwakeningInvitation } from '@/components/features/Path/PathAwakeningInvitation';
import { Modal } from '@/components/ui/Modal';
import { TravelerProfileModal } from '@/components/features/Character/TravelerProfileModal';
import { PhoneModal } from '@/components/features/Phone/PhoneModal';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { saveSetting } from '@/services/dbService';
import { handleLoadById } from '@/hooks/useGame/saveLoadWorkflow';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import type { 命途ID } from '@/models/journey';
import { 创建空手机系统 } from '@/models/phone';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { applyStoryProgressSuggestion, markStorySegmentDeviated } from '@/services/storyProgressService';

export default function App() {
  const { state, actions } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showWorldbookManager, setShowWorldbookManager] = useState(false);
  const [showZhikuManager, setShowZhikuManager] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('api');
  const [activeSystem, setActiveSystem] = useState<GameSystemId | null>(null);

  const handleMenuSelect = (id: GameSystemId) => {
    if (id === 'worldbook') {
      setActiveSystem(null);
      setShowWorldbookManager(true);
      return;
    }
    setActiveSystem((current) => (current === id ? null : id));
  };

  const activeMenuItem = activeSystem
    ? GAME_MENU_ITEMS.find((item) => item.id === activeSystem) ?? null
    : null;
  const currentStoryChapter = useMemo(() => {
    const series = state.剧情编织.系列列表.find((item) => item.id === state.剧情编织.当前系列ID)
      ?? state.剧情编织.系列列表.find((item) => item.激活注入 !== false);
    if (!series || series.激活注入 === false) return '';
    const current = series.分段列表.find((segment) => segment.运行状态 === '当前')
      ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号);
    if (!current) return `${series.标题} · 未选择章节`;
    const chapter = current.章节标题?.length ? current.章节标题.join(' / ') : current.标题;
    return `${series.标题} · ${chapter}`;
  }, [state.剧情编织]);
  const latestActiveTask = [...state.queueTasks].reverse().find((task) =>
    ['main_story', 'memory', 'variable', 'news', 'yiting', 'zhiku'].includes(task.id),
  );

  const confirmStoryProgress = () => {
    if (!state.剧情推进建议) return;
    const next = applyStoryProgressSuggestion(state.剧情编织, state.剧情推进建议);
    state.set剧情编织(next);
    state.set剧情推进建议(null);
    void saveSetting('storyWeavingSystem', next);
  };

  const deviateStoryProgress = () => {
    if (!state.剧情推进建议) return;
    const next = markStorySegmentDeviated(state.剧情编织, state.剧情推进建议);
    state.set剧情编织(next);
    state.set剧情推进建议(null);
    void saveSetting('storyWeavingSystem', next);
  };

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

  // ── Home ──
  if (state.view === 'home') {
    return (
      <>
        <LandingPage
          onNewGame={actions.handleNewGame}
          onLoadSave={() => setShowSaveLoad(true)}
          onSettings={() => {
            setSettingsInitialTab('api');
            setShowSettings(true);
          }}
          onWorldbookManager={() => setShowWorldbookManager(true)}
          onZhikuManager={() => setShowZhikuManager(true)}
        />
        {showWorldbookManager && (
          <WorldbookManagerModal
            worldbooks={state.worldbooks}
            onSave={(books) => {
              state.setWorldbooks(books);
              saveSetting('worldbooks', books);
            }}
            onClose={() => setShowWorldbookManager(false)}
          />
        )}
        {showZhikuManager && (
          <ZhikuManagerModal
            zhikuSystem={state.智库}
            onZhikuSystemChange={state.set智库}
            settings={state.gameSettings.智库系统}
            onClose={() => setShowZhikuManager(false)}
          />
        )}
        {showSaveLoad && (
          <SaveLoadModal
            onSave={actions.handleSave}
            onLoad={async (id) => {
              const ok = await handleLoadById(id, state);
              if (ok) setShowSaveLoad(false);
              return ok;
            }}
            onClose={() => setShowSaveLoad(false)}
          />
        )}
        {showSettings && (
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
          />
        )}
      </>
    );
  }

  // ── New Game Wizard ──
  if (state.view === 'new_game') {
    const handleStartGame = async (traveler: 角色数据结构, worldState: 世界状态) => {
      // 预检 API：configs 为空时给出明确提示，不切换 view，避免玩家被困在空白游戏页。
      if (state.apiSettings.configs.length === 0) {
        alert('请先在设置中配置至少一个 API 接口，再开始旅途。');
        return;
      }
      state.set旅人(traveler);
      state.set世界(worldState);
      state.setChatHistory([]);
      state.setTurnCount(1);
      state.set记忆({ 即时记忆: [], 短期记忆: [], 长期记忆: [] });
      state.set忆庭({ 回忆档案: [] });
      // 重置运行时游戏系统切片，避免上一局存档残留污染新局
      state.setNPC([]);
      state.set手机(创建空手机系统());
      state.set新闻([]);
      state.set剧情([]);
      try {
        state.set剧情编织(await loadAllBundledStoryWeavingPresets());
      } catch (err) {
        console.warn('[story-weaving] 新开局加载内置原著剧情失败，保留当前剧情编织状态:', err);
      }
      state.setPendingOpeningTrigger('[系统] 开启第 0 回合');
      state.setView('game');
    };

    return (
      <NewGameWizard
        onStart={handleStartGame}
        onBack={() => state.setView('home')}
        currentTheme={state.currentTheme}
      />
    );
  }

  // ── Game ──
  return (
    <>
      <GameView
        topBar={
          <TopBar
            worldState={state.世界}
            currentTheme={state.currentTheme}
            onHome={actions.handleGoHome}
          />
        }
        leftPanel={
          <LeftPanel
            traveler={state.旅人}
            onOpenProfile={() => setShowCharacter(true)}
            onOpenPhone={() => setShowPhone(true)}
            phoneUnread={state.手机.unreadTotal}
            currentStoryChapter={currentStoryChapter}
            storyProgressSuggestion={state.剧情推进建议}
            storyProgressDisabled={state.loading || state.pendingVariable}
            onConfirmStoryProgress={confirmStoryProgress}
            onDeviateStoryProgress={deviateStoryProgress}
            onDismissStoryProgress={() => state.set剧情推进建议(null)}
          />
        }
        rightPanel={
          <RightMenu
            activeId={activeSystem}
            onSelect={handleMenuSelect}
            onSaveGame={() => setShowSaveLoad(true)}
            onLoadGame={() => setShowSaveLoad(true)}
            onSettings={() => setShowSettings(true)}
          />
        }
        chatArea={
          <>
            <VariableDrawer
              batches={state.variableBatches}
              tasks={state.queueTasks}
              pending={state.pendingVariable}
              onCancelTask={(id) => {
                if (id === 'main_story' || id === 'variable' || id === 'news' || id === 'yiting' || id === 'zhiku' || id === 'memory') {
                  state.abortControllerRef.current?.abort();
                  state.setQueueTasks((prev) => [
                    ...prev,
                    {
                      id,
                      title: id === 'news' ? '星际和平周报' : id === 'variable' ? '变量生成' : id === 'yiting' ? '忆庭召回' : id === 'zhiku' ? '智库检索' : id === 'memory' ? '记忆整理' : '主剧情生成',
                      turn: state.turnCount,
                      timestamp: Date.now(),
                      status: 'cancelled',
                      detail: '玩家已取消本次任务。',
                      cancelled: true,
                    },
                  ]);
                  state.setPendingVariable(false);
                  state.setLoading(false);
                  state.setStreamingMessage('');
                }
              }}
            />
            <ChatList
              messages={state.chatHistory}
              loading={state.loading}
              streamingMessage={state.streamingMessage}
              scrollRef={state.scrollRef}
              npcRecords={state.NPC}
              traveler={state.旅人}
              showInnerVoice={state.gameSettings.enableInnerVoice}
              onEditBody={(id, newBody) => {
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
              }}
            />
            <PathAwakeningInvitation
              world={state.世界}
              setWorld={state.set世界}
              onTrigger={() => {
                void actions.handleSend('[系统] 踏入命途狭间');
              }}
              disabled={state.loading || state.pendingVariable}
            />
            <InputArea
              onSend={actions.handleSend}
              onAbort={actions.handleAbort}
              loading={state.loading}
              disabled={state.pendingVariable}
              canRestartOpening={state.turnCount <= 5}
              canReroll={state.chatHistory.some((m) => m.role === 'assistant')}
              onRestartOpening={actions.handleRestartOpening}
              onReroll={actions.handleReroll}
              streamingEnabled={state.gameSettings.enableStreaming}
              onToggleStreaming={() =>
                state.setGameSettings((prev) => ({
                  ...prev,
                  enableStreaming: !prev.enableStreaming,
                }))
              }
              workflowHint={state.workflowHint}
              workflowStatus={state.workflowStatus}
              workflowFailed={latestActiveTask?.status === 'failed'}
              workflowFailCount={latestActiveTask?.failCount ?? (latestActiveTask?.status === 'failed' ? 1 : 0)}
              workflowRetrying={latestActiveTask?.retrying === true}
              onCancelWorkflow={() => actions.handleAbort()}
              actionOptions={
                [...state.chatHistory]
                  .reverse()
                  .find((m) => m.role === 'assistant')?.parsedResponse?.actionOptions ?? []
              }
            />
            <SystemDrawer
              open={activeSystem !== null}
              title={activeMenuItem?.label ?? ''}
              subtitle={activeMenuItem?.subtitle}
              glyph={activeMenuItem?.glyph}
              onClose={() => setActiveSystem(null)}
            >
              {renderSystemPanel(activeSystem, {
                traveler: state.旅人,
                onTravelerChange: state.set旅人,
                onAwakenedNewPath: (id) => {
                  // TODO: 这里以后接入命途狭间剧情触发。当前只 console。
                  console.info('[path] 命途狭间触发:', id);
                },
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
                zhikuSettings: state.gameSettings.智库系统,
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
              })}
            </SystemDrawer>
          </>
        }
      />

      {/* Mobile bottom menu */}
      <MobileQuickMenu
        onHome={actions.handleGoHome}
        onCharacter={() => setShowCharacter(true)}
        onPhone={() => setShowPhone(true)}
        onSettings={() => setShowSettings(true)}
        onSave={actions.handleSave}
        phoneUnread={state.手机.unreadTotal}
      />

      {/* Modals */}
      {showSettings && (
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
        />
      )}

      {showCharacter && (
        <TravelerProfileModal
          traveler={state.旅人}
          onClose={() => setShowCharacter(false)}
        />
      )}

      {showPhone && (
        <PhoneModal
          phone={state.手机}
          traveler={state.旅人}
          world={state.世界}
          memory={state.记忆}
          yiting={state.忆庭}
          news={state.新闻}
          apiSettings={state.apiSettings}
          gameSettings={state.gameSettings}
          turnCount={state.turnCount}
          npcRecords={state.NPC}
          onPhoneChange={state.set手机}
          onMemoryChange={state.set记忆}
          onYitingChange={state.set忆庭}
          onNpcRecordsChange={state.setNPC}
          onClose={() => setShowPhone(false)}
        />
      )}

      {showWorldbookManager && (
        <WorldbookManagerModal
          worldbooks={state.worldbooks}
          onSave={(books) => {
            state.setWorldbooks(books);
            saveSetting('worldbooks', books);
          }}
          onClose={() => setShowWorldbookManager(false)}
        />
      )}

      {showSaveLoad && (
        <SaveLoadModal
          onSave={actions.handleSave}
          onLoad={async (id) => {
            const ok = await handleLoadById(id, state);
            if (ok) setShowSaveLoad(false);
            return ok;
          }}
          onClose={() => setShowSaveLoad(false)}
        />
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
      return <SkillPanel traveler={ctx.traveler} onTravelerChange={ctx.onTravelerChange} />;
    case 'equipment':
      return (
        <EquipmentPanel
          traveler={ctx.traveler}
          onTravelerChange={ctx.onTravelerChange}
        />
      );
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
          turnCount={ctx.turnCount}
          nsfwEnabled={ctx.gameSettings.enableNsfw}
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
    case 'zhiku':
      return (
        <ZhikuPanel
          zhikuSystem={ctx.zhikuSystem}
          onZhikuSystemChange={ctx.onZhikuSystemChange}
          settings={ctx.zhikuSettings}
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
    default:
      return null;
  }
}
