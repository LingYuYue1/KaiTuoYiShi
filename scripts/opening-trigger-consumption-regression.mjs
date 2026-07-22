#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const commands = read('src/kernel/contract/commands.ts');
const session = read('src/kernel/contract/session.ts');
const executeTurn = read('src/kernel/application/executeTurn.ts');
const useGame = read('hooks/useGame.ts');
const app = read('App.tsx');

assert.match(commands, /openingTrigger\?: string/);
assert.match(session, /advance\(input: Readonly<\{ text: string; openingTrigger\?: string \}>\)/);
assert.match(useGame, /turns\.advance\(\{ text, openingTrigger \}\)/);
assert.match(useGame, /await handleSend\(text, text\)/);
assert.match(executeTurn, /pendingOpeningTrigger !== openingTrigger/);
assert.match(executeTurn, /pendingOpeningTrigger: null/);

const clear = executeTurn.indexOf('pendingOpeningTrigger: null');
const rejection = executeTurn.indexOf('yield rejectedFrame(envelope, {', clear);
const commit = executeTurn.indexOf('yield await commitCommand');
assert(clear >= 0 && clear < rejection, 'trigger clearing must only prepare the draft before model execution can fail');
assert(rejection >= 0 && rejection < commit, 'model failure must return before the final commit');
assert(!useGame.includes('turns.consumeOpening'), 'opening delivery must not use a separate consuming command');
assert(app.includes('actions.handleOpeningTrigger(text)'), 'App must route the opening through the retryable turn action');

console.log('opening trigger retry semantics regression ok');
