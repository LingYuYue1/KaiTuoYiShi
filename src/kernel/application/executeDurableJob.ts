import type { ExecutionFrame } from '@/src/kernel/contract';
import type { InternalJobEnvelope } from '@/src/kernel/contract/commands';
import { claimJob, retryJob, startJob, succeedJob, type DurableJob } from '@/src/kernel/domain/jobs/durableJob';
import type { SessionRepository } from '@/src/kernel/ports';
import type { Clock } from '@/src/kernel/ports/Clock';
import type { ExecutionContextProvider } from '@/src/kernel/ports/ExecutionContextProvider';
import type { AlbumAuthoring } from '@/src/kernel/ports/AlbumAuthoring';
import type { AlbumImageGenerator } from '@/src/kernel/ports/AlbumImageGenerator';
import type { IdGenerator } from '@/src/kernel/ports/IdGenerator';
import { executeSessionCommand, loadCommandBase, commitCommand } from './executeSessionCommand';
import { createTurnExecutionState, storyFromTurnExecutionState } from './turn/turnExecutionState';
import { executeNarrativeImageJob } from './executeNarrativeImageJob';
import { runNewsGenerationStep } from '@/src/kernel/workflows/newsWorkflow';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { upsertRecallEntry } from '@/src/kernel/workflows/memoryUtils';

const JOB_LEASE_MS = 5 * 60_000;

export type DurableJobDependencies = Readonly<{
  sessions: SessionRepository;
  context: ExecutionContextProvider;
  clock: Clock;
  albumAuthoring: AlbumAuthoring;
  albumImages: AlbumImageGenerator;
  ids: IdGenerator;
  signal: AbortSignal;
}>;

export async function* executeJobLifecycleCommand(
  envelope: InternalJobEnvelope & {
    readonly command: Exclude<InternalJobEnvelope['command'], { type: 'job.execute' }>;
  },
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  const command = envelope.command;
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const story = base.state.story;
    const records = story.jobs.records.slice();
    if (command.type === 'job.recover') {
      const recovered = records.map((job) => recoverJob(job, command.runnerId, command.recoveredAt));
      if (recovered.every((job, index) => job === records[index])) return rejected('No orphaned durable jobs');
      return nextStory(story, recovered);
    }
    if (command.type === 'job.claim-next') {
      const index = records.findIndex((job) => isAvailable(job, command.claimedAt));
      if (index < 0) return rejected('No durable job is available');
      records[index] = claimJob(records[index], command.runnerId, command.claimedAt, JOB_LEASE_MS);
      return nextStory(story, records);
    }
    const index = records.findIndex((job) => job.id === command.jobId);
    if (index < 0) return rejected('Durable job not found');
    try {
      records[index] = startJob(records[index], command.runnerId, command.startedAt);
    } catch (error) {
      return rejected(errorMessage(error));
    }
    return nextStory(story, records);
  });
}

export async function* executeDurableJob(
  envelope: InternalJobEnvelope & { readonly command: Extract<InternalJobEnvelope['command'], { type: 'job.execute' }> },
  dependencies: DurableJobDependencies,
): AsyncIterable<ExecutionFrame> {
  const base = await loadCommandBase(envelope, dependencies.sessions);
  if (base.type === 'terminal') {
    yield base.frame;
    return;
  }
  const job = base.snapshot.state.story.jobs.records.find((candidate) => candidate.id === envelope.command.jobId);
  if (!job || job.state !== 'running' || job.runnerId !== envelope.command.runnerId) {
    yield rejection(envelope, 'Durable job is not running under this runner');
    return;
  }
  const now = dependencies.clock.now();
  try {
    const overlay = await dependencies.context.captureDeviceOverlay();
    const state = createTurnExecutionState(base.snapshot.state.story, overlay);
    await performJob(job, state, dependencies);
    const story = storyFromTurnExecutionState(state, base.snapshot.state.story);
    const completed = succeedJob(job, String(envelope.commandId), dependencies.clock.now());
    yield await commitCommand(envelope, dependencies.sessions, { story: replaceJob(story, completed) });
  } catch (error) {
    const failed = retryJob(job, errorMessage(error), now + retryDelay(job.attempt));
    yield await commitCommand(envelope, dependencies.sessions, {
      story: replaceJob(base.snapshot.state.story, failed),
    });
  }
}

async function performJob(
  job: Extract<DurableJob, { state: 'running' }>,
  state: ReturnType<typeof createTurnExecutionState>,
  dependencies: DurableJobDependencies,
): Promise<void> {
  const payload = job.payload;
  if (payload.kind === 'narrative-image.generate') {
    await executeNarrativeImageJob(state, payload.messageId, {
      authoring: dependencies.albumAuthoring,
      generator: dependencies.albumImages,
      ids: dependencies.ids,
      signal: dependencies.signal,
    });
    return;
  }
  const assistant = state.chatHistory.find((message) => message.id === payload.messageId && message.role === 'assistant');
  if (!assistant) throw new Error(`Durable job target message not found: ${payload.messageId}`);
  const body = assistant.parsedResponse?.body?.trim() || assistant.content.trim();
  if (payload.kind === 'news.generate') {
    const result = await runNewsGenerationStep({ gameSettings: state.gameSettings, state, mainBody: body, userInput: payload.playerText, signal: dependencies.signal });
    if (!result) throw new Error('News generation policy disabled the queued job');
    return;
  }
  if (payload.kind === 'yiting.archive') {
    const parsed = assistant.parsedResponse;
    const settings = state.gameSettings.记忆系统;
    const result = await buildYitingArchiveEntry({
      turn: Number(assistant.gameTime) || state.turnCount,
      userInput: payload.playerText,
      body,
      memory: parsed?.memory,
      worldEvents: parsed?.worldEvents,
      actionOptions: parsed?.actionOptions,
      gameTime: state.世界.当前日期,
      gameClock: state.世界.当前时间,
      location: state.世界.当前地点,
    }, settings, dependencies.signal, settings.忆庭精炼API.retryCount ?? 2, state.gameSettings.promptModules);
    state.忆庭 = upsertRecallEntry(state.忆庭, result.entry);
    return;
  }
}

function isAvailable(job: DurableJob, now: number): boolean {
  return (job.state === 'queued' || job.state === 'retry') && job.availableAt <= now;
}

function recoverJob(job: DurableJob, runnerId: string, now: number): DurableJob {
  if (job.state === 'claimed' && job.claimedBy !== runnerId && job.leaseExpiresAt <= now) {
    return { ...job, state: 'retry', availableAt: now, error: 'Recovered abandoned claim' };
  }
  if (job.state === 'running' && job.runnerId !== runnerId && job.leaseExpiresAt <= now) {
    return { ...job, state: 'retry', availableAt: now, error: 'Recovered interrupted execution' };
  }
  return job;
}

function replaceJob(story: Parameters<typeof storyFromTurnExecutionState>[1], job: DurableJob) {
  return {
    ...story,
    jobs: { records: story.jobs.records.map((candidate) => candidate.id === job.id ? job : candidate) },
  };
}

function nextStory(story: Parameters<typeof replaceJob>[0], records: readonly DurableJob[]) {
  return { type: 'next' as const, state: { story: { ...story, jobs: { records } } } };
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}

function rejection(envelope: InternalJobEnvelope, message: string): ExecutionFrame {
  return { type: 'rejected', commandId: envelope.commandId, error: { code: 'no_changes', message } };
}

function retryDelay(attempt: number): number {
  return Math.min(60_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
