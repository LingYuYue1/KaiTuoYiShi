// 一次性体检工具:运行 scripts/ 下全部 *-regression.mjs(排除聚合器自身与 st-preset-integration
// 已内含的子集重复无妨),汇总通过/失败。临时工具,跑完可删。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const all = fs.readdirSync('scripts').filter((f) => f.endsWith('-regression.mjs')).sort();
const results = [];
for (const name of all) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [`scripts/${name}`], { stdio: 'pipe', encoding: 'utf8', timeout: 600_000 });
  const ok = r.status === 0;
  results.push({ name, ok });
  if (!ok) {
    console.log(`FAIL ${name}`);
    const tail = (out) => (out || '').trim().split('\n').slice(-6).join('\n');
    console.log(tail(r.stderr) || tail(r.stdout));
  }
}
const failed = results.filter((x) => !x.ok);
console.log(`\n全量汇总: ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('失败: ' + failed.map((x) => x.name).join(', ')); process.exit(1); }
