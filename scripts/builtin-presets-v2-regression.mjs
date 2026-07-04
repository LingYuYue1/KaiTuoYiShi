/**
 * Built-in Tavern V2 preset registry regression.
 *
 * Legacy adapted V1 prompt-module presets must not be registered as native
 * prompt modules. Shuangrenchenghang and Izumi are allowed only as preserved
 * Tavern V2 built-in presets, keeping the original ST prompt_order /
 * extensions shape.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-builtin-presets-v2-regression');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJsonModule(sourceJsonPath) {
  const raw = fs.readFileSync(path.join(root, sourceJsonPath), 'utf8');
  const outputPath = path.join(tempDir, `${sourceJsonPath}.mjs`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `export default ${raw};\n`, 'utf8');
}

cleanTempDir();
writeJsonModule('data/builtinPresets/shuangrenchenghang.json');
writeJsonModule('data/builtinPresets/izumi.json');
transpileModule('data/builtinPresets/index.ts');
transpileModule('data/builtinPresets/builtinPreset.ts');
transpileModule('hooks/useGame/tavernRegexProcessor.ts');

const presetUrl = pathToFileURL(path.join(tempDir, 'data/builtinPresets/index.mjs')).href;
const { getBuiltinPresets, getBuiltinPresetsV2 } = await import(presetUrl);
const regexUrl = pathToFileURL(path.join(tempDir, 'hooks/useGame/tavernRegexProcessor.mjs')).href;
const { extractTavernRegexScripts } = await import(regexUrl);

const builtinPresets = getBuiltinPresets();
const builtinV2Presets = getBuiltinPresetsV2();

assert(builtinPresets.length === 1, `Only native built-in preset should remain in V1, got ${builtinPresets.length}`);
assert(builtinPresets[0]?.presetType === 'native', 'Remaining V1 built-in preset must be native');
assert(!builtinPresets.some((preset) => preset.presetType === 'adapted'), 'Adapted V1 presets must not be registered as built-ins');
assert(!builtinPresets.some((preset) => /shuang|izumi/i.test(`${preset.id} ${preset.name}`)), 'Shuangrenchenghang / Izumi must not appear in V1 registry');

assert(builtinV2Presets.length === 2, `Shuangrenchenghang and Izumi built-in V2 presets should exist, got ${builtinV2Presets.length}`);
const shuangren = builtinV2Presets.find((preset) => preset.id === 'builtin_shuangrenchenghang_v2');
const izumi = builtinV2Presets.find((preset) => preset.id === 'builtin_izumi_v2');
assert(shuangren, 'Shuangrenchenghang V2 preset must be registered');
assert(izumi, 'Izumi V2 preset must be registered');

assert(shuangren.isBuiltin === true, 'Shuangrenchenghang V2 must be marked builtin');
assert(shuangren.characterId === 100001, 'Shuangrenchenghang V2 must keep the ST prompt_order character_id slot');
assert(shuangren.preset.prompts.length === 250, `Shuangrenchenghang V2 should preserve 250 prompts, got ${shuangren.preset.prompts.length}`);
assert(shuangren.preset.prompt_order[0]?.order.length === 250, 'Shuangrenchenghang V2 should preserve all prompt_order slots');
assert(shuangren.preset.prompt_order[0]?.order.filter((slot) => slot.enabled !== false).length === 78, 'Shuangrenchenghang V2 should preserve enabled slot count');
assert(extractTavernRegexScripts(shuangren.preset).length === 41, 'Shuangrenchenghang V2 should expose 41 extension regex scripts');

assert(izumi.isBuiltin === true, 'Izumi V2 must be marked builtin');
assert(izumi.characterId === 100001, 'Izumi V2 must keep the ST prompt_order character_id slot');
assert(izumi.preset.prompts.length === 204, `Izumi V2 should preserve 204 prompts, got ${izumi.preset.prompts.length}`);
assert(izumi.preset.prompt_order[0]?.order.length === 173, 'Izumi V2 should preserve 173 prompt_order slots');
assert(izumi.preset.prompt_order[0]?.order.filter((slot) => slot.enabled !== false).length === 52, 'Izumi V2 should preserve enabled slot count');
assert(extractTavernRegexScripts(izumi.preset).length === 26, 'Izumi V2 should expose 26 extension regex scripts');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('builtin Tavern V2 preset registry regression ok');
