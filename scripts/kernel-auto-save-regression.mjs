import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../hooks/useGame.ts', import.meta.url), 'utf8');

assert.match(
  source,
  /if \(terminal\.type === 'rejected'\) throw new Error\(terminal\.error\.message\);\s+await saveCompletedTurnAutomatically\(kernel, terminal\.view\.runtime, s\);/,
  'a committed turn must auto-save its terminal kernel runtime',
);
assert.equal(
  [...source.matchAll(/await saveCompletedTurnAutomatically\(kernel, terminal\.view\.runtime, s\);/g)].length,
  2,
  'both normal sends and successful rerolls must auto-save',
);
assert.match(
  source,
  /if \(!runtime\.gameSettings\.enableAutoSaveEveryTurn\) return;/,
  'the auto-save setting must gate every automatic write',
);
assert.match(
  source,
  /await kernel\.saves\.saveGame\(runtimeToSave\(runtime, 'auto'\)\);/,
  'auto-save must use the SaveCatalog port with auto type',
);
assert.match(
  source,
  /catch \(error\) \{\s+console\.error\('Auto-save failed after committed turn:', error\);/,
  'a storage failure must be handled after the turn has committed',
);

console.log('kernel auto-save regression passed');
