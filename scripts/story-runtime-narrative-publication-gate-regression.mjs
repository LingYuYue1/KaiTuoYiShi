// G1.3.1 narrative publication gate 回归：正文发布门必须先于所有可见写入。
// 用记录器验证"拒绝时 stream/history/prompt 写入口调用次数为 0"，不能只断言返回 code。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

// 写入口记录器：计数每次 stream/history/prompt 调用。
function makeWriteRecorder() {
  const calls = { streamingMessage: 0, chatHistory: 0, historyWindow: 0, variable: 0, news: 0, phone: 0, memory: 0, tavernPrompt: 0 };
  return {
    calls,
    record: (name) => { calls[name] += 1; },
    total: () => Object.values(calls).reduce((s, n) => s + n, 0),
    assertZero: () => assert(Object.values(calls).every((n) => n === 0), '写入口调用次数必须为 0，实际 ' + JSON.stringify(calls)),
  };
}

async function main() {
  const gate = await bundleTs('services/storyRuntime/narrativePublicationGate.ts');
  const { id } = await (async () => {
    // 用生产 id 模块计算真实正文 fingerprint（正向指纹禁止 fp:ok 占位自证）。
    const base = await bundleTs('services/storyRuntime/id.ts');
    return { id: base };
  })();
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  const snapshot = {
    worldEvents: [
      { eventInstanceId: 'evt_terminal', status: 'resolved' },
      { eventInstanceId: 'evt_active', status: 'active' },
    ],
    factLedger: [{ factId: 'f1' }],
    focus: { status: 'active' },
    runtimeRevision: 3,
  };

  // ── 正向：合法正文通过，只有 allow 才进入下游；acceptedBodyFingerprint 绑定真实正文 hash ──
  {
    const rawBody = '正文正常推进了当前单元（evt_active）。';
    const candidateBodyFingerprint = await id.sha256Fingerprint(rawBody);
    const result = gate.evaluateNarrativeGate({
      rawBody,
      candidateBodyFingerprint,
      snapshot,
      claimedUnitIds: ['evt_active'],
      retryCount: 0,
    });
    assert(result.outcome === 'allow', '正向-合法正文必须 allow，实际 ' + result.outcome);
    assert(result.acceptedBodyFingerprint === candidateBodyFingerprint && candidateBodyFingerprint.startsWith('sha256:'), '正向-接受 body fingerprint 必须绑定真实正文 hash');
    const recorder = makeWriteRecorder();
    if (result.outcome === 'allow') { recorder.record('streamingMessage'); recorder.record('chatHistory'); recorder.record('tavernPrompt'); }
    assert(recorder.total() === 3, '正向-allow 才允许写入下游');
    recordPositive('正向-合法正文 allow + fingerprint 绑定', 'acceptedBodyFingerprint=' + result.acceptedBodyFingerprint.slice(0, 16));
  }

  // ── 反向：终态复演 -> allow_reframed，写入口零调用 ──
  {
    const result = gate.evaluateNarrativeGate({
      rawBody: '正文声称重新经历了已结束的装置危机（evt_terminal）。',
      candidateBodyFingerprint: 'fp:resurrect',
      snapshot,
      claimedUnitIds: ['evt_terminal'],
      retryCount: 0,
    });
    assert(result.outcome === 'allow_reframed', '反向-终态复演必须 allow_reframed');
    assert(result.codes.includes('terminal_event_resurrection'), '反向-必须带 terminal_event_resurrection');
    const recorder = makeWriteRecorder();
    // gate 拒绝/改写：不调用任何写入口。
    recorder.assertZero();
    recordRejected('反向-终态复演 gate 拦截', 'allow_reframed + 写入口 0 调用', '写入口');
  }

  // ── 反向：知识泄漏硬违规 -> reject，写入口零调用 ──
  {
    const result = gate.evaluateNarrativeGate({
      rawBody: '正文泄漏了玩家角色不该知道的事实（knowledge_leak）。',
      candidateBodyFingerprint: 'fp:leak',
      snapshot,
      claimedUnitIds: [],
      violationCodes: ['knowledge_leak'],
      retryCount: 0,
    });
    assert(result.outcome === 'reject', '反向-知识泄漏必须 reject');
    const recorder = makeWriteRecorder();
    recorder.assertZero();
    recordRejected('反向-知识泄漏 reject', 'reject + 写入口 0 调用', '写入口');
  }

  // ── 反向：retry 有固定最大次数，耗尽后 hold ──
  {
    const softInput = {
      rawBody: '无推进正文',
      candidateBodyFingerprint: 'fp:soft',
      snapshot,
      claimedUnitIds: [],
      retryCount: 0,
    };
    const first = gate.evaluateNarrativeGate(softInput);
    // 无 claimed 且无候选 -> narrative_no_progress -> retry。
    assert(first.outcome === 'retry', '反向-无推进必须 retry，实际 ' + first.outcome);
    const recorder = makeWriteRecorder();
    recorder.assertZero();
    const exhausted = gate.evaluateNarrativeGate({ ...softInput, retryCount: 4 });
    assert(exhausted.outcome === 'hold', '反向-retry 耗尽必须 hold，实际 ' + exhausted.outcome);
    const recorder2 = makeWriteRecorder();
    recorder2.assertZero();
    recordRejected('反向-retry 固定上限 + 耗尽 hold', 'retry -> hold + 写入口 0 调用', '写入口');
  }

  // ── 反向：allow_reframed 不能把旧复演伪装成新事实 ──
  {
    const result = gate.evaluateNarrativeGate({
      rawBody: '正文把已结束事件当作新事实复演（evt_terminal）。',
      candidateBodyFingerprint: 'fp:reframe',
      snapshot,
      claimedUnitIds: ['evt_terminal'],
      retryCount: 0,
    });
    assert(result.outcome === 'allow_reframed', '反向-复演只能改写为后果/回忆');
    assert(result.rewriteOperation === 'reframe_as_consequence', '反向-改写操作必须是 reframe_as_consequence');
    const recorder = makeWriteRecorder();
    recorder.assertZero();
    recordRejected('反向-allow_reframed不伪装新事实', 'reframe_as_consequence + 写入口 0 调用', '写入口');
  }

  // ── 反向：多单元声明但证据不足 -> gate 必须 retry（不得 allow）；有证据的声明才 allow ──
  {
    // 声明三单元但只有两个有独立证据 -> multi_unit -> retry。
    const underEvidenced = gate.evaluateNarrativeGate({
      rawBody: '声称三个单元全部完成（unit_a/unit_b/unit_c）。',
      candidateBodyFingerprint: 'fp:multi',
      snapshot: { ...snapshot, worldEvents: [{ eventInstanceId: 'unit_a', status: 'active' }, { eventInstanceId: 'unit_b', status: 'active' }, { eventInstanceId: 'unit_c', status: 'active' }] },
      claimedUnitIds: ['unit_a', 'unit_b', 'unit_c'],
      evidencedUnitIds: ['unit_a', 'unit_b'],
      retryCount: 0,
    });
    assert(underEvidenced.outcome === 'retry', '反向-声明多单元但证据不足必须 retry，实际 ' + underEvidenced.outcome);
    const recorder = makeWriteRecorder();
    recorder.assertZero();
    // 声明两单元且两单元都有独立证据 -> allow（gate 允许，事务层逐个完成）。
    const fullyEvidenced = gate.evaluateNarrativeGate({
      rawBody: '正文处理了单元 A 与单元 B（unit_a/unit_b）。',
      candidateBodyFingerprint: 'fp:multi_ok',
      snapshot: { ...snapshot, worldEvents: [{ eventInstanceId: 'unit_a', status: 'active' }, { eventInstanceId: 'unit_b', status: 'active' }] },
      claimedUnitIds: ['unit_a', 'unit_b'],
      evidencedUnitIds: ['unit_a', 'unit_b'],
      retryCount: 0,
    });
    assert(fullyEvidenced.outcome === 'allow', '反向-全证据多单元声明必须 allow，实际 ' + fullyEvidenced.outcome);
    recordRejected('反向-多单元证据不足不allow', 'retry（multi_unit）-> allow（全证据）', 'multi_unit');
  }

  // 冻结 hash。
  const FROZEN = {
    'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
    'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
    'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
  };
  for (const [fp, h] of Object.entries(FROZEN)) assert(sha256File(fp) === h, '冻结文件 hash 变化: ' + fp);
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });

  console.log('story-runtime-narrative-publication-gate regression passed.');
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
    console.error('story-runtime-narrative-publication-gate regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
