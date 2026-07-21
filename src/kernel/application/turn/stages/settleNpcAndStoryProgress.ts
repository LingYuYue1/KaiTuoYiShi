import type { 聊天消息 } from '@/models/chat';
import { 创建默认记忆系统设置, type 游戏设置 } from '@/models/settings';
import type { 世界状态 } from '@/models/world';
import type { 剧情编织门禁快照 } from '@/src/kernel/workflows/storyWeaving';
import { autoAlignCanonStoryProgress } from '@/src/kernel/domain/story/storyProgress';
import { applyStoryArchiveZhikuRuntimeUnlock } from '@/services/zhikuRuntimeUnlock';
import { enrichNpcArchives } from '@/utils/npcArchiveEnrichment';
import {
  addImmediateMemory,
  compressNpcMemoryLedger,
} from '@/src/kernel/workflows/memoryUtils';
import {
  applyStoryProgressNpcMemory,
  buildStoryProgressMemoryLine,
} from '@/src/kernel/workflows/turnProtocol';
import type { TurnExecutionState } from '../turnExecutionState';
import type { VariableCalibrationOverrides } from './variableCalibration';
import { attachNpcLedgerUpdateDebug, pushUniqueText } from './npcDiagnostics';
import { pushQueueTask } from './turnRuntime';

export function settleNpcAndStoryProgress(input: Readonly<{
  state: TurnExecutionState;
  settings: 游戏设置;
  overrides: VariableCalibrationOverrides | null;
  memory: TurnExecutionState['记忆'];
  history: 聊天消息[];
  assistantMessageId: string;
  opening: boolean;
  userInput: string;
  narrative: string;
  world: 世界状态;
  effectiveWorld: 世界状态;
  storyGate: 剧情编织门禁快照 | null;
  assertActive(): void;
}>): Readonly<{ history: 聊天消息[]; memory: TurnExecutionState['记忆'] }> {
  const { state, overrides } = input;
  const completedTurn = state.turnCount - 1;
  const nextTurn = state.turnCount;
  const npcSource = overrides?.NPC ?? state.NPC;
  const enrichment = enrichNpcArchives(npcSource, {
    nsfwEnabled: input.settings.enableNsfw,
    maleNsfwArchiveEnabled: input.settings.enableMaleNsfwArchive,
    zhiku: state.智库,
  });
  const memorySettings = input.settings.记忆系统 ?? 创建默认记忆系统设置();
  const summaryTriggered: string[] = [];
  let npcRecords = enrichment.records.map((npc) => {
    const compression = compressNpcMemoryLedger({
      npcId: npc.id,
      entries: npc.同行记忆 ?? [],
      summaries: npc.总结记忆 ?? [],
      threshold: memorySettings.NPC记忆压缩阈值,
      prompt: memorySettings.NPC记忆压缩提示词,
      turn: completedTurn,
      source: '变量',
    });
    if (!compression.changed) return npc;
    if (compression.summaryTriggered) pushUniqueText(summaryTriggered, npc.姓名);
    return { ...npc, 同行记忆: compression.memories, 总结记忆: compression.summaries };
  });
  const npcChanged = enrichment.changed
    || npcRecords.length !== npcSource.length
    || npcRecords.some((npc, index) => npc !== npcSource[index]);
  if (npcChanged) state.NPC = npcRecords;
  let history = input.history;
  const ledgerDebug = overrides?.npcLedgerUpdate || summaryTriggered.length
    ? {
        updatedNames: overrides?.npcLedgerUpdate?.updatedNames ?? [],
        memoryAppended: overrides?.npcLedgerUpdate?.memoryAppended ?? [],
        ledgerFieldsUpdated: overrides?.npcLedgerUpdate?.ledgerFieldsUpdated ?? [],
        summaryTriggered: [...(overrides?.npcLedgerUpdate?.summaryTriggered ?? []), ...summaryTriggered]
          .filter((name, index, list) => Boolean(name) && list.indexOf(name) === index),
        warnings: overrides?.npcLedgerUpdate?.warnings ?? [],
      }
    : undefined;
  if (ledgerDebug) {
    history = attachNpcLedgerUpdateDebug(history, input.assistantMessageId, ledgerDebug);
    state.chatHistory = history;
  }
  let memory = overrides?.记忆 ?? input.memory;
  const alignment = input.opening
    ? { system: state.剧情编织, changed: false, progressed: false }
    : autoAlignCanonStoryProgress({
        storyWeaving: state.剧情编织,
        turnCount: nextTurn,
        userInput: input.userInput,
        body: input.narrative,
        currentLocation: overrides?.世界?.当前地点 ?? input.world.当前地点 ?? input.effectiveWorld.当前地点,
        gateSnapshot: input.storyGate,
      });
  const memoryLine = alignment.progressed
    ? buildStoryProgressMemoryLine(state.剧情编织, alignment.system)
    : '';
  if (alignment.changed) {
    input.assertActive();
    state.剧情编织 = alignment.system;
    if (memoryLine) {
      memory = addImmediateMemory(memory, memoryLine, nextTurn);
      state.记忆 = memory;
      const withStoryMemory = applyStoryProgressNpcMemory(npcRecords, alignment.system, memoryLine, nextTurn);
      if (withStoryMemory !== npcRecords) {
        npcRecords = withStoryMemory;
        state.NPC = npcRecords;
      }
    }
  }
  if (alignment.progressed) {
    const unlock = applyStoryArchiveZhikuRuntimeUnlock({ zhiku: state.智库, storyWeaving: alignment.system });
    if (unlock.changed) {
      input.assertActive();
      state.智库 = unlock.system;
      pushQueueTask(state, 'zhiku', 'success', {
        detail: `剧情归档已更新智库门禁：${unlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${unlock.unlocked.length > 3 ? ` 等 ${unlock.unlocked.length} 项` : ''}。`,
      });
    }
  }
  input.assertActive();
  return { history, memory };
}
