import type { 变量事实, 变量事实记录 } from '@/models/variableCommand';
import { stableFingerprint, createStableEntityId } from '@/utils/stableFingerprint';

function factEvidence(fact: 变量事实): string[] {
  const evidence = 'evidence' in fact && typeof fact.evidence === 'string' ? fact.evidence.trim() : '';
  return evidence ? [evidence] : [];
}

function semanticFactValue(fact: 变量事实): unknown {
  switch (fact.type) {
    case 'npc':
      return { type: fact.type, id: fact.id, name: fact.name, memory: fact.memory, recentInteraction: fact.recentInteraction, affinityDelta: fact.affinityDelta, affinitySet: fact.affinitySet, relationshipStage: fact.relationshipStage };
    case 'item':
      return { type: fact.type, name: fact.name, category: fact.category, description: fact.description, quantity: fact.quantity };
    case 'agreement':
      return { type: fact.type, npcId: fact.npcId, npcName: fact.npcName, title: fact.title, content: fact.content };
    case 'agreement_status':
      return { type: fact.type, npcId: fact.npcId, npcName: fact.npcName, title: fact.title, 新状态: fact.新状态 };
    case 'world_event':
      return { type: fact.type, text: fact.text };
    case 'phone_seed':
      return { type: fact.type, targetId: fact.targetId, targetName: fact.targetName, title: fact.title, context: fact.context };
    default:
      return fact;
  }
}

export function buildVariableFactRecords(input: {
  facts: readonly 变量事实[];
  sourceTurn: number;
  sourceTurnId?: string;
  sourceMessageId?: string;
  producedBy?: 变量事实记录['producedBy'];
}): 变量事实记录[] {
  const source = input.sourceTurnId || input.sourceMessageId || `legacy_turn_${input.sourceTurn}`;
  return input.facts.map((fact, index) => {
    const evidence = factEvidence(fact);
    const semanticFingerprint = stableFingerprint(semanticFactValue(fact));
    const fingerprint = stableFingerprint({ source, index, type: fact.type, fact });
    return {
      id: createStableEntityId('fact', [source, index, fingerprint]),
      fingerprint,
      semanticFingerprint,
      type: fact.type,
      fact,
      sourceTurn: input.sourceTurn,
      sourceTurnId: input.sourceTurnId,
      sourceMessageId: input.sourceMessageId,
      evidence: evidence.map((text) => ({ text, textFingerprint: stableFingerprint(text) })),
      producedBy: input.producedBy ?? 'normal',
    };
  });
}
