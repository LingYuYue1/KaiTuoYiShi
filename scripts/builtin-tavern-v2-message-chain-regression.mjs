/**
 * Built-in Tavern V2 runtime message-chain regression.
 *
 * Registry checks are not enough: when a built-in preset is selected, the
 * runtime builder must actually produce API messages that include preset
 * content plus the project's final format/action guards.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-builtin-tavern-v2-message-chain-regression');

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
      resolveJsonModule: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+\.json)['"]/g, (_match, specifier) =>
      `from '${specifier}.mjs'`)
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') || specifier.endsWith('.json') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function writeJsonModule(sourceJsonPath) {
  const raw = fs.readFileSync(path.join(root, sourceJsonPath), 'utf8');
  const outputPath = path.join(tempDir, `${sourceJsonPath}.mjs`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `export default ${raw};\n`, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBuiltInMessages(entry, expectedNameFragment) {
  const messages = buildTavernMessageChain({
    settings,
    preset: entry.preset,
    characterId: entry.characterId,
    chatHistory: [],
    latestUserInput: '检查当前预设是否进入真实 API messages。',
    playerName: '星',
    playerRole: {
      姓名: '星',
      别名: '开拓者',
      性别: '未知',
      年龄: 25,
      生日: '',
      身高: '',
      身份: '星穹列车成员',
      外貌: '灰发金瞳',
      性格: '行动派',
      背景: '',
      专长知识: ['开拓'],
      头像: '',
    },
  });
  const joined = messages.map((msg) => msg.content).join('\n\n');

  assert(messages.length > 0, `${entry.name} should produce runtime messages`);
  assert(joined.includes(expectedNameFragment), `${entry.name} should include recognizable built-in preset content`);
  assert(joined.includes('检查当前预设是否进入真实 API messages。'), `${entry.name} should inject latest user input`);
  assert(joined.includes('项目响应格式保护'), `${entry.name} should keep project response-format guard`);
  assert(joined.includes('项目行动选项保护'), `${entry.name} should keep project action-options guard`);
}

cleanTempDir();
writeJsonModule('data/builtinPresets/shuangrenchenghang.json');
writeJsonModule('data/builtinPresets/izumi.json');
transpileModule('utils/macroEngine.ts');
transpileModule('utils/narrativeRuntimePolicy.ts');
transpileModule('data/builtinPresets/builtinPreset.ts');
transpileModule('data/builtinPresets/index.ts');
transpileModule('hooks/useGame/tavernFormatGuard.ts');
transpileModule('hooks/useGame/tavernMessageChainBuilder.ts');

const presetsUrl = pathToFileURL(path.join(tempDir, 'data/builtinPresets/index.mjs')).href;
const builderUrl = pathToFileURL(path.join(tempDir, 'hooks/useGame/tavernMessageChainBuilder.mjs')).href;
const { getBuiltinPresetsV2 } = await import(presetsUrl);
const { buildTavernMessageChain } = await import(builderUrl);

const settings = {
  stPostProcessMode: '未选择',
  enableActionOptions: true,
  promptModules: [
    { id: 'builtin_world_prompt', content: '项目世界观保护' },
    { id: 'builtin_main_plot_cot', content: '项目 CoT 保护' },
    { id: 'builtin_response_format', content: '项目响应格式保护' },
    { id: 'builtin_action_options', content: '项目行动选项保护' },
    { id: 'builtin_no_control', content: '项目防抢话保护' },
    { id: 'builtin_narrator_persona', content: '项目叙述人格保护' },
    { id: 'builtin_dev_mode', content: '' },
    { id: 'builtin_writing_style', content: '项目文风保护' },
  ],
};
const presets = getBuiltinPresetsV2();
const shuangren = presets.find((entry) => entry.id === 'builtin_shuangrenchenghang_v2');
const izumi = presets.find((entry) => entry.id === 'builtin_izumi_v2');

assert(shuangren, 'Shuangrenchenghang V2 builtin must be available');
assert(izumi, 'Izumi V2 builtin must be available');
assertBuiltInMessages(shuangren, 'living_character_action_baseline');
assertBuiltInMessages(izumi, '剧情无聊的时候**直接跳过时间**');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('builtin Tavern V2 runtime message-chain regression ok');
