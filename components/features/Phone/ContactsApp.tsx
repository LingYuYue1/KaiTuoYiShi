import type { 手机联系人 } from '@/models/phone';
import type { PhoneActions, PhoneState } from '@/hooks/usePhone';
import { Avatar, EmptyText } from './primitives';
import { smallClip } from './phoneStyles';

export function ContactsApp({ state, actions }: { state: PhoneState; actions: PhoneActions }) {
  const activeContact = state.activeContact;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
      <aside
        className={`${state.mobileView === 'list' ? 'flex' : 'hidden xl:flex'} min-h-0 w-full flex-shrink-0 flex-col overflow-hidden xl:w-[280px]`}
        style={{
          borderRight: '1px solid rgba(var(--tj-accent-primary), 0.22)',
          background: 'rgba(var(--tj-bubble), 0.86)',
        }}
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
          <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
            通讯录
          </div>
          <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
            已解锁联系人
          </div>
          <button
            type="button"
            onClick={actions.toggleAddContact}
            className="mt-3 flex w-full items-center justify-between px-3 py-2 text-left transition-all hover:opacity-90"
            style={{
              color: 'rgb(var(--tj-accent-primary))',
              background: state.showAddContact ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.05)',
              boxShadow: state.showAddContact
                ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.48)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
              clipPath: smallClip,
            }}
          >
            <span className="font-serif text-[12px] font-bold tracking-[0.18em]">添加好友</span>
            <span className="text-base">{state.showAddContact ? '−' : '+'}</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-2">
            {state.showAddContact && (
              <AddContactPanel candidates={state.addableNpcContacts} onAdd={actions.addContact} />
            )}
            {state.contacts.length === 0 ? (
              <EmptyText text="暂无可联系对象。可点击上方添加已认识角色。" />
            ) : (
              state.contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => actions.selectContact(contact.id)}
                  className="w-full px-3 py-2 text-left transition-all"
                  style={{
                    background:
                      activeContact?.id === contact.id ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-accent-primary), 0.04)',
                    boxShadow:
                      activeContact?.id === contact.id
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={contact.name} src={contact.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {contact.name}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                        {contact.relationLabel ?? '联系人'} {contact.organization ? `· ${contact.organization}` : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className={`${state.mobileView === 'contact' ? 'flex' : 'hidden xl:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        <ContactSurface
          contact={activeContact}
          onOpenChat={() => {
            if (activeContact) actions.startChat(activeContact);
          }}
          onBack={actions.backToList}
        />
      </main>
    </div>
  );
}

function ContactSurface({
  contact,
  onOpenChat,
  onBack,
}: {
  contact?: 手机联系人;
  onOpenChat: () => void;
  onBack?: () => void;
}) {
  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <EmptyText text="暂无联系人。遇见 NPC 后可在这里查看名片、关系与对话入口。" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
        <div className="flex items-center gap-3">
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
          <Avatar name={contact.name} src={contact.avatar} />
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              {contact.name}
            </div>
            <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
              {contact.relationLabel ?? '联系人'} {contact.organization ? `· ${contact.organization}` : ''}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{
            background: contact.available ? 'rgba(90, 180, 120, 0.18)' : 'rgba(220, 80, 80, 0.2)',
            color: contact.available ? 'rgb(var(--tj-sage-deep, var(--tj-accent-primary)))' : 'rgb(var(--tj-danger))',
          }}
        >
          {contact.available ? '在场' : '离线'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <InfoCard label="身份" value={contact.relationLabel ?? '联系人'} />
          <InfoCard label="势力" value={contact.organization || '未知'} />
          <InfoCard label="最近回合" value={contact.lastActiveTurn !== undefined ? `第 ${contact.lastActiveTurn} 回合` : '未记录'} />
          <InfoCard label="状态" value={contact.available ? '可以联系' : '暂不可联系'} />
        </div>
        <button
          type="button"
          onClick={onOpenChat}
          className="mt-4 w-full py-2.5 text-sm font-serif tracking-[0.24em] transition-all hover:opacity-90"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45), 0 0 14px rgba(var(--tj-accent-primary),0.16)',
            clipPath: smallClip,
          }}
        >
          发送短讯
        </button>
        <div className="mt-4 rounded-none px-4 py-4" style={{ background: 'rgba(var(--tj-accent-primary), 0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)', clipPath: smallClip }}>
          <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            点击发送短讯会建立独立会话。聊天内容由手机系统 API 生成，不会直接塞进正文，但会写入记忆供后续剧情承接。
          </div>
        </div>
      </div>
    </div>
  );
}

function AddContactPanel({
  candidates,
  onAdd,
}: {
  candidates: 手机联系人[];
  onAdd: (contact: 手机联系人) => void;
}) {
  return (
    <div
      className="mb-3 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 font-serif text-[11px] font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        可添加对象
      </div>
      {candidates.length === 0 ? (
        <div className="py-3 text-center text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>
          当前没有可添加的已认识角色。
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onAdd(contact)}
              className="flex w-full items-center gap-2 px-2 py-2 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <Avatar name={contact.name} src={contact.avatar} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                  {contact.name}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.65)' }}>
                  {contact.relationLabel ?? '已认识'} {contact.organization ? `· ${contact.organization}` : ''}
                </div>
              </div>
              <span className="font-serif text-lg" style={{ color: 'rgb(var(--tj-accent-primary))' }}>+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {value}
      </div>
    </div>
  );
}
