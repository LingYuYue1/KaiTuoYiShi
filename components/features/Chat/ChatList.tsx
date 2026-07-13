import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import type { VisualTextSettings } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { TurnItem } from './TurnItem';

interface ChatListProps {
  messages: 聊天消息[];
  loading: boolean;
  streamingMessage: string;
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

export function ChatList({ messages, loading, streamingMessage, scrollRef, onEditBody, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, visualTextSettings }: ChatListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [renderLimit, setRenderLimit] = useState(80);
  const historyIdentityRef = useRef<{ lastId?: string; length: number }>({ length: 0 });
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
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, [scrollRef]);

  useEffect(() => {
    if (!nearBottom && streamingMessage) return;
    if (!nearBottom && messages.length > 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, nearBottom]);

  const handleScroll = useCallback(() => {
    setNearBottom(isNearBottom());
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
            onClick={() => setRenderLimit((current) => current + 80)}
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

      {/* Rendered messages */}
      {renderedMessages.map((msg, idx) => {
        // 兜底:历史评判消息若 awakenPathId 为空(早期生成时没存进去),
        // 向前找最近一条带 awakenPathId 的狭间消息,把命途 ID 传给 TurnItem 美化用。
        let fallbackPathId: string | undefined;
        const needsFallback =
          msg.role === 'assistant'
          && !!msg.parsedResponse
          && (msg.parsedResponse.awakenQuestions?.trim() || msg.parsedResponse.awakenJudgement?.trim())
          && !msg.parsedResponse.awakenPathId;
        if (needsFallback) {
          for (let i = idx - 1; i >= 0; i--) {
            const prev = renderedMessages[i];
            const prevPid = prev?.parsedResponse?.awakenPathId;
            if (prevPid) {
              fallbackPathId = prevPid;
              break;
            }
          }
        }
        const previousUserInput =
          msg.role === 'assistant'
            ? (() => {
                for (let i = idx - 1; i >= 0; i--) {
                  const prev = renderedMessages[i];
                  if (prev?.role === 'user') return prev.content;
                }
                return undefined;
              })()
            : undefined;
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
            fallbackPathId={fallbackPathId}
            previousUserInput={previousUserInput}
            visualTextSettings={visualTextSettings}
          />
        );
      })}

      {/* Streaming preview */}
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
