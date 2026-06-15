import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const character = fs.readFileSync('models/character.ts', 'utf8');
const imageModel = fs.readFileSync('models/imageGeneration.ts', 'utf8');
const imageService = fs.readFileSync('services/ai/imageGeneration.ts', 'utf8');
const albumActions = fs.readFileSync('utils/albumActions.ts', 'utf8');
const promptRules = fs.readFileSync('utils/imagePromptRules.ts', 'utf8');
const albumPanel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const imageSettings = fs.readFileSync('components/features/Settings/ImageGenerationSettingsTab.tsx', 'utf8');

assert(character.includes('角色锚点?: NPC角色锚点档案'), '旅人图像档案必须支持主控角色锚点。');
assert(imageModel.includes('originalUrl?: string'), '图片资源必须保留原始远程地址字段，便于排查和兼容。');
assert(imageService.includes('persistRemoteImage'), '远程 URL 生成结果必须尝试持久化为 dataUrl。');
assert(imageService.includes('originalUrl: url'), '远程 URL 持久化后必须保留 originalUrl。');
assert(albumActions.includes('originalUrl?: string') && albumActions.includes('dataUrl: isDataUrl ? input.src : undefined'), '相册创建必须支持 dataUrl 优先和 originalUrl 保存。');

assert(promptRules.includes('readTravelerCharacterAnchorPrompt'), '旅人生图 prompt 必须读取主控锚点。');
assert(promptRules.includes('presentNpcs?: NPC记录[]'), '场景 prompt 必须接收在场 NPC。');
assert(promptRules.includes('readSceneCharacterAnchors'), '场景 prompt 必须整合主控和在场角色锚点。');
assert(promptRules.includes('sceneAnchors.negative'), '场景 prompt 的负面词必须合并角色锚点负面词。');

assert(albumPanel.includes('全量资源库'), '相册资源库必须显示全量资源入口。');
assert(albumPanel.includes('未归档图片'), '相册资源库必须显示未归档图片。');
assert(albumPanel.includes('SafeAlbumImage') && albumPanel.includes('图片失效'), '相册图片加载失败必须显示明确失效提示。');
assert(albumPanel.includes('ResourceEntryCard'), '相册资源库必须有独立资源卡片。');
assert(albumPanel.includes('主控锚点管理'), '相册锚点页必须显示主控锚点管理。');
assert(albumPanel.includes('buildPresentSceneNpcs'), '场景生图必须收集当前在场角色。');
assert(albumPanel.includes('buildSceneSourceText'), '词组转化器 sourceText 必须包含场景和锚点资料。');
assert(albumPanel.includes('originalUrl: result.originalUrl'), '生成结果入库必须保存原始 URL。');
assert(albumPanel.includes('手动生图') && albumPanel.includes('手动生成'), '相册必须保留手动生图入口。');

assert(!imageSettings.includes("'automation'"), '文生图设置页不应再包含 automation 页面。');
assert(!imageSettings.includes('自动任务配置'), '文生图设置页不应显示自动任务配置。');
assert(!imageSettings.includes('启用场景队列'), '文生图设置页不应显示场景自动队列。');
assert(!imageSettings.includes('启用伙伴队列'), '文生图设置页不应显示伙伴自动队列。');
assert(!imageSettings.includes('自动任务也不会生成成人图片'), 'NSFW 设置文案不应再引用自动任务。');
assert(imageSettings.includes('相册显示手动生成入口'), '文生图总览必须说明当前为手动生成入口。');

console.log('image generation optimization regression ok');
