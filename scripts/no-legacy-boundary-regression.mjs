#!/usr/bin/env node
/** Guard the breaking refactor's current-only persistence boundary. */

import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schema = read('src/kernel/domain/session/schema.ts');
const db = read('services/dbService.ts');
const useGame = read('hooks/useGame.ts');
const workflow = read('src/kernel/workflows/sendWorkflow.ts');

assert(!existsSync('utils/saveMigration.ts'), 'save migration module must not exist');
assert(!existsSync('scripts/migrate-main-save.mjs'), 'save migration CLI must not exist');
assert(!existsSync('scripts/save-migration-regression.mjs'), 'migration behavior suite must not exist');
assert(!schema.includes('migrateV2ToV3'), 'session schema must not migrate previous versions');
assert(!schema.includes('version === 2'), 'session schema must not branch to a previous version');
assert(!db.includes('migrateLegacySave') && !db.includes('extractLegacyDevicePreferences'), 'save import must not migrate or recover old device data');
assert(db.includes('validateImportedSave'), 'save import must validate the exact current shape');
assert(!useGame.includes('isLegacySave') && !useGame.includes('fallback migration'), 'save load must not contain a compatibility fallback');
assert(!workflow.includes('state.gameSettings!.worldbookTriggerStates'), 'story cooldown state must not fall back to device settings');

console.log('no legacy boundary regression ok');
