import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import { build } from 'esbuild';

const memoryModel = fs.readFileSync('models/memory.ts', 'utf8');
const settingsSource = fs.readFileSync('models/settings.ts', 'utf8');
const memoryUtils = fs.readFileSync('hooks/useGame/memoryUtils.ts', 'utf8');
const memoryPanel = fs.readFileSync('components/features/GameSystems/MemoryPanel.tsx', 'utf8');

assert.match(memoryModel, /MEMORY_LAYER_COMPRESSION_THRESHOLD = 15/,
  '短中长期三层压缩必须共享 15 条统一阈值。');
assert.ok((settingsSource.match(/阈值: MEMORY_LAYER_COMPRESSION_THRESHOLD/g) ?? []).length >= 4,
  '即时、短期、中期及兼容字段的默认阈值必须统一为 15。');
assert.match(settingsSource, /usesPreviousLayerDefaults/,
  '旧版 25/20/10 系统默认组合必须迁移为统一 15。');
assert.ok((memoryUtils.match(/MEMORY_LAYER_COMPRESSION_THRESHOLD/g) ?? []).length >= 12,
  '三层手动和自动压缩的默认兜底必须统一读取 15。');
assert.doesNotMatch(memoryUtils, /settings\.即时转短期阈值 \|\| 25/,
  '即时转短期运行时不得继续回退到 25。');
assert.doesNotMatch(memoryUtils, /settings\.短期转中期阈值 \|\| settings\.短期转长期阈值 \|\| 20/,
  '短期转中期运行时不得继续回退到 20。');
assert.doesNotMatch(memoryUtils, /settings\.中期转长期阈值 \|\| 10/,
  '中期转长期运行时不得继续回退到 10。');
assert.ok((memoryPanel.match(/MEMORY_LAYER_COMPRESSION_THRESHOLD/g) ?? []).length >= 4,
  '记忆面板的三层手动压缩兜底必须统一为 15。');

const bundled = await build({
  stdin: {
    contents: [
      "export { 创建默认记忆系统设置, 归一化记忆系统设置 } from './models/settings.ts';",
      "export { autoCompressMemorySystem, checkCompressionThreshold, checkMiddleTermThreshold, checkLongTermThreshold } from './hooks/useGame/memoryUtils.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'memory-compression-threshold-regression-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const {
  autoCompressMemorySystem,
  checkCompressionThreshold,
  checkMiddleTermThreshold,
  checkLongTermThreshold,
  创建默认记忆系统设置,
  归一化记忆系统设置,
} = await import(moduleUrl);

const defaults = 创建默认记忆系统设置();
assert.deepEqual(
  [defaults.即时转短期阈值, defaults.短期转中期阈值, defaults.中期转长期阈值],
  [15, 15, 15],
  '新配置的三层压缩阈值必须统一为 15。',
);

const migrated = 归一化记忆系统设置({
  即时转短期阈值: 25,
  短期转中期阈值: 20,
  中期转长期阈值: 10,
  短期转长期阈值: 20,
});
assert.deepEqual(
  [migrated.即时转短期阈值, migrated.短期转中期阈值, migrated.中期转长期阈值],
  [15, 15, 15],
  '旧版 25/20/10 系统默认组合必须迁移为 15/15/15。',
);

const custom = 归一化记忆系统设置({
  即时转短期阈值: 12,
  短期转中期阈值: 18,
  中期转长期阈值: 22,
  短期转长期阈值: 18,
});
assert.deepEqual(
  [custom.即时转短期阈值, custom.短期转中期阈值, custom.中期转长期阈值],
  [12, 18, 22],
  '玩家主动设置的非默认阈值必须继续保留。',
);

const makeItems = (count, prefix) => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
assert.equal(checkCompressionThreshold({ 即时记忆: makeItems(14, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }), false);
assert.equal(checkCompressionThreshold({ 即时记忆: makeItems(15, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }), true);
assert.equal(checkMiddleTermThreshold({ 即时记忆: [], 短期记忆: makeItems(14, 's'), 中期记忆: [], 长期记忆: [] }), false);
assert.equal(checkMiddleTermThreshold({ 即时记忆: [], 短期记忆: makeItems(15, 's'), 中期记忆: [], 长期记忆: [] }), true);
assert.equal(checkLongTermThreshold({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(14, 'm'), 长期记忆: [] }), false);
assert.equal(checkLongTermThreshold({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(15, 'm'), 长期记忆: [] }), true);

const shortResult = autoCompressMemorySystem({ 即时记忆: makeItems(15, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }, 15, defaults);
assert.equal(shortResult.即时记忆.length, 0);
assert.equal(shortResult.短期记忆.length, 1);
const middleResult = autoCompressMemorySystem({ 即时记忆: [], 短期记忆: makeItems(15, 's'), 中期记忆: [], 长期记忆: [] }, 225, defaults);
assert.equal(middleResult.短期记忆.length, 0);
assert.equal(middleResult.中期记忆.length, 1);
const longResult = autoCompressMemorySystem({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(15, 'm'), 长期记忆: [] }, 3375, defaults);
assert.equal(longResult.中期记忆.length, 0);
assert.equal(longResult.长期记忆.length, 1);

console.log('memory compression threshold regression ok');
