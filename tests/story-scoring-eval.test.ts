// 剧情对齐评估集（常驻验收）：从 bundled canon 读真实分段，三类正文的不变量必须成立——
// 中性正文不推进、收束正文归档到下一段、跳段正文对齐到下一段。
// 与分词器无关：先在旧语义下全绿（基线），切分词器 + 重调阈值后必须保持全绿。
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  归一化剧情编织系列,
  归一化剧情编织系统,
  type 剧情编织分段,
  type 剧情编织系列,
  type 剧情编织系统,
} from '@/models/storyWeaving';
import { autoAlignCanonStoryProgress, 剧情阻断词 } from '@/services/storyProgressService';
import { 标点切分正则 } from '@/utils/chineseSegments';

const CANON_DIR = path.join(process.cwd(), 'public', 'data', 'story-weaving-canon');

// 阻断词与标点切分都直接引用评分器的实现：这个评估集的价值就在于发现评分器的漂移，
// 自己抄一份副本，先漂移的只会是副本。
function cleanFragments(text: string): string[] {
  return text.split(标点切分正则).map((item) => item.trim()).filter(
    (item) => item.length >= 4 && !剧情阻断词.some((blocker) => item.includes(blocker)),
  );
}

function entityNames(segment: 剧情编织分段): string[] {
  return Array.from(new Set(
    [...segment.登场角色, ...segment.涉及地点, ...segment.涉及派系].map((name) => name.trim()).filter((name) => name.length >= 2),
  ));
}

interface EvalPair {
  label: string;
  system: 剧情编织系统;
  current: 剧情编织分段;
  next: 剧情编织分段;
  收束正文: string;
  跳段正文: string;
  segmentText: string;
}

function buildPairs(): EvalPair[] {
  const pairs: EvalPair[] = [];
  const files = readdirSync(CANON_DIR).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    if (pairs.length >= 6) break;
    const raw = JSON.parse(readFileSync(path.join(CANON_DIR, file), 'utf-8')) as { id: string; 分段列表: 剧情编织分段[] };
    const series = 归一化剧情编织系列(raw);
    const eligible = series.分段列表
      .filter((segment) => segment.处理状态 === '已完成' && segment.启用注入)
      .sort((a, b) => a.组号 - b.组号);
    for (let index = 0; index + 1 < eligible.length && pairs.length < 6; index += 1) {
      const current = eligible[index];
      const next = eligible[index + 1];
      const cleanEnd = current.本段结束状态.find((state) => state.trim() && !剧情阻断词.some((blocker) => state.includes(blocker)));
      if (!cleanEnd) continue;
      const nextEntities = entityNames(next).filter((name) => !entityNames(current).includes(name));
      if (nextEntities.length < 2 || !next.标题.trim()) continue;
      const nextSummary = cleanFragments(next.本段概括).slice(0, 3);
      if (nextSummary.length < 1) continue;
      // 整句结束状态：正文整句引用，分词后的每个词都命中，不依赖分词器怎么切某个专名。
      const nextEnding = next.本段结束状态.find((state) => state.trim() && !剧情阻断词.some((blocker) => state.includes(blocker)));
      if (!nextEnding) continue;
      const staged: 剧情编织系列 = {
        ...series,
        当前分段组号: current.组号,
        分段列表: series.分段列表.map((segment) => ({
          ...segment,
          运行状态: segment.组号 < current.组号 ? '已经历' as const : segment.组号 === current.组号 ? '当前' as const : '未开始' as const,
        })),
      };
      const system = 归一化剧情编织系统({ 当前系列ID: staged.id, 系列列表: [staged] });
      pairs.push({
        label: `${series.id}#${current.组号}→${next.组号}`,
        system,
        current,
        next,
        收束正文: `${cleanEnd.trim()}隐患解决，收尾完成。`,
        跳段正文: `${next.标题.trim()}，${nextEntities.slice(0, 5).join('，')}，${nextSummary.join('，')}，${nextEnding.trim()}`,
        segmentText: [current.标题, next.标题, ...entityNames(current), ...entityNames(next), current.本段概括, next.本段概括, ...current.本段结束状态, ...next.本段结束状态].join('\n'),
      });
    }
  }
  return pairs;
}

// 中性候选句：固定池，逐对挑选与分段文本零二元重叠的一句（新旧语义下都不应命中）。
const NEUTRAL_POOL = [
  '深夜走廊灯光柔和，清洁车缓缓驶过，窗外云海平静，众人各自休息。',
  '午后阳光洒进休息室，咖啡香气弥漫，有人翻书，有人打盹。',
  '雨点敲打着舷窗，广播里放着轻音乐，走廊空无一人。',
  '清晨演习铃声响过，随后恢复安静，早餐香气从食堂飘来。',
];

function pickNeutral(segmentText: string): string | undefined {
  return NEUTRAL_POOL.find((sentence) => {
    const compact = sentence.replace(标点切分正则, '');
    for (let index = 0; index + 1 < compact.length; index += 1) {
      if (segmentText.includes(compact.slice(index, index + 2))) return false;
    }
    return true;
  });
}

const pairs = buildPairs();

describe('剧情对齐评估集', () => {
  it('采样充足（非空洞评估）', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(4);
  });

  it.each(pairs.map((pair) => [pair.label, pair] as [string, EvalPair]))('弱证据正文不推进：%s', (_label, pair) => {
    const name = entityNames(pair.current)[0] ?? '路人';
    const result = autoAlignCanonStoryProgress({
      storyWeaving: pair.system, turnCount: 6, body: `${name}继续前行，众人跟上。`, userInput: '继续',
    });
    expect(result.progressed).toBe(false);
  });

  it.each(pairs.map((pair) => [pair.label, pair] as [string, EvalPair]))('中性正文不推进：%s', (_label, pair) => {
    const neutral = pickNeutral(pair.segmentText);
    expect(neutral).toBeDefined();
    if (!neutral) return;
    const result = autoAlignCanonStoryProgress({ storyWeaving: pair.system, turnCount: 6, body: neutral, userInput: '继续' });
    expect(result.progressed).toBe(false);
  });

  it.each(pairs.map((pair) => [pair.label, pair] as [string, EvalPair]))('收束正文归档到下一段：%s', (_label, pair) => {
    const result = autoAlignCanonStoryProgress({ storyWeaving: pair.system, turnCount: 6, body: pair.收束正文, userInput: '继续' });
    expect(result.progressed).toBe(true);
  });

  it.each(pairs.map((pair) => [pair.label, pair] as [string, EvalPair]))('跳段正文对齐到下一段：%s', (_label, pair) => {
    const result = autoAlignCanonStoryProgress({ storyWeaving: pair.system, turnCount: 6, body: pair.跳段正文, userInput: '继续' });
    expect(result.progressed).toBe(true);
  });
});
