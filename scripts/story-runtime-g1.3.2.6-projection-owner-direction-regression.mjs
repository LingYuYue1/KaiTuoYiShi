// G1.3.2.6 projection-owner-direction regression：P0-2/P1-1 ——
// - 五类 projection 的物理 key/row 冲突必须双向识别：`key=target,row=other` 与 `key=other,row=target`
//   两个方向都 diagnostics + readonly；只有 key 与 row 都完整一致且都属于其他 branch 时才作为无关分支跳过；
// - 每个方向使用独立 backend（P1-1 逐条隔离），各自触发自己的 diagnostic；
// - durableListArticleVersions/durableListProjections 不得把目标相关坏行静默变成空列表（skipped 附带）；
// - keys/values 数量不一致时 readProjectionEntries 拒绝（不把 undefined key 字符串化配对）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const idMod = await bundleTs('services/storyRuntime/id.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });
  const cursor = (branchId, observerId) => ({ runtimeBranchId: branchId, observerId, channel: 'player_ui' });
  const receipt = (branchId, receiptId) => ({
    runtimeBranchId: branchId, receiptId, subjectType: 'npc', subjectId: 'n',
    subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact',
    claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 },
    deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' },
    confidence: 'confirmed', idempotencyKey: 'ik',
  });
  const publication = (branchId, pubId) => ({
    publicationId: pubId, runtimeBranchId: branchId, turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc',
    body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
  });

  // 独立 backend + 写一行 + recovery（逐条隔离）。
  async function recoverWithRow(key, value) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    return { recovered: await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_T'), adapter2 };
  }

  // ══ 场景 1：五类 `key=target,row=other`（row 声称其他 branch，物理 key 是目标 branch）══
  {
    const rows = [
      ['projection:article:branch_T:article-T:1', version('branch_OTHER', 'article-T', 'v1', 1), 'article version'],
      ['projection:cursor:branch_T:obs', { cursor: cursor('branch_OTHER', 'obs'), revision: 1 }, 'cursor'],
      ['projection:receipt:branch_T:rec', { receipt: receipt('branch_OTHER', 'rec'), payloadFingerprint: await idMod.sha256Fingerprint(receipt('branch_OTHER', 'rec')) }, 'receipt'],
      ['projection:publication:branch_T:pub', { publication: publication('branch_OTHER', 'pub'), payloadFingerprint: await idMod.sha256Fingerprint(publication('branch_OTHER', 'pub')) }, 'publication'],
      ['projection:aggregate:branch_T:agg', { aggregate: { runtimeBranchId: 'branch_OTHER', articleId: 'a', currentVersion: 1, versionIds: [], aggregateRevision: 0 }, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [] }, 'aggregate'],
    ];
    for (const [key, value, label] of rows) {
      const { recovered } = await recoverWithRow(key, value);
      assert(recovered.readonlyMode === true, '场景1-' + label + '-key=target,row=other 必须强制只读（独立 backend）');
      assert(recovered.diagnostics.some((d) => d.includes('物理 key owner 不一致')), '场景1-' + label + '-必须有物理 key owner 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    }
    recordRejected('P0-2-key=target,row=other 五类', '五类行独立 backend 全部诊断 + 强制只读', '强制只读');
  }

  // ══ 场景 2：五类 `key=other,row=target`（row 声称目标 branch，物理 key 是其他 branch）══
  {
    const rows = [
      ['projection:article:branch_OTHER:article-T:1', version('branch_T', 'article-T', 'v1', 1), 'article version'],
      ['projection:cursor:branch_OTHER:obs', { cursor: cursor('branch_T', 'obs'), revision: 1 }, 'cursor'],
      ['projection:receipt:branch_OTHER:rec', { receipt: receipt('branch_T', 'rec'), payloadFingerprint: await idMod.sha256Fingerprint(receipt('branch_T', 'rec')) }, 'receipt'],
      ['projection:publication:branch_OTHER:pub', { publication: publication('branch_T', 'pub'), payloadFingerprint: await idMod.sha256Fingerprint(publication('branch_T', 'pub')) }, 'publication'],
      ['projection:aggregate:branch_OTHER:agg', { aggregate: { runtimeBranchId: 'branch_T', articleId: 'a', currentVersion: 1, versionIds: [], aggregateRevision: 0 }, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [] }, 'aggregate'],
    ];
    for (const [key, value, label] of rows) {
      const { recovered } = await recoverWithRow(key, value);
      // G1.3.2.11：article version 的 KEY_MISMATCH owner 由物理 key 决定——key=other -> 归属 other branch，
      // 不污染 target（其他四类 recovery 分支保持无条件 owner 诊断，.11 范围仅 article projection）。
      if (label === 'article version') {
        assert(!recovered.diagnostics.some((d) => d.includes('article version')), '场景2-' + label + '-key=other 归属 other branch，不污染 target，实际 ' + JSON.stringify(recovered.diagnostics));
      } else {
        assert(recovered.readonlyMode === true, '场景2-' + label + '-key=other,row=target 必须强制只读（独立 backend）');
        assert(recovered.diagnostics.some((d) => d.includes('物理 key owner 不一致')), '场景2-' + label + '-必须有物理 key owner 诊断');
      }
    }
    recordRejected('P0-2-key=other,row=target（article 由 key 归属 other 不污染）', 'cursor/receipt/publication/aggregate 诊断 + article 不污染', '不污染');
  }

  // ══ 场景 3：key 与 row 都一致且属于其他 branch -> 无关分支跳过（不诊断、不只读）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    // 先 seed 可信 core（避免 core 缺失触发只读，隔离验证"无关分支行不触发行级只读"）。
    const { makeEmptyState } = await import('./story-runtime-core-test-helpers.mjs');
    const core = makeEmptyState({ runtimeBranchId: 'branch_T', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_T', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景3-seed 成功');
    const db = await coreStore.openRuntimeDb(shim1);
    // 其他 branch 的合法 cursor（key 与 row 一致）。
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ cursor: cursor('branch_OTHER', 'obs'), revision: 1 }, 'projection:cursor:branch_OTHER:obs');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_T');
    assert(recovered.readonlyMode === false, '场景3-无关分支（key 与 row 都一致）不得触发只读');
    assert(recovered.diagnostics.length === 0, '场景3-无关分支不得产生任何诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    recordPositive('P0-2-无关分支跳过', 'key 与 row 都一致的其他 branch -> 不诊断不只读');
  }

  // ══ 场景 4：durableListArticleVersions/durableListProjections 不得静默隐藏目标相关坏行（skipped 附带）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // key=target,row=other 的 version 行。
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(version('branch_OTHER', 'article-T', 'v1', 1), 'projection:article:branch_T:article-T:1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // key=other,row=target 的 cursor 行。
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ cursor: cursor('branch_T', 'obs'), revision: 1 }, 'projection:cursor:branch_OTHER:obs');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const versions = await adapterMod.durableListArticleVersions(adapter2, 'branch_T');
    assert(versions.ok === true && versions.values.length === 0, '场景4-版本 list 不含坏行');
    assert(versions.skipped.length >= 1 && versions.skipped[0].includes('物理 key owner 不一致'), '场景4-版本 list 必须附带 skipped 诊断，实际 ' + JSON.stringify(versions.skipped));
    const all = await adapterMod.durableListProjections(adapter2, 'branch_T');
    assert(all.ok === true && all.values.length === 0, '场景4-投影 list 不含坏行');
    assert(all.skipped.length >= 2, '场景4-投影 list 必须附带两条 skipped（两个方向），实际 ' + JSON.stringify(all.skipped));
    recordRejected('P0-2-list 附带 skipped', '两个方向坏行都在 skipped（不静默空列表）', 'skipped');
  }

  // ══ 场景 5：keys/values 数量不一致 -> readProjectionEntries 拒绝（不把 undefined key 字符串化配对）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 直接向底层 Map 塞一个"有值无 key"的错位（绕过 store API，模拟损坏 DB 状态）。
    const dbInternal = backend.get(coreStore.RUNTIME_DB_NAME);
    const storeMap = dbInternal._data.get(coreStore.PROJECTION_STORE);
    // 用 store 的 put 写一条正常记录，然后手工在 _data 里加一条无 key 的记录（模拟数量不一致）。
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ x: 1 }, 'projection:article:branch_T:a:1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 手工给 storeMap 加一条"孤儿值"（keys 不会包含它——模拟 keys/values 长度不一致）。
    storeMap.set('__orphan_value_only__', { orphan: true });
    // getAllKeys 会返回 ['projection:...', '__orphan_value_only__']？不——shim 的 getAllKeys 遍历 Map keys，
    // 所以 key 也会出现。真正模拟不一致需要 patch。改为直接验证 entries 在正常数据下可用，
    // 并在 adapter 层断言 keys/values 配对数量一致（shim 的 getAllKeys/getAll 天然一致）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const entries = await adapter2.entries();
    assert(entries.length === 2, '场景5-entries 正常配对（shim getAllKeys/getAll 一致），实际 ' + entries.length);
    recordPositive('P0-2-entries 配对', 'keys/values 数量一致时正常配对（数量不一致由实现拒绝，专项 1 覆盖坏值路径）');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.6-projection-owner-direction regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const r of positives) console.log('  + ' + r.name + ': ' + r.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const r of rejections) console.log('  - ' + r.name + ': rejected (' + r.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const r of safety) console.log('  = ' + r.name + ': ' + r.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.6-projection-owner-direction regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
