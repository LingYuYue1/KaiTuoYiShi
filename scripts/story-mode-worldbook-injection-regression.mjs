import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

// 剧情模式世界书已整体迁移为提示词模块(builtin_storymode_*)。本脚本改为源码级断言,钉住迁移契约:
// 1. 旧世界书不再产出
// 2. 新模块具备 storyModeGate 四选一 + locked + 新类目
// 3. 注入管线按 storyMode 过滤
// 4. 旧存档残留进入清理名单

const storyModeBooks = read('data/storyModeWorldbooks.ts');
assert(!storyModeBooks.includes('createStoryModeWorldbooks'), '旧世界书构造函数 createStoryModeWorldbooks 必须删除。');
assert(!storyModeBooks.includes('STORY_MODE_BOOK_IDS'), '旧世界书 id 白名单 STORY_MODE_BOOK_IDS 必须删除。');

const presets = read('data/worldbookPresets.ts');
assert(!presets.includes('createStoryModeWorldbooks'), '内置世界书不得再引用剧情模式世界书。');

const builtinBooks = read('data/builtinWorldbookConfig.ts');
const bookIdsBlock = builtinBooks.match(/export const BUILTIN_BOOK_IDS = \[([\s\S]*?)\] as const;/);
assert(bookIdsBlock, 'BUILTIN_BOOK_IDS 必须存在。');
for (const legacyId of ['builtin_story_normal', 'builtin_story_harem', 'builtin_story_romance_alt', 'builtin_story_deep_single']) {
  assert(!bookIdsBlock[1].includes(legacyId), `BUILTIN_BOOK_IDS 不得再含 ${legacyId}。`);
}

const modules = read('data/builtinPromptModules.ts');
const expectations = [
  ['builtin_storymode_normal', "storyModeGate: ['normal']"],
  ['builtin_storymode_harem', "storyModeGate: ['harem']"],
  ['builtin_storymode_romance_alt', "storyModeGate: ['romance_alt']"],
  ['builtin_storymode_deep_single', "storyModeGate: ['deep_single']"],
];
for (const [id, gate] of expectations) {
  assert(modules.includes(`id: '${id}'`), `剧情方向模块 ${id} 必须存在。`);
  assert(modules.includes(gate), `${id} 必须带 ${gate} 门控。`);
  assert(modules.includes("category: 'storymode'"), `${id} 必须归入 storymode 类目。`);
  assert(modules.includes('locked: true'), `${id} 必须锁定不可关。`);
}

const prompts = read('models/prompts.ts');
assert(prompts.includes("'storymode'"), '提示词模块类目必须包含 storymode。');
assert(prompts.includes('storyModeGate?: 剧情模式[]'), '提示词模块模型必须包含 storyModeGate 字段。');
for (const id of ['builtin_storymode_normal', 'builtin_storymode_harem', 'builtin_storymode_romance_alt', 'builtin_storymode_deep_single']) {
  assert(prompts.includes(`'${id}'`), `BUILTIN_PROMPT_MODULE_IDS 必须包含 ${id}。`);
}

const builder = read('hooks/useGame/systemPromptBuilder.ts');
assert(builder.includes('m.storyModeGate?.length'), '注入管线必须按 storyModeGate 过滤模块。');
assert(builder.includes('storyMode: worldState.剧情模式'), '模块注入上下文必须携带当前剧情模式。');

const gameState = read('hooks/useGameState.ts');
for (const legacyId of ['builtin_story_normal', 'builtin_story_harem', 'builtin_story_romance_alt', 'builtin_story_deep_single']) {
  assert(gameState.includes(`'${legacyId}'`), `旧存档清理名单必须包含 ${legacyId}。`);
}

console.log('story-mode→prompt-module migration regression ok');
