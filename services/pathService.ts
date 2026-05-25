// 命途系统的"逻辑层" —— 提供给未来的「变量分析器」消费。
//
// 协议：
//   AI 每回合输出 → 变量分析器解析 → 产出 命途增量[]
//   → applyPathDeltas(traveler, deltas) → 新的 角色数据结构
//
// 当前阶段：变量分析器还没建，下方的 awakenPath / advancePath 提供给 UI 调试用。

import type { 命途ID } from '@/models/journey';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 命途增量, 命途进度, 命途阶段 } from '@/models/path';
import {
  STAGE_PROGRESS_MAX,
  DAILY_PROGRESS_CAP,
  创建命途进度,
  PATH_SCHOOL_CONFLICTS,
  FORGET_RATE_BY_STAGE,
} from '@/models/path';
import { getPath } from '@/data/journeyPresets';

/** 内部：找到指定命途的索引，找不到返回 -1。 */
function findPathIndex(paths: 命途进度[], id: 命途ID): number {
  return paths.findIndex((p) => p.id === id);
}

/**
 * 进度变化：正向不会跨越 100（满 100 改为 99 + 待升阶 = true,等命途狭间事件）。
 * 负向允许跨阶倒退。
 * 自然修行不会触达 stage 4（令使,仅星神授力）;若已在 stage 3 满进度,同样标记 待升阶 等剧情。
 */
function bumpProgress(prog: 命途进度, delta: number): 命途进度 {
  if (delta === 0) return prog;
  let stage: 命途阶段 = prog.阶段;
  let progress = prog.进度 + delta;
  let 待升阶 = prog.待升阶 ?? false;

  // 正向：满 100 不自动跨阶,改为 99 + 待升阶
  if (delta > 0 && progress >= STAGE_PROGRESS_MAX) {
    progress = STAGE_PROGRESS_MAX - 1;
    待升阶 = true;
  }
  // 负向：允许跨阶下降
  while (progress < 0 && stage > 0) {
    progress += STAGE_PROGRESS_MAX;
    stage = (stage - 1) as 命途阶段;
    待升阶 = false;
  }
  if (stage === 0 && progress < 0) progress = 0;

  return { ...prog, 阶段: stage, 进度: progress, 待升阶 };
}

// ── 24h in-fiction 累计上限推进 ──
// AI 通过 add 旅人.命途列表[id=xxx].进度 推动命途时,会走这里:
// - 同一 in-fiction 日期内,累计推进不超过 DAILY_PROGRESS_CAP
// - 满进度时不自动升阶,而是标记 待升阶 = true,等命途狭间事件
// - bypass = true 用于「突破自我」类剧情高潮关键节点,绕过日上限
export interface 推进结果 {
  traveler: 角色数据结构;
  applied: number;          // 实际应用的 delta
  capped: boolean;          // 是否被日上限截断
  ready: boolean;           // 是否本次推进后达到 待升阶
  message?: string;         // 给 UI / 玩家展示的提示
}

export function 推进命途进度(
  traveler: 角色数据结构,
  pathId: 命途ID,
  delta: number,
  currentDate: string,
  options: { bypassDailyCap?: boolean } = {},
): 推进结果 {
  const paths = traveler.命途列表 ?? [];
  const idx = findPathIndex(paths, pathId);
  if (idx < 0) {
    return { traveler, applied: 0, capped: false, ready: false, message: '尚未踏上此命途' };
  }

  const prog = paths[idx];

  // 负向:直接走 bumpProgress
  if (delta < 0) {
    const next = [...paths];
    next[idx] = bumpProgress(prog, delta);
    return {
      traveler: { ...traveler, 命途列表: next },
      applied: delta,
      capped: false,
      ready: false,
    };
  }

  if (delta === 0) {
    return { traveler, applied: 0, capped: false, ready: prog.待升阶 ?? false };
  }

  // 满进度待升阶:拒绝继续累积
  if (prog.待升阶) {
    return {
      traveler,
      applied: 0,
      capped: true,
      ready: true,
      message: '命途进度已满,正等待「命途狭间」之引,无法再行积累',
    };
  }

  // 日期跳变:今日累计归零
  const sameDay = (prog.今日日期 ?? '') === currentDate;
  const todayAccum = sameDay ? (prog.今日累计 ?? 0) : 0;

  let applied = delta;
  let capped = false;
  if (!options.bypassDailyCap) {
    const remaining = Math.max(0, DAILY_PROGRESS_CAP - todayAccum);
    if (remaining <= 0) {
      return {
        traveler,
        applied: 0,
        capped: true,
        ready: false,
        message: '今天已经在这方面有所感悟了,一时间没有太多突破',
      };
    }
    if (delta > remaining) {
      applied = remaining;
      capped = true;
    }
  }

  const bumped = bumpProgress(prog, applied);
  const nextRecord: 命途进度 = {
    ...bumped,
    今日累计: todayAccum + applied,
    今日日期: currentDate,
  };

  const nextPaths = [...paths];
  nextPaths[idx] = nextRecord;

  return {
    traveler: { ...traveler, 命途列表: nextPaths },
    applied,
    capped,
    ready: nextRecord.待升阶 ?? false,
    message: capped
      ? '今天已经在这方面有所感悟了,一时间没有太多突破'
      : nextRecord.待升阶
        ? '命途进度已满,即将迎来「命途狭间」之引'
        : undefined,
  };
}

// ── 公共：手动踏上一条新命途（UI 调试 / 剧情显式钩子） ──
export function awakenPath(
  traveler: 角色数据结构,
  pathId: 命途ID,
  options: { awakenedAt?: string; notes?: string; primary?: boolean } = {},
): { traveler: 角色数据结构; isNew: boolean } {
  const paths = [...(traveler.命途列表 ?? [])];
  const existingIdx = findPathIndex(paths, pathId);
  const awakenedAt = options.awakenedAt ?? '';

  if (existingIdx >= 0) {
    // 已有：可能切换主命途
    if (options.primary) {
      const updated = paths.map((p, i) => ({ ...p, 是否主命途: i === existingIdx }));
      return { traveler: { ...traveler, 命途列表: updated }, isNew: false };
    }
    return { traveler, isNew: false };
  }

  const newRecord = 创建命途进度(
    pathId,
    Boolean(options.primary),
    awakenedAt,
    options.notes ?? '剧情中踏上',
  );

  // 若指定为主命途，先清掉旧主标记
  let updated = paths;
  if (newRecord.是否主命途) {
    updated = paths.map((p) => ({ ...p, 是否主命途: false }));
  }
  updated = [...updated, newRecord];

  return {
    traveler: { ...traveler, 命途列表: updated, 主命途: newRecord.是否主命途 ? pathId : traveler.主命途 },
    isNew: true,
  };
}

// ── 公共：变量系统的统一入口 ──
// 返回值带 awakenedPathIds，方便上层触发「命途狭间」剧情。
// 同时返回 forgottenLosses（忘却 + 流派冲突造成的反向衰减），方便 UI 上做提示。
export function applyPathDeltas(
  traveler: 角色数据结构,
  deltas: 命途增量[],
  awakenedAt: string,
  options: { currentDate?: string; bypassDailyCap?: boolean } = {},
): {
  traveler: 角色数据结构;
  awakenedPathIds: 命途ID[];
  forgottenLosses: { pathId: 命途ID; loss: number; reason: 'forget' | 'conflict' }[];
} {
  let next = traveler;
  const awakenedPathIds: 命途ID[] = [];
  const forgottenLosses: { pathId: 命途ID; loss: number; reason: 'forget' | 'conflict' }[] = [];

  for (const d of deltas) {
    if (d.newPath) {
      const res = awakenPath(next, d.pathId, {
        awakenedAt,
        notes: d.reason,
        primary: d.setPrimary,
      });
      next = res.traveler;
      if (res.isNew) awakenedPathIds.push(d.pathId);
    } else if (d.setPrimary) {
      const idx = findPathIndex(next.命途列表 ?? [], d.pathId);
      if (idx >= 0) {
        const paths = (next.命途列表 ?? []).map((p, i) => ({ ...p, 是否主命途: i === idx }));
        next = { ...next, 命途列表: paths, 主命途: d.pathId };
      }
    }

    if (d.progressDelta) {
      const idx = findPathIndex(next.命途列表 ?? [], d.pathId);
      if (idx >= 0) {
        const progressResult = 推进命途进度(
          next,
          d.pathId,
          d.progressDelta,
          options.currentDate ?? awakenedAt,
          { bypassDailyCap: options.bypassDailyCap },
        );
        next = progressResult.traveler;

        // 正向推进时计算「忘却」与「流派冲突」衰减
        if (progressResult.applied > 0) {
          const forgetLosses = computeForgetting(next, d.pathId, progressResult.applied);
          const conflictLosses = computeSchoolConflicts(next, d.pathId, progressResult.applied);

          for (const fl of forgetLosses) {
            const i = findPathIndex(next.命途列表 ?? [], fl.pathId);
            if (i >= 0) {
              const ps = [...(next.命途列表 ?? [])];
              ps[i] = bumpProgress(ps[i], -fl.loss);
              next = { ...next, 命途列表: ps };
              forgottenLosses.push({ pathId: fl.pathId, loss: fl.loss, reason: 'forget' });
            }
          }
          for (const cl of conflictLosses) {
            const i = findPathIndex(next.命途列表 ?? [], cl.pathId);
            if (i >= 0) {
              const ps = [...(next.命途列表 ?? [])];
              ps[i] = bumpProgress(ps[i], -cl.loss);
              next = { ...next, 命途列表: ps };
              forgottenLosses.push({ pathId: cl.pathId, loss: cl.loss, reason: 'conflict' });
            }
          }
        }
      }
    }
  }

  return { traveler: next, awakenedPathIds, forgottenLosses };
}

// ── 忘却命途机制 ──
// 推进方阶段 >= 2 时，按 FORGET_RATE_BY_STAGE 衰减其它「非主」命途。
// 主命途 (isPrimary) 不受影响；推进方自身也不衰减自己。
export function computeForgetting(
  traveler: 角色数据结构,
  advancedPathId: 命途ID,
  appliedDelta: number,
): { pathId: 命途ID; loss: number }[] {
  const paths = traveler.命途列表 ?? [];
  const advanced = paths.find((p) => p.id === advancedPathId);
  if (!advanced) return [];
  const rate = FORGET_RATE_BY_STAGE[advanced.阶段];
  if (rate <= 0 || appliedDelta <= 0) return [];

  const losses: { pathId: 命途ID; loss: number }[] = [];
  for (const p of paths) {
    if (p.id === advancedPathId) continue;
    if (p.是否主命途) continue;
    const loss = Math.round(appliedDelta * rate);
    if (loss > 0) losses.push({ pathId: p.id, loss });
  }
  return losses;
}

// ── 流派冲突 ──
// 当推进方所属流派与目标流派存在 PATH_SCHOOL_CONFLICTS 配置时，
// 按 intensity 让目标命途反向衰减。主命途也受冲突影响（理念层面的对立）。
export function computeSchoolConflicts(
  traveler: 角色数据结构,
  advancedPathId: 命途ID,
  appliedDelta: number,
): { pathId: 命途ID; loss: number }[] {
  if (appliedDelta <= 0) return [];
  const paths = traveler.命途列表 ?? [];
  const advancedDef = getPath(advancedPathId);
  if (!advancedDef?.school) return [];

  const conflictsFromAdvanced = PATH_SCHOOL_CONFLICTS.filter((c) => c.from === advancedDef.school);
  if (conflictsFromAdvanced.length === 0) return [];

  const losses: { pathId: 命途ID; loss: number }[] = [];
  for (const p of paths) {
    if (p.id === advancedPathId) continue;
    const def = getPath(p.id);
    if (!def?.school) continue;
    const conflict = conflictsFromAdvanced.find((c) => c.to === def.school);
    if (!conflict) continue;
    const loss = Math.round(appliedDelta * conflict.intensity);
    if (loss > 0) losses.push({ pathId: p.id, loss });
  }
  return losses;
}

// ── UI 用：手动加进度（开发/调试） ──
export function manualBumpProgress(
  traveler: 角色数据结构,
  pathId: 命途ID,
  delta: number,
): 角色数据结构 {
  const idx = findPathIndex(traveler.命途列表 ?? [], pathId);
  if (idx < 0) return traveler;
  const paths = [...(traveler.命途列表 ?? [])];
  paths[idx] = bumpProgress(paths[idx], delta);
  return { ...traveler, 命途列表: paths };
}

// ── UI 用：设为主命途 ──
export function setPrimaryPath(
  traveler: 角色数据结构,
  pathId: 命途ID,
): 角色数据结构 {
  const paths = (traveler.命途列表 ?? []).map((p) => ({ ...p, 是否主命途: p.id === pathId }));
  return { ...traveler, 命途列表: paths, 主命途: pathId };
}

// ── AI 文本解析:把 "巡猎" / "hunt" / "Hunt" 之类的字符串归一为 命途ID ──
// 用于解析 <触发狭间>...</触发狭间> 标签里 AI 写的命途标识。
const PATH_NAME_TO_ID: Record<string, 命途ID> = {
  none: 'none',
  hunt: 'hunt', 巡猎: 'hunt',
  destruction: 'destruction', 毁灭: 'destruction',
  preservation: 'preservation', 存护: 'preservation',
  abundance: 'abundance', 丰饶: 'abundance',
  remembrance: 'remembrance', 记忆: 'remembrance',
  erudition: 'erudition', 智识: 'erudition',
  elation: 'elation', 欢愉: 'elation',
  nihility: 'nihility', 虚无: 'nihility',
  harmony: 'harmony', 同谐: 'harmony',
};

export function 解析命途ID(raw: string): 命途ID | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (PATH_NAME_TO_ID[cleaned]) return PATH_NAME_TO_ID[cleaned];
  // 中文不走 toLowerCase
  const cleanedCn = raw.trim().replace(/^["']|["']$/g, '');
  if (PATH_NAME_TO_ID[cleanedCn]) return PATH_NAME_TO_ID[cleanedCn];
  return null;
}

// ── UI 用:玩家点击「踏入」邀请卡片时把世界状态从「待触发」迁移到「进行中」 ──
// 没有 待触发狭间 / 已经在 进行中狭间 → 原样返回(避免重复触发)
export function 踏入命途狭间(world: 世界状态): 世界状态 {
  if (!world.待触发狭间) return world;
  if (world.进行中狭间) return world;
  return { ...world, 进行中狭间: world.待触发狭间, 待触发狭间: undefined };
}

// ── UI 用:玩家拒绝邀请,清掉 待触发狭间(命途进度保持满,等待下次邀请) ──
export function 拒绝命途狭间(world: 世界状态): 世界状态 {
  if (!world.待触发狭间) return world;
  return { ...world, 待触发狭间: undefined };
}

// ── 命途狭间：升阶 / 星神授力 / 应用狭间结果 ──
// 三个 TS 函数 API,不触发 LLM 请求,只在命途狭间事件结束后被前端解析层调用。

/**
 * 自然升阶:把命途真正推进一阶,清空 待升阶 与当前阶段进度。
 *
 * 守卫:
 * - 阶段 < 3 → 升到 阶段+1
 * - 阶段 = 3 (伪令使) → 拒绝。stage 3→4 永远不能通过自然修行/狭间触达,
 *   必须走「星神授力」剧情通道:在狭间内出现星神身影,星神投下目光后才可跨入令使
 * - 阶段 = 4 → 拒绝(已是顶点)
 *
 * 注意:不在此处检查 `待升阶` 标志。该标志是「开启狭间」的门槛,
 * 在 sendWorkflow 进入狭间时已经验证过;狭间出题 → 回答 → 升阶这两个回合中间,
 * 变量模型可能把 待升阶 误清成 false(它没有狭间语义),所以
 * 应用狭间结果('升阶') 不能再依赖这个字段。世界.进行中狭间 才是真正的状态机门。
 *
 * 通常由「命途狭间·评判=升阶」结果触发。
 */
export function 升阶(
  traveler: 角色数据结构,
  pathId: 命途ID,
): { traveler: 角色数据结构; ok: boolean; reason?: string } {
  const paths = traveler.命途列表 ?? [];
  const idx = findPathIndex(paths, pathId);
  if (idx < 0) return { traveler, ok: false, reason: '尚未踏上此命途' };

  const prog = paths[idx];
  if (prog.阶段 >= 3) {
    return { traveler, ok: false, reason: '伪令使是自然修行的天花板,跨入令使须星神亲临授力' };
  }

  const nextStage = (prog.阶段 + 1) as 命途阶段;
  const next: 命途进度 = {
    ...prog,
    阶段: nextStage,
    进度: 0,
    待升阶: false,
    今日累计: 0,
    今日日期: prog.今日日期 ?? '',
  };
  const nextPaths = [...paths];
  nextPaths[idx] = next;
  return { traveler: { ...traveler, 命途列表: nextPaths }, ok: true };
}

/**
 * 星神授力:把命途直接拔高到「令使」(stage 4)。
 * 仅由特殊剧情(星神亲临降下旨意)触发,代码层不做条件检测——调用方负责确保剧情合理。
 * 表现形式应是:狭间内出现星神的巨大身影/轮廓,星神投下目光确认。
 * 注:即便当前命途未达 伪令使,也可一步登顶——这是星神特许,不是修行结果。
 */
export function 星神授力(
  traveler: 角色数据结构,
  pathId: 命途ID,
): { traveler: 角色数据结构; ok: boolean; reason?: string } {
  const paths = traveler.命途列表 ?? [];
  const idx = findPathIndex(paths, pathId);
  if (idx < 0) return { traveler, ok: false, reason: '旅人尚未踏上此命途,星神之力无所附' };

  const prog = paths[idx];
  if (prog.阶段 === 4) return { traveler, ok: false, reason: '已是令使,无可再授' };

  const next: 命途进度 = {
    ...prog,
    阶段: 4,
    进度: 0,
    待升阶: false,
    今日累计: 0,
  };
  const nextPaths = [...paths];
  nextPaths[idx] = next;
  return { traveler: { ...traveler, 命途列表: nextPaths }, ok: true };
}

/**
 * 应用狭间结果:玩家完成命途狭间问答后,AI 给出的评判会走这里落地。
 * 当前版本的狭间只承认一种结果:升阶。
 */
export type 狭间评判 = '升阶';

export function 应用狭间结果(
  traveler: 角色数据结构,
  pathId: 命途ID,
  judgement: 狭间评判,
): { traveler: 角色数据结构; ok: boolean; reason?: string } {
  const prog = (traveler.命途列表 ?? []).find((p) => p.id === pathId);
  if (prog?.阶段 === 3) return 星神授力(traveler, pathId);
  return 升阶(traveler, pathId);
}
