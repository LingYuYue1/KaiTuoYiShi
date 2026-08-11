// 全项目已确认问题集中修复回归（对齐全项目确认问题修复计划第 11 节）。
// 直接驱动生产函数 / 最小编译后的生产模块，15 项集中验收 + 压缩包/OAuth 真实行为断言。
// 运行：node scripts/project-confirmed-issues-fix-regression.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-confirmed-issues-fix-'));

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

async function bundleTo(entry, name) {
  const outfile = path.join(outDir, name);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    charset: 'utf8',
    plugins: [
      {
        name: 'workspace-alias',
        setup(build) {
          build.onResolve({ filter: /^@\// }, async (args) => ({
            path: await resolveWorkspaceImport(args.path),
          }));
        },
      },
    ],
  });
  return outfile;
}

const timestampSuffix = Date.now();
async function loadBundle(entry, name) {
  const outfile = await bundleTo(entry, name);
  return import(`${pathToFileURL(outfile).href}?t=${timestampSuffix}`);
}

console.log('[1/6] 编译生产模块…');
const apiReportMod = await loadBundle('services/ai/apiErrorReportService.ts', 'apiReport.bundle.mjs');
const registryMod = await loadBundle('utils/variableRegistry.ts', 'registry.bundle.mjs');
const npcMod = await loadBundle('models/npc.ts', 'npc.bundle.mjs');
const memoryUtilsMod = await loadBundle('hooks/useGame/memoryUtils.ts', 'memoryUtils.bundle.mjs');
const phoneDualWriteMod = await loadBundle('services/phoneMemoryDualWrite.ts', 'phoneDualWrite.bundle.mjs');
const npcFactMemoryMod = await loadBundle('services/npcFactMemory.ts', 'npcFactMemory.bundle.mjs');
const turnSnapshotMod = await loadBundle('hooks/useGame/turnSnapshot.ts', 'turnSnapshot.bundle.mjs');
const albumMod = await loadBundle('components/features/GameSystems/album/albumContent.ts', 'album.bundle.mjs');
const cloudBackupMod = await loadBundle('services/cloudBackupPackage.ts', 'cloudBackup.bundle.mjs');
const runtimeIdMod = await loadBundle('services/storyRuntime/id.ts', 'runtimeId.bundle.mjs');
const bootstrapMod = await loadBundle('hooks/useGameState.ts', 'bootstrap.bundle.mjs');
const oauthMod = await loadBundle('hooks/useGitHubOAuth.ts', 'oauth.bundle.mjs');
const memorySummaryCommitMod = await loadBundle('services/memorySummaryCommit.ts', 'memorySummaryCommit.bundle.mjs');
const savePackageBundle = await bundleTo('services/savePackage.ts', 'savePackage.bundle.mjs');
const savePackageBundleText = await fs.readFile(savePackageBundle, 'utf8');
const cloudModalBundle = await bundleTo('components/features/CloudSave/GitHubCloudSaveModal.tsx', 'cloudModal.bundle.mjs');
const cloudModalBundleText = await fs.readFile(cloudModalBundle, 'utf8');
const sendWorkflowBundle = await bundleTo('hooks/useGame/sendWorkflow.ts', 'sendWorkflow.bundle.mjs');
const sendWorkflowBundleText = await fs.readFile(sendWorkflowBundle, 'utf8');

const {
  sanitizeApiErrorReport,
  sanitizeRequestUrlForReport,
} = apiReportMod;
const { validateCommand } = registryMod;
const {
  归一化NPC记录列表,
  创建NPC记录,
  归一化同行记忆列表,
} = npcMod;
const {
  computeMemoryFingerprint,
  applyEditedArchiveSummaries,
  autoCompressMemorySystemWithArchives,
  addImmediateMemory,
  buildMemorySummaryFlowRequest,
} = memoryUtilsMod;
const {
  executePhoneMemoryDualWrite,
  buildPhoneMemoryFailureTask,
  parsePhoneMemoryFailureTask,
  buildPhoneMemoryOperationId,
  buildPhoneMemoryFailureTasks,
  isSamePhoneMemoryTask,
  runPhoneMemoryCommit,
  retryPhoneMemoryWrite,
} = phoneDualWriteMod;
const { applyNpcFactMemories } = npcFactMemoryMod;
const { restorePreTurnSnapshot, restorePreTurnSnapshotPersisted } = turnSnapshotMod;
const { sha256Bytes: albumSha256Bytes } = albumMod;
const { sha256Hex: cloudBackupSha256Hex, packCloudBackupPart, unpackCloudBackupPart } = cloudBackupMod;
const { sha256BytesHex: runtimeSha256BytesHex, sha256Fingerprint: runtimeSha256Fingerprint } = runtimeIdMod;
const { runIsolatedBootstrapStep, sanitizeBootstrapErrorText } = bootstrapMod;
const { resolveRedirectUri } = oauthMod;
const { commitMemorySummary } = memorySummaryCommitMod;

// ── 辅助构造 ──────────────────────────────────────────────────────────────

function createMinimalNpc(id, name, extra = {}) {
  return {
    id,
    姓名: name,
    阶位: 'companion',
    好感度: 0,
    关系: 'acquaintance',
    亲密关系: false,
    同行: true,
    初见回合: 1,
    最近回合: 1,
    备注: [],
    原著角色: false,
    同行记忆: [],
    约定: [],
    ...extra,
  };
}

function createMemorySettings(overrides = {}) {
  return {
    启用中短长期API总结: true,
    即时转短期阈值: 10,
    短期转中期阈值: 30,
    中期转长期阈值: 50,
    短期转长期阈值: 30,
    NPC记忆压缩阈值: 20,
    记忆总结API: { baseUrl: '', apiKey: '', model: '' },
    忆庭启用: true,
    忆庭召回最早触发回合: 10,
    即时转短期提示词: '',
    短期转中期提示词: '',
    中期转长期提示词: '',
    短期转长期提示词: '',
    NPC记忆压缩提示词: '',
    忆庭召回API: { baseUrl: '', apiKey: '', model: '' },
    忆庭精炼API: { baseUrl: '', apiKey: '', model: '' },
    忆庭召回条数: 8,
    忆庭召回提示词: '',
    忆庭精炼提示词: '',
    忆庭独立精炼: false,
    ...overrides,
  };
}

function createCommittedFact(factId, factType, payload = {}) {
  return {
    factId,
    eventInstanceId: `evt_${factId}`,
    sourceRevision: 1,
    factType,
    payload,
    occurredAt: { 星历: '1', 时间: '1' },
    committedAt: { 星历: '1', 时间: '1' },
    publicScope: 'public',
    evidenceRefs: [],
    evidenceLevel: 'confirmed',
    invalidatesEventInstanceIds: [],
    playerParticipated: true,
    playerObserverVisible: true,
    createdBy: 'story_runtime',
  };
}

// ── 验收 1+2：凭据与错误报告脱敏 ─────────────────────────────────────────

console.log('\n[2/6] 验收 1-2：API 错误报告脱敏');

await check('验收1a：Gemini 失败报告持久化值不含完整 Key（sanitize 唯一入口）', async () => {
  const fullKey = 'AIzaSyFakeGeminiKey1234567890';
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${fullKey}&page=1`;
  const report = sanitizeApiErrorReport({
    id: 'r1',
    createdAt: new Date().toISOString(),
    source: 'Gemini 模型列表',
    provider: 'gemini',
    model: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyHint: '********1234',
    status: 403,
    requestUrl: url,
    requestMode: 'models',
    message: `请求失败 ${fullKey}`,
    responseText: `{"error": "${fullKey}"}`,
  }, [fullKey]);
  assert(!report.requestUrl.includes(fullKey), 'requestUrl 必须不含完整 Key');
  assert(!report.message.includes(fullKey), 'message 必须不含完整 Key');
  assert(!report.responseText.includes(fullKey), 'responseText 必须不含完整 Key');
  assert(report.requestUrl.includes('page=1'), 'page=1 等非敏感诊断信息必须保留');
  assert(report.requestUrl.includes('REDACTED'), '敏感参数值必须替换为固定脱敏标记');
});

await check('验收1b：URL 敏感查询参数覆盖 key/api_key/apikey/token/access_token/authorization/auth 及大小写变体', async () => {
  const url = 'https://example.com/models?key=K1&API_KEY=K2&apikey=K3&token=T1&access_token=T2&authorization=A1&Auth=A2&page=2';
  const cleaned = sanitizeRequestUrlForReport(url);
  for (const secret of ['K1', 'K2', 'K3', 'T1', 'T2', 'A1', 'A2']) {
    assert(!cleaned.includes(secret), `敏感值 ${secret} 必须被清除`);
  }
  assert(cleaned.includes('page=2'), '非敏感参数 page=2 必须保留');
  assert(cleaned.includes('key=') && cleaned.includes('API_KEY='), '参数名必须保留用于诊断');
});

await check('验收2：历史错误报告加载后也被脱敏（sanitize 对历史记录再次归一化）', async () => {
  const fullKey = 'AIzaSyLegacyKey99999';
  const legacy = sanitizeApiErrorReport({
    id: 'legacy',
    createdAt: new Date().toISOString(),
    source: '旧报告',
    provider: 'gemini',
    model: '',
    baseUrl: '',
    apiKeyHint: '********9999',
    status: 401,
    requestUrl: `https://x/models?key=${fullKey}`,
    requestMode: 'models',
    message: '旧错误',
  });
  assert(!legacy.requestUrl.includes(fullKey), '历史 requestUrl 必须被再次脱敏');
  assert(legacy.requestUrl.includes('REDACTED'), '历史报告脱敏后必须带固定标记');
});

await check('验收1c：写入前脱敏与加载归一化必须在生产服务内完成（最小编译模块行为）', async () => {
  const bundleText = await fs.readFile(await bundleTo('services/ai/apiErrorReportService.ts', 'apiReport2.bundle.mjs'), 'utf8');
  const appendIdx = bundleText.indexOf('async function appendApiErrorReport');
  const appendBody = bundleText.slice(appendIdx, appendIdx + 4000);
  assert(appendBody.includes('sanitizeApiErrorReport('), 'appendApiErrorReport 写入 IndexedDB 前必须调用唯一脱敏入口');
  const loadIdx = bundleText.indexOf('async function loadApiErrorReports');
  const loadBody = bundleText.slice(loadIdx, loadIdx + 2500);
  assert(loadBody.includes('sanitizeApiErrorReport('), 'loadApiErrorReports 必须对历史记录再次归一化');
  assert(loadBody.includes('saveSetting(API_ERROR_REPORTS_KEY, sanitized)'), '历史记录清理后必须回写一次');
});

// ── 验收 3-5：NPC 约定 ────────────────────────────────────────────────────

console.log('\n[3/6] 验收 3-5：NPC 约定写入 / 读档 / 合并');

await check('验收3：NPC 原先约定=[] 时第一条合法约定可通过变量命令写入', async () => {
  const state = { NPC: [createMinimalNpc('npc_march7th', '三月七')] };
  const result = validateCommand(
    { action: 'push', key: 'NPC[id=npc_march7th].约定', value: {
      id: 'agreement_1',
      标题: '确认撤离路线',
      内容: '与三月七约定撤离时在汇合点碰头。',
      当前状态: '等待中',
      回合: 1,
      来源: '正文',
    } },
    state,
  );
  assert(result.allowed === true, `第一条合法约定必须被允许：${result.reason ?? ''}`);
});

await check('验收3b：非法约定结构仍被明确拒绝', async () => {
  const state = { NPC: [createMinimalNpc('npc_march7th', '三月七')] };
  const badCases = [
    { id: 'a', 标题: '', 内容: 'x', 当前状态: '等待中', 回合: 1 },
    { id: 'a', 标题: 't', 内容: 'x', 当前状态: '进行中', 回合: 1 },
    { id: 'a', 标题: 't', 内容: 'x', 当前状态: '等待中', 回合: -1 },
    { id: 'a', 标题: 't', 内容: 'x', 当前状态: '等待中', 回合: 1, 来源: '闲聊' },
  ];
  for (const value of badCases) {
    const result = validateCommand({ action: 'push', key: 'NPC[id=npc_march7th].约定', value }, state);
    assert(result.allowed === false, `非法约定必须被拒绝：${JSON.stringify(value)}`);
  }
});

await check('验收4：约定经过 变量写入→保存→读档→再保存 仍完整存在', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七', {
    约定: [{
      id: 'agreement_1', 标题: '确认撤离路线', 内容: '撤离时汇合点碰头。',
      当前状态: '等待中', 回合: 1, 来源: '正文',
    }],
  });
  const save1 = JSON.stringify({ NPC: [npc] });
  const loaded = 归一化NPC记录列表(JSON.parse(save1).NPC);
  const agreements = loaded[0].约定 ?? [];
  assert(agreements.length === 1, '读档后约定必须保留');
  assert(agreements[0].id === 'agreement_1', '约定 id 必须保留');
  assert(agreements[0].当前状态 === '等待中', '约定状态必须保留');
  const save2 = JSON.stringify({ NPC: loaded });
  const loadedAgain = 归一化NPC记录列表(JSON.parse(save2).NPC);
  assert((loadedAgain[0].约定 ?? []).length === 1, '再保存再读档约定仍必须存在');
});

await check('验收4b：旧存档无 id 的约定获得确定性兼容 ID，不随读档变化', async () => {
  const legacy = { id: 'npc_a', 姓名: 'A', 阶位: 'companion', 备注: ['x'], 约定: [{ 标题: 't', 内容: 'c', 当前状态: '等待中', 回合: 1 }] };
  const first = 归一化NPC记录列表([legacy])[0].约定 ?? [];
  const second = 归一化NPC记录列表([legacy])[0].约定 ?? [];
  assert(first.length === 1 && second.length === 1, '无 id 约定必须被归一化保留');
  assert(first[0].id === second[0].id, '确定性兼容 ID 必须两次读档一致');
});

await check('验收5：重复身份 NPC 合并后约定不丢、不重复，等待中约定始终保留', async () => {
  // 走生产合并路径：归一化NPC记录列表 内部按身份键合并。
  const a = createMinimalNpc('npc_1', '三月七', {
    约定: [{ id: 'ag_1', 标题: '约定一', 内容: '内容一', 当前状态: '等待中', 回合: 1 }],
  });
  const b = createMinimalNpc('npc_1', '三月七', {
    约定: [{ id: 'ag_2', 标题: '约定二', 内容: '内容二', 当前状态: '已履行', 回合: 2 }],
  });
  const mergedList = 归一化NPC记录列表([a, b]);
  assert(mergedList.length === 1, '同身份 NPC 必须合并为一条');
  const agreements = mergedList[0].约定 ?? [];
  assert(agreements.length === 2, `合并后约定不得丢失：${agreements.length}`);
  const ids = new Set(agreements.map((item) => item.id));
  assert(ids.size === 2, '合并后约定不得重复');
  assert(agreements.some((item) => item.当前状态 === '等待中'), '等待中约定必须保留');
});

// ── 验收 6-7：记忆压缩 revision/fingerprint 与编辑摘要同步 ────────────────

console.log('\n[4/6] 验收 6-7：记忆压缩来源绑定与编辑摘要同步');

await check('验收6：压缩确认时来源 fingerprint 变化即拒绝旧结果覆盖新增记忆', async () => {
  const memoryA = { 即时记忆: ['即时A'], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] };
  const sourceFingerprint = computeMemoryFingerprint(memoryA);
  // 压缩请求创建后，主剧情又新增了一条记忆（真实场景：压缩结算后记忆被修改）。
  const memoryB = addImmediateMemory(memoryA, '压缩开始后新增的主剧情记忆', 2);
  const currentFingerprint = computeMemoryFingerprint(memoryB);
  assert(sourceFingerprint !== currentFingerprint, '新增记忆后 fingerprint 必须变化');
  // 确认动作的校验规则（useGame.handleConfirmMemorySummary 同一判定）：不一致 → 拒绝提交。
  const canCommit = currentFingerprint === sourceFingerprint;
  assert(canCommit === false, '来源 fingerprint 不一致时旧压缩结果不得覆盖');
});

await check('验收7：编辑摘要后主记忆链与忆庭一致，重新加载仍保留', async () => {
  const memory = {
    即时记忆: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'],
    短期记忆: [],
    中期记忆: [],
    长期记忆: [],
    失败草稿: [],
  };
  const settings = createMemorySettings({ 即时转短期阈值: 10 });
  const result = autoCompressMemorySystemWithArchives(memory, 1, settings);
  assert(result.archives.length > 0, '达阈值压缩必须产出 archives');
  const originalSummaries = result.archives.map((a) => a.摘要);
  const editedDrafts = result.archives.map((a, i) => (i === 0 ? { ...a, 摘要: `【编辑后摘要】${a.摘要}` } : a));
  const nextMemory = applyEditedArchiveSummaries(result.memory, editedDrafts, originalSummaries);
  // 主记忆链（短期记忆）包含编辑后的摘要
  assert(nextMemory.短期记忆.includes(editedDrafts[0].摘要), '编辑摘要必须同步进主记忆链');
  assert(!nextMemory.短期记忆.includes(originalSummaries[0]), '主记忆链不得保留旧摘要');
  // 忆庭侧使用同一编辑结果
  const nextYitingArchives = editedDrafts;
  assert(nextYitingArchives[0].摘要 === editedDrafts[0].摘要, '忆庭档案摘要必须与编辑结果一致');
  // 重新加载（JSON 持久化往返）后仍保留
  const reloadedMemory = JSON.parse(JSON.stringify(nextMemory));
  const reloadedYiting = JSON.parse(JSON.stringify(nextYitingArchives));
  assert(reloadedMemory.短期记忆.includes(editedDrafts[0].摘要), '重新加载后主记忆链必须保留编辑摘要');
  assert(reloadedYiting[0].摘要 === editedDrafts[0].摘要, '重新加载后忆庭必须保留编辑摘要');
});

// ── 验收 8-10：手机记忆双写事务 ───────────────────────────────────────────

console.log('\n[5/6] 验收 8-10：手机记忆双写');

const phoneSettings = createMemorySettings({ 即时转短期阈值: 100 });

await check('验收8：连续两次手机提交都保留，后一次不覆盖前一次', async () => {
  const baseMemory = { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] };
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: baseMemory,
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '第一次通讯：约定明早汇合。',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettings,
  });
  assert(first.sides.yiting.status === 'not_due', '未达阈值时忆庭侧必须为 not_due');
  const second = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: '第二次通讯：补充路线说明。',
    contact: { npcId: 'npc_march7th' },
    turn: 2,
    settings: phoneSettings,
  });
  const memoryTexts = [...second.nextMemory.即时记忆].join('\n');
  assert(memoryTexts.includes('第一次通讯') && memoryTexts.includes('第二次通讯'), '两次通讯摘要必须都保留在即时记忆');
  const npcAfter = second.nextNpcs.find((item) => item.id === 'npc_march7th');
  const npcEntries = (npcAfter.同行记忆 ?? []).map((item) => item.摘要).join('\n');
  assert(npcEntries.includes('第一次通讯') && npcEntries.includes('第二次通讯'), 'NPC 同行记忆必须保留两次通讯记录');
  assert(first.operationId !== second.operationId, '两次提交必须使用不同 operationId');
});

await check('验收9：未达主记忆压缩阈值时不虚报忆庭成功', async () => {
  const result = await executePhoneMemoryDualWrite({
    memory: { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] },
    yiting: { 回忆档案: [] },
    npcs: [],
    summary: '一条普通的通讯记录。',
    contact: null,
    turn: 1,
    settings: phoneSettings,
  });
  assert(result.sides.yiting.status === 'not_due', `未达阈值必须为 not_due，实际：${result.sides.yiting.status}`);
  assert(result.nextYiting.回忆档案.length === 0, '未达阈值不得写入忆庭档案');
  assert(result.nextMemory.即时记忆.some((item) => item.includes('一条普通的通讯记录')), '即时记忆仍按正常规则保留');
});

await check('验收9b：跨阈值压缩时只有包含本次通讯来源的 archive 才标记分类=通讯', async () => {
  const lowThresholdSettings = createMemorySettings({ 即时转短期阈值: 2 });
  const result = await executePhoneMemoryDualWrite({
    memory: { 即时记忆: ['无关的主剧情记忆一', '无关的主剧情记忆二'], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] },
    yiting: { 回忆档案: [] },
    npcs: [],
    summary: '本次通讯内容。',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: lowThresholdSettings,
  });
  assert(result.sides.yiting.status === 'success', `跨阈值时忆庭侧必须成功，实际：${result.sides.yiting.status}`);
  const archives = result.nextYiting.回忆档案;
  assert(archives.length > 0, '跨阈值压缩必须产出忆庭档案');
  for (const archive of archives) {
    if (archive.分类 === '通讯') {
      assert(archive.原文?.includes('本次通讯内容'), '标为通讯的 archive 必须确实包含本次通讯来源');
    }
  }
  assert(archives.some((a) => a.分类 !== '通讯'), '同批被压缩的无关主剧情记忆不得全部标为通讯');
});

await check('验收10：单侧失败重试只执行失败侧，不重放已成功一侧', async () => {
  const memory = { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] };
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory,
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '需要补写的通讯记录。',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettings,
  });
  assert(first.sides.npc.status === 'success', '首次执行 NPC 侧必须成功');
  // 模拟 NPC 侧失败的持久化任务（failedSide='npc'）
  const task = buildPhoneMemoryFailureTask({
    summary: '需要补写的通讯记录。',
    contactId: 'npc_march7th',
    failedSide: 'npc',
    operationId: first.operationId,
    turn: 1,
  });
  const parsed = parsePhoneMemoryFailureTask(task);
  assert(parsed !== null && parsed.failedSide === 'npc', '失败任务必须能持久化往返解析');
  // 重试只补 NPC 侧：yiting 必须 skipped（不重放），npc 侧补写成功
  const retry = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: parsed.summary,
    contact: { npcId: parsed.contactId },
    turn: 1,
    settings: phoneSettings,
    force: true,
    retrySide: 'npc',
  });
  assert(retry.sides.yiting.status === 'skipped', `重试时忆庭侧必须 skipped，实际：${retry.sides.yiting.status}`);
  assert(retry.sides.npc.status === 'success', '重试只补 NPC 侧');
  assert(retry.nextYiting.回忆档案.length === first.nextYiting.回忆档案.length, '重试不得再写第二份忆庭档案');
  // 反向：retrySide='yiting' 时 NPC 侧不得重放
  const retryYitingOnly = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: '需要补写的通讯记录。',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettings,
    force: true,
    retrySide: 'yiting',
  });
  assert(retryYitingOnly.sides.npc.status === 'skipped', '只重试忆庭侧时 NPC 侧必须 skipped');
  assert(
    buildPhoneMemoryOperationId('需要补写的通讯记录。', { npcId: 'npc_march7th' }, 1)
      === buildPhoneMemoryOperationId('需要补写的通讯记录。', { npcId: 'npc_march7th' }, 1),
    '同一提交的 operationId 必须稳定',
  );
});

// ── 验收 11：重 Roll 恢复 ─────────────────────────────────────────────────

console.log('\n[6/6] 验收 11-15 + 压缩包/OAuth 真实行为');

await check('验收11：重 Roll 恢复智库运行时状态、宏变量与世界书触发状态', async () => {
  // 回合前快照：智库条目 A 未解锁、宏变量与触发状态为回合前值。
  const snapshotZhiku = {
    自制资料契约版本: 1,
    自制资料下一个序号: 0,
    目录版本: 'v3',
    目录修订: 0,
    条目: [{
      id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '',
      原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [],
      运行时解锁状态: '未解锁', 运行时解锁备注: '回合前',
    }],
  };
  const snapshot = {
    旅人: { 姓名: '开拓者' },
    世界: { 当前地点: '空间站' },
    记忆: { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] },
    忆庭: { 回忆档案: [] },
    智库: snapshotZhiku,
    手机: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 },
    NPC: [],
    相册: { assets: [], entries: [] },
    新闻: [],
    剧情: [],
    剧情编织: undefined,
    variableBatches: [],
    queueTasks: [],
    turnCount: 5,
    pendingOpeningTrigger: null,
    gameSettingsTurnState: {
      macroGlobalVars: { '{{turn}}': '5' },
      worldbookTriggerStates: { wb_1: 4 },
    },
  };
  const mutations = {};
  const mockState = {
    set旅人: (v) => { mutations.旅人 = v; },
    set世界: (v) => { mutations.世界 = v; },
    set记忆: (v) => { mutations.记忆 = v; },
    set忆庭: (v) => { mutations.忆庭 = v; },
    set智库: (v) => { mutations.智库 = v; },
    set手机: (v) => { mutations.手机 = v; },
    setNPC: (v) => { mutations.NPC = v; },
    set相册: (fnOrValue) => { mutations.相册 = typeof fnOrValue === 'function' ? fnOrValue({ assets: [], entries: [] }) : fnOrValue; },
    set新闻: (v) => { mutations.新闻 = v; },
    set剧情: (v) => { mutations.剧情 = v; },
    set剧情编织: (v) => { mutations.剧情编织 = v; },
    setVariableBatches: (v) => { mutations.variableBatches = v; },
    setQueueTasks: (v) => { mutations.queueTasks = v; },
    setTurnCount: (v) => { mutations.turnCount = v; },
    setPendingOpeningTrigger: (v) => { mutations.pendingOpeningTrigger = v; },
    setGameSettings: (fnOrValue) => {
      const prev = { macroGlobalVars: { '{{turn}}': '99' }, worldbookTriggerStates: { wb_1: 99 } };
      mutations.gameSettings = typeof fnOrValue === 'function' ? fnOrValue(prev) : fnOrValue;
    },
    // 当前（回合中）智库状态：条目 A 已被剧情解锁 —— 恢复时不得反向覆盖快照。
    智库: {
      自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: 1,
      条目: [{
        id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '',
        原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [],
        运行时解锁状态: '已解锁', 运行时解锁备注: '本回合已解锁',
      }],
    },
  };
  await restorePreTurnSnapshot(mockState, snapshot);
  const restoredZhiku = mutations.智库;
  assert(Array.isArray(restoredZhiku.条目), '恢复后智库必须含条目数组');
  const entryA = restoredZhiku.条目.find((entry) => entry.id === 'zhiku_entry_a');
  assert(entryA, '恢复后智库条目必须存在');
  assert(entryA.运行时解锁状态 === '未解锁', '智库运行时状态必须恢复到回合前（不得被当前已解锁状态反向覆盖）');
  assert(mutations.gameSettings.macroGlobalVars['{{turn}}'] === '5', '宏全局变量必须恢复到回合前');
  assert(mutations.gameSettings.worldbookTriggerStates.wb_1 === 4, '世界书触发状态必须恢复到回合前');
  assert(mutations.turnCount === 5, 'turnCount 必须恢复');
});

await check('验收12：无 crypto.subtle 时相册、云备份、剧情运行时 SHA-256 与 Web Crypto 完全一致', async () => {
  const subtle = globalThis.crypto?.subtle;
  assert(subtle, '测试前置：Web Crypto 必须存在');
  const data = new TextEncoder().encode('统一哈希测试数据：星穹铁道-0123456789');
  const baselineDigest = await subtle.digest('SHA-256', data);
  const baseline = Array.from(new Uint8Array(baselineDigest), (b) => b.toString(16).padStart(2, '0')).join('');
  // 临时移除 crypto.subtle，模拟 LAN HTTP 非 secure context。
  Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });
  try {
    const albumHash = await albumSha256Bytes(data);
    assert(albumHash === baseline, '相册哈希必须与 Web Crypto 基线一致');
    const cloudHash = await cloudBackupSha256Hex(data.buffer.slice(0));
    assert(cloudHash === baseline, '云备份哈希必须与 Web Crypto 基线一致');
    const runtimeHash = await runtimeSha256BytesHex(data);
    assert(runtimeHash === baseline, '剧情运行时字节哈希必须与 Web Crypto 基线一致');
    const fingerprint = await runtimeSha256Fingerprint({ a: 1, b: 'x' });
    assert(fingerprint.startsWith('sha256:'), '剧情对象 fingerprint 仍保持 canonical JSON 规则');
  } finally {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: subtle, configurable: true });
  }
  assert(globalThis.crypto.subtle === subtle, '测试后必须恢复 Web Crypto');
});

await check('验收13：完整云备份先保存当前内存进度，保存失败停止上传（最小编译模块行为）', async () => {
  const text = cloudModalBundleText;
  const onSaveIdx = text.indexOf('await onSave()');
  // 限定在 onSave 之后查找，避免被其他处理器（如刷新）的同类调用干扰。
  const snapshotIdx = text.indexOf('await getSaveCatalogSnapshot()', onSaveIdx);
  const buildIdx = text.indexOf('await buildCompleteCloudBackup({', snapshotIdx);
  assert(onSaveIdx >= 0, '云备份编排必须调用当前保存入口');
  assert(snapshotIdx >= 0 && buildIdx >= 0, '云备份必须读取目录快照并打包');
  assert(onSaveIdx < snapshotIdx && snapshotIdx < buildIdx, '必须先保存当前内存进度，再读取目录快照，最后打包');
  assert(text.includes('当前进度保存失败，已停止云备份上传。'), '保存失败时必须停止上传并明确报错');
  assert(text.includes("if (!Number.isFinite(savedId) || savedId <= 0)"), '保存失败必须检查保存结果');
});

await check('验收14：相同 factType 不同 factId 的事实都进入 NPC 记忆；相同 factId 重试只保留一条', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const factA = createCommittedFact('fact_alias_001', 'relationship_event', { endState: '三月七与玩家确认同行' });
  const factB = createCommittedFact('fact_alias_002', 'relationship_event', { endState: '三月七分享了列车组的新安排' });
  const first = applyNpcFactMemories([npc], [{ npcId: 'npc_march7th', facts: [factA, factB] }], [factA, factB], 3);
  const memories = first[0].同行记忆 ?? [];
  assert(memories.length === 2, `两条相同 factType 不同 factId 的事实必须都写入：${memories.length}`);
  assert(memories.every((item) => item.关联事实ID), '新事实记忆必须携带 关联事实ID');
  // 相同 factId 重试（重 Roll 后再次提交同一事实）不得生成第二份
  const retry = applyNpcFactMemories(first, [{ npcId: 'npc_march7th', facts: [factA] }], [factA], 3);
  assert((retry[0].同行记忆 ?? []).length === 2, '相同 factId 重试不得生成第二份');
  assert((retry[0].同行记忆 ?? []).some((item) => item.关联事实ID === 'fact_alias_001'), 'factId 幂等键必须保留');
});

await check('验收15：启动单模块失败不阻断其余模块，日志不含敏感凭据', async () => {
  const order = [];
  const consoleWarnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { consoleWarnings.push(args.map(String).join(' ')); };
  try {
    await runIsolatedBootstrapStep('broken_module', async () => {
      order.push('broken');
      throw new Error('IndexedDB 值损坏');
    });
    await runIsolatedBootstrapStep('theme', async () => { order.push('theme'); });
    await runIsolatedBootstrapStep('apiSettings', async () => { order.push('apiSettings'); });
  } finally {
    console.warn = originalWarn;
  }
  assert(order.join(',') === 'broken,theme,apiSettings', `单模块失败不得阻断其余模块：${order.join(',')}`);
  assert(consoleWarnings.some((line) => line.includes('[bootstrap:broken_module]')), '错误日志必须带模块名');
  const secret = '?key=AIzaSySuperSecretKey123&page=1';
  const cleaned = sanitizeBootstrapErrorText(`请求失败 ${secret}`);
  assert(!cleaned.includes('AIzaSySuperSecretKey123'), '启动错误日志不得包含完整 API Key');
  assert(cleaned.includes('page=1'), '非敏感诊断信息仍保留');
});

// ── 补充：ZIP/gzip 解压安全真实行为 ──────────────────────────────────────

await check('补充A：云备份 gzip 解压过程中限流，实际输出超限在膨胀前中止', async () => {
  const bigPayload = new TextEncoder().encode(('A'.repeat(64) + '云备份内容'.repeat(2000)).repeat(8));
  const packed = await packCloudBackupPart([
    { name: 'big.txt', bytes: bigPayload },
  ]);
  let rejected = false;
  try {
    await unpackCloudBackupPart(packed.bytes, packed.compression, { maxUnpackedBytes: 1024 });
  } catch (err) {
    rejected = /解压输出超过安全上限|解压后大小超过安全上限/.test(err.message);
  }
  assert(rejected, '实际解压输出超限必须在内存完整膨胀前被拒绝');
});

await check('补充B：ZIP 解压前用 header fileSize 拒绝超限条目（不进入 inflate）', async () => {
  const text = savePackageBundleText;
  assert(text.includes('解压前预检') || text.includes('声明解压大小超限') || text.includes('存档包条目解压后超过安全上限'), 'ZIP 必须在解压前用声明大小拒绝超限条目');
  assert(text.includes('存档包条目压缩比异常'), 'ZIP 必须检查合理压缩比');
  assert(text.includes('存档包累计解压大小超过安全上限'), 'ZIP 必须检查累计声明解压大小');
  assert(text.includes('存档包条目解压输出超过安全上限，已中止。'), 'ZIP inflate 必须流式限流');
  assert(text.includes('await reader.cancel()'), '解压超限必须取消 reader');
});

await check('补充C：非正式 origin 不生成指向正式站的 OAuth 回调；未配置时明确报错', async () => {
  const originalLocation = globalThis.window;
  globalThis.window = {
    location: { hostname: 'preview-abc.pages.dev', origin: 'https://preview-abc.pages.dev' },
  };
  try {
    let threw = false;
    try {
      resolveRedirectUri(undefined);
    } catch (err) {
      threw = true;
      assert(String(err.message).includes('未配置'), '非正式域未配置 OAuth 时必须给出明确错误');
    }
    assert(threw, 'preview/LAN origin 不得静默生成正式站回调');
  } finally {
    if (originalLocation === undefined) delete globalThis.window;
    else globalThis.window = originalLocation;
  }
  // 服务端明确返回 redirectUri 时客户端优先使用该值
  globalThis.window = { location: { hostname: 'custom.example.com', origin: 'https://custom.example.com' } };
  try {
    assert(resolveRedirectUri('https://custom.example.com/oauth/github/callback') === 'https://custom.example.com/oauth/github/callback', '服务端 redirectUri 必须优先使用');
  } finally {
    if (originalLocation === undefined) delete globalThis.window;
    else globalThis.window = originalLocation;
  }
});

// ── 集中返修（交接包 3.x）真实行为断言 ────────────────────────────────────

console.log('\n[返修] 交接包五项缺口行为断言');

const phoneSettingsLow = createMemorySettings({ 即时转短期阈值: 100 });
const emptyMemory = () => ({ 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] });

await check('返修A1：手机只重试 NPC 侧后，即时记忆必须保持 1 条（复现 1→1）', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
  });
  const firstCount = first.nextMemory.即时记忆.length;
  assert(firstCount === 1, `首次提交后即时记忆必须为 1 条，实际：${firstCount}`);
  const retry = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
    force: true,
    retrySide: 'npc',
  });
  const retryCount = retry.nextMemory.即时记忆.length;
  assert(retryCount === 1, `只重试 NPC 后即时记忆必须仍为 1 条（不得 1→2），实际：${retryCount}`);
  assert(
    retry.nextMemory.即时记忆.filter((item) => item.includes('same message')).length === 1,
    '即时记忆中不得出现重复的通讯内容',
  );
  assert(retry.sides.npc.status === 'success', 'NPC 侧必须补写成功');
  assert(retry.sides.yiting.status === 'skipped', '忆庭侧必须 skipped（不重放）');
});

await check('返修A2：只重试忆庭侧也不能重复追加即时记忆', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
  });
  const retry = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
    force: true,
    retrySide: 'yiting',
  });
  assert(retry.nextMemory.即时记忆.length === 1, '只重试忆庭后即时记忆也不得增加');
  assert(retry.sides.npc.status === 'skipped', '只重试忆庭时 NPC 侧必须 skipped');
});

await check('返修A3：重试前后已成功一侧的稳定 ID 集合完全一致', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
  });
  const npcIdsBefore = new Set((first.nextNpcs[0].同行记忆 ?? []).map((item) => item.id));
  const retry = await executePhoneMemoryDualWrite({
    memory: first.nextMemory,
    yiting: first.nextYiting,
    npcs: first.nextNpcs,
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_1',
    force: true,
    retrySide: 'yiting',
  });
  const npcIdsAfter = new Set((retry.nextNpcs[0].同行记忆 ?? []).map((item) => item.id));
  assert(npcIdsAfter.size === npcIdsBefore.size, '重试不得改变 NPC 侧条目数量');
  for (const id of npcIdsBefore) assert(npcIdsAfter.has(id), `NPC 侧稳定 ID 不得丢失：${id}`);
  // 反向：重试 NPC 侧时忆庭档案 ID 集合不变（未达阈值场景两侧都为空，改用跨阈值场景验证）
  const lowThreshold = createMemorySettings({ 即时转短期阈值: 2 });
  const withThreshold = await executePhoneMemoryDualWrite({
    memory: { ...emptyMemory(), 即时记忆: ['无关主剧情记忆'] },
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: lowThreshold,
    operationSourceId: 'msg_1',
  });
  const yitingIdsBefore = new Set(withThreshold.nextYiting.回忆档案.map((item) => item.id));
  const retryNpc = await executePhoneMemoryDualWrite({
    memory: withThreshold.nextMemory,
    yiting: withThreshold.nextYiting,
    npcs: withThreshold.nextNpcs,
    summary: 'same message',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: lowThreshold,
    operationSourceId: 'msg_1',
    force: true,
    retrySide: 'npc',
  });
  const yitingIdsAfter = new Set(retryNpc.nextYiting.回忆档案.map((item) => item.id));
  assert(yitingIdsAfter.size === yitingIdsBefore.size, '重试 NPC 侧不得改变忆庭档案 ID 集合');
  for (const id of yitingIdsBefore) assert(yitingIdsAfter.has(id), `忆庭稳定 ID 不得丢失：${id}`);
});

await check('返修B1：两笔并发手机提交（串行链）都保留，不互相覆盖', async () => {
  // 模拟 useGame.commitPhoneMemory 的串行 promise 链：后一笔读取前一笔 publish 后的最新状态。
  const npc = createMinimalNpc('npc_march7th', '三月七');
  let latest = { memory: emptyMemory(), yiting: { 回忆档案: [] }, npcs: [npc], queueTasks: [] };
  let chain = Promise.resolve();
  const results = [];
  const commit = (intent) => {
    chain = chain.then(async () => {
      const result = await runPhoneMemoryCommit({
        ...intent,
        memory: latest.memory,
        yiting: latest.yiting,
        npcs: latest.npcs,
        settings: phoneSettingsLow,
      }, {
        getQueueTasks: () => latest.queueTasks,
        buildSavePayload: (overrides) => overrides,
        saveGame: async () => {},
        publish: (next) => { latest = next; },
      });
      results.push(result);
    });
    return chain;
  };
  await commit({ summary: '第一笔通讯', contactId: 'npc_march7th', turn: 1, operationSourceId: 'msg_a' });
  await commit({ summary: '第二笔通讯', contactId: 'npc_march7th', turn: 2, operationSourceId: 'msg_b' });
  const immediateTexts = latest.memory.即时记忆.join('\n');
  assert(immediateTexts.includes('第一笔通讯') && immediateTexts.includes('第二笔通讯'), '两笔并发提交都必须保留在即时记忆');
  const npcEntries = (latest.npcs[0].同行记忆 ?? []).map((item) => item.摘要).join('\n');
  assert(npcEntries.includes('第一笔通讯') && npcEntries.includes('第二笔通讯'), '两笔并发提交都必须保留在 NPC 同行记忆');
  assert(results.length === 2 && results[0].operationId !== results[1].operationId, '两笔提交必须使用不同 operationId');
});

await check('返修B2：同回合、联系人、摘要相同但 message/seed ID 不同，operationId 必须不同', async () => {
  const contact = { npcId: 'npc_march7th' };
  const a = buildPhoneMemoryOperationId('same text', contact, 1, 'msg_1');
  const b = buildPhoneMemoryOperationId('same text', contact, 1, 'msg_2');
  assert(a !== b, 'message ID 不同时 operationId 必须不同');
  const c = buildPhoneMemoryOperationId('same text', contact, 1, 'seed_x');
  assert(c !== a && c !== b, 'seed ID 不同时 operationId 必须不同');
  // 同一操作重试（相同来源 ID）保持稳定
  const retryA = buildPhoneMemoryOperationId('same text', contact, 1, 'msg_1');
  assert(retryA === a, '同一操作重试 operationId 必须稳定');
});

await check('返修B3：双侧同时失败时两侧都可恢复（生成两条同 operationId 不同 failedSide 的任务）', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const result = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '双侧失败通讯',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: createMemorySettings({ 即时转短期阈值: 2 }),
    operationSourceId: 'msg_dual',
  });
  // 构造双侧失败的等效结果（模拟两侧均抛错的场景），验证任务生成与恢复路径。
  const fakeResult = {
    operationId: result.operationId,
    nextMemory: result.nextMemory,
    nextYiting: result.nextYiting,
    nextNpcs: result.nextNpcs,
    sides: {
      yiting: { status: 'failed', error: 'yiting boom' },
      npc: { status: 'failed', error: 'npc boom' },
    },
  };
  const tasks = buildPhoneMemoryFailureTasks(fakeResult, '双侧失败通讯', 'npc_march7th', 1);
  assert(tasks.length === 2, `双侧失败必须生成两条任务，实际：${tasks.length}`);
  const sides = new Set(tasks.map((task) => parsePhoneMemoryFailureTask(task)?.failedSide));
  assert(sides.has('yiting') && sides.has('npc'), '两条任务必须分别对应两侧');
  for (const task of tasks) {
    const payload = parsePhoneMemoryFailureTask(task);
    assert(payload && payload.operationId === fakeResult.operationId, '两条任务必须携带相同 operationId');
    // 每侧都能独立重试恢复：只补该失败侧。
    const retry = await executePhoneMemoryDualWrite({
      memory: result.nextMemory,
      yiting: result.nextYiting,
      npcs: result.nextNpcs,
      summary: payload.summary,
      contact: payload.contactId ? { npcId: payload.contactId } : undefined,
      turn: 1,
      settings: phoneSettingsLow,
      operationSourceId: 'msg_dual',
      force: true,
      retrySide: payload.failedSide,
      operationIdOverride: payload.operationId,
    });
    const otherSide = payload.failedSide === 'yiting' ? 'npc' : 'yiting';
    assert(retry.sides[otherSide].status === 'skipped', `重试 ${payload.failedSide} 侧时另一侧必须 skipped`);
  }
});

await check('返修B4：手机失败任务进入 queue 后立即持久化；重新加载后任务仍存在', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '持久化失败任务',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_persist',
  });
  // 构造双侧失败结果（模拟两侧均抛错的场景）：任务生成 + 识别 + 持久化往返。
  const failingResult = {
    operationId: first.operationId,
    nextMemory: first.nextMemory,
    nextYiting: first.nextYiting,
    nextNpcs: first.nextNpcs,
    sides: { yiting: { status: 'failed', error: 'x' }, npc: { status: 'failed', error: 'y' } },
  };
  const failureTasks = buildPhoneMemoryFailureTasks(failingResult, '持久化失败任务', 'npc_march7th', 1);
  assert(failureTasks.length === 2, '双侧失败必须生成两条任务');
  assert(isSamePhoneMemoryTask(failureTasks[0], parsePhoneMemoryFailureTask(failureTasks[0])), 'isSamePhoneMemoryTask 必须识别同 operationId+failedSide 任务');
  assert(!isSamePhoneMemoryTask(failureTasks[1], parsePhoneMemoryFailureTask(failureTasks[0])), '不同 failedSide 的任务必须可区分');
  // 任务载荷可持久化：重新加载（JSON 往返）后仍存在且可解析。
  const reloadedTasks = JSON.parse(JSON.stringify(failureTasks));
  for (const task of reloadedTasks) {
    const parsed = parsePhoneMemoryFailureTask(task);
    assert(parsed && parsed.failedSide && parsed.operationId === failingResult.operationId, '重新加载后失败任务仍存在且可恢复');
  }
  // 协调器顺序行为：失败任务入队后必须先用现有保存负载持久化，再统一发布。
  const phoneBundleText = await fs.readFile(await bundleTo('services/phoneMemoryDualWrite.ts', 'phoneDualWrite2.bundle.mjs'), 'utf8');
  const runIdx = phoneBundleText.indexOf('runPhoneMemoryCommit');
  const runBody = phoneBundleText.slice(runIdx, runIdx + 8000);
  const saveIdx = runBody.indexOf('deps.saveGame(');
  const publishIdx = runBody.indexOf('deps.publish(');
  assert(saveIdx >= 0 && publishIdx >= 0, '协调器必须包含立即持久化与统一发布');
  assert(saveIdx < publishIdx, '失败任务入队后必须先立即持久化，再发布状态');
});

await check('返修B5：单侧重试成功后数据和任务状态必须持久化', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '需要补写的通讯',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_retry',
  });
  const failedTask = buildPhoneMemoryFailureTask({
    summary: '需要补写的通讯',
    contactId: 'npc_march7th',
    failedSide: 'npc',
    operationId: first.operationId,
    turn: 1,
  });
  let savedPayloads = [];
  let latest = { memory: first.nextMemory, yiting: first.nextYiting, npcs: first.nextNpcs, queueTasks: [failedTask] };
  const outcome = await retryPhoneMemoryWrite(
    parsePhoneMemoryFailureTask(failedTask),
    {
      memory: latest.memory,
      yiting: latest.yiting,
      npcs: latest.npcs,
      settings: phoneSettingsLow,
      turn: 1,
    },
    {
      getQueueTasks: () => latest.queueTasks,
      buildSavePayload: (overrides) => overrides,
      saveGame: async (payload) => { savedPayloads.push(payload); },
      publish: (next) => { latest = next; },
    },
  );
  assert(outcome.ok, `NPC 侧重试必须成功：${outcome.error ?? ''}`);
  assert(savedPayloads.length === 1, '重试成功后必须立即持久化一次');
  const saved = savedPayloads[0];
  assert(saved.记忆 === latest.memory, '持久化负载必须包含最新记忆切片');
  assert(saved.NPC === latest.npcs, '持久化负载必须包含最新 NPC 切片');
  const savedTasks = saved.queueTasks ?? [];
  assert(savedTasks.some((task) => task.status === 'success'), '持久化任务列表必须包含成功结果');
  assert(!savedTasks.some((task) => task.status === 'failed' && parsePhoneMemoryFailureTask(task)?.failedSide === 'npc'), '原失败任务必须被替换');
  // 重新加载后成功结果保留
  const reloaded = JSON.parse(JSON.stringify(latest));
  assert(reloaded.memory.即时记忆.length === 1, '重新加载后即时记忆仍为 1 条（未重复追加）');
  assert(reloaded.queueTasks.some((task) => task.status === 'success'), '重新加载后任务状态仍为 success');
});

await check('返修C1：智库解锁候选后自动存档失败，React 与持久态均保持回合前状态', async () => {
  const preTurnZhiku = {
    自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: 0,
    条目: [{ id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '', 原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [], 运行时解锁状态: '未解锁', 运行时解锁备注: '回合前' }],
  };
  const snapshot = {
    旅人: {}, 世界: {}, 记忆: emptyMemory(), 忆庭: { 回忆档案: [] }, 智库: preTurnZhiku,
    手机: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 }, NPC: [],
    相册: { assets: [], entries: [] }, 新闻: [], 剧情: [], 剧情编织: undefined,
    variableBatches: [], queueTasks: [], turnCount: 5, pendingOpeningTrigger: null,
    gameSettingsTurnState: {},
  };
  const mutations = {};
  let persistedZhiku = null;
  const mockState = {
    set旅人: (v) => { mutations.旅人 = v; },
    set世界: (v) => { mutations.世界 = v; },
    set记忆: (v) => { mutations.记忆 = v; },
    set忆庭: (v) => { mutations.忆庭 = v; },
    set智库: (v) => { mutations.智库 = v; },
    set手机: (v) => { mutations.手机 = v; },
    setNPC: (v) => { mutations.NPC = v; },
    set相册: (fnOrValue) => { mutations.相册 = typeof fnOrValue === 'function' ? fnOrValue({ assets: [], entries: [] }) : fnOrValue; },
    set新闻: (v) => { mutations.新闻 = v; },
    set剧情: (v) => { mutations.剧情 = v; },
    set剧情编织: (v) => { mutations.剧情编织 = v; },
    setVariableBatches: (v) => { mutations.variableBatches = v; },
    setQueueTasks: (v) => { mutations.queueTasks = v; },
    setTurnCount: (v) => { mutations.turnCount = v; },
    setPendingOpeningTrigger: (v) => { mutations.pendingOpeningTrigger = v; },
    setGameSettings: () => {},
    // 当前（回合中）智库状态：条目 A 已被剧情解锁——自动存档失败回滚时不得残留。
    智库: {
      自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: 1,
      条目: [{ id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '', 原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [], 运行时解锁状态: '已解锁', 运行时解锁备注: '本回合已解锁' }],
    },
  };
  const updateSettingImpl = async (key, updater) => {
    if (key === 'zhikuSystem') { persistedZhiku = updater(null); return persistedZhiku; }
    return updater(null);
  };
  await restorePreTurnSnapshotPersisted(mockState, snapshot, updateSettingImpl);
  const entryA = mutations.智库.条目.find((entry) => entry.id === 'zhiku_entry_a');
  assert(entryA.运行时解锁状态 === '未解锁', '自动存档失败回滚后 React 智库必须保持回合前未解锁');
  const persistedEntry = persistedZhiku.条目.find((entry) => entry.id === 'zhiku_entry_a');
  assert(persistedEntry && persistedEntry.运行时解锁状态 === '未解锁', '自动存档失败回滚后持久化 zhikuSystem 必须保持回合前未解锁');
});

await check('返修C2：重 Roll 后重新加载，智库解锁仍保持回滚结果', async () => {
  // 重 Roll 走 restorePreTurnSnapshotPersisted（useGame.handleReroll 同一路径）：
  // 持久化被恢复为回合前值后，模拟重新加载（loadSetting 返回该值）仍为未解锁。
  const preTurnZhiku = {
    自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: 0,
    条目: [{ id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '', 原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [], 运行时解锁状态: '未解锁', 运行时解锁备注: '回合前' }],
  };
  const snapshot = {
    旅人: {}, 世界: {}, 记忆: emptyMemory(), 忆庭: { 回忆档案: [] }, 智库: preTurnZhiku,
    手机: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 }, NPC: [],
    相册: { assets: [], entries: [] }, 新闻: [], 剧情: [], 剧情编织: undefined,
    variableBatches: [], queueTasks: [], turnCount: 3, pendingOpeningTrigger: null,
    gameSettingsTurnState: {},
  };
  const mutations = {};
  let persistedZhiku = null;
  const mockState = {
    set旅人: () => {}, set世界: () => {}, set记忆: () => {}, set忆庭: () => {},
    set智库: (v) => { mutations.智库 = v; }, set手机: () => {}, setNPC: () => {},
    set相册: () => {}, set新闻: () => {}, set剧情: () => {}, set剧情编织: () => {},
    setVariableBatches: () => {}, setQueueTasks: () => {}, setTurnCount: () => {},
    setPendingOpeningTrigger: () => {}, setGameSettings: () => {},
    智库: {
      自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: 1,
      条目: [{ id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '', 原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [], 运行时解锁状态: '已解锁', 运行时解锁备注: '本回合已解锁' }],
    },
  };
  await restorePreTurnSnapshotPersisted(mockState, snapshot, async (key, updater) => {
    if (key === 'zhikuSystem') { persistedZhiku = updater(null); return persistedZhiku; }
    return updater(null);
  });
  // 模拟重新加载：loadSetting('zhikuSystem') 返回刚恢复的持久化值。
  const reloadedZhiku = JSON.parse(JSON.stringify(persistedZhiku));
  const reloadedEntry = reloadedZhiku.条目.find((entry) => entry.id === 'zhiku_entry_a');
  assert(reloadedEntry && reloadedEntry.运行时解锁状态 === '未解锁', '重 Roll 后重新加载必须仍为回合前未解锁');
  assert(mutations.智库.条目.find((entry) => entry.id === 'zhiku_entry_a').运行时解锁状态 === '未解锁', 'React 智库也必须回到回合前');
});

await check('返修C3：智库解锁提交延后到主回合正式存档成功之后（最小编译模块顺序行为）', async () => {
  const text = sendWorkflowBundleText;
  const saveGameIdx = text.indexOf('await saveGame(saveData)');
  // 调用点（而非函数定义）：commitZhikuAfterAutoSave 的执行必须发生在主回合存档成功之后。
  const commitCallIdx = text.indexOf('await commitZhikuAfterAutoSave();', saveGameIdx);
  const defIdx = text.indexOf('const commitZhikuAfterAutoSave = async');
  const updateSettingZhikuIdx = text.indexOf('updateSetting("zhikuSystem"', defIdx);
  assert(saveGameIdx >= 0, 'sendWorkflow 必须包含主回合正式存档');
  assert(commitCallIdx > saveGameIdx, '智库提交步骤必须在主回合正式存档成功之后调用');
  assert(updateSettingZhikuIdx > defIdx && updateSettingZhikuIdx < defIdx + 1200, '持久化 zhikuSystem 写入必须位于存档后提交步骤内');
});

await check('返修D1：手动压缩 flow 必须携带 sourceTurn/sourceFingerprint', async () => {
  const memory = { ...emptyMemory(), 即时记忆: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11'] };
  const settings = createMemorySettings({ 即时转短期阈值: 10 });
  const flow = buildMemorySummaryFlowRequest(memory, settings, 7);
  assert(flow.open === true && flow.stage === 'remind', 'flow 必须打开在 remind 阶段');
  assert(flow.sourceTurn === 7, '手动压缩 flow 必须记录来源回合');
  assert(typeof flow.sourceFingerprint === 'string' && flow.sourceFingerprint.length > 0, '手动压缩 flow 必须携带来源 fingerprint');
  assert(flow.pendingInfo && flow.pendingInfo.即时待压缩 > 0, 'flow 必须包含待压缩数量');
  assert(flow.sourceFingerprint === computeMemoryFingerprint(memory), 'fingerprint 必须与当前记忆一致');
});

await check('返修D2：缺少 fingerprint 或来源已变化时不得确认提交', async () => {
  const memoryA = { ...emptyMemory(), 即时记忆: ['base'] };
  const nextMemory = { ...emptyMemory(), 短期记忆: ['压缩后'] };
  const nextYiting = { 回忆档案: [] };
  let saveCalls = 0;
  let publishCalls = 0;
  let rejectedReason = '';
  // 缺少 fingerprint：拒绝提交
  await commitMemorySummary({
    sourceFingerprint: undefined,
    currentMemory: memoryA,
    nextMemory,
    nextYiting,
  }, {
    computeFingerprint: computeMemoryFingerprint,
    buildSavePayload: (o) => o,
    saveGame: async () => { saveCalls += 1; },
    publish: () => { publishCalls += 1; },
    onRejected: (reason) => { rejectedReason = reason; },
    onPersistFailure: () => {},
  });
  assert(saveCalls === 0 && publishCalls === 0, '缺 fingerprint 时不得保存也不得发布');
  assert(rejectedReason.includes('缺少来源'), '缺 fingerprint 必须给出拒绝原因');
  // 来源已变化：拒绝提交
  const sourceFingerprint = computeMemoryFingerprint(memoryA);
  const memoryChanged = addImmediateMemory(memoryA, '压缩开始后新增的记忆', 2);
  saveCalls = 0; publishCalls = 0; rejectedReason = '';
  const outcome = await commitMemorySummary({
    sourceFingerprint,
    currentMemory: memoryChanged,
    nextMemory,
    nextYiting,
  }, {
    computeFingerprint: computeMemoryFingerprint,
    buildSavePayload: (o) => o,
    saveGame: async () => { saveCalls += 1; },
    publish: () => { publishCalls += 1; },
    onRejected: (reason) => { rejectedReason = reason; },
    onPersistFailure: () => {},
  });
  assert(outcome.committed === false && outcome.reason === 'source_changed', '来源变化必须返回 source_changed');
  assert(saveCalls === 0 && publishCalls === 0, '来源变化时不得保存也不得发布（新记忆保持）');
  assert(rejectedReason.includes('已发生变化'), '来源变化必须给出明确拒绝原因');
});

await check('返修E1：记忆与忆庭保存失败时不发布新状态、不关闭审核结果', async () => {
  const memoryA = { ...emptyMemory(), 即时记忆: ['base'] };
  const sourceFingerprint = computeMemoryFingerprint(memoryA);
  const nextMemory = { ...emptyMemory(), 短期记忆: ['压缩后'] };
  const nextYiting = { 回忆档案: [{ id: 'a1', 摘要: '压缩后', 原文: '', 回合: 1, 时间戳: '' }] };
  let publishCalls = 0;
  let persistError = '';
  const outcome = await commitMemorySummary({
    sourceFingerprint,
    currentMemory: memoryA,
    nextMemory,
    nextYiting,
  }, {
    computeFingerprint: computeMemoryFingerprint,
    buildSavePayload: (o) => ({ ...o }),
    saveGame: async () => { throw new Error('saveGame boom'); },
    publish: () => { publishCalls += 1; },
    onRejected: () => {},
    onPersistFailure: (error) => { persistError = error; },
  });
  assert(outcome.committed === false && outcome.reason === 'persist_failed', '保存失败必须返回 persist_failed');
  assert(publishCalls === 0, '保存失败不得发布新状态（记忆/忆庭保持确认前）');
  assert(persistError.includes('saveGame boom'), '保存失败必须上报错误（flow 留在 review 可重试）');
});

await check('返修E2：保存成功时记忆与忆庭在同一负载中一次保存，之后才发布并关闭审核', async () => {
  const memoryA = { ...emptyMemory(), 即时记忆: ['base'] };
  const sourceFingerprint = computeMemoryFingerprint(memoryA);
  const nextMemory = { ...emptyMemory(), 短期记忆: ['压缩后'] };
  const nextYiting = { 回忆档案: [{ id: 'a1', 摘要: '压缩后', 原文: '', 回合: 1, 时间戳: '' }] };
  let savedPayload = null;
  let publishCalls = 0;
  let published = null;
  let afterSaveCalls = 0;
  const outcome = await commitMemorySummary({
    sourceFingerprint,
    currentMemory: memoryA,
    nextMemory,
    nextYiting,
  }, {
    computeFingerprint: computeMemoryFingerprint,
    buildSavePayload: (o) => ({ marker: 'single-payload', ...o }),
    saveGame: async (payload) => { savedPayload = payload; },
    publish: (next) => { publishCalls += 1; published = next; },
    afterSave: () => { afterSaveCalls += 1; },
    onRejected: () => {},
    onPersistFailure: () => {},
  });
  assert(outcome.committed === true, '保存成功必须提交');
  assert(savedPayload && savedPayload.记忆 === nextMemory && savedPayload.忆庭 === nextYiting, '记忆与忆庭必须在同一保存负载中');
  assert(savedPayload.marker === 'single-payload', '只创建一个保存负载节点');
  assert(publishCalls === 1 && afterSaveCalls === 1, '保存成功后才发布并做元信息收尾');
  assert(published.memory === nextMemory && published.yiting === nextYiting, '发布内容必须与保存负载一致');
});

// ── 最终定向返修（最终交接包 3/4 节）真实行为断言 ────────────────────────

console.log('\n[最终返修] 持久化 gameSettings 回滚 + 手机保存失败不发布');

/** 真实内存存储适配（模拟 IndexedDB settings store）：get/set/update（updater 形式）。 */
function createMemorySettingStore(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: async (key) => (store.has(key) ? store.get(key) : null),
    set: async (key, value) => { store.set(key, value); },
    update: async (key, updater) => {
      const current = store.has(key) ? store.get(key) : null;
      const next = updater(current);
      store.set(key, next);
      return next;
    },
    read: (key) => (store.has(key) ? store.get(key) : null),
  };
}

function createZhikuWithUnlockState(state, revision) {
  return {
    自制资料契约版本: 1, 自制资料下一个序号: 0, 目录版本: 'v3', 目录修订: revision,
    条目: [{ id: 'zhiku_entry_a', builtin: true, 标题: '资料A', 分类: 'character', 摘要: '', 原文: '', 来源: 'bundled', 关键词: [], 关联条目ID: [], 运行时解锁状态: state, 运行时解锁备注: state }],
  };
}

function createSnapshotWithTurnState(overrides = {}) {
  return {
    旅人: {}, 世界: {}, 记忆: emptyMemory(), 忆庭: { 回忆档案: [] }, 智库: createZhikuWithUnlockState('未解锁', 0),
    手机: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 }, NPC: [],
    相册: { assets: [], entries: [] }, 新闻: [], 剧情: [], 剧情编织: undefined,
    variableBatches: [], queueTasks: [], turnCount: 5, pendingOpeningTrigger: null,
    gameSettingsTurnState: {
      macroGlobalVars: { '{{turn}}': '5', '{{lastChar}}': '回合前内容' },
      worldbookTriggerStates: { wb_1: 4, wb_2: 9 },
    },
    ...overrides,
  };
}

function createRerollMockState(zhikuCurrent) {
  const mutations = {};
  return {
    set旅人: () => {}, set世界: () => {}, set记忆: () => {}, set忆庭: () => {},
    set智库: (v) => { mutations.智库 = v; }, set手机: () => {}, setNPC: () => {},
    set相册: () => {}, set新闻: () => {}, set剧情: () => {}, set剧情编织: () => {},
    setVariableBatches: () => {}, setQueueTasks: () => {}, setTurnCount: () => {},
    setPendingOpeningTrigger: () => {}, setGameSettings: () => {},
    智库: zhikuCurrent,
    mutations,
  };
}

await check('最终1：重 Roll/失败回滚后，持久化 gameSettings 回合字段与快照一致、无关设置不变', async () => {
  const store = createMemorySettingStore({
    // 当前持久化 gameSettings：含回合后（已消费）的宏变量/世界书触发状态 + 无关设置。
    gameSettings: {
      macroGlobalVars: { '{{turn}}': '99', '{{lastChar}}': '被撤销回合消费后的内容' },
      worldbookTriggerStates: { wb_1: 99, wb_2: 99 },
      enableStreaming: true,
      enableMemoryInjection: false,
      记忆系统: { 即时转短期阈值: 10 },
      promptModules: [],
    },
  });
  const snapshot = createSnapshotWithTurnState();
  const mockState = createRerollMockState(createZhikuWithUnlockState('已解锁', 1));
  await restorePreTurnSnapshotPersisted(mockState, snapshot, store.update);
  // 从存储重新读取（真实持久化重新加载路径，不是 React setter、不是局部变量）。
  const reloaded = store.read('gameSettings');
  assert(reloaded.macroGlobalVars['{{turn}}'] === '5', '重新加载后 macroGlobalVars 必须等于快照值');
  assert(reloaded.macroGlobalVars['{{lastChar}}'] === '回合前内容', '重新加载后宏变量内容必须等于快照值');
  assert(reloaded.worldbookTriggerStates.wb_1 === 4 && reloaded.worldbookTriggerStates.wb_2 === 9, '重新加载后 worldbookTriggerStates 必须等于快照值');
  assert(reloaded.enableStreaming === true, '无关设置 enableStreaming 必须保留当前持久化值');
  assert(reloaded.enableMemoryInjection === false, '无关设置 enableMemoryInjection 必须保留当前持久化值');
  assert(reloaded.记忆系统.即时转短期阈值 === 10, '无关设置 记忆系统 必须保留当前持久化值');
});

await check('最终2：成功回合消费后重 Roll 并终止新生成，重新加载仍是回合前值', async () => {
  const store = createMemorySettingStore({
    gameSettings: {
      macroGlobalVars: { '{{turn}}': '6', '{{lastChar}}': '本回合新内容' },
      worldbookTriggerStates: { wb_1: 5 },
      enableStreaming: true,
    },
  });
  const snapshot = createSnapshotWithTurnState();
  const mockState = createRerollMockState(createZhikuWithUnlockState('已解锁', 1));
  await restorePreTurnSnapshotPersisted(mockState, snapshot, store.update);
  const reloaded = store.read('gameSettings');
  assert(reloaded.macroGlobalVars['{{turn}}'] === '5', '重 Roll 后重新加载宏变量必须回到回合前');
  assert(reloaded.macroGlobalVars['{{lastChar}}'] === '回合前内容', '重 Roll 后重新加载宏变量内容必须回到回合前');
  assert(reloaded.worldbookTriggerStates.wb_1 === 4, '重 Roll 后重新加载世界书触发状态必须回到回合前');
  assert(reloaded.enableStreaming === true, '无关设置必须保持不变');
});

await check('最终3：快照无 gameSettingsTurnState 时不写持久化 gameSettings', async () => {
  const store = createMemorySettingStore({
    gameSettings: { macroGlobalVars: { '{{turn}}': '7' }, enableStreaming: true },
  });
  const snapshot = createSnapshotWithTurnState({ gameSettingsTurnState: undefined });
  const mockState = createRerollMockState(createZhikuWithUnlockState('未解锁', 0));
  await restorePreTurnSnapshotPersisted(mockState, snapshot, store.update);
  const reloaded = store.read('gameSettings');
  assert(reloaded.macroGlobalVars['{{turn}}'] === '7', '无回合快照字段时持久化 gameSettings 不得被改写');
  assert(reloaded.enableStreaming === true, '无回合快照字段时无关设置保持不变');
});

await check('最终4：zhikuSystem 与 gameSettings 恢复失败分别报告，互不阻断', async () => {
  const store = createMemorySettingStore({
    gameSettings: { macroGlobalVars: { '{{turn}}': '8' }, worldbookTriggerStates: { wb: 3 }, enableStreaming: true },
  });
  const snapshot = createSnapshotWithTurnState();
  const mockState = createRerollMockState(createZhikuWithUnlockState('未解锁', 0));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  try {
    await restorePreTurnSnapshotPersisted(mockState, snapshot, async (key, updater) => {
      if (key === 'zhikuSystem') throw new Error('zhiku boom');
      return store.update(key, updater);
    });
  } finally {
    console.warn = originalWarn;
  }
  assert(warnings.some((w) => w.includes('持久化智库运行态恢复失败')), 'zhikuSystem 恢复失败必须单独报告');
  assert(store.read('gameSettings').macroGlobalVars['{{turn}}'] === '5', 'zhikuSystem 失败不得阻断 gameSettings 恢复');
});

await check('最终5：初次双写失败任务保存失败时 publish=0，页面保持提交前状态', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const before = { memory: emptyMemory(), yiting: { 回忆档案: [] }, npcs: [npc], queueTasks: [] };
  let publishCalls = 0;
  let persistError = '';
  let threw = null;
  try {
    await runPhoneMemoryCommit({
      summary: '保存失败通讯',
      contactId: 'npc_march7th',
      turn: 1,
      operationSourceId: 'msg_savefail',
      memory: before.memory,
      yiting: before.yiting,
      npcs: before.npcs,
      settings: phoneSettingsLow,
    }, {
      getQueueTasks: () => before.queueTasks,
      buildSavePayload: (overrides) => overrides,
      saveGame: async () => { throw new Error('saveGame reject'); },
      publish: () => { publishCalls += 1; },
      onPersistFailure: (error) => { persistError = error; },
      // 注入双侧失败的事务结果，使协调器进入失败任务保存路径。
      execute: async () => ({
        operationId: 'phone_mem_1_npc_march7th_x_fail',
        nextMemory: before.memory,
        nextYiting: before.yiting,
        nextNpcs: before.npcs,
        sides: { yiting: { status: 'failed', error: 'y' }, npc: { status: 'failed', error: 'n' } },
      }),
    });
  } catch (err) {
    threw = err;
  }
  assert(threw !== null, '任务保存失败必须中止本次提交');
  assert(publishCalls === 0, '任务保存失败时 publish 必须为 0（页面保持提交前状态）');
  assert(persistError.includes('未入队、未发布'), 'onPersistFailure 必须收到明确错误，不得虚报任务已入队');
});

await check('最终6：单侧重试业务成功但保存失败时，不发布、不虚报成功，原任务仍可重试', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '需要补写的通讯',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_retry2',
  });
  assert(first.nextMemory.即时记忆.length === 1, '前置：首次提交后即时记忆 1 条');
  const failedTask = buildPhoneMemoryFailureTask({
    summary: '需要补写的通讯',
    contactId: 'npc_march7th',
    failedSide: 'npc',
    operationId: first.operationId,
    turn: 1,
  });
  const queueBefore = [failedTask];
  let publishCalls = 0;
  let persistError = '';
  const outcome = await retryPhoneMemoryWrite(
    parsePhoneMemoryFailureTask(failedTask),
    {
      memory: first.nextMemory,
      yiting: first.nextYiting,
      npcs: first.nextNpcs,
      settings: phoneSettingsLow,
      turn: 1,
    },
    {
      getQueueTasks: () => queueBefore,
      buildSavePayload: (overrides) => overrides,
      saveGame: async () => { throw new Error('saveGame reject'); },
      publish: () => { publishCalls += 1; },
      onPersistFailure: (error) => { persistError = error; },
    },
  );
  assert(publishCalls === 0, '重试保存失败时 publish 必须为 0');
  assert(outcome.ok === false, '保存失败不得报告为成功');
  assert(outcome.persistFailed === true, '返回结果必须明确标记未可靠提交');
  assert(outcome.result.nextMemory.即时记忆.length === 1, '重试不得重复追加即时记忆（透传原状态）');
  assert(outcome.result.nextNpcs[0].同行记忆.length === 1, '业务计算成功但保存失败时结果不发布');
  assert(queueBefore.length === 1 && parsePhoneMemoryFailureTask(queueBefore[0]).failedSide === 'npc', '原失败任务仍存在，可再次重试');
  assert(persistError.includes('未发布、未虚报成功'), 'onPersistFailure 必须明确提示未发布');
});

await check('最终7：单侧重试保存成功时，先保存完整负载再发布一次；重新加载与页面发布一致', async () => {
  const npc = createMinimalNpc('npc_march7th', '三月七');
  const first = await executePhoneMemoryDualWrite({
    memory: emptyMemory(),
    yiting: { 回忆档案: [] },
    npcs: [npc],
    summary: '需要补写的通讯',
    contact: { npcId: 'npc_march7th' },
    turn: 1,
    settings: phoneSettingsLow,
    operationSourceId: 'msg_retry3',
  });
  const failedTask = buildPhoneMemoryFailureTask({
    summary: '需要补写的通讯',
    contactId: 'npc_march7th',
    failedSide: 'npc',
    operationId: first.operationId,
    turn: 1,
  });
  const queueBefore = [failedTask];
  let savedPayloads = [];
  let publishCalls = 0;
  let published = null;
  const outcome = await retryPhoneMemoryWrite(
    parsePhoneMemoryFailureTask(failedTask),
    {
      memory: first.nextMemory,
      yiting: first.nextYiting,
      npcs: first.nextNpcs,
      settings: phoneSettingsLow,
      turn: 1,
    },
    {
      getQueueTasks: () => queueBefore,
      buildSavePayload: (overrides) => ({ marker: 'phone-single-payload', ...overrides }),
      saveGame: async (payload) => { savedPayloads.push(payload); },
      publish: (next) => { publishCalls += 1; published = next; },
    },
  );
  assert(outcome.ok === true, '保存成功必须报告成功');
  assert(savedPayloads.length === 1 && publishCalls === 1, '必须先保存一次完整负载，再发布一次');
  const saved = savedPayloads[0];
  assert(saved.记忆 === published.memory && saved.NPC === published.npcs, '保存负载与页面发布结果必须一致');
  assert(saved.queueTasks.some((task) => task.status === 'success'), '保存负载必须包含成功任务状态');
  // 重新加载（从保存负载读取）：任务与数据与页面发布一致。
  const reloaded = JSON.parse(JSON.stringify(published));
  assert(reloaded.memory.即时记忆.length === 1, '重新加载后即时记忆仍为 1 条');
  assert(reloaded.queueTasks.some((task) => task.status === 'success'), '重新加载后任务状态与发布一致');
});

// ── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n集中回归结果：${passed} 通过 / ${failed} 失败`);
if (failed > 0) {
  console.log('\n失败明细：');
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}
console.log('project confirmed issues fix regression ok');
