import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage6-preflight-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './services/zhikuRuntimeCompiler';",
        "export * from './services/zhikuStage6Harness';",
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage6-preflight-entry.ts',
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

  globalThis.fetch = async (input) => {
    const requestPath = String(input).split('?')[0].replace(/^\//u, '');
    const filePath = path.join(root, 'public', requestPath);
    if (!fs.existsSync(filePath)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(filePath), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const runtime = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const system = await runtime.loadAllBundledZhikuPresets();
  const fixtureAudit = runtime.auditZhikuStage6Fixtures(system);
  assert(fixtureAudit.fixtureCount === 10, 'fixed fixture inventory must contain ten scenarios');
  assert(fixtureAudit.missingEntryIds.length === 0, `fixed fixture references missing stable IDs: ${fixtureAudit.missingEntryIds.join(', ')}`);

  const compile = (query, participation) => runtime.compileZhikuTurn({
    system,
    query,
    limit: 8,
    scope: 'main',
    participation,
    sceneContext: { presentNpcNamesForFallback: participation.present },
  });

  const single = compile('丹恒正在整理列车智库。', { present: ['丹恒'], anticipated: [], mentioned: [], background: [] });
  assert(single.characterEnforcementBrief.includes('丹恒'), 'single-present fixture must create a present-character calibration block');
  const multi = compile('丹恒和三月七继续商量下一步。', { present: ['丹恒', '三月七'], anticipated: [], mentioned: [], background: [] });
  assert(multi.characterEnforcementBrief.includes('丹恒') && multi.characterEnforcementBrief.includes('三月七'), 'multi-present fixture must retain both present characters');
  const mentioned = compile('姬子在通讯里被提到。', { present: [], anticipated: [], mentioned: ['姬子'], background: [] });
  assert(!mentioned.characterEnforcementBrief.includes('姬子'), 'mentioned-only fixture must not enter mandatory calibration');
  const anticipated = compile('下一站也许会遇到丹恒。', { present: [], anticipated: ['丹恒'], mentioned: [], background: [] });
  assert(!anticipated.characterEnforcementBrief.includes('丹恒'), 'anticipated fixture must not enter mandatory calibration before appearance');
  const multiForm = compile('丹恒显露饮月之姿。', { present: ['丹恒'], anticipated: [], mentioned: [], background: [] });
  const formEntries = multiForm.characterEntries.filter((entry) => entry.互斥组ID === 'character:danheng:form');
  assert(formEntries.length === 1 && formEntries[0].id === 'JS-076', 'multi-form fixture must keep only the explicit Imbibitor Lunae form');
  const lowInfo = compile('继续。', { present: [], anticipated: [], mentioned: [], background: [] });
  assert(lowInfo.entries.length === 0, 'low-information fixture must not manufacture Zhiku entries');
  assert(![single, multi, mentioned, anticipated, multiForm, lowInfo].some((item) => item.entries.some((entry) => entry.分类 === 'story')), 'story archives must stay outside every preflight payload');

  const payloadInput = {
    systemPrompt: `base-system\n\n${single.mainStoryInjection}`,
    messages: [
      { role: 'user', content: 'history' },
      { role: 'user', content: `${single.characterEnforcementBrief}\n\nfinal-guard` },
    ],
    compilation: single,
    prefixMode: false,
    scope: 'main',
    transport: 'preflight',
    endpoint: 'preflight',
    streaming: false,
  };
  const fingerprintBefore = runtime.createZhikuStage6IsolationFingerprint({ system, payloadInput });
  const ab = runtime.buildZhikuStage6EffectAb(payloadInput);
  const fingerprintAfter = runtime.createZhikuStage6IsolationFingerprint({ system, payloadInput });
  assert(ab.assertions.every((item) => item.passed), 'isolated A/B request hard assertions must all pass');
  assert(fingerprintBefore === fingerprintAfter, 'isolated A/B request builder must not change the catalog or request source');

  const phone = runtime.compileZhikuPhoneView(system, ['丹恒']);
  assert(phone.phonePersonaView.includes('丹恒') && phone.mainStoryInjection === '', 'phone fixture must use the phone persona view without main-story injection');

  console.log(JSON.stringify({
    apiCalls: 0,
    catalogVersion: system.目录版本,
    catalogRevision: system.目录修订,
    catalogEntries: system.条目.length,
    fixtureCount: fixtureAudit.fixtureCount,
    checkedCompilations: 6,
    abAssertions: ab.assertions.length,
    finalFormId: formEntries[0].id,
  }));
  console.log('ZHIKU_STAGE6_PREFLIGHT_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
