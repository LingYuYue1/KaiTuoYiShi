/**
 * 阶段 7：世界/旅人 —— 全局事件追加、命途狭间邀请/评判、天气解析。
 * 纯累积操作，无网络调用。
 *
 * 读 d 字段:
 *   - parsedForDisplay (S5, stage5_replyLanding ~第 132 行)
 *   - rawFullText (S4, sendWorkflow 桥接 rawFullText = result.fullText)
 *   - displayText (S5, stage5_replyLanding ~第 56 行)
 * 写 d 字段: worldAfter (S7), travelerAfter (S7)
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { 归一化世界状态 } from '@/models/world';
import { appendWorldEvents } from '@/utils/worldEvents';
import { 解析命途ID, 应用狭间结果, type 狭间评判 } from '@/services/pathService';
import { 解析天气标签, 验证天气合法性 } from '@/data/weatherRules';

export function stage7_worldTraveler(
  ctx: TurnContext,
  d: TurnDeltas,
): Partial<TurnDeltas> {
  const { state, effectiveWorld } = ctx;
  if (!d.parsedForDisplay || !d.displayText) {
    throw new Error('stage7_worldTraveler: stage5 必须写入 parsedForDisplay 与 displayText');
  }
  const parsedForDisplay = d.parsedForDisplay;
  const displayText = d.displayText;

  let worldAfter: typeof state.世界 = 归一化世界状态(effectiveWorld);
  let travelerAfter: typeof state.旅人 = state.旅人;

  // 7. 全局事件
  if (parsedForDisplay.worldEvents.length) {
    worldAfter = {
      ...worldAfter,
      全局事件: appendWorldEvents(worldAfter.全局事件, parsedForDisplay.worldEvents),
    };
  }

  // 7a. 命途狭间·邀请发出 → 写入 世界.待触发狭间
  //     校验:必须是已踏上 + 待升阶 的命途,才允许邀请落地。AI 偶发误标(把已经过去的命途
  //     又邀请一次)直接静默丢弃。
  if (parsedForDisplay.awakenInvite.trim() && !worldAfter.待触发狭间 && !worldAfter.进行中狭间) {
    const invitedId = 解析命途ID(parsedForDisplay.awakenInvite);
    if (invitedId) {
      const target = travelerAfter.命途列表.find((p) => p.id === invitedId);
      if (target?.待升阶) {
        worldAfter = { ...worldAfter, 待触发狭间: invitedId };
      } else {
        console.warn('[sendWorkflow] 命途狭间邀请被忽略:目标命途未达待升阶状态:', invitedId);
      }
    } else {
      console.warn('[sendWorkflow] 无法解析狭间邀请的命途 ID:', parsedForDisplay.awakenInvite);
    }
  }

  // 7b. 命途狭间·评判落地 → 调用 应用狭间结果,清空 世界.进行中狭间
  if (parsedForDisplay.awakenJudgement.trim() && worldAfter.进行中狭间) {
    const pathId = worldAfter.进行中狭间;
    const judgementRaw = parsedForDisplay.awakenJudgement.trim();
    const judgement: 狭间评判 | null =
      judgementRaw.includes('升阶')
      || judgementRaw.includes('突破')
      || judgementRaw.includes('确认')
      || /promote|advance|awaken/i.test(judgementRaw)
        ? '升阶'
        : null;
    if (judgement) {
      const res = 应用狭间结果(travelerAfter, pathId, judgement);
      if (res.ok) {
        travelerAfter = res.traveler;
      } else {
        console.warn('[sendWorkflow] 应用狭间结果失败:', res.reason);
      }
      // 不论成功失败都清掉 进行中狭间,避免卡死在狭间回合
      worldAfter = { ...worldAfter, 进行中狭间: undefined };
    } else {
      console.warn('[sendWorkflow] 无法识别的狭间评判:', judgementRaw);
    }
  }

  // 天气解析：从 AI 响应中提取 <天气> 标签，写入世界状态
  // 注意:此处 worldAfter.当前地点 仍是本回合开始前的旧地点,变量模型尚未运行。
  // 如果 AI 同回合切地点+换天气(如 黑塔空间站→罗浮 + 星海潮汐),用旧地点校验会误拒。
  // 因此只要天气 ID 合法(解析天气标签 已校验过中文→ID 映射)就直接接受,
  // 地点白名单仅作 prompt 引导,不强制校验。
  const rawResponseTextForTurn = d.rawFullText || displayText;
  const 天气 = 解析天气标签(rawResponseTextForTurn);
  if (天气) {
    if (!验证天气合法性(天气, worldAfter.当前地点)) {
      console.info('[天气] 天气与当前地点白名单不匹配，仍接受（地点可能在本回合由变量模型更新）:', 天气, '| 旧地点:', worldAfter.当前地点);
    }
    worldAfter = { ...worldAfter, 当前天气: 天气 };
  }

  return { worldAfter, travelerAfter };
}
