import type { 游戏设置 } from '@/models/settings';
import type { Revision, SessionId } from '@/src/kernel/contract';
import type { DurableJob, JobPayload } from '@/src/kernel/domain/jobs/durableJob';
import type { StoryState } from '@/src/kernel/domain/session/storyState';

export function planOptionalTurnJobs(input: Readonly<{
  story: StoryState;
  settings: 游戏设置;
  sessionId: SessionId;
  sourceRevision: Revision;
  commandId: string;
  playerText: string;
  createdAt: number;
  openingNewsAlreadyGenerated: boolean;
}>): StoryState {
  const assistant = [...input.story.conversation.history].reverse().find((message) => message.role === 'assistant');
  if (!assistant) return input.story;
  const payloads: JobPayload[] = [];
  const news = input.settings.新闻系统;
  const newsInterval = Math.max(5, Math.min(10, Math.trunc(news.generateIntervalTurns ?? 5) || 5));
  if (
    news.enabled &&
    news.autoGenerate &&
    !input.openingNewsAlreadyGenerated &&
    input.story.conversation.turnCount % newsInterval === 0
  ) {
    payloads.push({ kind: 'news.generate', messageId: assistant.id, playerText: input.playerText });
  }
  if (input.settings.记忆系统.忆庭独立精炼) {
    payloads.push({ kind: 'yiting.archive', messageId: assistant.id, playerText: input.playerText });
  }
  const narrativeImages = input.settings.文生图系统?.正文生图;
  if (narrativeImages?.enabled && narrativeImages.mode === 'auto') {
    payloads.push({ kind: 'narrative-image.generate', messageId: assistant.id });
  }
  if (payloads.length === 0) return input.story;
  const jobs: DurableJob[] = payloads.map((payload, index) => ({
    id: `job_${input.commandId}_${index}`,
    sessionId: input.sessionId,
    sourceRevision: input.sourceRevision,
    payload,
    maxAttempts: 3,
    createdAt: input.createdAt,
    state: 'queued',
    attempt: 0,
    availableAt: input.createdAt,
  }));
  return { ...input.story, jobs: { ...input.story.jobs, records: [...input.story.jobs.records, ...jobs] } };
}
