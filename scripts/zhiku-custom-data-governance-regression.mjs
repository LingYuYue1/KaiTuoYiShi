import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-custom-governance-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './models/zhiku';",
        "export * from './models/zhikuGovernance';",
        "export * from './data/zhikuCustomGovernance';",
        "export * from './data/zhikuPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-custom-data-governance-entry.ts',
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
  assert(api.ZHIKU_CUSTOM_ID_PREFIX === 'ZZ', 'custom machine id prefix must be ZZ');
  assert(api.ZHIKU_CUSTOM_ID_PATTERN.test('ZZ-000'), 'ZZ-000 must be a valid custom machine id');
  assert(!api.ZHIKU_CUSTOM_ID_PATTERN.test('JS-000'), 'builtin prefixes must not pass the custom id pattern');

  const characterInjectionContent = {
    类型: 'character',
    核心身份与阵营: '自制人物测试身份与阵营',
    独立人格与行为: '自制人物测试人格与行为',
    说话方式: '自制人物测试说话方式',
    台词语料: '自制人物测试台词语料',
    外貌锚点: '自制人物测试外貌锚点',
    当前形态与能力边界: '自制人物测试形态与能力边界',
    精简角色故事: '自制人物测试精简故事',
    演绎红线: '不得误写自制人物',
  };
  const loreInjectionContent = {
    类型: 'lore',
    核心定义: '序号保留测试核心定义',
    关键事实: '序号保留测试关键事实',
    叙事用途: '序号保留测试叙事用途',
    演绎边界: '不得误用序号保留资料',
  };

  const builtin = {
    ...api.创建智库条目({ 标题: '内置人物', 分类: 'character', 原文: '内置正文', 关键词: ['内置人物'], builtin: true }),
    id: 'JS-000',
    资料所有者: 'builtin-json',
    builtin: true,
  };
  const created = api.创建自制智库条目([builtin], {
    标题: '自制人物',
    分类: 'character',
    摘要: '人物摘要',
    原文: '## 角色故事\n自制人物故事。',
    角色故事摘要: '自制人物故事摘要',
    关键词: ['自制人物'],
    外貌锚点: '外貌',
    性格锚点: '性格',
    说话方式: '说话方式',
    行为习惯: '行为习惯',
    关系边界: '关系边界',
    禁止误写: '禁止误写',
    注入内容: characterInjectionContent,
  });
  assert(created.id === 'ZZ-000', `first custom id must be ZZ-000, received ${created.id}`);
  assert(created.资料所有者 === 'custom-user-data', 'new custom data must have the custom owner');
  assert(created.资料版本 === api.ZHIKU_CUSTOM_SCHEMA_VERSION, 'new custom data must use the current schema version');
  assert(created.辅助字段版本 === api.ZHIKU_AUXILIARY_FIELDS_VERSION, 'new custom data must use the current auxiliary-fields version');

  const monotonic = api.创建自制智库条目([created], {
    标题: '序号保留测试',
    分类: 'location',
    原文: '序号保留正文',
    关键词: ['序号保留'],
    注入内容: loreInjectionContent,
  }, 7);
  assert(monotonic.id === 'ZZ-007', 'persisted next sequence must prevent reuse of deleted custom ids');

  const healthy = api.诊断智库条目健康度(created);
  assert(healthy.status === 'healthy' && healthy.score === 100, `complete custom character must be healthy: ${JSON.stringify(healthy)}`);

  const retiredCustom = {
    ...created,
    id: 'zhiku_legacy_custom_character',
    createdAt: 1,
    updatedAt: 1,
    builtin: false,
  };
  assert(api.规范化自制智库条目([retiredCustom], [builtin]).length === 0, 'retired custom IDs must not migrate into V3');

  const collisionEntries = [
    { ...created, id: 'ZZ-005', 标题: '碰撞甲' },
    { ...created, id: 'ZZ-005', 标题: '碰撞乙' },
    { ...created, id: 'JS-000', 标题: '碰撞丙' },
  ];
  const normalizedCollisions = api.规范化自制智库条目(collisionEntries, [builtin]);
  assert(normalizedCollisions.length === 1, 'duplicate or non-ZZ custom identities must be discarded');
  assert(normalizedCollisions[0].id === 'ZZ-005', 'the first valid custom ID must win deterministically');

  const merged = api.composeZhikuSystem(
    { 条目: [builtin] },
    { 条目: [created, retiredCustom] },
  );
  const mergedCustom = merged.条目.filter((entry) => !entry.builtin);
  assert(mergedCustom.length === 1, `only current ZZ custom data may enter V3, received ${mergedCustom.length} custom entries`);
  assert(mergedCustom[0].标题 === '自制人物' && mergedCustom[0].id === 'ZZ-000', 'current V3 custom data must survive composition');
  assert(merged.自制资料契约版本 === api.ZHIKU_CUSTOM_SCHEMA_VERSION, 'custom system contract version must be persisted');
  assert(merged.自制资料下一个序号 === 1, 'custom system must persist the next monotonic sequence');

  const persisted = api.buildPersistedZhikuSystem(merged);
  assert(persisted.条目.length === 1, 'persistence must keep custom data without copying builtin bodies');
  assert(persisted.条目[0].id === 'ZZ-000', 'persisted custom data must keep the stable ZZ id');
  assert(persisted.条目[0].资料所有者 === 'custom-user-data', 'persisted custom owner must remain explicit');
  assert(persisted.自制资料下一个序号 === 1, 'slim persistence must retain the next custom sequence');

  const startupSource = fs.readFileSync(path.join(root, 'hooks/useGameState.ts'), 'utf8');
  assert(startupSource.includes('set智库(buildZhikuCustomSystem(savedZhiku))'), 'startup fallback must use the V3 custom-only recovery contract');
  const customOnlyFallback = api.buildZhikuCustomSystem({
    条目: [
      { ...builtin, 运行时解锁状态: '已解锁' },
      created,
      retiredCustom,
    ],
  });
  assert(customOnlyFallback.条目.length === 1, 'startup fallback must not restore incomplete builtin override placeholders');
  assert(customOnlyFallback.条目[0].id === 'ZZ-000' && customOnlyFallback.条目[0].标题 === '自制人物', 'startup fallback must preserve only current V3 custom data');

  console.log(JSON.stringify({
    customPrefix: api.ZHIKU_CUSTOM_ID_PREFIX,
    schemaVersion: api.ZHIKU_CUSTOM_SCHEMA_VERSION,
    auxiliaryFieldsVersion: api.ZHIKU_AUXILIARY_FIELDS_VERSION,
    normalizedCollisionEntries: normalizedCollisions.length,
  }));
  console.log('ZHIKU_CUSTOM_DATA_GOVERNANCE_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
