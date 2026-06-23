import fs from 'node:fs';
import path from 'node:path';
import {
  loadPackageJson,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_RELEASE_VERSION);
const releaseRoot = process.env.DESKTOP_RELEASE_OUTPUT_DIR || path.join(root, '.desktop-release');
const releaseDir = process.env.DESKTOP_RELEASE_DIR || path.join(releaseRoot, `v${version}`);
const outputPath = process.env.DESKTOP_STORAGE_STRATEGY_OUTPUT || path.join(releaseDir, 'storage-strategy.md');

const dbService = readMaybe('services/dbService.ts');
const storageAudit = readMaybe('scripts/desktop-storage-audit.mjs');
const saveMirror = readMaybe('services/desktop/desktopSaveMirror.ts');
const saveDeltaMirror = readMaybe('services/desktop/desktopSaveDeltaMirror.ts');
const settingsMirror = readMaybe('services/desktop/desktopSettingsMirror.ts');
const assetMirror = readMaybe('services/desktop/desktopAssetMirror.ts');
const migrationBackup = readMaybe('services/desktop/desktopMigrationBackup.ts');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const evidence = [
  ['settings file-primary writes', settingsMirror.includes('config/') || dbService.includes('mirrorSettingToDesktop')],
  ['desktop save id sequence', saveMirror.includes('saves/sequence.json') || saveMirror.includes('SaveSequence')],
  ['desktop save mirror files', saveMirror.includes('save-${id}.json') || saveMirror.includes('saves/index.json')],
  ['desktop delta mirror files', saveDeltaMirror.includes('saves/deltas/index.json')],
  ['asset mirror files', assetMirror.includes('assets/generated-images')],
  ['new save file-primary writes', dbService.includes('writeDesktopPrimarySaveBeforeIndexedDbSafely')],
  ['atomic desktop text writes', storageAudit.includes('atomic json writes')],
  ['pending save transaction markers', saveMirror.includes('saves/transactions') || storageAudit.includes('save transaction markers')],
  ['save transaction completeness checks', saveMirror.includes('isDesktopSaveTransactionComplete') || storageAudit.includes('save transaction completeness')],
  ['completed transaction cleanup', saveMirror.includes('cleanupCompletedDesktopSaveTransactions') || storageAudit.includes('save transaction cleanup')],
  ['unresolved transaction automatic repair', saveMirror.includes('repairUnresolvedDesktopSaveTransactions') || storageAudit.includes('save transaction automatic repair')],
  ['indexeddb compatibility cache rebuild', dbService.includes('rebuildIndexedSaveCacheFromDesktopMirror') || storageAudit.includes('indexeddb cache rebuild')],
  ['desktop repair backup guard', storageAudit.includes('repair backup guard')],
  ['one-time migration backup', migrationBackup.includes('kaituoyishi-desktop-migration-backup') || storageAudit.includes('one-time migration backup')],
  ['cross-edition save package exchange', storageAudit.includes('cross-edition save packages')],
  ['desktop-first save reads', dbService.includes('loadDesktopSaveMirrorSaveFirstSafely')],
  ['delta base desktop fallback', dbService.includes('loadDeltaBaseCandidateSave(db, baseSaveId)')],
  ['storage audit boundary', storageAudit.includes('not full desktop-primary migration')],
];

const output = `# Desktop Edition Storage Strategy

Generated: ${new Date().toISOString()}

Version: ${version}

Release directory: ${releaseDir}

> This file is a local planning and release-readiness artifact. It does not migrate data, upload files, delete files, or change the current save format.

## Current Evidence

${evidence.map(([label, ok]) => `- [${ok ? 'x' : ' '}] ${label}`).join('\n')}

## Current Boundary

- Settings are file-primary on Desktop Edition, with IndexedDB kept as a compatibility cache.
- Save lists, individual save reads, asset payload restore, delta node reads, delta base selection, and delta-only base restore prefer desktop files when available.
- New saveGame records in desktop runtime write save files, delta records, and asset records to desktop files before updating IndexedDB as a compatibility cache.
- New saveGame file-primary writes leave pending transaction markers under \`saves/transactions/\` until save, delta, and asset files are written.
- Pending transaction markers record the expected delta node and generated image asset ids, so leftover marker cleanup verifies the save body, delta record, asset metadata, and asset payload files before removing a marker.
- Desktop index repair removes leftover transaction markers only when the target save file is readable and complete; unresolved markers remain visible for diagnostics.
- Desktop index repair also exposes a conservative unresolved transaction repair path: it rebuilds the save index and sequence from readable save files, then clears only transaction markers proven complete by a valid save mirror.
- Desktop index repair creates a local save backup before repairing mirror indexes or transaction markers.
- One-time migration has a local backup entrypoint that captures the current readable save view plus desktop mirror, config, zhiku, worldbook, and generated image payload files before migration work begins.
- Desktop mirrored save files can explicitly rebuild the IndexedDB compatibility cache after current data is backed up and local asset payloads are restored.
- Web-compatible save packages remain the cross-edition exchange format: Desktop local files are the storage backend, while \`.zip\`, \`.ktysave\`, and legacy \`.json\` imports stay compatible with the Web edition.
- Legacy replacement, repair, and migration paths still keep IndexedDB stores as compatibility sources while their desktop mirrors are maintained.
- The current state is desktop-first with file-primary settings and new save writes, not full desktop-primary migration.

## Options

### Option A: JSON file-primary saves first

Make \`saves/index.json\`, \`saves/save-<id>.json\`, \`saves/sequence.json\`, and \`saves/deltas/\` the Desktop Edition write source. IndexedDB becomes a compatibility cache rebuilt from files when needed.

Pros:
- Smallest conceptual jump from the current mirror design.
- Easy for players and maintainers to inspect, back up, and recover.
- Keeps Web import/export and existing save package logic close to current behavior.

Cons:
- Needs careful atomic write and repair logic for multi-file consistency.
- Large save lists still need index discipline to avoid scanning every full save.
- Query-heavy future features may outgrow plain JSON.

### Option B: SQLite primary store

Move saves, summaries, deltas, asset indexes, and maintenance metadata into a local SQLite database, while keeping large images as files.

Pros:
- Stronger transactional guarantees for save + summary + delta updates.
- Better query shape for large libraries, history trees, and maintenance tools.
- Cleaner long-term foundation if Desktop Edition diverges significantly from Web.

Cons:
- More moving parts in Tauri/Rust and migration code.
- Higher risk of first-release compatibility issues.
- Harder for players to inspect manually compared with JSON files.

### Option C: Hybrid path

Use JSON file-primary saves for the next Desktop Edition milestone, keep images as real files, and defer SQLite until save-tree UI, large-scale search, or maintenance queries require it.

Recommendation:
- Choose Option C for the next milestone.
- Continue hardening file-primary save writes with multi-file transaction recovery, repair, and IndexedDB cache rebuild.
- Re-evaluate SQLite after the desktop save tree UI and resource maintenance tools are in use.

## Next Implementation Gates

- [x] Add first file-primary \`saveGame\` path in desktop runtime while keeping Web behavior unchanged.
- [x] Route desktop text and JSON writes through temp files plus rename.
- [x] Add pending transaction markers for save body, delta, and asset multi-file writes.
- [x] Verify expected save, delta, and asset files before clearing leftover transaction markers.
- [x] Add guided cleanup for completed leftover pending transaction markers.
- [x] Add automatic repair for unresolved pending transaction markers.
- [x] Rebuild IndexedDB compatibility cache from desktop files after a successful desktop write.
- [x] Back up current saves before desktop mirror repair.
- [x] Add a one-time migration backup entrypoint for current readable saves and desktop mirror files.
- [x] Keep Web import/export package format as the cross-edition exchange format.
- [x] Extend \`desktop:storage-audit\` to distinguish file-primary new save writes from mirror-only fallback paths.
- [x] Add regression coverage for desktop write failure fallback and cache rebuild.

## Non-Goals For This Step

- No automatic migration on app startup.
- No deletion of existing IndexedDB saves.
- No GitHub upload or online updater verification.
- No SQLite dependency until the JSON file-primary path has a proven limit.
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`desktop storage strategy written: ${outputPath}`);

function readMaybe(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch {
    return '';
  }
}
