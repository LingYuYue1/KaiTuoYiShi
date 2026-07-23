import type { 聊天消息 } from '@/models/chat';
import { MEMORY_LAYER_COMPRESSION_THRESHOLD, 创建空记忆系统, type 记忆系统 } from '@/models/memory';
import type { MemoryCompressionSource } from '@/services/memoryCompression';

/** A completed story turn used by batch memory rebuilding. */
export interface MemoryRebuildTurn {
  turn: number;
  userId: string;
  assistantId: string;
  userInput: string;
  body: string;
  sourceMessageIds: string[];
}

export interface MemoryRebuildRange {
  start?: number;
  end?: number;
}

export interface MemoryRebuildPrompts {
  short?: string;
  middle?: string;
  long?: string;
}

/**
 * The service deliberately accepts a narrow settings shape. The caller can pass
 * the real settings object without making this recovery module depend on UI or
 * the settings model's migration details.
 */
export interface MemoryRebuildSettings {
  apiEnabled?: boolean;
  prompts?: MemoryRebuildPrompts;
  compressionThreshold?: number;
}

export interface MemoryRebuildSummarySuccess {
  ok: true;
  summary: string;
}

export interface MemoryRebuildSummaryFailure {
  ok: false;
  fallback?: string;
  code?: string;
  message?: string;
}

export type MemoryRebuildSummaryResult =
  | MemoryRebuildSummarySuccess
  | MemoryRebuildSummaryFailure
  // Kept for compatibility with the current memoryCompression result while
  // that service is migrated to the discriminated result above.
  | {
    summary: string;
    usedFallback?: boolean;
    usedLocal?: boolean;
    code?: string;
    message?: string;
    failureCode?: string;
    failureMessage?: string;
  };

export interface MemoryRebuildSummarizerContext {
  settings: MemoryRebuildSettings;
  signal?: AbortSignal;
}

export type MemoryRebuildSummarizer = (
  source: MemoryCompressionSource,
  context: MemoryRebuildSummarizerContext,
) => Promise<MemoryRebuildSummaryResult>;

export type MemoryRebuildTaskStatus =
  | 'idle'
  | 'running'
  | 'paused_failed'
  | 'blocked'
  | 'ready'
  | 'committed'
  | 'cancelled';

export interface MemoryRebuildProgress {
  totalBatches: number;
  completedBatches: number;
  currentBatch: number | null;
  processedTurns: number;
  totalTurns: number;
}

export interface MemoryRebuildFailedBatch {
  batchIndex: number;
  kind: MemoryCompressionSource['kind'];
  sourceTurns: { start: number; end: number };
  /** Exact materials sent to the failed summarization request. */
  items: string[];
  fallbackSummary: string;
  code: string;
  message: string;
  attemptCount: number;
}

export interface MemoryRebuildTask {
  id: string;
  status: MemoryRebuildTaskStatus;
  range: { start: number; end: number };
  batchSize: number;
  turns: MemoryRebuildTurn[];
  batches: MemoryRebuildTurn[][];
  nextBatchIndex: number;
  staging: 记忆系统;
  /** Internal provenance retained across batches; not persisted as gameplay memory. */
  stagingItems: {
    short: StagingItem[];
    middle: StagingItem[];
    long: StagingItem[];
  };
  failedBatch?: MemoryRebuildFailedBatch;
  blockedReason?: string;
  warnings: string[];
  progress: MemoryRebuildProgress;
}

export interface CreateMemoryRebuildTaskOptions {
  chatHistory: readonly 聊天消息[];
  batchSize: number;
  range?: MemoryRebuildRange;
  settings?: MemoryRebuildSettings;
  id?: string;
}

export interface RunMemoryRebuildTaskOptions {
  summarizer: MemoryRebuildSummarizer;
  settings?: MemoryRebuildSettings;
  signal?: AbortSignal;
  onProgress?: (progress: MemoryRebuildProgress) => void;
}

export interface ExtractMemoryRebuildTurnsResult {
  turns: MemoryRebuildTurn[];
  warnings: string[];
}

const DEFAULT_PROMPTS: Required<MemoryRebuildPrompts> = {
  short: '请将这些回合整理为短期记忆，保留事实、事件、关系变化、承诺、冲突和未完事项。',
  middle: '请将这些短期记忆整理为中期记忆，保留跨回合仍然有效的事实、关系和未完事项。',
  long: '请将这些中期记忆整理为长期记忆，只保留稳定、可复用且会影响后续剧情的事实。',
};

function isApiEnabled(settings: MemoryRebuildSettings | undefined): boolean {
  if (!settings) return true;
  if (settings.apiEnabled === false) return false;
  // The Chinese key is used by the product settings model. Keep this lookup
  // string-based so this service remains independent of that model's type.
  if ((settings as Record<string, unknown>)['启用中短长期API总结'] === false) return false;
  return true;
}

function getPrompts(settings: MemoryRebuildSettings): Required<MemoryRebuildPrompts> {
  const configured = settings.prompts ?? {};
  const raw = settings as Record<string, unknown>;
  return {
    short: String(configured.short ?? raw['即时转短期提示词'] ?? DEFAULT_PROMPTS.short),
    middle: String(configured.middle ?? raw['短期转中期提示词'] ?? DEFAULT_PROMPTS.middle),
    long: String(configured.long ?? raw['中期转长期提示词'] ?? raw['短期转长期提示词'] ?? DEFAULT_PROMPTS.long),
  };
}

function parseTurn(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^\d+$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    || (error instanceof Error && /aborted|abort/i.test(error.message));
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '未知错误');
  return raw
    .replace(/bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key\s*[:=]\s*[^,;\s]+/gi, 'apiKey=[redacted]')
    .slice(0, 500);
}

function uniqueMessageIds(history: readonly 聊天消息[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const message of history) {
    if (seen.has(message.id)) duplicates.push(message.id);
    seen.add(message.id);
  }
  return duplicates;
}

/**
 * Pair user messages with the assistant response for the same gameTime. A
 * reroll that leaves multiple assistant messages keeps the newest response.
 */
export function extractMemoryRebuildTurns(
  chatHistory: readonly 聊天消息[],
): ExtractMemoryRebuildTurnsResult {
  const warnings: string[] = [];
  const duplicateIds = uniqueMessageIds(chatHistory);
  if (duplicateIds.length) {
    warnings.push(`发现重复消息 ID：${Array.from(new Set(duplicateIds)).slice(0, 8).join('、')}`);
  }

  const users: Array<{ message: 聊天消息; index: number; turn: number | null }> = [];
  const assistants: Array<{ message: 聊天消息; index: number; turn: number | null }> = [];
  let fallbackTurn = 0;
  for (let index = 0; index < chatHistory.length; index += 1) {
    const message = chatHistory[index];
    if (message.role === 'user') {
      const parsedTurn = parseTurn(message.gameTime);
      if (parsedTurn === null) {
        fallbackTurn += 1;
        warnings.push(`用户消息 ${message.id} 缺少数字 gameTime，使用顺序回合 ${fallbackTurn}。`);
      } else {
        fallbackTurn = Math.max(fallbackTurn, parsedTurn);
      }
      users.push({ message, index, turn: parsedTurn ?? fallbackTurn });
    } else if (message.role === 'assistant') {
      const parsedTurn = parseTurn(message.gameTime);
      if (parsedTurn === null) warnings.push(`AI 消息 ${message.id} 缺少数字 gameTime，按相邻用户回合配对。`);
      assistants.push({ message, index, turn: parsedTurn });
    }
  }

  const usedUsers = new Set<string>();
  const pairs = new Map<number, MemoryRebuildTurn>();
  for (const assistant of assistants) {
    // A reroll can leave two assistant messages for one gameTime. Reuse the
    // already paired user for that exact turn so the newest assistant replaces
    // the old one instead of being silently dropped.
    const existingPair = assistant.turn === null ? undefined : pairs.get(assistant.turn);
    const candidate = existingPair
      ? users.find((user) => user.message.id === existingPair.userId)
      : users
        .filter((user) => !usedUsers.has(user.message.id) && user.index < assistant.index)
        .filter((user) => assistant.turn === null || user.turn === assistant.turn)
        .at(-1);
    if (!candidate) {
      warnings.push(`AI 消息 ${assistant.message.id} 没有可配对的用户输入，已跳过。`);
      continue;
    }
    usedUsers.add(candidate.message.id);
    const turn = assistant.turn ?? candidate.turn;
    if (!turn || !Number.isInteger(turn) || turn < 1) {
      warnings.push(`AI 消息 ${assistant.message.id} 无法确定回合号，已跳过。`);
      continue;
    }
    const parsed = assistant.message.parsedResponse?.body?.trim() || assistant.message.content?.trim() || '';
    const userInput = candidate.message.content?.trim() || '';
    if (!parsed) {
      warnings.push(`第 ${turn} 回合没有可用 AI 正文，已跳过。`);
      continue;
    }
    if (!userInput) warnings.push(`第 ${turn} 回合玩家输入为空，仍保留 AI 正文。`);
    if (pairs.has(turn)) warnings.push(`第 ${turn} 回合存在多个 AI 回复，采用最后一条。`);
    pairs.set(turn, {
      turn,
      userId: candidate.message.id,
      assistantId: assistant.message.id,
      userInput,
      body: parsed,
      sourceMessageIds: [candidate.message.id, assistant.message.id],
    });
  }

  for (const user of users) {
    if (!usedUsers.has(user.message.id)) warnings.push(`第 ${user.turn ?? '?'} 回合没有落地 AI 正文，未纳入重建。`);
  }

  return { turns: Array.from(pairs.values()).sort((left, right) => left.turn - right.turn), warnings };
}

function cloneMemory(memory: 记忆系统): 记忆系统 {
  return {
    ...memory,
    即时记忆: [...(memory.即时记忆 ?? [])],
    短期记忆: [...(memory.短期记忆 ?? [])],
    中期记忆: [...(memory.中期记忆 ?? [])],
    长期记忆: [...(memory.长期记忆 ?? [])],
  };
}

function cloneStagingItem(item: StagingItem): StagingItem {
  return { ...item };
}

interface StagingItem {
  text: string;
  start: number;
  end: number;
}

function sourceTurns(items: readonly StagingItem[], fallbackTurn: number): { start: number; end: number } {
  if (!items.length) return { start: fallbackTurn, end: fallbackTurn };
  return {
    start: Math.min(...items.map((item) => item.start)),
    end: Math.max(...items.map((item) => item.end)),
  };
}

function formatTurn(turn: MemoryRebuildTurn): string {
  return [
    `【第 ${turn.turn} 回合】`,
    `玩家输入：${turn.userInput || '（空）'}`,
    `正文：${turn.body}`,
  ].join('\n');
}

function readSummaryResult(result: MemoryRebuildSummaryResult):
  | { ok: true; summary: string }
  | { ok: false; fallback: string; code: string; message: string } {
  if ('ok' in result) {
    if (result.ok && result.summary.trim()) return { ok: true, summary: result.summary.trim() };
    if (!result.ok) {
      return {
        ok: false,
        fallback: result.fallback?.trim() ?? '',
        code: result.code ?? 'request_failed',
        message: result.message ?? '记忆总结失败',
      };
    }
  }
  const legacy = result as {
    summary?: string;
    usedFallback?: boolean;
    usedLocal?: boolean;
    code?: string;
    message?: string;
    failureCode?: string;
    failureMessage?: string;
  };
  const summary = String(legacy.summary ?? '').trim();
  if (legacy.usedFallback) {
    return {
      ok: false,
      fallback: summary,
      code: legacy.failureCode ?? legacy.code ?? 'request_failed',
      message: legacy.failureMessage ?? legacy.message ?? '记忆总结使用了本地 fallback',
    };
  }
  if (summary) return { ok: true, summary };
  return { ok: false, fallback: '', code: 'empty_output', message: '记忆总结返回空内容' };
}

function normalizeSettings(settings?: MemoryRebuildSettings): MemoryRebuildSettings {
  return settings ?? {};
}

function getThreshold(settings: MemoryRebuildSettings): number {
  const record = settings as Record<string, unknown>;
  const raw = settings.compressionThreshold ?? record['即时转短期阈值'] ?? MEMORY_LAYER_COMPRESSION_THRESHOLD;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : MEMORY_LAYER_COMPRESSION_THRESHOLD;
}

function makeTaskId(): string {
  return `memory_rebuild_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMemoryRebuildTask(options: CreateMemoryRebuildTaskOptions): MemoryRebuildTask {
  const extracted = extractMemoryRebuildTurns(options.chatHistory);
  const availableTurns = extracted.turns;
  const firstTurn = availableTurns[0]?.turn ?? 1;
  const lastTurn = availableTurns.at(-1)?.turn ?? firstTurn;
  const requestedStart = Number.isFinite(options.range?.start) ? Math.trunc(options.range!.start!) : firstTurn;
  const requestedEnd = Number.isFinite(options.range?.end) ? Math.trunc(options.range!.end!) : lastTurn;
  const start = Math.min(requestedStart, requestedEnd);
  const end = Math.max(requestedStart, requestedEnd);
  const turns = availableTurns.filter((turn) => turn.turn >= start && turn.turn <= end);
  const batchSize = Math.max(1, Math.min(100, Math.trunc(Number(options.batchSize) || 15)));
  const batches: MemoryRebuildTurn[][] = [];
  for (let index = 0; index < turns.length; index += batchSize) batches.push(turns.slice(index, index + batchSize));
  return {
    id: options.id ?? makeTaskId(),
    status: 'idle',
    range: { start, end },
    batchSize,
    turns,
    batches,
    nextBatchIndex: 0,
    staging: 创建空记忆系统(),
    stagingItems: { short: [], middle: [], long: [] },
    warnings: extracted.warnings,
    progress: {
      totalBatches: batches.length,
      completedBatches: 0,
      currentBatch: null,
      processedTurns: 0,
      totalTurns: turns.length,
    },
  };
}

function emitProgress(task: MemoryRebuildTask, callback?: (progress: MemoryRebuildProgress) => void): void {
  callback?.({ ...task.progress });
}

async function summarize(
  task: MemoryRebuildTask,
  items: StagingItem[],
  kind: MemoryCompressionSource['kind'],
  batchIndex: number,
  deps: RunMemoryRebuildTaskOptions,
): Promise<{ item: StagingItem } | { failed: MemoryRebuildFailedBatch } | { cancelled: true }> {
  const settings = normalizeSettings(deps.settings);
  const turn = sourceTurns(items, task.range.end).end;
  const prompts = getPrompts(settings);
  const prompt = kind === 'short' ? prompts.short : kind === 'middle' ? prompts.middle : prompts.long;
  try {
    const result = readSummaryResult(await deps.summarizer({
      kind,
      turn,
      items: items.map((item) => item.text),
      prompt,
      sourceTurns: sourceTurns(items, turn),
    }, {
      settings,
      signal: deps.signal,
    }));
    if (!result.ok) {
      return {
        failed: {
          batchIndex,
          kind,
          sourceTurns: sourceTurns(items, turn),
          items: items.map((item) => item.text),
          fallbackSummary: result.fallback,
          code: result.code,
          message: result.message,
          attemptCount: 1,
        },
      };
    }
    return { item: { text: result.summary, ...sourceTurns(items, turn) } };
  } catch (error) {
    if (isAbortError(error) || deps.signal?.aborted) return { cancelled: true };
    return {
      failed: {
        batchIndex,
        kind,
        sourceTurns: sourceTurns(items, turn),
        items: items.map((item) => item.text),
        fallbackSummary: '',
        code: 'request_failed',
        message: safeErrorMessage(error),
        attemptCount: 1,
      },
    };
  }
}

async function processBatch(
  task: MemoryRebuildTask,
  batch: MemoryRebuildTurn[],
  batchIndex: number,
  deps: RunMemoryRebuildTaskOptions,
): Promise<{
  staging: 记忆系统;
  stagingItems: MemoryRebuildTask['stagingItems'];
} | { failed: MemoryRebuildFailedBatch } | { cancelled: true }> {
  const staged = {
    immediate: [] as StagingItem[],
    short: task.stagingItems.short.map(cloneStagingItem),
    middle: task.stagingItems.middle.map(cloneStagingItem),
    long: task.stagingItems.long.map(cloneStagingItem),
  };
  const shortInput = batch.map((turn) => ({ text: formatTurn(turn), start: turn.turn, end: turn.turn }));
  const shortResult = await summarize(task, shortInput, 'short', batchIndex, deps);
  if ('cancelled' in shortResult) return shortResult;
  if ('failed' in shortResult) return shortResult;
  staged.short.push(shortResult.item);

  const threshold = getThreshold(normalizeSettings(deps.settings));
  while (staged.short.length >= threshold) {
    const input = staged.short.splice(0, threshold).map(cloneStagingItem);
    const middleResult = await summarize(task, input, 'middle', batchIndex, deps);
    if ('cancelled' in middleResult) return middleResult;
    if ('failed' in middleResult) return middleResult;
    staged.middle.push(middleResult.item);
  }
  while (staged.middle.length >= threshold) {
    const input = staged.middle.splice(0, threshold).map(cloneStagingItem);
    const longResult = await summarize(task, input, 'long', batchIndex, deps);
    if ('cancelled' in longResult) return longResult;
    if ('failed' in longResult) return longResult;
    staged.long.push(longResult.item);
  }

  return {
    staging: {
      即时记忆: staged.immediate.map((item) => item.text),
      短期记忆: staged.short.map((item) => item.text),
      中期记忆: staged.middle.map((item) => item.text),
      长期记忆: staged.long.map((item) => item.text),
    },
    stagingItems: {
      short: staged.short,
      middle: staged.middle,
      long: staged.long,
    },
  };
}

/** Run or resume a task. Only this function calls the injected summarizer. */
export async function runMemoryRebuildTask(
  task: MemoryRebuildTask,
  options: RunMemoryRebuildTaskOptions,
): Promise<MemoryRebuildTask> {
  const settings = normalizeSettings(options.settings);
  if (!isApiEnabled(settings)) {
    task.status = 'blocked';
    task.blockedReason = '中短长期 API 总结已关闭，请先开启后再进行批量重建。';
    task.progress.currentBatch = null;
    emitProgress(task, options.onProgress);
    return task;
  }
  if (task.status === 'committed' || task.status === 'cancelled' || task.status === 'ready') return task;
  task.status = 'running';
  task.blockedReason = undefined;
  task.failedBatch = undefined;
  emitProgress(task, options.onProgress);

  for (; task.nextBatchIndex < task.batches.length; task.nextBatchIndex += 1) {
    if (options.signal?.aborted) {
      task.status = 'cancelled';
      task.progress.currentBatch = null;
      emitProgress(task, options.onProgress);
      return task;
    }
    const batchIndex = task.nextBatchIndex;
    const batch = task.batches[batchIndex];
    task.progress.currentBatch = batchIndex + 1;
    emitProgress(task, options.onProgress);
    const result = await processBatch(task, batch, batchIndex, options);
    if ('cancelled' in result) {
      task.status = 'cancelled';
      task.progress.currentBatch = null;
      emitProgress(task, options.onProgress);
      return task;
    }
    if ('failed' in result) {
      task.status = 'paused_failed';
      task.failedBatch = result.failed;
      task.progress.currentBatch = batchIndex + 1;
      emitProgress(task, options.onProgress);
      return task;
    }
    task.staging = result.staging;
    task.stagingItems = result.stagingItems;
    task.progress.completedBatches += 1;
    task.progress.processedTurns += batch.length;
    task.progress.currentBatch = null;
    emitProgress(task, options.onProgress);
  }

  task.status = 'ready';
  task.progress.currentBatch = null;
  emitProgress(task, options.onProgress);
  return task;
}

export function cancelMemoryRebuildTask(task: MemoryRebuildTask): MemoryRebuildTask {
  if (task.status !== 'committed') task.status = 'cancelled';
  task.progress.currentBatch = null;
  return task;
}

/** Return a detached staging copy only after the caller has confirmed ready. */
export function commitMemoryRebuildTask(task: MemoryRebuildTask): 记忆系统 | null {
  if (task.status !== 'ready') return null;
  task.status = 'committed';
  return cloneMemory(task.staging);
}

export function getMemoryRebuildPendingBatch(task: MemoryRebuildTask): MemoryRebuildFailedBatch | undefined {
  return task.failedBatch ? { ...task.failedBatch, items: [...task.failedBatch.items] } : undefined;
}
