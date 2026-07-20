import type {
  DeleteSkillEnvelope,
  ExecutionFrame,
  SaveSkillEnvelope,
  SetSkillEnabledEnvelope,
} from '@/src/kernel/contract';
import { 生成战技槽位摘要, 归一化战技记录, type 战技记录 } from '@/models/skill';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* saveSessionSkill(
  envelope: SaveSkillEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const traveler = base.state.story.traveler;
    const current = (traveler.战技列表 ?? []).map(归一化战技记录);
    const slot = 生成战技槽位摘要(traveler.命途列表 ?? [], current).find((candidate) =>
      candidate.kind === envelope.command.slot.kind
      && candidate.slotIndex === envelope.command.slot.index
      && candidate.pathId === envelope.command.slot.pathId,
    );
    if (!slot?.unlocked) return rejected('Skill slot is not unlocked');
    const existing = envelope.command.skillId
      ? current.find((skill) => skill.id === envelope.command.skillId)
      : undefined;
    if (envelope.command.skillId && !existing) return rejected('Skill record not found');
    const skill = buildSkill(envelope, existing);
    const skills = current.filter((candidate) => candidate.id !== skill.id && !sameSlot(candidate, skill));
    return {
      type: 'next',
      state: { story: { ...base.state.story, traveler: { ...traveler, 战技列表: [...skills, skill] } } },
    };
  });
}

export async function* deleteSessionSkill(
  envelope: DeleteSkillEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const traveler = base.state.story.traveler;
    const skills = traveler.战技列表 ?? [];
    if (!skills.some((skill) => skill.id === envelope.command.skillId)) return rejected('Skill record not found');
    return {
      type: 'next',
      state: {
        story: {
          ...base.state.story,
          traveler: { ...traveler, 战技列表: skills.filter((skill) => skill.id !== envelope.command.skillId) },
        },
      },
    };
  });
}

export async function* setSessionSkillEnabled(
  envelope: SetSkillEnabledEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const traveler = base.state.story.traveler;
    const skills = traveler.战技列表 ?? [];
    if (!skills.some((skill) => skill.id === envelope.command.skillId)) return rejected('Skill record not found');
    return {
      type: 'next',
      state: {
        story: {
          ...base.state.story,
          traveler: {
            ...traveler,
            战技列表: skills.map((skill) => skill.id === envelope.command.skillId
              ? { ...skill, 已启用: envelope.command.enabled, 更新时间: envelope.command.updatedAt }
              : skill),
          },
        },
      },
    };
  });
}

function buildSkill(envelope: SaveSkillEnvelope, existing: 战技记录 | undefined): 战技记录 {
  const { draft, slot } = envelope.command;
  return 归一化战技记录({
    id: existing?.id ?? `skill_${envelope.commandId}`,
    名称: draft.name,
    类别: slot.kind === 'normal' ? '普通' : '命途',
    槽位类型: slot.kind,
    槽位序号: slot.index,
    描述: draft.description,
    来源: draft.source,
    关联命途: slot.pathId,
    关联阶段: slot.pathStage,
    关键词: [...draft.keywords],
    消耗: draft.cost,
    冷却: draft.cooldown,
    备注: draft.notes,
    已启用: existing?.已启用 !== false,
    创建于: existing?.创建于 ?? envelope.command.createdAt,
    更新时间: envelope.command.createdAt,
  });
}

function sameSlot(left: 战技记录, right: 战技记录): boolean {
  return left.槽位类型 === right.槽位类型
    && left.槽位序号 === right.槽位序号
    && left.关联命途 === right.关联命途;
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}
