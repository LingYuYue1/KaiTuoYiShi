import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outfile = path.join(root, '.tmp', 'path-expansion-regression.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  stdin: {
    contents: `
      export { paths, getPath } from './data/journeyPresets.ts';
      export { PATH_TRAIT_DEFS, PATH_CORE_BELIEFS } from './models/path.ts';
      export { 解析命途ID } from './services/pathService.ts';
    `,
    resolveDir: root,
    sourcefile: 'path-expansion-regression-entry.ts',
    loader: 'ts',
  },
  alias: { '@': root },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
});

try {
  const runtime = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const expectedNewPaths = [
    ['trailblaze', '开拓', '阿基维利'],
    ['propagation', '繁育', '塔伊兹育罗斯'],
    ['voracity', '贪饕', '奥博洛斯'],
    ['enigmata', '神秘', '迷思'],
    ['equilibrium', '均衡', '互'],
    ['order', '秩序', '太一'],
    ['finality', '终末', '末王'],
    ['beauty', '纯美', '伊德莉拉'],
    ['permanence', '不朽', '龙'],
  ];

  assert.equal(runtime.paths.length, 19, '开局统一命途表应包含无命途与 18 条正式命途');
  assert.equal(new Set(runtime.paths.map((item) => item.id)).size, 19, '命途 ID 不得重复');

  for (const [id, name, aeon] of expectedNewPaths) {
    const definition = runtime.getPath(id);
    assert.ok(definition, `${name}必须进入统一命途预设`);
    assert.equal(definition.name, name, `${id} 中文名必须正确`);
    assert.equal(definition.aeon, aeon, `${name}对应星神必须正确`);
    assert.equal(definition.lines?.length, 2, `${name}必须提供两段星神档案文本`);
    assert.ok(definition.blurb && definition.description, `${name}必须提供开局摘要与完整说明`);

    assert.equal(runtime.PATH_TRAIT_DEFS[id]?.length, 3, `${name}必须提供三个命途特质`);
    assert.equal(runtime.PATH_CORE_BELIEFS[id]?.拷问?.length, 3, `${name}必须提供三道升阶拷问`);
    assert.ok(runtime.PATH_CORE_BELIEFS[id]?.核心, `${name}必须提供升阶核心理念`);

    assert.equal(runtime.解析命途ID(id), id, `${name}英文 ID 必须可被狭间标签解析`);
    assert.equal(runtime.解析命途ID(id.toUpperCase()), id, `${name}英文 ID 必须大小写不敏感`);
    assert.equal(runtime.解析命途ID(name), id, `${name}中文名必须可被狭间标签解析`);
  }

  const wizard = fs.readFileSync(path.join(root, 'components/features/NewGame/NewGameWizard.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'components/features/GameSystems/PathPanel.tsx'), 'utf8');
  assert.ok(wizard.includes('{paths.map((item) =>'), '开局向导必须继续遍历统一命途表');
  assert.ok(panel.includes("ALL_PATHS.filter((p) => p.id !== 'none')"), '命途面板必须展示统一命途表中的全部正式命途');

  console.log('path-expansion regression passed: 19 opening choices, 18 awakenable paths, 9 new paths fully wired.');
} finally {
  fs.rmSync(outfile, { force: true });
}
