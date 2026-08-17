import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { build } from 'esbuild';

async function loadBundledModule(entryPoint) {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}

const memoryModel = await loadBundledModule('models/memory.ts');
const memoryUtils = await loadBundledModule('hooks/useGame/memoryUtils.ts');
const memoryCompression = await loadBundledModule('services/memoryCompression.ts');

const exactItems = Array.from({ length: 15 }, (_, index) => `第 ${index + 1} 回合材料\n正文-${index + 1}`);
const snapshot = await memoryModel.serializeMemoryFailureSource(exactItems);
assert.equal(snapshot.itemCount, 15, '快照必须记录完整材料条数。');
assert.deepEqual(await memoryModel.deserializeMemoryFailureSource(snapshot), exactItems, '快照解码后必须逐字一致。');

const emptyMemory = memoryModel.创建空记忆系统();
const settings = {
  启用中短长期API总结: true,
  即时转短期阈值: 15,
  短期转中期阈值: 15,
  中期转长期阈值: 15,
  短期转长期阈值: 15,
  即时转短期提示词: 'short',
  短期转中期提示词: 'middle',
  中期转长期提示词: 'long',
  记忆总结API: { provider: '', baseUrl: '', apiKey: '', model: '', retryCount: 0 },
};
// 对标参考项目：即时层为滑动窗口不调 AI 压缩；失败草稿场景改为「短期→中期」压缩。
const unconfigured = await memoryUtils.autoCompressMemorySystemWithArchivesAsync(
  { ...emptyMemory, 短期记忆: exactItems },
  15,
  settings,
  { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '' },
);
assert.equal(unconfigured.failures.length, 1, 'API 未配置时必须产生一份失败草稿。');
assert.equal(unconfigured.memory.失败草稿.length, 1, '失败草稿必须写回记忆系统。');
assert.deepEqual(unconfigured.failures[0].sourceTurns, { start: 1, end: 15 }, '首批材料必须标记为 1-15 回合。');
assert.deepEqual(
  await memoryModel.deserializeMemoryFailureSource(unconfigured.failures[0].sourceSnapshot),
  exactItems,
  '自动失败草稿必须保存实际送入总结器的完整 15 条材料。',
);
assert.equal(unconfigured.memory.中期记忆.length, 1, '失败时仍应保留本地 fallback，主流程不能中断。');

const localSettings = { ...settings, 启用中短长期API总结: false };
const localResult = await memoryCompression.summarizeMemoryBatch(
  { kind: 'short', turn: 15, items: exactItems, prompt: 'short' },
  localSettings,
  { provider: 'openai_compatible', baseUrl: 'https://invalid.example', apiKey: 'secret', model: 'never-called' },
);
assert.equal(localResult.usedLocal, true, '关闭 API 总结后必须使用本地摘要。');
assert.equal(localResult.usedModel, false, '关闭 API 总结后不得标记为模型调用。');
assert.equal(localResult.failureCode, undefined, '玩家主动选择本地模式不应生成失败草稿。');

const normalized = memoryModel.normalizeMemorySystem({ ...emptyMemory, 失败草稿: unconfigured.failures });
assert.equal(normalized.失败草稿.length, 1, '存档归一化必须保留失败草稿。');

const retrySource = fs.readFileSync('hooks/useGame/memoryUtils.ts', 'utf8');
assert.match(retrySource, /deserializeMemoryFailureSource\(draft\.sourceSnapshot\)/, '重试必须读取失败时的快照。');
assert.doesNotMatch(retrySource, /retryMemoryFailureDraft[\s\S]{0,2500}chatHistory/, '重试不得从当前聊天记录重拼材料。');

console.log('memory failure draft regression ok');
