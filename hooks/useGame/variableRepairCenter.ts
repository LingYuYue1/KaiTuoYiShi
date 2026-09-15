// 变量修复中心批处理 hook：拥有扫描草稿状态机与单键持久化，提交复用既有
// 提交变量修复计划 唯一事务（该事务自带 variable_reparse 队列账本，本文件不新增任务 ID）。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项 } from '@/models/settings';
import type {
  变量修复草稿,
  变量修复草稿项,
  变量修复草稿状态,
} from '@/models/variableRepairBatch';
import {
  完成扫描状态,
  推进草稿项,
  构建变量修复草稿,
  草稿是否过期,
} from '@/models/variableRepairBatch';
import type { 变量修复计划, 变量修复回执 } from '@/models/variableRepair';
import { 提交变量修复计划 } from '@/hooks/useGame/variableRepairWorkflow';
import { 列出可修复回合 } from '@/services/variableHistoryRepair';
import { 重新解析变量计划 } from '@/services/variableRepair';
import {
  清除变量修复草稿,
  保存变量修复草稿,
  读取变量修复草稿,
} from '@/services/storage/variableRepairDraft';
import { snapshotVariableState } from '@/utils/variableExecutor';
import { variableStateFingerprint } from '@/utils/variableFingerprint';
import { findPreviousUserInput } from '@/utils/chatHistory';
import { resolveVariableModelConfig } from '@/hooks/useGame/variableWorkflow';
import { pushQueueTask as 推入队列账本 } from '@/hooks/useGame/workflowTaskRuntime';
import { isWorkflowAbortError } from '@/hooks/useGame/workflowTransaction';

const 扫描上限 = 40;

interface 中心状态 {
  草稿: 变量修复草稿 | null;
  /** 草稿被会话身份 epoch 校验：翻转（读档 / 分支 / 新局）后旧草稿视为不可用。 */
  草稿Epoch: number;
  扫描中: boolean;
  提交中: boolean;
  诊断: string | null;
}

const 空中心状态: 中心状态 = { 草稿: null, 草稿Epoch: -1, 扫描中: false, 提交中: false, 诊断: null };

export interface 变量修复中心动作 {
  草稿: 变量修复草稿 | null;
  扫描中: boolean;
  提交中: boolean;
  诊断: string | null;
  开始扫描: () => void;
  暂停: () => void;
  继续: () => void;
  取消: () => void;
  提交选择: (selection: Record<string, string[]>) => Promise<void>;
  清除: () => void;
}

export interface VariableRepairCenterParams {
  /** 活跃 state 的非响应式读取（命令式回调里取最新值）。 */
  getState: () => UseGameStateReturn;
  getActiveConfig: () => API配置项 | null;
  /** 会话身份标识：读档 / 分支 / 新局后单调递增，批量草稿一律重置。 */
  sessionEpoch: number;
  pushQueueTask: typeof 推入队列账本;
}

interface 扫描中止持有 {
  controller: AbortController;
  /**
   * 中止后的落点：暂停可续扫，取消保留作废草稿。
   * 清除 / 会话翻转不走这里——它们自增扫描代，在途扫描直接失效，不回写草稿。
   */
  mode: 'pause' | 'cancel';
}

/** 判定扫描代是否已被清除 / 会话翻转作废；作废后不得再回写草稿。 */
function 代已作废(代Ref: { current: number }, 代: number): boolean {
  return 代Ref.current !== 代;
}

function 会话草稿(状态: 中心状态, epoch: number): 变量修复草稿 | null {
  return 状态.草稿Epoch === epoch ? 状态.草稿 : null;
}

function 选择值(selection: Record<string, string[]>, id: string): string[] {
  const ids = selection[id];
  return Array.isArray(ids) ? ids : [];
}

export function useVariableRepairCenter(params: VariableRepairCenterParams): 变量修复中心动作 {
  const { getState, getActiveConfig, pushQueueTask, sessionEpoch } = params;
  const [状态, set状态] = useState<中心状态>(空中心状态);
  const 状态Ref = useRef(状态);
  const 中止Ref = useRef<扫描中止持有 | null>(null);
  const 已挂载Ref = useRef(false);
  /** 扫描代：清除 / 会话翻转时自增，令在途扫描失效，杜绝作废后回写草稿。 */
  const 扫描代Ref = useRef(0);

  const 合并状态 = useCallback((patch: Partial<中心状态>) => {
    const next = { ...状态Ref.current, ...patch };
    状态Ref.current = next;
    set状态(next);
  }, []);

  // ── 挂载恢复（异步 → 不级联渲染）；会话翻转只派生失效，见 草稿有效 ──
  useEffect(() => {
    if (!已挂载Ref.current) {
      已挂载Ref.current = true;
      void (async () => {
        const { draft, issues } = await 读取变量修复草稿();
        if (!draft) {
          if (issues.length > 0) 合并状态({ 诊断: `本地草稿已损坏并被丢弃：${issues[0]}` });
          return;
        }
        // 载入历史草稿同时绑定当前会话身份：跨读档 / 分支不恢复。
        const 指纹 = await variableStateFingerprint(snapshotVariableState(getState()));
        if (草稿是否过期(draft, 指纹)) {
          await 清除变量修复草稿().catch(() => undefined);
          合并状态({ 诊断: '上次扫描草稿基于旧的变量状态，已自动清除。请重新扫描。' });
          return;
        }
        if (issues.length > 0) {
          合并状态({ 诊断: `本地草稿部分损坏，已丢弃坏项：${issues[0]}` });
          await 保存变量修复草稿(draft).catch(() => undefined);
        }
        合并状态({ 草稿: draft, 草稿Epoch: sessionEpoch });
      })();
    }
  });

  const 恢复EpochRef = useRef(sessionEpoch);
  useEffect(() => {
    if (已挂载Ref.current && 恢复EpochRef.current !== sessionEpoch) {
      恢复EpochRef.current = sessionEpoch;
      // 会话翻转（读档 / 分支 / 新局）：作废在途扫描并清空内存与存储，避免旧草稿回写。
      扫描代Ref.current += 1;
      中止Ref.current?.controller.abort();
      中止Ref.current = null;
      合并状态({ 草稿: null, 诊断: null, 扫描中: false, 提交中: false });
      void 清除变量修复草稿().catch(() => undefined);
    }
  }, [sessionEpoch, 合并状态]);

  const 报告队列 = useCallback((detail: string, turn: number | undefined) => {
    pushQueueTask(getState(), 'variable_reparse', 'pending', { detail, turn });
  }, [getState, pushQueueTask]);

  const 收场 = useCallback(async (target: 变量修复草稿, holder: 扫描中止持有) => {
    中止Ref.current = null;
    const state: 变量修复草稿状态 = holder.mode === 'pause' ? 'paused' : 'cancelled';
    const next: 变量修复草稿 = { ...target, state, updatedAt: Date.now() };
    合并状态({ 草稿: next, 扫描中: false });
    await 保存变量修复草稿(next).catch(() => undefined);
    报告队列(state === 'paused' ? '变量修复扫描已暂停。' : '变量修复扫描已取消。', next.项[0]?.turn);
  }, [合并状态, 报告队列]);

  const 逐项扫描 = useCallback(async (controller: AbortController, holder: 扫描中止持有, 代: number) => {
    const base = 会话草稿(状态Ref.current, sessionEpoch);
    if (!base) return;
    let 工作稿 = base;
    for (const item of base.项) {
      if (controller.signal.aborted || 代已作废(扫描代Ref, 代)) break;
      if (item.status !== 'pending' && item.status !== 'scanning') continue;
      工作稿 = 推进草稿项(工作稿, item.targetMessageId, { status: 'scanning' });
      合并状态({ 草稿: 工作稿 });
      try {
        const s = getState();
        const message = s.chatHistory.find((entry) => entry.id === item.targetMessageId);
        if (!message) throw new Error('历史消息已不存在。');
        const mainConfig = getActiveConfig();
        if (!mainConfig) throw new Error('未配置主 API，无法重新解析变量。');
        const { config } = resolveVariableModelConfig(
          s.deviceSettings.gameSettings.variableApi,
          mainConfig,
        );
        const plan = await 重新解析变量计划({
          message,
          turn: item.turn,
          stateSnapshot: snapshotVariableState(s),
          // 全批共用扫描起点的一次性指纹：提交前据此判过期，逐项重算只会制造漂移。
          baseStateFingerprint: base.指纹,
          batches: s.variableBatches,
          mainApiConfig: config,
          userInput: findPreviousUserInput(s.chatHistory, item.targetMessageId),
          nsfwEnabled: s.deviceSettings.gameSettings.enableNsfw,
          maleNsfwArchiveEnabled: s.deviceSettings.gameSettings.enableMaleNsfwArchive,
          retryCount: s.deviceSettings.gameSettings.variableApi.retryCount ?? 2,
          promptModules: s.deviceSettings.gameSettings.promptModules,
          signal: controller.signal,
        });
        if (代已作废(扫描代Ref, 代)) return;
        工作稿 = 推进草稿项(工作稿, item.targetMessageId, { status: 'ready', 计划: plan });
      } catch (error) {
        if (isWorkflowAbortError(error) || holder.controller.signal.aborted) break;
        工作稿 = 推进草稿项(工作稿, item.targetMessageId, {
          status: 'failed',
          错误: error instanceof Error ? error.message : '未知错误。',
        });
      }
      if (代已作废(扫描代Ref, 代)) return;
      合并状态({ 草稿: 工作稿 });
      await 保存变量修复草稿(工作稿).catch(() => undefined);
    }
    if (代已作废(扫描代Ref, 代)) return;
    if (controller.signal.aborted) {
      await 收场(工作稿, holder);
      return;
    }
    const settled: 变量修复草稿 = { ...工作稿, state: 完成扫描状态(工作稿), updatedAt: Date.now() };
    中止Ref.current = null;
    合并状态({ 草稿: settled, 扫描中: false });
    await 保存变量修复草稿(settled).catch(() => undefined);
    const failed = settled.项.filter((item) => item.status === 'failed').length;
    报告队列(
      failed === 0
        ? `变量修复扫描完成：${settled.项.length} 个回合。`
        : `变量修复扫描完成，${failed} 个回合失败。`,
      settled.项[0]?.turn,
    );
  }, [getActiveConfig, getState, 报告队列, 收场, 合并状态, sessionEpoch]);

  const 开始扫描 = useCallback(() => {
    if (状态Ref.current.扫描中 || 状态Ref.current.提交中) return;
    扫描代Ref.current += 1;
    const 代 = 扫描代Ref.current;
    合并状态({ 草稿: null, 草稿Epoch: sessionEpoch });
    const targets = 列出可修复回合(getState().chatHistory, 扫描上限);
    if (targets.length === 0) {
      合并状态({ 诊断: '没有可修复的历史助手回合。' });
      return;
    }
    void (async () => {
      // 快照一次并落定指纹：提交前用同一指纹校验计划是否过期。
      const 指纹 = await variableStateFingerprint(snapshotVariableState(getState()));
      if (代已作废(扫描代Ref, 代)) return;
      const draft = 构建变量修复草稿(targets, 指纹);
      合并状态({ 草稿: draft, 草稿Epoch: sessionEpoch });
      await 保存变量修复草稿(draft).catch(() => undefined);
      const controller = new AbortController();
      const holder: 扫描中止持有 = { controller, mode: 'pause' };
      中止Ref.current = holder;
      合并状态({ 扫描中: true, 诊断: null });
      报告队列(`正在扫描 ${targets.length} 个历史回合的变量。`, draft.项[0]?.turn);
      await 逐项扫描(controller, holder, 代);
    })();
  }, [getState, 报告队列, 逐项扫描, 合并状态, sessionEpoch]);

  const 继续 = useCallback(() => {
    if (状态Ref.current.扫描中 || 状态Ref.current.提交中) return;
    const draft = 会话草稿(状态Ref.current, sessionEpoch);
    if (!draft) return;
    if (!draft.项.some((item) => item.status === 'pending' || item.status === 'scanning')) {
      合并状态({ 诊断: '没有待扫描的回合。' });
      return;
    }
    扫描代Ref.current += 1;
    const 代 = 扫描代Ref.current;
    // 不重取指纹：草稿指纹是扫描起点的基态，全批计划与它同值；重取只会让两者漂移。
    const resumed: 变量修复草稿 = { ...draft, state: 'scanning', updatedAt: Date.now() };
    const controller = new AbortController();
    const holder: 扫描中止持有 = { controller, mode: 'pause' };
    中止Ref.current = holder;
    合并状态({ 草稿: resumed, 草稿Epoch: sessionEpoch, 扫描中: true, 诊断: null });
    void 逐项扫描(controller, holder, 代);
  }, [逐项扫描, 合并状态, sessionEpoch]);

  const 暂停 = useCallback(() => {
    const holder = 中止Ref.current;
    if (!holder) return;
    holder.mode = 'pause';
    holder.controller.abort();
  }, []);

  const 取消 = useCallback(() => {
    const holder = 中止Ref.current;
    if (!holder) return;
    holder.mode = 'cancel';
    holder.controller.abort();
  }, []);

  const 清除 = useCallback(() => {
    扫描代Ref.current += 1;
    中止Ref.current?.controller.abort();
    中止Ref.current = null;
    合并状态({ 草稿: null, 诊断: null, 扫描中: false, 提交中: false });
    void 清除变量修复草稿().catch(() => undefined);
  }, [合并状态]);

  const 提交选择 = useCallback(async (selection: Record<string, string[]>) => {
    const draft = 会话草稿(状态Ref.current, sessionEpoch);
    if (!draft || 状态Ref.current.提交中 || 状态Ref.current.扫描中) return;
    const targets = draft.项.filter(
      (item): item is 变量修复草稿项 & { 计划: 变量修复计划 } =>
        item.status === 'ready' && item.计划 !== undefined && 选择值(selection, item.targetMessageId).length > 0,
    );
    if (targets.length === 0) return;
    合并状态({ 提交中: true });
    const failures: string[] = [];
    try {
      // 逐条独立事务：每条计划走自己的 提交变量修复计划（自带 variable_reparse 账本）。
      for (const item of targets) {
        const receipt: 变量修复回执 = await 提交变量修复计划({
          state: getState(),
          plan: item.计划,
          confirmedItemIds: 选择值(selection, item.targetMessageId),
        });
        if (receipt.code === 'OK') continue;
        if (receipt.code === 'BUSY') {
          合并状态({ 诊断: '当前有任务进行中，提交已暂停。请等待完成后重试。' });
          return;
        }
        failures.push(`第 ${item.turn} 回合：${receipt.detail}`);
      }
    } finally {
      合并状态({ 提交中: false });
    }
    if (failures.length > 0) {
      合并状态({ 诊断: failures.join('；') });
      return;
    }
    const completed: 变量修复草稿 = { ...draft, state: 'completed', updatedAt: Date.now() };
    合并状态({ 草稿: completed });
    void 清除变量修复草稿().catch(() => undefined);
  }, [getState, 合并状态, sessionEpoch]);

  return {
    草稿: 状态.草稿Epoch === sessionEpoch ? 状态.草稿 : null,
    扫描中: 状态.草稿Epoch === sessionEpoch && 状态.扫描中,
    提交中: 状态.草稿Epoch === sessionEpoch && 状态.提交中,
    诊断: 状态.诊断,
    开始扫描,
    暂停,
    继续,
    取消,
    提交选择,
    清除,
  };
}
