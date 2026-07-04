import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const presets = [
  ['双人成行', 'data/builtinPresets/shuangrenchenghang.json'],
  ['Izumi', 'data/builtinPresets/izumi.json'],
];

const responseParser = read('services/ai/responseParser.ts');
const regexProcessor = read('hooks/useGame/tavernRegexProcessor.ts');

const protectedProjectTags = [
  '正文',
  '行动选项',
  '短期记忆',
  '动态世界',
  '变量草稿',
  '剧情规划',
  'thinking',
];

const knownStSurfaceTags = [
  'math',
  'Q',
  'WF',
  'Prism',
  'current_event',
  'progress',
  'options',
  'branches',
  'quote',
  'meow_FM',
  'konatan_planning~',
  'konatan_chat',
  'tucao',
  'danmu',
  'htmlcontent',
  'guifan',
  'details',
];

for (const tag of protectedProjectTags) {
  assert(regexProcessor.includes(`'${tag}'`), `regex safety layer must protect project tag ${tag}`);
}

for (const tag of knownStSurfaceTags) {
  assert(responseParser.includes(`'${tag}'`), `response parser must recognize ST surface helper tag ${tag}`);
}

function collectRegexScripts(rawPreset) {
  const raw = rawPreset.extensions?.regex_scripts ?? rawPreset.regex_scripts ?? [];
  return Array.isArray(raw) ? raw : Object.values(raw || {});
}

for (const [name, file] of presets) {
  const preset = JSON.parse(read(file));
  const allOrderSlots = (preset.prompt_order || []).flatMap((group) => group.order || []);
  const enabledIds = new Set(allOrderSlots.filter((slot) => slot.enabled !== false).map((slot) => slot.identifier));
  const prompts = preset.prompts || [];
  assert(prompts.length > 0 && allOrderSlots.length > 0, `${name} must expose raw prompts and prompt_order`);

  const promptsWithTags = prompts.filter((prompt) => /<\s*\/?\s*[A-Za-z_~\u4e00-\u9fff]/.test(String(prompt.content || '')));
  const disabledTaggedPrompts = promptsWithTags.filter((prompt) => !enabledIds.has(prompt.identifier));
  assert(disabledTaggedPrompts.length > 0, `${name} audit must cover disabled prompt entries, not only enabled entries`);

  const allPromptText = prompts.map((prompt) => String(prompt.content || '')).join('\n');
  const allRegexText = collectRegexScripts(preset)
    .map((script) => String(script.findRegex ?? script.find_regex ?? '') + '\n' + String(script.replaceString ?? script.replace_string ?? ''))
    .join('\n');

  for (const tag of knownStSurfaceTags) {
    if (allPromptText.includes(`<${tag}`) || allPromptText.includes(`</${tag}`) || allRegexText.includes(`<${tag}`) || allRegexText.includes(`</${tag}`)) {
      assert(responseParser.includes(`'${tag}'`), `${name} contains ST helper tag ${tag}, parser must clean it from body`);
    }
  }
}

console.log('builtin Tavern preset surface audit ok');
