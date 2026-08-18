// 命途系统 —— 旅人可同时承载多条命途，每条命途有阶段与进度。
// 命途影响通过阶段、特质回响与战技槽位进入正文叙事，不再承担独立战斗系统的数值职责。
// 后续变量系统会通过 命途增量 + applyPathDeltas 接口来推进进度（见 services/pathService.ts）。

import type { 命途ID, 命途定义 } from './journey';

// ── 阶段 ──
// 五阶段:浅涉 → 践行 → 深诣 → 伪令使 → 令使
// 自然推进最高只能到 stage 3(伪令使),stage 4(令使)需要剧情触发"星神亲自授力"。
export type 命途阶段 = 0 | 1 | 2 | 3 | 4;

export const PATH_STAGE_DEFS: { stage: 命途阶段; name: string; title: string; blurb: string }[] = [
  {
    stage: 0,
    name: '浅涉',
    title: '初步感知',
    blurb: '隐约感受到命途的召唤，尚未形成明确的行者意志，力量微弱且不稳定。',
  },
  {
    stage: 1,
    name: '践行',
    title: '命途行者',
    blurb: '正式踏上命途，能稳定调用命途之力，形成个人战斗风格。',
  },
  {
    stage: 2,
    name: '深诣',
    title: '资深行者',
    blurb: '对命途理念有深刻理解，力量显著增长，开始展现独特的践行方式。',
  },
  {
    stage: 3,
    name: '伪令使',
    title: '准令使级',
    blurb: '命途意志主动垂青，实力产生质变，言行开始影响周围环境，被视为命途的代言人候选。自然修行的天花板。',
  },
  {
    stage: 4,
    name: '令使',
    title: '令使级',
    blurb: '命途星神亲自下旨授予力量的使者，实力与普通行者有天壤之别，拥有改变战局的能力。仅由星神亲临剧情触发，不可凭自身修行抵达。',
  },
];

export const STAGE_PROGRESS_MAX = 100;

/** 单条命途单个游戏日(in-fiction)可累积的命途进度上限。
 *  超过此值的 add 会被 variableExecutor 截断,并向玩家显示"今天已经在这方面有所感悟了"。 */
export const DAILY_PROGRESS_CAP = 10;

// ── 一条命途的进度记录 ──
export interface 命途进度 {
  id: 命途ID;
  阶段: 命途阶段;
  进度: number;       // 0..STAGE_PROGRESS_MAX，当前阶段内的进度
  是否主命途: boolean;     // 主命途（开局选的那条；之后可被显式切换）
  觉醒于: string;     // in-fiction 时间戳，用于「命途狭间」回溯
  备注: string;          // 触发由来 / 玩家备注
  /** 今日已累计进度(0..DAILY_PROGRESS_CAP),用于 24h 上限。
   *  在 今日日期 与当前世界日期不同时归零。 */
  今日累计?: number;
  /** 上次累计对应的世界日期(in-fiction)。日期跳变时 今日累计 归零。 */
  今日日期?: string;
  /** 是否处于"满进度待升阶"状态。当 进度 达到 100 时由系统标记 true,
   *  等待命途狭间问答事件触发后才真升阶。stage 3→4 永远不会进入此状态(走星神授力路径)。 */
  待升阶?: boolean;
}

export function 创建命途进度(
  id: 命途ID,
  isPrimary: boolean,
  awakenedAt: string,
  notes = '',
): 命途进度 {
  return {
    id,
    阶段: 0,
    进度: 0,
    是否主命途: isPrimary,
    觉醒于: awakenedAt,
    备注: notes,
    今日累计: 0,
    今日日期: '',
    待升阶: false,
  };
}

// ── 变量系统的接入点 ──
// 未来回合结束后，「变量分析器」会读取本回合 AI 输出 → 产出 命途增量[]
// → applyPathDeltas 把它们应用到 TravelerProfile.paths 上。
// 这里只定义协议，分析器本身是另一阶段的事。
export interface 命途增量 {
  pathId: 命途ID;
  progressDelta?: number;  // 累加到当前阶段进度；溢出会自动进阶
  newPath?: boolean;       // 是否首次踏上（true → 触发命途狭间）
  setPrimary?: boolean;    // 是否同时设为主命途
  reason?: string;         // 来源说明，用于面板上显示
}

export interface 命途特质 {
  名称: string;
  说明: string;
}

export interface 命途核心理念 {
  核心: string;
  拷问: string[];
}

export interface 命途目录项 extends 命途定义 {
  traits: 命途特质[];
  belief: 命途核心理念;
}

export {
  PATH_CORE_BELIEFS,
  PATH_TRAIT_DEFS,
  获取命途特质,
} from '@/data/pathCatalog';

// ── 忘却命途机制 ──
// 当某条命途进入「深诣」(stage >= 2) 后继续推进，会以下表比率衰减其它「非主」命途的进度。
// 即：你越专注一条路，其它命途越容易被淡忘。
// 主命途 (isPrimary) 不受忘却影响。
export const FORGET_RATE_BY_STAGE: Record<命途阶段, number> = {
  0: 0,
  1: 0,
  2: 0.1,
  3: 0.2,
  4: 0.35,
};
