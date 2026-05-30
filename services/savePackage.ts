import type { 存档数据 } from '@/models/settings';

const PACKAGE_VERSION = 1;
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

export interface 存档包清单 {
  app: 'KaiTuoYiShi';
  kind: 'save-package';
  packageVersion: number;
  exportedAt: string;
  travelerName: string;
  turnCount: number;
  timestamp: number;
  format: 'ktysave';
  privacy: {
    apiKeysRemoved: boolean;
  };
  files: string[];
}

type ZipEntryInput = {
  name: string;
  bytes: Uint8Array;
};

type ZipEntryOutput = ZipEntryInput & {
  crc32: number;
};

export function buildSavePackage(save: 存档数据): Blob {
  const entries = splitSaveIntoPackageEntries(sanitizeSaveForExport(save));
  const bytes = createZip(entries);
  return new Blob([bytes], { type: 'application/zip' });
}

export function sanitizeSaveForExport(save: 存档数据): 存档数据 {
  const sanitized = JSON.parse(JSON.stringify(save)) as 存档数据;
  for (const config of sanitized.apiSettings?.configs ?? []) {
    clearApiKey(config);
  }

  const settings = sanitized.gameSettings;
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

  return sanitized;
}

export async function parseSavePackage(buffer: ArrayBuffer): Promise<存档数据> {
  const files = readZip(buffer);
  const manifestText = files.get('manifest.json');
  const saveText = files.get('save.json');
  if (!manifestText || !saveText) {
    throw new Error('存档包缺少 manifest.json 或 save.json');
  }
  const manifest = JSON.parse(manifestText) as Partial<存档包清单>;
  validatePackageManifest(manifest, files);
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
  if (manifest.app !== 'KaiTuoYiShi' || manifest.kind !== 'save-package') {
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

  for (const path of PACKAGE_CORE_FILES) {
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

function createZip(inputEntries: ZipEntryInput[]): Uint8Array {
  const entries: ZipEntryOutput[] = inputEntries.map((entry) => ({
    ...entry,
    crc32: crc32(entry.bytes),
  }));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const local = new Uint8Array(30 + nameBytes.length + entry.bytes.length);
    const view = new DataView(local.buffer);
    writeLocalHeader(view, entry, nameBytes);
    local.set(nameBytes, 30);
    local.set(entry.bytes, 30 + nameBytes.length);
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

function writeLocalHeader(view: DataView, entry: ZipEntryOutput, nameBytes: Uint8Array): void {
  const { time, date } = dosDateTime(new Date());
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.bytes.length, true);
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
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.bytes.length, true);
  view.setUint32(24, entry.bytes.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
}

function readZip(buffer: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error('存档包 ZIP 结构损坏');
    const compression = view.getUint16(offset + 8, true);
    if (compression !== 0) throw new Error('暂不支持压缩格式的存档包');
    const crc = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('存档包文件长度异常');
    if (compressedSize !== fileSize) throw new Error('存档包条目大小异常');
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error(`存档包条目校验失败：${name}`);
    files.set(name, decoder.decode(data));
    offset = dataEnd;
  }
  return files;
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
