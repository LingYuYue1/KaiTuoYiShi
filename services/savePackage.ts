import type { 存档数据 } from '@/models/settings';
import { 创建空API设置, 创建默认游戏设置 } from '@/models/settings';
import { compactDuplicatedSaveImages } from '@/utils/saveImageCompactor';
import { buildSaveNodeDeltaRecord } from '@/utils/saveDeltaStorage';
import { expandSaveAssetPayloadForExport } from '@/utils/saveAssetStorage';

const PACKAGE_VERSION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PACKAGE_CORE_FILES = ['manifest.json', 'save.json'] as const;
const SYSTEM_ENTRY_PATHS = [
  'systems/memory.json',
  'systems/yiting.json',
  'systems/zhiku-runtime.json',
  'systems/phone.json',
  'systems/npc.json',
  'systems/album.json',
  'systems/news.json',
  'systems/plot.json',
  'systems/story-weaving.json',
  'systems/variable-batches.json',
  'systems/queue-tasks.json',
] as const;
const TREE_NODE_DELTA_PATH = 'tree/node-delta.json';
const TREE_MANIFEST_PATH = 'tree/tree-manifest.json';
const TREE_NODE_DIR = 'tree/nodes';

export interface 存档包清单 {
  app: 'KaiTuoYiShi';
  kind: 'save-package' | 'save-tree-package';
  packageVersion: number;
  exportedAt: string;
  travelerName: string;
  turnCount: number;
  timestamp: number;
  format: 'ktysave';
  nodeCount?: number;
  rootId?: string;
  privacy: {
    apiKeysRemoved: boolean;
  };
  files: string[];
}

export interface 存档树包清单 {
  rootId: string;
  exportedAt: string;
  nodeCount: number;
  latestSaveId: number;
  nodes: Array<{
    id: number;
    nodeId: string;
    parentNodeId?: string;
    branchName?: string;
    type: 存档数据['type'];
    timestamp: number;
    turnCount: number;
    path: string;
  }>;
}

type ZipEntryInput = {
  name: string;
  bytes: Uint8Array;
};

type ZipEntryOutput = ZipEntryInput & {
  compressedBytes: Uint8Array;
  compressionMethod: 0 | 8;
  crc32: number;
};

export async function buildSavePackage(save: 存档数据): Promise<Blob> {
  const expanded = await expandSaveAssetPayloadForExport(save);
  const entries = splitSaveIntoPackageEntries(sanitizeSaveForExport(compactDuplicatedSaveImages(expanded)));
  const bytes = await createZip(entries);
  return new Blob([bytes], { type: 'application/zip' });
}

export async function buildSaveTreePackage(saves: 存档数据[]): Promise<Blob> {
  const expandedSaves = await Promise.all(
    saves
      .filter((save) => save && typeof save === 'object')
      .map((save) => expandSaveAssetPayloadForExport(save)),
  );
  const normalized = expandedSaves
    .map((save) => sanitizeSaveForExport(compactDuplicatedSaveImages(save)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  if (!normalized.length) {
    throw new Error('没有可导出的存档树节点');
  }
  const rootId = getSaveTreeRootId(normalized[0]) || `tree-${Date.now()}`;
  const latest = [...normalized].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  const nodeEntries = normalized.map((save, index) => {
    const tree = getSaveTreeMetaLoose(save);
    const nodeId = tree?.nodeId || `legacy-node-${Number(save.id) || index + 1}`;
    const path = `${TREE_NODE_DIR}/${sanitizePackageSegment(nodeId)}-${Number(save.id) || index + 1}.json`;
    return {
      save,
      path,
      meta: {
        id: Number(save.id) || index + 1,
        nodeId,
        parentNodeId: tree?.parentNodeId,
        branchName: tree?.branchName,
        type: save.type,
        timestamp: Number(save.timestamp) || Date.now(),
        turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1),
        path,
      },
    };
  });
  const treeManifest: 存档树包清单 = {
    rootId,
    exportedAt: new Date().toISOString(),
    nodeCount: nodeEntries.length,
    latestSaveId: Number(latest.id) || nodeEntries.at(-1)?.meta.id || 0,
    nodes: nodeEntries.map((entry) => entry.meta),
  };
  const files: Array<[string, unknown]> = [
    [TREE_MANIFEST_PATH, treeManifest],
    ...nodeEntries.map((entry) => [entry.path, entry.save] as [string, unknown]),
  ];
  const manifest: 存档包清单 = {
    app: 'KaiTuoYiShi',
    kind: 'save-tree-package',
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    travelerName: latest.旅人?.姓名 || 'traveler',
    turnCount: latest.turnCount ?? ((latest.chatHistory?.length ?? 0) + 1),
    timestamp: latest.timestamp || Date.now(),
    format: 'ktysave',
    nodeCount: nodeEntries.length,
    rootId,
    privacy: {
      apiKeysRemoved: true,
    },
    files: ['manifest.json', ...files.map(([name]) => name)],
  };
  const entries = [
    textEntry('manifest.json', manifest),
    ...files.map(([name, value]) => textEntry(name, value)),
  ];
  return new Blob([await createZip(entries)], { type: 'application/zip' });
}

export function sanitizeSaveForExport(save: 存档数据): 存档数据 {
  const sanitized = JSON.parse(JSON.stringify(compactDuplicatedSaveImages(save))) as 存档数据 & {
    saveRuntime?: unknown;
    debugContext?: unknown;
  };
  delete sanitized.saveRuntime;
  delete sanitized.debugContext;
  sanitized.chatHistory = stripRuntimeDebugFromChatHistory(sanitized.chatHistory);
  stripEmbeddedApiSettings(sanitized);
  return sanitized;
}

/** Async export sanitizer that rehydrates Blob-backed album assets into portable dataUrls. */
export async function sanitizeSaveForExportAsync(save: 存档数据): Promise<存档数据> {
  const expanded = await expandSaveAssetPayloadForExport(save);
  return sanitizeSaveForExport(expanded);
}

function stripEmbeddedApiSettings(sanitized: 存档数据): void {
  const defaults = 创建默认游戏设置();
  const settings = sanitized.gameSettings ?? defaults;
  sanitized.gameSettings = settings;

  for (const config of sanitized.apiSettings?.configs ?? []) {
    clearApiKey(config);
  }

  clearApiKey(settings?.variableApi);
  clearApiKey(settings?.新闻系统?.api);
  clearApiKey(settings?.手机系统?.api);
  clearApiKey(settings?.智库系统?.api);
  clearApiKey(settings?.剧情编织系统?.api);
  clearApiKey(settings?.记忆系统?.记忆总结API);
  clearApiKey(settings?.记忆系统?.忆庭召回API);
  clearApiKey(settings?.记忆系统?.忆庭精炼API);
  clearApiKey(settings?.文生图系统?.普通接口);
  clearApiKey(settings?.文生图系统?.场景接口);
  clearApiKey(settings?.文生图系统?.NSFW接口);
  clearApiKey(settings?.文生图系统?.词组转化器API);
  clearApiKey(settings?.文生图系统?.正文生图?.parserApi);
  clearApiKey(settings?.文生图系统?.正文生图?.imageApi);

  sanitized.apiSettings = 创建空API设置();
  sanitized.gameSettings = {
    ...defaults,
    ...settings,
    enableClaudeMode: defaults.enableClaudeMode,
    variableApi: defaults.variableApi,
    新闻系统: {
      ...(settings.新闻系统 ?? defaults.新闻系统),
      api: defaults.新闻系统.api,
    },
    手机系统: {
      ...(settings.手机系统 ?? defaults.手机系统),
      api: defaults.手机系统.api,
    },
    智库系统: {
      ...(settings.智库系统 ?? defaults.智库系统),
      api: defaults.智库系统.api,
    },
    剧情编织系统: {
      ...(settings.剧情编织系统 ?? defaults.剧情编织系统),
      api: defaults.剧情编织系统.api,
    },
    记忆系统: {
      ...(settings.记忆系统 ?? defaults.记忆系统),
      记忆总结API: defaults.记忆系统.记忆总结API,
      忆庭召回API: defaults.记忆系统.忆庭召回API,
      忆庭精炼API: defaults.记忆系统.忆庭精炼API,
    },
    文生图系统: {
      ...(settings.文生图系统 ?? defaults.文生图系统),
      普通接口: defaults.文生图系统.普通接口,
      场景接口: defaults.文生图系统.场景接口,
      useSeparateSceneApi: defaults.文生图系统.useSeparateSceneApi,
      NSFW接口: defaults.文生图系统.NSFW接口,
      词组转化器API: defaults.文生图系统.词组转化器API,
      正文生图: {
        ...(settings.文生图系统?.正文生图 ?? defaults.文生图系统.正文生图),
        parserApi: defaults.文生图系统.正文生图.parserApi,
        imageApi: defaults.文生图系统.正文生图.imageApi,
      },
    },
  };
}

function stripRuntimeDebugFromChatHistory(chatHistory: 存档数据['chatHistory']): 存档数据['chatHistory'] {
  if (!Array.isArray(chatHistory)) return [];
  return chatHistory.map((message) => {
    const clean = { ...message } as typeof message & {
      debugContext?: unknown;
    };
    delete clean.debugContext;
    return clean;
  });
}

export async function parseSavePackage(buffer: ArrayBuffer): Promise<存档数据> {
  const files = await readZip(buffer);
  const manifestText = files.get('manifest.json');
  if (!manifestText) {
    throw new Error('存档包缺少 manifest.json');
  }
  const manifest = JSON.parse(manifestText) as Partial<存档包清单>;
  validatePackageManifest(manifest, files);
  if (manifest.kind === 'save-tree-package') {
    const tree = parseSaveTreePackageFiles(files, manifest);
    const latest = tree.nodes.find((save) => Number(save.id) === tree.latestSaveId) ?? tree.nodes.at(-1);
    if (!latest) throw new Error('存档树包没有可导入节点');
    return latest;
  }
  const saveText = files.get('save.json');
  if (!saveText) {
    throw new Error('存档包缺少 save.json');
  }
  const save = JSON.parse(saveText) as 存档数据;
  const read = <T,>(path: string): T | undefined => {
    const text = files.get(path);
    return text ? JSON.parse(text) as T : undefined;
  };
  return {
    ...save,
    记忆: read<存档数据['记忆']>('systems/memory.json') ?? save.记忆,
    忆庭: read<存档数据['忆庭']>('systems/yiting.json') ?? save.忆庭,
    智库: read<存档数据['智库']>('systems/zhiku-runtime.json') ?? save.智库,
    手机: read<存档数据['手机']>('systems/phone.json') ?? save.手机,
    NPC: read<存档数据['NPC']>('systems/npc.json') ?? save.NPC,
    相册: read<存档数据['相册']>('systems/album.json') ?? save.相册,
    新闻: read<存档数据['新闻']>('systems/news.json') ?? save.新闻,
    剧情: read<存档数据['剧情']>('systems/plot.json') ?? save.剧情,
    剧情编织: read<存档数据['剧情编织']>('systems/story-weaving.json') ?? save.剧情编织,
    variableBatches: read<存档数据['variableBatches']>('systems/variable-batches.json') ?? save.variableBatches,
    queueTasks: read<存档数据['queueTasks']>('systems/queue-tasks.json') ?? save.queueTasks,
  };
}

export async function parseSaveTreePackage(buffer: ArrayBuffer): Promise<存档数据[]> {
  const files = await readZip(buffer);
  const manifestText = files.get('manifest.json');
  if (!manifestText) {
    throw new Error('存档包缺少 manifest.json');
  }
  const manifest = JSON.parse(manifestText) as Partial<存档包清单>;
  validatePackageManifest(manifest, files);
  if (manifest.kind !== 'save-tree-package') {
    return [await parseSavePackage(buffer)];
  }
  return parseSaveTreePackageFiles(files, manifest).nodes;
}

function parseSaveTreePackageFiles(files: Map<string, string>, manifest: Partial<存档包清单>): { latestSaveId: number; nodes: 存档数据[] } {
  const treeManifestText = files.get(TREE_MANIFEST_PATH);
  if (!treeManifestText) {
    throw new Error('存档树包缺少 tree/tree-manifest.json');
  }
  const treeManifest = JSON.parse(treeManifestText) as Partial<存档树包清单>;
  if (!Array.isArray(treeManifest.nodes) || treeManifest.nodes.length === 0) {
    throw new Error('存档树包节点清单为空');
  }
  const nodes = treeManifest.nodes.map((node) => {
    if (!node?.path || !isSafePackagePath(node.path)) {
      throw new Error('存档树包节点路径异常');
    }
    const text = files.get(node.path);
    if (!text) {
      throw new Error(`存档树包缺少节点文件：${node.path}`);
    }
    return JSON.parse(text) as 存档数据;
  });
  return {
    latestSaveId: Number(treeManifest.latestSaveId) || Number(manifest.timestamp) || 0,
    nodes,
  };
}

function splitSaveIntoPackageEntries(save: 存档数据): ZipEntryInput[] {
  const {
    记忆,
    忆庭,
    智库,
    手机,
    NPC,
    相册,
    新闻,
    剧情,
    剧情编织,
    variableBatches,
    queueTasks,
    ...core
  } = save;
  const files = ([
    ['save.json', core],
    [SYSTEM_ENTRY_PATHS[0], 记忆],
    [SYSTEM_ENTRY_PATHS[1], 忆庭],
    [SYSTEM_ENTRY_PATHS[2], 智库],
    [SYSTEM_ENTRY_PATHS[3], 手机],
    [SYSTEM_ENTRY_PATHS[4], NPC],
    [SYSTEM_ENTRY_PATHS[5], 相册],
    [SYSTEM_ENTRY_PATHS[6], 新闻],
    [SYSTEM_ENTRY_PATHS[7], 剧情],
    [SYSTEM_ENTRY_PATHS[8], 剧情编织],
    [SYSTEM_ENTRY_PATHS[9], variableBatches],
    [SYSTEM_ENTRY_PATHS[10], queueTasks],
    [TREE_NODE_DELTA_PATH, buildSaveNodeDeltaRecord(save, Number(save.id) || 0)],
  ] satisfies Array<[string, unknown]>).filter(([, value]) => value !== undefined);

  const manifest: 存档包清单 = {
    app: 'KaiTuoYiShi',
    kind: 'save-package',
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    travelerName: save.旅人?.姓名 || 'traveler',
    turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1),
    timestamp: save.timestamp || Date.now(),
    format: 'ktysave',
    privacy: {
      apiKeysRemoved: true,
    },
    files: ['manifest.json', ...files.map(([name]) => name)],
  };

  return [
    textEntry('manifest.json', manifest),
    ...files.map(([name, value]) => textEntry(name, value)),
  ];
}

function textEntry(name: string, value: unknown): ZipEntryInput {
  return {
    name,
    bytes: encoder.encode(JSON.stringify(value, null, 2)),
  };
}

function clearApiKey(config: { apiKey?: string } | null | undefined): void {
  if (!config || typeof config !== 'object') return;
  config.apiKey = '';
}

function validatePackageManifest(manifest: Partial<存档包清单>, files: Map<string, string>): void {
  if (manifest.app !== 'KaiTuoYiShi' || (manifest.kind !== 'save-package' && manifest.kind !== 'save-tree-package')) {
    throw new Error('不是有效的开拓轶事存档包');
  }
  if (manifest.format !== 'ktysave') {
    throw new Error('存档包格式标记异常');
  }
  if (!Number.isInteger(manifest.packageVersion) || (manifest.packageVersion ?? 0) < 1) {
    throw new Error('存档包版本异常');
  }
  if ((manifest.packageVersion ?? 0) > PACKAGE_VERSION) {
    throw new Error('存档包版本过高，请更新客户端后再导入');
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('存档包清单缺少文件列表');
  }

  for (const path of manifest.files) {
    if (!isSafePackagePath(path)) {
      throw new Error(`存档包清单包含非法路径：${String(path)}`);
    }
    if (!files.has(path)) {
      throw new Error(`存档包缺少清单文件：${path}`);
    }
  }

  const coreFiles = manifest.kind === 'save-tree-package' ? ['manifest.json', TREE_MANIFEST_PATH] : PACKAGE_CORE_FILES;
  for (const path of coreFiles) {
    if (!manifest.files.includes(path) || !files.has(path)) {
      throw new Error(`存档包缺少核心文件：${path}`);
    }
  }
}

function isSafePackagePath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

async function createZip(inputEntries: ZipEntryInput[]): Promise<Uint8Array> {
  const entries: ZipEntryOutput[] = [];
  for (const entry of inputEntries) {
    const compressedBytes = await deflateRawIfAvailable(entry.bytes);
    entries.push({
      ...entry,
      compressedBytes: compressedBytes ?? entry.bytes,
      compressionMethod: compressedBytes ? 8 : 0,
      crc32: crc32(entry.bytes),
    });
  }
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const local = new Uint8Array(30 + nameBytes.length + entry.compressedBytes.length);
    const view = new DataView(local.buffer);
    writeLocalHeader(view, entry, nameBytes);
    local.set(nameBytes, 30);
    local.set(entry.compressedBytes, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    writeCentralHeader(new DataView(central.buffer), entry, nameBytes, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);

  return concatBytes([...localParts, ...centralParts, eocd]);
}

function getSaveTreeMetaLoose(save: 存档数据): { rootId?: string; nodeId?: string; parentNodeId?: string; branchName?: string } | undefined {
  return (save as 存档数据 & { saveTree?: { rootId?: string; nodeId?: string; parentNodeId?: string; branchName?: string } }).saveTree;
}

function getSaveTreeRootId(save: 存档数据): string | undefined {
  return getSaveTreeMetaLoose(save)?.rootId;
}

function sanitizePackageSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || 'node';
}

function writeLocalHeader(view: DataView, entry: ZipEntryOutput, nameBytes: Uint8Array): void {
  const { time, date } = dosDateTime(new Date());
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entry.compressionMethod, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.compressedBytes.length, true);
  view.setUint32(22, entry.bytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
}

function writeCentralHeader(view: DataView, entry: ZipEntryOutput, nameBytes: Uint8Array, offset: number): void {
  const { time, date } = dosDateTime(new Date());
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, entry.compressionMethod, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.compressedBytes.length, true);
  view.setUint32(24, entry.bytes.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
}

const ZIP_MAX_ENTRIES = 4096;
const ZIP_MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const ZIP_MAX_UNPACKED_BYTES = 768 * 1024 * 1024;
const ZIP_MAX_COMPRESSION_RATIO = 200;

/**
 * 读取 ZIP（带解压安全预检与限流）：
 * - 解压前用 ZIP header 的 fileSize 拒绝超限条目与累计超限，不得解压后才检查；
 * - 检查条目数量、单条声明压缩/解压大小、累计声明解压大小与合理压缩比；
 * - inflate 使用带累计字节计数的流式读取，实际输出超限时立即取消 reader。
 */
async function readZip(
  buffer: ArrayBuffer,
  limits: { maxEntries?: number; maxEntryBytes?: number; maxUnpackedBytes?: number; maxRatio?: number } = {},
): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const maxEntries = limits.maxEntries ?? ZIP_MAX_ENTRIES;
  const maxEntryBytes = limits.maxEntryBytes ?? ZIP_MAX_ENTRY_BYTES;
  const maxUnpackedBytes = limits.maxUnpackedBytes ?? ZIP_MAX_UNPACKED_BYTES;
  const maxRatio = limits.maxRatio ?? ZIP_MAX_COMPRESSION_RATIO;
  const files = new Map<string, string>();
  let offset = 0;
  let entryCount = 0;
  let totalUnpacked = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error('存档包 ZIP 结构损坏');
    entryCount += 1;
    if (entryCount > maxEntries) throw new Error('存档包条目数量超过安全上限');
    const compression = view.getUint16(offset + 8, true);
    if (compression !== 0 && compression !== 8) throw new Error('暂不支持此 ZIP 压缩格式的存档包');
    const crc = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('存档包文件长度异常');
    // 解压前预检（inflateRaw 之前）：声明解压大小超限 / 累计超限 / 压缩比异常直接拒绝。
    if (fileSize > maxEntryBytes) throw new Error(`存档包条目解压后超过安全上限：${name}`);
    totalUnpacked += fileSize;
    if (totalUnpacked > maxUnpackedBytes) throw new Error('存档包累计解压大小超过安全上限');
    if (compression === 8 && fileSize > 0 && compressedSize > 0 && fileSize / compressedSize > maxRatio) {
      throw new Error(`存档包条目压缩比异常：${name}`);
    }
    const compressedData = bytes.slice(dataStart, dataEnd);
    const data = compression === 8 ? await inflateRaw(compressedData, maxEntryBytes) : compressedData;
    if (data.length !== fileSize) throw new Error('存档包条目大小异常');
    if (crc32(data) !== crc) throw new Error(`存档包条目校验失败：${name}`);
    files.set(name, decoder.decode(data));
    offset = dataEnd;
  }
  return files;
}

async function deflateRawIfAvailable(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!('CompressionStream' in globalThis)) return null;
  try {
    return await runCompressionStream(bytes, 'deflate-raw');
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array, maxOutputBytes: number): Promise<Uint8Array> {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error('当前浏览器不支持压缩存档包解压，请更新浏览器或使用未压缩旧包');
  }
  return runDecompressionStream(bytes, 'deflate-raw', maxOutputBytes);
}

async function runCompressionStream(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 流式解压（限流）：累计输出超过 maxOutputBytes 时立即取消 reader，不得先拼出完整超大数组。 */
async function runDecompressionStream(bytes: Uint8Array, format: CompressionFormat, maxOutputBytes: number): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxOutputBytes) {
        await reader.cancel();
        throw new Error('存档包条目解压输出超过安全上限，已中止。');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.message === '存档包条目解压输出超过安全上限，已中止。') throw err;
    await reader.cancel().catch(() => {});
    throw err;
  }
  return concatBytes(chunks);
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  const table = crcTable ?? buildCrcTable();
  crcTable = table;
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}
