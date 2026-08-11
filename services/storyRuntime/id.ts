// G1.2.3 稳定 ID / fingerprint 模块（生产，只读）。
// - sha256Fingerprint：Web Crypto SHA-256（浏览器）+ Node 回归均可用；
// - stableId：只由明确 namespace + canonical scope + 旧稳定 ID/规范化语义内容组成；
//   禁止 Date.now()/Math.random()/当前时间/数组位置/进程级计数器参与语义 ID；
//   同一输入在两次调用、两次冷启动模拟、对象键不同顺序、两个深拷贝中得到完全相同 ID。
import { canonicalJsonStringify, normalizeLegacyText } from './normalization.ts';

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** 非 secure context（如局域网 HTTP）没有 Web Crypto 时使用；输出与 SHA-256 标准字节完全一致。 */
function sha256HexFallback(data: Uint8Array): string {
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = SHA256_INITIAL.slice() as number[];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const upperSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + upperSigma1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const upperSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (upperSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * 字节级 SHA-256 摘要（hex 小写）：Web Crypto 优先；非 secure context（LAN HTTP）
 * 没有 crypto.subtle 时走同算法本地回退，输出与标准 SHA-256 完全一致。
 * 相册内容哈希、云备份哈希与剧情运行时 fingerprint 统一走这一个实现，不复制第三份算法。
 */
export async function sha256BytesHex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // 某些嵌入式浏览器暴露 subtle 但拒绝 digest，继续走同算法本地回退。
    }
  }
  return sha256HexFallback(data);
}

/**
 * 计算任意普通 JSON 值的 SHA-256 摘要（hex 小写）。只接受普通 JSON 值；非法容器抛错。
 */
export async function sha256Hex(value: unknown): Promise<string> {
  const canonical = canonicalJsonStringify(value);
  return sha256BytesHex(new TextEncoder().encode(canonical));
}

/**
 * `sha256:<64 hex>` fingerprint。同一输入两次调用字节相同；对象键顺序不同不影响。
 */
export async function sha256Fingerprint(value: unknown): Promise<string> {
  return 'sha256:' + (await sha256Hex(value));
}

/**
 * 稳定语义 ID：namespace + canonical(scope) + 可选旧稳定 ID（文本归一化后）。
 * - 同一输入（键顺序不同、深拷贝、两次调用、两次冷启动）得到完全相同 ID；
 * - 数组顺序改变会改变 canonical(scope)，因此 ID 改变；
 * - 不包含时间、随机数、数组位置或进程级计数器。
 */
export async function stableId(namespace: string, scope: unknown, legacyId?: string): Promise<string> {
  const normalizedLegacyId = legacyId === undefined ? '' : normalizeLegacyText(legacyId);
  return sha256Fingerprint({
    namespace,
    scope,
    legacyId: normalizedLegacyId.length > 0 ? normalizedLegacyId : null,
  });
}

/**
 * 由原始 fingerprint 派生的短稳定后缀（用于可读 DTO 目标 ID 展示；不参与语义判定）。
 */
export function fingerprintSuffix(fingerprint: string, length = 12): string {
  const hex = fingerprint.startsWith('sha256:') ? fingerprint.slice(7) : fingerprint;
  return hex.slice(0, length);
}
