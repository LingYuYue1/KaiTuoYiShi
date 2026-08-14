import type { 存档数据 } from '@/models/settings';
import { devLog } from '@/utils/devLog';
import { createUnifiedId } from '@/utils/id';
import { buildSavePackage, buildSaveTreePackage, parseSaveTreePackage } from '../savePackage';
import { 剥离检查点队列任务, type SaveWithTree } from './saveSummary';

export async function exportSavePackage(save: 存档数据): Promise<void> {
  const blob = await buildSavePackage(save);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const travelerName = sanitizeFilename(save.旅人.姓名 || 'traveler');
  const turnCount = save.turnCount;
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSaveTreePackage(saves: 存档数据[]): Promise<void> {
  if (!saves.length) return;
  const blob = await buildSaveTreePackage(saves);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const latest = [...saves].sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0];
  const travelerName = sanitizeFilename(latest.旅人.姓名 || 'traveler');
  const turnCount = latest.turnCount;
  const stamp = new Date(latest.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.href = url;
  a.download = `KaiTuoYiShi-${travelerName}-tree-${saves.length}-nodes-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function importSaveJson(json: string): 存档数据 {
  const data: unknown = JSON.parse(json);
  if (!isImportableSave(data)) throw new Error('无效的存档文件');
  return data;
}

export async function importSaveFileAsMany(file: File): Promise<存档数据[]> {
  const name = file.name.toLowerCase();
  let saves: 存档数据[];
  if (name.endsWith('.json') || file.type === 'application/json') {
    saves = [importSaveJson(await file.text())];
    devLog('save', 'import-save-parsed', { nodeCount: saves.length });
  } else if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const parsed = parseSaveTreePackage(await file.arrayBuffer());
    saves = remapImportedSaveTree(parsed);
    if (!saves.every(isImportableSave)) throw new Error('无效的存档包');
    devLog('save', 'import-save-parsed', { nodeCount: parsed.length });
    const rootId = (saves[0] as SaveWithTree | undefined)?.saveTree?.rootId;
    devLog('save', 'import-save-tree-remapped', { nodeCount: saves.length, rootId });
  } else {
    throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
  }
  // 导入恢复点按节点类型剥离 queueTasks：导出路径已移除 saveRuntime（无 unsealedHead），一律视为检查点。
  return saves.map(剥离检查点队列任务);
}

function isImportableSave(value: unknown): value is 存档数据 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Boolean(
    raw.旅人
    && raw.世界
    && Array.isArray(raw.chatHistory)
    && raw.gameSettings
    && raw.apiSettings
    && raw.theme,
  );
}

function remapImportedSaveTree(saves: 存档数据[]): 存档数据[] {
  const rootId = createImportId();
  const nodeIdMap = new Map<string, string>();
  for (const save of saves) {
    const tree = (save as SaveWithTree).saveTree;
    if (tree?.nodeId) {
      nodeIdMap.set(tree.nodeId, createImportId());
    }
  }
  return saves.map((save, index) => {
    const tree = (save as SaveWithTree).saveTree;
    if (!tree?.nodeId) {
      return {
        ...save,
        saveTree: {
          rootId,
          nodeId: createImportId(),
          branchName: '导入节点',
          createdAt: save.timestamp || Date.now() + index,
        },
      } as 存档数据;
    }
    return {
      ...save,
      saveTree: {
        ...tree,
        rootId,
        nodeId: nodeIdMap.get(tree.nodeId) ?? createImportId(),
        parentNodeId: tree.parentNodeId ? nodeIdMap.get(tree.parentNodeId) : undefined,
        branchName: tree.branchName ?? '导入节点',
        createdAt: tree.createdAt || save.timestamp || Date.now() + index,
      },
    } as 存档数据;
  });
}

function createImportId(): string {
  return createUnifiedId();
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'traveler';
}
