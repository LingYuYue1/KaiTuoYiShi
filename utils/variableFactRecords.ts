import type { 变量事实, 变量事实记录 } from '@/models/variableCommand';
import { stableFingerprint, createStableEntityId } from '@/utils/stableFingerprint';
import { canonicalizeJsonValue, JsonValueError } from './jsonValue';
import { matchCanonical } from '@/data/canonicalCharacters';

function factEvidence(fact: 变量事实): string[] {
  const evidence = 'evidence' in fact && typeof fact.evidence === 'string' ? fact.evidence.trim() : '';
  return evidence ? [evidence] : [];
}

const NPC_ID_CANONICAL_NAMES: Record<string, string> = {
  march7th: '三月七',
  march7: '三月七',
  march: '三月七',
  danheng: '丹恒',
  himeko: '姬子',
  welt: '瓦尔特',
  pompom: '帕姆',
  herta: '黑塔',
  asta: '艾丝妲',
  arlan: '阿兰',
  stelle: '星',
  caelus: '穹',
};

function normalizeIdentityText(value: string): string {
  const compact = value
    .replace(/\s+/g, '')
    .replace(/[“”"'·•]/g, '')
    .trim();
  if (!compact) return '';
  const canonical = matchCanonical(value) ?? matchCanonical(compact);
  return (canonical?.name ?? compact).toLowerCase();
}

function normalizeNpcIdToken(value: string): string {
  return value
    .trim()
    .replace(/^npc[_-]?/i, '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
}

/** 变量事实、事实记录与投影依赖共用的 NPC 身份键。 */
export function getVariableNpcIdentity(id?: string, name?: string): string {
  const rawId = typeof id === 'string' ? id.trim() : '';
  if (rawId) {
    const idToken = normalizeNpcIdToken(rawId);
    const canonicalName = NPC_ID_CANONICAL_NAMES[idToken] ?? matchCanonical(rawId)?.name;
    if (canonicalName) return `canonical:${normalizeIdentityText(canonicalName)}`;
    return `id:${idToken || rawId.toLowerCase()}`;
  }
  const rawName = typeof name === 'string' ? name : '';
  const canonical = matchCanonical(rawName);
  return canonical
    ? `canonical:${normalizeIdentityText(canonical.name)}`
    : `name:${normalizeIdentityText(rawName)}`;
}

/** 事实进入记录/投影前的唯一 JSON 边界；对象 undefined 会被省略，数组 undefined 会被拒绝。 */
export function sanitizeVariableFact(fact: 变量事实): 变量事实 {
  const canonical = canonicalizeJsonValue(fact);
  if (!canonical.ok) throw new JsonValueError(canonical.issues);
  return canonical.value as 变量事实;
}

export function getVariableFactEntityKey(fact: 变量事实): string {
  switch (fact.type) {
    case 'npc':
      return getVariableNpcIdentity(fact.id, fact.name);
    case 'agreement':
      return `${getVariableNpcIdentity(fact.npcId, fact.npcName)}::${normalizeIdentityText(fact.title)}`;
    case 'agreement_status':
      return `${getVariableNpcIdentity(fact.npcId, fact.npcName)}::${normalizeIdentityText(fact.agreementId || fact.title)}`;
    case 'nsfw_archive':
      return getVariableNpcIdentity(fact.npcId, fact.npcName);
    case 'phone_seed':
      return `${getVariableNpcIdentity(fact.targetId, fact.targetName)}::${normalizeIdentityText(fact.title)}`;
    case 'item':
      return `${fact.category}::${normalizeIdentityText(fact.name)}`;
    case 'location':
      return normalizeIdentityText(fact.location);
    case 'weather':
      return normalizeIdentityText(fact.weather);
    case 'world_event':
      return normalizeIdentityText(fact.text);
    case 'time':
      return 'world-time';
    case 'traveler_profile':
      return 'traveler-profile';
    default:
      return 'unknown';
  }
}

export function buildVariableFactGroupId(fact: 变量事实, factIndex: number, operationSourceId: string): string {
  const sourceEvidence = fact.sourceEvidenceId?.trim();
  return createStableEntityId('fact_group', [
    operationSourceId,
    ...(sourceEvidence ? [sourceEvidence] : []),
    fact.type,
    getVariableFactEntityKey(fact),
    factEvidence(fact),
    // 普通事实按语义身份保持跨重排稳定；时间事实必须保留原始顺序。
    ...(fact.type === 'time' ? [factIndex] : []),
  ]);
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
      return { type: fact.type, npcId: fact.npcId, agreementId: fact.agreementId, npcName: fact.npcName, title: fact.title, 新状态: fact.新状态 };
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
  sourceEvidenceId?: string;
  producedBy?: 变量事实记录['producedBy'];
}): 变量事实记录[] {
  const source = input.sourceEvidenceId || input.sourceTurnId || input.sourceMessageId || `legacy_turn_${input.sourceTurn}`;
  return input.facts.map((fact, index) => {
    const safeFact = sanitizeVariableFact(fact);
    const factGroupId = safeFact.factGroupId ?? buildVariableFactGroupId(safeFact, safeFact.factIndex ?? index, source);
    const factIndex = safeFact.factIndex ?? index;
    const entityKey = safeFact.entityKey ?? getVariableFactEntityKey(safeFact);
    const recordedFact = sanitizeVariableFact({
      ...safeFact,
      factSource: safeFact.factSource ?? '正文',
      factGroupId,
      factIndex,
      entityKey,
    } as 变量事实);
    const evidence = factEvidence(recordedFact);
    const semanticFingerprint = stableFingerprint(semanticFactValue(recordedFact));
    const fingerprint = stableFingerprint({ source, index: factIndex, type: fact.type, fact: recordedFact });
    const record = {
      id: createStableEntityId('fact', [source, factIndex, fingerprint]),
      fingerprint,
      semanticFingerprint,
      type: safeFact.type,
      fact: recordedFact,
      sourceTurn: input.sourceTurn,
      factSource: recordedFact.factSource,
      factGroupId,
      factIndex,
      entityKey,
      evidence: evidence.map((text) => ({ text, textFingerprint: stableFingerprint(text) })),
      producedBy: input.producedBy ?? 'normal',
      ...(input.sourceTurnId ? { sourceTurnId: input.sourceTurnId } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(recordedFact.sourceEvidenceId ? { sourceEvidenceId: recordedFact.sourceEvidenceId } : {}),
      ...(recordedFact.dependsOnFactGroupIds?.length
        ? { dependsOnFactGroupIds: [...recordedFact.dependsOnFactGroupIds] }
        : {}),
    } satisfies 变量事实记录;
    const canonicalRecord = canonicalizeJsonValue(record);
    if (!canonicalRecord.ok) throw new JsonValueError(canonicalRecord.issues);
    return canonicalRecord.value as 变量事实记录;
  });
}
