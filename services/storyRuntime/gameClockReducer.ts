// G1.3.1 gameClockReducer：GameTime 推进（确定性）。
// - GameTime 只用 { dayOrdinal, minuteOfDay }；显示日期不参与内部身份；
// - turnCount 增加不等于世界时间增加；无合法 advance_time 时 clock 不变；
// - 同一事务最多合并一次时间推进；默认兼容策略 10 分钟但由固定 policy 输入。
import type { GameTime, StoryRuntimeState } from '../../models/storyRuntime';

export type ClockResult = { ok: true; state: StoryRuntimeState } | { ok: false; code: string; message: string };

const MINUTES_PER_DAY = 1440;

/** 确定性推进：minuteOfDay 累加并跨日进位。 */
export function addMinutes(time: GameTime, deltaMinutes: number): GameTime {
  const total = time.dayOrdinal * MINUTES_PER_DAY + time.minuteOfDay + deltaMinutes;
  return { dayOrdinal: Math.floor(total / MINUTES_PER_DAY), minuteOfDay: total % MINUTES_PER_DAY };
}

export function compareGameTime(a: GameTime, b: GameTime): number {
  return (a.dayOrdinal * MINUTES_PER_DAY + a.minuteOfDay) - (b.dayOrdinal * MINUTES_PER_DAY + b.minuteOfDay);
}

/**
 * 推进时钟：仅 advance_time 命令触发；deltaMinutes 缺省时用 state.gameClock.defaultAdvanceMinutes
 * （固定 policy，本阶段默认 10）。turnCount 不直接改变世界时间。
 * lastAdvanceRevision 必须等于实际提交后的 runtimeRevision（调用方传入 committedRevision）。
 */
export function advanceGameClock(
  state: StoryRuntimeState,
  input: { deltaMinutes?: number; commandId?: string; policyVersion?: number; committedRevision?: number },
): ClockResult {
  const delta = input.deltaMinutes !== undefined && input.deltaMinutes >= 0
    ? input.deltaMinutes
    : state.gameClock.defaultAdvanceMinutes;
  if (!(typeof delta === 'number' && Number.isFinite(delta) && delta >= 0)) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'deltaMinutes 必须是非负有限 number' };
  }
  if (delta === 0) {
    // 零推进：clock 不变（允许但无副作用）。
    return { ok: true, state };
  }
  const committedRevision = input.committedRevision ?? state.runtimeRevision + 1;
  const next: StoryRuntimeState = {
    ...state,
    gameClock: {
      now: addMinutes(state.gameClock.now, delta),
      defaultAdvanceMinutes: state.gameClock.defaultAdvanceMinutes,
      policyVersion: input.policyVersion ?? state.gameClock.policyVersion,
      lastAdvanceRevision: committedRevision,
      lastAdvanceCommandId: input.commandId,
    },
  };
  return { ok: true, state: next };
}
