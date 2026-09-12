import fs from 'node:fs/promises';
import nodeAssert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(`variable history repair regression failed: ${message}`);
}

const root = process.cwd();
const out = path.join(os.tmpdir(), `variable-history-repair-${process.pid}-${Date.now()}.mjs`);
await build({
  stdin: {
    contents: "export * from './services/variableHistoryRepair'; export * from './utils/variableRepair'; export { analyzeVariableTurn } from './services/variableTurnAnalysis';",
    resolveDir: root,
    sourcefile: 'variable-history-repair-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: out,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

try {
  const api = await import(`${pathToFileURL(out).href}?v=${Date.now()}`);
  const history = [
    { id: 'u1', role: 'user', content: '检查门禁卡', timestamp: 1, gameTime: '3' },
    { id: 'a1', role: 'assistant', content: '你拿到了门禁卡。', timestamp: 2, gameTime: '3' },
    { id: 'u2', role: 'user', content: '继续', timestamp: 3, gameTime: '4' },
    { id: 'a2', role: 'assistant', content: '你确认门禁卡仍在手中。', timestamp: 4, gameTime: '4' },
  ];
  const candidates = api.listVariableHistoryRepairCandidates(history, []);
  if (candidates.length !== 2 || candidates[0].status !== 'missing') throw new Error('缺失批次候选筛选失败');

  const coverageOnlyBatch = {
    id: 'legacy-coverage-only', targetMessageId: 'a1', turn: 3, timestamp: 2,
    results: [{ ok: true, command: { action: 'set', key: '世界.当前天气', value: 'clear' } }],
    coverage: { unresolvedTypes: ['weather'] },
  };
  const coverageOnlyCandidates = api.listVariableHistoryRepairCandidates(history, [coverageOnlyBatch]);
  assert(coverageOnlyCandidates.length === 1 && coverageOnlyCandidates[0].message.id === 'a2', '旧 coverage 不能单独触发历史修复候选');

  const diagnosticFailureBatch = {
    id: 'legacy-diagnostic-failure', targetMessageId: 'a1', turn: 3, timestamp: 2,
    results: [{ ok: true, command: { action: 'set', key: '世界.当前天气', value: 'clear' } }],
    diagnostics: [{ code: 'COMMIT_FAILED', severity: 'error', stage: 'commit', message: 'setter failed' }],
  };
  const diagnosticFailureCandidates = api.listVariableHistoryRepairCandidates(history, [diagnosticFailureBatch]);
  assert(diagnosticFailureCandidates.length === 2 && diagnosticFailureCandidates[0].status === 'failed', '批次级 error diagnostic 必须进入历史修复候选');

  const item = {
    id: 'item-1', category: 'safe', commands: [{ action: 'push', key: '旅人.背包', value: { name: '门禁卡' } }], evidence: [], reason: 'same',
    fact: { id: 'fact-1', fingerprint: 'fact-1', semanticFingerprint: 'semantic-card', type: 'item', fact: { type: 'item', action: 'gain', category: 'key', name: '门禁卡' }, sourceTurn: 3, evidence: [], producedBy: 'history_repair' },
  };
  const makePlan = (id, turn) => ({ id, schemaVersion: 1, mode: 'repair', turn, baseStateFingerprint: 'base', createdAt: turn, analysis: { rawText: '', parsedFacts: { facts: [], parseErrors: [] }, factCommands: { commands: [], notes: [], warnings: [] }, commands: item.commands, results: [], nextState: {}, facts: [item.fact], legacyCommandCount: 0, skippedTravelerProfileLegacyCount: 0 }, items: [{ ...item, id }], safeCommands: item.commands, confirmationCommands: [], conflictItems: [], skippedItems: [] });
  const merged = api.mergeVariableRepairPlans([makePlan('p1', 3), makePlan('p2', 4)]);
  if (merged.items.length !== 1 || merged.safeCommands.length !== 1) throw new Error('跨回合重复事实未去重');

  // 重生成事实命令时 provenance 会变化，但相同 action/key/value 仍只能保留一条。
  const duplicateBaseState = {
    旅人: { 背包: [] },
    世界: { 当前日期: '琥珀纪 2157.01.01', 当前时间: '08:00', 开拓天数: 1, 当前地点: '贝洛伯格·行政区', 当前天气: 'clear', 全局事件: [] },
    记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [], contacts: [] }, NPC: [], 新闻: [], 剧情: [],
  };
  const duplicateSource = api.analyzeVariableTurn({
    rawText: '<变量事实>{"facts":[{"type":"item","action":"gain","category":"key","name":"语义去重门禁卡","quantity":1,"evidence":"正文取得门禁卡"}]}</变量事实>',
    stateSnapshot: {
      ...duplicateBaseState,
    },
    turn: 9,
    operationSourceId: 'original-turn-9',
    sourceTurnId: 'original-turn-9',
    sourceMessageId: 'assistant-9',
    phoneSeedsEnabled: false,
    mode: 'history_repair',
  });
  const alteredProvenanceAnalysis = {
    ...duplicateSource,
    commands: duplicateSource.commands.map((command, index) => ({
      ...command,
      factGroupId: `legacy-group-${index}`,
      sourceEvidenceId: 'legacy-evidence',
    })),
  };
  const provenancePlan = api.buildVariableRepairPlan({
    analysis: alteredProvenanceAnalysis,
    baseState: duplicateBaseState,
    turn: 9,
    mode: 'history_repair',
    turnId: 'repair-turn-9',
    existingBatches: [],
  });
  const semanticKey = (command) => JSON.stringify({
    action: command.action,
    key: command.key,
    value: command.action === 'delete' ? undefined : command.value,
  });
  const plannedCommands = provenancePlan.items.flatMap((item) => item.commands);
  const expectedUniqueCommands = new Set(duplicateSource.commands.map(semanticKey)).size;
  assert(new Set(plannedCommands.map(semanticKey)).size === plannedCommands.length, '历史修复不得因 provenance 不同重复应用同一命令');
  assert(plannedCommands.length === expectedUniqueCommands, `历史修复计划应只保留每条语义命令一次（planned=${plannedCommands.length}, expected=${expectedUniqueCommands}）`);
  const provenanceCommit = api.commitVariableRepairPlan({
    plan: provenancePlan,
    currentState: duplicateBaseState,
    nsfwPolicy: { nsfwEnabled: true, maleNsfwArchiveEnabled: true },
    confirmedItemIds: provenancePlan.items.map((item) => item.id),
    existingBatches: [],
  });
  assert(provenanceCommit.ok, `语义去重后的历史修复应可提交：${provenanceCommit.receipt.message}`);
  assert(provenanceCommit.nextState.旅人.背包.length === 1, '同一事实不得在提交时重复 push');

  // 历史修复必须消费 linker 已经生成的命令，不能根据被修改过的事实记录
  // 再次调用 factsToVariableCommands 重新猜投影。
  const linkerCommand = duplicateSource.factCommands.commands[0];
  const alteredFactAnalysis = {
    ...duplicateSource,
    parsedFacts: {
      ...duplicateSource.parsedFacts,
      facts: duplicateSource.parsedFacts.facts.map((fact) => ({
        ...fact,
        name: '事实侧改写门禁卡',
      })),
    },
    facts: duplicateSource.facts.map((fact) => ({
      ...fact,
      fact: { ...fact.fact, name: '事实侧改写门禁卡' },
    })),
  };
  const linkerOnlyPlan = api.buildVariableRepairPlan({
    analysis: alteredFactAnalysis,
    baseState: duplicateBaseState,
    turn: 9,
    mode: 'history_repair',
    turnId: 'linker-only-history-repair',
    existingBatches: [],
  });
  const linkerOnlyCommands = linkerOnlyPlan.items.flatMap((item) => item.commands);
  assert(linkerOnlyCommands.length === 1, '历史修复应保留 linker 的唯一命令');
  nodeAssert.deepEqual(linkerOnlyCommands[0].value, linkerCommand.value, '历史修复必须使用 linker 命令值');
  assert(linkerOnlyCommands[0].value.名称 === '语义去重门禁卡', '历史修复不得按改写后的事实重新投影');

  const nsfwState = {
    ...duplicateSource.nextState,
    NPC: [{
      id: 'npc-history-nsfw', 姓名: '历史私密角色', 阶位: 'companion', 好感度: 20, 关系: 'friend',
      亲密关系: true, 同行: false, 初见回合: 1, 最近回合: 8, 备注: [],
      NSFW档案: { enabled: true, 年龄确认: 'adult' },
    }],
  };
  const nsfwAnalysis = api.analyzeVariableTurn({
    rawText: '<变量事实>{"facts":[{"type":"nsfw_archive","npcId":"npc-history-nsfw","npcName":"历史私密角色","femaleBodyArchive":{"胸部":"历史记录"},"evidence":"历史正文明确支持"}]}</变量事实>',
    stateSnapshot: nsfwState,
    turn: 10,
    operationSourceId: 'history-nsfw-10',
    sourceTurnId: 'history-nsfw-10',
    sourceMessageId: 'assistant-nsfw-10',
    phoneSeedsEnabled: false,
    nsfwEnabled: true,
    maleNsfwArchiveEnabled: true,
    factSource: '历史正文',
    mode: 'history_repair',
  });
  const disabledPreview = api.buildVariableRepairPlan({
    analysis: nsfwAnalysis,
    baseState: nsfwState,
    turn: 10,
    mode: 'history_repair',
    turnId: 'history-nsfw-10',
    nsfwPolicy: { nsfwEnabled: false, maleNsfwArchiveEnabled: true },
  });
  assert(disabledPreview.safeCommands.length + disabledPreview.confirmationCommands.length === 0, 'NSFW 关闭时历史修复预览不得暴露可提交命令');
  assert(disabledPreview.skippedItems.some((item) => /NSFW 总开关/.test(item.reason)), '预览必须记录 NSFW policy 拒绝原因');

  const enabledPlan = api.buildVariableRepairPlan({
    analysis: nsfwAnalysis,
    baseState: nsfwState,
    turn: 10,
    mode: 'history_repair',
    turnId: 'history-nsfw-10-enabled',
    nsfwPolicy: { nsfwEnabled: true, maleNsfwArchiveEnabled: true },
  });
  const disabledCommit = api.commitVariableRepairPlan({
    plan: enabledPlan,
    currentState: nsfwState,
    confirmedItemIds: enabledPlan.items.map((item) => item.id),
    existingBatches: [],
    nsfwPolicy: { nsfwEnabled: false, maleNsfwArchiveEnabled: true },
  });
  assert(!disabledCommit.ok && disabledCommit.receipt.code === 'NSFW_POLICY_REJECTED', '提交时关闭 NSFW 开关必须再次拒绝历史修复');
  assert(disabledCommit.nextState === undefined, '提交边界被 policy 拒绝时不得返回可落地 state');

  console.log('variable history repair regression ok');
} finally {
  await fs.rm(out, { force: true });
}
