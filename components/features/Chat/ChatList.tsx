import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState, memo } from 'react';
import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import type { VisualTextSettings } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { useStreamingMessage } from '@/utils/streamingMessageStore';
import { TurnItem } from './TurnItem';

interface ChatListProps {
  messages: 聊天消息[];
  loading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onEditBody?: (id: string, newBody: string) => void;
  onReparseVariables?: (messageId: string) => void | Promise<void>;
  variableRepairingMessageId?: string | null;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  visualTextSettings?: VisualTextSettings;
  devMode?: boolean;
}

interface NeighborMeta {
  fallbackPathId?: string;
  previousUserInput?: string;
}

const INITIAL_RENDER_TURNS = 20;
const RENDER_TURN_INCREMENT = 20;

function findHistoryWindowStart(messages: 聊天消息[], turnLimit: number): number {
  let assistantTurns = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'assistant') continue;
    assistantTurns += 1;
    if (assistantTurns > turnLimit) return index + 1;
  }
  return 0;
}

interface ChatHistoryListProps {
  messages: 聊天消息[];
  neighborMeta: NeighborMeta[];
  onEditBody?: (id: string, newBody: string) => void;
  onReparseVariables?: (messageId: string) => void | Promise<void>;
  variableRepairingMessageId?: string | null;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  visualTextSettings?: VisualTextSettings;
  devMode?: boolean;
}

/** Isolated history list: scroll chrome (nearBottom / FAB) must not remap TurnItems. */
const ChatHistoryList = memo(function ChatHistoryList({
  messages,
  neighborMeta,
  onEditBody,
  onReparseVariables,
  variableRepairingMessageId,
  onRegenerateNarrativeImage,
  narrativeImageManualEnabled = false,
  npcRecords,
  traveler,
  album,
  showInnerVoice = true,
  visualTextSettings,
  devMode = false,
}: ChatHistoryListProps) {
  return (
    <>
      {messages.map((msg, idx) => {
        const meta = neighborMeta[idx];
        return (
          <TurnItem
            key={msg.id}
            message={msg}
            deferOffscreen
            onEditBody={onEditBody}
            onReparseVariables={onReparseVariables}
            variableRepairing={variableRepairingMessageId === msg.id}
            onRegenerateNarrativeImage={onRegenerateNarrativeImage}
            narrativeImageManualEnabled={narrativeImageManualEnabled}
            npcRecords={npcRecords}
            traveler={traveler}
            album={album}
            showInnerVoice={showInnerVoice}
            fallbackPathId={meta.fallbackPathId}
            previousUserInput={meta.previousUserInput}
            visualTextSettings={visualTextSettings}
            devMode={devMode}
          />
        );
      })}
    </>
  );
});

/** One forward pass for previous-user / path-fallback neighbor metadata. */
function buildNeighborMeta(messages: 聊天消息[]): NeighborMeta[] {
  let lastUserContent: string | undefined;
  let lastPathId: string | undefined;
  const meta: NeighborMeta[] = new Array(messages.length);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let fallbackPathId: string | undefined;
    let previousUserInput: string | undefined;

    if (msg.role === 'user') {
      lastUserContent = msg.content;
    } else if (msg.role === 'assistant') {
      previousUserInput = lastUserContent;
      const needsFallback =
        !!msg.parsedResponse
        && (msg.parsedResponse.awakenQuestions?.trim() || msg.parsedResponse.awakenJudgement?.trim())
        && !msg.parsedResponse.awakenPathId;
      if (needsFallback) {
        fallbackPathId = lastPathId;
      }
      const pid = msg.parsedResponse?.awakenPathId;
      if (pid) lastPathId = pid;
    }

    meta[i] = { fallbackPathId, previousUserInput };
  }

  return meta;
}

export function ChatList({ messages, loading, scrollRef, onEditBody, onReparseVariables, variableRepairingMessageId, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, visualTextSettings, devMode = false }: ChatListProps) {
  const streamingMessage = useStreamingMessage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const nearBottomRef = useRef(true);
  const [renderTurnLimit, setRenderTurnLimit] = useState(INITIAL_RENDER_TURNS);
  const historyIdentityRef = useRef<{ lastId?: string; length: number }>({ length: 0 });
  const scrollRafRef = useRef<number | null>(null);
  const scrollStateRafRef = useRef<number | null>(null);
  const pendingHistoryAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const previousHistoryIdentity = historyIdentityRef.current;
  const previousHistoryStillPresent = !previousHistoryIdentity.lastId
    || messages.some((message) => message.id === previousHistoryIdentity.lastId);
  const historyWasReplaced = previousHistoryIdentity.length > 0
    && (messages.length < previousHistoryIdentity.length || !previousHistoryStillPresent);
  const effectiveRenderTurnLimit = historyWasReplaced ? INITIAL_RENDER_TURNS : renderTurnLimit;

  useEffect(() => {
    historyIdentityRef.current = {
      lastId: messages[messages.length - 1]?.id,
      length: messages.length,
    };
    if (historyWasReplaced) {
      pendingHistoryAnchorRef.current = null;
      setRenderTurnLimit(INITIAL_RENDER_TURNS);
    }
  }, [historyWasReplaced, messages]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, [scrollRef]);

  // Instant/throttled stick-to-bottom: avoid per-chunk smooth scroll storms during stream.
  useEffect(() => {
    if (!nearBottom && streamingMessage) return;
    if (!nearBottom && messages.length > 0) return;

    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollRef.current!;
      el.scrollTop = el.scrollHeight;
    });

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, streamingMessage, nearBottom, scrollRef]);

  const handleScroll = useCallback(() => {
    if (scrollStateRafRef.current != null) return;
    scrollStateRafRef.current = requestAnimationFrame(() => {
      scrollStateRafRef.current = null;
      const nextNearBottom = isNearBottom();
      if (nearBottomRef.current === nextNearBottom) return;
      nearBottomRef.current = nextNearBottom;
      setNearBottom(nextNearBottom);
    });
  }, [isNearBottom]);

  useEffect(() => () => {
    if (scrollStateRafRef.current != null) {
      cancelAnimationFrame(scrollStateRafRef.current);
      scrollStateRafRef.current = null;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current!.scrollIntoView({ behavior: 'smooth', block: 'end' });
    nearBottomRef.current = true;
    setNearBottom(true);
  }, []);

  // 隐藏 [系统] 触发消息——chatHistory 中仍存在便于调试，但 UI 不渲染。
  const visibleMessages = useMemo(
    () => messages.filter((message) => !(message.role === 'user' && message.content.startsWith('[系统]'))),
    [messages],
  );
  const renderedStartIndex = useMemo(
    () => findHistoryWindowStart(visibleMessages, effectiveRenderTurnLimit),
    [effectiveRenderTurnLimit, visibleMessages],
  );
  const renderedMessages = useMemo(
    () => visibleMessages.slice(renderedStartIndex),
    [renderedStartIndex, visibleMessages],
  );
  const hasEarlierMessages = renderedStartIndex > 0;

  const allNeighborMeta = useMemo(
    () => buildNeighborMeta(visibleMessages),
    [visibleMessages],
  );
  const neighborMeta = useMemo(
    () => allNeighborMeta.slice(renderedStartIndex),
    [allNeighborMeta, renderedStartIndex],
  );
  const streamingPreviousUserInput = useMemo(
    () => [...visibleMessages].reverse().find((message) => message.role === 'user')?.content,
    [visibleMessages],
  );

  const handleLoadEarlier = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      pendingHistoryAnchorRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }
    setRenderTurnLimit((current) => current + RENDER_TURN_INCREMENT);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const anchor = pendingHistoryAnchorRef.current;
    if (!anchor) return;
    pendingHistoryAnchorRef.current = null;
    if (historyWasReplaced) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
  }, [historyWasReplaced, renderedStartIndex, scrollRef]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-4 py-4 md:px-4"
    >
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-10 h-16 bg-gradient-to-b from-[rgba(var(--tj-bg-primary),0.74)] to-transparent md:hidden" />

      {hasEarlierMessages && (
        <div className="flex justify-center pb-4">
          <button
            type="button"
            onClick={handleLoadEarlier}
            className="px-3 py-1.5 text-xs"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.92)' }}
          >
            继续渲染更早 20 回合
          </button>
        </div>
      )}

      {/* Empty state */}
      {visibleMessages.length === 0 && !loading && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div
            className="text-5xl mb-5"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.35)' }}
          >
            ✦
          </div>
          <p
            className="text-sm font-serif tracking-[0.15em]"
            style={{ color: 'rgba(var(--tj-text-primary), 0.7)' }}
          >
            星轨深处，尚无回响……
          </p>
          <p
            className="mt-2 text-xs tracking-wider"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
          >
            在此写下开拓之旅的第一页
          </p>
        </div>
      )}

      {/* Historical messages — isolated from nearBottom / FAB re-renders */}
      <ChatHistoryList
        messages={renderedMessages}
        neighborMeta={neighborMeta}
        onEditBody={onEditBody}
        onReparseVariables={onReparseVariables}
        variableRepairingMessageId={variableRepairingMessageId}
        onRegenerateNarrativeImage={onRegenerateNarrativeImage}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        npcRecords={npcRecords}
        traveler={traveler}
        album={album}
        showInnerVoice={showInnerVoice}
        visualTextSettings={visualTextSettings}
        devMode={devMode}
      />

      {/* Streaming preview — lives in parent so stream text does not remap history */}
      {streamingMessage && (
        <TurnItem
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingMessage,
            timestamp: Date.now(),
            isStreaming: true,
          }}
          isStreaming
          npcRecords={npcRecords}
          traveler={traveler}
          album={album}
          previousUserInput={streamingPreviousUserInput}
          showInnerVoice={showInnerVoice}
          visualTextSettings={visualTextSettings}
          devMode={devMode}
        />
      )}

      {/* Loading indicator (no stream yet) */}
      {loading && !streamingMessage && (
        <div className="flex items-center gap-2 py-4">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-1.5 animate-pulse-soft rounded-full"
                style={{
                  background: 'rgb(var(--tj-accent-primary))',
                  boxShadow: '0 0 6px rgba(var(--tj-accent-primary), 0.5)',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <span
            className="text-xs font-serif tracking-wider"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}
          >
            正在沉思……
          </span>
        </div>
      )}

      <div ref={bottomRef} />

      {!nearBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="fixed bottom-[calc(var(--app-safe-bottom,0px)+118px)] left-1/2 z-30 -translate-x-1/2 px-3 py-1.5 text-[11px] tracking-[0.16em] md:hidden"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.92)',
            background: 'rgba(var(--tj-surface), 0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.34), 0 12px 28px rgba(var(--tj-shadow), 0.28)',
            backdropFilter: 'blur(4px)',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
          }}
        >
          回到底部
        </button>
      )}
    </div>
  );
}
