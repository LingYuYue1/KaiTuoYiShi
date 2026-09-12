import type { 角色数据结构 } from '@/models/character';
import type { NPC记录 } from '@/models/npc';
import type { 手机系统 } from '@/models/phone';
import type {
  变量事实来源,
  变量命令批次,
  变量处理模式,
} from '@/models/variableCommand';
import type { 世界状态 } from '@/models/world';
import {
  analyzeVariableTurn,
  type NpcLedgerUpdateDebug,
  type VariableTurnAnalysis,
} from '@/services/variableTurnAnalysis';
import {
  commitVariableWritableState,
  VARIABLE_WRITABLE_ROOT_KEYS,
  type VariableWritableRootKey,
  type VariableWritableSetters,
} from '@/utils/variableExecutor';
import type { VariableState } from '@/utils/variableRegistry';

export type VariableWritableState = Pick<VariableState, VariableWritableRootKey>;
export type VariableReadContext = Pick<VariableState, '记忆' | '忆庭' | '智库' | '新闻' | '剧情'>;

export interface VariableRuntimeState {
  writable: VariableWritableState;
  read: VariableReadContext;
}

export interface LinkVariableTurnInput {
  rawText: string;
  current: VariableRuntimeState;
  turn: number;
  operationSourceId?: string;
  sourceTurnId?: string;
  sourceMessageId?: string;
  sourceEvidenceId?: string;
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  nsfwEnabled?: boolean;
  maleNsfwArchiveEnabled?: boolean;
  factSource?: 变量事实来源;
  bodyText?: string;
  recallContext?: string;
  mode?: 变量处理模式;
}

export interface VariableTurnProjection {
  analysis: VariableTurnAnalysis;
  initialState: VariableState;
  nextState: VariableWritableState;
  changedRoots: VariableWritableRootKey[];
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
}

export interface VariableBatchMetadata {
  turn: number;
  id?: string;
  turnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  supersedesBatchId?: string;
  timestamp?: number;
  source: 'main' | 'calibration';
  modelName?: string;
}

export interface VariableProjectionCommitReceipt {
  changedRoots: VariableWritableRootKey[];
  committedRoots: VariableWritableRootKey[];
  deferredRoots: VariableWritableRootKey[];
  batchRecorded: boolean;
}

export function splitVariableRuntimeState(state: VariableState): VariableRuntimeState {
  return {
    writable: {
      旅人: state.旅人,
      世界: state.世界,
      手机: state.手机,
      NPC: state.NPC,
    },
    read: {
      记忆: state.记忆,
      忆庭: state.忆庭,
      智库: state.智库,
      新闻: state.新闻,
      剧情: state.剧情,
    },
  };
}

function composeVariableState(current: VariableRuntimeState): VariableState {
  return {
    ...current.read,
    ...current.writable,
  } as VariableState;
}

/** 所有模型变量事实的唯一纯联动入口：解析、领域 projection、旧命令兼容与诊断。 */
export function linkVariableTurn(input: LinkVariableTurnInput): VariableTurnProjection {
  const initialState = composeVariableState(input.current);
  const analysis = analyzeVariableTurn({
    rawText: input.rawText,
    stateSnapshot: initialState,
    turn: input.turn,
    operationSourceId: input.operationSourceId,
    sourceTurnId: input.sourceTurnId,
    sourceMessageId: input.sourceMessageId,
    sourceEvidenceId: input.sourceEvidenceId,
    phoneSeedsEnabled: input.phoneSeedsEnabled,
    maxPhoneSeedsPerTurn: input.maxPhoneSeedsPerTurn,
    nsfwEnabled: input.nsfwEnabled,
    maleNsfwArchiveEnabled: input.maleNsfwArchiveEnabled,
    factSource: input.factSource,
    bodyText: input.bodyText,
    recallContext: input.recallContext,
    mode: input.mode,
    allowedLegacyRoots: VARIABLE_WRITABLE_ROOT_KEYS,
  });
  const nextState: VariableWritableState = {
    旅人: analysis.nextState.旅人,
    世界: analysis.nextState.世界,
    手机: analysis.nextState.手机,
    NPC: analysis.nextState.NPC,
  };
  const changedRoots = VARIABLE_WRITABLE_ROOT_KEYS.filter((root) => nextState[root] !== input.current.writable[root]);
  return {
    analysis,
    initialState,
    nextState,
    changedRoots,
    npcLedgerUpdate: analysis.npcLedgerUpdate,
  };
}

export function buildVariableBatchFromProjection(
  projection: VariableTurnProjection,
  metadata: VariableBatchMetadata,
): 变量命令批次 {
  const { analysis } = projection;
  return {
    id: metadata.id ?? `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: 3,
    turn: metadata.turn,
    turnId: metadata.turnId,
    targetMessageId: metadata.targetMessageId,
    targetUserMessageId: metadata.targetUserMessageId,
    mode: analysis.mode ?? 'normal',
    sourceEvidenceId: analysis.sourceEvidenceId,
    supersedesBatchId: metadata.supersedesBatchId,
    timestamp: metadata.timestamp ?? Date.now(),
    source: metadata.source,
    modelName: metadata.modelName,
    facts: analysis.facts,
    results: analysis.results,
    ...(analysis.diagnostics.length ? { diagnostics: analysis.diagnostics } : {}),
    report: [
      `变量事实：${analysis.parsedFacts.facts.length} 条，生成内部命令 ${analysis.factCommands.commands.length} 条。`,
      analysis.legacyCommandCount ? `兼容旧命令：${analysis.legacyCommandCount} 条。` : '兼容旧命令：0 条。',
      analysis.skippedTravelerProfileLegacyCount ? `已静默忽略旅人核心档案旧命令：${analysis.skippedTravelerProfileLegacyCount} 条。` : '',
      analysis.skippedServiceOwnedLegacyCount ? `已忽略 service-owned root 旧命令：${analysis.skippedServiceOwnedLegacyCount} 条。` : '',
      analysis.factCommands.warnings.length ? `事实警告：${analysis.factCommands.warnings.length} 条。` : '事实警告：0 条。',
      ...analysis.factCommands.notes,
    ].filter(Boolean).join('\n'),
    rawText: analysis.rawText,
  };
}

/** 把 projection 提交到真实 setter；只记录已经真实提交完成的批次。 */
export function commitVariableProjection(input: {
  projection: VariableTurnProjection;
  setters: VariableWritableSetters;
  roots?: readonly VariableWritableRootKey[];
  batch?: 变量命令批次;
  appendBatch?: (batch: 变量命令批次) => boolean;
}): VariableProjectionCommitReceipt {
  const requestedRoots = input.roots ?? input.projection.changedRoots;
  const committedRoots = commitVariableWritableState(
    input.projection.analysis.nextState,
    input.projection.initialState,
    input.setters,
    requestedRoots,
  );
  const deferredRoots = input.projection.changedRoots.filter((root) => !requestedRoots.includes(root));
  let batchRecorded = false;
  if (input.batch && input.appendBatch && deferredRoots.length === 0) {
    if (!input.appendBatch(input.batch)) throw new Error('变量批次历史写入失败。');
    batchRecorded = true;
  }
  return {
    changedRoots: [...input.projection.changedRoots],
    committedRoots,
    deferredRoots,
    batchRecorded,
  };
}

export function unpackVariableProjection(projection: VariableTurnProjection): {
  旅人: 角色数据结构;
  世界: 世界状态;
  手机: 手机系统;
  NPC: NPC记录[];
} {
  return projection.nextState as {
    旅人: 角色数据结构;
    世界: 世界状态;
    手机: 手机系统;
    NPC: NPC记录[];
  };
}

export type { NpcLedgerUpdateDebug, VariableTurnAnalysis };
