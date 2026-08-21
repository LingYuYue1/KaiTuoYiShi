// 变量连续性提交回归：地点被 hold/confirm 时，其他世界变量仍必须保留并正式提交。
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
const guardOut = path.join(tempDir, 'guard.mjs');
const weatherOut = path.join(tempDir, 'weather.mjs');
const executorOut = path.join(tempDir, 'executor.mjs');

try {
  await build({
    stdin: {
      contents: "export * from './services/storyRuntime/storyContinuityGuard';",
      resolveDir: root,
      sourcefile: 'variable-continuity-commit-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: guardOut,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });
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

  const guard = await import(`${pathToFileURL(guardOut).href}?v=${Date.now()}`);
  const weather = await import(`${pathToFileURL(weatherOut).href}?v=${Date.now()}`);
  const executor = await import(`${pathToFileURL(executorOut).href}?v=${Date.now()}`);
  const baseline = {
    当前地点: '黑塔空间站·收容舱段',
    当前区域ID: 'herta_space_station',
  };
  const candidate = {
    ...baseline,
    当前地点: '星穹列车·雅利洛-VI同步轨道',
    当前区域ID: 'jarilo_vi',
    当前时间: '08:45',
    全局事件: ['星穹列车抵达雅利洛-VI'],
  };

  const heldDecision = guard.evaluateStoryContinuity({
    phase: 'post_variable',
    currentRegionId: baseline.当前区域ID,
    currentLocation: baseline.当前地点,
    candidateRegionId: 'jarilo_vi',
    candidateLocation: candidate.当前地点,
    evidenceText: '列车上的人员正在核对降落准备，尚未发生跨区转场。',
  });
  assert(heldDecision.action === 'hold', '没有跨区证据时，地点候选必须 hold。');
  const held = guard.applyStoryContinuityLocation(candidate, baseline, heldDecision);
  assert(held.status === 'held', 'hold 裁决必须标记 held。');
  assert(held.world.当前地点 === baseline.当前地点, 'hold 时正式地点必须保持回合前地点。');
  assert(held.world.当前时间 === '08:45', 'hold 时世界时间不能被地点守卫一起吞掉。');
  assert(held.world.全局事件[0] === '星穹列车抵达雅利洛-VI', 'hold 时世界事件不能被地点守卫一起吞掉。');

  const confirmDecision = guard.evaluateStoryContinuity({
    phase: 'post_variable',
    currentRegionId: baseline.当前区域ID,
    currentLocation: baseline.当前地点,
    candidateRegionId: 'jarilo_vi',
    candidateLocation: candidate.当前地点,
    evidenceText: '星穹列车完成跃迁，抵达雅利洛-VI同步轨道。',
  });
  assert(confirmDecision.action === 'confirm', '有明确跨区证据时，地点候选必须进入 confirm。');
  const confirmed = guard.applyStoryContinuityLocation(candidate, baseline, confirmDecision);
  assert(confirmed.status === 'pending_confirmation', 'confirm 裁决必须标记 pending_confirmation。');
  assert(confirmed.world.当前地点 === baseline.当前地点, '等待确认期间不能提前写入跨区地点。');
  assert(confirmed.world.当前时间 === '08:45', '等待确认期间其他世界变量仍必须保留。');

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
  assert(reduced.nextState.世界.当前地点 === '星穹列车·雅利洛-VI同步轨道', '变量执行器必须保留地点候选。');
  assert(reduced.nextState.世界.当前区域ID === 'jarilo_vi', '地点变更后必须同步当前区域 ID。');

  console.log('VARIABLE_CONTINUITY_COMMIT_REGRESSION_OK');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
