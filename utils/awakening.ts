import type { 解析后回复 } from '@/models/chat';

export type 命途狭间回合类型 = '出题' | '评判';

// 命途狭间消息识别:出题回合 awakenQuestions 非空,评判回合 awakenJudgement 非空。
// 满足其一即套狭间皮肤(暗紫红 + 赤金 + 暗光晕)以视觉上和主剧情消息区分。
export function 分类命途狭间回合(parsed: Pick<解析后回复, 'awakenQuestions' | 'awakenJudgement'>): 命途狭间回合类型 | null {
  if (parsed.awakenQuestions.trim()) return '出题';
  if (parsed.awakenJudgement.trim()) return '评判';
  return null;
}

// 评判结果分类:当前版本只承认升阶；兼容旧历史消息时保留兜底渲染。
export function 判定评判是否升阶(judgement: string): boolean {
  const j = judgement.trim();
  return j.includes('升阶') || /promote/i.test(j);
}

export interface 狭间问答条目 {
  标签: string;
  内容: string;
}

// 出题回合:把 AI 输出的 <狭间问答> 块拆出来,以紧凑的三题列表呈现。
export function 解析狭间问答(raw: string): { 命途名: string; 问题: 狭间问答条目[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: 狭间问答条目[] = [];
  let pathName = '';
  for (const line of lines) {
    const mPath = line.match(/^命途\s*[:：]\s*(.+)$/);
    if (mPath) {
      pathName = mPath[1].trim();
      continue;
    }
    const mQ = line.match(/^题\s*([123一二三])\s*[:：]\s*(.+)$/);
    if (mQ) {
      items.push({ 标签: `第 ${mQ[1]} 问`, 内容: mQ[2].trim() });
    }
  }
  return { 命途名: pathName, 问题: items };
}
