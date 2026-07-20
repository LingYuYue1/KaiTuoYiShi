import type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
import type { PreparedTurnScope } from '@/src/kernel/application/turn/stages/prepareTurnScope';
import { retrieveYitingContextWithModel } from '@/services/yitingRetrieval';
import { retrieveZhikuContextWithModel } from '@/services/zhikuRetrieval';
import { 创建默认记忆系统设置, 创建默认智库系统设置 } from '@/models/settings';

export type RecallContextResult = Readonly<{
  yitingPreview: Awaited<ReturnType<typeof retrieveYitingContextWithModel>> | null;
  zhikuPreview: Awaited<ReturnType<typeof retrieveZhikuContextWithModel>> | null;
  yitingRecallEnabled: boolean;
  zhikuRecallEnabled: boolean;
  yitingEnabled: boolean;
}>;

export async function retrieveRecallContext(
  state: TurnExecutionState,
  scope: PreparedTurnScope,
  worldbookCtx: Readonly<{ recentUserInput: string; npcNames: unknown[] }>,
  recallQuery: string | null,
  zhikuRecallQuery: string | null,
  signal: AbortSignal,
): Promise<RecallContextResult> {
  const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用 !== false;
  const yitingRecallEnabled = yitingEnabled
    && !scope.isOpeningSystemTrigger
    && (state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) < state.turnCount;
  const zhikuRecallEnabled = !scope.isOpeningSystemTrigger
    && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);

  const [yitingPreview, zhikuPreview] = await Promise.all([
    yitingRecallEnabled && state.忆庭 && recallQuery
      ? retrieveYitingContextWithModel(
          state.忆庭,
          recallQuery,
          state.gameSettings.记忆系统?.忆庭召回条数 ?? 8,
          state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
          signal,
          state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 2,
          state.gameSettings.promptModules,
        )
      : Promise.resolve(null),
    zhikuRecallEnabled && zhikuRecallQuery
      ? retrieveZhikuContextWithModel(
          state.智库,
          zhikuRecallQuery,
          state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
          state.gameSettings.智库系统 ?? 创建默认智库系统设置(),
          signal,
          state.gameSettings.智库系统?.api.retryCount ?? 2,
          { ...worldbookCtx } as Record<string, unknown>,
          state.gameSettings.promptModules,
        )
      : Promise.resolve(null),
  ]);
  return { yitingPreview, zhikuPreview, yitingRecallEnabled, zhikuRecallEnabled, yitingEnabled };
}
