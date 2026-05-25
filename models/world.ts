export interface 时段NPC {
  id: string;
  姓名: string;
  角色: string;
  性格: string;
  外貌: string;
  与玩家关系: string;
  记忆: string[];
}

export interface 派系定义 {
  id: string;
  名称: string;
  描述: string;
  影响力: number;
}

export interface 时段定义 {
  id: string;
  名称: string;
  年代: string;
  描述: string;
  氛围: string;
  关键事件: string[];
  科技水平: string;
  社会规范: string;
  派系: 派系定义[];
  人物: 时段NPC[];
}

import type { 难度ID, 剧情模式, 命途ID } from './journey';

export interface 世界状态 {
  当前时段: 时段定义;
  已访问时段: string[];
  /** 纪年法：崩铁世界观默认使用「琥珀纪年」。 */
  纪年法: string;
  /** 游戏内经过的天数，独立显示在主界面右上角。 */
  开拓天数: number;
  /** 当前日期：给 UI 与变量系统展示的年月日，如「琥珀纪 2157.03.07」。 */
  当前日期: string;
  /** 当前时间：一天内的具体时刻，统一使用 24 小时制，如「06:40」。 */
  当前时间: string;
  /** 当前地点：地图系统实装前，先以自由文本记录所在地点。 */
  当前地点: string;
  全局事件: string[];
  活跃人物: 时段NPC[];
  氛围变化: string;

  // 由「踏上旅途」向导写入。
  难度?: 难度ID;
  剧情模式?: 剧情模式;
  起航之地ID?: string;
  自定义起始场景名称?: string;
  自定义起始地点?: string;
  自定义起始场景描述?: string;
  自定义起始场景要点?: string[];
  自定义开局?: string;
  原著主角?: '星' | '穹' | '星穹双主角';

  // ── 命途狭间 ──
  // 二段式触发:AI 在合适剧情节点发出邀请 → 玩家点「踏入」 → 下一回合进入狭间问答。
  // 待触发狭间:AI 已发出邀请,等待玩家在 UI 上点击「踏入」。
  // 进行中狭间:玩家已踏入,本回合 AI 应进入命途狭间专用流程(出题/评判)。
  待触发狭间?: 命途ID;
  进行中狭间?: 命途ID;
}

export function 创建空世界状态(period?: 时段定义): 世界状态 {
  return {
    当前时段: period ?? createPlaceholderPeriod(),
    已访问时段: [],
    纪年法: '琥珀纪年',
    开拓天数: 1,
    当前日期: '',
    当前时间: '',
    当前地点: '',
    全局事件: [],
    活跃人物: [],
    氛围变化: '',
  };
}

export function 归一化世界状态(input?: Partial<世界状态> | null): 世界状态 {
  const base = 创建空世界状态(input?.当前时段);
  return {
    ...base,
    ...(input ?? {}),
    当前时段: input?.当前时段 ?? base.当前时段,
    已访问时段: Array.isArray(input?.已访问时段) ? input.已访问时段 : [],
  纪年法: input?.纪年法?.trim() || '琥珀纪年',
  开拓天数: Math.max(1, Math.trunc(Number(input?.开拓天数) || 1)),
  当前日期: input?.当前日期?.trim() || '琥珀纪 2157.03.07',
  当前时间: normalizeClock(input?.当前时间) || '06:40',
  当前地点: input?.当前地点?.trim() || '',
  全局事件: Array.isArray(input?.全局事件) ? input.全局事件 : [],
  活跃人物: Array.isArray(input?.活跃人物) ? input.活跃人物 : [],
  氛围变化: input?.氛围变化 ?? '',
};
}

function normalizeClock(value?: string | null): string {
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

  const legacyMap: Record<string, string> = {
    清晨: '06:40',
    上午: '09:40',
    午后: '14:10',
    黄昏: '18:20',
    夜晚: '21:30',
    深夜: '00:30',
  };
  return legacyMap[raw] ?? raw;
}

function createPlaceholderPeriod(): 时段定义 {
  return {
    id: '',
    名称: '',
    年代: '',
    描述: '',
    氛围: '',
    关键事件: [],
    科技水平: '',
    社会规范: '',
    派系: [],
    人物: [],
  };
}
