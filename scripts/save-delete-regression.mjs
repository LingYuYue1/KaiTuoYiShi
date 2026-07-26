import fs from 'node:fs';

function normalizeSource(source) {
  return source.replace(/\r\n?/g, '\n');
}

function readSource(path) {
  return normalizeSource(fs.readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[save-delete-regression] ${message}`);
    process.exit(1);
  }
}

const dbService = readSource('services/dbService.ts');
const saveLoadWorkflow = readSource('hooks/useGame/saveLoadWorkflow.ts');
const saveModal = readSource('components/features/SaveLoad/SaveLoadModal.tsx');
const storageManager = readSource('components/features/Settings/StorageManager.tsx');
const loadLatestBody = dbService.match(/export async function loadLatestSave\(\): Promise<[^]+?\n}\n/)?.[0] ?? '';
const saveModalDeleteBody = saveModal.match(/const handleDelete = async \(id: number\) => \{[^]+?\n  \};\n\n  const handleDeleteTree/)?.[0] ?? '';
const saveModalDeleteTreeBody = saveModal.match(/const handleDeleteTree = async \(rootId: string, nodeCount: number\) => \{[^]+?\n  \};\n\n  const handleExport/)?.[0] ?? '';
const storageDeleteBody = storageManager.match(/const handleDelete = async \(id: number\) => \{[^]+?\n  \};\n\n  const handleDeleteTree/)?.[0] ?? '';
const storageDeleteTreeBody = storageManager.match(/const handleDeleteTree = async \(rootId: string, nodeCount: number\) => \{[^]+?\n  \};\n\n  const handleExport/)?.[0] ?? '';

assert(normalizeSource('LF\nCRLF\r\nCR\r') === 'LF\nCRLF\nCR\n', 'source normalization must support LF, CRLF, and CR.');

assert(dbService.includes('export async function deleteSaveTree(rootId: string)'), 'dbService must expose deleteSaveTree(rootId).');
assert(!dbService.includes('await ensureSaveSummaries(db, Infinity);'), 'deleteSaveTree must never rebuild the complete index before deletion.');
assert(dbService.includes('catalogComplete'), 'deleteSaveTree must refuse whole-tree deletion while the lightweight catalog is incomplete.');
assert(dbService.includes('collectSaveTreeSummaries(trimmedRootId)'), 'deleteSaveTree must collect tree nodes through summaries.');
assert(dbService.includes('await deleteManagedSaveItems(db, candidates);'), 'deleteSaveTree must reuse managed save deletion cleanup.');
assert(dbService.includes('item.saveTree?.rootId === rootId'), 'tree deletion must match explicit saveTree.rootId only.');

assert(saveLoadWorkflow.includes('export function clearActiveSaveTreeMetaIfMatches'), 'saveLoadWorkflow must expose active save tree cleanup after deletion.');
assert(!saveLoadWorkflow.includes('saveLoadBackupIfNeeded'), 'loading a save must not create an implicit backup node.');
assert(saveLoadWorkflow.includes('activeSaveTreeMeta.rootId === target.rootId'), 'active tree cleanup must support root deletion.');
assert(saveLoadWorkflow.includes('activeSaveTreeMeta.nodeId === target.nodeId'), 'active tree cleanup must support node deletion.');

assert(
  loadLatestBody.includes("list.find((item) => item.type === 'manual' || item.type === 'imported')"),
  'loadLatestSave must prefer visible manual/imported saves before hidden auto saves.',
);
assert(
  loadLatestBody.indexOf("item.type === 'manual' || item.type === 'imported'") < loadLatestBody.indexOf("item.type === 'auto'"),
  'loadLatestSave visible-save preference must run before auto-save fallback.',
);

assert(saveModal.includes('deleteSaveTree') && saveModal.includes('handleDeleteTree'), 'SaveLoadModal must wire deleteSaveTree.');
assert(saveModal.includes('clearActiveSaveTreeMetaIfMatches'), 'SaveLoadModal must clear stale active save tree metadata after deletion.');
assert(saveModal.includes('onDeleteTree={handleDeleteTree}'), 'SaveLoadModal must pass delete tree handler into SaveTreeGroup.');
assert(saveModal.includes('删除整树'), 'SaveLoadModal must render delete tree action.');
assert(saveModal.includes('danger'), 'SaveLoadModal delete tree action must use danger styling.');

assert(storageManager.includes('deleteSaveTree') && storageManager.includes('handleDeleteTree'), 'StorageManager must wire deleteSaveTree.');
assert(storageManager.includes('clearActiveSaveTreeMetaIfMatches'), 'StorageManager must clear stale active save tree metadata after deletion.');
assert(storageManager.includes('onDeleteTree={handleDeleteTree}'), 'StorageManager must pass delete tree handler into StorageSaveTreeGroup.');
assert(storageManager.includes('删除整树'), 'StorageManager must render delete tree action.');
assert(dbService.includes('deleteLegacyBackupSaves'), 'dbService must expose explicit legacy recovery-point cleanup.');

assert(saveModal.includes('const [deletingId, setDeletingId]') && saveModal.includes('const [deletingRootId, setDeletingRootId]'), 'SaveLoadModal must track deleting node/tree state.');
assert(saveModal.includes('const visibleSaves = useMemo(') && saveModal.includes('save.id !== deletingId') && saveModal.includes('save.saveTree?.rootId !== deletingRootId'), 'SaveLoadModal must filter deleting items from display while async deletion is pending.');
assert(saveModal.includes('setSaves((prev) => prev.filter((save) => save.id !== id))'), 'SaveLoadModal must optimistically remove deleted node from local list.');
assert(saveModalDeleteBody.includes('setDeletingId(null);\n      void refresh();'), 'SaveLoadModal node delete success must unlock before background refresh.');
assert(saveModalDeleteTreeBody.includes('setDeletingRootId(null);\n      void refresh();'), 'SaveLoadModal tree delete success must unlock before background refresh.');

assert(storageManager.includes('const [deletingId, setDeletingId]') && storageManager.includes('const [deletingRootId, setDeletingRootId]'), 'StorageManager must track deleting node/tree state.');
assert(storageManager.includes('const visibleSaves = useMemo(') && storageManager.includes('save.id !== deletingId') && storageManager.includes('save.saveTree?.rootId !== deletingRootId'), 'StorageManager must filter deleting items from display while async deletion is pending.');
assert(storageManager.includes('setSaves((prev) => prev.filter((save) => save.id !== id))'), 'StorageManager must optimistically remove deleted node from local list.');
assert(storageDeleteBody.includes('setDeletingId(null);\n      void refresh();'), 'StorageManager node delete success must unlock before background refresh.');
assert(storageDeleteTreeBody.includes('setDeletingRootId(null);\n      void refresh();'), 'StorageManager tree delete success must unlock before background refresh.');

console.log('[save-delete-regression] ok');
