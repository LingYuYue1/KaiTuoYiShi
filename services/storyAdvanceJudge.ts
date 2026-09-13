// 剧情推进 AI 语义判定（独立开关默认关闭）：用独立 AI 判断本分段是否完成与实际进度分段，
// 比关键词匹配更准；失败只留诊断，不改动 autoAlignCanonStoryProgress 的确定性阈值。
import type { API配置项 } from '@/models/settings';
import type { 剧情编织分段 } from '@/models/storyWeaving';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';
import { devLogError } from '@/utils/devLog';

export interface StoryAdvanceJudgement {
  completed: boolean;
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
{"completed": true/false, "actualSegmentId": "分段id或null", "reason": "一句话依据"}
`.trim();

export function buildStoryAdvanceJudgeUserPrompt(input: {
  currentSegment: 剧情编织分段;
  body: string;
  playerInput: string;
}): string {
  const { currentSegment, body, playerInput } = input;
  const keyEvents = currentSegment.关键事件.map((event) => event.事件名).filter(Boolean);
  const endStates = currentSegment.本段结束状态.slice(0, 5);
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
  try {
    const rawText = await chatCompletionNonStream(config, {
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildStoryAdvanceJudgeUserPrompt(input) }],
      signal,
      maxTokens: 320,
      temperature: 0.1,
    });
    const parsed = parseJsonWithRepair<Partial<StoryAdvanceJudgement>>(rawText, 'object');
    if (typeof parsed.completed !== 'boolean') return null;
    return {
      completed: parsed.completed,
      actualSegmentId: typeof parsed.actualSegmentId === 'string' && parsed.actualSegmentId.trim()
        ? parsed.actualSegmentId.trim()
        : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 160) : '',
    };
  } catch (error) {
    devLogError('stage', 'story_advance_judge.failed', error);
    return null;
  }
}
