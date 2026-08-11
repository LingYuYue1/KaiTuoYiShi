// G1.3.2.6 publication-typed-get regression：P0-3/P1-1 ——
// - durableGetPublication 必须验证完整 wrapper（{publication, payloadFingerprint}）、
//   payloadFingerprint 与 inner payload 的 sha256Fingerprint 一致、请求的 branch/publicationId 与 row
//   完全一致（物理 key 派生读取，双向 owner）；
// - 缺包装、缺 fingerprint、fingerprint mismatch、错 publicationId、错 branch 均返回稳定 typed 失败
//   （MISSING/INVALID_ROW/KEY_MISMATCH，不 throw、不返回错误 owner 的 publication）；
// - 每个负例独立 backend（P1-1 逐条隔离）；合法行成功（对照）。
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
  const publication = (branchId, pubId) => ({
    publicationId: pubId, runtimeBranchId: branchId, turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc',
    body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
  });

  // 独立 backend + 写一行 + typed get（逐条隔离）。
  async function getWithRow(rowValue, requestBranch, requestPubId) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = adapterMod.PROJECTION_STORE ? 'projection:publication:' + requestBranch + ':' + requestPubId : '';
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(rowValue, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    return adapterMod.durableGetPublication(adapter2, requestBranch, requestPubId);
  }

  // ══ 场景 1：缺包装 / 缺 fingerprint / fingerprint 不一致 / 错 publicationId / 错 branch -> 稳定失败 ══
  {
    const pub = publication('branch_P', 'pub-real');
    const realFp = await idMod.sha256Fingerprint(pub);
    const cases = [
      ['缺包装（裸 publication）', pub, 'branch_P', 'pub-real', 'INVALID_ROW'],
      ['缺 fingerprint', { publication: pub }, 'branch_P', 'pub-real', 'INVALID_ROW'],
      ['fingerprint 不一致', { publication: pub, payloadFingerprint: 'sha256:wrong' }, 'branch_P', 'pub-real', 'INVALID_ROW'],
      ['错 publicationId（请求 key 与 row 不符）', { publication: pub, payloadFingerprint: realFp }, 'branch_P', 'pub-OTHER', 'KEY_MISMATCH'],
      ['错 branch（请求 branch 与 row 不符）', { publication: pub, payloadFingerprint: realFp }, 'branch_OTHER', 'pub-real', 'KEY_MISMATCH'],
    ];
    for (const [label, rowValue, reqBranch, reqPubId, expectedCode] of cases) {
      const result = await getWithRow(rowValue, reqBranch, reqPubId);
      assert(result.ok === false, '场景1-' + label + ' 必须稳定失败，实际 ' + JSON.stringify(result));
      assert(result.code === expectedCode, '场景1-' + label + ' 必须返回 ' + expectedCode + '，实际 ' + result.code);
    }
    recordRejected('P0-3-publication typed get 负例', '缺包装/缺指纹/不一致/错 owner 全部稳定 typed 失败', 'typed 失败');
  }

  // ══ 场景 2：不存在 -> MISSING；合法行 -> 成功（对照）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 空 store：MISSING。
    const shimA = createIdbShim(backend);
    const adapterA = new adapterMod.ProjectionDurableAdapter(shimA);
    const missing = await adapterMod.durableGetPublication(adapterA, 'branch_P', 'nope');
    assert(missing.ok === false && missing.code === 'MISSING', '场景2-不存在必须 MISSING');
    // 合法行。
    const pub = publication('branch_P', 'pub-real');
    const realFp = await idMod.sha256Fingerprint(pub);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ publication: pub, payloadFingerprint: realFp }, 'projection:publication:branch_P:pub-real');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const ok = await adapterMod.durableGetPublication(adapter2, 'branch_P', 'pub-real');
    assert(ok.ok === true && ok.value.publicationId === 'pub-real', '场景2-合法行必须成功返回正确 publication');
    recordPositive('P0-3-publication typed get 对照', 'MISSING + 合法行成功');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.6-publication-typed-get regression passed.');
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
    console.error('story-runtime-g1.3.2.6-publication-typed-get regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
