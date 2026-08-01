// 提示词相关回归脚本聚合入口（P0 准备项，2026-07-26 提示词优化计划）
// 用法：pnpm run test:all-prompt
// 清单来源：docs/superpowers/specs/2026-07-26-prompt-optimization-feasibility-review.md §3
import { spawnSync } from 'node:child_process';

const SCRIPTS = [
  'prompt-context-regression.mjs',
  'player-speech-control-regression.mjs',
  'player-speech-guard-regression.mjs',
  'npc-profile-ledger-regression.mjs',
  'npc-memory-continuity-regression.mjs',
  'npc-archive-enrichment-regression.mjs',
  'traveler-profile-guard-regression.mjs',
  'inventory-variable-regression.mjs',
  'equipment-retirement-regression.mjs',
  'affinity-gender-neutral-regression.mjs',
  'nsfw-archive-regression.mjs',
  'opening-preset-regression.mjs',
  'opening-story-alignment-regression.mjs',
  'phone-memory-seed-regression.mjs',
  'phone-main-continuity-regression.mjs',
  'memory-tier-regression.mjs',
  'main-injection-window-regression.mjs',
  'skill-system-regression.mjs',
  'power-system-worldbook-regression.mjs',
  'story-mode-worldbook-injection-regression.mjs',
  'story-weaving-regression.mjs',
  'story-weaving-persistence-behavior-regression.mjs',
  'deepseek-format-stability-regression.mjs',
  'zhiku-character-rebuild-regression.mjs',
  'zhiku-knowledge-migration-regression.mjs',
  'independent-system-prompt-scope-regression.mjs',
  'st-preset-integration-regression.mjs',
  'st-v2-send-workflow-guard-regression.mjs',
];

const results = [];
for (const name of SCRIPTS) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [`scripts/${name}`], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 600_000,
  });
  const ok = r.status === 0;
  results.push({ name, ok, ms: Date.now() - started });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) {
    const tail = (out) => (out || '').trim().split('\n').slice(-12).join('\n');
    console.log('--- stdout 尾部 ---');
    console.log(tail(r.stdout));
    console.log('--- stderr 尾部 ---');
    console.log(tail(r.stderr));
  }
}

const failed = results.filter((x) => !x.ok);
console.log(`\n汇总：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log(`失败：${failed.map((x) => x.name).join(', ')}`);
  process.exit(1);
}
