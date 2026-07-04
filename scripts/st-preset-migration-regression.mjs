/**
 * ST V1 -> V2 迁移工具回归。
 *
 * 只测试纯函数，不接 useGameState 自动迁移。
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-st-preset-migration-regression');

function cleanTempDir() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function transpileModule(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

cleanTempDir();
transpileModule('utils/stPresetMigration.ts');

const migrationUrl = pathToFileURL(path.join(tempDir, 'utils/stPresetMigration.mjs')).href;
const { migrateSTPresetsV1ToV2 } = await import(migrationUrl);

const settings = {
  currentStPresetId: 'preset_a',
  currentStPresetIdV2: null,
  currentStCharacterId: null,
  stPresetsV2: [],
  stPresets: [
    {
      id: 'preset_a',
      name: '玩家预设A',
      importedAt: 100,
      updatedAt: 200,
      samplingParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
      },
      assistantPrefill: '预填文本',
      worldbookEntries: [{
        id: 'stwi_old',
        title: '匹诺康尼',
        content: '梦境酒店设定',
        type: 'world_lore',
        injectMode: 'keyword_match',
        keywords: ['匹诺康尼'],
        keySecondary: ['梦境酒店'],
        priority: 42,
        enabled: true,
        scope: ['main'],
        createdAt: 100,
        updatedAt: 100,
      }],
      modules: [
        { id: 'st_import_main_1719400000000', title: '主提示词', role: 'system', content: '正文 {{user}}' },
        { id: 'st_import_empty_1719400000000', title: '空', role: 'system', content: '' },
      ],
    },
    {
      id: 'preset_empty',
      name: '空预设',
      importedAt: 100,
      updatedAt: 200,
      modules: [],
    },
  ],
};

const first = migrateSTPresetsV1ToV2(settings);
assert(first.migratedCount === 1, `应迁移 1 套有效预设，实际 ${first.migratedCount}`);
assert(first.skippedCount === 1, `应跳过 1 套空预设，实际 ${first.skippedCount}`);
assert(first.settings.stPresets.length === 2, '迁移不应删除 V1 stPresets');
assert(first.settings.currentStPresetId === 'preset_a', '迁移不应改变 V1 当前预设 id');
assert(first.settings.currentStPresetIdV2 === null, '迁移不应自动激活 V2');
assert(first.settings.stPresetsV2.length === 1, '应生成 1 套 V2 副本');
assert(first.settings.stPresetsV2[0].id === 'preset_a_v2', 'V2 id 应基于 V1 id');
assert(first.settings.stPresetsV2[0].preset.prompts.length === 1, '空内容模块不应迁移为 prompt');
assert(first.settings.stPresetsV2[0].preset.prompt_order[0].order.length === 1, 'prompt_order 应跟 prompts 对齐');
assert(first.idMap.preset_a === 'preset_a_v2', '迁移结果应返回 V1 -> V2 idMap');
assert(first.settings.stPresetsV2[0].preset.temperature === 0.7, '采样参数 temperature 应迁移');
assert(first.settings.stPresetsV2[0].preset.top_p === 0.9, '采样参数 top_p 应迁移');
assert(first.settings.stPresetsV2[0].preset.max_tokens === 2048, '采样参数 max_tokens 应迁移');
assert(first.settings.stPresetsV2[0].preset.assistant_prefill === '预填文本', 'assistantPrefill 应迁移为 assistant_prefill');
assert(Array.isArray(first.settings.stPresetsV2[0].preset.world_info), 'V1 worldbookEntries 应迁移为 V2 world_info');
assert(first.settings.stPresetsV2[0].preset.world_info[0].content === '梦境酒店设定', '迁移后的 world_info 内容应保留');
assert(first.settings.stPresetsV2[0].preset.world_info[0].key[0] === '匹诺康尼', '迁移后的 world_info 关键词应保留');
assert(first.settings.stPresetsV2[0].preset.world_info[0].keysecondary[0] === '梦境酒店', '迁移后的 world_info 次关键词应保留');

const second = migrateSTPresetsV1ToV2(first.settings);
assert(second.migratedCount === 0, '重复迁移应保持幂等，不新增重复 V2');
assert(second.settings.stPresetsV2.length === 1, '重复迁移后 V2 数量不变');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('✓ ST V1 -> V2 迁移工具回归通过');
