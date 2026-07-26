import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync('services/ai/imageGeneration.ts', 'utf8');

assert(source.includes('normalizeNovelAISize'), 'NovelAI 生图尺寸必须按 64 倍数归一，避免服务端参数错误。');
assert(source.includes("model.startsWith('nai-diffusion-4')"), 'NovelAI V4/V4.5 模型必须走新版 payload。');
assert(source.includes('parameters.v4_prompt'), 'NovelAI V4/V4.5 请求必须包含 v4_prompt。');
assert(source.includes('parameters.v4_negative_prompt'), 'NovelAI V4/V4.5 请求必须包含 v4_negative_prompt。');
assert(source.includes('buildNovelAIRequestPayload'), 'NovelAI 请求必须通过可直接回归的纯 payload builder 构建。');
assert(source.includes('compiled.characterPrompts.map'), 'NovelAI V4/V4.5 必须把编译后的角色块写入 characterPrompts。');
assert(source.includes('params_version: 3'), 'NovelAI 请求必须携带 params_version。');
assert(source.includes('formatNovelAIError'), 'NovelAI 错误必须提供可读诊断。');
assert(source.includes('NAI V4/V4.5 需要 v4_prompt 参数'), 'NovelAI 500 错误应提示 V4/V4.5 参数方向。');

assert(source.includes('readNovelAIImageBlob'), 'NovelAI binary response must go through image reader instead of storing the raw response blob.');
assert(source.includes('readFirstImageFromZip'), 'NovelAI zip response must be unpacked into the first image file.');
assert(source.includes('isZipContentType') && source.includes('isZipHeader'), 'NovelAI reader must detect zip by content-type and PK header.');
assert(source.includes("new Decompression('deflate-raw')"), 'NovelAI deflated zip image entries must be decompressed before dataUrl conversion.');
assert(!source.includes("return { src: await blobToDataUrl(blob), mimeType: blob.type || 'image/png', model: config.model, backend: config.backend };"), 'NovelAI must not store the whole response blob as an image.');

console.log('novelai image regression ok');
