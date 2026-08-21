// 剧情连续性守卫最小回归：区域/系列失配、候选地点自证、明确跨区确认和旧档 unknown 迁移。
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

const candidateSelfAssertion = api.evaluateStoryContinuity({
  phase: 'post_variable',
  currentRegionId: 'jarilo_vi',
  currentLocation: '贝洛伯格·上层区',
  seriesRegionId: 'jarilo_vi',
  candidateRegionId: 'amphoreus',
  candidateLocation: '翁法罗斯·奥赫玛',
  evidenceText: '系统提示：翁法罗斯的消息传来，但玩家仍在贝洛伯格处理事务。',
});
assert(candidateSelfAssertion.action === 'hold', '仅提到翁法罗斯而无转场时必须 hold');
assert(candidateSelfAssertion.codes.includes('CANDIDATE_REGION_SELF_ASSERTION'), '缺少候选地点自证诊断码');
console.log('✓ 候选地点自证：变量写入翁法罗斯但正文无转场 → hold');

const explicitTransition = api.evaluateStoryContinuity({
  phase: 'post_variable',
  currentRegionId: 'jarilo_vi',
  currentLocation: '贝洛伯格·上层区',
  seriesRegionId: 'jarilo_vi',
  candidateRegionId: 'amphoreus',
  candidateLocation: '翁法罗斯·奥赫玛',
  evidenceText: '列车完成跃迁，我们抵达翁法罗斯的奥赫玛。',
});
assert(explicitTransition.action === 'confirm', '明确跨区域转场应进入确认流程');
assert(explicitTransition.kind === 'cross_region', '明确跨区域转场应标记 cross_region');
console.log('✓ 明确跨区转场：进入 confirm，不自动提交区域');

assert(api.inferStoryRegionId('完全未知的旧档地点') === 'unknown', '未知地点必须迁移为 unknown');
assert(api.inferStoryRegionId('翁法罗斯·奥赫玛') === 'amphoreus', '翁法罗斯地点映射失败');
assert(api.inferStoryRegionId(['黑塔空间站', '仙舟罗浮']) === 'unknown', '多区域索引不得取第一个命中作为硬区域');
console.log('✓ 区域映射：未知 → unknown，奥赫玛 → amphoreus');

await import('node:fs/promises').then((fs) => fs.rm(bundlePath, { force: true }));
console.log('STORY_CONTINUITY_GUARD_REGRESSION_OK');
