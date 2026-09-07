import { describe, expect, it } from 'vitest';
import { 创建空角色 } from '@/models/character';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空相册系统 } from '@/models/imageGeneration';
import { 创建空手机系统 } from '@/models/phone';
import { 创建空世界状态 } from '@/models/world';
import { 创建空忆庭系统 } from '@/models/yiting';
import type { 存档数据 } from '@/models/settings';
import { buildSavePackage, buildSaveTreePackage, parseSavePackage, parseSaveTreePackage } from '@/services/savePackage';
import { importSaveFileAsMany } from '@/services/storage/importExport';
import { buildStoredZip } from '@/utils/zip';

function createSave(id: number, nodeId?: string): 存档数据 {
  const traveler = 创建空角色();
  traveler.姓名 = `旅人${id}`;
  traveler.背景 = '来自测试星系的旅行者';
  const world = 创建空世界状态();
  world.当前地点 = '测试空间站';
  world.全局事件 = ['已确认的测试事件'];
  const memory = 创建空记忆系统();
  memory.长期记忆 = ['不可丢失的记忆'];
  return {
    id,
    type: 'manual',
    timestamp: id,
    turnCount: id,
    旅人: traveler,
    世界: world,
    chatHistory: [{ id: `message-${id}`, role: 'user', content: '继续前进', timestamp: id }],
    记忆: memory,
    忆庭: 创建空忆庭系统(),
    手机: 创建空手机系统(),
    相册: 创建空相册系统(),
    NPC: [],
    新闻: [],
    剧情: [],
    variableBatches: [],
    macroGlobalVars: { testFlag: `value-${id}` },
    pendingOpeningTrigger: `opening-${id}`,
    ...(nodeId ? { saveTree: { rootId: 'source-root', nodeId } } : {}),
  };
}

function zipEntries(entries: Array<[string, unknown]>): ArrayBuffer {
  const manifest = {
    app: 'KaiTuoYiShi', kind: 'save-package', packageVersion: 2,
    exportedAt: '2026-09-05T00:00:00.000Z', travelerName: 'traveler', turnCount: 1,
    timestamp: 1, format: 'ktysave', privacy: { apiKeysRemoved: true },
    files: ['manifest.json', ...entries.map(([name]) => name)],
  };
  const files: Array<[string, unknown]> = [['manifest.json', manifest], ...entries];
  const bytes = buildStoredZip(files.map(([name, value]) => ({
    name,
    data: new TextEncoder().encode(JSON.stringify(value)),
  })));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('save package decode boundary', () => {
  it('round-trips a package and restores split memory plus extension fields', async () => {
    const save = createSave(1);
    const blob = await buildSavePackage(save);
    const imported = await importSaveFileAsMany(new File([blob], 'save.ktysave', { type: 'application/zip' }));
    expect(imported).toHaveLength(1);
    expect(imported[0].记忆).toEqual(save.记忆);
    expect(imported[0].macroGlobalVars).toEqual(save.macroGlobalVars);
    expect(imported[0].pendingOpeningTrigger).toBe(save.pendingOpeningTrigger);
  });

  it('round-trips tree packages through the public importer', async () => {
    const saves = [createSave(1, 'node-1'), createSave(2, 'node-2')];
    const blob = await buildSaveTreePackage(saves);
    const imported = await importSaveFileAsMany(new File([blob], 'tree.ktysave', { type: 'application/zip' }));
    expect(imported).toHaveLength(2);
    expect(imported.map((save) => save.记忆)).toEqual(saves.map((save) => save.记忆));
    expect(imported.map((save) => save.macroGlobalVars)).toEqual(saves.map((save) => save.macroGlobalVars));
  });

  it('accepts legacy flat JSON without device settings', async () => {
    const save = createSave(1);
    const imported = await importSaveFileAsMany(new File([JSON.stringify(save)], 'legacy.json', { type: 'application/json' }));
    expect(imported[0]).toMatchObject(save);
  });

  it('rejects malformed canonical envelopes', () => {
    expect(() => parseSavePackage(zipEntries([['save.json', {
      id: 1, type: 'manual', timestamp: 1, gameData: { 旅人: {}, 世界: {} },
    }]]))).toThrow('存档节点信封格式无效');
    expect(() => parseSavePackage(zipEntries([['save.json', []]]))).toThrow('存档节点格式无效');
  });

  it('rejects malformed tree nodes', () => {
    const treeManifest = {
      rootId: 'root', exportedAt: '2026-09-05T00:00:00.000Z', nodeCount: 1, latestSaveId: 1,
      nodes: [{ id: 1, nodeId: 'node-1', type: 'manual', timestamp: 1, turnCount: 1, path: 'tree/nodes/node-1.json' }],
    };
    const manifest = {
      app: 'KaiTuoYiShi', kind: 'save-tree-package', packageVersion: 2,
      exportedAt: '2026-09-05T00:00:00.000Z', travelerName: 'traveler', turnCount: 1,
      timestamp: 1, format: 'ktysave', privacy: { apiKeysRemoved: true },
      files: ['manifest.json', 'tree/tree-manifest.json', 'tree/nodes/node-1.json'],
    };
    const bytes = buildStoredZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'tree/tree-manifest.json', data: new TextEncoder().encode(JSON.stringify(treeManifest)) },
      { name: 'tree/nodes/node-1.json', data: new TextEncoder().encode(JSON.stringify({ id: 1, gameData: [] })) },
    ]);
    expect(() => parseSaveTreePackage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
      .toThrow('存档节点信封格式无效');
  });
});
