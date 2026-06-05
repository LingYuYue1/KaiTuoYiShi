import fs from 'node:fs';

const source = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');

const checks = [
  {
    label: 'mobile view state exists',
    ok: source.includes("type MobilePhoneView = 'list' | 'chat' | 'contact'") && source.includes('const [mobileView, setMobileView]'),
  },
  {
    label: 'message list and chat surface are mutually exclusive on mobile',
    ok:
      source.includes("mobileView === 'list' ? 'flex' : 'hidden xl:flex") &&
      source.includes("mobileView === 'chat' ? 'flex' : 'hidden xl:flex"),
  },
  {
    label: 'contacts list and detail surface are mutually exclusive on mobile',
    ok:
      source.includes("mobileView === 'contact' ? 'flex' : 'hidden xl:flex") &&
      source.includes("setMobileView('contact')"),
  },
  {
    label: 'mobile detail pages can return to list',
    ok: source.includes('onBack={() => setMobileView') && source.includes('xl:hidden'),
  },
  {
    label: 'desktop shell remains available at xl breakpoint',
    ok: source.includes("activeApp ? 'hidden xl:flex' : 'flex'") && source.includes('xl:w-[980px]'),
  },
  {
    label: 'mobile phone sidebars keep scroll inside the list panel',
    ok:
      source.includes("flex-col overflow-hidden xl:w-[292px]") &&
      source.includes("flex-col overflow-hidden xl:w-[280px]"),
  },
  {
    label: 'mobile message and contact lists have touch scroll containers',
    ok:
      (source.match(/min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3/g) ?? []).length >= 2 &&
      source.includes('[-webkit-overflow-scrolling:touch]'),
  },
  {
    label: 'mobile group member picker keeps independent touch scroll',
    ok: source.includes('max-h-36 touch-pan-y space-y-1 overflow-y-auto overscroll-contain pr-1'),
  },
  {
    label: 'chat surface auto-scrolls to latest message on open and append',
    ok:
      source.includes('messagesScrollRef') &&
      source.includes('messagesEndRef') &&
      source.includes('container.scrollTop = container.scrollHeight') &&
      source.includes("messagesEndRef.current?.scrollIntoView({ block: 'end' })") &&
      source.includes('[chat.id, chat.messages.length]'),
  },
  {
    label: 'message sidebar separates private and group chat lists',
    ok:
      source.includes("type MessageListMode = 'private' | 'group'") &&
      source.includes('const [messageListMode, setMessageListMode]') &&
      source.includes("messageListMode === 'group' ? groupChats : privateChats") &&
      source.includes("好友 ${privateChats.length}") &&
      source.includes("群聊 ${groupChats.length}"),
  },
  {
    label: 'pending phone seeds can collapse in message sidebar',
    ok:
      source.includes('const [showPendingSeeds, setShowPendingSeeds]') &&
      source.includes('setShowPendingSeeds((v) => !v)') &&
      source.includes("showPendingSeeds ? '收起' : '展开'"),
  },
  {
    label: 'auto-created group chats use standardized titles',
    ok:
      source.includes('buildStandardGroupTitle') &&
      source.includes('拉人入群') &&
      source.includes('列车组频道') &&
      source.includes('临时频道') &&
      source.includes('title: buildStandardGroupTitle(groupParticipantIds, seed.title)'),
  },
  {
    label: 'group chat title can be renamed from chat surface',
    ok:
      source.includes('handleRenameGroupChat') &&
      source.includes('onRenameGroup') &&
      source.includes('setRenamingGroup(true)') &&
      source.includes("chat.type === 'group' && !renamingGroup") &&
      source.includes('title: nextTitle'),
  },
  {
    label: 'group chat members can be viewed from chat surface',
    ok:
      source.includes('groupMembers={activeChat.type ===') &&
      source.includes('const [showGroupMembers, setShowGroupMembers]') &&
      source.includes('setShowGroupMembers((v) => !v)') &&
      source.includes('成员 {groupMembers?.length ?? chat.participantIds.length}') &&
      source.includes('群聊成员') &&
      source.includes('max-h-64 w-[min(320px,calc(100vw-48px))]'),
  },
  {
    label: 'group chat members panel can add contacts to the group',
    ok:
      source.includes('handleAddGroupMember') &&
      source.includes('participantIds: [...chat.participantIds, contact.id]') &&
      source.includes('groupAddCandidates={activeChat.type ===') &&
      source.includes('const [showAddMembers, setShowAddMembers]') &&
      source.includes('aria-label="拉人入群"') &&
      source.includes('title="拉人入群"') &&
      source.includes('setShowGroupMembers(false)') &&
      source.includes('onAddGroupMember?.(chat.id, candidate)') &&
      source.includes('暂无可拉入的联系人。'),
  },
  {
    label: 'chat header wraps controls for narrow mobile widths',
    ok:
      source.includes('relative flex flex-wrap items-start justify-between') &&
      source.includes('flex min-w-0 flex-1 items-center gap-3') &&
      source.includes('flex flex-shrink-0 items-start gap-2') &&
      source.includes('flex flex-col items-end gap-2'),
  },
];

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error('[phone-mobile-layout-regression] failed checks:');
  for (const check of failed) console.error(`- ${check.label}`);
  process.exit(1);
}

console.log(`[phone-mobile-layout-regression] ${checks.length} checks passed.`);
