/**
 * Pure: project formal SessionSnapshot → UI SessionView.
 *
 * Projection is narrow — not a full GameState dump.
 * Stage 5.1 adds traveler variable slice for Variable Manager / display.
 */

import type { SessionView, TravelerVariablesView } from '@/src/kernel/contract';
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
  };
}
