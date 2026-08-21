import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'affinity-intimacy-nsfw-'));

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

async function bundle(name, entry) {
  const outfile = path.join(outDir, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
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
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

const [npc, facts, executor, enrichment, policy] = await Promise.all([
  bundle('npc', 'models/npc.ts'),
  bundle('facts', 'utils/variableFacts.ts'),
  bundle('executor', 'utils/variableExecutor.ts'),
  bundle('enrichment', 'utils/npcArchiveEnrichment.ts'),
  bundle('policy', 'utils/nsfwArchivePolicy.ts'),
]);

const boundaryCases = [
  [-50, '敌对'], [-31, '敌对'], [-30, '陌生'], [-1, '陌生'],
  [0, '初见'], [19, '初见'], [20, '熟识'], [49, '熟识'],
  [50, '知己'], [100, '知己'], [101, '生死挚友'], [150, '生死挚友'],
];
for (const [value, expected] of boundaryCases) {
  assert(npc.获取NPC关系阶段(value) === expected, `${value} 应派生为 ${expected}`);
}
assert(npc.限制NPC好感度(-999) === -50, '好感度下限必须是 -50。');
assert(npc.限制NPC好感度(999) === 150, '好感度上限必须是 150。');

const [migrated] = npc.归一化NPC记录列表([{
  id: 'npc_old', 姓名: '旧档角色', 阶位: 'companion', 好感度: 75,
  关系: 'acquaintance', 当前关系阶段: '点头之交', 同行: false,
  初见回合: 1, 最近回合: 5, 备注: [],
}]);
assert(migrated.关系 === 'friend', '旧 +75 档案的兼容关系必须迁移为 friend。');
assert(migrated.当前关系阶段 === '知己', '旧 +75 档案必须显示知己。');

const [customStage] = npc.归一化NPC记录列表([{
  id: 'npc_custom_stage', 姓名: '自定义阶段角色', 阶位: 'companion', 好感度: 75,
  关系: 'friend', 当前关系阶段: '并肩调查中的可靠搭档', 同行: false,
  初见回合: 1, 最近回合: 5, 备注: [],
}]);
assert(customStage.当前关系阶段 === '并肩调查中的可靠搭档', '真正的剧情自定义关系描述必须保留。');

const raw = `<变量事实>{"facts":[{"type":"npc","id":"npc_enemy","name":"测试角色","affinityDelta":30,"intimateRelationship":true,"memory":"双方明确确认恋爱关系。","evidence":"正文明确确认"}]}</变量事实>`;
const parsed = facts.parseVariableFacts(raw);
assert(parsed.parseErrors.length === 0 && parsed.facts[0]?.intimateRelationship === true, '变量事实必须解析亲密关系。');

const initialState = {
  NPC: [{
    id: 'npc_enemy', 姓名: '测试角色', 阶位: 'companion', 好感度: -50,
    关系: 'enemy', 亲密关系: false, 同行: false, 初见回合: 1, 最近回合: 1, 备注: [],
  }],
  世界: {}, 旅人: {}, 记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [] }, 新闻: [], 剧情: [],
};
const generated = facts.factsToVariableCommands(parsed.facts, initialState, 2, { phoneSeedsEnabled: false });
assert(generated.commands.some((command) => command.key === 'NPC[id=npc_enemy].亲密关系' && command.value === true), '亲密关系事实必须生成可执行命令。');
const reduced = executor.reduceVariableCommands(generated.commands, initialState);
assert(reduced.nextState.NPC[0].当前关系阶段 === '陌生', '变量批次内好感变化后必须立即同步标准关系阶段。');
let committedRecords = null;
executor.commitVariableState(reduced.nextState, initialState, {
  set旅人: () => {}, set世界: () => {}, set记忆: () => {}, set忆庭: () => {},
  set智库: () => {}, set手机: () => {}, setNPC: (value) => { committedRecords = value; },
  set新闻: () => {}, set剧情: () => {},
});
assert(Array.isArray(committedRecords), '变量执行器提交阶段必须真实写回 NPC。');
const [committedNpc] = committedRecords;
assert(committedNpc.好感度 === -20, '敌对角色应能正常增加好感度。');
assert(committedNpc.当前关系阶段 === '陌生', '跨过敌对边界后必须自动进入陌生。');
assert(committedNpc.关系 === 'stranger', '旧兼容关系必须随好感阶段同步。');
assert(committedNpc.亲密关系 === true, '亲密关系必须经过变量链路落库。');
assert(npc.格式化NPC关系(committedNpc.好感度, committedNpc.亲密关系) === '陌生 · 亲密关系', '关系展示必须组合阶段与亲密状态。');

const hertaRecords = npc.归一化NPC记录列表([
  { id: 'herta-a', 姓名: '黑塔', 阶位: 'companion', 好感度: 20, 关系: 'acquaintance', 同行: false, 初见回合: 1, 最近回合: 2, 备注: [] },
  { id: 'herta-b', 姓名: 'The Herta', 阶位: 'companion', 好感度: 50, 关系: 'friend', 同行: false, 初见回合: 1, 最近回合: 3, 备注: [] },
]);
assert(hertaRecords.length === 1 && hertaRecords[0].姓名 === '黑塔', '黑塔与 The Herta 必须合并为同一身份。');
assert(policy.getNsfwArchiveBlockReason({ ...hertaRecords[0], 外貌: '常通过傀儡、人偶和投影行动' }, 'The Herta') === null, '黑塔不得被傀儡关键词误拦截。');
assert(policy.getNsfwArchiveBlockReason(undefined, '普通人偶', '机械投影') !== null, '普通人偶仍必须被拦截。');
assert(policy.getNsfwArchiveBlockReason({ 姓名: '史瓦罗' }, '史瓦罗') !== null, '史瓦罗仍必须被拦截。');

const customNpc = {
  id: 'npc_custom', 姓名: '原创伙伴', 阶位: 'companion', 好感度: 20,
  关系: 'acquaintance', 亲密关系: true, 同行: false, 初见回合: 1, 最近回合: 3,
  性别: '女', 备注: [],
};
const enabled = enrichment.enrichNpcArchives([customNpc], { nsfwEnabled: true, maleNsfwArchiveEnabled: false });
assert(enabled.records[0].NSFW档案?.enabled === true, '非智库重要 NPC 在 NSFW 开启时必须获得档案基线。');
assert(enabled.records[0].NSFW档案?.亲密阶段.includes('已建立亲密关系'), '基线必须承接普通亲密关系状态。');
const disabled = enrichment.enrichNpcArchives([{ ...customNpc, NSFW档案: { enabled: true, 经历: ['保留数据'] } }], { nsfwEnabled: false, maleNsfwArchiveEnabled: false });
assert(disabled.records[0].NSFW档案?.经历?.[0] === '保留数据', 'NSFW 关闭时必须保留已有档案数据。');

const [hertaEnriched] = enrichment.enrichNpcArchives(hertaRecords, { nsfwEnabled: true, maleNsfwArchiveEnabled: false }).records;
assert(hertaEnriched.NSFW档案?.enabled === true, '黑塔必须能建立 NSFW 档案基线。');

await fs.rm(outDir, { recursive: true, force: true });
console.log('affinity intimacy nsfw regression ok');
