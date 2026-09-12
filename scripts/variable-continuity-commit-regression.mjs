// 变量地点提交回归：合法地点事实直接写入，不经过连续性裁决、确认窗或剧情暂停。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-continuity-commit-'));
const weatherOut = path.join(tempDir, 'weather.mjs');
const executorOut = path.join(tempDir, 'executor.mjs');

try {
  await build({
    stdin: {
      contents: "export * from './data/weatherRules';",
      resolveDir: root,
      sourcefile: 'weather-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: weatherOut,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });
  await build({
    stdin: {
      contents: "export * from './utils/variableExecutor';",
      resolveDir: root,
      sourcefile: 'executor-entry.ts',
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

  const weather = await import(`${pathToFileURL(weatherOut).href}?v=${Date.now()}`);
  const executor = await import(`${pathToFileURL(executorOut).href}?v=${Date.now()}`);

  assert(weather.归一化天气ID('暴风雪/极寒') === 'blizzard', '复合天气名必须归一化为 blizzard。');
  assert(weather.解析天气标签('<天气>暴风雪/极寒</天气>') === 'blizzard', '天气标签解析必须支持复合天气名。');

  const variableState = {
    旅人: { 背包: [] },
    世界: { 当前地点: '黑塔空间站·收容舱段', 当前区域ID: 'herta_space_station', 当前日期: '琥珀纪 2157.01.01', 当前时间: '08:00', 开拓天数: 1, 当前天气: 'clear', 全局事件: [] },
    记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [] }, NPC: [], 新闻: [], 剧情: [],
  };
  const reduced = executor.reduceVariableCommands([
    { action: 'set', key: '世界.当前地点', value: '星穹列车·雅利洛-VI同步轨道' },
    { action: 'set', key: '世界.当前时间', value: '08:45' },
  ], variableState);
  assert(reduced.results.every((item) => item.ok), '地点/时间命令预演应成功。');
  assert(reduced.nextState.世界.当前地点 === '星穹列车·雅利洛-VI同步轨道', '变量执行器必须直接写入地点事实。');
  assert(reduced.nextState.世界.当前区域ID === 'jarilo_vi', '地点变更后必须同步当前区域 ID。');

  const sendWorkflow = await fs.readFile(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
  const guardSource = await fs.readFile(path.join(root, 'services/storyRuntime/storyContinuityGuard.ts'), 'utf8');
  for (const forbidden of [
    'continuityVariableDecision',
    'continuityPostDecision',
    'applyStoryContinuityLocation(',
    "phase: 'post_variable'",
    '连续性守卫：地点候选',
    '地点切换等待跨区域确认',
    '地点切换被连续性守卫拦截',
  ]) {
    assert(!sendWorkflow.includes(forbidden), `变量主链仍残留地点守卫：${forbidden}`);
  }
  assert(!guardSource.includes("'post_variable'"), '剧情连续性模块不得再暴露变量后置裁决 phase。');
  assert(!guardSource.includes('candidateLocation'), '剧情连续性模块不得接收变量地点候选。');

  console.log('VARIABLE_CONTINUITY_COMMIT_REGRESSION_OK');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
