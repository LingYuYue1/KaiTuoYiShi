import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaituo-story-mode-worldbook-'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function transpile(relativePath, outputPath, replacements = []) {
  let output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText;
  for (const [from, to] of replacements) {
    output = output.replaceAll(from, to);
  }
  const absoluteOutput = path.join(tempDir, outputPath);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, output, 'utf8');
}

function makeContext(overrides = {}) {
  return {
    recentUserInput: '',
    recentAIResponse: '',
    worldName: '',
    travelerName: '测试旅人',
    turnCount: 0,
    currentScope: 'opening',
    storyMode: 'harem',
    ...overrides,
  };
}

try {
  transpile('models/worldbook.ts', 'models/worldbook.mjs');
  transpile('data/builtinWorldbookConfig.ts', 'data/builtinWorldbookConfig.mjs');
  transpile('data/storyModeWorldbooks.ts', 'data/storyModeWorldbooks.mjs');
  transpile('utils/worldbook.ts', 'utils/worldbook.mjs', [
    ["'@/models/worldbook'", "'../models/worldbook.mjs'"],
  ]);

  const [{ createBuiltinConfigWorldbooks }, { createStoryModeWorldbooks }, worldbookUtils] = await Promise.all([
    import(pathToFileURL(path.join(tempDir, 'data/builtinWorldbookConfig.mjs')).href),
    import(pathToFileURL(path.join(tempDir, 'data/storyModeWorldbooks.mjs')).href),
    import(pathToFileURL(path.join(tempDir, 'utils/worldbook.mjs')).href),
  ]);

  // 批次5(D10, 2026-07-26): 叙事铁律书已迁移为提示词模块 builtin_rule_narrative_general。
  const narrativeBook = createBuiltinConfigWorldbooks().find((book) => book.id === 'builtin_narrative_general');
  assert(!narrativeBook, 'The legacy main-story worldbook must be fully migrated to prompt modules.');
  const builtinModulesSource = fs.readFileSync(path.join(root, 'data/builtinPromptModules.ts'), 'utf8').replace(/\r\n/g, '\n');
  assert(
    /id: 'builtin_rule_narrative_general'[\s\S]{0,600}scope: \['main', 'opening'\]/.test(builtinModulesSource),
    'Narrative general rules must exist as a main+opening prompt module after migration.',
  );

  const storyModeBooks = createStoryModeWorldbooks();
  for (const book of storyModeBooks) {
    assert(book.entries.length === 1, `${book.title} must contain one stable rule entry.`);
    assert(book.entries[0].scope.includes('opening'), `${book.title} must apply to the opening turn.`);
    assert(book.entries[0].scope.includes('main'), `${book.title} must continue to apply to main turns.`);
  }

  const openingModeText = worldbookUtils.buildPromptLikeWorldbookInjection(
    storyModeBooks,
    makeContext(),
  );
  assert(openingModeText.includes('后宫向叙事方向'), 'The selected story mode must be injected into the opening turn.');
  assert(!openingModeText.includes('正常向叙事方向'), 'Unselected story modes must not be injected.');
  assert(openingModeText.startsWith('# 世界书｜'), 'Stable worldbook rules must retain a worldbook source label.');
  assert(!openingModeText.includes('# 提示词｜'), 'Worldbook rules must not be mislabeled as prompt modules.');

  const mainModeText = worldbookUtils.buildPromptLikeWorldbookInjection(
    storyModeBooks,
    makeContext({ currentScope: 'main', turnCount: 3, storyMode: 'deep_single' }),
  );
  assert(mainModeText.includes('深度单线向叙事方向'), 'The selected story mode must continue into main turns.');
  assert(!mainModeText.includes('后宫向叙事方向'), 'Story-mode gating must remain exclusive on main turns.');

  const wizard = read('components/features/NewGame/NewGameWizard.tsx');
  assert(wizard.includes('<StoryModeSelector'), 'The new-game wizard must render the story-mode selector.');
  assert(wizard.includes('storyMode={storyMode}'), 'The selector must receive the current story mode.');
  assert(wizard.includes('onStoryMode={setStoryMode}'), 'The selector must update the story mode.');
  assert(!wizard.includes('function WorldStep('), 'The unreachable legacy story-mode step must be removed.');

  const promptBuilder = read('hooks/useGame/systemPromptBuilder.ts');
  const gatedStableRuleCalls = promptBuilder.match(
    /if \(settings\.enableWorldbookInjection && worldbooks && worldbookCtx\) \{\s+const promptLikeWorldbook = buildPromptLikeWorldbookInjection/g,
  ) ?? [];
  assert(gatedStableRuleCalls.length === 2, 'Opening and main stable rules must both obey the worldbook master switch.');
  assert(
    !promptBuilder.includes('if (worldbooks && worldbookCtx) {\n    const promptLikeWorldbook'),
    'No stable worldbook injection may bypass the worldbook master switch.',
  );

  console.log('story mode worldbook injection regression ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
