import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

async function importBundled(entryPoint) {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@': process.cwd() },
    logLevel: 'silent',
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const reference = await importBundled('components/features/GameSystems/album/referenceInjection.ts');
const settingsModel = await importBundled('models/settings.ts');
const imageService = await importBundled('services/ai/imageGeneration.ts');

const normalApi = (backend = 'sd_webui', enabled = true) => ({ enabled, backend });
const referenceSettings = (enabled, extra = {}) => ({
  enabled,
  injectionOptInVersion: 1,
  sdWebuiDenoisingStrength: 0.55,
  enableComfyWorkflowReference: false,
  enableOpenAICompatibleReference: false,
  enableNovelAIReference: false,
  ...extra,
});
const travelerTarget = { id: 'traveler_avatar', targetType: 'traveler', slot: 'avatar_profile', tokenizerMode: 'avatar' };
const npcTarget = { id: 'npc_portrait', targetType: 'npc', slot: 'portrait', tokenizerMode: 'portrait' };
const nsfwTarget = { id: 'nsfw_reference', targetType: 'nsfw_part', slot: 'nsfw_body_reference', tokenizerMode: 'portrait', nsfw: true };
const sceneTarget = { id: 'scene', targetType: 'scene', slot: 'scene', tokenizerMode: 'scene' };
const entry = {
  id: 'entry-ref',
  assetId: 'asset-ref',
  title: '参考图',
  targetType: 'npc',
  targetId: 'npc-1',
  slot: 'misc',
  tags: ['参考图'],
  nsfw: false,
  createdAt: 1,
  referenceTargets: ['npc-1'],
};
const album = { assets: [], entries: [entry], tasks: [] };
const assetMap = new Map([['asset-ref', { dataUrl: 'data:image/png;base64,AAAA' }]]);

const guardedAlbum = { assets: [], tasks: [] };
Object.defineProperty(guardedAlbum, 'entries', {
  get() {
    throw new Error('关闭或不适用时不得读取相册条目');
  },
});

const disabled = reference.resolveReferenceImagesForGeneration({
  target: travelerTarget,
  api: normalApi(),
  settings: referenceSettings(false),
  album: guardedAlbum,
  assetMap: new Map(),
});
assert.equal(disabled.status.code, 'disabled');
assert.deepEqual(disabled.images, []);

const scene = reference.resolveReferenceImagesForGeneration({
  target: sceneTarget,
  api: normalApi(),
  settings: referenceSettings(true),
  album: guardedAlbum,
  assetMap: new Map(),
});
assert.equal(scene.status.code, 'not_applicable');
assert.deepEqual(scene.images, []);

const missing = reference.resolveReferenceImagesForGeneration({
  target: travelerTarget,
  api: normalApi(),
  settings: referenceSettings(true),
  album: { assets: [], entries: [], tasks: [] },
  assetMap: new Map(),
});
assert.equal(missing.status.code, 'missing_reference');

const unsupported = reference.resolveReferenceImagesForGeneration({
  target: npcTarget,
  targetId: 'npc-1',
  api: normalApi('openai_compatible'),
  settings: referenceSettings(true),
  album,
  assetMap,
});
assert.equal(unsupported.status.code, 'unsupported');
assert.deepEqual(unsupported.entries, []);

const openAIEnabled = reference.resolveReferenceImagesForGeneration({
  target: npcTarget,
  targetId: 'npc-1',
  api: normalApi('openai_compatible'),
  settings: referenceSettings(true, { enableOpenAICompatibleReference: true }),
  album,
  assetMap,
});
assert.equal(openAIEnabled.status.code, 'enabled');
assert.deepEqual(openAIEnabled.entries.map((item) => item.id), ['entry-ref']);

const enabled = reference.resolveReferenceImagesForGeneration({
  target: npcTarget,
  targetId: 'npc-1',
  api: normalApi(),
  settings: referenceSettings(true),
  album,
  assetMap,
});
assert.equal(enabled.status.code, 'enabled');
assert.deepEqual(enabled.entries.map((item) => item.id), ['entry-ref']);
assert.deepEqual(enabled.images.map((item) => item.src), ['data:image/png;base64,AAAA']);

const nsfwEnabled = reference.resolveReferenceImagesForGeneration({
  target: nsfwTarget,
  targetId: 'npc-1',
  api: normalApi(),
  settings: referenceSettings(true),
  album,
  assetMap,
});
assert.equal(nsfwEnabled.status.code, 'enabled');

const unavailable = reference.resolveReferenceImagesForGeneration({
  target: npcTarget,
  targetId: 'npc-1',
  api: normalApi(),
  settings: referenceSettings(true),
  album,
  assetMap: new Map(),
});
assert.equal(unavailable.status.code, 'unavailable');
assert.deepEqual(unavailable.entries, []);

const migrated = settingsModel.归一化文生图参考图设置({ enabled: true });
assert.equal(migrated.enabled, false, '未选择加入的旧配置必须迁移为关闭');
assert.equal(migrated.injectionOptInVersion, settingsModel.参考图注入选择加入版本);
const optedIn = settingsModel.归一化文生图参考图设置({ ...migrated, enabled: true });
assert.equal(optedIn.enabled, true, '玩家迁移后手动开启的选择必须保留');

const warning = '部分中转供应商不支持参考图，如参考图生成失败请关闭该开关。';
const referenceWorkspace = fs.readFileSync('components/features/GameSystems/album/referenceWorkspace.tsx', 'utf8');
const settingsWorkspace = fs.readFileSync('components/features/Settings/ImageGenerationSettingsTab.tsx', 'utf8');
assert(referenceWorkspace.includes(warning) && settingsWorkspace.includes(warning), '两个参考图设置入口都必须显示中转兼容警告');

const originalFetch = globalThis.fetch;
const providerRequests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith('data:')) {
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  }
  providerRequests.push({ url, init });
  return new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
try {
  const generated = await imageService.generateImage({
    enabled: true,
    backend: 'openai_compatible',
    baseUrl: 'https://provider.test/v1',
    apiKey: 'test-key',
    model: 'gpt-image-1',
    pathMode: 'preset',
    customPath: '',
    defaultSize: '1024x1024',
    responseFormat: 'b64_json',
    negativePrompt: '',
  }, {
    prompt: 'test prompt',
    referenceImages: [{ id: 'entry-ref', src: 'data:image/png;base64,AQID', role: 'character' }],
  });
  assert.equal(generated.src, 'data:image/png;base64,AQID');
  assert.equal(providerRequests.length, 1, '参考图请求不得再额外发起无参考图降级请求');
  assert.equal(providerRequests[0].url, 'https://provider.test/v1/images/edits');
  assert(providerRequests[0].init.body instanceof FormData, 'OpenAI 兼容参考图必须使用 multipart FormData');
  assert(providerRequests[0].init.body.get('image') instanceof Blob, 'multipart 请求必须包含 image 文件字段');
  assert.equal(providerRequests[0].init.headers.Authorization, 'Bearer test-key');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('reference image injection control regression ok');
