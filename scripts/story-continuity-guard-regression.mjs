// 剧情连续性守卫最小回归：只校验剧情编织自身的区域/系列注入一致性。
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `story-continuity-guard-${process.pid}-${Date.now()}.mjs`);
await build({
  stdin: {
    contents: "export * from './services/storyRuntime/storyContinuityGuard';",
    resolveDir: root,
    sourcefile: 'story-continuity-guard-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: bundlePath,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);

const mismatch = api.evaluateStoryContinuity({
  phase: 'pre_request',
  currentRegionId: 'jarilo_vi',
  currentLocation: '贝洛伯格·上层区',
  openingRegionId: 'jarilo_vi',
  seriesRegionId: 'amphoreus',
  seriesTitle: '翁法罗斯英雄纪其一',
});
assert(mismatch.action === 'hold', '贝洛伯格 + 翁法罗斯系列必须 hold');
assert(mismatch.suppressStoryInjection === true, '区域/系列失配必须抑制剧情编织注入');
assert(mismatch.codes.includes('CURRENT_REGION_SERIES_MISMATCH'), '缺少区域/系列失配诊断码');
console.log('✓ 区域/系列失配：jarilo_vi + amphoreus → hold + suppressStoryInjection');

const aligned = api.evaluateStoryContinuity({
  phase: 'pre_request',
  currentRegionId: 'jarilo_vi',
  currentLocation: '贝洛伯格·上层区',
  seriesRegionId: 'jarilo_vi',
});
assert(aligned.action === 'allow', '当前区域与剧情系列一致时必须允许注入');
console.log('✓ 区域/系列一致：允许剧情编织注入');

assert(api.inferStoryRegionId('完全未知的旧档地点') === 'unknown', '未知地点必须迁移为 unknown');
assert(api.inferStoryRegionId('翁法罗斯·奥赫玛') === 'amphoreus', '翁法罗斯地点映射失败');
assert(api.inferStoryRegionId(['黑塔空间站', '仙舟罗浮']) === 'unknown', '多区域索引不得取第一个命中作为硬区域');
console.log('✓ 区域映射：未知 → unknown，奥赫玛 → amphoreus');

await import('node:fs/promises').then((fs) => fs.rm(bundlePath, { force: true }));
console.log('STORY_CONTINUITY_GUARD_REGRESSION_OK');
