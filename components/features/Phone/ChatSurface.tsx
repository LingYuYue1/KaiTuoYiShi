import { Fragment, useEffect, useRef, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 手机会话, 手机联系人 } from '@/models/phone';
import { Avatar, EmptyText } from './primitives';
import { cardClip, smallClip } from './phoneStyles';

export function ChatSurface({
  chat,
  traveler,
  contact,
  groupMembers,
  groupAddCandidates,
  draft,
  loading,
  error,
  onBack,
  onDraftChange,
  onAddGroupMember,
  onRenameGroup,
  onSend,
}: {
  chat: 手机会话;
  traveler: 角色数据结构;
  contact?: 手机联系人;
  groupMembers?: 手机联系人[];
  groupAddCandidates?: 手机联系人[];
  draft: string;
  loading: boolean;
  error: string;
  onBack?: () => void;
  onDraftChange: (text: string) => void;
  onAddGroupMember?: (chatId: string, contact: 手机联系人) => void;
  onRenameGroup?: (chatId: string, title: string) => void;
  onSend: () => void;
}) {
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState(chat.title);

  const [prevChatId, setPrevChatId] = useState(chat.id);
  const [prevChatTitle, setPrevChatTitle] = useState(chat.title);
  if (prevChatId !== chat.id || prevChatTitle !== chat.title) {
    setPrevChatId(chat.id);
    setPrevChatTitle(chat.title);
    setRenamingGroup(false);
    setShowGroupMembers(false);
    setShowAddMembers(false);
    setGroupTitleDraft(chat.title);
  }

  const submitGroupTitle = () => {
    const nextTitle = groupTitleDraft.trim();
    if (nextTitle && nextTitle !== chat.title) onRenameGroup?.(chat.id, nextTitle);
    setRenamingGroup(false);
    setGroupTitleDraft(nextTitle || chat.title);
  };

  useEffect(() => {
    const scrollToBottom = () => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [chat.id, chat.messages.length]);

  return (
    <>
      <header className="relative flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-2 py-1 text-xs font-serif tracking-[0.14em] xl:hidden"
              style={{
                color: 'rgb(var(--tj-accent-primary))',
                background: 'rgba(var(--tj-accent-primary), 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                clipPath: smallClip,
              }}
            >
              返回
            </button>
          )}
          <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {renamingGroup ? (
              <input
                value={groupTitleDraft}
                autoFocus
                maxLength={24}
                onChange={(e) => setGroupTitleDraft(e.target.value)}
                onBlur={submitGroupTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitGroupTitle();
                  if (e.key === 'Escape') {
                    setRenamingGroup(false);
                    setGroupTitleDraft(chat.title);
                  }
                }}
                className="kaituo-input min-w-0 flex-1 px-2 py-1 font-serif text-base font-bold tracking-[0.12em]"
                style={{ clipPath: smallClip }}
              />
            ) : (
              <div className="truncate font-serif text-lg font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                {chat.title}
              </div>
            )}
            {chat.type === 'group' && !renamingGroup && (
              <button
                type="button"
                onClick={() => {
                  setGroupTitleDraft(chat.title);
                  setRenamingGroup(true);
                }}
                className="flex-shrink-0 px-2 py-1 text-[10px] font-serif tracking-[0.14em]"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.84)',
                  background: 'rgba(var(--tj-accent-primary), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                改名
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            {chat.type === 'group' ? 'GROUP CHANNEL' : chat.type === 'system' ? 'SYSTEM NOTICE' : 'PRIVATE LINK'}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            本地记忆 {chat.localArchive?.entries.length ?? 0}/{chat.localArchive?.threshold ?? 0}
            {chat.localArchive?.compressedSummaries.length ? ` · 已压缩 ${chat.localArchive.compressedSummaries.length} 次` : ''}
          </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-2">
          {chat.type === 'group' && (
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGroupMembers((v) => !v);
                  setShowAddMembers(false);
                }}
                className="px-2.5 py-1.5 text-[11px] font-serif tracking-[0.14em]"
                style={{
                  color: showGroupMembers ? 'rgb(var(--tj-bg-primary))' : 'rgb(var(--tj-accent-primary))',
                  background: showGroupMembers
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                    : 'rgba(var(--tj-accent-primary), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                  clipPath: smallClip,
                }}
              >
                成员 {groupMembers?.length ?? chat.participantIds.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddMembers((v) => !v);
                  setShowGroupMembers(false);
                }}
                className="min-w-[58px] px-2.5 py-1.5 text-[13px] font-serif font-bold tracking-[0.12em]"
                style={{
                  color: showAddMembers ? 'rgb(var(--tj-bg-primary))' : 'rgb(var(--tj-accent-primary))',
                  background: showAddMembers
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                    : 'rgba(var(--tj-accent-primary), 0.05)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                  clipPath: smallClip,
                }}
                aria-label="拉人入群"
                title="拉人入群"
              >
                +
              </button>
            </div>
          )}
          {chat.unread > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(220, 80, 80, 0.16)', color: 'rgb(var(--tj-danger))' }}>
              {chat.unread}
            </span>
          )}
        </div>
        {chat.type === 'group' && showGroupMembers && (
          <div
            className="absolute right-4 top-full z-20 mt-2 max-h-64 w-[min(320px,calc(100vw-48px))] overflow-y-auto px-3 py-3"
            style={{
              background: 'rgba(var(--tj-bubble), 0.98)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24), 0 18px 36px rgba(var(--tj-shadow), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                群聊成员
              </span>
              <button
                type="button"
                onClick={() => setShowGroupMembers(false)}
                className="px-2 py-1 text-[10px]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
              >
                收起
              </button>
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {(groupMembers?.length ? groupMembers : []).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 px-2 py-2"
                  style={{
                    background: 'rgba(var(--tj-accent-primary), 0.045)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                    clipPath: smallClip,
                  }}
                >
                  <Avatar name={member.name} src={member.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                      {member.name}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                      {member.relationLabel ?? '成员'}{member.organization ? ` · ${member.organization}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {!(groupMembers?.length) && (
                <EmptyText text="暂无可显示成员。" />
              )}
            </div>
          </div>
        )}
        {chat.type === 'group' && showAddMembers && (
          <div
            className="absolute right-4 top-full z-20 mt-2 max-h-64 w-[min(320px,calc(100vw-48px))] overflow-y-auto px-3 py-3"
            style={{
              background: 'rgba(var(--tj-bubble), 0.98)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24), 0 18px 36px rgba(var(--tj-shadow), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                拉人入群
              </span>
              <button
                type="button"
                onClick={() => setShowAddMembers(false)}
                className="px-2 py-1 text-[10px]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
              >
                收起
              </button>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {groupAddCandidates?.length ? (
                groupAddCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onAddGroupMember?.(chat.id, candidate);
                      setShowAddMembers(false);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left"
                    style={{
                      background: 'rgba(var(--tj-accent-primary), 0.04)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <Avatar name={candidate.name} src={candidate.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {candidate.name}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                        {candidate.relationLabel ?? '联系人'}{candidate.organization ? ` · ${candidate.organization}` : ''}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyText text="暂无可拉入的联系人。" />
              )}
            </div>
          </div>
        )}
      </header>
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {chat.messages.length === 0 ? (
          <EmptyText text="这里还没有消息。输入短讯后，对方会通过手机系统 API 回复，并留下记忆摘要。" />
        ) : (
          <div className="space-y-3">
            {chat.messages.map((msg, index) => {
              const previous = index > 0 ? chat.messages[index - 1] : undefined;
              const turnGap = previous && previous.turn > 0 && msg.turn > previous.turn ? msg.turn - previous.turn : 0;
              const showHistoryDivider = turnGap > 1;
              return (
                <Fragment key={msg.id}>
                  {showHistoryDivider && <PhoneHistoryDivider turn={msg.turn} gap={turnGap} />}
                  <div className={`flex items-end gap-2 ${msg.role === 'player' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role !== 'player' && (
                      <Avatar
                        name={msg.senderName}
                        src={msg.avatar || (contact && msg.senderId === contact.id ? contact.avatar : undefined)}
                      />
                    )}
                    <div
                      className="max-w-[82%] px-3 py-2 text-sm leading-relaxed sm:max-w-[76%]"
                      style={{
                        color: msg.role === 'player' ? 'rgb(var(--tj-on-accent))' : 'rgba(var(--tj-text-primary), 0.94)',
                        background:
                          msg.role === 'player'
                            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))'
                            : 'linear-gradient(135deg, rgba(var(--tj-bubble),0.98), rgba(var(--tj-surface-strong),0.88))',
                        boxShadow: msg.role === 'player'
                          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)'
                          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.62), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.42)',
                        clipPath: smallClip,
                      }}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold opacity-75">
                        <span>{msg.senderName}</span>
                        {msg.turn > 0 && <span className="opacity-60">· 第 {msg.turn} 回合</span>}
                      </div>
                      {msg.content}
                    </div>
                    {msg.role === 'player' && (
                      <Avatar name={traveler.姓名 || '我'} src={traveler.图像档案?.手机头像 || traveler.头像 || undefined} />
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <footer className="px-4 py-3 sm:px-6 sm:py-4" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
        {error && (
          <div
            className="mb-2 px-3 py-2 text-xs"
            style={{
              color: 'rgb(var(--tj-danger))',
              background: 'rgba(220, 80, 80, 0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 80, 80, 0.22)',
              clipPath: smallClip,
            }}
          >
            {error}
          </div>
        )}
        <div
          className="flex items-end gap-2 px-2.5 py-2 sm:px-3"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.65)',
            background: 'rgba(var(--tj-bubble), 0.96)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
            clipPath: smallClip,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder="输入短讯..."
            className="min-h-[44px] min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={loading || !draft.trim()}
            className="flex-shrink-0 px-3 py-2 text-xs font-serif tracking-[0.16em] transition-all disabled:opacity-45 sm:px-4 sm:tracking-[0.2em]"
            style={{
              color: 'rgb(var(--tj-on-accent))',
              background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
              clipPath: smallClip,
            }}
          >
            {loading ? '发送中' : '发送'}
          </button>
        </div>
      </footer>
    </>
  );
}

function PhoneHistoryDivider({ turn, gap }: { turn: number; gap: number }) {
  const gapLabel = gap > 1 ? `间隔 ${gap} 回合` : '稍后';
  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.34))' }}
      />
      <span
        className="shrink-0 px-3 py-1 font-serif text-[11px] tracking-[0.18em]"
        style={{
          color: 'rgb(var(--tj-accent-primary))',
          background: 'rgba(var(--tj-bubble), 0.72)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: smallClip,
        }}
      >
        历史消息 · {gapLabel} · 第 {turn} 回合
      </span>
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.34), transparent)' }}
      />
    </div>
  );
}
