import type { 角色数据结构 } from '@/models/character';
import type { 解析后回复 } from '@/models/chat';
import { 归一化世界状态, type 世界状态 } from '@/models/world';
import { 解析命途ID, 应用狭间结果 } from '@/src/kernel/domain/path/pathOperations';
import { 解析天气标签, 验证天气合法性 } from '@/data/weatherRules';
import { appendWorldEvents } from '@/utils/worldEvents';

export function reduceWorldState(input: Readonly<{
  world: 世界状态;
  traveler: 角色数据结构;
  parsed: 解析后回复;
  rawResponse: string;
}>): Readonly<{ world: 世界状态; traveler: 角色数据结构 }> {
  let world = 归一化世界状态(input.world);
  let traveler = input.traveler;
  if (input.parsed.worldEvents.length) {
    world = { ...world, 全局事件: appendWorldEvents(world.全局事件, input.parsed.worldEvents) };
  }
  if (input.parsed.awakenInvite?.trim()) {
    if (world.待触发狭间 || world.进行中狭间) throw new Error('Awakening invitation conflicts with an existing awakening state');
    const pathId = 解析命途ID(input.parsed.awakenInvite);
    if (!pathId) throw new Error(`Cannot parse awakening invitation: ${input.parsed.awakenInvite}`);
    if (!traveler.命途列表?.find((path) => path.id === pathId)?.待升阶) {
      throw new Error(`Awakening invitation target is not ready: ${pathId}`);
    }
    world = { ...world, 待触发狭间: pathId };
  }
  if (input.parsed.awakenJudgement?.trim()) {
    const pathId = world.进行中狭间;
    if (!pathId) throw new Error('Awakening judgement has no active path');
    const judgement = input.parsed.awakenJudgement.trim();
    if (!/(升阶|突破|确认|promote|advance|awaken)/i.test(judgement)) {
      throw new Error(`Cannot parse awakening judgement: ${judgement}`);
    }
    const result = 应用狭间结果(traveler, pathId, '升阶');
    if (!result.ok) throw new Error(`Failed to apply awakening judgement: ${result.reason}`);
    traveler = result.traveler;
    world = { ...world, 进行中狭间: undefined };
  }
  const weather = 解析天气标签(input.rawResponse);
  if (weather) {
    if (!验证天气合法性(weather, world.当前地点)) throw new Error(`Weather ${weather} is invalid for ${world.当前地点}`);
    world = { ...world, 当前天气: weather };
  }
  return { world, traveler };
}
