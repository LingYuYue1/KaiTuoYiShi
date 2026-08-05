import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage6-real-runner-${process.pid}-${Date.now()}.mjs`);
const mockApiKey = 'mock-stage6-api-key-must-not-leak';
const mockBaseUrl = 'https://stage6.mock.invalid/v1';
let apiCalls = 0;
let aiSupplementCalls = 0;
let mainModelCalls = 0;

try {
  await build({
    stdin: {
      contents: [
        "export * from './services/zhikuStage6Runner';",
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
        "export { 创建默认游戏设置 } from './models/settings';",
        "export { 创建空角色 } from './models/character';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage6-real-runner-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: bundlePath,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = String(init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && !url.startsWith(mockBaseUrl)) {
      const requestPath = url.split('?')[0].replace(/^\//u, '');
      const filePath = path.join(root, 'public', requestPath);
      if (!fs.existsSync(filePath)) return new Response('', { status: 404 });
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    apiCalls += 1;
    const rawBody = typeof init.body === 'string' ? init.body : '';
    const isAiSupplement = rawBody.includes('智库管理者') && rawBody.includes('汪汪丹');
    if (isAiSupplement) aiSupplementCalls += 1;
    else mainModelCalls += 1;
    const content = isAiSupplement
      ? JSON.stringify({ selections: [], noSelectionReason: 'mock regression keeps keyword recall' })
      : '<正文><!-- stage6 mock meta -->饮月的龙角在水光中一闪，他稳稳收住力量，让眼前的场景自然继续。\n<行动选项>1. 继续观察\n<短期记忆>本轮用于验证缺尾标签修复。\n<动态世界>水流恢复平稳。';
    return Response.json({
      id: `mock-${apiCalls}`,
      model: 'mock-stage6-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
  };

  const runtime = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const system = await runtime.loadAllBundledZhikuPresets();
  const gameSettings = runtime.创建默认游戏设置();
  const playerRole = { ...runtime.创建空角色(), 姓名: '星', 别名: '开拓者' };
  const progress = [];
  const report = await runtime.runZhikuStage6Ab({
    system,
    gameSettings,
    playerRole,
    config: {
      id: 'stage6-mock',
      name: 'stage6-mock',
      provider: 'openai_compatible',
      baseUrl: mockBaseUrl,
      apiKey: mockApiKey,
      model: 'mock-stage6-model',
      maxTokens: 900,
      temperature: 0.1,
      retryCount: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    onProgress: (next) => progress.push(next),
  });

  const serializedReport = JSON.stringify(report);
  const formattedReport = runtime.formatZhikuStage6Report(report);
  if (report.status !== 'completed') {
    console.error(JSON.stringify({
      status: report.status,
      summary: report.summary,
      warnings: report.warnings,
      failedAssertions: report.fixtures.flatMap((fixture) => fixture.hardAssertions
        .filter((item) => !item.passed)
        .map((item) => `${fixture.id}:${item.id}:${item.detail}`)),
    }, null, 2));
  }
  assert(apiCalls === 19, `runner must make 19 mocked API calls, received ${apiCalls}`);
  assert(mainModelCalls === 18, `runner must make 18 main-model calls, received ${mainModelCalls}`);
  assert(aiSupplementCalls === 1, `runner must make one AI-supplement call, received ${aiSupplementCalls}`);
  assert(report.status === 'completed', `runner must complete the full matrix, received ${report.status}`);
  assert(report.fixtures.length === 10, `runner must retain ten fixtures, received ${report.fixtures.length}`);
  assert(report.summary.plannedMainRequests === 18, 'planned main request count must stay at 18');
  assert(report.summary.completedMainRequests === 18, 'all 18 main requests must complete');
  assert(report.summary.failedMainRequests === 0 && report.summary.cancelledMainRequests === 0, 'mock run must have no failed or cancelled main requests');
  assert(report.summary.truncatedMainRequests === 0, 'mock run must have no truncated main requests');
  assert(report.summary.aiSupplementRequests === 1, 'report must count the real AI-supplement execution once');
  assert(report.summary.hardAssertionsFailed === 0, `all hard assertions must pass, received ${report.summary.hardAssertionsFailed}`);
  assert(report.summary.isolationPreserved, 'runner must preserve the catalog/settings/player isolation fingerprint');
  assert(progress.length >= 19 && progress.at(-1)?.status === 'completed', 'progress callback must receive group progress and the finalized report');
  assert(!serializedReport.includes(mockApiKey) && !serializedReport.includes(mockBaseUrl), 'structured report must not retain API key or Base URL');
  assert(!formattedReport.includes(mockApiKey) && !formattedReport.includes(mockBaseUrl), 'formatted report must not expose API key or Base URL');
  const allGroups = report.fixtures.flatMap((fixture) => fixture.groups);
  assert(allGroups.every((group) => group.output.includes('stage6 mock meta')), 'raw provider output must remain available for audit');
  assert(allGroups.every((group) => group.production?.body.includes('饮月的龙角') && !group.production.body.includes('stage6 mock meta')), 'production parse result must retain the body and remove HTML meta comments');
  assert(allGroups.every((group) => group.production?.memory.includes('缺尾标签修复') && group.production.worldEvents.includes('水流恢复平稳。')), 'production parser must recover unclosed memory and world-event sections');

  const untouchedBefore = report.fixtures.find((fixture) => fixture.id === 'multi-present')?.groups.find((group) => group.group === 'without-v3');
  const singleProgress = [];
  const singlePatch = await runtime.runZhikuStage6Ab({
    system,
    gameSettings,
    playerRole,
    config: {
      id: 'stage6-mock',
      name: 'stage6-mock',
      provider: 'openai_compatible',
      baseUrl: mockBaseUrl,
      apiKey: mockApiKey,
      model: 'mock-stage6-model',
      maxTokens: 900,
      temperature: 0.1,
      retryCount: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    selection: { fixtureId: 'single-present', group: 'with-v3' },
    onProgress: (next) => singleProgress.push(next),
  });
  assert(mainModelCalls === 19 && aiSupplementCalls === 1, 'single-group retest must add exactly one main-model call and no AI-supplement call');
  assert(singlePatch.execution.kind === 'single' && singlePatch.summary.plannedMainRequests === 1 && singlePatch.summary.completedMainRequests === 1, 'single-group patch must describe only its controlled request');
  assert(singlePatch.fixtures.length === 1 && singlePatch.fixtures[0].groups.length === 1, 'single-group patch must only contain the selected fixture and group');
  assert(singleProgress.at(-1)?.status === 'completed', 'single-group retest must emit a finalized progress report');
  const mergedReport = runtime.mergeZhikuStage6Reports(report, singlePatch);
  const untouchedAfter = mergedReport.fixtures.find((fixture) => fixture.id === 'multi-present')?.groups.find((group) => group.group === 'without-v3');
  const replacedGroup = mergedReport.fixtures.find((fixture) => fixture.id === 'single-present')?.groups.find((group) => group.group === 'with-v3');
  assert(mergedReport.fixtures.length === 10 && mergedReport.fixtures.flatMap((fixture) => fixture.groups).length === 18, 'merging a single-group retest must preserve the complete matrix');
  assert(untouchedAfter?.runId === untouchedBefore?.runId && untouchedAfter?.output === untouchedBefore?.output, 'single-group merge must not overwrite unrelated results');
  assert(replacedGroup?.runId === singlePatch.runId, 'single-group merge must replace the selected result with the retest run id');
  const reviewedReport = runtime.updateZhikuStage6HumanReview(mergedReport, 'single-present', { withV3Score: 5, withoutV3Score: 3, verdict: 'with-v3' });
  assert(reviewedReport.fixtures.find((fixture) => fixture.id === 'single-present')?.humanReview?.verdict === 'with-v3', 'manual review must be stored locally in the report without another model call');

  const contextViewer = fs.readFileSync(path.join(root, 'components/features/Settings/ContextViewer.tsx'), 'utf8');
  const settingsModal = fs.readFileSync(path.join(root, 'components/features/Settings/SettingsModal.tsx'), 'utf8');
  assert(contextViewer.includes('data-testid="zhiku-stage6-run"'), 'context viewer must expose a stable real-run button test id');
  assert(contextViewer.includes('data-testid="zhiku-stage6-report"'), 'context viewer must expose a stable report test id');
  assert(contextViewer.includes('data-testid="zhiku-stage6-fixture-select"') && contextViewer.includes('data-testid="zhiku-stage6-group-select"'), 'context viewer must expose fixture and group selectors');
  assert(contextViewer.includes('data-testid="zhiku-stage6-rerun-group"'), 'context viewer must expose a stable single-group retest button');
  assert(contextViewer.includes('data-testid="zhiku-stage6-ab-comparison"') && contextViewer.includes('原始供应商响应') && contextViewer.includes('玩家最终可见 / 解析正文'), 'context viewer must show the same fixture A/B outputs and distinguish raw from production results');
  assert(contextViewer.includes('人工评分（本地记录，不调用第二个 AI）'), 'context viewer must keep character-performance scoring as a local manual action');
  assert(contextViewer.includes('grid-cols-1 gap-3 lg:grid-cols-2'), 'A/B output columns must collapse to a single column at narrow widths');
  assert(settingsModal.includes('ZHIKU_STAGE6_REPORT_STORAGE_KEY') && settingsModal.includes('loadSetting<ZhikuStage6Report>'), 'settings modal must restore the last local report');
  assert(settingsModal.includes('onProgress: (next) => persistZhikuStage6Report'), 'each runner progress point must persist the local report');
  assert(settingsModal.includes('mergeZhikuStage6Reports') && settingsModal.includes('updateZhikuStage6HumanReview'), 'settings modal must merge single-group patches and persist manual review');

  console.log(JSON.stringify({
    fixtures: report.fixtures.length,
    mainModelCalls,
    aiSupplementCalls,
    progressEvents: progress.length,
    hardAssertions: report.summary.hardAssertionsPassed,
    isolationPreserved: report.summary.isolationPreserved,
  }));
  console.log('ZHIKU_STAGE6_REAL_RUNNER_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
