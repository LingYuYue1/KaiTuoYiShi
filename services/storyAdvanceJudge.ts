// 剧情推进 AI 语义判定（方案 C，独立开关默认关闭）：
// 用独立 AI 判断本分段是否完成与实际进度分段，比关键词匹配更准。
// 配置：剧情设置「剧情推进 AI 判定」开关 + 「推进判定 API」覆盖（留空复用剧情编织 api）。
import type { API配置项 } from '@/models/settings';
import type { 剧情编织分段 } from '@/models/storyWeaving';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';

export interface StoryAdvanceJudgement {
  /** 本分段是否已完成（AI 语义判定）。 */
  completed: boolean;
  /** 实际进度分段 id（正文已写到后段时给出，供跳段对齐）。 */
  actualSegmentId?: string;
  reason: string;
}

const JUDGE_SYSTEM_PROMPT = `
你是剧情推进判定器。
任务：根据本回合正文，判断当前剧情分段是否已经完成，以及剧情实际推进到了哪个分段。
- 只看正文已经实际写到的内容，不要依据计划、预告或玩家意图推测。
- 「分段完成」指本段的关键事件都已经发生、结束状态已经达成（可以有自然收尾，不必逐字命中预设句子）。
- 若正文已经明显写到后续分段的内容（人物、地点、事件属于后段），给出 actualSegmentId。
- 只输出 JSON，不要输出任何其他文本。
`.trim();

const JUDGE_OUTPUT_FORMAT = `
{"completed": true/false, "actualSegmentId": "分段id或null", "reason": "一句话依据"}
`.trim();

export function buildStoryAdvanceJudgeUserPrompt(input: {
  currentSegment: 剧情编织分段;
  body: string;
  playerInput: string;
}): string {
  const { currentSegment, body, playerInput } = input;
  const keyEvents = (currentSegment.关键事件 ?? []).map((e) => e.事件名).filter(Boolean);
  const endStates = (currentSegment.本段结束状态 ?? []).slice(0, 5);
  return [
    '【当前分段】',
    `标题：${currentSegment.标题 || `第 ${currentSegment.组号} 段`}`,
    keyEvents.length ? `关键事件：${keyEvents.join('、')}` : '',
    endStates.length ? `本段结束状态：${endStates.join('；')}` : '',
    '',
    '【本回合正文】',
    body.slice(0, 3000),
    '',
    '【玩家输入】',
    playerInput.slice(0, 300),
  ].filter(Boolean).join('\n');
}

export async function judgeStoryAdvance(
  config: API配置项,
  input: { currentSegment: 剧情编织分段; body: string; playerInput: string },
  signal?: AbortSignal,
): Promise<StoryAdvanceJudgement | null> {
  const systemPrompt = `${JUDGE_SYSTEM_PROMPT}\n\n${JUDGE_OUTPUT_FORMAT}`;
  const userPrompt = buildStoryAdvanceJudgeUserPrompt(input);
  try {
    const rawText = await chatCompletionNonStream(config, {
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      signal,
      maxTokens: 320,
      temperature: 0.1,
    });
    const parsed = parseJsonWithRepair<Partial<StoryAdvanceJudgement>>(rawText, 'object');
    if (typeof parsed?.completed !== 'boolean') return null;
    const actualSegmentId = typeof parsed.actualSegmentId === 'string' && parsed.actualSegmentId.trim()
      ? parsed.actualSegmentId.trim()
      : undefined;
    return {
      completed: parsed.completed,
      actualSegmentId,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 160) : '',
    };
  } catch (error) {
    console.warn('[story-advance-judge] 剧情推进判定失败，回退申报/关键词链:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}
