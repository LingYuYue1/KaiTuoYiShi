import type { TurnExecutionState } from '../turnExecutionState';
import type { API配置项, 游戏设置 } from '@/models/settings';
import type { NPC记录 } from '@/models/npc';
import type { 变量命令, 变量命令批次 } from '@/models/variableCommand';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';
import { callVariableModel, type NsfwBaselineCandidate } from '@/services/ai/variableModel';
import { parseVariableFacts } from '@/utils/variableFacts';
import { snapshotVariableState, reduceVariableCommands, unpackVariableState } from '@/utils/variableExecutor';
import { buildNpcLedgerUpdateDebug, type NpcLedgerUpdateDebug } from './npcDiagnostics';
import { requireIndependentApiConfig } from '@/services/ai/requireIndependentApiConfig';
import { needsNsfwBaseline } from '@/utils/npcArchiveEnrichment';
import { factsToVariableCommands } from '@/utils/variableFacts';

export function applyNsfwVariablePolicy(
  commands: 变量命令[],
  policy: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean },
  npcs: NPC记录[] = [],
): {
  allowedCommands: 变量命令[];
  rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }>;
} {
  const allowedCommands: 变量命令[] = [];
  const rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }> = [];

  for (const command of commands) {
    const key = command.key ?? '';
    const valueText = JSON.stringify(command.value ?? '');
    const touchesNsfw = key.includes('NSFW档案') || valueText.includes('NSFW档案');
    const touchesMaleArchive =
      key.includes('男性身体档案') ||
      key.includes('男性器') ||
      valueText.includes('男性身体档案') ||
      valueText.includes('男性器');

    if (touchesNsfw && !policy.nsfwEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: 'NSFW 总开关未开启，已阻止写入 NSFW 档案。',
      });
      continue;
    }

    if (touchesNsfw) {
      const blockedReason = getNsfwBlockedCommandReason(command, npcs);
      if (blockedReason) {
        rejectedCommands.push({
          command,
          ok: false,
          reason: blockedReason,
        });
        continue;
      }
    }

    if (touchesMaleArchive && !policy.maleNsfwArchiveEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。',
      });
      continue;
    }

    allowedCommands.push(command);
  }

  return { allowedCommands, rejectedCommands };
}

export function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
  const text = `${command.key}\n${JSON.stringify(command.value ?? '')}`;
  const selector = command.key.match(/^NPC\[([^\]]+)\]/)?.[1] ?? '';
  const selectorValue = selector.includes('=')
    ? selector.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim()
    : selector.trim();
  const npc = npcs.find((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue ||
    text.includes(item.姓名) ||
    Boolean(item.别名 && text.includes(item.别名)),
  );
  const reason = getNsfwArchiveBlockReason(npc, selectorValue, text);
  return reason ? `NSFW 档案已阻止：${reason}。` : null;
}

export interface VariableCalibrationParams {
  state: TurnExecutionState;
  gameSettings: 游戏设置;
  userInput: string;
  body: string;
  variableDraft?: string;
  /** 主流程结束后的回合数(已 +1)。 */
  turnAfter: number;
  memorySystemSnapshot: import('@/models/memory').记忆系统;
  /** 7/7a/7b 后的旅人快照(包含 应用狭间结果 写入的命途列表变化)。 */
  travelerSnapshot?: import('@/models/character').角色数据结构;
  /** 7/7a/7b 后的世界快照(包含全局事件追加、待触发狭间写入、进行中狭间清空)。 */
  worldSnapshot?: import('@/models/world').世界状态;
  signal?: AbortSignal;
  shouldCommit?: () => boolean;
}

export interface VariableCalibrationOverrides {
  旅人?: import('@/models/character').角色数据结构;
  世界?: import('@/models/world').世界状态;
  记忆?: import('@/models/memory').记忆系统;
  忆庭?: import('@/models/yiting').忆庭系统;
  智库?: import('@/models/zhiku').智库系统;
  手机?: import('@/models/phone').手机系统;
  NPC?: import('@/models/npc').NPC记录[];
  新闻?: import('@/models/news').新闻条目[];
  剧情?: import('@/models/plot').剧情节点[];
  batch?: 变量命令批次;
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
}

/** 执行一次变量模型校准：调用独立 API → 解析命令 → 落地 → 推入 variableBatches。 */
export async function runVariableCalibrationStep(
  params: VariableCalibrationParams,
): Promise<VariableCalibrationOverrides | null> {
  const { state, gameSettings } = params;
  if (!gameSettings.enableVariableUpdate) return null;
  if (!params.body?.trim()) return null;

  const override = gameSettings.variableApi;
  const variableConfig = requireIndependentApiConfig('变量更新', override, {
    maxTokens: 4096,
    temperature: 0.2,
  });

  // 构造当前状态快照(用主流程已更新过的切片)。
  const stateSnapshot = snapshotVariableState({
    旅人: params.travelerSnapshot ?? state.旅人,
    世界: params.worldSnapshot ?? state.世界,
    记忆: params.memorySystemSnapshot,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    新闻: state.新闻,
    剧情: state.剧情,
  });

  const nsfwBaselineCandidates = collectNsfwBaselineCandidates(
    stateSnapshot.NPC as NPC记录[],
    gameSettings.enableNsfw,
    gameSettings.enableMaleNsfwArchive,
  );
  const { rawText } = await callVariableModel(variableConfig, {
    body: params.body,
    variableDraft: params.variableDraft,
    userInput: params.userInput,
    turnCount: params.turnAfter - 1,
    state: stateSnapshot,
    nsfwEnabled: gameSettings.enableNsfw,
    maleNsfwArchiveEnabled: gameSettings.enableMaleNsfwArchive,
    nsfwBaselineCandidates,
    signal: params.signal,
    retryCount: gameSettings.variableApi.retryCount ?? 2,
    promptModules: gameSettings.promptModules,
  });
  assertCalibrationActive(params);
  return commitVariableCalibration(params, variableConfig.model, stateSnapshot, rawText);
}

function collectNsfwBaselineCandidates(
  records: NPC记录[],
  enabled: boolean,
  maleEnabled: boolean,
): NsfwBaselineCandidate[] {
  if (!enabled) return [];
  const candidates: NsfwBaselineCandidate[] = [];
  for (const npc of records) {
    if (candidates.length >= 2) break;
    if (!needsNsfwBaseline(npc, undefined, { nsfwEnabled: true, maleNsfwArchiveEnabled: maleEnabled })) continue;
    candidates.push({
      npcId: npc.id,
      npcName: npc.姓名 ?? npc.别名 ?? '',
      gender: npc.性别,
      appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
      personality: typeof npc.性格 === 'string' ? npc.性格 : undefined,
      intro: typeof npc.介绍 === 'string' ? npc.介绍 : undefined,
    });
  }
  return candidates;
}

function commitVariableCalibration(
  params: VariableCalibrationParams,
  modelName: string,
  stateSnapshot: ReturnType<typeof snapshotVariableState>,
  rawText: string,
): VariableCalibrationOverrides {
  const { state, gameSettings } = params;
  const parsedFacts = parseVariableFacts(rawText);
  const factCommands = factsToVariableCommands(parsedFacts.facts, stateSnapshot, params.turnAfter - 1, {
    phoneSeedsEnabled: gameSettings.手机系统.enabled && gameSettings.手机系统.autoGenerateSeeds,
    maxPhoneSeedsPerTurn: gameSettings.手机系统.maxSeedsPerTurn,
  });
  if (parsedFacts.parseErrors.length) throw new Error(`变量事实解析失败：${parsedFacts.parseErrors.join('；')}`);
  if (factCommands.warnings.length) throw new Error(`变量事实归约失败：${factCommands.warnings.join('；')}`);
  const commands = factCommands.commands;
  const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
    nsfwEnabled: gameSettings.enableNsfw,
    maleNsfwArchiveEnabled: gameSettings.enableMaleNsfwArchive,
  }, stateSnapshot.NPC as NPC记录[]);
  if (rejectedCommands.length) {
    throw new Error(`变量策略拒绝整批命令：${rejectedCommands.map((item) => item.reason).join('；')}`);
  }
  const { results, nextState } = reduceVariableCommands(allowedCommands, stateSnapshot);
  const failed = results.find((result) => !result.ok);
  if (failed) throw new Error(`变量命令归约失败：${failed.reason ?? failed.command.key}`);
  assertCalibrationActive(params);
  const commandResults = results.map((item) => ({ ...item, kind: 'command' as const }));
  const npcLedgerUpdate = buildNpcLedgerUpdateDebug({ facts: parsedFacts.facts, commands, results: commandResults, warnings: [] });
  const batch: 变量命令批次 = {
    id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    turn: params.turnAfter - 1,
    timestamp: Date.now(),
    source: 'calibration',
    modelName,
    results: commandResults,
    report: [`变量事实：${parsedFacts.facts.length} 条，生成内部命令 ${factCommands.commands.length} 条。`, ...factCommands.notes]
      .filter(Boolean).join('\n'),
    rawText,
  };
  assertCalibrationActive(params);
  state.variableBatches = [...state.variableBatches, batch];
  const anyApplied = results.some((result) => result.ok);
  const worldSelfHealed = nextState.世界 !== stateSnapshot.世界;
  if (!anyApplied && !worldSelfHealed) return { batch, npcLedgerUpdate };
  assertCalibrationActive(params);
  return { ...unpackVariableState(nextState), batch, npcLedgerUpdate };
}

export function assertCalibrationActive(params: Pick<VariableCalibrationParams, 'signal' | 'shouldCommit'>): void {
  if (params.signal?.aborted || params.shouldCommit?.() === false) {
    throw new DOMException('Variable calibration aborted', 'AbortError');
  }
}
