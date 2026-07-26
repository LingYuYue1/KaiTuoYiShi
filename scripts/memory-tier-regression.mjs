import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exit(1);
  }
}

const memoryModel = read('models/memory.ts');
const settings = read('models/settings.ts');
const memoryUtils = read('hooks/useGame/memoryUtils.ts');
const memoryCompression = read('services/memoryCompression.ts');
const memoryPanel = read('components/features/GameSystems/MemoryPanel.tsx');
const memorySettings = read('components/features/Settings/MemorySystemSettings.tsx');
const systemPrompt = read('hooks/useGame/systemPromptBuilder.ts');
const historyWindow = read('hooks/useGame/historyWindow.ts');
const phoneService = read('services/ai/phoneService.ts');

assert(memoryModel.includes('中期记忆: string[]'), '记忆系统 schema 必须包含中期记忆。');
assert(memoryModel.includes('中期记忆: []'), '创建空记忆系统必须初始化中期记忆。');

assert(settings.includes('短期转中期阈值: number'), '记忆设置必须包含短期转中期阈值。');
assert(settings.includes('中期转长期阈值: number'), '记忆设置必须包含中期转长期阈值。');
assert(settings.includes('短期转中期提示词: string'), '记忆设置必须包含短期转中期提示词。');
assert(settings.includes('中期转长期提示词: string'), '记忆设置必须包含中期转长期提示词。');
assert(settings.includes('input.短期转中期阈值 ?? input.短期转长期阈值'), '旧短期转长期阈值必须迁移到新短期转中期阈值。');
assert(settings.includes('input.中期转长期提示词 ?? input.短期转长期提示词'), '旧短期转长期提示词必须迁移到新中期转长期提示词。');

assert(memoryUtils.includes('compressToMiddleTerm'), '必须有短期压缩到中期的函数。');
assert(memoryUtils.includes('createMiddleTermArchiveEntry'), '短期到中期压缩必须写入中期压缩回忆档案。');
assert(memoryUtils.includes("kind: 'middle'"), '异步记忆总结必须支持 middle 压缩类型。');
assert(memoryUtils.includes('prompt: settings.短期转中期提示词'), '短期到中期压缩必须使用短期转中期提示词。');
assert(memoryUtils.includes('prompt: settings.中期转长期提示词'), '中期到长期压缩必须使用中期转长期提示词。');
assert(memoryModel.includes('中期记忆: Array.isArray(raw?.中期记忆) ? raw!.中期记忆 : []'), '旧存档归一化必须补齐中期记忆。');

assert(memoryCompression.includes("export type MemoryCompressionKind = 'short' | 'middle' | 'long'"), '记忆压缩服务必须支持 middle 类型。');
assert(memoryCompression.includes("if (kind === 'middle') return '短期 -> 中期'"), '记忆压缩服务必须标记短期到中期。');
assert(memoryCompression.includes("'中期转长期'"), '记忆压缩兜底必须标记中期到长期。');

assert(memoryPanel.includes("type MemoryLayer = 'immediate' | 'short' | 'middle' | 'long' | 'failed'"), '记忆面板必须有中期与失败草稿页签。');
assert(memoryPanel.includes("middle: { label: '中期'"), '记忆面板必须展示中期层级。');
assert(memoryPanel.includes('压缩到中期'), '记忆面板必须提供短期压缩到中期按钮。');
assert(memoryPanel.includes('压缩到长期'), '记忆面板必须提供中期压缩到长期按钮。');
assert(memoryPanel.includes('settings.短期转中期阈值'), '记忆面板必须显示短期转中期阈值。');
assert(memoryPanel.includes('settings.中期转长期阈值'), '记忆面板必须显示中期转长期阈值。');

assert(memorySettings.includes('短期 → 中期'), '记忆设置页必须允许配置短期转中期阈值。');
assert(memorySettings.includes('中期 → 长期'), '记忆设置页必须允许配置中期转长期阈值。');
assert(memorySettings.includes('label="短期转中期"'), '记忆设置页必须允许配置短期转中期提示词。');
assert(memorySettings.includes('label="中期转长期"'), '记忆设置页必须允许配置中期转长期提示词。');

assert(historyWindow.includes('MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT'), '主剧情记忆窗口必须定义中期记忆注入上限。');
assert(systemPrompt.includes("formatMemorySection('中期记忆', middleTerm)"), '主剧情 prompt 必须识别中期记忆。');
assert(systemPrompt.includes('function buildLayeredMemorySections'), '主剧情记忆注入必须通过分层构建器统一处理。');
assert(systemPrompt.includes('normalizeMemoryFingerprint'), '主剧情短中长期记忆必须有跨层去重指纹。');
assert(systemPrompt.includes('pickDedupedMemoryEntries'), '主剧情短中长期记忆必须经过跨层去重挑选。');
assert(systemPrompt.includes('const source = entries.map((item) => item.trim()).filter(Boolean);'), '跨层去重必须能回溯整层记忆，不能只扫最近 limit*2 条。');
assert(systemPrompt.includes('const shortTerm = pickDedupedMemoryEntries'), '短期记忆必须优先占用最近承接去重基准。');
assert(systemPrompt.includes('const middleTerm = pickDedupedMemoryEntries'), '中期记忆必须避开短期重复内容。');
assert(systemPrompt.includes('const longTerm = pickDedupedMemoryEntries'), '长期记忆必须避开短期和中期重复内容。');
assert(!systemPrompt.includes('const recentShortTerm = memorySystem.短期记忆.slice(-MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT)'), '短期记忆不得继续无去重直接 slice 注入。');
assert(!systemPrompt.includes('const recentMiddleTerm = (memorySystem.中期记忆 ?? []).slice(-MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT)'), '中期记忆不得继续无去重直接 slice 注入。');
assert(!systemPrompt.includes('const recentLongTerm = memorySystem.长期记忆.slice(-MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT)'), '长期记忆不得继续无去重直接 slice 注入。');
assert(!historyWindow.includes('MAIN_IMMEDIATE_MEMORY_PROMPT_LIMIT'), '主剧情记忆窗口不应再定义即时记忆注入上限。');
assert(!systemPrompt.includes('记忆｜即时记忆'), '主剧情 prompt 不应再直接注入即时记忆。');
assert(!historyWindow.includes('memorySystem.即时记忆.length > 0'), '只有即时记忆时不应触发主剧情记忆历史窗口。');
assert(phoneService.includes('不得声称读取全局记忆'), '手机系统必须继续隔离全局短中长期记忆，避免联系人越权读取主线。');
assert(!phoneService.includes('中期：${m}'), '手机系统不得把主线中期记忆直接注入联系人上下文。');

console.log('✓ memory tier regression passed');
