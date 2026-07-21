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
const workflow = read('src/kernel/application/turn/executeTurnWorkflow.ts');
const deviceUseCases = read('src/kernel/application/deviceUseCases.ts');
const useGameState = read('hooks/useGameState.ts');
const rootContract = read('src/kernel/contract/rootCapabilities.ts');
const appKernel = read('src/kernel/composition/appKernel.ts');

assert(!existsSync('utils/saveMigration.ts'), 'save migration module must not exist');
assert(!existsSync('scripts/migrate-main-save.mjs'), 'save migration CLI must not exist');
assert(!existsSync('scripts/save-migration-regression.mjs'), 'migration behavior suite must not exist');
assert(!existsSync('src/kernel/application/sessionMigration.ts'), 'session migration use case must not exist');
assert(!existsSync('src/kernel/application/portableSaveMigration.ts'), 'portable-save migration use case must not exist');
assert(!existsSync('components/features/Migration/SessionMigrationGate.tsx'), 'runtime migration gate must not exist');
assert(!schema.includes('migrateV2ToV3'), 'session schema must not migrate previous versions');
assert(!schema.includes('version === 2'), 'session schema must not branch to a previous version');
assert(!db.includes('migrateLegacySave') && !db.includes('extractLegacyDevicePreferences'), 'save import must not migrate or recover old device data');
assert(db.includes('validateImportedSave'), 'save import must validate the exact current shape');
assert(!useGame.includes('isLegacySave') && !useGame.includes('fallback migration'), 'save load must not contain a compatibility fallback');
assert(!workflow.includes('state.gameSettings!.worldbookTriggerStates'), 'story cooldown state must not fall back to device settings');
assert(deviceUseCases.includes('contentInitialized: content !== null'), 'typed device hydration must preserve whether content was ever persisted');
assert(useGameState.includes('contentInitialized ? savedContent.worldbooks : null'), 'first-launch bundled content initialization must not be erased by defaults');
assert(!rootContract.includes('MigrationUseCases') && !rootContract.includes('readonly migration'), 'public kernel must not expose a transition-period migration capability');
assert(!appKernel.includes('sessionMigration') && !appKernel.includes('portableMigration'), 'composition must not construct legacy migration paths');

console.log('no legacy boundary regression ok');
