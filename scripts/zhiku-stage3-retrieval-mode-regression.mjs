import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage3-retrieval-mode-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './models/settings';",
        "export * from './models/zhiku';",
        "export * from './services/zhikuRetrieval';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage3-retrieval-mode-entry.ts',
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

  const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const defaults = api.创建默认智库系统设置();
  assert(defaults.enableAiSupplement === false, 'AI supplement must be opt-in by default');
  assert(api.归一化智库系统设置({}).enableAiSupplement === false, 'legacy settings must not silently enable AI supplement');
  assert(api.归一化智库系统设置({ enableAiSupplement: true }).enableAiSupplement === true, 'explicit AI supplement setting was not retained');

  const makeLoreInjectionContent = (title) => ({
    类型: 'lore',
    核心定义: `${title}测试核心定义`,
    关键事实: `${title}测试关键事实`,
    叙事用途: `${title}测试叙事用途`,
    演绎边界: `不得误用${title}`,
  });

  const keywordEntry = api.创建智库条目({
    标题: '测试空间站',
    分类: 'location',
    摘要: '关键词应确定性命中的测试地点。',
    原文: '测试空间站是一处地点。',
    关键词: ['测试空间站'],
    可用于联动: true,
    注入内容: makeLoreInjectionContent('测试空间站'),
  });
  keywordEntry.id = 'DD-900';
  const supplementEntry = api.创建智库条目({
    标题: '测试派系',
    分类: 'faction',
    摘要: '只用于确认 AI 补充存在候选。',
    原文: '测试派系与另一条目没有关键词重合。',
    关键词: ['测试派系'],
    可用于联动: true,
    注入内容: makeLoreInjectionContent('测试派系'),
  });
  supplementEntry.id = 'PX-900';
  const system = { 条目: [keywordEntry, supplementEntry] };
  const mainConfig = {
    id: 'test-main',
    name: 'test-main',
    provider: 'openai_compatible',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 64,
    temperature: 0,
    retryCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };

  let apiCalls = 0;
  globalThis.fetch = async () => {
    apiCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ selections: [], noSelectionReason: '当前候选均非下一段必需' }) } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const keywordOnly = await api.retrieveZhikuContextWithModel(
    system,
    '测试空间站',
    5,
    { ...defaults, enableAiSupplement: false },
    mainConfig,
    undefined,
    0,
  );
  assert(apiCalls === 0, `AI supplement disabled but API was called ${apiCalls} time(s)`);
  assert(keywordOnly.usedModel !== true, 'keyword-only retrieval must not report model usage');
  assert(keywordOnly.entries.some((entry) => entry.id === keywordEntry.id), 'keyword-only retrieval lost the deterministic keyword hit');

  const withAiSupplement = await api.retrieveZhikuContextWithModel(
    system,
    '测试空间站',
    5,
    { ...defaults, enableAiSupplement: true },
    mainConfig,
    undefined,
    0,
  );
  assert(apiCalls === 1, `AI supplement enabled but expected exactly one API call, received ${apiCalls}`);
  assert(withAiSupplement.usedModel === true, 'enabled AI supplement must report model usage when a candidate request is sent');
  assert(withAiSupplement.entries.some((entry) => entry.id === keywordEntry.id), 'AI supplement must preserve deterministic keyword hits');

  const settingsSource = fs.readFileSync(path.join(root, 'components/features/Settings/ZhikuSettingsTab.tsx'), 'utf8');
  const workflowSource = fs.readFileSync(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
  const snapshotSource = fs.readFileSync(path.join(root, 'hooks/useGame/contextSnapshot.ts'), 'utf8');
  assert(settingsSource.includes('AI 主动补充') && settingsSource.includes('不会额外调用 API'), 'settings UI must expose the opt-in AI supplement switch');
  assert(
    workflowSource.includes('zhikuAiSupplementEnabled')
      && workflowSource.includes('compileZhikuTurnWithModel({')
      && workflowSource.includes('Promise.resolve(compileZhikuTurn({')
      && !workflowSource.includes('Promise.resolve(retrieveZhikuContext('),
    'main workflow must select local or AI-backed retrieval through the single turn compiler',
  );
  assert(snapshotSource.includes('AI 主动补充未开启') && snapshotSource.includes('不会发送智库补充 API 请求'), 'context snapshot must describe keyword-only mode truthfully');

  console.log(JSON.stringify({
    defaultAiSupplement: defaults.enableAiSupplement,
    disabledApiCalls: 0,
    enabledApiCalls: apiCalls,
    keywordHit: keywordOnly.entries.map((entry) => entry.标题),
  }));
  console.log('ZHIKU_STAGE3_RETRIEVAL_MODE_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
