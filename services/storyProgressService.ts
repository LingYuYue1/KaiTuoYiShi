import type { 剧情推进建议 } from '@/models/storyProgress';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';

export function buildStoryProgressSuggestion(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  body: string;
  userInput: string;
}): 剧情推进建议 | null {
  const system = 归一化剧情编织系统(params.storyWeaving);
  const series = system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表.find((item) => item.激活注入 !== false);
  if (!series || series.激活注入 === false) return null;
  const segments = [...series.分段列表].sort((a, b) => a.组号 - b.组号);
  const current = segments.find((segment) => segment.运行状态 === '当前');
  if (!current || current.处理状态 !== '已完成') return null;
  const next = segments.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
  const score = scoreCompletionSignals(current, `${params.userInput}\n${params.body}`);
  if (score.value < 3) return null;
  return {
    id: `story_progress_${series.id}_${current.id}_${params.turnCount}`,
    系列ID: series.id,
    分段ID: current.id,
    下一分段ID: next?.id,
    系列标题: series.标题,
    分段标题: current.标题,
    下一分段标题: next?.标题,
    理由: score.reasons.join('；') || '当前正文已命中本段结束状态或关键结果。',
    置信度: score.value >= 5 ? '高' : score.value >= 4 ? '中' : '低',
    createdAt: Date.now(),
  };
}

export function getCurrentStoryChapterLabel(system: 剧情编织系统): string {
  const normalized = 归一化剧情编织系统(system);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) return '';
  const current = getCurrentSegment(series);
  if (!current) return `${series.标题} · 未选择章节`;
  const chapter = current.章节标题?.length ? current.章节标题.join(' / ') : current.标题;
  return `${series.标题} · ${chapter}`;
}

export function autoAlignCanonStoryProgress(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  body: string;
  userInput: string;
}): { system: 剧情编织系统; suggestion: 剧情推进建议 | null; changed: boolean } {
  const normalized = 归一化剧情编织系统(params.storyWeaving);
  const series = getActiveSeries(normalized);
  if (!series || series.来源类型 !== 'canon' || series.激活注入 === false) {
    return { system: normalized, suggestion: null, changed: false };
  }
  const segments = [...series.分段列表]
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  const current = getCurrentSegment(series);
  if (!current || current.处理状态 !== '已完成') {
    return { system: normalized, suggestion: null, changed: false };
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
  if (!best || best.segment.组号 <= current.组号 || best.score.value < 5 || best.score.value - currentScore < 2) {
    return { system: normalized, suggestion: null, changed: false };
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
  });
  const suggestion: 剧情推进建议 = {
    id: `story_auto_align_${series.id}_${current.id}_${best.segment.id}_${params.turnCount}`,
    系列ID: series.id,
    分段ID: current.id,
    下一分段ID: best.segment.id,
    系列标题: series.标题,
    分段标题: current.标题,
    下一分段标题: best.segment.标题,
    理由: `正文明显命中「${best.segment.标题}」：${best.score.reasons.join('；')}`,
    置信度: best.score.value >= 8 ? '高' : '中',
    createdAt: now,
  };
  return { system: nextSystem, suggestion, changed: true };
}

export function applyStoryProgressSuggestion(
  system: 剧情编织系统,
  suggestion: 剧情推进建议,
): 剧情编织系统 {
  const normalized = 归一化剧情编织系统(system);
  return 归一化剧情编织系统({
    ...normalized,
    当前系列ID: suggestion.系列ID,
    系列列表: normalized.系列列表.map((series) => {
      if (series.id !== suggestion.系列ID) return series;
      const nextSegment = suggestion.下一分段ID
        ? series.分段列表.find((segment) => segment.id === suggestion.下一分段ID)
        : undefined;
      return {
        ...series,
        当前分段组号: nextSegment?.组号 ?? series.当前分段组号,
        分段列表: series.分段列表.map((segment) => {
          if (segment.id === suggestion.分段ID) {
            return { ...segment, 运行状态: '已经历' as const, updatedAt: Date.now() };
          }
          if (nextSegment && segment.id === nextSegment.id) {
            return { ...segment, 运行状态: '当前' as const, updatedAt: Date.now() };
          }
          return segment.运行状态 === '当前'
            ? { ...segment, 运行状态: '未开始' as const, updatedAt: Date.now() }
            : segment;
        }),
        updatedAt: Date.now(),
      };
    }),
  });
}

export function markStorySegmentDeviated(
  system: 剧情编织系统,
  suggestion: 剧情推进建议,
): 剧情编织系统 {
  const normalized = 归一化剧情编织系统(system);
  return 归一化剧情编织系统({
    ...normalized,
    当前系列ID: suggestion.系列ID,
    系列列表: normalized.系列列表.map((series) => {
      if (series.id !== suggestion.系列ID) return series;
      return {
        ...series,
        分段列表: series.分段列表.map((segment) =>
          segment.id === suggestion.分段ID
            ? { ...segment, 运行状态: '已偏离' as const, updatedAt: Date.now() }
            : segment,
        ),
        updatedAt: Date.now(),
      };
    }),
  });
}

function getActiveSeries(system: 剧情编织系统): 剧情编织系列 | undefined {
  return system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表.find((item) => item.激活注入 !== false);
}

function getCurrentSegment(series: 剧情编织系列): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => segment.组号 === series.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series.分段列表.find((segment) => segment.运行状态 === '当前');
}

function scoreCompletionSignals(segment: 剧情编织分段, text: string): { value: number; reasons: string[] } {
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
  return { value, reasons };
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
