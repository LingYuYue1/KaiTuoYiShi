import { 归一化剧情编织运行时切片, type 世界状态 } from '@/models/world';
import { type 剧情编织系统 } from '@/models/storyWeaving';
import { buildStoryWeavingRuntimeProjection } from '@/services/storyRuntime/storyWeavingRuntimeAdapter';
import { gameTimeOf, mergeProjectionEvents } from '@/hooks/useGame/worldEvolutionWorkflow';

/**
 * 老存档读档迁移：旧档没有 世界.剧情运行时（V3 运行时切片），读档时按旧游标生成初始切片，
 * 让老档立即获得当前焦点与排期世界事件——世界演变/事实物化/新闻联动从读档后即刻工作。
 * - 只做"旧游标 → focus + 排期事件"的只读翻译：不推进剧情、不改游标、不补造旧回合事实
 *   （遵守 r2-central「读档不得推进/重新判断剧情」回归锁定）；
 * - 复用与首回合完全相同的投影/合并/dueAt 逻辑（buildStoryWeavingRuntimeProjection +
 *   mergeProjectionEvents，按 eventInstanceId 去重，后续回合不会重复添加）；
 * - 已有切片的存档（新档/已迁移档）直接通过；无剧情进度的存档跳过（首回合正常流程会自建）。
 */
export function ensureRuntimeSliceForLoadedSave(
  safeWorld: 世界状态,
  nextStoryWeaving: 剧情编织系统,
): 世界状态 {
  if (safeWorld.剧情运行时) return safeWorld;
  if (!nextStoryWeaving?.系列列表?.length) return safeWorld;
  const gameTime = gameTimeOf(safeWorld);
  const projection = buildStoryWeavingRuntimeProjection({
    system: nextStoryWeaving,
    legacyWorldEventStrings: safeWorld.全局事件,
    historyArchives: nextStoryWeaving.当前进度?.历史归档,
  });
  if (!projection) return safeWorld;
  const timelineAnchors = Object.fromEntries(
    projection.scheduledUnits.map((unit) => [unit.unitId, unit.timelineAnchor]),
  );
  const worldEvents = mergeProjectionEvents(
    [],
    projection.scheduledEventInstances,
    gameTime,
    timelineAnchors,
  );
  const nextSlice = 归一化剧情编织运行时切片({
    schemaVersion: 1,
    runtimeBranchId: 'branch:main',
    runtimeRevision: 0,
    focus: projection.currentFocus,
    worldEvents,
    factLedger: [],
    updatedAt: Date.now(),
  });
  return nextSlice ? { ...safeWorld, 剧情运行时: nextSlice } : safeWorld;
}
