import type { UseGameStateReturn } from '@/hooks/useGameState';
import { callVariableModel, type NsfwBaselineCandidate } from '@/services/ai/variableModel';
import { parseVariableCommands, snapshotVariableState, reduceVariableCommands, commitVariableState, unpackVariableState } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { isTravelerPlayerAuthoredVariablePath } from '@/utils/variableRegistry';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';
import { needsNsfwBaseline } from '@/utils/npcArchiveEnrichment';
import type { NPC记录 } from '@/models/npc';
import type { 变量命令, 变量命令批次 } from '@/models/variableCommand';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { buildNpcLedgerUpdateDebug, type NpcLedgerUpdateDebug } from './npcLedgerWorkflow';
import { pushQueueTask } from './workflowTaskRuntime';

function applyNsfwVariablePolicy(
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
    const key = command.key;
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

function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
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

// ── 变量模型校准 ──

interface VariableCalibrationParams {
  state: UseGameStateReturn;
  mainApiConfig: import('@/models/settings').API配置项;
  userInput: string;
  body: string;
  variableDraft?: string;
  /** 主流程结束后的回合数(已 +1)。 */
  turnAfter: number;
  /** 主模型 assistant 消息 ID，用于让批次与正文保持一对一关联。 */
  sourceMessageId?: string;
  memorySystemSnapshot: import('@/models/memory').记忆系统;
  /** 7/7a/7b 后的旅人快照(包含 应用狭间结果 写入的命途列表变化)。 */
  travelerSnapshot?: import('@/models/character').角色数据结构;
  /** 7/7a/7b 后的世界快照(包含全局事件追加、待触发狭间写入、进行中狭间清空)。 */
  worldSnapshot?: import('@/models/world').世界状态;
  signal?: AbortSignal;
  allowYiting?: boolean;
  shouldCommit?: () => boolean;
  queueTasksMirror?: UseGameStateReturn['queueTasks'];
  pathAwakeningTurn?: boolean;
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
  failedBatch?: 变量命令批次;
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
}

function buildVariableBatch(
  params: Pick<VariableCalibrationParams, 'turnAfter' | 'sourceMessageId'> &
    Omit<变量命令批次, 'id' | 'turn' | 'targetMessageId' | 'timestamp'>,
): 变量命令批次 {
  const { turnAfter, sourceMessageId, ...batch } = params;
  return {
    ...batch,
    id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    turn: turnAfter - 1,
    targetMessageId: sourceMessageId,
    timestamp: Date.now(),
  };
}

/** 执行一次变量模型校准：调用独立 API → 解析命令 → 落地 → 推入 variableBatches。
 *  失败不抛错（不影响主流程的存档）。 */
export async function runVariableCalibrationStep(
  params: VariableCalibrationParams,
): Promise<VariableCalibrationOverrides | null> {
  const { state, mainApiConfig } = params;
  if (!state.deviceSettings.gameSettings.enableVariableUpdate) return null;
  if (!params.body.trim()) return null;

  // 选择变量模型 API：用 settings 里的 override，字段留空回退到主 API 同名字段。
  const override = state.deviceSettings.gameSettings.variableApi;
  const overrodeAny =
    !!override.baseUrl.trim() || !!override.apiKey.trim() || !!override.model.trim();
  const variableConfig: import('@/models/settings').API配置项 = {
    ...mainApiConfig,
    provider: override.provider,
    baseUrl: override.baseUrl.trim() || mainApiConfig.baseUrl,
    apiKey: override.apiKey.trim() || mainApiConfig.apiKey,
    model: override.model.trim() || mainApiConfig.model,
    maxTokens: override.maxTokens ?? mainApiConfig.maxTokens,
    temperature: override.temperature ?? mainApiConfig.temperature,
  };

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

  try {
    // NSFW 基线候选：开启时，为缺少实质内容的 NPC 在变量更新那一次调用里生成基线。
    const nsfwBaselineCandidates: NsfwBaselineCandidate[] = [];
    if (state.deviceSettings.gameSettings.enableNsfw) {
      const npcRecords = (stateSnapshot.NPC ?? []) as NPC记录[];
      for (const npc of npcRecords) {
        if (nsfwBaselineCandidates.length >= 2) break;
        if (needsNsfwBaseline(npc, undefined, {
          nsfwEnabled: true,
          maleNsfwArchiveEnabled: state.deviceSettings.gameSettings.enableMaleNsfwArchive,
        })) {
          nsfwBaselineCandidates.push({
            npcId: npc.id,
            npcName: npc.姓名 || npc.别名 || '',
            gender: npc.性别,
            appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
            personality: typeof npc.性格 === 'string' ? npc.性格 : undefined,
            intro: typeof npc.介绍 === 'string' ? npc.介绍 : undefined,
          });
        }
      }
    }
    const { rawText } = await callVariableModel(variableConfig, {
      body: params.body,
      variableDraft: params.variableDraft,
      userInput: params.userInput,
      turnCount: params.turnAfter - 1, // 这条变量是给「刚结束的那回合」用的
      state: stateSnapshot,
      nsfwEnabled: state.deviceSettings.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.deviceSettings.gameSettings.enableMaleNsfwArchive,
      nsfwBaselineCandidates,
      signal: params.signal,
      retryCount: state.deviceSettings.gameSettings.variableApi.retryCount ?? 2,
      promptModules: state.deviceSettings.gameSettings.promptModules,
    });
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    const parsedFacts = parseVariableFacts(rawText);
    const factCommands = factsToVariableCommands(parsedFacts.facts, stateSnapshot, params.turnAfter - 1, {
      phoneSeedsEnabled: state.deviceSettings.gameSettings.手机系统.enabled && state.deviceSettings.gameSettings.手机系统.autoGenerateSeeds && !params.pathAwakeningTurn,
      maxPhoneSeedsPerTurn: state.deviceSettings.gameSettings.手机系统.maxSeedsPerTurn,
    });
    const parsedLegacyCommands = parseVariableCommands(rawText);
    const filteredLegacyCommands = parsedLegacyCommands.commands.filter((command) => !isTravelerPlayerAuthoredVariablePath(command.key));
    const skippedTravelerProfileLegacyCount = parsedLegacyCommands.commands.length - filteredLegacyCommands.length;
    const commands = [...factCommands.commands, ...filteredLegacyCommands];
    const parseErrors = [
      ...parsedFacts.parseErrors.map((reason) => `变量事实：${reason}`),
      ...parsedLegacyCommands.parseErrors.map((reason) => `变量命令：${reason}`),
    ];
    const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
      nsfwEnabled: state.deviceSettings.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.deviceSettings.gameSettings.enableMaleNsfwArchive,
    }, stateSnapshot.NPC as NPC记录[]);
    const { results, nextState } = reduceVariableCommands(allowedCommands, stateSnapshot);
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 解析错误也合并进 results，让玩家在面板里看到
    const errResults = parseErrors.map((reason) => ({
      command: { action: 'set' as const, key: '(解析失败)', value: null },
      ok: false,
      kind: 'error' as const,
      reason,
    }));
    const warningResults = factCommands.warnings.map((reason) => ({
      command: { action: 'set' as const, key: '(事实忽略)', value: null },
      ok: false,
      kind: 'warning' as const,
      reason,
    }));
    const rejectedResults = rejectedCommands.map((item) => ({ ...item, kind: 'rejected' as const }));
    const commandResults = results.map((item) => ({ ...item, kind: 'command' as const }));
    const allResults = [...errResults, ...warningResults, ...rejectedResults, ...commandResults];
    const npcLedgerUpdate = buildNpcLedgerUpdateDebug({
      facts: parsedFacts.facts,
      commands,
      results: allResults,
      warnings: [
        ...parseErrors,
        ...factCommands.warnings,
        ...rejectedCommands.map((item) => item.reason),
      ],
    });

    // 把整个 batch 推入历史
    const batch = buildVariableBatch({
      turnAfter: params.turnAfter,
      sourceMessageId: params.sourceMessageId,
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      results: allResults,
      report: [
        `变量事实：${parsedFacts.facts.length} 条，生成内部命令 ${factCommands.commands.length} 条。`,
        filteredLegacyCommands.length ? `兼容旧命令：${filteredLegacyCommands.length} 条。` : '兼容旧命令：0 条。',
        skippedTravelerProfileLegacyCount ? `已静默忽略旅人核心档案旧命令：${skippedTravelerProfileLegacyCount} 条。` : '',
        factCommands.warnings.length ? `事实警告：${factCommands.warnings.length} 条。` : '事实警告：0 条。',
        ...factCommands.notes,
      ].filter(Boolean).join('\n'),
      rawText,
    });
    if (params.shouldCommit?.() === false) return null;
    // 投影点（B2 定性，S11/S12）：队列抽屉即时显示批次；管线与存档只认 ctx/d，不回读此 state
    state.setVariableBatches((prev) => compactVariableBatchHistory([...prev, batch]));

    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 没有任何成功命令时，无需 setState；返回空 overrides 让 save 用主流程的值
    const anyApplied = results.some((r) => r.ok);
    const worldSelfHealed = nextState.世界 !== stateSnapshot.世界;
    if (!anyApplied && !worldSelfHealed) return { batch, npcLedgerUpdate };
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 一次性提交所有切片到 React state。传 stateSnapshot 作 initialState,
    // commitVariableState 内部用引用相等过滤——变量模型没改的 root 不会 setState,
    // 避免覆盖玩家在校准这几秒里在 UI 上做的交互(比如点了「踏入命途狭间」)。
    // 投影点（B2 定性，S13–S21）：变量切片即时刷新各面板；管线与存档只认 ctx/d，不回读此 state
    commitVariableState(nextState, stateSnapshot, {
      set旅人: state.set旅人,
      set世界: state.set世界,
      set记忆: state.set记忆,
      set忆庭: params.allowYiting === false ? (() => {}) : state.set忆庭,
      set智库: state.set智库,
      set手机: state.set手机,
      setNPC: state.setNPC,
      set新闻: state.set新闻,
      set剧情: state.set剧情,
    });

    return { ...unpackVariableState(nextState), batch, npcLedgerUpdate };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;
    const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : '变量模型校准失败。';
    console.warn('[variable-model] 校准失败：', err);
    pushQueueTask(state, 'variable', 'failed', {
      detail: errorMessage,
    }, undefined, params.queueTasksMirror);
    // 失败也记一条 batch 让玩家知道
    const batch = buildVariableBatch({
      turnAfter: params.turnAfter,
      sourceMessageId: params.sourceMessageId,
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      results: [{
        command: { action: 'set', key: '(变量模型调用失败)', value: null },
        ok: false,
        reason: errorMessage,
      }],
      rawText: errorMessage,
    });
    // 投影点（B2 定性，S11/S12）：队列抽屉即时显示批次；管线与存档只认 ctx/d，不回读此 state
    state.setVariableBatches((prev) => compactVariableBatchHistory([...prev, batch]));
    return {
      batch,
      failedBatch: batch,
      npcLedgerUpdate: {
        updatedNames: [],
        memoryAppended: [],
        ledgerFieldsUpdated: [],
        summaryTriggered: [],
        warnings: [errorMessage],
      },
    };
  }
}
