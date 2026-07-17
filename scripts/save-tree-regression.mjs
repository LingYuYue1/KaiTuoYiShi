import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const saveTree = fs.readFileSync('utils/saveTree.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const dbService = fs.readFileSync('services/dbService.ts', 'utf8');

assert(saveTree.includes('export interface 存档树元信息'), '必须定义存档树元信息。');
assert(saveTree.includes('rootId: string'), '存档树必须有 rootId。');
assert(saveTree.includes('nodeId: string'), '存档树必须有 nodeId。');
assert(saveTree.includes('parentNodeId?: string'), '存档树必须有 parentNodeId。');
assert(saveTree.includes('buildNextSaveTreeMeta'), '必须能根据当前活动节点生成下一节点。');
assert(saveTree.includes('parentNodeId: previousTree.nodeId'), '新保存节点必须指向上一活动节点。');
assert(saveLoad.includes('let activeSaveTreeMeta'), '读档工作流必须记录当前活动存档树节点。');
assert(saveLoad.includes('activeSaveTreeMeta = getSaveTreeMeta(save)'), '读档时必须把目标存档设为当前活动节点。');
assert(!saveLoad.includes('saveLoadBackupIfNeeded'), '读档不得隐式创建保护节点。');
assert(saveLoad.includes('attachSaveTreeMeta'), '保存负载必须挂载存档树元信息。');
assert(saveLoad.includes('export function commitActiveSaveTreeMeta'), '必须提供保存成功后的活动树提交函数。');
assert(saveLoad.includes('const id = await saveGame(payload);') && saveLoad.indexOf('const id = await saveGame(payload);') < saveLoad.indexOf('commitActiveSaveTreeMeta(payload);'), '手动保存必须在数据库写入成功后推进活动树节点。');
assert(!saveLoad.includes('activeSaveTreeMeta = getSaveTreeMeta(withTree)'), '构建保存负载时不得提前推进尚未落盘的树节点。');
assert(dbService.includes('return runWithSaveMutationPriority(() => saveGameInternal(data))'), '保存写入必须使用写操作优先协调器。');
assert(dbService.includes('saveTree?: import'), '存档列表摘要必须携带 saveTree。');
assert(dbService.includes('saveTree: (save as 存档数据 & { saveTree?:'), '摘要构建必须从存档读取 saveTree。');

console.log('save tree regression ok');
