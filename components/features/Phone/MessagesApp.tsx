import type { 角色数据结构 } from '@/models/character';
import type { 手机会话, 主动来信种子 } from '@/models/phone';
import type { PhoneActions, PhoneState } from '@/hooks/usePhone';
import { resolveContactForChat } from '@/utils/phone';
import { ChatSurface } from './ChatSurface';
import { Avatar, EmptyText } from './primitives';
import { smallClip } from './phoneStyles';

export function MessagesApp({
  state,
  actions,
  traveler,
}: {
  state: PhoneState;
  actions: PhoneActions;
  traveler: 角色数据结构;
}) {
  const activeChat = state.activeChat;
  const contact = activeChat ? resolveContactForChat(state.contacts, activeChat) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
      <aside
        className={`${state.mobileView === 'list' ? 'flex' : 'hidden xl:flex'} min-h-0 w-full flex-shrink-0 flex-col overflow-hidden xl:w-[292px]`}
        style={{
          borderRight: '1px solid rgba(var(--tj-accent-primary), 0.22)',
          background: 'rgba(var(--tj-bubble), 0.86)',
        }}
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                短讯列表
              </div>
              <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                待处理来信与会话
              </div>
            </div>
            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
              {state.chatCount}
            </span>
          </div>
          <button
            type="button"
            onClick={actions.toggleCreateGroup}
            className="mt-3 w-full py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90"
            style={{
              color: state.showCreateGroup ? 'rgb(var(--tj-bg-primary))' : 'rgb(var(--tj-accent-primary))',
              background: state.showCreateGroup
                ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                : 'rgba(var(--tj-accent-primary), 0.055)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
              clipPath: smallClip,
            }}
          >
            创建群聊
          </button>
          <div
            className="mt-3 grid grid-cols-2 gap-1 p-1"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.36)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: smallClip,
            }}
          >
            {(['private', 'group'] as const).map((mode) => {
              const active = state.messageListMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => actions.setMessageListMode(mode)}
                  className="py-1.5 text-[11px] font-serif tracking-[0.14em] transition-all"
                  style={{
                    color: active ? 'rgb(var(--tj-bg-primary))' : 'rgb(var(--tj-accent-primary))',
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                      : 'transparent',
                    clipPath: smallClip,
                  }}
                >
                  {mode === 'private' ? `好友 ${state.privateChats.length}` : `群聊 ${state.groupChats.length}`}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-3">
            {state.showCreateGroup && (
              <section
                className="space-y-2"
                style={{
                  background: 'rgba(var(--tj-accent-primary), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                  padding: '10px',
                }}
              >
                <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                  新建群聊
                </div>
                <input
                  value={state.groupNameDraft}
                  onChange={(e) => actions.setGroupNameDraft(e.target.value)}
                  placeholder="群聊名称"
                  className="kaituo-input w-full px-2.5 py-2 text-xs"
                  style={{ clipPath: smallClip }}
                />
                <div className="max-h-36 touch-pan-y space-y-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                  {state.contacts.length === 0 ? (
                    <EmptyText text="暂无可选择联系人。" />
                  ) : (
                    state.contacts.map((contact) => {
                      const checked = state.groupMemberIds.includes(contact.id);
                      return (
                        <label
                          key={contact.id}
                          className="flex cursor-pointer items-center gap-2 px-2 py-1.5"
                          style={{
                            background: checked ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-bg-primary), 0.34)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                            clipPath: smallClip,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => actions.toggleGroupMember(contact.id)}
                          />
                          <Avatar name={contact.name} src={contact.avatar} />
                          <span className="min-w-0 truncate text-xs" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                            {contact.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={actions.createGroup}
                  className="w-full py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90"
                  style={{
                    color: 'rgb(var(--tj-on-accent))',
                    background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
                    clipPath: smallClip,
                  }}
                >
                  建立频道
                </button>
              </section>
            )}
            <section
              className="space-y-2"
              style={{
                background: 'rgba(var(--tj-accent-primary), 0.04)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
                padding: '10px',
              }}
            >
              <button
                type="button"
                onClick={actions.togglePendingSeeds}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                  待处理来信
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                  {state.pendingSeeds.length} · {state.showPendingSeeds ? '收起' : '展开'}
                </span>
              </button>
              {state.showPendingSeeds ? state.pendingSeeds.length === 0 ? (
                <EmptyText text="暂无来信种子。重要事件触发后会在这里出现。" />
              ) : (
                state.pendingSeeds.map((seed) => (
                  <SeedCard
                    key={seed.id}
                    seed={seed}
                    loading={state.generatingSeedId === seed.id}
                    coolingDown={state.isSeedCoolingDown(seed)}
                    onDismiss={() => actions.dismissSeed(seed)}
                    onOpen={() => void actions.generateSeed(seed)}
                  />
                ))
              ) : state.pendingSeeds.length > 0 ? (
                <div className="truncate py-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                  有 {state.pendingSeeds.length} 条来信待处理，点击展开查看。
                </div>
              ) : (
                <div className="truncate py-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                  暂无待处理来信。
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                  {state.messageListMode === 'group' ? '群聊频道' : '好友短讯'}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                  {state.visibleChats.length}
                </span>
              </div>
              {state.visibleChats.length === 0 ? (
                <EmptyText
                  text={
                    state.messageListMode === 'group'
                      ? '暂无群聊频道。创建群聊或触发群聊来信后会出现。'
                      : '暂无好友短讯。认识角色后，私聊会出现在这里。'
                  }
                />
              ) : (
                state.visibleChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    avatar={resolveContactForChat(state.contacts, chat)?.avatar}
                    active={state.activeChat?.id === chat.id}
                    onClick={() => actions.selectChat(chat.id)}
                  />
                ))
              )}
            </section>
          </div>
        </div>
      </aside>

      <main className={`${state.mobileView === 'chat' ? 'flex' : 'hidden xl:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        {activeChat ? (
          <ChatSurface
            chat={activeChat}
            traveler={traveler}
            contact={contact}
            groupMembers={state.groupMembers}
            groupAddCandidates={state.groupAddCandidates}
            onSend={() => void actions.sendMessage()}
            draft={state.draft}
            onDraftChange={actions.setDraft}
            onRenameGroup={actions.renameGroup}
            onAddGroupMember={actions.addGroupMember}
            loading={state.sendingChatId === activeChat.id}
            error={state.phoneError}
            onBack={actions.backToList}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyText text="暂无会话。剧情认识角色后，聊天对象会逐步解锁。" />
          </div>
        )}
      </main>
    </div>
  );
}

function ChatListItem({
  chat,
  avatar,
  active,
  onClick,
}: {
  chat: 手机会话;
  avatar?: string;
  active: boolean;
  onClick: () => void;
}) {
  const last = chat.messages.at(-1);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 text-left transition-all"
      style={{
        background: active ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar name={chat.title} src={avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-text-primary))' }}>
              {chat.title}
            </span>
            {chat.unread > 0 && (
              <span className="rounded-full px-1.5 text-[10px]" style={{ background: 'rgba(220, 80, 80, 0.4)', color: '#fff' }}>
                {chat.unread}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
            {last?.content ?? '暂无消息'}
          </div>
        </div>
      </div>
    </button>
  );
}

function SeedCard({
  seed,
  loading,
  coolingDown,
  onOpen,
  onDismiss,
}: {
  seed: 主动来信种子;
  loading: boolean;
  coolingDown: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(220, 80, 80, 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {seed.title}
        </div>
        <span className="text-[10px]" style={{ color: seed.priority === 'urgent' ? 'rgb(var(--tj-danger))' : 'rgba(var(--tj-accent-primary), 0.75)' }}>
          {seed.priority.toUpperCase()}
        </span>
      </div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        {seed.context}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || coolingDown}
          className="py-1 text-[11px] font-serif tracking-[0.18em] disabled:opacity-50"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
            clipPath: smallClip,
          }}
        >
          {loading ? '接入中' : coolingDown ? '冷却中' : '打开'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="py-1 text-[11px] font-serif tracking-[0.18em]"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.85)',
            background: 'rgba(var(--tj-accent-primary), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
            clipPath: smallClip,
          }}
        >
          稍后
        </button>
      </div>
    </div>
  );
}
