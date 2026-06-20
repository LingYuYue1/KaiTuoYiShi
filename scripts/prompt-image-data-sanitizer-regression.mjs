import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`prompt-image-data-sanitizer regression failed: ${message}`);
    process.exit(1);
  }
}

const sanitizer = fs.readFileSync('utils/promptPayloadSanitizer.ts', 'utf8');
const newsModel = fs.readFileSync('services/ai/newsModel.ts', 'utf8');
const variableRegistry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');

assert(sanitizer.includes('sanitizePromptPayload'), '必须提供通用 Prompt 载荷清洗函数。');
assert(sanitizer.includes('stringifyPromptPayload'), '必须提供安全 JSON stringify 入口。');
assert(sanitizer.includes('DATA_IMAGE_RE') && sanitizer.includes('data:image'), '清洗器必须识别 data:image base64。');
assert(sanitizer.includes('isLikelyRawImageBase64'), '清洗器必须兜底识别图片字段里的裸 base64。');
assert(sanitizer.includes('图片数据已省略') && sanitizer.includes('疑似图片 Base64 已省略'), '清洗器必须把图片二进制替换成短占位。');

assert(newsModel.includes("import { stringifyPromptPayload } from '@/utils/promptPayloadSanitizer'"), '新闻模型必须使用 Prompt 清洗 stringify。');
assert(newsModel.includes('stringifyPromptPayload(request.traveler)'), '新闻用户消息不得直接序列化完整旅人对象。');
assert(!newsModel.includes('JSON.stringify(request.traveler, null, 2)'), '新闻模型不得把旅人头像/立绘原始数据写进 Prompt。');
assert(!newsModel.includes('JSON.stringify(request.npcRecords ?? [], null, 2)'), '新闻模型不得把 NPC 原始图像档案写进 Prompt。');

assert(variableRegistry.includes('PROMPT_BINARY_IMAGE_PATH_RE'), '变量登记表必须识别图片二进制槽位路径。');
assert(variableRegistry.includes('!isPromptBinaryImagePath(path)'), '变量登记表必须从 Prompt 可写路径中过滤图片二进制槽位。');
assert(variableRegistry.includes('图像档案\\.(?:头像|立绘)') && variableRegistry.includes('图像档案\\.头像槽位'), '变量登记表必须过滤 NPC 图像档案中的头像/立绘/头像槽位。');

console.log('prompt-image-data-sanitizer regression passed.');
