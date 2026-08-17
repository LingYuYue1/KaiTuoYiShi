import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import { build } from 'esbuild';

const memoryModel = fs.readFileSync('models/memory.ts', 'utf8');
const settingsSource = fs.readFileSync('models/settings.ts', 'utf8');
const memoryUtils = fs.readFileSync('hooks/useGame/memoryUtils.ts', 'utf8');
const memoryPanel = fs.readFileSync('components/features/GameSystems/MemoryPanel.tsx', 'utf8');

// 阶段1：MEMORY_LAYER_COMPRESSION_THRESHOLD 保留为 15，作为旧版 25/20/10 的迁移目标与运行时兜底默认。
assert.match(memoryModel, /MEMORY_LAYER_COMPRESSION_THRESHOLD = 15/,
  'MEMORY_LAYER_COMPRESSION_THRESHOLD 常量必须保留为 15（旧版迁移目标 + 运行时兜底）。');

// 对标参考项目：默认阈值 即时10（滑动窗口）/短期30/中期50/NPC20。
assert.match(settingsSource, /即时转短期阈值: 10,/);
assert.match(settingsSource, /短期转中期阈值: 30,/);
assert.match(settingsSource, /中期转长期阈值: 50,/);
assert.match(settingsSource, /NPC记忆压缩阈值: 20,/);

// 历史默认组合迁移逻辑保留（usesPreviousLayerDefaults → 迁移到当前默认 10/30/50）。
assert.match(settingsSource, /usesPreviousLayerDefaults/,
  '历史默认组合（25/20/10、15/15/15、10/30/50、15/25/45）必须迁移到当前默认（向前兼容）。');

// 阶段1：memoryUtils 的运行时兜底必须统一读取 MEMORY_LAYER_COMPRESSION_THRESHOLD（>=12 次）。
assert.ok((memoryUtils.match(/MEMORY_LAYER_COMPRESSION_THRESHOLD/g) ?? []).length >= 12,
  '三层手动和自动压缩的默认兜底必须统一读取 15。');

// 阶段1：运行时不得回退到旧的 25/20/10。
assert.doesNotMatch(memoryUtils, /settings\.即时转短期阈值 \|\| 25/,
  '即时转短期运行时不得继续回退到 25。');
assert.doesNotMatch(memoryUtils, /settings\.短期转中期阈值 \|\| settings\.短期转长期阈值 \|\| 20/,
  '短期转中期运行时不得继续回退到 20。');
assert.doesNotMatch(memoryUtils, /settings\.中期转长期阈值 \|\| 10/,
  '中期转长期运行时不得继续回退到 10。');

// 阶段1：MemoryPanel 的三层手动压缩兜底必须统一为 15（>=4 次）。
assert.ok((memoryPanel.match(/MEMORY_LAYER_COMPRESSION_THRESHOLD/g) ?? []).length >= 4,
  '记忆面板的三层手动压缩兜底必须统一为 15。');

const bundled = await build({
  stdin: {
    contents: [
      "export { 创建默认记忆系统设置, 归一化记忆系统设置 } from './models/settings.ts';",
      "export { autoCompressMemorySystem, autoCompressMemorySystemWithArchives, checkCompressionThreshold, checkMiddleTermThreshold, checkLongTermThreshold, MAIN_LONG_TERM_MEMORY_KEEP } from './hooks/useGame/memoryUtils.ts';",
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
  autoCompressMemorySystemWithArchives,
  checkCompressionThreshold,
  checkMiddleTermThreshold,
  checkLongTermThreshold,
  MAIN_LONG_TERM_MEMORY_KEEP,
  创建默认记忆系统设置,
  归一化记忆系统设置,
} = await import(moduleUrl);

// 对标参考项目：新配置的三层压缩阈值对齐（即时10/短期30/中期50）。
const defaults = 创建默认记忆系统设置();
assert.deepEqual(
  [defaults.即时转短期阈值, defaults.短期转中期阈值, defaults.中期转长期阈值],
  [10, 30, 50],
  '新配置的三层压缩阈值必须为 10/30/50（对标参考项目）。',
);
assert.equal(defaults.NPC记忆压缩阈值, 20, 'NPC记忆压缩阈值必须为 20（对齐既定方案）。');

// 历史默认组合全部迁移到当前默认 10/30/50（向前兼容）。
for (const [immediate, short, middle] of [[25, 20, 10], [15, 15, 15], [10, 30, 50], [15, 25, 45]]) {
  const migrated = 归一化记忆系统设置({
    即时转短期阈值: immediate,
    短期转中期阈值: short,
    中期转长期阈值: middle,
    短期转长期阈值: short,
  });
  assert.deepEqual(
    [migrated.即时转短期阈值, migrated.短期转中期阈值, migrated.中期转长期阈值],
    [10, 30, 50],
    `历史默认组合 ${immediate}/${short}/${middle} 必须迁移到当前默认 10/30/50（向前兼容）。`,
  );
}

// 阶段2：NPC 同行记忆历史默认 15（v1.2.x 及更早）迁移到当前默认 20。
const migratedNpc = 归一化记忆系统设置({
  即时转短期阈值: 15,
  短期转中期阈值: 25,
  中期转长期阈值: 45,
  NPC记忆压缩阈值: 15,
});
assert.equal(migratedNpc.NPC记忆压缩阈值, 20, 'NPC 同行记忆历史默认 15 必须迁移到 20。');

// 阶段1：玩家主动设置的非默认阈值必须继续保留。
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

// 阈值检查函数默认用 MEMORY_LAYER_COMPRESSION_THRESHOLD(15) 作为兜底。
const makeItems = (count, prefix) => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
assert.equal(checkCompressionThreshold({ 即时记忆: makeItems(14, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }), false);
assert.equal(checkCompressionThreshold({ 即时记忆: makeItems(15, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }), true);
assert.equal(checkMiddleTermThreshold({ 即时记忆: [], 短期记忆: makeItems(14, 's'), 中期记忆: [], 长期记忆: [] }), false);
assert.equal(checkMiddleTermThreshold({ 即时记忆: [], 短期记忆: makeItems(15, 's'), 中期记忆: [], 长期记忆: [] }), true);
assert.equal(checkLongTermThreshold({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(14, 'm'), 长期记忆: [] }), false);
assert.equal(checkLongTermThreshold({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(15, 'm'), 长期记忆: [] }), true);

// 对标参考项目：autoCompressMemorySystem 只压缩短期→中期、中期→长期（即时层为滑动窗口，不调 AI 压缩）。
// 即时记忆 15 条：即时层不压缩，条目原样保留。
const shortResult = autoCompressMemorySystem({ 即时记忆: makeItems(15, 'i'), 短期记忆: [], 中期记忆: [], 长期记忆: [] }, 10, defaults);
assert.equal(shortResult.即时记忆.length, 15);
assert.equal(shortResult.短期记忆.length, 0);

// 短期记忆 30 条 = 阈值 30 → 触发压缩，batchSize=30，压缩后短期0条，中期+1。
const middleResult = autoCompressMemorySystem({ 即时记忆: [], 短期记忆: makeItems(30, 's'), 中期记忆: [], 长期记忆: [] }, 300, defaults);
assert.equal(middleResult.短期记忆.length, 0);
assert.equal(middleResult.中期记忆.length, 1);

// 中期记忆 50 条 = 阈值 50 → 触发压缩，batchSize=50，压缩后中期0条，长期+1。
const longResult = autoCompressMemorySystem({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(50, 'm'), 长期记忆: [] }, 1500, defaults);
assert.equal(longResult.中期记忆.length, 0);
assert.equal(longResult.长期记忆.length, 1);

// F6：长期记忆保留上限裁剪——长期 15 条（> 12）+ 中期 50 条压缩 +1 后裁剪到 12 条。
assert.equal(MAIN_LONG_TERM_MEMORY_KEEP, 12, '长期记忆保留上限必须为 12（安全网，实际很少触发）。');
const overflowResult = autoCompressMemorySystem({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(50, 'm'), 长期记忆: makeItems(15, 'L') }, 1500, defaults);
assert.equal(overflowResult.长期记忆.length, MAIN_LONG_TERM_MEMORY_KEEP, '长期记忆超过上限必须裁剪到保留上限。');

// F6：带 archives 通道时，超限最旧条目生成忆庭归档条目（信息不丢、可检索）。
const overflowWithArchives = autoCompressMemorySystemWithArchives({ 即时记忆: [], 短期记忆: [], 中期记忆: makeItems(50, 'm'), 长期记忆: makeItems(15, 'L') }, 1500, defaults);
assert.equal(overflowWithArchives.memory.长期记忆.length, MAIN_LONG_TERM_MEMORY_KEEP, '归档通道版本长期记忆同样裁剪到保留上限。');
const longOverflowArchives = overflowWithArchives.archives.filter(
  (entry) => entry.类型 === '长期压缩' && (entry.名称 ?? '').startsWith('【长期纪要'),
);
assert.equal(longOverflowArchives.length, 4, '超限的 4 条最旧长期记忆（16-12）必须生成忆庭归档条目。');
assert.ok(longOverflowArchives.every((entry) => entry.原文?.trim()), '归档条目必须保留完整原文。');

console.log('memory compression threshold regression ok');
