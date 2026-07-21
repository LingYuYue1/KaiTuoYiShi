import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const saves = await readFile(new URL('../src/kernel/application/rootCapabilities.ts', import.meta.url), 'utf8');
const useGame = await readFile(new URL('../hooks/useGame.ts', import.meta.url), 'utf8');

assert.match(
  saves,
  /followAutosave\(session\)[\s\S]*session\.projection\.subscribe/,
  'autosave must follow committed session projections',
);
assert.match(
  saves,
  /if \(!policy\.autosaveOnTurn\) return;/,
  'the save policy must gate automatic writes at the save authority',
);
assert.match(
  saves,
  /catalog\.saveGame\(createPortableSave\(await sessions\.readStory\(session\.id\), 'auto', clock\.now\(\)\)\)/,
  'autosave must read the repository-owned story rather than persisting a presentation projection',
);
assert.match(
  useGame,
  /root\.saves\.followAutosave\(session\)/,
  'the presentation client must attach the autosave follower to an opened session',
);
assert.doesNotMatch(
  useGame,
  /saveCompletedTurnAutomatically|storyToSave/,
  'turn and reroll handlers must not own a second save path',
);

console.log('kernel auto-save regression passed');
