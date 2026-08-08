/**
 * 片 5e 产出（ideal_design.md §1.1 路线图 #2）：C 类工作流瞬时态的唯一管理对象。
 *
 * C 类租客（加载 / 状态条 / 实时召回摘要 / 实时召回全文 / 待结算变量 /
 * 中断工作流 / 会话身份 epoch / 中止控制器引用 / 重roll 上下文引用）全部收拢到
 * activeWorkflow 单一对象；useGameState 不再单独持有这些字段。所有消费方（管线、
 * 组件、保存加载工作流）一律经 state.activeWorkflow 读写。
 *
 * 语义约束（D5，ideal_design.md §1.5「会话身份层」）：
 *  - beginSession（saveLoadWorkflow.ts）是唯一拆除入口：中止旧控制器、清空
 *    reroll 引用、放弃中断工作流与恢复日志、清空全部工作流 UI 投影。本对象
 *    不提供其他整体重置入口。
 *  - sessionEpoch 由 enterSession / handleRestartOpening 单调递增，App 据此
 *    key 重挂载 InputArea（会话本地状态归零）。
 *  - 流式消息留在 streamingMessageStore（单一事实源），本对象不重复建模；
 *    发布侧保留 isCurrentWorkflow 守卫（sendWorkflow / resumeWorkflow 的
 *    rafCoalescedSetter 包装），旧回合不得向新会话发布流式文本。
 *
 * 读写契约：响应式字段走 React state（驱动订阅 UI 重渲染）；非响应式引用
 * （abortControllerRef / rerollContextRef）走 ref，避免每个相位变化整树重渲染。
 */
import { useRef, useState } from 'react';
import type { WorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { TURN_STATUS_IDLE, type TurnStatus } from './turnStatus';

export interface ActiveWorkflowStore {
  /** 主流程 / 续跑 / 后台任务是否在跑（UI 遮罩与发送门）。 */
  loading: boolean;
  /** 输入区状态条的唯一状态源（turnStatus.ts），管线在相位边界写入。 */
  turnStatus: TurnStatus;
  /** 忆庭 / 智库召回的实时摘要（仅用于 loading 期间的即时展示）。 */
  liveRecallSummary: string;
  /** 忆庭 / 智库召回的实时全文（仅用于 loading 期间的即时展示）。 */
  liveRecallFullContent: string;
  /** 变量模型校准正在跑（正文已落地，变量在结算中）。期间禁止发下一轮。 */
  pendingVariable: boolean;
  /** 中断回合的恢复日志（App 中断横幅 / 输入恢复提示的 UI 投影）。 */
  interruptedWorkflow: WorkflowRecoveryJournal | null;
  /** 会话身份标识：单调递增，App 用作文档根 key 重挂载会话本地状态。 */
  sessionEpoch: number;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setTurnStatus: React.Dispatch<React.SetStateAction<TurnStatus>>;
  setLiveRecallSummary: React.Dispatch<React.SetStateAction<string>>;
  setLiveRecallFullContent: React.Dispatch<React.SetStateAction<string>>;
  setPendingVariable: React.Dispatch<React.SetStateAction<boolean>>;
  setInterruptedWorkflow: React.Dispatch<React.SetStateAction<WorkflowRecoveryJournal | null>>;
  setSessionEpoch: React.Dispatch<React.SetStateAction<number>>;

  /** 当前在途工作流的中止控制器（isCurrentWorkflow 身份比较的事实源）。 */
  abortControllerRef: React.RefObject<AbortController | null>;
  /** 重roll 上下文（nonce + 上一版回复），回合间经 ref 传递。 */
  rerollContextRef: React.RefObject<{ nonce: string; previousResponse: string } | null>;
}

/** C 类字段的唯一生产 hook：由 useGameState 调用一次，挂到 state.activeWorkflow。 */
export function useActiveWorkflow(): ActiveWorkflowStore {
  const [loading, setLoading] = useState(false);
  const [turnStatus, setTurnStatus] = useState<TurnStatus>(TURN_STATUS_IDLE);
  const [liveRecallSummary, setLiveRecallSummary] = useState('');
  const [liveRecallFullContent, setLiveRecallFullContent] = useState('');
  const [pendingVariable, setPendingVariable] = useState(false);
  const [interruptedWorkflow, setInterruptedWorkflow] = useState<WorkflowRecoveryJournal | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rerollContextRef = useRef<{ nonce: string; previousResponse: string } | null>(null);

  return {
    loading,
    turnStatus,
    liveRecallSummary,
    liveRecallFullContent,
    pendingVariable,
    interruptedWorkflow,
    sessionEpoch,
    setLoading,
    setTurnStatus,
    setLiveRecallSummary,
    setLiveRecallFullContent,
    setPendingVariable,
    setInterruptedWorkflow,
    setSessionEpoch,
    abortControllerRef,
    rerollContextRef,
  };
}
