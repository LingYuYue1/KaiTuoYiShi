import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage6-harness-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: "export * from './services/zhikuStage6Harness';",
      resolveDir: root,
      sourcefile: 'zhiku-stage6-harness-entry.ts',
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
  const runtime = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const fixtureSystem = {
    条目: [
      { id: 'JS-004' },
      { id: 'JS-076' },
    ],
  };
  const audit = runtime.auditZhikuStage6Fixtures(fixtureSystem);
  assert(audit.fixtureCount === 10, 'stage6 must keep the ten fixed fixture scenarios');
  assert(audit.missingEntryIds.includes('JS-002'), 'fixture audit must report missing stable IDs instead of copying fallback text');
  assert(audit.fixtures.some((fixture) => fixture.id === 'low-information' && fixture.ready), 'low-information fixture must remain runnable without a character ID');

  const compilation = {
    compileId: 'fixture-compile',
    mainStoryInjection: '## V3 static section\ncurrent character archive',
    characterEnforcementBrief: '【当前明确在场人物校准】\n- 丹恒：说话方式与红线',
  };
  const input = {
    systemPrompt: `base system\n${compilation.mainStoryInjection}`,
    messages: [
      { role: 'user', content: 'history' },
      { role: 'user', content: `${compilation.characterEnforcementBrief}\nfinal guard` },
    ],
    compilation,
    prefixMode: false,
    scope: 'main',
    transport: 'openai-compatible',
    endpoint: 'chat-completions',
    streaming: false,
  };
  const before = JSON.stringify(input);
  const result = runtime.buildZhikuStage6EffectAb(input);
  assert(JSON.stringify(input) === before, 'A/B builder must not mutate its input request');
  assert(result.assertions.every((item) => item.passed), 'all A/B hard assertions must pass');
  assert(result.withV3.systemPrompt.includes('V3 static section'), 'A group must retain V3 static section');
  assert(!result.withoutV3.systemPrompt.includes('V3 static section'), 'B group must remove only the V3 static section');
  assert(!result.withoutV3.messages.some((message) => message.content.includes('当前明确在场人物校准')), 'B group must remove the character calibration block');
  assert(result.withV3.requestHash !== result.withoutV3.requestHash, 'A/B payloads must have distinct request hashes');
  assert(!JSON.stringify(result.withoutV3).includes('zhikuInjectionOverride'), 'B group must not call the legacy Zhiku override');
  const modeEquivalence = runtime.compareZhikuStage6Modes(
    { mainStoryInjection: 'same static', characterEnforcementBrief: 'same brief', entries: [{ id: 'A' }] },
    { mainStoryInjection: 'same static', characterEnforcementBrief: 'same brief', entries: [{ id: 'A' }] },
  );
  assert(modeEquivalence.passed, 'native and Tavern V2 mode comparison must require identical V3 selection semantics');

  const state = { chatHistory: [{ id: 'x' }], catalogRevision: 8, unlocked: ['JS-004'] };
  const fingerprint = runtime.createZhikuStage6IsolationFingerprint(state);
  runtime.buildZhikuStage6EffectAb(input);
  assert(runtime.createZhikuStage6IsolationFingerprint(state) === fingerprint, 'A/B preflight must preserve the caller state fingerprint');

  const harnessSource = fs.readFileSync(path.join(root, 'services/zhikuStage6Harness.ts'), 'utf8');
  assert(!harnessSource.includes('sendChatMessage') && !harnessSource.includes('chatCompletion'), 'stage6 harness must not call an API');
  console.log(JSON.stringify({ fixtureCount: audit.fixtureCount, missingIds: audit.missingEntryIds, assertions: result.assertions.length }));
  console.log('ZHIKU_STAGE6_HARNESS_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
