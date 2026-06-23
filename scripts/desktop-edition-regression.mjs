import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

function read(relativePath) {
  const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[desktop-edition] ${message}`);
  }
}

function assertExecFails(command, args, options, expectedMessage) {
  try {
    execFileSync(command, args, options);
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
    assert(
      output.includes(expectedMessage),
      `expected command failure to include "${expectedMessage}", got: ${output}`,
    );
    return;
  }
  throw new Error(`[desktop-edition] expected command to fail: ${command} ${args.join(' ')}`);
}

const packageJson = readJson('package.json');
assert(packageJson.scripts['desktop:dev'] === 'tauri dev', 'package.json must expose desktop:dev');
assert(packageJson.scripts['desktop:build'] === 'tauri build', 'package.json must expose desktop:build');
assert(
  packageJson.scripts['desktop:build:updater'] === 'tauri build --config src-tauri/tauri.updater.conf.json',
  'package.json must expose desktop:build:updater',
);
assert(packageJson.scripts['desktop:sign-updater'] === 'node scripts/desktop-sign-updater.mjs', 'package.json must expose desktop:sign-updater');
assert(packageJson.scripts['desktop:update-manifest'] === 'node scripts/desktop-update-manifest.mjs', 'package.json must expose desktop:update-manifest');
assert(packageJson.scripts['desktop:stage-release'] === 'node scripts/desktop-stage-release.mjs', 'package.json must expose desktop:stage-release');
assert(packageJson.scripts['desktop:verify-release'] === 'node scripts/desktop-verify-release.mjs', 'package.json must expose desktop:verify-release');
assert(packageJson.scripts['desktop:verify-online-update'] === 'node scripts/desktop-verify-online-update.mjs', 'package.json must expose desktop:verify-online-update');
assert(packageJson.scripts['desktop:install-update-drill'] === 'node scripts/desktop-install-update-drill.mjs', 'package.json must expose desktop:install-update-drill');
assert(packageJson.scripts['desktop:release-gates'] === 'node scripts/desktop-release-gates.mjs', 'package.json must expose desktop:release-gates');
assert(packageJson.scripts['desktop:verify-release-gates'] === 'node scripts/desktop-verify-release-gates.mjs', 'package.json must expose desktop:verify-release-gates');
assert(packageJson.scripts['desktop:github-release-notes'] === 'node scripts/desktop-github-release-notes.mjs', 'package.json must expose desktop:github-release-notes');
assert(packageJson.scripts['desktop:github-upload-commands'] === 'node scripts/desktop-github-upload-commands.mjs', 'package.json must expose desktop:github-upload-commands');
assert(packageJson.scripts['desktop:code-signing-decision'] === 'node scripts/desktop-code-signing-decision.mjs', 'package.json must expose desktop:code-signing-decision');
assert(packageJson.scripts['desktop:storage-strategy'] === 'node scripts/desktop-storage-strategy.mjs', 'package.json must expose desktop:storage-strategy');
assert(packageJson.scripts['desktop:storage-audit'] === 'node scripts/desktop-storage-audit.mjs', 'package.json must expose desktop:storage-audit');
assert(packageJson.scripts['desktop:readiness'] === 'node scripts/desktop-readiness.mjs', 'package.json must expose desktop:readiness');
assert(packageJson.scripts['desktop:preflight'] === 'node scripts/desktop-preflight.mjs', 'package.json must expose desktop:preflight');
assert(packageJson.dependencies['@tauri-apps/api'], 'package.json must include @tauri-apps/api');
assert(packageJson.dependencies['@tauri-apps/plugin-updater'], 'package.json must include @tauri-apps/plugin-updater');
assert(packageJson.devDependencies['@tauri-apps/cli'], 'package.json must include @tauri-apps/cli');

const tauriConfig = readJson('src-tauri/tauri.conf.json');
const updaterConfig = readJson('src-tauri/tauri.updater.conf.json');
assert(tauriConfig.productName === '开拓轶事', 'Tauri productName must be configured');
assert(tauriConfig.identifier === 'com.kaituoyishi.desktop', 'Tauri identifier must be stable');
assert(tauriConfig.build?.devUrl === 'http://127.0.0.1:3000', 'Tauri devUrl must target the local Vite server');
assert(tauriConfig.build?.frontendDist === '../dist', 'Tauri frontendDist must use the Vite dist directory');
assert(tauriConfig.bundle?.active === true, 'Tauri bundle must be active');
assert(tauriConfig.bundle?.targets?.includes('nsis'), 'Windows NSIS bundle target must be enabled');
assert(
  Array.isArray(tauriConfig.bundle?.resources) && tauriConfig.bundle.resources.includes('desktop'),
  'Windows installer must bundle the desktop resource directory',
);
assert(tauriConfig.app?.windows?.[0]?.label === 'main', 'Tauri main window label must match the default capability');
assert(tauriConfig.plugins?.updater?.pubkey, 'Tauri updater public key must be configured');
assert(
  tauriConfig.plugins?.updater?.endpoints?.some((endpoint) => endpoint.includes('latest.json')),
  'Tauri updater endpoint must point to a latest.json update manifest',
);
assert(tauriConfig.bundle?.windows?.nsis?.installMode === 'both', 'Windows NSIS install mode must allow choosing current user or per-machine install');
assert(!tauriConfig.plugins?.updater?.windows, 'Updater config should not define a Windows install mode');
assert(updaterConfig.bundle?.createUpdaterArtifacts === true, 'Updater build config must create updater artifacts');
assert(fs.existsSync(path.join(root, 'src-tauri/icons/icon.ico')), 'Windows icon.ico must exist for Tauri resource generation');
assert(fs.existsSync(path.join(root, 'src-tauri/icons/icon.png')), 'PNG app icon must exist');

const gitignore = read('.gitignore');
assert(gitignore.includes('src-tauri/target/'), '.gitignore must exclude Rust build output');
assert(gitignore.includes('.tmp/'), '.gitignore must exclude local temporary caches');
assert(gitignore.includes('.desktop-release/'), '.gitignore must exclude staged desktop release artifacts');

const cargoToml = read('src-tauri/Cargo.toml');
assert(cargoToml.includes('tauri = { version = "2"'), 'Cargo.toml must depend on Tauri v2');
assert(cargoToml.includes('custom-protocol'), 'Cargo.toml desktop build must enable Tauri custom-protocol for offline production assets');
assert(cargoToml.includes('tauri-plugin-updater = "2"'), 'Cargo.toml must include the Tauri updater plugin');
assert(cargoToml.includes('serde_json = "1"'), 'Cargo.toml must support JSON payloads');

const rustLib = read('src-tauri/src/lib.rs');
for (const subdir of ['saves', 'backups', 'assets/generated-images', 'logs', 'config', 'zhiku', 'worldbooks']) {
  assert(rustLib.includes(`"${subdir}"`), `Rust desktop data directories must include ${subdir}`);
}
assert(rustLib.includes('desktop_app_info'), 'Rust bridge must expose desktop_app_info');
assert(rustLib.includes('write_desktop_probe'), 'Rust bridge must expose write_desktop_probe');
assert(rustLib.includes('pick_desktop_folder'), 'Rust bridge must expose pick_desktop_folder');
assert(rustLib.includes('set_desktop_storage_roots'), 'Rust bridge must expose set_desktop_storage_roots');
for (const command of ['desktop_read_text', 'desktop_write_text', 'desktop_write_text_atomic', 'desktop_write_base64_file', 'desktop_read_base64_file', 'desktop_list', 'desktop_remove']) {
  assert(rustLib.includes(command), `Rust bridge must expose ${command}`);
}
assert(rustLib.includes('write_text_atomically'), 'Rust bridge must implement atomic desktop text writes');
assert(rustLib.includes('fs::rename(&temp_path, file_path)'), 'Rust atomic text writes must rename temp files into place');
assert(rustLib.includes('.sync_all()'), 'Rust atomic text writes must sync temp files before rename');
assert(rustLib.includes('let _ = fs::remove_file(&temp_path)'), 'Rust atomic text writes must clean temp files after failures');
assert(rustLib.includes('open_desktop_data_dir'), 'Rust bridge must expose a fixed local data directory opener');
assert(rustLib.includes('open_directory(&dir)'), 'Rust directory opener must only open resolved app data subdirectories');
assert(rustLib.includes('"saves" => resolve_storage_root(&app, &app_data_dir, "saves")?'), 'Rust directory opener must support redirected save roots');
assert(rustLib.includes('"backups" => resolve_storage_root(&app, &app_data_dir, "backups")?'), 'Rust directory opener must support redirected backup roots');
assert(rustLib.includes('"config" => app_data_dir.join("config")'), 'Rust directory opener must support the config directory');
assert(rustLib.includes('"zhiku" => app_data_dir.join("zhiku")'), 'Rust directory opener must support the zhiku directory');
assert(rustLib.includes('"worldbooks" => app_data_dir.join("worldbooks")'), 'Rust directory opener must support the worldbooks directory');
assert(rustLib.includes('const STORAGE_ROOTS_PATH: &str = "config/desktop-storage.json";'), 'Rust desktop storage roots must persist under config/desktop-storage.json');
assert(rustLib.includes('resolve_storage_root_from_option'), 'Rust desktop storage roots must resolve redirected directories from stored config');
assert(rustLib.includes('normalize_storage_root_input'), 'Rust desktop storage roots must validate picker input');
assert(rustLib.includes('validate_absolute_storage_path'), 'Rust desktop storage roots must require absolute redirected directories');
assert(rustLib.includes('migrate_storage_root'), 'Rust desktop storage roots must migrate existing files into the selected directory');
assert(rustLib.includes('pick_folder()'), 'Rust desktop storage roots must use a native folder picker');
assert(rustLib.includes('normalize_relative_path'), 'Rust bridge must sanitize desktop data paths');
assert(rustLib.includes('Component::Normal'), 'Rust path sanitizer must only accept normal relative path components');
assert(rustLib.includes('desktop-probe.json'), 'Rust probe must write a local desktop probe file');
assert(rustLib.includes('tauri_plugin_updater'), 'Rust app must register the updater plugin');

const defaultCapability = readJson('src-tauri/capabilities/default.json');
assert(defaultCapability.permissions?.includes('updater:default'), 'Default capability must allow updater commands');

const runtime = read('utils/platform/desktopRuntime.ts');
assert(runtime.includes('__TAURI_INTERNALS__'), 'runtime detection must use Tauri internals');
assert(runtime.includes("RuntimePlatform = 'web' | 'desktop'"), 'runtime platform type must distinguish web and desktop');

const bridge = read('services/desktop/desktopBridge.ts');
assert(bridge.includes("invoke<DesktopAppInfo>('desktop_app_info')"), 'desktop bridge must call desktop_app_info');
assert(bridge.includes("invoke<DesktopProbeResult>('write_desktop_probe')"), 'desktop bridge must call write_desktop_probe');
assert(bridge.includes("invoke('open_desktop_data_dir'"), 'desktop bridge must expose opening the local data directory');
assert(bridge.includes("invoke<string | null>('pick_desktop_folder')"), 'desktop bridge must expose the native folder picker');
assert(bridge.includes("invoke<DesktopAppInfo>('set_desktop_storage_roots'"), 'desktop bridge must expose storage root updates');
assert(bridge.includes("'logs'"), 'desktop bridge must support opening the local logs directory');
assert(bridge.includes("'zhiku'"), 'desktop bridge must support opening the local zhiku directory');
assert(bridge.includes("'worldbooks'"), 'desktop bridge must support opening the local worldbooks directory');
assert(bridge.includes("'backups'"), 'desktop bridge must support opening redirected backup directories');
assert(bridge.includes("from '@tauri-apps/plugin-updater'"), 'desktop bridge must import the updater plugin');
assert(bridge.includes('checkForDesktopUpdate'), 'desktop bridge must expose update checks');
assert(bridge.includes('downloadAndInstallDesktopUpdate'), 'desktop bridge must expose update install');
assert(bridge.includes('isDesktopRuntime()'), 'desktop bridge must guard calls outside desktop runtime');

const saveMirror = read('services/desktop/desktopSaveMirror.ts');
assert(saveMirror.includes('mirrorSaveToDesktop'), 'desktop save mirror must expose save mirroring');
assert(saveMirror.includes('removeSaveFromDesktopMirror'), 'desktop save mirror must expose mirror deletion');
assert(saveMirror.includes('replaceDesktopSaveMirror'), 'desktop save mirror must expose full mirror replacement');
assert(saveMirror.includes('listDesktopSaveMirror'), 'desktop save mirror must expose the mirror index');
assert(saveMirror.includes('repairDesktopSaveMirrorIndex'), 'desktop save mirror must expose manual index repair');
assert(saveMirror.includes('loadDesktopSaveMirrorSave'), 'desktop save mirror must expose single mirrored save reads');
assert(saveMirror.includes('loadDesktopSaveMirrorSaves'), 'desktop save mirror must load mirrored save records for recovery');
assert(saveMirror.includes('DesktopSaveMirrorHealth'), 'desktop save mirror must expose health diagnostics');
assert(saveMirror.includes('inspectDesktopSaveMirrorHealth'), 'desktop save mirror must expose a read-only health inspector');
assert(saveMirror.includes('readMirrorIndexForHealth'), 'desktop save mirror health checks must inspect index status without rebuilding it');
assert(saveMirror.includes('missingIndexedSaveFiles'), 'desktop save mirror health must report indexed saves whose files are missing');
assert(saveMirror.includes('orphanSaveFiles'), 'desktop save mirror health must report save files absent from the index');
assert(saveMirror.includes('sequenceStatus'), 'desktop save mirror health must report save id sequence status');
assert(saveMirror.includes('sequenceLastSaveId'), 'desktop save mirror health must report the last reserved save id');
assert(saveMirror.includes('sequenceBehindIndex'), 'desktop save mirror health must report save id sequences that lag behind mirrored saves');
assert(saveMirror.includes("TRANSACTION_DIR = 'saves/transactions'"), 'desktop save mirror must keep pending save transactions under saves/transactions');
assert(saveMirror.includes("kind: 'kaituoyishi-desktop-save-transaction'"), 'desktop save transactions must carry a stable kind');
assert(saveMirror.includes('beginDesktopSaveTransaction'), 'desktop save mirror must expose transaction start markers');
assert(saveMirror.includes('finishDesktopSaveTransaction'), 'desktop save mirror must expose transaction completion cleanup');
assert(saveMirror.includes('expectedDeltaNodeId'), 'desktop save transactions must record the expected delta node');
assert(saveMirror.includes('expectedAssetIds'), 'desktop save transactions must record expected asset ids');
assert(saveMirror.includes('isDesktopSaveTransactionComplete'), 'desktop save transaction cleanup must verify full transaction completion');
assert(saveMirror.includes('isExpectedDeltaMirrorComplete'), 'desktop save transaction cleanup must verify expected delta files');
assert(saveMirror.includes('areExpectedAssetMirrorsComplete'), 'desktop save transaction cleanup must verify expected asset files');
assert(saveMirror.includes("adapter.readJson<DesktopAssetMirrorIndexForTransaction>('assets/index.json')"), 'desktop save transaction cleanup must verify asset index entries');
assert(saveMirror.includes('adapter.readBase64File(summary.path)'), 'desktop save transaction cleanup must verify asset payload files');
assert(saveMirror.includes('cleanupCompletedDesktopSaveTransactions'), 'desktop save mirror must expose completed transaction cleanup');
assert(saveMirror.includes('repairUnresolvedDesktopSaveTransactions'), 'desktop save mirror must expose conservative unresolved transaction repair');
assert(saveMirror.includes('DesktopSaveTransactionRepairSummary'), 'desktop transaction cleanup must return a repair summary');
assert(saveMirror.includes('removedTransactions'), 'desktop transaction cleanup must report removed completed markers');
assert(saveMirror.includes('retainedTransactions'), 'desktop transaction cleanup must report unresolved retained markers');
assert(saveMirror.includes('rebuildMirrorIndexFromSaveFiles(adapter)'), 'unresolved transaction repair must rebuild the save index from readable save files');
assert(saveMirror.includes('writeSaveSequence(getMaxSaveId(index.saves), adapter)'), 'unresolved transaction repair must refresh the save id sequence after rebuilding the index');
assert(saveMirror.includes('cleanupCompletedDesktopSaveTransactions(adapter)'), 'unresolved transaction repair must clean only completed transaction markers after index repair');
assert(saveMirror.includes('inspectPendingTransactions'), 'desktop save mirror health must inspect pending transaction markers');
assert(saveMirror.includes('pendingTransactions'), 'desktop save mirror health must report pending transaction count');
assert(saveMirror.includes('unreadableTransactions'), 'desktop save mirror health must report unreadable transaction count');
assert(saveMirror.includes("INDEX_PATH = 'saves/index.json'"), 'desktop save mirror must keep a local save index');
assert(saveMirror.includes("SEQUENCE_PATH = 'saves/sequence.json'"), 'desktop save mirror must keep a local save id sequence');
assert(saveMirror.includes("kind: 'kaituoyishi-desktop-save-sequence'"), 'desktop save id sequence must carry a stable kind');
assert(saveMirror.includes('reserveDesktopSaveId'), 'desktop save mirror must expose save id reservation');
assert(saveMirror.includes('readSaveSequence'), 'desktop save mirror must read the local save id sequence');
assert(saveMirror.includes('readSaveSequenceForHealth'), 'desktop save mirror health must inspect the local save id sequence');
assert(saveMirror.includes('writeSaveSequence'), 'desktop save mirror must write the local save id sequence');
assert(saveMirror.includes('getMaxSaveId(index.saves) + 1'), 'desktop save id reservation must avoid existing mirrored save ids');
assert(saveMirror.includes('sequenceLastSaveId < maxKnownSaveId'), 'desktop save mirror health must detect sequence values behind existing mirror ids');
assert(saveMirror.includes("SAVE_RECORD_RE = /^save-(\\d+)\\.json$/"), 'desktop save mirror must recognize individual save mirror files');
assert(saveMirror.includes('saves/save-${id}.json'), 'desktop save mirror must write save records into the saves directory');
assert(saveMirror.includes('stripSaveAssetPayloadForStorage'), 'desktop save mirror must strip embedded image payloads before writing save JSON');
assert(saveMirror.includes('rebuildMirrorIndexFromSaveFiles'), 'desktop save mirror must rebuild the index from local save files');
assert(saveMirror.includes('const index = await rebuildMirrorIndexFromSaveFiles()'), 'desktop save mirror repair must rebuild from local save files');
assert(saveMirror.includes('await writeSaveSequence(getMaxSaveId(index.saves))'), 'desktop save mirror repair must rebuild the local save id sequence');
assert(saveMirror.includes("adapter.list('saves')"), 'desktop save mirror index rebuild must scan the saves directory');
assert(saveMirror.includes('const record = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(id))'), 'desktop save mirror index rebuild must read individual save mirror records');
assert(saveMirror.includes("record?.kind !== 'kaituoyishi-desktop-save'"), 'desktop save mirror index rebuild must validate record kind');
assert(saveMirror.includes('saves.push({ ...record.summary, id: Number(record.summary.id) || id })'), 'desktop save mirror index rebuild must recover summaries from save records');
assert(saveMirror.includes('await writeMirrorIndex(index.saves)'), 'desktop save mirror index rebuild must write back a recovered index');
assert(saveMirror.includes('save index read failed, trying file scan'), 'desktop save mirror must fall back to file scan when the index cannot be parsed');
assert(saveMirror.includes('skip unreadable mirrored save'), 'desktop save mirror must skip unreadable single save files');
assert(saveMirror.includes('createAppStorageAdapter'), 'desktop save mirror must write through the storage adapter');
assert(saveMirror.includes('isDesktopRuntime()'), 'desktop save mirror must no-op outside desktop runtime');
assert(saveMirror.includes("record?.kind !== 'kaituoyishi-desktop-save'"), 'single mirrored save reads must validate record kind');

const saveDeltaMirror = read('services/desktop/desktopSaveDeltaMirror.ts');
assert(saveDeltaMirror.includes('mirrorSaveNodeDeltaToDesktop'), 'desktop save delta mirror must expose delta mirroring');
assert(saveDeltaMirror.includes('loadDesktopSaveNodeDelta'), 'desktop save delta mirror must expose single delta reads');
assert(saveDeltaMirror.includes('loadDesktopSaveNodeDeltas'), 'desktop save delta mirror must expose delta list reads');
assert(saveDeltaMirror.includes('removeSaveNodeDeltasBySaveIdFromDesktopMirror'), 'desktop save delta mirror must remove deltas by save id');
assert(saveDeltaMirror.includes('replaceDesktopSaveDeltaMirror'), 'desktop save delta mirror must expose full delta mirror replacement');
assert(saveDeltaMirror.includes('repairDesktopSaveDeltaMirrorIndex'), 'desktop save delta mirror must expose delta index repair');
assert(saveDeltaMirror.includes('inspectDesktopSaveDeltaMirrorHealth'), 'desktop save delta mirror must expose health diagnostics');
assert(saveDeltaMirror.includes("INDEX_PATH = 'saves/deltas/index.json'"), 'desktop save delta mirror must keep a local delta index');
assert(saveDeltaMirror.includes('saves/deltas/delta-${encodeURIComponent(nodeId)}.json'), 'desktop save delta mirror must write per-node delta records');
assert(saveDeltaMirror.includes("kind: 'kaituoyishi-desktop-save-delta'"), 'desktop save delta mirror records must carry a stable kind');
assert(saveDeltaMirror.includes('rebuildDeltaIndexFromFiles'), 'desktop save delta mirror must rebuild the index from local delta files');
assert(saveDeltaMirror.includes("adapter.list('saves/deltas')"), 'desktop save delta mirror index rebuild must scan the delta directory');
assert(saveDeltaMirror.includes('isDesktopRuntime()'), 'desktop save delta mirror must no-op outside desktop runtime');

const settingsMirror = read('services/desktop/desktopSettingsMirror.ts');
assert(settingsMirror.includes("SETTINGS_PATH = 'config/settings.json'"), 'desktop settings mirror must write config/settings.json');
assert(settingsMirror.includes("zhikuSystem: 'zhiku/system.json'"), 'desktop settings mirror must write zhikuSystem into zhiku/system.json');
assert(settingsMirror.includes("worldbooks: 'worldbooks/worldbooks.json'"), 'desktop settings mirror must write worldbooks into worldbooks/worldbooks.json');
assert(settingsMirror.includes("kind: 'kaituoyishi-desktop-setting'"), 'desktop special setting mirrors must carry a stable kind');
assert(settingsMirror.includes('mirrorSettingToDesktop'), 'desktop settings mirror must expose setting writes');
assert(settingsMirror.includes('loadSettingFromDesktopMirror'), 'desktop settings mirror must expose setting reads');
assert(settingsMirror.includes('removeSettingFromDesktopMirror'), 'desktop settings mirror must expose setting deletion');
assert(settingsMirror.includes('listDesktopSettingsMirrorKeys'), 'desktop settings mirror must expose mirrored setting keys');
assert(settingsMirror.includes('export interface DesktopSpecialSettingMirrorStatus'), 'desktop settings mirror must expose special setting mirror status');
assert(settingsMirror.includes('listDesktopSpecialSettingMirrors'), 'desktop settings mirror must list dedicated setting mirror status');
assert(settingsMirror.includes('JSON.parse(raw)'), 'desktop special setting status must detect malformed mirror files');
assert(settingsMirror.includes('present: false, valid: false'), 'desktop special setting status must report missing dedicated mirror files');
assert(settingsMirror.includes("error: valid ? undefined : 'invalid desktop special setting mirror'"), 'desktop special setting status must report invalid dedicated mirror records');
assert(settingsMirror.includes('writeSpecialSettingMirror(key, value)'), 'desktop settings mirror must mirror selected large settings into dedicated files');
assert(settingsMirror.includes('isSpecialSettingKey(key)'), 'desktop settings mirror must detect dedicated large setting keys');
assert(settingsMirror.includes('omitSpecialSettingKeys(settings)'), 'desktop settings mirror must omit dedicated large settings from config/settings.json');
assert(settingsMirror.includes('delete next[key]'), 'desktop settings mirror must clean stale dedicated setting keys from config/settings.json');
assert(settingsMirror.includes('readSpecialSettingMirror<T>(key)'), 'desktop settings reads must prefer selected dedicated setting files');
assert(settingsMirror.includes('removeSpecialSettingMirror(key)'), 'desktop settings deletion must remove selected dedicated setting files');
assert(settingsMirror.includes('keys.add(key)'), 'desktop settings key listing must include dedicated setting files');
assert(settingsMirror.includes('createAppStorageAdapter'), 'desktop settings mirror must write through the storage adapter');
assert(settingsMirror.includes('isDesktopRuntime()'), 'desktop settings mirror must no-op outside desktop runtime');

const assetMirror = read('services/desktop/desktopAssetMirror.ts');
assert(assetMirror.includes("INDEX_PATH = 'assets/index.json'"), 'desktop asset mirror must keep a local asset index');
assert(assetMirror.includes('ASSET_METADATA_RE = /\\.meta\\.json$/'), 'desktop asset mirror must recognize asset metadata files');
assert(assetMirror.includes('assets/generated-images/${sanitizeAssetId(id)}.${extensionForMimeType(mimeType)}'), 'desktop asset mirror must write generated image files under assets/generated-images');
assert(assetMirror.includes('assets/generated-images/${sanitizeAssetId(id)}.meta.json'), 'desktop asset mirror must write generated image metadata files');
assert(assetMirror.includes('mirrorAssetRecordsToDesktop'), 'desktop asset mirror must expose asset mirroring');
assert(assetMirror.includes('loadDesktopAssetRecords'), 'desktop asset mirror must expose local asset payload reads');
assert(assetMirror.includes('replaceDesktopAssetMirror'), 'desktop asset mirror must expose full asset mirror replacement');
assert(assetMirror.includes('listDesktopAssetMirror'), 'desktop asset mirror must expose mirrored asset summaries');
assert(assetMirror.includes('repairDesktopAssetMirrorIndex'), 'desktop asset mirror must expose manual index repair');
assert(assetMirror.includes('DesktopAssetMirrorHealth'), 'desktop asset mirror must expose health diagnostics');
assert(assetMirror.includes('inspectDesktopAssetMirrorHealth'), 'desktop asset mirror must expose a read-only health inspector');
assert(assetMirror.includes('readAssetIndexForHealth'), 'desktop asset mirror health checks must inspect index status without rebuilding it');
assert(assetMirror.includes('missingPayloadFiles'), 'desktop asset mirror health must report missing image payload files');
assert(assetMirror.includes('missingIndexedMetadataFiles'), 'desktop asset mirror health must report indexed assets whose metadata is missing');
assert(assetMirror.includes('orphanMetadataFiles'), 'desktop asset mirror health must report metadata files absent from the index');
assert(assetMirror.includes('rebuildAssetIndexFromMetadata'), 'desktop asset mirror must rebuild the index from metadata records');
assert(assetMirror.includes('const index = await rebuildAssetIndexFromMetadata()'), 'desktop asset mirror repair must rebuild from metadata records');
assert(assetMirror.includes("adapter.list('assets/generated-images')"), 'desktop asset mirror index rebuild must scan generated image metadata');
assert(assetMirror.includes('const metadataPath = `assets/generated-images/${fileName}`'), 'desktop asset mirror index rebuild must address metadata files by path');
assert(assetMirror.includes('const record = await adapter.readJson<DesktopAssetMirrorRecord>(metadataPath)'), 'desktop asset mirror index rebuild must read asset metadata records');
assert(assetMirror.includes("record?.kind !== 'kaituoyishi-desktop-asset'"), 'desktop asset mirror index rebuild must validate metadata kind');
assert(assetMirror.includes('path: record.filePath'), 'desktop asset mirror index rebuild must recover image file paths from metadata');
assert(assetMirror.includes('await writeAssetIndex(index.assets)'), 'desktop asset mirror index rebuild must write back a recovered index');
assert(assetMirror.includes('asset index read failed, trying metadata scan'), 'desktop asset mirror must fall back to metadata scan when the index cannot be parsed');
assert(assetMirror.includes('skip unreadable asset payload'), 'desktop asset mirror must skip unreadable asset payloads without failing the whole load');
assert(assetMirror.includes('DesktopAssetMaintenanceSummary'), 'desktop asset mirror must expose asset maintenance summaries');
assert(assetMirror.includes('summarizeDesktopAssetMirror'), 'desktop asset mirror must expose asset usage summaries');
assert(assetMirror.includes('cleanupUnreferencedDesktopAssets'), 'desktop asset mirror must expose unreferenced asset cleanup');
assert(assetMirror.includes('referencedAssetIds: Iterable<string>'), 'desktop asset maintenance must be driven by referenced asset ids');
assert(assetMirror.includes('orphanAssets'), 'desktop asset maintenance must report orphan asset counts');
assert(assetMirror.includes('orphanBytes'), 'desktop asset maintenance must report orphan asset bytes');
assert(assetMirror.includes('await adapter.remove(asset.path)'), 'desktop asset cleanup must remove orphan image files');
assert(assetMirror.includes('await adapter.remove(asset.metadataPath)'), 'desktop asset cleanup must remove orphan metadata files');
assert(assetMirror.includes("kind: 'kaituoyishi-desktop-asset'"), 'desktop asset mirror records must carry a stable kind');
assert(assetMirror.includes('writeBase64File'), 'desktop asset mirror must write real image files, not only JSON records');
assert(assetMirror.includes('readBase64File'), 'desktop asset mirror must read real image files back into save payloads');
assert(assetMirror.includes('data:${mimeType};base64,${base64Content}'), 'desktop asset mirror must rebuild data URLs from local image files');
assert(assetMirror.includes('parseDataImage'), 'desktop asset mirror must parse data URL payloads');
assert(assetMirror.includes('extensionForMimeType'), 'desktop asset mirror must choose image extensions from MIME types');
assert(assetMirror.includes('metadataPath'), 'desktop asset mirror index must track metadata paths');
assert(assetMirror.includes('sanitizeAssetId'), 'desktop asset mirror must sanitize asset filenames');
assert(assetMirror.includes('createAppStorageAdapter'), 'desktop asset mirror must write through the storage adapter');
assert(assetMirror.includes('isDesktopRuntime()'), 'desktop asset mirror must no-op outside desktop runtime');

const saveBackup = read('services/desktop/desktopSaveBackup.ts');
assert(saveBackup.includes("kind: 'kaituoyishi-desktop-save-backup'"), 'desktop save backups must carry a stable kind');
assert(saveBackup.includes("BACKUP_DIR = 'backups'"), 'desktop save backups must write under the backups directory');
assert(saveBackup.includes("BACKUP_PREFIX = 'desktop-save-backup-'"), 'desktop save backups must use a stable filename prefix');
assert(saveBackup.includes('writeDesktopSaveBackup'), 'desktop save backup service must expose backup writes');
assert(saveBackup.includes('listDesktopSaveBackups'), 'desktop save backup service must expose backup listing');
assert(saveBackup.includes('loadDesktopSaveBackup'), 'desktop save backup service must expose backup reads');
assert(saveBackup.includes('deleteDesktopSaveBackup'), 'desktop save backup service must expose backup deletion');
assert(saveBackup.includes('isBackupPath'), 'desktop save backup reads must validate backup paths');
assert(saveBackup.includes("backupPath.startsWith(`${BACKUP_DIR}/${BACKUP_PREFIX}`)"), 'desktop save backup reads must stay inside the backup namespace');
assert(saveBackup.includes('await adapter.remove(backupPath)'), 'desktop save backup deletion must remove only validated backup paths');
assert(saveBackup.includes('stripSaveAssetPayloadForStorage'), 'desktop save backups must strip embedded image payloads before writing backup JSON');
assert(saveBackup.includes('const strippedSaves = saves.map((save) => stripSaveAssetPayloadForStorage(save))'), 'desktop save backups must build a stripped save list');
assert(saveBackup.includes('DesktopSaveBackupIntegrityStatus'), 'desktop save backups must expose integrity status');
assert(saveBackup.includes("'unreadable'"), 'desktop save backups must expose unreadable backup status');
assert(saveBackup.includes('reason?: DesktopSaveBackupReason'), 'desktop save backup summaries must allow unreadable backups without a reason');
assert(saveBackup.includes('error?: string'), 'desktop save backup summaries must carry unreadable backup errors');
assert(saveBackup.includes("algorithm: 'SHA-256'"), 'desktop save backups must record the SHA-256 algorithm');
assert(saveBackup.includes('const integrity = await buildDesktopSaveBackupIntegrity(strippedSaves)'), 'desktop save backups must hash stripped save payloads');
assert(saveBackup.includes('checksum: await sha256Hex(payload)'), 'desktop save backups must store a backup payload checksum');
assert(saveBackup.includes('payloadBytes: new TextEncoder().encode(payload).byteLength'), 'desktop save backups must store backup payload size');
assert(saveBackup.includes("integrityStatus: 'verified'"), 'new desktop save backup summaries must report verified integrity');
assert(saveBackup.includes('const integrityStatus = await verifyDesktopSaveBackupIntegrity(record)'), 'desktop save backup reads must verify backup integrity');
assert(saveBackup.includes("if (integrityStatus === 'mismatch')"), 'desktop save backup reads must reject checksum mismatches');
assert(saveBackup.includes('桌面本地备份校验失败'), 'desktop save backup mismatch failures must be explicit');
assert(saveBackup.includes("if (!record.integrity) return 'missing'"), 'desktop save backups must keep old backups without integrity readable');
assert(saveBackup.includes("return current.checksum === record.integrity.checksum"), 'desktop save backups must compare computed and stored checksums');
assert(saveBackup.includes("globalThis.crypto.subtle.digest('SHA-256'"), 'desktop save backups must use browser crypto for checksums');
assert(saveBackup.includes('buildUnreadableBackupSummary'), 'desktop save backup listing must build unreadable backup summaries');
assert(saveBackup.includes('skip unreadable backup'), 'desktop save backup listing must skip bad files without breaking the list');
assert(saveBackup.includes("integrityStatus: 'unreadable'"), 'desktop save backup listing must mark bad backup files as unreadable');
assert(saveBackup.includes('createdAt: 0'), 'desktop unreadable backup summaries must avoid fake timestamps');
assert(saveBackup.includes('count: strippedSaves.length'), 'desktop save backups must record the stripped save count');
assert(saveBackup.includes('saves: strippedSaves'), 'desktop save backups must include stripped save payloads');
assert(saveBackup.includes('formatBackupTimestamp'), 'desktop save backups must use filesystem-safe timestamps');
assert(saveBackup.includes('createAppStorageAdapter'), 'desktop save backups must write through the storage adapter');
assert(saveBackup.includes('isDesktopRuntime()'), 'desktop save backups must no-op outside desktop runtime');

const migrationBackup = read('services/desktop/desktopMigrationBackup.ts');
assert(migrationBackup.includes("kind: 'kaituoyishi-desktop-migration-backup'"), 'desktop migration backups must carry a stable kind');
assert(migrationBackup.includes("BACKUP_PREFIX = 'desktop-migration-backup-'"), 'desktop migration backups must use a stable filename prefix');
assert(migrationBackup.includes("DesktopMigrationBackupReason = 'before-migration'"), 'desktop migration backups must use an explicit before-migration reason');
assert(migrationBackup.includes("TEXT_DIRS = ['saves', 'saves/transactions', 'saves/deltas', 'config', 'zhiku', 'worldbooks', 'assets']"), 'desktop migration backups must include desktop mirror and config directories');
assert(migrationBackup.includes("GENERATED_ASSET_DIR = 'assets/generated-images'"), 'desktop migration backups must include generated image payloads');
assert(migrationBackup.includes('writeDesktopMigrationBackup'), 'desktop migration backup service must expose backup writes');
assert(migrationBackup.includes('listDesktopMigrationBackups'), 'desktop migration backup service must expose backup listing');
assert(migrationBackup.includes('previewDesktopMigrationBackup'), 'desktop migration backup service must expose migration backup previews');
assert(migrationBackup.includes('DesktopMigrationBackupPreview'), 'desktop migration backup service must type migration backup previews');
assert(migrationBackup.includes('stripSaveAssetPayloadForStorage'), 'desktop migration backups must strip embedded image payloads from IndexedDB save snapshots');
assert(migrationBackup.includes('adapter.readText(path)'), 'desktop migration backups must read text mirror files');
assert(migrationBackup.includes('adapter.readBase64File(path)'), 'desktop migration backups must read binary asset payloads as base64');
assert(migrationBackup.includes("algorithm: 'SHA-256'"), 'desktop migration backups must record SHA-256 integrity');
assert(migrationBackup.includes('payloadBytes: new TextEncoder().encode(payload).byteLength'), 'desktop migration backups must record payload size');
assert(migrationBackup.includes('verifyDesktopMigrationBackupIntegrity'), 'desktop migration backup service must verify listed backups');
assert(migrationBackup.includes("integrityStatus: 'unreadable'"), 'desktop migration backup service must mark unreadable backups');

const diagnostics = read('services/desktop/desktopDiagnostics.ts');
assert(diagnostics.includes("kind: 'kaituoyishi-desktop-diagnostic-report'"), 'desktop diagnostics must write a stable report kind');
assert(diagnostics.includes("LOG_DIR = 'logs'"), 'desktop diagnostics must write under the logs directory');
assert(diagnostics.includes("REPORT_PREFIX = 'diagnostic-report-'"), 'desktop diagnostics must use a stable report filename prefix');
assert(diagnostics.includes('writeDesktopDiagnosticReport'), 'desktop diagnostics must expose diagnostic report writes');
assert(diagnostics.includes('listDesktopDiagnosticReports'), 'desktop diagnostics must expose diagnostic report listing');
assert(diagnostics.includes('loadDesktopDiagnosticReport'), 'desktop diagnostics must expose diagnostic report reads');
assert(diagnostics.includes('deleteDesktopDiagnosticReport'), 'desktop diagnostics must expose diagnostic report deletion');
assert(diagnostics.includes('DesktopDiagnosticReportInput'), 'desktop diagnostics must accept explicit diagnostic input');
assert(diagnostics.includes('DesktopDiagnosticReportSummary'), 'desktop diagnostics must expose report summaries');
assert(diagnostics.includes('DesktopSpecialSettingMirrorStatus'), 'desktop diagnostics must type dedicated setting mirror status');
assert(diagnostics.includes('specialSettingMirrors: DesktopSpecialSettingMirrorStatus[]'), 'desktop diagnostics must include dedicated setting mirror status');
assert(diagnostics.includes('specialSettingMirrors: input.specialSettingMirrors'), 'desktop diagnostics must write dedicated setting mirror status into reports');
assert(diagnostics.includes('assetSummary'), 'desktop diagnostics must include asset usage summary');
assert(diagnostics.includes('latestBackup'), 'desktop diagnostics must include latest backup summary');
assert(diagnostics.includes('unreadableDesktopBackupCount'), 'desktop diagnostics must include unreadable backup count');
assert(diagnostics.includes('desktopMigrationBackupCount'), 'desktop diagnostics must include migration backup counts');
assert(diagnostics.includes('unreadableDesktopMigrationBackupCount'), 'desktop diagnostics must include unreadable migration backup counts');
assert(diagnostics.includes('latestMigrationBackup'), 'desktop diagnostics must include latest migration backup summary');
assert(diagnostics.includes('desktopMigrationBackupPreview'), 'desktop diagnostics must include migration backup preview data');
assert(diagnostics.includes('saveMirrorHealth'), 'desktop diagnostics must include save mirror health');
assert(diagnostics.includes('saveDeltaMirrorHealth'), 'desktop diagnostics must include save delta mirror health');
assert(diagnostics.includes('assetMirrorHealth'), 'desktop diagnostics must include asset mirror health');
assert(diagnostics.includes("'integrityStatus'"), 'desktop diagnostics must include latest backup integrity status');
assert(diagnostics.includes('integrity: input.latestBackup.integrity'), 'desktop diagnostics must include latest backup integrity metadata');
assert(diagnostics.includes('updateStatus'), 'desktop diagnostics must include update status');
assert(diagnostics.includes('releaseInfo'), 'desktop diagnostics must accept desktop release info');
assert(diagnostics.includes('release: input.releaseInfo'), 'desktop diagnostics must write desktop release info into reports');
assert(diagnostics.includes('lastError'), 'desktop diagnostics must include the last local error');
assert(diagnostics.includes('userAgent'), 'desktop diagnostics may include user agent for local troubleshooting');
assert(diagnostics.includes('skip unreadable diagnostic report'), 'desktop diagnostic report listing must skip unreadable reports without failing the whole list');
assert(diagnostics.includes('isDiagnosticReportPath'), 'desktop diagnostics must validate report paths');
assert(diagnostics.includes("reportPath.startsWith(`${LOG_DIR}/${REPORT_PREFIX}`)"), 'desktop diagnostics must stay inside the logs namespace');
assert(diagnostics.includes('await adapter.remove(reportPath)'), 'desktop diagnostics deletion must remove only validated reports');
assert(diagnostics.includes('createAppStorageAdapter'), 'desktop diagnostics must write through the storage adapter');
assert(diagnostics.includes('isDesktopRuntime()'), 'desktop diagnostics must no-op outside desktop runtime');

const releaseInfo = read('services/desktop/desktopReleaseInfo.ts');
assert(releaseInfo.includes('interface DesktopReleaseInfo'), 'desktop release info must expose a typed release info payload');
assert(releaseInfo.includes('buildDesktopReleaseInfo'), 'desktop release info must expose a builder');
assert(releaseInfo.includes('DEFAULT_UPDATE_ENDPOINT'), 'desktop release info must keep the update endpoint in one place');
assert(releaseInfo.includes("releaseSource: 'bundled'"), 'desktop release info must identify bundled desktop releases');
assert(releaseInfo.includes('updateAvailable'), 'desktop release info must include update availability');
assert(releaseInfo.includes('latestVersion'), 'desktop release info must include the latest available version');
assert(releaseInfo.includes('updateStatus.body'), 'desktop release info must use update release notes when available');
assert(releaseInfo.includes('isDesktopRuntime()'), 'desktop release info must no-op outside desktop runtime');

const storageAdapter = read('services/storage/appStorageAdapter.ts');
assert(storageAdapter.includes('interface AppStorageAdapter'), 'storage adapter interface must exist');
assert(storageAdapter.includes('class DesktopAppStorageAdapter'), 'desktop storage adapter implementation must exist');
assert(storageAdapter.includes("invoke<string | null>('desktop_read_text'"), 'desktop storage adapter must read through Tauri');
assert(storageAdapter.includes("invoke('desktop_write_text_atomic'"), 'desktop storage adapter must write text through the atomic Tauri command');
assert(storageAdapter.includes("invoke('desktop_write_base64_file'"), 'desktop storage adapter must write base64 image files through Tauri');
assert(storageAdapter.includes("invoke<string | null>('desktop_read_base64_file'"), 'desktop storage adapter must read base64 image files through Tauri');
assert(storageAdapter.includes("invoke<string[]>('desktop_list'"), 'desktop storage adapter must list through Tauri');
assert(storageAdapter.includes("invoke('desktop_remove'"), 'desktop storage adapter must remove through Tauri');
assert(storageAdapter.includes('createAppStorageAdapter'), 'storage adapter factory must choose runtime implementation');
assert(storageAdapter.includes('isDesktopRuntime() ? new DesktopAppStorageAdapter()'), 'storage adapter factory must use desktop adapter in desktop runtime');
assert(storageAdapter.includes("part === '..'"), 'storage adapter must reject parent-directory traversal');
for (const method of ['readText', 'writeText', 'readJson', 'writeJson', 'list', 'remove']) {
  assert(storageAdapter.includes(method), `storage adapter must include ${method}`);
}

const dbService = read('services/dbService.ts');
assert(dbService.includes('mirrorSaveToDesktop'), 'saveGame must mirror saves into the desktop data directory');
assert(dbService.includes('reserveDesktopSaveId'), 'saveGame must reserve desktop save ids before the IndexedDB compatibility write');
assert(dbService.includes('const desktopSaveId = await reserveDesktopSaveIdSafely(db)'), 'saveGame must reserve a desktop save id before opening the write transaction');
assert(dbService.indexOf('const desktopSaveId = await reserveDesktopSaveIdSafely(db)') < dbService.indexOf('saved = await new Promise<{ id: number; save:'), 'desktop save id reservation must happen before the IndexedDB write transaction');
assert(dbService.includes('writeDesktopPrimarySaveBeforeIndexedDbSafely'), 'desktop saveGame must expose a desktop-primary write helper');
assert(dbService.includes('const desktopPrimaryWritten = desktopPrimarySave'), 'desktop saveGame must attempt a desktop-primary write before the IndexedDB compatibility cache');
assert(dbService.includes('beginDesktopSaveTransaction'), 'desktop saveGame must mark pending desktop save transactions');
assert(dbService.includes('finishDesktopSaveTransaction'), 'desktop saveGame must clear desktop save transactions after file writes complete');
assert(
  dbService.includes('transactionId = await beginDesktopSaveTransaction(Number(save.id) || 0, {'),
  'desktop saveGame must write transaction markers before save files with expected child files',
);
assert(dbService.includes('deltaNodeId: delta?.nodeId'), 'desktop saveGame must record the expected delta node in transaction markers');
assert(dbService.includes('assetIds: assetRecords.map((record) => record.id).filter(Boolean)'), 'desktop saveGame must record expected asset ids in transaction markers');
assert(
  dbService.includes('await mirrorAssetRecordsToDesktop(assetRecords);\n    await finishDesktopSaveTransaction(Number(save.id) || 0, transactionId);'),
  'desktop saveGame must clear transaction markers after save, delta, and asset files are written',
);
assert(
  dbService.indexOf('await writeDesktopPrimarySaveBeforeIndexedDbSafely(desktopPrimarySave, desktopPrimaryDelta, assetRecords)') < dbService.indexOf('const saveForIndexedDb = desktopSaveId ? { ...rest, id: desktopSaveId } : rest'),
  'desktop saveGame must write desktop files before writing the IndexedDB compatibility cache',
);
assert(dbService.includes('IndexedDB compatibility save failed after desktop primary write'), 'desktop saveGame must tolerate IndexedDB cache failure after a desktop-primary write');
assert(dbService.includes('desktop primary save write failed, falling back to IndexedDB primary write'), 'desktop saveGame must fall back to IndexedDB primary when desktop file writes fail');
assert(dbService.includes('const saveForIndexedDb = desktopSaveId ? { ...rest, id: desktopSaveId } : rest'), 'desktop save id reservation must be used as the IndexedDB compatibility key');
assert(dbService.includes('const request = store.add(saveForIndexedDb as'), 'saveGame must write the reserved desktop id into the compatibility store when available');
assert(dbService.includes('getNextIndexedSaveIdFloor(db)'), 'desktop save id reservation must use current IndexedDB max id as a floor');
assert(dbService.includes('save id reservation failed, falling back to IndexedDB autoIncrement'), 'desktop save id reservation failures must fall back to IndexedDB autoIncrement');
assert(dbService.includes('listDesktopSaveMirror'), 'dbService must read the desktop save mirror index');
assert(dbService.includes('loadDesktopSaveMirrorSave'), 'dbService must read a single desktop mirrored save');
assert(dbService.includes('loadDesktopSaveMirrorSaves'), 'dbService must be able to restore saves from desktop mirrors');
assert(dbService.includes('removeSaveFromDesktopMirror'), 'delete and rotation must remove desktop save mirrors');
assert(dbService.includes('replaceDesktopSaveMirror'), 'replaceAllSaves must replace the desktop save mirror');
assert(dbService.includes('if (!desktopPrimaryWritten || saved.id !== desktopSaveId)'), 'saveGame must keep legacy mirroring as a fallback when desktop-primary writes are unavailable');
assert(dbService.includes('mirrorDesktopSaveSafely(saved.save)'), 'saveGame must still mirror the persisted save on fallback paths');
assert(dbService.includes('mirrorDesktopSaveDeltaSafely(saved.delta)'), 'saveGame must still mirror save node deltas on fallback paths');
assert(dbService.includes('loadDesktopSaveNodeDeltaSafely(nodeId)'), 'delta restore must read desktop delta mirrors before IndexedDB');
assert(dbService.includes('loadDesktopSaveNodeDeltasSafely'), 'dbService must read desktop delta lists for base reference checks');
assert(dbService.includes('loadDeltaBaseCandidateSummaries'), 'auto-save delta base selection must merge IndexedDB and desktop mirror summaries');
assert(dbService.includes('const desktopSummaries = await loadDesktopSaveMirrorListFirstSafely()'), 'auto-save delta base selection must use desktop mirror summaries');
assert(dbService.includes('loadDeltaBaseCandidateSave'), 'auto-save delta base selection must load base saves through a desktop fallback helper');
assert(dbService.includes('return loadDesktopSaveMirrorSaveFallbackSafely(id)'), 'auto-save delta base selection must fall back to desktop mirrored saves when IndexedDB misses a candidate');
assert(dbService.includes('const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId)'), 'delta-only save restore must load base saves through the desktop fallback helper');
assert(
  dbService.indexOf('const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId)') < dbService.indexOf('return restoreSaveFromDelta(base, save, delta)'),
  'delta-only save restore must resolve the base save through desktop fallback before merging delta payloads',
);
assert(dbService.includes('removeDesktopSaveDeltasBySaveIdSafely(item.id)'), 'managed save pruning must clean desktop delta mirrors');
assert(dbService.includes('removeDesktopSaveDeltasBySaveIdSafely(id)'), 'deleteSave must clean desktop delta mirrors');
assert(dbService.includes('replaceDesktopSaveDeltaMirrorSafely(mirroredDeltas)'), 'replaceAllSaves must rebuild desktop delta mirrors');
assert(dbService.includes('loadAllDeltaRecords(db)'), 'delta base checks must merge IndexedDB and desktop delta records');
assert(dbService.includes('const desktopList = await loadDesktopSaveMirrorListFirstSafely()'), 'getSaveList must prefer desktop mirror summaries in desktop runtime');
assert(dbService.includes('if (desktopList.length > 0)'), 'getSaveList must use desktop mirror summaries before IndexedDB when available');
assert(
  dbService.indexOf('const desktopList = await loadDesktopSaveMirrorListFirstSafely()') < dbService.indexOf('let list = sortSaveSummaries(await readSaveSummaries(db))'),
  'getSaveList must try the desktop save mirror before reading IndexedDB summaries',
);
assert(dbService.includes('return loadDesktopSaveMirrorListFallbackSafely()'), 'getSaveList must still fall back to desktop mirror summaries when IndexedDB summaries are empty');
assert(dbService.includes('const desktopSave = await loadDesktopSaveMirrorSaveFirstSafely(id)'), 'loadSave must prefer a desktop mirrored save in desktop runtime');
assert(dbService.includes('if (desktopSave) return restoreDesktopAssetPayloadSafely(desktopSave)'), 'loadSave must restore local desktop asset payloads before returning mirrored saves');
assert(
  dbService.indexOf('const desktopSave = await loadDesktopSaveMirrorSaveFirstSafely(id)') < dbService.indexOf('const db = await openDB();\n  const save = await loadRawSave(db, id)'),
  'loadSave must try the desktop save mirror before opening IndexedDB',
);
assert(dbService.includes('const fallbackSave = await loadDesktopSaveMirrorSaveFallbackSafely(id)'), 'loadSave must still fall back to a desktop mirrored save when IndexedDB misses the record');
assert(dbService.includes('return fallbackSave ? restoreDesktopAssetPayloadSafely(fallbackSave) : null'), 'desktop fallback saves must also restore local asset payloads');
assert(dbService.includes('loadDesktopSaveMirrorListFirstSafely'), 'dbService must wrap desktop mirror list priority reads safely');
assert(dbService.includes('loadDesktopSaveMirrorListFallbackSafely'), 'dbService must wrap desktop mirror list fallback safely');
assert(dbService.includes('loadDesktopSaveMirrorSaveFirstSafely'), 'dbService must wrap desktop mirror save priority reads safely');
assert(dbService.includes('loadDesktopSaveMirrorSaveFallbackSafely'), 'dbService must wrap desktop mirror save fallback safely');
assert(dbService.includes('const mirroredSave = await loadDesktopSaveMirrorSaveFirstSafely(item.id)'), 'desktop asset reference collection must prefer mirrored saves');
assert(dbService.includes('await loadDesktopSaveMirrorSaveFallbackSafely(item.id)'), 'desktop asset reference collection must still use mirrored saves when IndexedDB misses records');
assert(dbService.includes('save mirror list priority read failed'), 'desktop mirror list priority failures must not break IndexedDB reads');
assert(dbService.includes('save mirror priority load failed'), 'desktop mirror save priority failures must not break IndexedDB reads');
assert(dbService.includes('save mirror list fallback failed'), 'desktop mirror list fallback failures must not break IndexedDB reads');
assert(dbService.includes('save mirror load fallback failed'), 'desktop mirror save fallback failures must not break IndexedDB reads');
assert(dbService.includes('removeDesktopSaveMirrorSafely(item.id)'), 'managed save pruning must clean desktop save mirrors');
assert(dbService.includes('rebuildIndexedSaveCacheFromDesktopMirror'), 'dbService must expose explicit IndexedDB cache rebuild from desktop mirror files');
assert(dbService.includes('restoreSavesFromDesktopMirror'), 'dbService must expose desktop mirror recovery');
assert(dbService.includes('return rebuildIndexedSaveCacheFromDesktopMirror();'), 'desktop mirror recovery must delegate to the explicit IndexedDB cache rebuild path');
assert(dbService.includes('restoreSavesFromDesktopBackup'), 'dbService must expose desktop backup recovery');
assert(dbService.includes('backupCurrentSavesToDesktop'), 'dbService must expose desktop save backup creation');
assert(dbService.includes("backupCurrentSavesToDesktop('before-restore')"), 'desktop mirror recovery must back up current saves before replacing them');
assert(dbService.includes('const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(mirroredSaves)'), 'desktop mirror recovery must restore image payloads before replacement');
assert(dbService.includes('replaceAllSaves(restoredSaves, { skipDesktopBackup: true })'), 'desktop mirror recovery must reuse the save replacement path after asset restoration');
assert(dbService.indexOf("backupCurrentSavesToDesktop('before-restore')") < dbService.indexOf('const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(mirroredSaves)'), 'desktop mirror recovery must backup before restoring payloads');
assert(dbService.indexOf('const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(mirroredSaves)') < dbService.indexOf('replaceAllSaves(restoredSaves, { skipDesktopBackup: true })'), 'desktop mirror recovery must restore payloads before replaceAllSaves');
assert(dbService.includes('loadDesktopSaveBackup'), 'dbService must load desktop backup files for recovery');
assert(dbService.includes('const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(backup.saves)'), 'desktop backup recovery must restore image payloads before replacement');
assert(dbService.includes('restoreDesktopAssetPayloadForSavesSafely'), 'dbService must expose a helper for restoring payloads across save lists');
assert(dbService.indexOf("backupCurrentSavesToDesktop('before-restore')") < dbService.indexOf('const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(backup.saves)'), 'desktop backup recovery must backup before restoring payloads');
assert(dbService.includes('writeDesktopSaveBackup'), 'dbService must write desktop save backups through the backup service');
assert(dbService.includes('loadCurrentSavesForDesktopBackup'), 'dbService must load current saves before writing a backup');
assert(dbService.includes('if (!isDesktopRuntime()) return null'), 'dbService desktop backups must no-op before reading large saves in web runtime');
assert(dbService.includes("desktopBackupReason ?? 'before-replace'"), 'bulk save replacement must create a desktop backup by default');
assert(saveBackup.includes("'before-repair'"), 'desktop save backups must support repair guard backups');
assert(dbService.includes('backupDesktopStateBeforeOneTimeMigration'), 'dbService must expose a one-time migration backup entrypoint');
assert(dbService.includes("writeDesktopMigrationBackup(currentSaves, 'before-migration')"), 'one-time migration backups must include current readable saves and desktop file snapshots');
assert(dbService.includes('previewDesktopStateBeforeOneTimeMigration'), 'dbService must expose a one-time migration backup preview entrypoint');
assert(dbService.includes("previewDesktopMigrationBackup(currentSaves, 'before-migration')"), 'one-time migration backup previews must inspect current readable saves and desktop file snapshots');
assert(dbService.includes('mirrorSettingToDesktop'), 'saveSetting must mirror settings into the desktop config directory');
assert(dbService.includes('loadSettingFromDesktopMirror'), 'loadSetting must read the desktop config mirror');
assert(dbService.includes('removeSettingFromDesktopMirror'), 'deleteSetting must clean the desktop config mirror');
assert(dbService.includes('await mirrorSettingToDesktop(key, value)'), 'desktop saveSetting must write desktop config files first');
assert(dbService.includes('await cacheIndexedSettingSafely(key, value)'), 'desktop saveSetting must keep IndexedDB as a compatibility cache');
assert(dbService.indexOf('await mirrorSettingToDesktop(key, value)') < dbService.indexOf('await cacheIndexedSettingSafely(key, value)'), 'desktop saveSetting must write desktop config before updating IndexedDB cache');
assert(dbService.includes('await removeSettingFromDesktopMirror(key)'), 'desktop deleteSetting must remove desktop config files first');
assert(dbService.includes('await deleteIndexedSettingSafely(key)'), 'desktop deleteSetting must keep IndexedDB deletion as a compatibility cache cleanup');
assert(dbService.indexOf('await removeSettingFromDesktopMirror(key)') < dbService.indexOf('await deleteIndexedSettingSafely(key)'), 'desktop deleteSetting must remove desktop config before cleaning IndexedDB cache');
assert(dbService.includes('cacheIndexedSettingSafely'), 'dbService must wrap IndexedDB setting cache writes safely');
assert(dbService.includes('deleteIndexedSettingSafely'), 'dbService must wrap IndexedDB setting cache deletes safely');
assert(dbService.includes('IndexedDB setting cache write failed'), 'desktop setting cache write failures must not break desktop config writes');
assert(dbService.includes('IndexedDB setting cache delete failed'), 'desktop setting cache delete failures must not break desktop config deletion');
assert(dbService.includes('const desktopValue = await loadDesktopSettingFirstSafely<T>(key)'), 'loadSetting must prefer desktop settings in desktop runtime');
assert(dbService.includes('if (desktopValue !== null) return desktopValue'), 'loadSetting must return desktop settings before IndexedDB when available');
assert(
  dbService.indexOf('const desktopValue = await loadDesktopSettingFirstSafely<T>(key)') < dbService.indexOf('const db = await openDB();\n  const indexedValue = await new Promise<T | null>'),
  'loadSetting must try the desktop setting mirror before opening IndexedDB',
);
assert(dbService.includes('loadDesktopSettingFirstSafely'), 'dbService must wrap desktop setting priority reads safely');
assert(dbService.includes('loadDesktopSettingFallbackSafely<T>(key)'), 'loadSetting must still fall back to the desktop setting mirror when IndexedDB is empty');
assert(dbService.includes('setting priority load failed'), 'desktop setting priority failures must not break IndexedDB reads');
assert(dbService.includes('mirrorAssetRecordsToDesktop'), 'saveGame must mirror album image assets into the desktop asset directory');
assert(dbService.includes('loadDesktopAssetRecords'), 'dbService must load desktop asset mirror payloads when reading saves');
assert(dbService.includes('restoreDesktopAssetPayloadSafely'), 'dbService must restore desktop asset payloads from local image files');
assert(dbService.includes('loadDesktopAssetRecordsSafely'), 'dbService must wrap desktop asset mirror reads safely');
assert(dbService.includes('asset mirror load failed'), 'desktop asset mirror read failures must not break save loading');
assert(dbService.includes('replaceDesktopAssetMirror'), 'replaceAllSaves must rebuild the desktop asset mirror');
assert(dbService.includes('mirrorDesktopAssetsSafely(assetRecords)'), 'saveGame must mirror extracted asset records after saving');
assert(dbService.includes('replaceDesktopAssetMirrorSafely(mirroredAssetRecords)'), 'replaceAllSaves must rebuild desktop asset mirrors from imported saves');
assert(dbService.includes('summarizeDesktopAssets'), 'dbService must expose desktop asset usage summaries');
assert(dbService.includes('cleanupUnreferencedDesktopAssets'), 'dbService must expose desktop asset cleanup');
assert(dbService.includes('collectReferencedDesktopAssetIds'), 'dbService must collect referenced asset ids before desktop asset maintenance');
assert(dbService.includes('collectSaveAlbumAssetIds(restoredSave)'), 'desktop asset maintenance must use restored saves to collect album asset references');
assert(dbService.includes('cleanupDesktopAssetMirror(referencedAssetIds)'), 'dbService must clean desktop assets using the referenced asset set');

const storageManager = read('components/features/Settings/StorageManager.tsx');
assert(storageManager.includes('DesktopStorageStatus'), 'storage manager must render desktop status');
assert(storageManager.includes('buildDesktopReleaseInfo'), 'storage manager must build desktop release info');
assert(storageManager.includes('desktopReleaseInfo'), 'storage manager must keep desktop release info state');
assert(storageManager.includes('releaseInfo={desktopReleaseInfo}'), 'storage manager must pass release info to desktop status');
assert(storageManager.includes('releaseInfo: desktopReleaseInfo'), 'storage manager must include release info in diagnostic reports');
assert(storageManager.includes('发行版本'), 'storage manager must show desktop release title');
assert(storageManager.includes('更新源'), 'storage manager must show the desktop update endpoint');
assert(storageManager.includes('发行说明'), 'storage manager must show desktop release notes');
assert(storageManager.includes('关于 / 更新'), 'storage manager must expose a dedicated desktop about/update area');
assert(storageManager.includes('当前版本'), 'desktop about/update area must show the current desktop version');
assert(storageManager.includes('最新版本'), 'desktop about/update area must show the latest known desktop version');
assert(storageManager.includes('更新渠道'), 'desktop about/update area must show the release/update channel');
assert(storageManager.includes('updateStateLabel'), 'desktop about/update area must expose a compact update state label');
assert(storageManager.includes('发现新版本'), 'desktop about/update area must surface available updates');
assert(storageManager.match(/onClick=\{onCheckUpdate\}/g)?.length === 1, 'desktop update checks must be centralized in the about/update area');
assert(storageManager.match(/onClick=\{onInstallUpdate\}/g)?.length === 1, 'desktop update installation must be centralized in the about/update area');
assert(storageManager.includes('写入桌面探针'), 'storage manager must expose the desktop probe action');
assert(storageManager.includes('打开存档目录'), 'storage manager must expose opening the local save directory');
assert(storageManager.includes("openDesktopDataDir('saves')"), 'storage manager must open the desktop saves directory');
assert(storageManager.includes('打开备份目录'), 'storage manager must expose opening the local backup directory');
assert(storageManager.includes("openDesktopDataDir('backups')"), 'storage manager must open the desktop backups directory');
assert(storageManager.includes('打开日志目录'), 'storage manager must expose opening the local logs directory');
assert(storageManager.includes("openDesktopDataDir('logs')"), 'storage manager must open the desktop logs directory');
assert(storageManager.includes('打开配置目录'), 'storage manager must expose opening the local config directory');
assert(storageManager.includes("openDesktopDataDir('config')"), 'storage manager must open the desktop config directory');
assert(storageManager.includes('打开智库目录'), 'storage manager must expose opening the local zhiku directory');
assert(storageManager.includes("openDesktopDataDir('zhiku')"), 'storage manager must open the desktop zhiku directory');
assert(storageManager.includes('打开世界书目录'), 'storage manager must expose opening the local worldbook directory');
assert(storageManager.includes("openDesktopDataDir('worldbooks')"), 'storage manager must open the desktop worldbooks directory');
assert(storageManager.includes('智库目录'), 'storage manager must show the local zhiku directory path');
assert(storageManager.includes('info?.zhikuDir'), 'storage manager must render the desktop zhiku directory from app info');
assert(storageManager.includes('世界书目录'), 'storage manager must show the local worldbook directory path');
assert(storageManager.includes('info?.worldbookDir'), 'storage manager must render the desktop worldbook directory from app info');
assert(storageManager.includes('打开资源目录'), 'storage manager must expose opening the local asset directory');
assert(storageManager.includes("openDesktopDataDir('assets')"), 'storage manager must open the desktop asset directory');
assert(storageManager.includes('listDesktopSaveMirror'), 'storage manager must show desktop mirror state');
assert(storageManager.includes('inspectDesktopSaveMirrorHealth'), 'storage manager must collect save mirror health for diagnostics');
assert(storageManager.includes('DesktopSaveMirrorHealth'), 'storage manager must type desktop save mirror health');
assert(storageManager.includes('desktopSaveMirrorHealth'), 'storage manager must keep desktop save mirror health state');
assert(storageManager.includes('formatDesktopSaveMirrorHealth'), 'storage manager must render desktop save mirror health summaries');
assert(storageManager.includes('存档镜像健康'), 'storage manager must show save mirror health in the desktop status panel');
assert(storageManager.includes('sequenceIssue'), 'storage manager must count save id sequence health issues');
assert(storageManager.includes('sequenceLabel'), 'storage manager must render save id sequence health labels');
assert(storageManager.includes('序列 ${sequenceLabel}'), 'storage manager must show save id sequence health in the save mirror row');
assert(storageManager.includes('pendingTransactions'), 'storage manager must render pending desktop save transaction counts');
assert(storageManager.includes('unreadableTransactions'), 'storage manager must count unreadable desktop save transactions');
assert(storageManager.includes("DesktopSaveMirrorHealth['sequenceStatus']"), 'storage manager must share mirror status formatting with save id sequence status');
assert(storageManager.includes('inspectDesktopSaveDeltaMirrorHealth'), 'storage manager must collect save delta mirror health for diagnostics');
assert(storageManager.includes('repairDesktopSaveDeltaMirrorIndex'), 'storage manager must repair the desktop save delta mirror index');
assert(storageManager.includes('DesktopSaveDeltaMirrorHealth'), 'storage manager must type desktop save delta mirror health');
assert(storageManager.includes('desktopSaveDeltaMirrorHealth'), 'storage manager must keep desktop save delta mirror health state');
assert(storageManager.includes('formatDesktopSaveDeltaMirrorHealth'), 'storage manager must render desktop save delta mirror health summaries');
assert(storageManager.includes('增量镜像健康'), 'storage manager must show save delta mirror health in the desktop status panel');
assert(storageManager.includes('listDesktopSettingsMirrorKeys'), 'storage manager must show desktop config mirror state');
assert(storageManager.includes('listDesktopSpecialSettingMirrors'), 'storage manager must collect dedicated setting mirror status');
assert(storageManager.includes('listDesktopAssetMirror'), 'storage manager must show desktop asset mirror state');
assert(storageManager.includes('inspectDesktopAssetMirrorHealth'), 'storage manager must collect asset mirror health for diagnostics');
assert(storageManager.includes('DesktopAssetMirrorHealth'), 'storage manager must type desktop asset mirror health');
assert(storageManager.includes('desktopAssetMirrorHealth'), 'storage manager must keep desktop asset mirror health state');
assert(storageManager.includes('formatDesktopAssetMirrorHealth'), 'storage manager must render desktop asset mirror health summaries');
assert(storageManager.includes('资源镜像健康'), 'storage manager must show asset mirror health in the desktop status panel');
assert(storageManager.includes('formatDesktopMirrorIndexStatus'), 'storage manager must share mirror index status labels');
assert(storageManager.includes('summarizeDesktopAssets'), 'storage manager must show desktop asset usage summary');
assert(storageManager.includes('cleanupUnreferencedDesktopAssets'), 'storage manager must expose desktop asset cleanup');
assert(storageManager.includes('repairDesktopSaveMirrorIndex'), 'storage manager must repair the desktop save mirror index');
assert(storageManager.includes("await backupCurrentSavesToDesktop('before-repair')"), 'storage manager must back up current saves before repairing desktop mirror indexes');
assert(storageManager.includes('repairUnresolvedDesktopSaveTransactions'), 'storage manager must run conservative desktop save transaction repair during index repair');
assert(storageManager.includes('repairedTransactions.removedTransactions'), 'storage manager must report cleaned transaction markers');
assert(storageManager.includes('repairedTransactions.retainedTransactions + repairedTransactions.unreadableTransactions'), 'storage manager must report retained transaction markers');
assert(storageManager.includes('repairDesktopAssetMirrorIndex'), 'storage manager must repair the desktop asset mirror index');
assert(storageManager.includes('handleRepairDesktopIndexes'), 'storage manager must expose a desktop index repair handler');
assert(storageManager.includes('repairingDesktopIndexes'), 'storage manager must track desktop index repair progress');
assert(storageManager.includes('desktopIndexRepairSummary'), 'storage manager must show desktop index repair results');
assert(storageManager.includes('已重建本地镜像索引'), 'storage manager must describe non-destructive desktop index repairs');
assert(storageManager.includes('修复镜像索引'), 'storage manager must provide a desktop mirror index repair button');
assert(storageManager.includes('修复中'), 'storage manager must show desktop index repair progress');
assert(storageManager.includes('writeDesktopDiagnosticReport'), 'storage manager must expose desktop diagnostic report export');
assert(storageManager.includes('const specialSettingMirrors = await listDesktopSpecialSettingMirrors()'), 'storage manager must refresh dedicated setting mirror status when exporting diagnostics');
assert(storageManager.includes('const saveMirrorHealth = await inspectDesktopSaveMirrorHealth()'), 'storage manager must inspect save mirror health when exporting diagnostics');
assert(storageManager.includes('const saveDeltaMirrorHealth = await inspectDesktopSaveDeltaMirrorHealth()'), 'storage manager must inspect save delta mirror health when exporting diagnostics');
assert(storageManager.includes('const assetMirrorHealth = await inspectDesktopAssetMirrorHealth()'), 'storage manager must inspect asset mirror health when exporting diagnostics');
assert(storageManager.includes('specialSettingMirrors,'), 'storage manager must pass dedicated setting mirror status into diagnostic reports');
assert(storageManager.includes('saveMirrorHealth,'), 'storage manager must pass save mirror health into diagnostic reports');
assert(storageManager.includes('saveDeltaMirrorHealth,'), 'storage manager must pass save delta mirror health into diagnostic reports');
assert(storageManager.includes('assetMirrorHealth,'), 'storage manager must pass asset mirror health into diagnostic reports');
assert(storageManager.includes('listDesktopDiagnosticReports'), 'storage manager must show desktop diagnostic report history');
assert(storageManager.includes('loadDesktopDiagnosticReport'), 'storage manager must load selected diagnostic reports for export');
assert(storageManager.includes('deleteDesktopDiagnosticReport'), 'storage manager must delete selected diagnostic reports');
assert(storageManager.includes('listDesktopSaveBackups'), 'storage manager must show desktop backup state');
assert(storageManager.includes('backupCurrentSavesToDesktop'), 'storage manager must expose manual desktop backups');
assert(storageManager.includes('backupDesktopStateBeforeOneTimeMigration'), 'storage manager must expose one-time migration backups before deeper desktop storage migration');
assert(storageManager.includes('listDesktopMigrationBackups'), 'storage manager must list one-time migration backups');
assert(storageManager.includes('handleBackupDesktopMigration'), 'storage manager must provide a one-time migration backup handler');
assert(storageManager.includes('backingUpDesktopMigration'), 'storage manager must track one-time migration backup progress');
assert(storageManager.includes('latestDesktopMigrationBackup'), 'storage manager must keep the latest one-time migration backup summary visible');
assert(storageManager.includes('desktopMigrationBackupCount'), 'storage manager must show one-time migration backup counts');
assert(storageManager.includes('unreadableDesktopMigrationBackupCount'), 'storage manager must show unreadable one-time migration backup counts');
assert(storageManager.includes('previewDesktopStateBeforeOneTimeMigration'), 'storage manager must preview one-time migration backup size before writing it');
assert(storageManager.includes('desktopMigrationBackupPreview'), 'storage manager must keep one-time migration backup preview state');
assert(storageManager.includes('迁移预估'), 'storage manager must show the one-time migration backup preview');
assert(storageManager.includes('findLatestVerifiedDesktopMigrationBackup'), 'storage manager must only summarize verified one-time migration backups as latest');
assert(storageManager.includes('countUnreadableDesktopMigrationBackups'), 'storage manager must count unreadable one-time migration backups');
assert(storageManager.includes('latestMigrationBackup: latestDesktopMigrationBackup'), 'storage manager must pass migration backup summary into diagnostics');
assert(storageManager.includes('desktopMigrationBackupPreview,'), 'storage manager must pass migration backup preview into diagnostics');
assert(storageManager.includes('迁移前完整备份'), 'storage manager must label the one-time migration backup entry clearly');
assert(storageManager.includes('此操作只写入备份文件，不会迁移、删除或覆盖当前数据'), 'storage manager must explain one-time migration backup is non-destructive');
assert(storageManager.includes('restoreSavesFromDesktopBackup'), 'storage manager must expose desktop backup recovery');
assert(storageManager.includes('loadDesktopSaveBackup'), 'storage manager must load a selected desktop backup for export');
assert(storageManager.includes('deleteDesktopSaveBackup'), 'storage manager must expose desktop backup deletion');
assert(storageManager.includes('restoreSavesFromDesktopMirror'), 'storage manager must expose desktop mirror recovery');
assert(storageManager.includes('恢复本地镜像'), 'storage manager must provide a desktop mirror restore button');
assert(storageManager.includes('备份到本地'), 'storage manager must provide a manual desktop backup button');
assert(storageManager.includes('恢复最近备份'), 'storage manager must provide a desktop backup restore button');
assert(storageManager.includes('desktopBackups'), 'storage manager must keep a desktop backup list');
assert(storageManager.includes('selectedDesktopBackupPath'), 'storage manager must track the selected desktop backup path');
assert(storageManager.includes('selectedDesktopBackup'), 'storage manager must derive a selected desktop backup summary');
assert(storageManager.includes('onSelectDesktopBackup'), 'storage manager must expose backup detail selection');
assert(storageManager.includes('DesktopBackupDetailPanel'), 'storage manager must render selected desktop backup details');
assert(storageManager.includes('备份详情'), 'storage manager must label the desktop backup detail panel');
assert(storageManager.includes('backup.integrity.checksum.slice(0, 12)'), 'storage manager must preview backup checksums without dumping full hashes');
assert(storageManager.includes('backup.integrity.saveCount'), 'storage manager must show the integrity save count in backup details');
assert(storageManager.includes('formatDesktopBackupReason'), 'storage manager must share backup reason labels between list and details');
assert(storageManager.includes('formatDesktopBackupIntegrityStatus'), 'storage manager must share backup integrity labels between list and details');
assert(storageManager.includes('备份列表'), 'storage manager must show a desktop backup list');
assert(storageManager.includes('formatDesktopBackupLine'), 'storage manager must format desktop backup list entries');
assert(storageManager.includes('isRestorableDesktopBackup'), 'storage manager must guard backup restore actions');
assert(storageManager.includes('findLatestRestorableDesktopBackup'), 'storage manager must choose the latest restorable backup');
assert(storageManager.includes('countUnreadableDesktopBackups'), 'storage manager must count unreadable backups for diagnostics');
assert(storageManager.includes('unreadableDesktopBackupCount: countUnreadableDesktopBackups(desktopBackups)'), 'storage manager must pass unreadable backup count into diagnostics');
assert(storageManager.includes('校验通过'), 'storage manager must show verified backup integrity');
assert(storageManager.includes('旧备份无校验'), 'storage manager must show legacy backups without integrity');
assert(storageManager.includes('校验异常'), 'storage manager must show backup integrity mismatches');
assert(storageManager.includes('backup.integrity?.payloadBytes'), 'storage manager must show backup payload size when available');
assert(storageManager.includes('不可读'), 'storage manager must show unreadable backup integrity');
assert(storageManager.includes('这份桌面本地备份不可恢复'), 'storage manager must explain unreadable backup restore blocking');
assert(storageManager.includes('!isRestorableDesktopBackup(backup)'), 'storage manager must disable restore buttons for unreadable backups');
assert(storageManager.includes('onRestoreDesktopBackup(backup)'), 'storage manager must restore a selected desktop backup');
assert(storageManager.includes('onDeleteDesktopBackup(backup)'), 'storage manager must delete a selected desktop backup');
assert(storageManager.includes('onExportDesktopBackup(backup)'), 'storage manager must export a selected desktop backup');
assert(storageManager.includes('downloadDesktopBackupRecord'), 'storage manager must download exported desktop backup records');
assert(storageManager.includes('exportingDesktopBackupPath'), 'storage manager must track selected backup export state');
assert(storageManager.includes('deletingDesktopBackupPath'), 'storage manager must track selected backup deletion state');
assert(storageManager.includes('导出中'), 'storage manager must show desktop backup export progress');
assert(storageManager.includes('删除中'), 'storage manager must show desktop backup deletion progress');
assert(storageManager.includes('镜像存档'), 'storage manager must show mirrored save count');
assert(storageManager.includes('本地备份'), 'storage manager must show desktop backup count');
assert(storageManager.includes('配置镜像'), 'storage manager must show mirrored config count');
assert(storageManager.includes('资源镜像'), 'storage manager must show mirrored asset count');
assert(storageManager.includes('资源占用'), 'storage manager must show desktop asset byte usage');
assert(storageManager.includes('无引用资源'), 'storage manager must show orphan desktop asset usage');
assert(storageManager.includes('清理无引用资源'), 'storage manager must provide an orphan desktop asset cleanup button');
assert(storageManager.includes('导出诊断报告'), 'storage manager must provide a diagnostic report export button');
assert(storageManager.includes('诊断报告'), 'storage manager must show the latest diagnostic report path');
assert(storageManager.includes('desktopDiagnosticReports'), 'storage manager must keep a diagnostic report list');
assert(storageManager.includes('日志中心'), 'storage manager must show a local diagnostic log center');
assert(storageManager.includes('formatDesktopDiagnosticReportLine'), 'storage manager must format diagnostic report list entries');
assert(storageManager.includes('onExportDiagnosticReport(report)'), 'storage manager must export a selected diagnostic report');
assert(storageManager.includes('onDeleteDiagnosticReport(report)'), 'storage manager must delete a selected diagnostic report');
assert(storageManager.includes('downloadDesktopDiagnosticReport'), 'storage manager must download exported diagnostic reports');
assert(storageManager.includes('exportingDiagnosticReportPath'), 'storage manager must track selected diagnostic report export state');
assert(storageManager.includes('deletingDiagnosticReportPath'), 'storage manager must track selected diagnostic report deletion state');
assert(storageManager.includes('检查更新'), 'storage manager must expose update checks');
assert(storageManager.includes('下载并安装'), 'storage manager must expose update installation when an update is available');
assert(storageManager.includes('Desktop Edition'), 'storage manager must label desktop runtime');
assert(storageManager.includes('Web Edition'), 'storage manager must preserve web runtime messaging');

const releaseRules = read('scripts/desktop-release-rules.mjs');
const signUpdaterScript = read('scripts/desktop-sign-updater.mjs');
assert(releaseRules.includes('DESKTOP_RELEASE_KIND'), 'desktop release rules must define the shared release kind');
assert(releaseRules.includes('DEFAULT_DESKTOP_REPOSITORY'), 'desktop release rules must define the default GitHub repository');
assert(releaseRules.includes('resolveDesktopVersion'), 'desktop release rules must expose shared version resolution');
assert(releaseRules.includes('assertSemver'), 'desktop release rules must validate desktop release versions');
assert(releaseRules.includes('buildDesktopInstallerName'), 'desktop release rules must expose installer naming');
assert(releaseRules.includes('resolveDesktopReleaseNotes'), 'desktop release rules must expose shared release notes resolution');
assert(releaseRules.includes('DESKTOP_VERSION'), 'desktop release rules must support a shared desktop version override');
assert(releaseRules.includes('DESKTOP_RELEASE_NOTES'), 'desktop release rules must support shared release notes');
assert(releaseRules.includes('DESKTOP_GITHUB_REPOSITORY'), 'desktop release rules must allow release repository override');
assert(releaseRules.includes('releases/download/v${version}'), 'desktop release rules must target versioned GitHub Release downloads');
assert(releaseRules.includes('assertDesktopSignatureFresh'), 'desktop release rules must reject stale updater signatures');
assert(releaseRules.includes('assertDesktopManifestFresh'), 'desktop release rules must reject stale updater manifests');
assert(signUpdaterScript.includes('tauri.js'), 'desktop signer script must call the local Tauri CLI');
assert(signUpdaterScript.includes('signer'), 'desktop signer script must use the Tauri signer command');
assert(signUpdaterScript.includes('--password='), 'desktop signer script must pass an explicit empty password for passwordless keys');
assert(signUpdaterScript.includes('DESKTOP_SIGNING_PRIVATE_KEY_PATH'), 'desktop signer script must allow private key path overrides');
assert(signUpdaterScript.includes('assertDesktopSignatureFresh'), 'desktop signer script must verify the refreshed signature timestamp');

const manifestScript = read('scripts/desktop-update-manifest.mjs');
assert(manifestScript.includes('windows-x86_64-nsis'), 'update manifest must include the NSIS-specific Windows target');
assert(manifestScript.includes('windows-x86_64'), 'update manifest must include the Windows fallback target');
assert(manifestScript.includes('DESKTOP_UPDATE_URL'), 'update manifest URL must be overrideable for release hosting');
assert(manifestScript.includes('DESKTOP_UPDATE_BUNDLE_DIR'), 'update manifest output directory must be overrideable for regression tests');
assert(manifestScript.includes('./desktop-release-rules.mjs'), 'update manifest must use the shared desktop release rules');
assert(manifestScript.includes('resolveDesktopVersion'), 'update manifest must use shared version resolution');
assert(manifestScript.includes('resolveDesktopReleaseNotes'), 'update manifest must use shared release notes');
assert(manifestScript.includes('buildDesktopDownloadUrl'), 'update manifest must use shared GitHub download URL rules');
assert(manifestScript.includes('assertDesktopSignatureFresh'), 'update manifest must reject stale updater signatures');

const stageReleaseScript = read('scripts/desktop-stage-release.mjs');
assert(stageReleaseScript.includes('release-manifest.json'), 'desktop release staging must write a release manifest');
assert(stageReleaseScript.includes('SHA256SUMS.txt'), 'desktop release staging must write SHA256 checksums');
assert(stageReleaseScript.includes('DESKTOP_RELEASE_BUNDLE_DIR'), 'desktop release staging must support bundle directory overrides');
assert(stageReleaseScript.includes('DESKTOP_RELEASE_OUTPUT_DIR'), 'desktop release staging must support output directory overrides');
assert(stageReleaseScript.includes('DESKTOP_RELEASE_NOTES'), 'desktop release staging must support explicit release notes');
assert(stageReleaseScript.includes('notes: releaseNotes'), 'desktop release manifest must include release notes');
assert(stageReleaseScript.includes('crypto.createHash'), 'desktop release staging must compute file checksums');
assert(stageReleaseScript.includes('./desktop-release-rules.mjs'), 'desktop release staging must use the shared desktop release rules');
assert(stageReleaseScript.includes('resolveDesktopVersion'), 'desktop release staging must use shared version resolution');
assert(stageReleaseScript.includes('resolveDesktopReleaseNotes'), 'desktop release staging must use shared release notes');
assert(stageReleaseScript.includes('DESKTOP_RELEASE_KIND'), 'desktop release staging must use the shared release kind');
assert(stageReleaseScript.includes('assertDesktopSignatureFresh'), 'desktop release staging must reject stale updater signatures');
assert(stageReleaseScript.includes('assertDesktopManifestFresh'), 'desktop release staging must reject stale updater manifests');

const verifyReleaseScript = read('scripts/desktop-verify-release.mjs');
const verifyOnlineUpdateScript = read('scripts/desktop-verify-online-update.mjs');
const installUpdateDrillScript = read('scripts/desktop-install-update-drill.mjs');
const releaseGatesScript = read('scripts/desktop-release-gates.mjs');
const verifyReleaseGatesScript = read('scripts/desktop-verify-release-gates.mjs');
const githubReleaseNotesScript = read('scripts/desktop-github-release-notes.mjs');
const githubUploadCommandsScript = read('scripts/desktop-github-upload-commands.mjs');
const codeSigningDecisionScript = read('scripts/desktop-code-signing-decision.mjs');
const storageStrategyScript = read('scripts/desktop-storage-strategy.mjs');
const desktopStorageAuditScript = read('scripts/desktop-storage-audit.mjs');
const desktopReadinessScript = read('scripts/desktop-readiness.mjs');
const desktopPreflightScript = read('scripts/desktop-preflight.mjs');
const desktopHomeScreen = read('components/layout/DesktopHomeScreen.tsx');
const appTsx = read('App.tsx');
assert(verifyReleaseScript.includes('release-manifest.json'), 'desktop release verification must read release-manifest.json');
assert(verifyReleaseScript.includes('SHA256SUMS.txt'), 'desktop release verification must read SHA256SUMS.txt');
assert(verifyReleaseScript.includes('latest.json'), 'desktop release verification must read latest.json');
assert(verifyReleaseScript.includes('DESKTOP_RELEASE_KIND'), 'desktop release verification must validate the shared release kind');
assert(verifyReleaseScript.includes('release manifest version mismatch'), 'desktop release verification must validate release manifest versions');
assert(verifyReleaseScript.includes('latest.json version mismatch'), 'desktop release verification must validate update manifest versions');
assert(verifyReleaseScript.includes('latest.json signature mismatch'), 'desktop release verification must validate update manifest signatures');
assert(verifyReleaseScript.includes('SHA256SUMS mismatch'), 'desktop release verification must validate staged SHA256SUMS entries');
assert(verifyReleaseScript.includes('DESKTOP_RELEASE_DIR'), 'desktop release verification must support explicit release directory checks');
assert(verifyOnlineUpdateScript.includes('DESKTOP_ONLINE_UPDATE_URL'), 'desktop online update verification must allow explicit online update URLs');
assert(verifyOnlineUpdateScript.includes('readBundledUpdateEndpoint'), 'desktop online update verification must read the bundled updater endpoint by default');
assert(verifyOnlineUpdateScript.includes('assertEquivalentJson'), 'desktop online update verification must compare the online and staged latest.json payloads');
assert(verifyOnlineUpdateScript.includes('online latest.json version mismatch'), 'desktop online update verification must validate online versions');
assert(verifyOnlineUpdateScript.includes('online latest.json signature mismatch'), 'desktop online update verification must validate online signatures');
assert(verifyOnlineUpdateScript.includes('platform.url.includes(encodeURIComponent(installerName))'), 'desktop online update verification must ensure online update URLs reference the installer');
assert(installUpdateDrillScript.includes('install-update-drill.md'), 'desktop install/update drill must write a stable checklist filename');
assert(installUpdateDrillScript.includes('desktop:verify-release'), 'desktop install/update drill must require local release verification');
assert(installUpdateDrillScript.includes('desktop:verify-online-update'), 'desktop install/update drill must mention online update verification');
assert(installUpdateDrillScript.includes('首次安装'), 'desktop install/update drill must cover first install checks');
assert(installUpdateDrillScript.includes('本地数据目录'), 'desktop install/update drill must cover local app data checks');
assert(installUpdateDrillScript.includes('备份与恢复保护'), 'desktop install/update drill must cover backup and restore protection');
assert(installUpdateDrillScript.includes('图片资源与诊断'), 'desktop install/update drill must cover assets and diagnostics');
assert(installUpdateDrillScript.includes('应用内更新演练'), 'desktop install/update drill must cover in-app update checks');
assert(installUpdateDrillScript.includes('API Key'), 'desktop install/update drill must include privacy checks');
assert(installUpdateDrillScript.includes('Windows 安全提示'), 'desktop install/update drill must record Windows security prompt details');
assert(installUpdateDrillScript.includes('assertFile(installerPath'), 'desktop install/update drill must require the installer');
assert(installUpdateDrillScript.includes('assertFile(signaturePath'), 'desktop install/update drill must require updater signatures');
assert(installUpdateDrillScript.includes('assertFile(latestPath'), 'desktop install/update drill must require latest.json');
assert(releaseGatesScript.includes('release-gates.md'), 'desktop release gates must write a stable evidence filename');
assert(releaseGatesScript.includes('GitHub Release'), 'desktop release gates must cover GitHub Release upload evidence');
assert(releaseGatesScript.includes('desktop:verify-online-update'), 'desktop release gates must cover online update verification evidence');
assert(releaseGatesScript.includes('install-update-drill.md'), 'desktop release gates must cover install/update drill evidence');
assert(releaseGatesScript.includes('code signing'), 'desktop release gates must cover code signing decisions');
assert(releaseGatesScript.includes('SHA256SUMS.txt'), 'desktop release gates must cover published checksum evidence');
assert(releaseGatesScript.includes('Machine-readable evidence keys'), 'desktop release gates must expose machine-readable evidence keys');
assert(releaseGatesScript.includes('githubReleaseUrl'), 'desktop release gates must include a GitHub release URL evidence key');
assert(releaseGatesScript.includes('verifyOnlineUpdateOutput'), 'desktop release gates must include an online verification output evidence key');
assert(releaseGatesScript.includes('codeSigningDecision'), 'desktop release gates must include a code signing decision evidence key');
assert(releaseGatesScript.includes('assertFile(installerPath'), 'desktop release gates must require the installer');
assert(releaseGatesScript.includes('assertFile(signaturePath'), 'desktop release gates must require updater signatures');
assert(releaseGatesScript.includes('assertFile(latestPath'), 'desktop release gates must require latest.json');
assert(releaseGatesScript.includes('code-signing-decision.md'), 'desktop release gates must read code signing decisions');
assert(releaseGatesScript.includes('buildCodeSigningDecisionSectionFromDecisionFile'), 'desktop release gates must restore signing evidence from the decision file');
assert(releaseGatesScript.includes('hasFilledCodeSigningDecision'), 'desktop release gates must reject empty signing templates as evidence');
assert(verifyReleaseGatesScript.includes('release-gates.md'), 'desktop release gates verification must read release-gates.md');
assert(verifyReleaseGatesScript.includes('unchecked checklist'), 'desktop release gates verification must reject unchecked checklist items');
assert(verifyReleaseGatesScript.includes('githubReleaseUrl'), 'desktop release gates verification must require GitHub release URL evidence');
assert(verifyReleaseGatesScript.includes('onlineLatestJsonUrl'), 'desktop release gates verification must require online latest.json evidence');
assert(verifyReleaseGatesScript.includes('verifyOnlineUpdateOutput'), 'desktop release gates verification must require online update verification output');
assert(verifyReleaseGatesScript.includes('installDrillMachine'), 'desktop release gates verification must require install drill machine evidence');
assert(verifyReleaseGatesScript.includes('codeSigningDecision'), 'desktop release gates verification must require code signing evidence');
assert(verifyReleaseGatesScript.includes('rollbackPreviousVersion'), 'desktop release gates verification must require rollback evidence');
assert(githubReleaseNotesScript.includes('github-release-notes.md'), 'desktop GitHub release notes must write a stable filename');
assert(githubReleaseNotesScript.includes('SHA256SUMS.txt'), 'desktop GitHub release notes must include checksum evidence');
assert(githubReleaseNotesScript.includes('release-manifest.json'), 'desktop GitHub release notes must include the release manifest');
assert(githubReleaseNotesScript.includes('latest.json'), 'desktop GitHub release notes must include the updater manifest');
assert(githubReleaseNotesScript.includes('Windows 安全提示'), 'desktop GitHub release notes must include Windows security warning text');
assert(githubReleaseNotesScript.includes('Windows Authenticode'), 'desktop GitHub release notes must distinguish Windows Authenticode signing');
assert(githubReleaseNotesScript.includes('Tauri updater'), 'desktop GitHub release notes must distinguish updater signatures from code signing');
assert(githubReleaseNotesScript.includes('desktop:verify-online-update'), 'desktop GitHub release notes must include online update verification instructions');
assert(githubReleaseNotesScript.includes('release-gates.md'), 'desktop GitHub release notes must point to the release gate evidence file');
assert(githubReleaseNotesScript.includes('code-signing-decision.md'), 'desktop GitHub release notes must point to the code signing decision record');
assert(githubReleaseNotesScript.includes('assertFile(installerPath'), 'desktop GitHub release notes must require the installer');
assert(githubReleaseNotesScript.includes('assertFile(signaturePath'), 'desktop GitHub release notes must require updater signatures');
assert(githubUploadCommandsScript.includes('github-upload-commands.md'), 'desktop GitHub upload command draft must write a stable filename');
assert(githubUploadCommandsScript.includes('DEFAULT_DESKTOP_REPOSITORY'), 'desktop GitHub upload command draft must use the shared default repository');
assert(githubUploadCommandsScript.includes('gh release create'), 'desktop GitHub upload command draft must include release creation commands');
assert(githubUploadCommandsScript.includes('gh release upload'), 'desktop GitHub upload command draft must include asset upload commands');
assert(githubUploadCommandsScript.includes('--draft'), 'desktop GitHub upload command draft must prefer draft releases');
assert(githubUploadCommandsScript.includes('--clobber'), 'desktop GitHub upload command draft must include safe re-upload commands');
assert(githubUploadCommandsScript.includes('DESKTOP_ONLINE_UPDATE_URL'), 'desktop GitHub upload command draft must include online update verification overrides');
assert(githubUploadCommandsScript.includes('github-release-notes.md'), 'desktop GitHub upload command draft must depend on the release notes draft');
assert(githubUploadCommandsScript.includes('release-gates.md'), 'desktop GitHub upload command draft must point back to release gate evidence');
assert(githubUploadCommandsScript.includes('install-update-drill.md'), 'desktop GitHub upload command draft must point back to the install/update drill');
assert(githubUploadCommandsScript.includes('code-signing-decision.md'), 'desktop GitHub upload command draft must point back to code signing decisions');
assert(githubUploadCommandsScript.includes('assertFile(path.join(releaseDir, fileName), fileName)'), 'desktop GitHub upload command draft must require all local release files');
assert(githubUploadCommandsScript.includes('localFileWarning'), 'desktop GitHub upload command draft must warn against uploading local planning and temp files');
assert(codeSigningDecisionScript.includes('code-signing-decision.md'), 'desktop code signing decision must write a stable filename');
assert(codeSigningDecisionScript.includes('Get-AuthenticodeSignature'), 'desktop code signing decision must include Authenticode verification commands');
assert(codeSigningDecisionScript.includes('Get-FileHash'), 'desktop code signing decision must include SHA256 verification commands');
assert(codeSigningDecisionScript.includes('Tauri updater'), 'desktop code signing decision must distinguish updater signatures from code signing');
assert(codeSigningDecisionScript.includes('NotSigned'), 'desktop code signing decision must cover unsigned test builds');
assert(codeSigningDecisionScript.includes('Valid'), 'desktop code signing decision must cover valid signed builds');
assert(codeSigningDecisionScript.includes('SHA256SUMS.txt'), 'desktop code signing decision must require published checksums');
assert(codeSigningDecisionScript.includes('release-gates.md'), 'desktop code signing decision must link to release gate evidence');
assert(storageStrategyScript.includes('storage-strategy.md'), 'desktop storage strategy must write a stable filename');
assert(storageStrategyScript.includes('does not migrate data'), 'desktop storage strategy must state that it does not migrate data');
assert(storageStrategyScript.includes('JSON file-primary saves first'), 'desktop storage strategy must evaluate JSON file-primary saves');
assert(storageStrategyScript.includes('SQLite primary store'), 'desktop storage strategy must evaluate SQLite primary storage');
assert(storageStrategyScript.includes('Choose Option C'), 'desktop storage strategy must recommend a staged hybrid path');
assert(storageStrategyScript.includes('desktop:storage-audit'), 'desktop storage strategy must connect the next storage milestone to the storage audit');
assert(storageStrategyScript.includes('No GitHub upload'), 'desktop storage strategy must not imply release upload or online verification');
assert(desktopStorageAuditScript.includes('Desktop storage migration audit'), 'desktop storage audit must print a clear report title');
assert(desktopStorageAuditScript.includes('file-primary'), 'desktop storage audit must classify file-primary storage');
assert(desktopStorageAuditScript.includes('desktop-first'), 'desktop storage audit must classify desktop-first reads');
assert(desktopStorageAuditScript.includes('mirror-only'), 'desktop storage audit must classify mirror-only writes');
assert(desktopStorageAuditScript.includes('indexeddb-primary'), 'desktop storage audit must classify IndexedDB-primary pieces');
assert(desktopStorageAuditScript.includes('future'), 'desktop storage audit must classify future storage milestones');
assert(desktopStorageAuditScript.includes('desktop saveGame writes new save records into desktop files before updating IndexedDB as a compatibility cache'), 'desktop storage audit must report file-primary new save writes');
assert(desktopStorageAuditScript.includes('indexeddb cache rebuild'), 'desktop storage audit must report IndexedDB compatibility cache rebuild from desktop files');
assert(desktopStorageAuditScript.includes('desktop mirrored save files can rebuild the IndexedDB compatibility cache'), 'desktop storage audit must describe desktop file to IndexedDB cache rebuild');
assert(desktopStorageAuditScript.includes('save transaction automatic repair'), 'desktop storage audit must report conservative unresolved transaction repair');
assert(desktopStorageAuditScript.includes('save transaction completeness'), 'desktop storage audit must report full save transaction completeness checks');
assert(desktopStorageAuditScript.includes('repair backup guard'), 'desktop storage audit must report backup guards before repair operations');
assert(desktopStorageAuditScript.includes('cross-edition save packages'), 'desktop storage audit must report Web-compatible save packages as the cross-edition exchange format');
assert(desktopStorageAuditScript.includes('Desktop Edition keeps Web-compatible save package import/export'), 'desktop storage audit must describe package import/export as the cross-edition exchange format');
assert(desktopStorageAuditScript.includes('one-time migration backup'), 'desktop storage audit must report one-time migration backup support');
assert(desktopStorageAuditScript.includes('desktop delta mirror files'), 'desktop storage audit must report desktop delta mirror files');
assert(desktopStorageAuditScript.includes('delta node reads'), 'desktop storage audit must report desktop-first delta reads');
assert(desktopStorageAuditScript.includes('delta base restore'), 'desktop storage audit must report desktop-first delta base restore');
assert(desktopStorageAuditScript.includes('new desktop save node deltas are written to desktop files before the IndexedDB compatibility cache'), 'desktop storage audit must report file-primary new delta writes');
assert(desktopStorageAuditScript.includes('saveNodeDeltas'), 'desktop storage audit must call out saveNodeDeltas as still IndexedDB-backed');
assert(desktopStorageAuditScript.includes('Current state is desktop-first with file-primary settings and new save writes, not full desktop-primary migration'), 'desktop storage audit must not overclaim full desktop-primary migration');
assert(desktopHomeScreen.includes('DesktopHomeScreen'), 'desktop home screen component must exist');
assert(desktopHomeScreen.includes('继续游戏'), 'desktop home screen must expose continue-game entry');
assert(desktopHomeScreen.includes('读取光锥'), 'desktop home screen must expose save loading');
assert(desktopHomeScreen.includes('踏上旅途'), 'desktop home screen must expose new game entry');
assert(desktopHomeScreen.includes('存储管理'), 'desktop home screen must expose storage management');
assert(desktopHomeScreen.includes('写入探针'), 'desktop home screen must expose the desktop probe action');
assert(desktopHomeScreen.includes('检查更新'), 'desktop home screen must expose update checks');
assert(desktopHomeScreen.includes('下载并安装'), 'desktop home screen must expose update installation');
assert(desktopHomeScreen.includes('Desktop Edition'), 'desktop home screen must show the desktop edition label');
assert(desktopHomeScreen.includes('openDesktopDataDir'), 'desktop home screen must expose local directory access');
assert(appTsx.includes('DesktopHomeScreen'), 'App.tsx must import the desktop home screen');
assert(appTsx.includes("isDesktopRuntime() ? ("), 'App.tsx must branch to the desktop home screen in desktop runtime');
assert(appTsx.includes('LandingPage'), 'App.tsx must keep the web landing page');
assert(desktopPreflightScript.includes('test:desktop-edition'), 'desktop preflight must run the desktop regression');
assert(desktopPreflightScript.includes('desktop:storage-strategy'), 'desktop preflight must generate the desktop storage strategy before readiness');
assert(desktopPreflightScript.includes('desktop:readiness'), 'desktop preflight must run desktop readiness');
assert(desktopPreflightScript.includes('desktop:storage-audit'), 'desktop preflight must run the desktop storage audit');
assert(desktopPreflightScript.includes('tsc'), 'desktop preflight must run TypeScript checks');
assert(desktopPreflightScript.includes('desktop:verify-release'), 'desktop preflight must verify staged release artifacts');
assert(desktopPreflightScript.includes('DESKTOP_PREFLIGHT_FULL'), 'desktop preflight must expose an opt-in full build mode');
assert(desktopPreflightScript.includes("process.platform === 'win32' ? 'cmd.exe' : command"), 'desktop preflight must start Windows commands through cmd.exe explicitly');
assert(desktopPreflightScript.includes('shell: false'), 'desktop preflight must avoid shell:true child process warnings');
assert(desktopPreflightScript.includes('quoteCommand([command, ...args])'), 'desktop preflight must quote Windows command lines explicitly');
assert(desktopPreflightScript.includes('does not upload GitHub Release assets'), 'desktop preflight must state that it does not upload releases');
assert(desktopPreflightScript.includes('does not verify the real online latest.json'), 'desktop preflight must state that online update verification remains manual');
assert(desktopReadinessScript.includes('ready'), 'desktop readiness must classify ready checks');
assert(desktopReadinessScript.includes('missing'), 'desktop readiness must classify missing checks');
assert(desktopReadinessScript.includes('manual'), 'desktop readiness must classify manual checks');
assert(desktopReadinessScript.includes('desktop:verify-online-update'), 'desktop readiness must mention online update verification');
assert(desktopReadinessScript.includes('install-update-drill.md'), 'desktop readiness must mention the install/update drill checklist');
assert(desktopReadinessScript.includes('release-gates.md'), 'desktop readiness must mention the release gates evidence checklist');
assert(desktopReadinessScript.includes('desktop:verify-release-gates'), 'desktop readiness must check the release gates verification entrypoint');
assert(desktopReadinessScript.includes('github-release-notes.md'), 'desktop readiness must mention the GitHub release notes draft');
assert(desktopReadinessScript.includes('github-upload-commands.md'), 'desktop readiness must mention the GitHub upload command draft');
assert(desktopReadinessScript.includes('code-signing-decision.md'), 'desktop readiness must mention the code signing decision record');
assert(desktopReadinessScript.includes('hasResolvedCodeSigningDecision'), 'desktop readiness must inspect resolved code signing decision evidence');
assert(desktopReadinessScript.includes('Windows 安全提示'), 'desktop readiness must require unsigned beta release warning evidence');
assert(desktopReadinessScript.includes('desktop:code-signing-decision'), 'desktop readiness must check the code signing decision entrypoint');
assert(desktopReadinessScript.includes('storage-strategy.md'), 'desktop readiness must mention the storage strategy record');
assert(desktopReadinessScript.includes('desktop:storage-strategy'), 'desktop readiness must check the storage strategy entrypoint');
assert(desktopReadinessScript.includes('desktop:storage-audit'), 'desktop readiness must check the storage audit entrypoint');
assert(desktopReadinessScript.includes('desktop:preflight'), 'desktop readiness must check the local preflight entrypoint');
assert(desktopReadinessScript.includes('hasResolvedStorageStrategy'), 'desktop readiness must inspect resolved storage strategy evidence');
assert(desktopReadinessScript.includes('代码签名') || desktopReadinessScript.includes('code signing'), 'desktop readiness must mention code signing');
assert(desktopReadinessScript.includes('GitHub Release'), 'desktop readiness must mention GitHub Release upload');
assert(desktopReadinessScript.includes('src-tauri/tauri.conf.json'), 'desktop readiness must check the main Tauri config');
assert(desktopReadinessScript.includes('StorageManager.tsx'), 'desktop readiness must check the desktop storage UI surface');
assert(desktopReadinessScript.includes('services/desktop/desktopSaveDeltaMirror.ts'), 'desktop readiness must check the desktop save delta mirror service');
assert(desktopReadinessScript.includes('迁移前完整备份'), 'desktop readiness must check the one-time migration backup UI label');
assert(desktopReadinessScript.includes('存档镜像健康'), 'desktop readiness must check save mirror health UI labels');
assert(desktopReadinessScript.includes('增量镜像健康'), 'desktop readiness must check save delta mirror health UI labels');
assert(desktopReadinessScript.includes('资源镜像健康'), 'desktop readiness must check asset mirror health UI labels');

const manifestTempDir = path.join(root, '.tmp-regression', 'desktop-update-manifest');
fs.rmSync(manifestTempDir, { recursive: true, force: true });
fs.mkdirSync(manifestTempDir, { recursive: true });
const testInstallerName = 'DesktopProbe_9.9.9_x64-setup.exe';
fs.writeFileSync(path.join(manifestTempDir, testInstallerName), 'fake installer', 'utf8');
fs.writeFileSync(path.join(manifestTempDir, `${testInstallerName}.sig`), 'fake-signature\n', 'utf8');
execFileSync(process.execPath, ['scripts/desktop-update-manifest.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_UPDATE_BUNDLE_DIR: manifestTempDir,
    DESKTOP_UPDATE_INSTALLER: testInstallerName,
    DESKTOP_UPDATE_VERSION: '9.9.9',
    DESKTOP_UPDATE_URL: 'https://example.invalid/desktop/desktop-probe.exe',
    DESKTOP_UPDATE_PUB_DATE: '2026-06-20T00:00:00.000Z',
    DESKTOP_UPDATE_NOTES: 'desktop update manifest regression',
  },
  stdio: 'pipe',
});
const generatedManifest = readJson(path.join('.tmp-regression', 'desktop-update-manifest', 'latest.json'));
assert(generatedManifest.version === '9.9.9', 'generated update manifest must use the requested version');
assert(generatedManifest.notes === 'desktop update manifest regression', 'generated update manifest must include release notes');
assert(generatedManifest.pub_date === '2026-06-20T00:00:00.000Z', 'generated update manifest must include a stable publication date');
assert(
  generatedManifest.platforms?.['windows-x86_64-nsis']?.url === 'https://example.invalid/desktop/desktop-probe.exe',
  'generated update manifest must include the NSIS download URL',
);
assert(
  generatedManifest.platforms?.['windows-x86_64']?.signature === 'fake-signature',
  'generated update manifest must include the Windows fallback signature',
);

const staleSignatureTempDir = path.join(root, '.tmp-regression', 'desktop-stale-signature');
fs.rmSync(staleSignatureTempDir, { recursive: true, force: true });
fs.mkdirSync(staleSignatureTempDir, { recursive: true });
const staleSignatureInstaller = 'DesktopStaleSig_4.5.6_x64-setup.exe';
const staleSignatureInstallerPath = path.join(staleSignatureTempDir, staleSignatureInstaller);
const staleSignaturePath = path.join(staleSignatureTempDir, `${staleSignatureInstaller}.sig`);
fs.writeFileSync(staleSignatureInstallerPath, 'new installer with stale signature', 'utf8');
fs.writeFileSync(staleSignaturePath, 'stale-signature\n', 'utf8');
const oldReleaseDate = new Date('2026-06-19T00:00:00.000Z');
fs.utimesSync(staleSignaturePath, oldReleaseDate, oldReleaseDate);
assertExecFails(
  process.execPath,
  ['scripts/desktop-update-manifest.mjs'],
  {
    cwd: root,
    env: {
      ...process.env,
      DESKTOP_UPDATE_BUNDLE_DIR: staleSignatureTempDir,
      DESKTOP_UPDATE_INSTALLER: staleSignatureInstaller,
      DESKTOP_UPDATE_VERSION: '4.5.6',
    },
    stdio: 'pipe',
  },
  'Desktop updater signature is older than installer',
);

const defaultRuleTempDir = path.join(root, '.tmp-regression', 'desktop-update-default-rules');
fs.rmSync(defaultRuleTempDir, { recursive: true, force: true });
fs.mkdirSync(defaultRuleTempDir, { recursive: true });
const defaultRuleVersion = '2.3.4';
const defaultRuleInstallerName = `开拓轶事_${defaultRuleVersion}_x64-setup.exe`;
fs.writeFileSync(path.join(defaultRuleTempDir, defaultRuleInstallerName), 'fake default installer', 'utf8');
fs.writeFileSync(path.join(defaultRuleTempDir, `${defaultRuleInstallerName}.sig`), 'fake-default-signature\n', 'utf8');
execFileSync(process.execPath, ['scripts/desktop-update-manifest.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_VERSION: defaultRuleVersion,
    DESKTOP_UPDATE_VERSION: '',
    DESKTOP_UPDATE_BUNDLE_DIR: defaultRuleTempDir,
    DESKTOP_UPDATE_INSTALLER: '',
    DESKTOP_UPDATE_URL: '',
    DESKTOP_GITHUB_REPOSITORY: 'ExampleOwner/ExampleRepo',
    DESKTOP_UPDATE_PUB_DATE: '2026-06-20T00:00:00.000Z',
    DESKTOP_RELEASE_NOTES: 'shared desktop release notes regression',
    DESKTOP_UPDATE_NOTES: '',
  },
  stdio: 'pipe',
});
const defaultRuleManifest = readJson(path.join('.tmp-regression', 'desktop-update-default-rules', 'latest.json'));
assert(defaultRuleManifest.version === defaultRuleVersion, 'shared DESKTOP_VERSION must drive update manifest versions');
assert(defaultRuleManifest.notes === 'shared desktop release notes regression', 'shared release notes must drive update manifest notes');
assert(
  defaultRuleManifest.platforms?.['windows-x86_64-nsis']?.url
    === `https://github.com/ExampleOwner/ExampleRepo/releases/download/v${defaultRuleVersion}/${encodeURIComponent(defaultRuleInstallerName)}`,
  'default update manifest URL must target a versioned GitHub Release artifact',
);

const stageTempBundleDir = path.join(root, '.tmp-regression', 'desktop-stage-release-bundle');
const stageTempOutputDir = path.join(root, '.tmp-regression', 'desktop-stage-release-output');
fs.rmSync(stageTempBundleDir, { recursive: true, force: true });
fs.rmSync(stageTempOutputDir, { recursive: true, force: true });
fs.mkdirSync(stageTempBundleDir, { recursive: true });
const releaseInstallerName = 'DesktopRelease_1.2.3_x64-setup.exe';
fs.writeFileSync(path.join(stageTempBundleDir, releaseInstallerName), 'fake release installer', 'utf8');
fs.writeFileSync(path.join(stageTempBundleDir, `${releaseInstallerName}.sig`), 'fake release signature', 'utf8');
execFileSync(process.execPath, ['scripts/desktop-update-manifest.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_UPDATE_BUNDLE_DIR: stageTempBundleDir,
    DESKTOP_UPDATE_INSTALLER: releaseInstallerName,
    DESKTOP_UPDATE_VERSION: '1.2.3',
    DESKTOP_UPDATE_URL: 'https://example.invalid/desktop/DesktopRelease_1.2.3_x64-setup.exe',
    DESKTOP_UPDATE_PUB_DATE: '2026-06-20T00:00:00.000Z',
    DESKTOP_UPDATE_NOTES: 'desktop staged release notes regression',
  },
  stdio: 'pipe',
});
execFileSync(process.execPath, ['scripts/desktop-stage-release.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_RELEASE_BUNDLE_DIR: stageTempBundleDir,
    DESKTOP_RELEASE_OUTPUT_DIR: stageTempOutputDir,
    DESKTOP_RELEASE_INSTALLER: releaseInstallerName,
    DESKTOP_RELEASE_VERSION: '1.2.3',
    DESKTOP_RELEASE_NOTES: 'desktop staged release notes regression',
  },
  stdio: 'pipe',
});
const stagedReleaseDir = path.join(stageTempOutputDir, 'v1.2.3');
const stagedReleaseManifest = JSON.parse(fs.readFileSync(path.join(stagedReleaseDir, 'release-manifest.json'), 'utf8'));
const stagedChecksums = fs.readFileSync(path.join(stagedReleaseDir, 'SHA256SUMS.txt'), 'utf8');
assert(stagedReleaseManifest.kind === 'kaituoyishi-desktop-release', 'staged release manifest must have a stable kind');
assert(stagedReleaseManifest.version === '1.2.3', 'staged release manifest must use the requested version');
assert(stagedReleaseManifest.notes === 'desktop staged release notes regression', 'staged release manifest must include release notes');
assert(stagedReleaseManifest.files?.length === 3, 'staged release manifest must include installer, signature, and latest.json');
assert(stagedChecksums.includes(releaseInstallerName), 'staged checksums must include the installer');
assert(fs.existsSync(path.join(stagedReleaseDir, releaseInstallerName)), 'staged release must copy the installer');
assert(fs.existsSync(path.join(stagedReleaseDir, `${releaseInstallerName}.sig`)), 'staged release must copy the signature');
assert(fs.existsSync(path.join(stagedReleaseDir, 'latest.json')), 'staged release must copy latest.json');
execFileSync(process.execPath, ['scripts/desktop-verify-release.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_RELEASE_DIR: stagedReleaseDir,
    DESKTOP_RELEASE_INSTALLER: releaseInstallerName,
    DESKTOP_RELEASE_VERSION: '1.2.3',
  },
  stdio: 'pipe',
});
execFileSync(process.execPath, ['scripts/desktop-verify-online-update.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_RELEASE_DIR: stagedReleaseDir,
    DESKTOP_RELEASE_INSTALLER: releaseInstallerName,
    DESKTOP_RELEASE_VERSION: '1.2.3',
    DESKTOP_ONLINE_UPDATE_URL: path.join(stagedReleaseDir, 'latest.json'),
  },
  stdio: 'pipe',
});
execFileSync(process.execPath, ['scripts/desktop-install-update-drill.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DESKTOP_RELEASE_DIR: stagedReleaseDir,
    DESKTOP_RELEASE_INSTALLER: releaseInstallerName,
    DESKTOP_RELEASE_VERSION: '1.2.3',
  },
  stdio: 'pipe',
});
const installUpdateDrill = read(path.join(stagedReleaseDir, 'install-update-drill.md'));
assert(installUpdateDrill.includes('Desktop Edition 安装 / 更新演练清单'), 'desktop drill checklist must have a clear title');
assert(installUpdateDrill.includes(releaseInstallerName), 'desktop drill checklist must mention the staged installer');
assert(installUpdateDrill.includes('首次安装'), 'desktop drill checklist must include first install steps');
assert(installUpdateDrill.includes('本地数据目录'), 'desktop drill checklist must include app data directory steps');
assert(installUpdateDrill.includes('应用内更新演练'), 'desktop drill checklist must include in-app update steps');
assert(installUpdateDrill.includes('诊断报告不包含明文 API Key'), 'desktop drill checklist must include diagnostic privacy checks');

const mismatchedOnlineLatestPath = path.join(stageTempOutputDir, 'mismatched-online-latest.json');
fs.writeFileSync(
  mismatchedOnlineLatestPath,
  `${JSON.stringify({ ...readJson(path.join(stagedReleaseDir, 'latest.json')), version: '1.2.4' }, null, 2)}\n`,
  'utf8',
);
assertExecFails(
  process.execPath,
  ['scripts/desktop-verify-online-update.mjs'],
  {
    cwd: root,
    env: {
      ...process.env,
      DESKTOP_RELEASE_DIR: stagedReleaseDir,
      DESKTOP_RELEASE_INSTALLER: releaseInstallerName,
      DESKTOP_RELEASE_VERSION: '1.2.3',
      DESKTOP_ONLINE_UPDATE_URL: mismatchedOnlineLatestPath,
    },
    stdio: 'pipe',
  },
  'online latest.json version mismatch',
);

const staleManifestBundleDir = path.join(root, '.tmp-regression', 'desktop-stale-manifest-bundle');
const staleManifestOutputDir = path.join(root, '.tmp-regression', 'desktop-stale-manifest-output');
fs.rmSync(staleManifestBundleDir, { recursive: true, force: true });
fs.rmSync(staleManifestOutputDir, { recursive: true, force: true });
fs.mkdirSync(staleManifestBundleDir, { recursive: true });
const staleManifestInstaller = 'DesktopStaleManifest_5.6.7_x64-setup.exe';
const staleManifestInstallerPath = path.join(staleManifestBundleDir, staleManifestInstaller);
const staleManifestSignaturePath = path.join(staleManifestBundleDir, `${staleManifestInstaller}.sig`);
const staleManifestLatestPath = path.join(staleManifestBundleDir, 'latest.json');
fs.writeFileSync(staleManifestInstallerPath, 'installer newer than manifest', 'utf8');
fs.writeFileSync(staleManifestSignaturePath, 'fresh-signature', 'utf8');
fs.writeFileSync(staleManifestLatestPath, '{"version":"5.6.7"}\n', 'utf8');
fs.utimesSync(staleManifestLatestPath, oldReleaseDate, oldReleaseDate);
assertExecFails(
  process.execPath,
  ['scripts/desktop-stage-release.mjs'],
  {
    cwd: root,
    env: {
      ...process.env,
      DESKTOP_RELEASE_BUNDLE_DIR: staleManifestBundleDir,
      DESKTOP_RELEASE_OUTPUT_DIR: staleManifestOutputDir,
      DESKTOP_RELEASE_INSTALLER: staleManifestInstaller,
      DESKTOP_RELEASE_VERSION: '5.6.7',
    },
    stdio: 'pipe',
  },
  'Desktop updater manifest is older than installer or signature',
);

console.log('desktop-edition regression passed');
