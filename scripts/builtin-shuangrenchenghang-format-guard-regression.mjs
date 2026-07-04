/**
 * Built-in Tavern preset safety regression.
 *
 * Built-in Tavern presets preserve their original ST structures, but they must
 * not remove the project's final response-format and action-options guards.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const registry = read('data/builtinPresets/index.ts');
const builder = read('hooks/useGame/tavernMessageChainBuilder.ts');
const shuangren = JSON.parse(read('data/builtinPresets/shuangrenchenghang.json'));
const izumi = JSON.parse(read('data/builtinPresets/izumi.json'));

assert(registry.includes('BUILTIN_SHUANGRENCHENGHANG_PRESET_ID'), 'Shuangrenchenghang V2 builtin id must be exported');
assert(registry.includes('BUILTIN_IZUMI_PRESET_ID'), 'Izumi V2 builtin id must be exported');
assert(registry.includes('shuangrenchenghangPreset'), 'Shuangrenchenghang original ST JSON must be registered directly');
assert(registry.includes('izumiPreset'), 'Izumi original ST JSON must be registered directly');

assert(shuangren.prompts?.length === 250, `Shuangrenchenghang must preserve 250 prompts, got ${shuangren.prompts?.length}`);
assert(shuangren.prompt_order?.[0]?.order?.length === 250, 'Shuangrenchenghang must preserve 250 prompt_order slots');
assert(shuangren.prompt_order?.[0]?.order?.filter((slot) => slot.enabled !== false).length === 78, 'Shuangrenchenghang must preserve 78 enabled slots');
assert(shuangren.extensions?.regex_scripts?.length === 41, 'Shuangrenchenghang must preserve 41 extension regex scripts');
assert(!Object.prototype.hasOwnProperty.call(shuangren, 'modules'), 'Shuangrenchenghang builtin must not be the legacy st_import module conversion');

assert(izumi.prompts?.length === 204, `Izumi must preserve 204 prompts, got ${izumi.prompts?.length}`);
assert(izumi.prompt_order?.[0]?.order?.length === 173, 'Izumi must preserve 173 prompt_order slots');
assert(izumi.prompt_order?.[0]?.order?.filter((slot) => slot.enabled !== false).length === 52, 'Izumi must preserve 52 enabled slots');
assert(izumi.extensions?.regex_scripts?.length === 26, 'Izumi must preserve 26 extension regex scripts');
assert(!Object.prototype.hasOwnProperty.call(izumi, 'modules'), 'Izumi builtin must not be the legacy st_import module conversion');

const formatGuardIndex = builder.indexOf("source: 'format_guard'");
const actionOptionsIndex = builder.indexOf('contextPieces.actionOptionsPrompt');
const postProcessIndex = builder.indexOf('return applyTavernPostProcess');
assert(formatGuardIndex > 0, 'Tavern builder must keep project format_guard messages');
assert(actionOptionsIndex > formatGuardIndex, 'Action options guard must be appended after the response format guard block');
assert(postProcessIndex > actionOptionsIndex, 'Post-processing must run after the final action options guard is appended');
assert(builder.includes("content: contextPieces.formatPrompt"), 'Project response format prompt must still be injectable');
assert(builder.includes("content: contextPieces.actionOptionsPrompt"), 'Project action options prompt must still be injectable');

console.log('builtin Tavern format guard regression ok');
