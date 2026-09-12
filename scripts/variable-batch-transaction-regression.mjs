// 变量批次 projection / 事实组事务回归。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-batch-transaction-'));
const executorOut = path.join(tempDir, 'executor.mjs');
const factsOut = path.join(tempDir, 'facts.mjs');

const baseState = (npcs = []) => ({
  旅人: { 背包: [] },
  世界: {
    当前地点: '黑塔空间站·收容舱段',
    当前区域ID: 'herta_space_station',
    当前日期: '琥珀纪 2157.01.01',
    当前时间: '08:00',
    开拓天数: 1,
    当前天气: 'clear',
    全局事件: [],
  },
  记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [] },
  NPC: npcs, 新闻: [], 剧情: [],
});

try {
  await build({
    stdin: {
      contents: "export * from './utils/variableExecutor';",
      resolveDir: root,
      sourcefile: 'variable-batch-transaction-executor.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: executorOut,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });
  await build({
    stdin: {
      contents: "export { factsToVariableCommands } from './utils/variableFacts';",
      resolveDir: root,
      sourcefile: 'variable-batch-transaction-facts.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: factsOut,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  const executor = await import(`${pathToFileURL(executorOut).href}?v=${Date.now()}`);
  const facts = await import(`${pathToFileURL(factsOut).href}?v=${Date.now()}`);
  const march = {
    id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', NPC来源: 'canonical', 原著角色: true,
    好感度: 1, 关系: 'acquaintance', 同行: false, 初见回合: 1, 最近回合: 1,
    备注: [], 约定: [], 同行记忆: [], 共同经历: [], 未完成事项: [], 未解决冲突: [], 必须记得: [], 禁止遗忘: [],
  };

  const groupedFailure = executor.reduceVariableCommands([
    { action: 'set', key: 'NPC[id=npc_march7th].好感度', value: 20, factGroupId: 'group-failed' },
    { action: 'set', key: 'NPC[id=npc_march7th].字段不存在', value: 'bad', factGroupId: 'group-failed' },
    { action: 'set', key: '世界.当前时间', value: '08:30', factGroupId: 'group-independent' },
  ], baseState([march]));
  assert(groupedFailure.nextState.NPC[0].好感度 === 1, '事实组失败后，组内前一条成功命令必须回滚。');
  assert(groupedFailure.nextState.世界.当前时间 === '08:30', '独立事实组必须在另一组失败时继续执行。');
  assert(groupedFailure.results.some((item) => item.command.factGroupId === 'group-failed' && !item.ok), '失败事实组必须产生拒绝/错误回执。');

  const dependencyFailure = executor.reduceVariableCommands([
    { action: 'set', key: 'NPC[id=npc_march7th].字段不存在', value: 'bad', factGroupId: 'identity-failed' },
    { action: 'set', key: 'NPC[id=npc_march7th].好感度', value: 50, factGroupId: 'ledger-dependent', dependsOnFactGroupIds: ['identity-failed'] },
  ], baseState([march]));
  assert(dependencyFailure.nextState.NPC[0].好感度 === 1, '依赖失败组不得读取或写入半成品状态。');
  assert(dependencyFailure.results.some((item) => item.command.factGroupId === 'ledger-dependent' && !item.ok), '依赖事实组必须被明确拒绝。');

  const canonicalPreflight = executor.reduceVariableCommands([
    { action: 'set', key: 'NPC[id=march7th].字段不存在', value: 'bad', factGroupId: 'invalid-canonical' },
  ], baseState([]));
  assert(canonicalPreflight.nextState.NPC.length === 0, 'canonical NPC 不能在无效路径校验前被预建。');

  const projected = facts.factsToVariableCommands([
    { type: 'item', action: 'gain', category: 'key', name: '临时权限卡', evidence: '取得临时权限卡' },
    { type: 'npc', name: '三月七', memory: '与玩家确认撤离路线。' },
    { type: 'time', mode: 'elapsed', minutes: 30 },
  ], baseState([]), 2, { phoneSeedsEnabled: false, operationSourceId: 'projection-regression' });
  assert(projected.commands.length > 0, '乱序事实必须仍能生成可执行命令。');
  const groupIds = new Set(projected.commands.map((command) => command.factGroupId));
  assert([...groupIds].every((id) => typeof id === 'string' && id.length > 0), '每条事实命令必须携带事实组 ID。');
  const reducedProjection = executor.reduceVariableCommands(projected.commands, baseState([]));
  assert(reducedProjection.nextState.世界.当前时间 === '08:30', '时间事实必须先投影，后续事实才能看到新时间。');
  assert(reducedProjection.nextState.NPC.length === 1, '身份事实必须先于 NPC 账本事实完成投影。');
  assert(reducedProjection.nextState.旅人.背包[0].获得时间.endsWith('08:30'), '物品获得时间必须使用同批已投影时间。');

  console.log('VARIABLE_BATCH_TRANSACTION_REGRESSION_OK');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
