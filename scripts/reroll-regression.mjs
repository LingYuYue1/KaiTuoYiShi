import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const reroll = read('src/kernel/application/rerollTurn.ts');
const turnJournal = read('src/kernel/domain/turn/turnJournal.ts');
const turnBase = read('src/kernel/domain/turn/findTurnBaseSnapshot.ts');
const rerollPolicy = read('src/kernel/application/turn/stages/rerollPolicy.ts');
const promptPlan = read('src/kernel/application/turn/stages/buildTurnPromptPlan.ts');
const generation = read('src/kernel/application/turn/stages/generateNarrative.ts');
const chat = read('models/chat.ts');

assert(reroll.includes('findTurnBaseSnapshot'), 'reroll must select its base from the formal TurnJournal');
assert(reroll.includes("type: 'prepared'"), 'reroll must emit the truncated prepared projection before streaming');
assert(reroll.includes('captureDeviceOverlay()'), 'reroll must capture one immutable device context');
assert(reroll.includes("code: 'cancelled'"), 'reroll must reject cancellation without committing a replacement turn');
assert(reroll.includes("stage: 'committing'"), 'reroll must expose the commit boundary');
assert(reroll.includes('appendTurnJournalEntry'), 'successful reroll must replace the explicit journal entry');
assert(reroll.includes('planOptionalTurnJobs'), 'optional work must be committed as durable job intent');
assert(turnJournal.includes('structuredClone({'), 'turn snapshots must be isolated from live story references');
assert(turnBase.includes('conversation.turnJournal'), 'reroll base lookup must read journal authority');
assert(!chat.includes('preTurnSnapshot?:'), 'chat messages must not retain rollback authority');
assert(promptPlan.includes('# 重roll生成约束') && promptPlan.includes('重roll nonce'), 'reroll requests must carry a unique anti-repetition guard');
assert(rerollPolicy.includes('calculateRerollSimilarity'), 'reroll must normalize and compare candidate similarity');
assert(generation.includes('similarity >= 0.86'), 'overly similar rerolls must trigger the guarded retry path');

console.log('reroll regression ok');
