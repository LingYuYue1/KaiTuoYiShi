import { useEffect, useRef, useCallback, useMemo, useState, memo } from 'react';
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
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  visualTextSettings?: VisualTextSettings;
}

interface NeighborMeta {
  fallbackPathId?: string;
  previousUserInput?: string;
}

interface ChatHistoryListProps {
  messages: 聊天消息[];
  neighborMeta: NeighborMeta[];
  onEditBody?: (id: string, newBody: string) => void;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  visualTextSettings?: VisualTextSettings;
}

/** Isolated history list: scroll chrome (nearBottom / FAB) must not remap TurnItems. */
const ChatHistoryList = memo(function ChatHistoryList({
  messages,
  neighborMeta,
  onEditBody,
  onRegenerateNarrativeImage,
  narrativeImageManualEnabled = false,
  npcRecords,
  traveler,
  album,
  showInnerVoice = true,
  visualTextSettings,
}: ChatHistoryListProps) {
  return (
    <>
      {messages.map((msg, idx) => {
        const meta = neighborMeta[idx];
        return (
          <TurnItem
            key={msg.id}
            message={msg}
            onEditBody={onEditBody}
            onRegenerateNarrativeImage={onRegenerateNarrativeImage}
            narrativeImageManualEnabled={narrativeImageManualEnabled}
            npcRecords={npcRecords}
            traveler={traveler}
            album={album}
            showInnerVoice={showInnerVoice}
            fallbackPathId={meta.fallbackPathId}
            previousUserInput={meta.previousUserInput}
            visualTextSettings={visualTextSettings}
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

export function ChatList({ messages, loading, scrollRef, onEditBody, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, visualTextSettings }: ChatListProps) {
  const streamingMessage = useStreamingMessage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [renderLimit, setRenderLimit] = useState(80);
  const historyIdentityRef = useRef<{ lastId?: string; length: number }>({ length: 0 });
  const scrollRafRef = useRef<number | null>(null);
  const previousHistoryIdentity = historyIdentityRef.current;
  const previousHistoryStillPresent = !previousHistoryIdentity.lastId
    || messages.some((message) => message.id === previousHistoryIdentity.lastId);
  const historyWasReplaced = previousHistoryIdentity.length > 0
    && (messages.length < previousHistoryIdentity.length || !previousHistoryStillPresent);
  const effectiveRenderLimit = historyWasReplaced ? 80 : renderLimit;

  useEffect(() => {
    historyIdentityRef.current = {
      lastId: messages[messages.length - 1]?.id,
      length: messages.length,
    };
    if (historyWasReplaced) setRenderLimit(80);
  }, [historyWasReplaced, messages]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current!;
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
    setNearBottom(isNearBottom());
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current!.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setNearBottom(true);
  }, []);

  // 隐藏 [系统] 触发消息——chatHistory 中仍存在便于调试，但 UI 不渲染。
  const visibleMessages = useMemo(
    () => messages.filter((message) => !(message.role === 'user' && message.content.startsWith('[系统]'))),
    [messages],
  );
  const renderedMessages = useMemo(
    () => visibleMessages.slice(Math.max(0, visibleMessages.length - effectiveRenderLimit)),
    [effectiveRenderLimit, visibleMessages],
  );
  const hasEarlierMessages = renderedMessages.length < visibleMessages.length;

  const neighborMeta = useMemo(
    () => buildNeighborMeta(renderedMessages),
    [renderedMessages],
  );

  const handleLoadEarlier = useCallback(() => {
    setRenderLimit((current) => current + 80);
  }, []);

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
            加载更早记录
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
        onRegenerateNarrativeImage={onRegenerateNarrativeImage}
        narrativeImageManualEnabled={narrativeImageManualEnabled}
        npcRecords={npcRecords}
        traveler={traveler}
        album={album}
        showInnerVoice={showInnerVoice}
        visualTextSettings={visualTextSettings}
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
          showInnerVoice={showInnerVoice}
          visualTextSettings={visualTextSettings}
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
            background: 'rgba(var(--tj-surface), 0.72)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.34), 0 12px 28px rgba(var(--tj-shadow), 0.28)',
            backdropFilter: 'blur(10px)',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
          }}
        >
          回到底部
        </button>
      )}
    </div>
  );
}
