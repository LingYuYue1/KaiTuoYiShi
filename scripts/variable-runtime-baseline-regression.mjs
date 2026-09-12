import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const count = (source, needle) => source.split(needle).length - 1;

const sendWorkflow = read('hooks/useGame/sendWorkflow.ts');
const useGame = read('hooks/useGame.ts');
const variableModel = read('services/ai/variableModel.ts');
const variableManager = read('components/features/Settings/VariableManager.tsx');
const variableDrawer = read('components/features/Variable/VariableDrawer.tsx');
const promptContract = read('utils/variablePromptContract.ts');
const variableRuntime = read('services/variableRuntime.ts');
const continuityGuard = read('services/storyRuntime/storyContinuityGuard.ts');
const archiveEnrichment = read('utils/npcArchiveEnrichment.ts');

const sourceFence = {
  sendWorkflowAnalyzeCalls: count(sendWorkflow, 'analyzeVariableTurn({'),
  historyRepairAnalyzeCalls: count(useGame, 'analyzeVariableTurn({'),
  sendWorkflowLinkerCalls: count(sendWorkflow, 'linkVariableTurn({'),
  historyRepairLinkerCalls: count(useGame, 'linkVariableTurn({'),
  runtimeAnalyzeCalls: count(variableRuntime, 'analyzeVariableTurn({'),
  sendWorkflowContinuityEvaluations: count(sendWorkflow, 'evaluateStoryContinuity({'),
  sendWorkflowContinuityApplications: count(sendWorkflow, 'applyStoryContinuityLocation('),
  sendWorkflowVariableContinuityDecisions: count(sendWorkflow, 'continuityVariableDecision'),
  sendWorkflowContinuityConfirmationWrites: count(sendWorkflow, 'setStoryContinuityConfirmation({'),
  continuityGuardVariablePhases: count(continuityGuard, "'post_variable'"),
  sendWorkflowWeatherTagWrites: count(sendWorkflow, '解析天气标签('),
  sendWorkflowPhoneFallbackBuilders: count(sendWorkflow, 'buildFallbackPhoneSeed('),
  sendWorkflowPhoneFallbackJobs: count(sendWorkflow, 'runPhoneFallbackJob'),
  variableModelNsfwBaselineRefs: count(variableModel, 'nsfwBaseline'),
  archiveEnrichmentNsfwRefs: count(archiveEnrichment, 'NSFW档案'),
  deferredWorldEmptySetters: count(sendWorkflow, 'set世界: params.deferWorldCommit ? (() => {}) : state.set世界'),
  blockedYitingEmptySetters: count(sendWorkflow, 'set忆庭: params.allowYiting === false ? (() => {}) : state.set忆庭'),
  coverageFollowUpRequests: count(variableModel, "label: '变量模型覆盖复审'"),
  coverageReportsInWorkflow: count(sendWorkflow, 'const coverageReport = coverage ?'),
  coverageUiReads: count(variableDrawer, 'coverage?.unresolvedTypes'),
  editorNullSkeletons: count(variableManager, 'else skeleton[key] = null;'),
};

// P2-B keeps the story-weaving pre-request guard, while variable locations bypass it completely.
const P2B_SOURCE_FENCE = {
  sendWorkflowAnalyzeCalls: 0,
  historyRepairAnalyzeCalls: 0,
  sendWorkflowLinkerCalls: 1,
  historyRepairLinkerCalls: 1,
  runtimeAnalyzeCalls: 1,
  sendWorkflowContinuityEvaluations: 1,
  sendWorkflowContinuityApplications: 0,
  sendWorkflowVariableContinuityDecisions: 0,
  sendWorkflowContinuityConfirmationWrites: 0,
  continuityGuardVariablePhases: 0,
  sendWorkflowWeatherTagWrites: 0,
  sendWorkflowPhoneFallbackBuilders: 0,
  sendWorkflowPhoneFallbackJobs: 0,
  variableModelNsfwBaselineRefs: 0,
  archiveEnrichmentNsfwRefs: 0,
  deferredWorldEmptySetters: 0,
  blockedYitingEmptySetters: 0,
  coverageFollowUpRequests: 0,
  coverageReportsInWorkflow: 0,
  coverageUiReads: 0,
  editorNullSkeletons: 0,
};
assert.deepEqual(sourceFence, P2B_SOURCE_FENCE, '变量调用方 fence 发生漂移；变量地点不得重新接入连续性裁决。');

const writableRoots = ['旅人.背包', '世界', 'NPC', '手机.messageSeeds'];
const serviceOwnedRoots = ['记忆', '忆庭', '智库', '新闻', '剧情', '世界.剧情运行时', '手机.contacts', '手机.conversations', '手机.messages'];
assert.equal(new Set(writableRoots).size, writableRoots.length, '正常可写 root 不得重复。');
assert.equal(new Set(serviceOwnedRoots).size, serviceOwnedRoots.length, 'service-owned root 不得重复。');
assert.equal(writableRoots.filter((root) => serviceOwnedRoots.includes(root)).length, 0, '正常可写 root 与 service-owned root 不得重叠。');

const factFields = {
  traveler_profile: ['identity', 'appearance', 'personality', 'background', 'abilityAdd', 'knowledgeAdd', 'evidence'],
  time: ['mode', 'minutes', 'targetTime', 'evidence'],
  location: ['location', 'evidence'],
  weather: ['weather', 'evidence'],
  npc: [
    'id', 'name', 'alias', 'tier', 'job', 'gender', 'affinityDelta', 'affinitySet', 'relation',
    'intimateRelationship', 'following', 'appearance', 'clothing', 'speechStyle', 'personality',
    'intro', 'playerAddress', 'memory', 'recentInteraction', 'longTermImpression', 'relationshipStage',
    'sharedExperiences', 'openItems', 'unresolvedConflicts', 'mustRemember', 'doNotForget', 'evidence',
  ],
  item: ['action', 'category', 'name', 'description', 'quantity', 'quality', 'stackable', 'source', 'sourceDescription', 'narrativeEffects', 'evidence'],
  world_event: ['text', 'evidence'],
  phone_seed: ['targetType', 'targetId', 'targetName', 'title', 'context', 'triggerType', 'priority', 'relatedNpcIds', 'evidence'],
  nsfw_archive: [
    'npcId', 'npcName', 'enabled', 'ageConfirm', 'intimacyStage', 'boundaries', 'preferences',
    'sensitivePoints', 'taboos', 'femaleBodyArchive', 'maleBodyArchive', 'experiences', 'longTermFacts',
    'tags', 'notes', 'evidence',
  ],
  agreement: ['npcId', 'npcName', 'title', 'content', '约定时间', '后果', 'evidence'],
  agreement_status: ['npcId', 'npcName', 'agreementId', 'title', '新状态', 'evidence'],
};

const contractPairs = new Set(
  [...promptContract.matchAll(/field\('([^']+)', '([^']+)'/g)].map((match) => `${match[1]}.${match[2]}`),
);
const missingContractFields = Object.entries(factFields)
  .flatMap(([factType, fields]) => fields.map((field) => `${factType}.${field}`))
  .filter((pair) => !contractPairs.has(pair))
  .sort();
assert.deepEqual(
  missingContractFields,
  [],
  '变量字段契约必须覆盖每一种正式事实的全部字段。',
);

const factLandings = {
  traveler_profile: { handler: 'legacy-readonly', landing: '旅人核心档案', normal: false, historyRepair: false },
  time: { handler: 'world-time', landing: '世界.当前日期/当前时间/开拓天数', normal: true, historyRepair: false },
  location: { handler: 'world-location', landing: '世界.当前地点/当前区域ID', normal: true, historyRepair: false },
  weather: { handler: 'world-weather', landing: '世界.当前天气', normal: true, historyRepair: false },
  npc: { handler: 'npc-ledger', landing: 'NPC[id]', normal: true, historyRepair: true },
  item: { handler: 'inventory', landing: '旅人.背包', normal: true, historyRepair: true },
  world_event: { handler: 'world-event', landing: '世界.全局事件', normal: true, historyRepair: true },
  phone_seed: { handler: 'phone-seed', landing: '手机.messageSeeds', normal: true, historyRepair: false },
  nsfw_archive: { handler: 'npc-nsfw', landing: 'NPC[id].NSFW档案', normal: true, historyRepair: true },
  agreement: { handler: 'npc-agreement', landing: 'NPC[id].约定', normal: true, historyRepair: true },
  agreement_status: { handler: 'npc-agreement-status', landing: 'NPC[id].约定[id].状态', normal: true, historyRepair: true },
};
assert.deepEqual(Object.keys(factLandings).sort(), Object.keys(factFields).sort(), '每种正式事实都必须有 handler 与最终落点。');

console.log('VARIABLE_RUNTIME_FENCE_OK');
console.log(`source fence: ${JSON.stringify(sourceFence)}`);
console.log(`contract gaps: ${missingContractFields.length}`);
