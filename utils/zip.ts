import { unzipSync, zipSync, type Zippable } from 'fflate';

export interface ZipFileInput {
  name: string;
  data: Uint8Array;
}

/** 构建 ZIP 包（stored 无压缩，同步）。 */
export function buildStoredZip(files: ZipFileInput[]): Uint8Array {
  const record: Zippable = {};
  for (const file of files) record[file.name] = file.data;
  return zipSync(record, { level: 0 });
}

/** 解压 ZIP 包（支持 stored 与 deflate 条目）。 */
export function readZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = unzipSync(bytes);
  const result = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) result.set(name, data);
  return result;
}
