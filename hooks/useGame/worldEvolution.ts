import type { 世界状态, 时段定义 } from '@/models/world';
import { 推进琥珀日期 } from '@/models/world';
import { timePeriodPresets } from '@/data/timePeriodPresets';

export function switchTimePeriod(
  state: 世界状态,
  periodId: string,
): 世界状态 {
  const period = timePeriodPresets.find((p) => p.id === periodId);
  if (!period) return state;

  return {
    ...state,
    当前时段: { ...period },
    已访问时段: [...new Set([...state.已访问时段, periodId])],
    当前时间: getDefaultTime(period),
    氛围变化: `时空波动——已抵达【${period.名称}】`,
  };
}

export function advanceGameTime(state: 世界状态): 世界状态 {
  const currentDate = state.当前日期?.trim() || '琥珀纪 2157.03.07';
  const nextTime = state.当前时间
    ? incrementTime(state.当前时间)
    : getDefaultTime(state.当前时段);
  const crossedDay = 是否跨日(state.当前时间, nextTime);

  return {
    ...state,
    纪年法: state.纪年法 || '琥珀纪年',
    开拓天数: crossedDay ? Math.max(1, state.开拓天数 || 1) + 1 : Math.max(1, state.开拓天数 || 1),
    当前日期: crossedDay ? 推进琥珀日期(currentDate) : currentDate,
    当前时间: nextTime,
    氛围变化: '',
  };
}

function getDefaultTime(period: 时段定义): string {
  return getDefaultTimeByPeriod(period.名称);
}

function incrementTime(time: string): string {
  const normalized = time.trim();
  const base = normalizeClock(normalized) || getDefaultTimeByPeriod('清晨');
  return addMinutes(base, 10);
}

function 是否跨日(before: string, after: string): boolean {
  const parse = (value: string) => {
    const match = normalizeClock(value)?.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const b = parse(before);
  const a = parse(after);
  return b !== null && a !== null && a <= b;
}

function addMinutes(time: string, delta: number): string {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;
  const total = (Number(match[1]) * 60 + Number(match[2]) + delta) % (24 * 60);
  const h = Math.floor(total / 60).toString().padStart(2, '0');
  const m = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function normalizeClock(value: string): string {
  const raw = value?.trim();
  if (!raw) return '';
  const embedded = raw.match(/(\d{1,2}:\d{2})/);
  if (embedded) {
    const [hours, minutes] = embedded[1].split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }
  return getDefaultTimeByPeriod(raw);
}

function getDefaultTimeByPeriod(periodName: string): string {
  const map: Record<string, string> = {
    清晨: '06:40',
    上午: '09:40',
    午后: '14:10',
    黄昏: '18:20',
    夜晚: '21:30',
    深夜: '00:30',
  };
  return map[periodName] || '06:40';
}
