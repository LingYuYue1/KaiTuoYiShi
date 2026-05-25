import type { 命途ID } from './journey';
import type { 命途进度, 命途阶段 } from './path';

export type 战技槽位类型 = 'normal' | 'path';
export type 战技类别 = '普通' | '命途';

export interface 战技记录 {
  id: string;
  名称: string;
  类别: 战技类别;
  槽位类型: 战技槽位类型;
  槽位序号: number;
  描述: string;
  来源: string;
  关联命途?: 命途ID;
  关联阶段?: 命途阶段;
  关键词?: string[];
  消耗?: string;
  冷却?: string;
  备注?: string;
  已启用?: boolean;
  创建于?: number;
  更新时间?: number;
}

export interface 战技槽位摘要 {
  id: string;
  kind: 战技槽位类型;
  slotIndex: number;
  pathId?: 命途ID;
  pathStage?: 命途阶段;
  occupiedSkillId?: string;
  occupiedSkillName?: string;
  occupiedSkillDescription?: string;
  occupiedSkillEnabled?: boolean;
  unlocked: boolean;
}

export interface 战技模板 {
  id: string;
  名称: string;
  描述: string;
  来源: string;
  关键词: string[];
  推荐消耗: string;
  推荐冷却: string;
  备注: string;
}

export const NORMAL_SKILL_SLOT_COUNT = 3;

export function 计算命途战技槽位数(stage: number): number {
  return Math.max(1, Math.min(5, stage + 1));
}

export function 生成战技槽位摘要(
  paths: 命途进度[] = [],
  skills: 战技记录[] = [],
): 战技槽位摘要[] {
  const result: 战技槽位摘要[] = [];
  const normalSkills = skills.filter((skill) => skill.槽位类型 === 'normal');
  const pathSkills = skills.filter((skill) => skill.槽位类型 === 'path');

  for (let i = 1; i <= NORMAL_SKILL_SLOT_COUNT; i += 1) {
    const skill = normalSkills.find((item) => item.槽位序号 === i);
    result.push({
      id: `normal-${i}`,
      kind: 'normal',
      slotIndex: i,
      occupiedSkillId: skill?.id,
      occupiedSkillName: skill?.名称,
      occupiedSkillDescription: skill?.描述,
      occupiedSkillEnabled: skill?.已启用 !== false,
      unlocked: true,
    });
  }

  for (const path of paths) {
    const unlockedCount = 计算命途战技槽位数(path.阶段);
    for (let i = 1; i <= unlockedCount; i += 1) {
      const skill = pathSkills.find(
        (item) =>
          item.关联命途 === path.id &&
          item.槽位序号 === i,
      );
      result.push({
        id: `${path.id}-${i}`,
        kind: 'path',
        slotIndex: i,
        pathId: path.id,
        pathStage: path.阶段,
        occupiedSkillId: skill?.id,
        occupiedSkillName: skill?.名称,
        occupiedSkillDescription: skill?.描述,
        occupiedSkillEnabled: skill?.已启用 !== false,
        unlocked: true,
      });
    }
  }

  return result;
}

export function 创建战技记录(input: {
  名称: string;
  类别: 战技类别;
  槽位类型: 战技槽位类型;
  槽位序号: number;
  描述: string;
  来源: string;
  关联命途?: 命途ID;
  关联阶段?: 命途阶段;
  关键词?: string[];
  消耗?: string;
  冷却?: string;
  备注?: string;
}): 战技记录 {
  const now = Date.now();
  return {
    id: `skill_${now}_${Math.random().toString(36).slice(2, 8)}`,
    名称: input.名称.trim(),
    类别: input.类别,
    槽位类型: input.槽位类型,
    槽位序号: input.槽位序号,
    描述: input.描述.trim(),
    来源: input.来源.trim(),
    关联命途: input.关联命途,
    关联阶段: input.关联阶段,
    关键词: input.关键词?.filter(Boolean),
    消耗: input.消耗?.trim(),
    冷却: input.冷却?.trim(),
    备注: input.备注?.trim(),
    已启用: true,
    创建于: now,
    更新时间: now,
  };
}

export function 归一化战技记录(skill: 战技记录): 战技记录 {
  return {
    ...skill,
    名称: skill.名称?.trim() || '未命名战技',
    描述: skill.描述?.trim() || '暂无描述',
    来源: skill.来源?.trim() || '未注明来源',
    已启用: skill.已启用 !== false,
    关键词: skill.关键词?.filter(Boolean) ?? [],
  };
}
