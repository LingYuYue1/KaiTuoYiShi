import fs from 'node:fs';

// 批次5(D10, 2026-07-26): 力量体系总览由内置世界书迁移为提示词模块 builtin_rule_power_system。
// 本回归改为守卫迁移后的形态:内容常量仍在 builtinWorldbookConfig.ts,模块定义在 builtinPromptModules.ts,
// 旧世界书 id 必须进入清理黑名单且不再出现在内置书白名单。

const source = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const modules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const gameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const promptModel = fs.readFileSync('models/prompts.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  source.includes('export const POWER_SYSTEM_OVERVIEW_CONTENT = `## 力量体系总览'),
  'Power system overview must remain a single exported content block in builtinWorldbookConfig.',
);
assert(
  !source.includes("id: 'builtin_power_system_overview_scale'") && !source.includes('powerSystemOverviewBook'),
  'Power system overview must no longer be generated as a worldbook (migrated to prompt module).',
);
assert(
  modules.includes("id: 'builtin_rule_power_system'") &&
    modules.includes('content: POWER_SYSTEM_OVERVIEW_CONTENT') &&
    modules.includes("title: '力量体系总览'"),
  'Power system overview must be defined as builtin prompt module builtin_rule_power_system.',
);
assert(
  /id: 'builtin_rule_power_system'[\s\S]{0,400}scope: \['main', 'pathAwakening'\]/.test(modules.replace(/\r\n/g, '\n')),
  'Power system module must keep scope main + pathAwakening.',
);
assert(
  promptModel.includes("'builtin_rule_power_system'"),
  'builtin_rule_power_system must be whitelisted in BUILTIN_PROMPT_MODULE_IDS.',
);
assert(
  gameState.includes("'builtin_power_system_overview'"),
  'Legacy power system worldbook id must be listed in REMOVED_LEGACY_WORLDBOOK_IDS for old-save cleanup.',
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

console.log('power system worldbook regression ok');
