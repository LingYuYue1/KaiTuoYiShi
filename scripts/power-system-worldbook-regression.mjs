import fs from 'node:fs';

const source = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  source.includes("'builtin_power_system_overview'"),
  'BUILTIN_BOOK_IDS must include the built-in power system worldbook.',
);
assert(
  source.includes('const POWER_SYSTEM_OVERVIEW_CONTENT = `## 力量体系总览'),
  'Power system overview must be a single built-in content block.',
);
assert(
  source.includes("id: 'builtin_power_system_overview'") &&
    source.includes("title: '力量体系总览'"),
  'Power system overview book must be created as its own built-in worldbook.',
);
assert(
  source.includes("id: 'builtin_power_system_overview_scale'") &&
    source.includes('content: POWER_SYSTEM_OVERVIEW_CONTENT'),
  'Power system overview book must contain the scale entry backed by the shared content block.',
);
assert(
  source.includes("type: 'system_rule'") &&
    source.includes("injectMode: 'always'") &&
    source.includes("scope: ['main', 'pathAwakening']"),
  'Power system overview must be an always-injected system rule for main story and path awakening.',
);
assert(
  source.includes('一人敌百 / 敌百 / 小型舰队 / 编队 / 城市军力') &&
    source.includes('默认对标对象是无命途力量的普通士兵'),
  'Combat scale wording must define enemy-count and fleet references as ordinary non-Path military benchmarks.',
);
assert(
  source.includes('不代表可以同时压制同数量的命途行者') &&
    source.includes('不得机械套用人数或军力规模'),
  'Combat scale wording must forbid applying ordinary-force counts to Pathstriders or supernatural units.',
);
assert(
  source.includes('浅涉') &&
    source.includes('践行') &&
    source.includes('深诣') &&
    source.includes('伪令使'),
  'Power system overview must preserve the four Pathstrider tiers.',
);
assert(
  source.includes('powerSystemOverviewBook'),
  'Power system overview book must be returned in builtin worldbook config.',
);

console.log('power system worldbook regression ok');
