import type { 游戏设置, API配置项 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import type { MessageProjection, TurnStage } from '@/src/kernel/contract';
import type { TurnExecutionState } from './turnExecutionState';

export type TurnProcessEvent =
  | Readonly<{ type: 'stage.changed'; stage: Exclude<TurnStage, 'preparing-player-message' | 'committing'> }>
  | Readonly<{ type: 'stage.retrying'; stage: 'generating'; attempt: number; limit: number }>
  | Readonly<{ type: 'stream.delta'; text: string }>
  | Readonly<{ type: 'assistant.ready'; message: MessageProjection }>;

export interface SendWorkflowDeps {
  signal?: AbortSignal;
  worldbooks: 世界书[];
  emitProcess?: (event: TurnProcessEvent) => void;
  state: TurnExecutionState;
  gameSettings: 游戏设置;
  getActiveConfig: () => API配置项 | null;
  rerollContext?: {
    nonce: string;
    previousResponse: string;
  } | null;
  /**
   * Cumulative stream preview text for IKernel progress frames.
   * Workflow must not touch UI stores — only this callback.
   * Must not formal-commit.
   */
  onStreamProgress?: (text: string) => void;
}
