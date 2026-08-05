import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage5-request-${process.pid}-${Date.now()}.mjs`);

const config = (provider, model, extras = {}) => ({
  id: `${provider}:${model}`,
  name: provider,
  provider,
  baseUrl: provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://example.com/v1',
  apiKey: 'test-key',
  model,
  createdAt: 0,
  updatedAt: 0,
  ...extras,
});
const message = (role, content) => ({ id: `${role}:${content}`, role, content, timestamp: 0 });

try {
  await build({
    stdin: {
      contents: [
        "export * from './hooks/useGame/mainRequestFinalizer';",
        "export { buildChatTransportPayloadPreview, resolveChatProviderCapabilities } from './services/ai/chatCompletionClient';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage5-request-finalization-entry.ts',
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

  const claudeCompatible = config('claude_compatible', 'claude-sonnet-4-5', { enableClaudeMode: true });
  const claudeCaps = runtime.resolveChatProviderCapabilities(claudeCompatible);
  assert(claudeCaps.transport === 'claude' && claudeCaps.endpoint === 'messages', 'Claude compatible mode must resolve to Messages transport');
  assert(claudeCaps.depthInjection === 'system', 'Claude compatible depth modules must fall back to system prompt');
  assert(runtime.resolveChatProviderCapabilities({ ...claudeCompatible, enableClaudeMode: false }).transport === 'openai_compatible', 'disabled Claude mode must keep compatible chat transport');

  const moduleChatMessages = [
    { role: 'user', content: 'POSITION_ZERO', _injectionPosition: 0, _injectionOrder: 1 },
    { role: 'assistant', content: 'DEPTH_MODULE', _injectionPosition: 1, _injectionDepth: 1, _injectionOrder: 2 },
  ];
  const sharedTail = [message('user', 'CHARACTER_ENFORCEMENT')];
  const matrix = [
    { name: 'openai-compatible', config: config('openai_compatible', 'gpt-test'), transport: 'openai_compatible', endpoint: 'chat', depth: 'messages' },
    { name: 'deepseek', config: config('deepseek', 'deepseek-chat', { baseUrl: 'https://api.deepseek.com/v1' }), transport: 'deepseek', endpoint: 'chat', depth: 'messages' },
    { name: 'gemini-native', config: config('gemini', 'gemini-2.5-pro'), transport: 'gemini', endpoint: 'gemini', depth: 'messages' },
    { name: 'claude-native', config: config('claude', 'claude-sonnet-4-5'), transport: 'claude', endpoint: 'messages', depth: 'system' },
    { name: 'claude-compatible', config: claudeCompatible, transport: 'claude', endpoint: 'messages', depth: 'system' },
    { name: 'opencode-chat', config: config('opencode', 'deepseek-v4-flash'), transport: 'opencode', endpoint: 'chat', depth: 'messages' },
    { name: 'opencode-messages', config: config('opencode', 'claude-sonnet-4-5'), transport: 'opencode', endpoint: 'messages', depth: 'messages' },
    { name: 'opencode-responses', config: config('opencode', 'gpt-5'), transport: 'opencode', endpoint: 'responses', depth: 'messages' },
    { name: 'opencode-gemini', config: config('opencode', 'gemini-2.5-pro'), transport: 'opencode', endpoint: 'gemini', depth: 'messages' },
  ];

  const readSystemText = (payload, endpoint) => {
    if (endpoint === 'messages') return payload.system?.map((part) => part.text).join('\n') ?? '';
    if (endpoint === 'responses') return String(payload.instructions ?? '');
    if (endpoint === 'gemini') return payload.systemInstruction?.parts?.map((part) => part.text).join('\n') ?? '';
    return payload.messages
      ?.filter((item) => item.role === 'system')
      .map((item) => item.content)
      .join('\n') ?? '';
  };

  for (const testCase of matrix) {
    const hashes = new Map();
    for (const mode of ['native', 'tavern-v2']) {
      for (const streaming of [true, false]) {
        const baseMessages = [
          message('system', 'SYSTEM_EXTRA'),
          ...(mode === 'tavern-v2' ? [message('system', 'TAVERN_STYLE')] : []),
          message('user', 'PLAYER_INPUT'),
        ];
        const input = {
          config: testCase.config,
          systemPrompt: 'NATIVE_BASE\nZHIKU_INJECTION',
          baseMessages,
          moduleChatMessages,
          tailMessages: sharedTail,
          prefixMode: true,
          prefixContent: 'PREFILL',
          streaming,
          mode,
          scope: 'main',
          zhikuCompileId: 'compile:1',
        };
        const finalized = runtime.finalizeMainRequest(input);
        const repeated = runtime.finalizeMainRequest(input);
        const label = `${testCase.name}/${mode}/${streaming ? 'stream' : 'non-stream'}`;

        assert(finalized.capabilities.transport === testCase.transport, `${label} transport drifted`);
        assert(finalized.capabilities.endpoint === testCase.endpoint, `${label} endpoint drifted`);
        assert(finalized.capabilities.depthInjection === testCase.depth, `${label} depth policy drifted`);
        assert(finalized.capabilities.streaming === streaming, `${label} streaming diagnostic drifted`);
        assert(finalized.capabilities.mode === mode, `${label} mode diagnostic drifted`);
        assert(finalized.requestHash === repeated.requestHash, `${label} request hash must be deterministic`);
        assert(finalized.prefixMode && finalized.prefixContent === 'PREFILL', `${label} must retain assistant prefill`);
        assert(finalized.messages.at(-1)?.content === 'CHARACTER_ENFORCEMENT', `${label} must keep the shared character enforcement block at the tail`);
        assert(finalized.messages.filter((item) => item.content === 'CHARACTER_ENFORCEMENT').length === 1, `${label} must not duplicate character enforcement`);
        assert(finalized.systemPrompt.includes('POSITION_ZERO'), `${label} must retain position-zero modules in system`);
        assert(finalized.systemPrompt.includes('ZHIKU_INJECTION'), `${label} must retain the compiled Zhiku injection`);
        if (testCase.depth === 'system') {
          assert(finalized.systemPrompt.includes('DEPTH_MODULE'), `${label} must move depth modules into system`);
          assert(!finalized.messages.some((item) => item.content === 'DEPTH_MODULE'), `${label} must not duplicate system-fallback depth modules in messages`);
        } else {
          assert(!finalized.systemPrompt.includes('DEPTH_MODULE'), `${label} must not move message-capable depth modules into system`);
          assert(finalized.messages.at(-2)?.content === 'DEPTH_MODULE', `${label} depth=1 module must sit immediately before the shared tail block`);
        }

        const preview = runtime.buildChatTransportPayloadPreview(testCase.config, {
          systemPrompt: finalized.systemPrompt,
          messages: finalized.messages,
          prefixMode: finalized.prefixMode,
          prefixContent: finalized.prefixContent,
        }, streaming);
        const systemText = readSystemText(preview.payload, testCase.endpoint);
        const payloadText = JSON.stringify(preview.payload);
        assert(preview.capabilities.transport === testCase.transport && preview.capabilities.endpoint === testCase.endpoint, `${label} preview routing must match finalization`);
        assert(systemText.includes('NATIVE_BASE') && systemText.includes('ZHIKU_INJECTION'), `${label} payload lost the native system or Zhiku injection`);
        assert(systemText.includes('POSITION_ZERO') && systemText.includes('SYSTEM_EXTRA'), `${label} payload lost merged system modules`);
        assert(mode === 'tavern-v2' ? systemText.includes('TAVERN_STYLE') : !systemText.includes('TAVERN_STYLE'), `${label} Tavern style layering drifted`);
        assert(payloadText.includes('DEPTH_MODULE'), `${label} payload lost the depth module`);
        assert(payloadText.includes('CHARACTER_ENFORCEMENT'), `${label} payload lost the shared character enforcement block`);
        assert(payloadText.includes('PREFILL'), `${label} payload lost assistant prefill`);
        if (testCase.endpoint !== 'gemini') {
          assert(preview.payload.stream === streaming, `${label} payload stream flag drifted`);
        }
        if (testCase.name === 'deepseek') {
          const prefixMessage = preview.payload.messages?.at(-1);
          assert(prefixMessage?.role === 'assistant' && prefixMessage?.content === 'PREFILL' && prefixMessage?.prefix === true, `${label} must use DeepSeek beta prefix semantics`);
        }

        hashes.set(`${mode}:${streaming}`, finalized.requestHash);
      }
      assert(hashes.get(`${mode}:true`) !== hashes.get(`${mode}:false`), `${testCase.name}/${mode} hash must include streaming mode`);
    }
    assert(hashes.get('native:true') !== hashes.get('tavern-v2:true'), `${testCase.name} native and Tavern payload hashes must differ`);
  }

  const sendWorkflow = fs.readFileSync(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
  const snapshot = fs.readFileSync(path.join(root, 'hooks/useGame/contextSnapshot.ts'), 'utf8');
  const phone = fs.readFileSync(path.join(root, 'services/ai/phoneService.ts'), 'utf8');
  const npc = fs.readFileSync(path.join(root, 'utils/npcArchiveEnrichment.ts'), 'utf8');
  assert(sendWorkflow.includes('finalizeMainRequest({') && snapshot.includes('finalizeMainRequest({'), 'real send and context snapshot must share the finalizer');
  assert(sendWorkflow.includes('requestHash: actualMainRequestHash') && snapshot.includes('上一回合真实请求回执'), 'real request receipt must be persisted and visible separately from prediction');
  assert(!sendWorkflow.includes("mainStoryConfig.provider !== 'claude'"), 'application layer must not duplicate Claude transport routing');
  assert(phone.includes('compileZhikuPhoneView(ctx.zhiku, names).phonePersonaView') && !phone.includes('isPhoneAllowedZhikuEntry'), 'phone must consume the compiler view without a second selector');
  assert(!npc.includes('buildZhikuArchiveBaseline') && !npc.includes("from '@/models/zhiku'"), 'NPC enrichment must not copy Zhiku static text');

  console.log('ZHIKU_STAGE5_REQUEST_FINALIZATION_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
