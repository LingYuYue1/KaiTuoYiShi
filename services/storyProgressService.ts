import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列, 剧情编织系统, 剧情编织历史归档 } from '@/models/storyWeaving';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织门禁快照 } from '@/services/storyWeaving';

export function getCurrentStoryChapterLabel(system: 剧情编织系统): string {
  const normalized = 归一化剧情编织系统(system);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) return '';
  const current = getCurrentSegment(series, normalized.当前进度);
  if (!current) return `${series.标题} · 未选择章节`;
  const chapter = current.章节标题?.length ? current.章节标题.join(' / ') : current.标题;
  return `${series.标题} · ${chapter}`;
}

export function autoAlignCanonStoryProgress(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  body: string;
  userInput: string;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): { system: 剧情编织系统; changed: boolean; progressed: boolean } {
  const normalized = 归一化剧情编织系统(params.storyWeaving);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) {
    return { system: normalized, changed: false, progressed: false };
  }
  const segments = [...series.分段列表]
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  const rawCurrent = getCurrentSegment(series, normalized.当前进度);
  if (rawCurrent && ['已经历', '已跳过', '已偏离', '暂停'].includes(rawCurrent.运行状态)) {
    const next = segments.find((segment) => segment.组号 > rawCurrent.组号 && segment.运行状态 === '未开始');
    if (next) {
      const nextSeries: 剧情编织系列 = {
        ...series,
        当前分段组号: next.组号,
        分段列表: series.分段列表.map((segment) =>
          segment.id === next.id
            ? { ...segment, 运行状态: '当前' as const, updatedAt: Date.now() }
            : segment,
        ),
        updatedAt: Date.now(),
      };
      const nextSystem = 归一化剧情编织系统({
        ...normalized,
        当前系列ID: series.id,
        系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
        当前进度: buildProgressAnchor({
          previous: normalized.当前进度,
          series,
          current: next,
          completedSegment: rawCurrent.运行状态 === '已经历' ? rawCurrent : undefined,
          turnCount: params.turnCount,
          reasons: [`后台发现锚点分段「${rawCurrent.标题}」已归档，自动迁移到下一分段`],
          switchNote: `归档锚点自动迁移到「${next.标题}」`,
          gateSnapshot: params.gateSnapshot,
        }),
      });
      return { system: nextSystem, changed: true, progressed: false };
    }
  }
  const current = rawCurrent;
  if (!current || current.处理状态 !== '已完成') {
    return { system: normalized, changed: false, progressed: false };
  }

  const source = `${params.userInput}\n${params.body}`;
  const candidates = segments.filter((segment) =>
    segment.组号 >= current.组号 && segment.组号 <= current.组号 + 4 && !['已跳过', '已偏离', '暂停'].includes(segment.运行状态),
  );
  const scored = candidates
    .map((segment) => ({ segment, score: scoreSegmentPresence(segment, source) }))
    .sort((a, b) => b.score.value - a.score.value || b.segment.组号 - a.segment.组号);
  const best = scored[0];
  const currentScore = scored.find((item) => item.segment.id === current.id)?.score.value ?? 0;
  const canJumpToLaterSegment = series.来源类型 === 'canon'
    || (best && best.segment.组号 === current.组号 + 1 && best.score.value >= 7);
  if (!best || best.segment.组号 <= current.组号 || best.score.value < 5 || best.score.value - currentScore < 2 || !canJumpToLaterSegment) {
    const completionScore = scoreCompletionSignals(current, source);
    if (completionScore.value < 3 || !completionScore.explicitEnding) {
      const diagnosticSystem = refreshProgressDiagnostics({
        normalized,
        series,
        current,
        turnCount: params.turnCount,
        gateSnapshot: params.gateSnapshot,
        reasons: buildNoProgressReasons({
          best,
          currentScore,
          completionScore,
          canJumpToLaterSegment,
        }),
      });
      return {
        system: diagnosticSystem,
        changed: diagnosticSystem !== normalized,
        progressed: false,
      };
    }
    const next = segments.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
    const settledSystem = settleCurrentSegment({
      normalized,
      series,
      current,
      next,
      turnCount: params.turnCount,
      reasons: completionScore.reasons.length ? completionScore.reasons : ['后台判定当前分段已达到结束状态'],
      mode: next ? 'advance' : 'complete',
      gateSnapshot: params.gateSnapshot,
    });
    return { system: settledSystem, changed: true, progressed: true };
  }

  const now = Date.now();
  const nextSeries: 剧情编织系列 = {
    ...series,
    当前分段组号: best.segment.组号,
    分段列表: series.分段列表.map((segment) => {
      if (segment.组号 < best.segment.组号 && ['当前', '未开始'].includes(segment.运行状态)) {
        return { ...segment, 运行状态: '已经历' as const, updatedAt: now };
      }
      if (segment.id === best.segment.id) {
        return { ...segment, 运行状态: '当前' as const, updatedAt: now };
      }
      if (segment.运行状态 === '当前') {
        return { ...segment, 运行状态: '未开始' as const, updatedAt: now };
      }
      return segment;
    }),
    updatedAt: now,
  };
  const nextSystem = 归一化剧情编织系统({
    ...normalized,
    当前系列ID: series.id,
    系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
    当前进度: buildProgressAnchor({
      previous: normalized.当前进度,
      series,
      current: best.segment,
      completedSegment: current,
      turnCount: params.turnCount,
      reasons: best.score.reasons,
      switchNote: `后台对齐到「${best.segment.标题}」`,
      gateSnapshot: params.gateSnapshot,
    }),
  });
  return { system: nextSystem, changed: true, progressed: true };
}

function getActiveSeries(system: 剧情编织系统): 剧情编织系列 | undefined {
  return system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表.find((item) => item.激活注入 !== false);
}

function getCurrentSegment(series: 剧情编织系列, anchor?: 剧情编织进度锚点): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => segment.id === anchor?.当前分段ID)
    ?? series.分段列表.find((segment) => segment.组号 === anchor?.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series.分段列表.find((segment) => segment.运行状态 === '当前');
}

function settleCurrentSegment(params: {
  normalized: 剧情编织系统;
  series: 剧情编织系列;
  current: 剧情编织分段;
  next?: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  mode: 'advance' | 'complete';
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const now = Date.now();
  const { normalized, series, current, next } = params;
  const nextSeries: 剧情编织系列 = {
    ...series,
    当前分段组号: next?.组号 ?? current.组号,
    分段列表: series.分段列表.map((segment) => {
      if (segment.id === current.id) {
        return { ...segment, 运行状态: '已经历' as const, updatedAt: now };
      }
      if (next && segment.id === next.id) {
        return { ...segment, 运行状态: '当前' as const, updatedAt: now };
      }
      return segment.运行状态 === '当前'
        ? { ...segment, 运行状态: '未开始' as const, updatedAt: now }
        : segment;
    }),
    updatedAt: now,
  };
  return 归一化剧情编织系统({
    ...normalized,
    当前系列ID: series.id,
    系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
    当前进度: buildProgressAnchor({
      previous: normalized.当前进度,
      series,
      current: next ?? current,
      completedSegment: current,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: next ? `当前分段已归档，后台进入「${next.标题}」` : `当前分段已归档，系列暂无下一分段`,
      completed: params.mode === 'complete',
      gateSnapshot: params.gateSnapshot,
    }),
  });
}

function refreshProgressDiagnostics(params: {
  normalized: 剧情编织系统;
  series: 剧情编织系列;
  current: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const previous = params.normalized.当前进度;
  const nextAnchor: 剧情编织进度锚点 = {
    ...buildProgressAnchor({
      previous,
      series: params.series,
      current: params.current,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: '后台判定暂不切换分段，当前分段继续作为软参考。',
      gateSnapshot: params.gateSnapshot,
    }),
    已完成摘要: previous?.已完成摘要 ?? [],
    切换说明: previous?.切换说明 ?? [],
    历史归档: previous?.历史归档 ?? [],
  };
  const sameAnchor = previous
    && previous.当前系列ID === nextAnchor.当前系列ID
    && previous.当前分段ID === nextAnchor.当前分段ID
    && previous.当前分段组号 === nextAnchor.当前分段组号
    && previous.推进状态 === nextAnchor.推进状态
    && previous.最近一次推进判定回合 === nextAnchor.最近一次推进判定回合
    && sameTextList(previous.最近判定理由, nextAnchor.最近判定理由)
    && sameTextList(previous.当前待解问题, nextAnchor.当前待解问题);
  if (sameAnchor) return params.normalized;
  return 归一化剧情编织系统({
    ...params.normalized,
    当前系列ID: params.series.id,
    当前进度: nextAnchor,
  });
}

function buildNoProgressReasons(params: {
  best?: { segment: 剧情编织分段; score: { value: number; reasons: string[] } };
  currentScore: number;
  completionScore: { value: number; explicitEnding: boolean; reasons: string[] };
  canJumpToLaterSegment: boolean;
}): string[] {
  const reasons = [
    `未推进：当前段结束判定 ${params.completionScore.value}/3，${params.completionScore.explicitEnding ? '已有明确收束证据' : '缺少明确收束证据'}`,
  ];
  if (!params.best) {
    reasons.push('未推进：没有命中可对齐的后续分段');
  } else if (params.best.segment.组号 <= 0) {
    reasons.push('未推进：候选分段无有效组号');
  } else {
    reasons.push(`未推进：最佳候选「${params.best.segment.标题}」对齐分 ${params.best.score.value}，当前段对齐分 ${params.currentScore}`);
    if (params.best.score.value < 5) reasons.push('未推进：后续分段命中分低于 5');
    if (params.best.score.value - params.currentScore < 2) reasons.push('未推进：后续分段相对当前段优势不足 2 分');
    if (!params.canJumpToLaterSegment) reasons.push('未推进：原创剧情只允许高置信推进到相邻下一段');
  }
  if (params.completionScore.reasons.length) {
    reasons.push(...params.completionScore.reasons);
  }
  return uniqueText(reasons, 8);
}

function buildProgressAnchor(params: {
  previous?: 剧情编织进度锚点;
  series: 剧情编织系列;
  current: 剧情编织分段;
  completedSegment?: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  switchNote: string;
  completed?: boolean;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织进度锚点 {
  const completedSummary = params.completedSegment
    ? params.completedSegment.本段结束状态[0]
      || params.completedSegment.本段概括
      || params.completedSegment.原文摘要
      || params.completedSegment.标题
    : '';
  const pending = [
    ...params.current.给后续参考,
    ...params.current.关键事件.flatMap((event) => event.触发条件),
  ].filter(Boolean);
  const archive = params.completedSegment
    ? buildHistoryArchiveEntry({
      previous: params.previous,
      series: params.series,
      segment: params.completedSegment,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: params.switchNote,
      status: params.completed ? '已完成' : '已经历',
    })
    : undefined;
  return {
    当前系列ID: params.series.id,
    当前分段ID: params.current.id,
    当前分段组号: params.current.组号,
    推进状态: params.completed ? '已完成' : '推进中',
    已完成摘要: uniqueText([...(params.previous?.已完成摘要 ?? []), completedSummary], 12),
    当前待解问题: uniqueText(pending, 10),
    切换说明: uniqueText([...(params.previous?.切换说明 ?? []), params.switchNote], 10),
    历史归档: uniqueArchives([...(params.previous?.历史归档 ?? []), archive].filter(Boolean) as 剧情编织历史归档[], 30),
    最近门禁结果: params.gateSnapshot?.mode ?? params.previous?.最近门禁结果,
    最近判定理由: uniqueText(params.reasons, 8),
    最近一次推进判定回合: params.turnCount,
    updatedAt: Date.now(),
  };
}

function buildHistoryArchiveEntry(params: {
  previous?: 剧情编织进度锚点;
  series: 剧情编织系列;
  segment: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  switchNote: string;
  status: 剧情编织历史归档['归档状态'];
}): 剧情编织历史归档 | undefined {
  const summary = params.segment.本段结束状态[0]
    || params.segment.本段概括
    || params.segment.原文摘要
    || params.segment.标题;
  const id = `story_archive_${params.series.id}_${params.segment.id}_${params.turnCount}`;
  if (params.previous?.历史归档?.some((item) => item.id === id || (item.分段ID === params.segment.id && item.归档回合 === params.turnCount))) {
    return undefined;
  }
  return {
    id,
    系列ID: params.series.id,
    分段ID: params.segment.id,
    分段组号: params.segment.组号,
    分段标题: params.segment.标题,
    归档回合: params.turnCount,
    归档状态: params.status,
    摘要: summary,
    切换说明: params.switchNote,
    判定理由: uniqueText(params.reasons, 8),
    createdAt: Date.now(),
  };
}

function uniqueArchives(items: 剧情编织历史归档[], limit: number): 剧情编织历史归档[] {
  const seen = new Set<string>();
  const result: 剧情编织历史归档[] = [];
  for (const item of items) {
    const key = item.id || `${item.系列ID}_${item.分段ID}_${item.分段组号}_${item.归档回合}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(-limit);
}

function uniqueText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function sameTextList(left?: string[], right?: string[]): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function scoreCompletionSignals(segment: 剧情编织分段, text: string): { value: number; explicitEnding: boolean; reasons: string[] } {
  const source = normalizeText(text);
  let value = 0;
  const reasons: string[] = [];
  const endStates = [...segment.本段结束状态, ...segment.关键事件.flatMap((event) => event.事件结果)].filter(Boolean);
  const endingHits = countHits(source, endStates);
  if (endingHits > 0) {
    value += Math.min(3, endingHits);
    reasons.push(`命中本段结束状态 ${endingHits} 项`);
  }
  const titleTerms = splitMeaningfulTerms(segment.标题);
  const titleHits = titleTerms.filter((term) => source.includes(term)).length;
  if (titleHits >= 2) {
    value += 1;
    reasons.push('正文提及当前分段核心标题词');
  }
  const resultWords = ['结束', '完成', '离开', '登上', '抵达', '击退', '解决', '告一段落', '暂时平息', '启程', '跃迁'];
  const resultHits = resultWords.filter((word) => source.includes(word)).length;
  if (resultHits > 0) {
    value += Math.min(2, resultHits);
    reasons.push('正文出现阶段收束信号');
  }
  const explicitEnding = endingHits > 0 || (titleHits >= 2 && resultHits >= 2);
  if (!explicitEnding) reasons.push('缺少明确结束状态或标题+收束词组合，暂不自动归档');
  return { value, explicitEnding, reasons };
}

function scoreSegmentPresence(segment: 剧情编织分段, text: string): { value: number; reasons: string[] } {
  const source = normalizeText(text);
  let value = 0;
  const reasons: string[] = [];

  const titleTerms = splitMeaningfulTerms(segment.标题);
  const titleHits = titleTerms.filter((term) => source.includes(term)).length;
  if (titleHits >= 2) {
    value += 3;
    reasons.push(`命中标题词 ${titleHits} 项`);
  }

  const summaryTerms = splitMeaningfulTerms([
    segment.原文摘要,
    segment.本段概括,
    ...segment.关键事件.map((event) => event.事件说明),
  ].join(' ')).slice(0, 16);
  const summaryHits = summaryTerms.filter((term) => source.includes(term)).length;
  if (summaryHits >= 2) {
    value += Math.min(5, summaryHits);
    reasons.push(`命中概括关键词 ${summaryHits} 项`);
  }

  const entityTerms = [...segment.登场角色, ...segment.涉及地点, ...segment.涉及派系]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && source.includes(item));
  if (entityTerms.length >= 2) {
    value += Math.min(3, entityTerms.length);
    reasons.push(`命中人物/地点 ${entityTerms.slice(0, 4).join('、')}`);
  }

  const eventTerms = splitMeaningfulTerms([
    ...segment.本段结束状态,
    ...segment.给后续参考,
    ...segment.关键事件.flatMap((event) => event.事件结果),
  ].join(' '));
  const eventHits = eventTerms.filter((term) => source.includes(term)).length;
  if (eventHits >= 2) {
    value += Math.min(3, eventHits);
    reasons.push(`命中事件结果 ${eventHits} 项`);
  }

  return { value, reasons };
}

function countHits(source: string, candidates: string[]): number {
  let count = 0;
  for (const candidate of candidates.slice(0, 12)) {
    const terms = splitMeaningfulTerms(candidate);
    if (terms.length >= 2 && terms.filter((term) => source.includes(term)).length >= 2) {
      count += 1;
    }
  }
  return count;
}

function splitMeaningfulTerms(text: string): string[] {
  return Array.from(new Set(
    normalizeText(text)
      .split(/[\s，。；、：:,.!?！？「」『』（）()[\]【】\-—]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !STOP_WORDS.has(item)),
  )).slice(0, 10);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set(['当前', '本段', '剧情', '玩家', '角色', '已经', '一个', '以及', '进行', '开始', '继续']);
