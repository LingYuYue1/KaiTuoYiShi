import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-domain-policy-'));

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

const entry = path.join(outDir, 'entry.ts');
await fs.writeFile(entry, `
  export { analyzeVariableTurn } from ${JSON.stringify(path.join(root, 'services/variableTurnAnalysis.ts'))};
  export { assignVariableFactSources, factsToVariableCommands, parseVariableFacts } from ${JSON.stringify(path.join(root, 'utils/variableFacts.ts'))};
  export { applyNsfwVariablePolicy } from ${JSON.stringify(path.join(root, 'utils/variableNsfwPolicy.ts'))};
`, 'utf8');
const outfile = path.join(outDir, 'runtime.mjs');
await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => ({ path: await resolveWorkspaceImport(args.path) }));
    },
  }],
});

const runtime = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

const makeNpc = (patch = {}) => ({
  id: 'npc-test', 姓名: '测试角色', 阶位: 'companion', 好感度: 20, 关系: 'acquaintance',
  亲密关系: false, 同行: false, 初见回合: 1, 最近回合: 1, 备注: [],
  NSFW档案: {
    enabled: true,
    男性身体档案: { 男性器: '已有男性档案' },
    女性身体档案: { 胸部: '已有女性档案' },
  },
  ...patch,
});

const makeState = (npcs = [makeNpc()]) => ({
  旅人: {}, 世界: { 当前日期: '琥珀纪 2157.01.01', 当前时间: '08:00', 开拓天数: 1 },
  记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [], contacts: [] },
  NPC: npcs, 新闻: [], 剧情: [],
});

function factsBlock(facts) {
  return `<变量事实>${JSON.stringify({ facts })}</变量事实>`;
}

function resultFor(analysis, predicate) {
  return analysis.results.find(predicate);
}

// 已有男性档案时，阶段-only patch 不得被男性开关误杀，也不得丢失旧字段。
const stageOnly = runtime.analyzeVariableTurn({
  rawText: factsBlock([{ type: 'nsfw_archive', npcId: 'npc-test', npcName: '测试角色', intimacyStage: '新阶段', evidence: '正文明确更新阶段' }]),
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2',
  nsfwEnabled: true, maleNsfwArchiveEnabled: false, bodyText: '正文明确更新阶段', factSource: '正文',
});
assert.equal(resultFor(stageOnly, (item) => item.kind === 'command' && item.ok)?.ok, true, '阶段-only NSFW patch 应通过男性开关关闭场景');
assert.equal(stageOnly.nextState.NPC[0].NSFW档案?.亲密阶段, '新阶段');
assert.equal(stageOnly.nextState.NPC[0].NSFW档案?.男性身体档案?.男性器, '已有男性档案', '阶段-only 更新不得丢失已有男性档案');

const femaleOnly = runtime.analyzeVariableTurn({
  rawText: factsBlock([{ type: 'nsfw_archive', npcId: 'npc-test', npcName: '测试角色', femaleBodyArchive: { 胸部: '更新后的描述' }, evidence: '正文更新女性档案' }]),
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-female',
  nsfwEnabled: true, maleNsfwArchiveEnabled: false, bodyText: '正文更新女性档案', factSource: '正文',
});
assert.equal(femaleOnly.results.some((item) => item.kind === 'rejected'), false, '女性-only NSFW patch 不应被男性开关误杀');
assert.equal(femaleOnly.nextState.NPC[0].NSFW档案?.女性身体档案?.胸部, '更新后的描述');

const maleOnly = runtime.analyzeVariableTurn({
  rawText: factsBlock([{ type: 'nsfw_archive', npcId: 'npc-test', npcName: '测试角色', maleBodyArchive: { 男性器: '新描述' }, evidence: '正文更新男性档案' }]),
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-male',
  nsfwEnabled: true, maleNsfwArchiveEnabled: false, bodyText: '正文更新男性档案', factSource: '正文',
});
assert.equal(maleOnly.results.some((item) => item.kind === 'rejected' && /男性 NSFW/.test(item.reason ?? '')), true, '男性-only NSFW patch 应被男性开关拒绝');
assert.equal(maleOnly.nextState.NPC[0].NSFW档案?.男性身体档案?.男性器, '已有男性档案');

const globallyDisabled = runtime.analyzeVariableTurn({
  rawText: factsBlock([{ type: 'nsfw_archive', npcId: 'npc-test', npcName: '测试角色', femaleBodyArchive: { 胸部: '不应落库' }, evidence: '正文成人互动' }]),
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-off',
  nsfwEnabled: false, maleNsfwArchiveEnabled: true, bodyText: '正文成人互动', factSource: '正文',
});
assert.equal(globallyDisabled.results.some((item) => item.kind === 'rejected' && /总开关/.test(item.reason ?? '')), true, 'NSFW 总开关关闭时所有 NSFW patch 都应拒绝');

// 混合档案必须按字段分流：男性开关关闭时，普通/女性字段仍可落库，男性字段单独拒绝。
const mixedArchive = runtime.analyzeVariableTurn({
  rawText: factsBlock([{
    type: 'nsfw_archive', npcId: 'npc-test', npcName: '测试角色', intimacyStage: '混合更新阶段',
    femaleBodyArchive: { 胸部: '混合更新女性档案' },
    maleBodyArchive: { 男性器: '混合更新男性档案' },
    evidence: '正文同时更新两类档案',
  }]),
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-mixed',
  nsfwEnabled: true, maleNsfwArchiveEnabled: false, bodyText: '正文同时更新两类档案', factSource: '正文',
});
assert.equal(mixedArchive.nextState.NPC[0].NSFW档案?.亲密阶段, '混合更新阶段', '混合 NSFW patch 的普通字段不得被男性开关吞掉');
assert.equal(mixedArchive.nextState.NPC[0].NSFW档案?.女性身体档案?.胸部, '混合更新女性档案', '混合 NSFW patch 的女性字段不得被男性开关吞掉');
assert.equal(mixedArchive.nextState.NPC[0].NSFW档案?.男性身体档案?.男性器, '已有男性档案', '男性开关关闭时既有男性字段必须保留');
assert.equal(mixedArchive.results.some((item) => item.kind === 'rejected' && /男性 NSFW/.test(item.reason ?? '')), true, '混合 NSFW patch 的男性字段必须单独产生拒绝回执');

// 旧命令的数组下标、未知目标和歧义姓名都必须先解析真实 NPC；无法确认目标时默认拒绝。
const machineTarget = runtime.applyNsfwVariablePolicy([
  { action: 'set', key: 'NPC[0].NSFW档案', value: { 亲密阶段: '不应写入' } },
], { nsfwEnabled: true, maleNsfwArchiveEnabled: true }, [makeNpc({ id: 'npc-machine', 姓名: '机械对象', 介绍: '机器人傀儡' })]);
assert.equal(machineTarget.allowedCommands.length, 0, 'NPC[0] 必须按数组下标解析并命中真实目标屏蔽规则');
assert.equal(machineTarget.rejectedCommands.length, 1, '数组下标命中非人形目标必须拒绝');

const unknownTarget = runtime.applyNsfwVariablePolicy([
  { action: 'set', key: 'NPC[9].NSFW档案', value: { 亲密阶段: '不应写入' } },
], { nsfwEnabled: true, maleNsfwArchiveEnabled: true }, [makeNpc()]);
assert.equal(unknownTarget.allowedCommands.length, 0, '越界 NPC 下标不得放行 NSFW 写入');
assert.match(unknownTarget.rejectedCommands[0]?.reason ?? '', /无法确认|不存在|越界/);

const ambiguousTarget = runtime.applyNsfwVariablePolicy([
  { action: 'set', key: 'NPC[姓名=重复角色].NSFW档案', value: { 亲密阶段: '不应写入' } },
], { nsfwEnabled: true, maleNsfwArchiveEnabled: true }, [
  makeNpc({ id: 'npc-ambiguous-a', 姓名: '重复角色' }),
  makeNpc({ id: 'npc-ambiguous-b', 姓名: '重复角色' }),
]);
assert.equal(ambiguousTarget.allowedCommands.length, 0, '歧义姓名不得擅自选第一条 NPC');
assert.match(ambiguousTarget.rejectedCommands[0]?.reason ?? '', /歧义|无法确认/);

// 旧命令也必须经过同一 policy；路径级男性字段不能漏过总开关。
const legacyFemale = runtime.analyzeVariableTurn({
  rawText: '<变量更新>\nset NPC[id=npc-test].NSFW档案 = {"亲密阶段":"旧命令阶段"}\n</变量更新>',
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-legacy-female',
  nsfwEnabled: true, maleNsfwArchiveEnabled: false, bodyText: '正文', factSource: '正文',
});
assert.equal(legacyFemale.results.some((item) => item.kind === 'command' && item.ok), true, '旧 NSFW 命令应通过共享 policy');
const legacyMale = runtime.analyzeVariableTurn({
  rawText: '<变量更新>\nset NPC[id=npc-test].男性身体档案 = {"男性器":"旧命令男性字段"}\n</变量更新>',
  stateSnapshot: makeState(), turn: 2, operationSourceId: 'turn-2-legacy-male',
  nsfwEnabled: false, maleNsfwArchiveEnabled: true, bodyText: '正文', factSource: '正文',
});
assert.equal(legacyMale.results.some((item) => item.kind === 'rejected' && /总开关/.test(item.reason ?? '')), true, '旧男性字段命令不得绕过 NSFW 总开关');

// 约定事实必须可解析，通讯来源只能来自 recall 证据，混合证据正文优先。
const parsedAgreement = runtime.parseVariableFacts(factsBlock([
  { type: 'agreement', npcName: '测试角色', title: '回传线索', content: '找到线索后通知对方。' },
  { type: 'agreement_status', npcName: '测试角色', agreementId: 'agr-2', title: '旧标题', 新状态: '已履行' },
]));
assert.equal(parsedAgreement.parseErrors.length, 0, 'agreement 与 agreement_status 必须都能被事实解析器识别');
assert.equal(parsedAgreement.facts[1].agreementId, 'agr-2');

const recallOnly = runtime.assignVariableFactSources([
  { type: 'agreement', npcName: '测试角色', title: '回传线索', content: '找到线索后通知对方。' },
], { factSource: '正文', bodyText: '本回合只是整理装备。', recallContext: '历史通讯里约定：找到线索后通知对方。' });
assert.equal(recallOnly[0].factSource, '通讯', '仅被通讯回忆支持的新约定应标为通讯');
const mixed = runtime.assignVariableFactSources([
  { type: 'agreement', npcName: '测试角色', title: '回传线索', content: '找到线索后通知对方。' },
], { factSource: '正文', bodyText: '正文再次确认：找到线索后通知对方。', recallContext: '历史通讯里约定：找到线索后通知对方。' });
assert.equal(mixed[0].factSource, '正文', '正文与通讯同时支持时必须正文优先');

const agreementState = makeState([makeNpc({ 约定: [
  { id: 'agr-1', 标题: '回传线索-空间站', 内容: '内容一', 当前状态: '等待中', 回合: 1 },
  { id: 'agr-2', 标题: '回传线索-列车', 内容: '内容二', 当前状态: '等待中', 回合: 1 },
] })]);
const exactById = runtime.factsToVariableCommands([
  { type: 'agreement_status', npcId: 'npc-test', npcName: '测试角色', agreementId: 'agr-2', title: '完全不同的标题', 新状态: '已履行', factSource: '正文' },
], agreementState, 2, { operationSourceId: 'agreement-turn' });
assert.equal(exactById.warnings.length, 0, '稳定 agreementId 命中时不应产生匹配警告');
assert.equal(exactById.commands.some((item) => item.key.includes('.约定[1].当前状态') && item.value === '已履行'), true, 'agreementId 必须更新精确目标');

const ambiguous = runtime.factsToVariableCommands([
  { type: 'agreement_status', npcId: 'npc-test', npcName: '测试角色', title: '回传线索', 新状态: '已作废', factSource: '正文' },
], agreementState, 2, { operationSourceId: 'agreement-ambiguous' });
assert.equal(ambiguous.commands.some((item) => item.key.includes('.当前状态')), false, '多个模糊约定匹配时不得擅自选第一条');
assert.match(ambiguous.warnings.join('\\n'), /多个约定/);

const recallStatus = runtime.factsToVariableCommands([
  { type: 'agreement_status', npcId: 'npc-test', npcName: '测试角色', agreementId: 'agr-1', title: '回传线索-空间站', 新状态: '已履行', factSource: '通讯' },
], agreementState, 2, { operationSourceId: 'agreement-recall-status' });
assert.equal(recallStatus.commands.length, 0, '通讯回忆不得单独改变约定状态');
assert.match(recallStatus.warnings.join('\\n'), /只能证明既有约定/);

const recallAgreement = runtime.factsToVariableCommands([
  { type: 'agreement', npcId: 'npc-test', npcName: '测试角色', title: '通讯约定', content: '通讯中约定下次联系。', factSource: '通讯' },
], agreementState, 2, { operationSourceId: 'agreement-recall' });
assert.equal(recallAgreement.commands.find((item) => item.key.endsWith('.约定'))?.value?.来源, '通讯', '通讯约定必须保留来源');

console.log('variable domain policy regression ok');
