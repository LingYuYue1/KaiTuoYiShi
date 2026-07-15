/**
 * Pure: project formal SessionSnapshot → UI SessionView.
 *
 * Projection is narrow — not a full GameState dump.
 * Stage 5.1 adds traveler variable slice for Variable Manager / display.
 * Stage 5.2 adds a narrow knowledge projection (counts + unlocked titles).
 * Stage 5.3 adds narrow phone / news projections.
 */

import type {
  KnowledgeView,
  NewsView,
  PhoneView,
  SessionView,
  TravelerVariablesView,
} from '@/src/kernel/contract';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';

export function projectSession(
  snapshot: SessionSnapshot,
): SessionView {
  const traveler = snapshot.state.variables.旅人;
  const travelerVariables: TravelerVariablesView = {
    姓名: traveler.姓名,
    身份: traveler.身份,
    外貌: traveler.外貌,
    性格: traveler.性格,
    背景: traveler.背景,
    数值属性: { ...traveler.数值属性 },
  };

  return {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    turnCount: snapshot.state.turnCount,
    turns: snapshot.state.turns.map((t) => ({
      id: t.id,
      playerText: t.playerText,
      narrativeText: t.narrativeText,
    })),
    messages: snapshot.state.messages,
    travelerName: snapshot.state.travelerName,
    travelerVariables,
    knowledge: projectKnowledge(snapshot),
    phone: projectPhone(snapshot),
    news: projectNews(snapshot),
  };
}

function projectKnowledge(snapshot: SessionSnapshot): KnowledgeView {
  const { zhiku, yiting, story } = snapshot.state.knowledge;
  const unlockedTitles = zhiku.entries
    .filter((entry) => isOpenUnlock(entry.runtimeUnlockStatus ?? entry.unlockStatus))
    .map((entry) => entry.title);

  return {
    yitingEntryCount: yiting.entries.length,
    zhikuEntryCount: zhiku.entries.length,
    storyArchiveCount: story.archives.length,
    unlockedZhikuTitles: unlockedTitles,
  };
}

function projectPhone(snapshot: SessionSnapshot): PhoneView {
  const { threads } = snapshot.state.phone;
  let messageCount = 0;
  const lastMessages: PhoneView['lastMessages'][number][] = [];

  for (const thread of threads) {
    messageCount += thread.messages.length;
    const last = thread.messages[thread.messages.length - 1];
    if (last) {
      lastMessages.push({
        contactId: thread.contactId,
        contactName: thread.contactName,
        content: last.content,
        role: last.role,
      });
    }
  }

  return {
    threadCount: threads.length,
    messageCount,
    lastMessages,
  };
}

function projectNews(snapshot: SessionSnapshot): NewsView {
  const { entries } = snapshot.state.news;
  return {
    entryCount: entries.length,
    latestTitles: entries.slice(0, 5).map((entry) => entry.title),
  };
}

function isOpenUnlock(status: string | undefined): boolean {
  const text = (status ?? '').trim();
  if (!text) return false;
  return /默认可用|已解锁|可用|可预热/.test(text) && !/未解锁|锁定|只读/.test(text);
}
