// 手机记忆双写事务：忆庭归档 + NPC 同行记忆，分侧幂等、可恢复。
//
// 设计（对齐全项目确认问题修复计划 7.2）：
// - 输入必须来自调用瞬间的最新 memory/yiting/NPC 快照，输出明确结果，不再在组件里
//   用旧 props 连续计算 + 两个独立 setter 各自写。
// - 一次提交建立稳定 operationId（来源 = 回合 + 联系人 + 摘要规范化值），双侧单独记录
//   pending/success/failed/not_due。
// - 未达主记忆压缩阈值时忆庭侧为 not_due，不得虚报"已写入忆庭"；即时记忆仍保留。
// - 跨阈值压缩时，只有确实包含本次通讯来源的 archive 才标记 分类='通讯'，不能把同批
//   主剧情记忆全部标成当前 NPC 通讯。
// - NPC 侧用 operationId 派生稳定条目 ID 幂等写入；重试只执行 failed 的一侧，
//   已 success / not_due 的一侧不重放。

import type { 记忆系统 } from '@/models/memory';
import type { 记忆系统设置, API配置项 } from '@/models/settings';
import type { 忆庭系统, 回忆条目 } from '@/models/yiting';
import type { NPC记录, NPC同行记忆条目 } from '@/models/npc';
import type { 队列任务记录 } from '@/models/queueTask';
import {
  autoCompressMemorySystemWithArchivesAsync,
  compressNpcMemoryLedger,
  合并即时与短期,
} from '@/hooks/useGame/memoryUtils';

export type PhoneDualWriteSideStatus = {
  status: 'not_due' | 'success' | 'failed' | 'skipped';
  error?: string;
};

export interface PhoneDualWriteResult {
  operationId: string;
  nextMemory: 记忆系统;
  nextYiting: 忆庭系统;
  nextNpcs: NPC记录[];
  sides: {
    yiting: PhoneDualWriteSideStatus;
    npc: PhoneDualWriteSideStatus;
  };
}

export interface PhoneMemoryDualWriteInput {
  memory: 记忆系统;
  yiting: 忆庭系统;
  npcs: NPC记录[];
  summary: string;
  contact?: { npcId?: string } | null;
  turn: number;
  settings: 记忆系统设置;
  config?: API配置项 | null;
  force?: boolean;
  /** 重试时只执行指定失败侧，另一侧标记 skipped 不重放。 */
  retrySide?: 'yiting' | 'npc';
  /** 操作来源 ID（手机消息/seed 等）：同一回合对同一联系人发送相同文本的两次真实操作不能互相吞并。 */
  operationSourceId?: string;
  /** 重试时使用原操作持久化的 operationId，保证幂等键与初次提交一致。 */
  operationIdOverride?: string;
  /** 对标参考项目：记忆发生时的结构化游戏时间（如「琥珀纪 2157.03.07 06:40」），写入 NPC 记忆与回忆条目。 */
  gameTime?: string;
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * 稳定 operationId：来源 = 回合 + 联系人 + 摘要规范化值 + 操作来源 ID。
 * 同一回合、同一联系人、相同摘要但 message/seed ID 不同的两次真实操作必须得到不同 operationId；
 * 同一次操作的重试（带相同来源 ID 或不带来源 ID 的 3 参数调用）保持稳定。
 */
export function buildPhoneMemoryOperationId(
  summary: string,
  contact: { npcId?: string } | null | undefined,
  turn: number,
  operationSourceId?: string,
): string {
  const trimmed = summary.trim();
  const contactKey = contact?.npcId ?? 'anon';
  const sourceKey = operationSourceId?.trim()
    ? `_${fnv1a(operationSourceId.trim())}`
    : '';
  return `phone_mem_${Math.max(1, Math.trunc(turn) || 1)}_${contactKey}${sourceKey}_${fnv1a(trimmed)}`;
}

/** 主记忆压缩阈值判断（与 sendWorkflow 一致）：短期/中期任一层待压缩数量 > 0 即达阈值。
 *  对标参考项目：即时层为滑动窗口（不调 AI 压缩），不参与待压缩判定。 */
function hasPendingCompression(memory: 记忆系统, settings: 记忆系统设置): boolean {
  const shortThreshold = settings.短期转中期阈值 ?? 30;
  const middleThreshold = settings.中期转长期阈值 ?? 50;
  const shortPending = Math.max(0, memory.短期记忆.length - shortThreshold + 1);
  const middlePending = Math.max(0, (memory.中期记忆 ?? []).length - middleThreshold + 1);
  return shortPending > 0 || middlePending > 0;
}

function buildFallbackConfig(): API配置项 {
  return {
    id: '',
    name: '',
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

/** 分侧执行一次手机记忆双写；双侧互不阻塞，各侧独立记录失败。 */
export async function executePhoneMemoryDualWrite(input: PhoneMemoryDualWriteInput): Promise<PhoneDualWriteResult> {
  const trimmed = input.summary.trim();
  if (!trimmed) {
    return {
      operationId: '',
      nextMemory: input.memory,
      nextYiting: input.yiting,
      nextNpcs: input.npcs,
      sides: {
        yiting: { status: 'skipped' },
        npc: { status: 'skipped' },
      },
    };
  }
  const normalizedSummary = trimmed.startsWith('【手机】') ? trimmed : `【手机】${trimmed}`;
  const operationId = input.operationIdOverride?.trim()
    ? input.operationIdOverride.trim()
    : buildPhoneMemoryOperationId(trimmed, input.contact, input.turn, input.operationSourceId);
  const config = input.config ?? buildFallbackConfig();

  const alreadyInMemory = input.memory.即时记忆.some((item) => item.includes(trimmed))
    || input.memory.短期记忆.some((item) => item.includes(trimmed))
    || (input.memory.中期记忆 ?? []).some((item) => item.includes(trimmed))
    || input.memory.长期记忆.some((item) => item.includes(trimmed));
  const force = input.force === true;

  // 忆庭侧：初次提交才允许向主记忆追加通讯内容（即时记忆保留）；
  // 只有达到压缩阈值且确实压缩时才写忆庭档案。
  // 重试（retrySide 存在）不透传新内容到主记忆——重试只补失败侧，已写入的记忆来源保持原样。
  let nextMemory: 记忆系统 = input.memory;
  let nextYiting: 忆庭系统 = input.yiting;
  let yitingSide: PhoneDualWriteSideStatus = { status: 'not_due' };
  if (input.retrySide === 'npc') {
    // 只补 NPC 侧：记忆与忆庭必须原样透传。
    yitingSide = { status: 'skipped' };
  } else if (input.retrySide === 'yiting') {
    // 只补忆庭侧：不得重复追加即时记忆；使用原操作已经写入的记忆来源完成忆庭归档。
    if (!hasPendingCompression(nextMemory, input.settings)) {
      yitingSide = { status: 'not_due' };
    } else {
      try {
        const compression = await autoCompressMemorySystemWithArchivesAsync(
          nextMemory,
          input.turn,
          input.settings,
          config,
        );
        nextMemory = compression.memory;
        if (compression.archives.length) {
          const phoneArchives = compression.archives.map((entry: 回忆条目) => {
            const containsThisCall = entry.原文?.includes(normalizedSummary) || entry.原文?.includes(trimmed);
            return containsThisCall
              ? {
                  ...entry,
                  分类: '通讯' as const,
                  通讯元数据: input.contact?.npcId ? { 联系人: input.contact.npcId } : undefined,
                }
              : entry;
          });
          nextYiting = {
            ...input.yiting,
            回忆档案: [...input.yiting.回忆档案, ...phoneArchives],
          };
        }
        yitingSide = { status: 'success' };
      } catch (err) {
        yitingSide = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      }
    }
  } else if (!force && alreadyInMemory) {
    yitingSide = { status: 'not_due' };
  } else {
    // 初次提交：向主记忆追加通讯内容后再判断压缩。
    // 对标参考项目：即时层为滑动窗口（上限=即时转短期阈值），手机摘要作为即时内容合体写入，
    // 超限时最旧条目直接移出（无短期摘要可滚入）。
    const immediateLimit = Math.max(1, Math.trunc(input.settings.即时转短期阈值 ?? 10) || 10);
    const 手机即时条目 = 合并即时与短期(normalizedSummary, '');
    const withImmediate: 记忆系统 = {
      ...input.memory,
      即时记忆: [...input.memory.即时记忆, 手机即时条目].slice(-immediateLimit),
    };
    nextMemory = withImmediate;
    if (!hasPendingCompression(withImmediate, input.settings)) {
      // 未达主记忆压缩阈值：只表示忆庭归档 not_due，不得标记"已写入忆庭"。
      yitingSide = { status: 'not_due' };
    } else {
      try {
        const compression = await autoCompressMemorySystemWithArchivesAsync(
          withImmediate,
          input.turn,
          input.settings,
          config,
        );
        nextMemory = compression.memory;
        if (compression.archives.length) {
          // 只有确实包含本次通讯来源的 archive 才标记 分类='通讯' 与当前联系人；
          // 同批被压缩的主剧情记忆保持默认，不得全部标成该 NPC 通讯。
          const phoneArchives = compression.archives.map((entry: 回忆条目) => {
            const containsThisCall = entry.原文?.includes(normalizedSummary) || entry.原文?.includes(trimmed);
            return containsThisCall
              ? {
                  ...entry,
                  分类: '通讯' as const,
                  通讯元数据: input.contact?.npcId ? { 联系人: input.contact.npcId } : undefined,
                }
              : entry;
          });
          nextYiting = {
            ...input.yiting,
            回忆档案: [...input.yiting.回忆档案, ...phoneArchives],
          };
        }
        yitingSide = { status: 'success' };
      } catch (err) {
        yitingSide = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  // NPC 侧：使用相同 operationId 幂等写入；连续两次提交基于第一次提交后的最新状态。
  let nextNpcs: NPC记录[] = input.npcs;
  let npcSide: PhoneDualWriteSideStatus = { status: 'not_due' };
  if (input.retrySide === 'yiting') {
    npcSide = { status: 'skipped' };
  } else if (!input.contact?.npcId) {
    npcSide = { status: 'not_due' };
  } else {
    const npcId = input.contact.npcId;
    const npc = nextNpcs.find((item) => item.id === npcId);
    if (!npc) {
      npcSide = { status: 'skipped' };
    } else {
      const entryId = `npc_mem_phone_${operationId}`;
      const alreadyWritten = (npc.同行记忆 ?? []).some((item) => item.id === entryId);
      if (!force && alreadyWritten) {
        npcSide = { status: 'not_due' };
      } else {
        try {
          const packagedSummary = `【通讯记录】${trimmed}`;
          const nextEntry: NPC同行记忆条目 = {
            id: entryId,
            回合: input.turn,
            摘要: packagedSummary,
            来源: '手机',
            关联NPCID: [npc.id],
            时间: input.gameTime?.trim() || undefined,
          };
          const ledgerCompression = compressNpcMemoryLedger({
            npcId: npc.id,
            entries: [...(npc.同行记忆 ?? []), nextEntry],
            summaries: npc.总结记忆 ?? [],
            threshold: input.settings.NPC记忆压缩阈值,
            prompt: input.settings.NPC记忆压缩提示词,
            turn: input.turn,
            source: '手机',
          });
          const updatedNpc: NPC记录 = {
            ...npc,
            同行记忆: ledgerCompression.memories,
            总结记忆: ledgerCompression.summaries,
            最近互动: packagedSummary,
            共同经历: [...new Set([...(npc.共同经历 ?? []), packagedSummary])].slice(-8),
            对玩家长期印象: npc.对玩家长期印象 || '与玩家保持手机联系，已形成可承接的私下互动。',
            最近回合: input.turn,
          };
          nextNpcs = nextNpcs.map((item) => (item.id === npcId ? updatedNpc : item));
          npcSide = { status: 'success' };
        } catch (err) {
          npcSide = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
        }
      }
    }
  }

  return {
    operationId,
    nextMemory,
    nextYiting,
    nextNpcs,
    sides: { yiting: yitingSide, npc: npcSide },
  };
}

export interface PhoneMemoryFailureTaskPayload {
  summary: string;
  contactId?: string;
  failedSide: 'yiting' | 'npc';
  operationId: string;
  turn: number;
}

/** 把失败记录编码为可持久化的 queueTasks 任务载体（关闭弹窗后仍可恢复）。 */
export function buildPhoneMemoryFailureTask(
  payload: PhoneMemoryFailureTaskPayload,
): 队列任务记录 {
  const sideLabel = payload.failedSide === 'yiting' ? '忆庭归档' : 'NPC 同行记忆';
  return {
    id: 'phone',
    title: '手机记忆写入',
    subtitle: sideLabel,
    turn: payload.turn,
    timestamp: Date.now(),
    status: 'failed',
    detail: JSON.stringify(payload),
    retryHint: '手机记忆双写单侧失败，可在任务队列中重试，只会补写失败的一侧。',
    failCount: 1,
    retrying: false,
    cancellable: true,
  };
}

/** 从持久化任务 detail 解析手机写入失败载荷；无法解析时返回 null。 */
export function parsePhoneMemoryFailureTask(task: 队列任务记录): PhoneMemoryFailureTaskPayload | null {
  if (task.id !== 'phone' || typeof task.detail !== 'string') return null;
  try {
    const parsed = JSON.parse(task.detail) as Partial<PhoneMemoryFailureTaskPayload>;
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    if (parsed.failedSide !== 'yiting' && parsed.failedSide !== 'npc') return null;
    return {
      summary: parsed.summary,
      contactId: typeof parsed.contactId === 'string' ? parsed.contactId : undefined,
      failedSide: parsed.failedSide,
      operationId: typeof parsed.operationId === 'string' ? parsed.operationId : '',
      turn: Number(parsed.turn) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * 双侧失败时每个失败侧单独生成一条可恢复任务（相同 operationId、不同 failedSide），
 * 两侧都可独立重试；只有失败侧进入任务队列。
 */
export function buildPhoneMemoryFailureTasks(
  result: PhoneDualWriteResult,
  summary: string,
  contactId: string | undefined,
  turn: number,
): 队列任务记录[] {
  const tasks: 队列任务记录[] = [];
  for (const side of ['yiting', 'npc'] as const) {
    if (result.sides[side].status === 'failed') {
      tasks.push(buildPhoneMemoryFailureTask({
        summary,
        contactId,
        failedSide: side,
        operationId: result.operationId,
        turn,
      }));
    }
  }
  return tasks;
}

/** 判断任务是否对应同一次手机记忆提交的同一失败侧（用于重试后替换原任务）。 */
export function isSamePhoneMemoryTask(task: 队列任务记录, payload: PhoneMemoryFailureTaskPayload): boolean {
  if (task.id !== 'phone') return false;
  const parsed = parsePhoneMemoryFailureTask(task);
  if (!parsed) return false;
  return parsed.operationId === payload.operationId && parsed.failedSide === payload.failedSide;
}

export interface PhoneMemoryCommitIntent {
  summary: string;
  contactId?: string;
  turn: number;
  /** 操作来源 ID（手机消息/seed）：同一回合同联系人同摘要的两次真实操作必须可区分。 */
  operationSourceId?: string;
  force?: boolean;
  retrySide?: 'yiting' | 'npc';
  operationIdOverride?: string;
  /** 对标参考项目：结构化游戏时间（写入 NPC 记忆）。 */
  gameTime?: string;
}

export interface PhoneMemoryPublishDeps {
  getQueueTasks: () => 队列任务记录[];
  buildSavePayload: (overrides: {
    记忆?: 记忆系统;
    忆庭?: 忆庭系统;
    NPC?: NPC记录[];
    queueTasks?: 队列任务记录[];
  }) => import('@/models/settings').存档数据;
  saveGame: (payload: import('@/models/settings').存档数据) => Promise<unknown>;
  /** 发布事务结果：一次调用统一发布记忆/忆庭/NPC/任务队列，避免分别基于不同快照覆盖。 */
  publish: (next: { memory: 记忆系统; yiting: 忆庭系统; npcs: NPC记录[]; queueTasks: 队列任务记录[] }) => void;
  /** 失败任务入队后持久化失败时的提示回调。 */
  onPersistFailure?: (error: string) => void;
  /**
   * 事务执行器（测试/扩展注入用，默认 executePhoneMemoryDualWrite）。
   * 返回双侧状态，协调器据此生成失败任务并执行可信提交。
   */
  execute?: (input: PhoneMemoryDualWriteInput) => Promise<PhoneDualWriteResult>;
}

/**
 * 上层手机记忆提交协调器：执行一次双写事务 → 每个失败侧生成可恢复任务 →
 * 失败任务入队后立即通过现有保存负载持久化（不等待下一次主剧情自动存档）→ 保存成功后才统一发布三个切片。
 * 可信提交原则：先持久化、成功后才发布；任务保存失败时不发布任何未持久化状态，不虚报任务已入队。
 * 串行化由调用方（useGame action 的 promise 链）保证：后一笔读取前一笔提交后的最新状态。
 */
export async function runPhoneMemoryCommit(
  input: PhoneMemoryCommitIntent & {
    memory: 记忆系统;
    yiting: 忆庭系统;
    npcs: NPC记录[];
    settings: 记忆系统设置;
    config?: API配置项 | null;
  },
  deps: PhoneMemoryPublishDeps,
): Promise<PhoneDualWriteResult> {
  const execute = deps.execute ?? executePhoneMemoryDualWrite;
  const result = await execute({
    memory: input.memory,
    yiting: input.yiting,
    npcs: input.npcs,
    summary: input.summary,
    contact: input.contactId ? { npcId: input.contactId } : undefined,
    turn: input.turn,
    settings: input.settings,
    config: input.config,
    force: input.force,
    retrySide: input.retrySide,
    operationSourceId: input.operationSourceId,
    operationIdOverride: input.operationIdOverride,
    gameTime: input.gameTime,
  });
  const failureTasks = buildPhoneMemoryFailureTasks(result, input.summary, input.contactId, input.turn);
  const nextQueueTasks = failureTasks.length
    ? [...deps.getQueueTasks(), ...failureTasks]
    : deps.getQueueTasks();
  if (failureTasks.length) {
    try {
      await deps.saveGame(deps.buildSavePayload({
        记忆: result.nextMemory,
        忆庭: result.nextYiting,
        NPC: result.nextNpcs,
        queueTasks: nextQueueTasks,
      }));
    } catch (err) {
      // 任务保存失败：不发布任何未持久化状态，页面保持提交前可信状态。
      const message = err instanceof Error ? err.message : String(err);
      deps.onPersistFailure?.(`手机记忆失败任务保存失败，未入队、未发布，可重试提交：${message}`);
      throw new Error(`手机记忆失败任务保存失败，未入队、未发布：${message}`);
    }
  }
  deps.publish({
    memory: result.nextMemory,
    yiting: result.nextYiting,
    npcs: result.nextNpcs,
    queueTasks: nextQueueTasks,
  });
  return result;
}

/**
 * 手机记忆单侧失败重试协调器：只补写失败侧，重试成功后持久化更新后的状态与任务结果。
 * 可信提交原则：保存成功后才发布；保存失败时不发布、不虚报成功，
 * 原失败任务与当前页面状态保持不变（可再次重试），返回结果明确标记未可靠提交。
 * 已 success / not_due / skipped 的一侧不重放；主记忆不再追加（透传原状态）。
 */
export async function retryPhoneMemoryWrite(
  payload: PhoneMemoryFailureTaskPayload,
  current: {
    memory: 记忆系统;
    yiting: 忆庭系统;
    npcs: NPC记录[];
    settings: 记忆系统设置;
    config?: API配置项 | null;
    turn: number;
    gameTime?: string;
  },
  deps: PhoneMemoryPublishDeps,
): Promise<{ ok: boolean; error?: string; result?: PhoneDualWriteResult; persistFailed?: boolean }> {
  const turn = payload.turn || current.turn;
  const execute = deps.execute ?? executePhoneMemoryDualWrite;
  const result = await execute({
    memory: current.memory,
    yiting: current.yiting,
    npcs: current.npcs,
    summary: payload.summary,
    contact: payload.contactId ? { npcId: payload.contactId } : undefined,
    turn,
    settings: current.settings,
    config: current.config,
    force: true,
    retrySide: payload.failedSide,
    // 重试必须使用原操作持久化的 operationId，保证幂等键与初次提交一致。
    operationIdOverride: payload.operationId || undefined,
    gameTime: current.gameTime,
  });
  const failedSide = result.sides[payload.failedSide];
  const ok = failedSide.status !== 'failed';
  const sideLabel = payload.failedSide === 'yiting' ? '忆庭归档' : 'NPC 同行记忆';
  const nextTask: 队列任务记录 = {
    id: 'phone',
    title: '手机记忆写入',
    subtitle: sideLabel,
    turn,
    timestamp: Date.now(),
    status: ok ? 'success' : 'failed',
    detail: ok
      ? `手机记忆补写完成：${sideLabel}已写入，另一侧未重放。`
      : `手机记忆补写仍然失败（${failedSide.error ?? '未知错误'}），可再次重试。`,
    retryHint: '重试只会再次补写失败的一侧，不会重复已成功的一侧。',
    failCount: ok ? 0 : 1,
  };
  // 替换原失败任务（含重试中的 pending 占位），不新增重复任务。
  const nextQueueTasks = [
    ...deps.getQueueTasks().filter((task) => !isSamePhoneMemoryTask(task, payload)),
    nextTask,
  ];
  try {
    await deps.saveGame(deps.buildSavePayload({
      记忆: result.nextMemory,
      忆庭: result.nextYiting,
      NPC: result.nextNpcs,
      queueTasks: nextQueueTasks,
    }));
  } catch (err) {
    // 保存失败：不发布任何未持久化状态；原失败任务与页面状态保持不变，可再次重试。
    const message = err instanceof Error ? err.message : String(err);
    deps.onPersistFailure?.(`手机记忆补写已计算但保存失败，未发布、未虚报成功，可再次重试：${message}`);
    return { ok: false, error: `手机记忆补写已计算但保存失败（未发布）：${message}`, result, persistFailed: true };
  }
  deps.publish({
    memory: result.nextMemory,
    yiting: result.nextYiting,
    npcs: result.nextNpcs,
    queueTasks: nextQueueTasks,
  });
  return { ok, error: ok ? undefined : failedSide.error, result };
}
