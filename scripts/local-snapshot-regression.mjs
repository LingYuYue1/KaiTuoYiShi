import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectAll(source, needles, label) {
  for (const needle of needles) {
    const found = typeof needle === 'string' ? source.includes(needle) : needle.test(source);
    assert(found, label + ': missing ' + String(needle));
  }
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
const useGameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const gitignore = fs.readFileSync('.gitignore', 'utf8');

// dbService: per-store dump / restore / debounced backup + triggers
expectAll(dbService, [
  "const LOCAL_SNAPSHOT_ENDPOINT_BASE = '/api/local-save/snapshot';",
  'export interface LocalIndexedDbSnapshot {',
  'version: 1;',
  'export async function exportIndexedDbSnapshot(): Promise<LocalIndexedDbSnapshot>',
  'export async function importIndexedDbSnapshot(snapshot: LocalIndexedDbSnapshot): Promise<void>',
  'export async function tryRestoreLocalSnapshot(): Promise<boolean>',
  'function scheduleLocalSnapshotBackup(): void {',
  'async function flushLocalSnapshotBackup(): Promise<void>',
  // per-store file URL in restore loop
  /encodeURIComponent\(storeName\)/,
  // per-store content comparison before PUT
  /if \(serialized === lastLocalSnapshotSerialized\[storeName\]\) continue;/,
  /scheduleLocalSnapshotBackup\(\);/,
  // trigger after save write
  /rotateManagedSavesSafely\(db\);\r?\n\s*scheduleLocalSnapshotBackup\(\);/,
  // trigger after setting write (scheduled in wrapper body after retry logic)
  /scheduleLocalSnapshotBackup\(\);\r?\n\}\r?\n\r?\nasync function writeIndexedSettingOnce/,
], 'dbService local snapshot contract');

// dbService: stale-connection guards — browser may close an idle connection; drop cached
// connection and retry the write once with a fresh one
expectAll(dbService, [
  /db\.onclose = \(\) => \{\r?\n\s*\/\/ 浏览器可能在页面闲置\/回收时关闭连接；重置缓存让下次 openDB 重开新连接\r?\n\s*dbPromise = null;/,
  'function isClosingConnectionError(error: unknown): boolean {',
  'if (!isClosingConnectionError(error)) throw error;',
  "console.warn('[db] save connection closed, retrying once', error);",
  'saveGameInternalOnce(data)',
  'writeIndexedSettingOnce(key, value)',
], 'dbService connection-closing guards');

// sendWorkflow: persistence is tolerant — save/setting failures must not abort the turn
// result (abort semantics preserved, errors surface as a hint instead of failing the flow)
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
expectAll(sendWorkflow, [
  'const persistFailures: string[] = [];',
  "console.warn('[persist] 回合内容已生成，但本地保存失败', persistFailures);",
  "state.setWorkflowHint(`回合内容已生成，但本地保存失败：${persistFailures.join('；')}`);",
  /persistError\.name === 'AbortError'/,
  "catch((journalError) => {",
], 'sendWorkflow tolerant persistence');

// vite.config: per-store file bridge middleware (whitelist + atomic tmp + rename)
expectAll(viteConfig, [
  "server.middlewares.use('/api/local-save/snapshot', handleLocalSnapshot);",
  "const LOCAL_SNAPSHOT_STORE_WHITELIST = ['saves', 'saveSummaries', 'saveAssets', 'saveNodeDeltas', 'settings'];",
  'function localSnapshotFilePath(store: string): string {',
  'LOCAL_SNAPSHOT_STORE_WHITELIST.includes(store)',
  'rename(tmpFile, file)',
  "readFile(file, 'utf8')",
], 'vite local-save middleware contract');

// useGameState: restore before settings load
expectAll(useGameState, [
  'await tryRestoreLocalSnapshot();',
  'tryRestoreLocalSnapshot } from \'@/services/dbService\'',
], 'startup restore contract');

// .gitignore excludes the per-store mirror files
expectAll(gitignore, [
  'save/snapshot-*.json',
  'save/snapshot-*.json.tmp',
], 'gitignore snapshot policy');

console.log('local snapshot regression ok');