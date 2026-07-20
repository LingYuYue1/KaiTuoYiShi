import type {
  ExecutionFrame,
  SetCompanionTierEnvelope,
  SetCompanionTravelingEnvelope,
} from '@/src/kernel/contract';
import type { NPC记录 } from '@/models/npc';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* setCompanionTier(
  envelope: SetCompanionTierEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* mutateCompanion(envelope, sessions, (npc) => ({
    ...npc,
    阶位: envelope.command.tier,
    同行: envelope.command.tier === 'companion' ? npc.同行 : false,
  }));
}

export async function* setCompanionTraveling(
  envelope: SetCompanionTravelingEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* mutateCompanion(envelope, sessions, (npc) => {
    if (npc.阶位 !== 'companion') return null;
    return { ...npc, 同行: envelope.command.traveling };
  });
}

async function* mutateCompanion(
  envelope: SetCompanionTierEnvelope | SetCompanionTravelingEnvelope,
  sessions: SessionRepository,
  mutate: (npc: NPC记录) => NPC记录 | null,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const story = base.state.story;
    const index = story.characters.npcs.findIndex((npc) => npc.id === envelope.command.npcId);
    if (index < 0) return rejected('NPC record not found');
    const next = mutate(story.characters.npcs[index]);
    if (!next) return rejected('Only companions can be marked as traveling');
    const records = story.characters.npcs.slice();
    records[index] = next;
    return { type: 'next', state: { story: { ...story, characters: { npcs: records } } } };
  });
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}
