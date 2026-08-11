// G1.2.3 内存只读 catalog 目录（生产；本阶段只作为未来运行时消费的只读边界）。
// G1.3.1.6 安全修正：模块私有 WeakSet brand + #snapshots 真实私有字段。
// G1.3.1.7 安全修正：capability 只发给直接实例（new.target 拒绝子类化 + 冻结类原型 +
// verifier 绑定精确生产原型并校验 has/get 无 own 覆盖/未被替换），阻断子类继承 brand 与
// Object.setPrototypeOf 篡改读取路径。
// - 只保存已通过 validateStoryAssetCatalog 的只读 catalog snapshot，并按精确 catalogFingerprint 查找；
// - 同 fingerprint 不同 canonical bytes 拒绝；新 fingerprint 不覆盖旧 fingerprint；
// - 不按标题、当前系列或"最新版本"偷偷替换旧 runtime 绑定；
// - 不使用 localStorage/IndexedDB/React state，不 import 旧运行流程；
// - 不修改传入 catalog；存入后外部修改原对象不得改变 store 中 snapshot。
// - #snapshots：真实 JS 私有字段，get/put 读取不经过 this.snapshots 属性访问，
//   Proxy 无法通过 get snapshots trap 替换数据路径。
import { canonicalJsonStringify } from './normalization';
import { sha256Fingerprint } from './id';
import { validateStoryAssetCatalog } from './runtimeValidator';

export type CatalogPutResult = { ok: true; fingerprint: string } | { ok: false; reason: string };

// 模块私有 brand：只有正式构造函数登记的直接实例才被 verifier 认可。
const BRAND = new WeakSet<object>();

/**
 * 内存只读 catalog 快照目录。put 会复用 validateStoryAssetCatalog（G1.2.2），
 * 再验证 fingerprint 与 canonical 内容一致；调用方不能靠注释约定绕过结构或指纹校验。
 * G1.3.1.7：构造时 new.target 必须是本类（子类化被拒绝），并登记进模块私有 brand。
 */
export class StoryAssetCatalogStore {
  #snapshots = new Map<string, string>();

  constructor() {
    // 子类构造（new.target 指向子类）直接拒绝：capability 只发给生产类的直接实例，
    // 防止恶意子类继承基类构造器的 brand 并以覆盖的 has/get 提供伪造 catalog snapshot。
    if (new.target !== StoryAssetCatalogStore) {
      throw new TypeError('StoryAssetCatalogStore 不允许子类化（owner capability 只发给直接实例）');
    }
    BRAND.add(this);
  }

  get size(): number {
    return this.#snapshots.size;
  }

  has(fingerprint: string): boolean {
    return this.#snapshots.has(fingerprint);
  }

  get(fingerprint: string): unknown | null {
    const bytes = this.#snapshots.get(fingerprint);
    if (bytes === undefined) return null;
    return JSON.parse(bytes) as unknown;
  }

  /**
   * 存入 catalog 快照。catalog 必须携带 catalogFingerprint 字段（已校验的正式目录）。
   * - fingerprint 缺失/非字符串 -> 拒绝；
   * - 同 fingerprint 不同 canonical bytes -> 拒绝（不允许同指纹不同内容）；
   * - 新 fingerprint 不会覆盖既有 fingerprint（不同指纹并存，各自独立读取）。
   */
  async put(catalog: unknown): Promise<CatalogPutResult> {
    const validation = validateStoryAssetCatalog(catalog);
    if (!validation.ok) {
      const first = validation.issues[0];
      return { ok: false, reason: 'catalog 结构校验失败: ' + first.code + ' ' + first.path + ' ' + first.message };
    }
    const fingerprint = validation.value.catalogFingerprint;
    if (typeof fingerprint !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(fingerprint)) {
      return { ok: false, reason: 'catalogFingerprint 必须是 sha256:<64 hex> 字符串' };
    }
    const { catalogFingerprint: _ignored, ...fingerprintPayload } = validation.value;
    const calculatedFingerprint = await sha256Fingerprint(fingerprintPayload);
    if (calculatedFingerprint !== fingerprint) {
      return { ok: false, reason: 'catalogFingerprint 与 canonical 内容不匹配: expected ' + calculatedFingerprint + ', actual ' + fingerprint };
    }
    const bytes = canonicalJsonStringify(validation.value);
    const existing = this.#snapshots.get(fingerprint);
    if (existing !== undefined && existing !== bytes) {
      return { ok: false, reason: '同 fingerprint 不同 canonical bytes：拒绝' };
    }
    this.#snapshots.set(fingerprint, bytes);
    return { ok: true, fingerprint };
  }

  /**
   * 覆盖守卫：尝试用新的 canonical bytes 覆盖旧 fingerprint 必须被拒绝。
   */
  guardOverwrite(fingerprint: string, newBytes: string): { ok: boolean; reason: string } {
    const existing = this.#snapshots.get(fingerprint);
    if (existing === undefined) return { ok: true, reason: 'fingerprint 不存在' };
    if (existing === newBytes) return { ok: true, reason: 'bytes 相同（幂等）' };
    return { ok: false, reason: '新 fingerprint 不得覆盖旧 fingerprint（同指纹不同内容）' };
  }

  clear(): void {
    this.#snapshots.clear();
  }
}

// G1.3.1.7：冻结类原型——prototype.has/get 等方法不能被替换（严格模式下赋值/defineProperty 抛 TypeError）。
// 类方法全部读取 #snapshots（真实私有槽），冻结原型不影响 put/clear 的私有槽读写。
Object.freeze(StoryAssetCatalogStore.prototype);

/**
 * G1.3.1.7 不可伪造 owner verifier：只认可模块私有 WeakSet brand 登记的直接实例，
 * 且实例原型必须仍是本模块类原型（绑定精确生产原型）：
 * - brand 是身份（identity）语义：Proxy 对象本身不在 brand 中，转发真实 store 也不会通过；
 * - Object.getPrototypeOf(value) === StoryAssetCatalogStore.prototype：拒绝子类实例、
 *   构造后 setPrototypeOf 篡改与跨 bundle 对象（其原型是另一份类副本的原型）；
 * - has/get 无 own 覆盖（含 getter/setter，用 getOwnPropertyDescriptor 检查，不读取 getter，getter 0 次调用）；
 *   仍指向本模块原型方法（原型方法被替换时拒绝）。
 * - 全部读取包 try/catch：Proxy getPrototypeOf/ownKeys/getOwnPropertyDescriptor/get trap 抛异常 -> false。
 */
export function isStoryAssetCatalogStore(value: unknown): value is StoryAssetCatalogStore {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    if (!BRAND.has(value)) return false;
    // 直接实例校验：原型必须仍是本模块类原型（拒绝子类/构造后 setPrototypeOf 篡改/跨 bundle 对象）。
    if (Object.getPrototypeOf(value) !== StoryAssetCatalogStore.prototype) return false;
    // 防御纵深：has/get 不得有 own 覆盖（含 getter/setter，不读取 getter）；必须仍指向本模块原型方法。
    for (const key of ['has', 'get'] as const) {
      if (Object.getOwnPropertyDescriptor(value, key) !== undefined) return false;
      if ((value as unknown as Record<string, unknown>)[key] !== (StoryAssetCatalogStore.prototype as unknown as Record<string, unknown>)[key]) return false;
    }
    return true;
  } catch {
    return false;
  }
}
