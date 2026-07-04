import fs from 'node:fs';

const tab = fs.readFileSync('components/features/Settings/PromptModulesTab.tsx', 'utf8');
const guard = fs.readFileSync('hooks/useGame/tavernFormatGuard.ts', 'utf8');
const builder = fs.readFileSync('hooks/useGame/tavernMessageChainBuilder.ts', 'utf8');
const settings = fs.readFileSync('models/settings.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const regexProcessor = fs.readFileSync('hooks/useGame/tavernRegexProcessor.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(tab.includes('onPresetChange={patchV2Preset}'), '酒馆预设面板必须能把编辑写回 stPresetsV2。');
assert(tab.includes('onExport={exportV2Preset}'), '酒馆预设面板必须提供当前预设导出入口。');
assert(tab.includes('onDelete={deletePresetV2}'), '酒馆预设面板必须提供玩家导入预设删除入口。');
assert(tab.includes('>导出<') || tab.includes('导出'), '酒馆预设 UI 必须显示导出按钮。');
assert(tab.includes('const deletePresetV2 = (presetId: string)') && tab.includes('const target = (settings.stPresetsV2 ?? []).find') && tab.includes('target.isBuiltin'), 'V2 删除逻辑必须只删除 stPresetsV2 中的非内置预设。');
assert(tab.includes('该操作只会删除玩家导入的预设，不会影响内置预设和原生提示词模块。'), 'V2 删除确认必须说明不会影响内置预设。');
assert(tab.includes('patchOrderSlot(slot.identifier'), '酒馆预设 UI 必须支持单条启停 prompt_order 顺序项。');
assert(tab.includes("patchSelectedPrompt({ role: e.target.value as typeof selectedPrompt.role })"), '酒馆预设 UI 必须支持编辑 prompt role。');
assert(tab.includes('patchSelectedPrompt({ content: e.target.value })'), '酒馆预设 UI 必须支持编辑 prompt content。');
assert(tab.includes('const canEdit = Boolean(current && !current.isBuiltin)'), '内置酒馆预设必须保持只读。');
assert(tab.includes('const canToggleOrderSlot = Boolean(current)'), '酒馆预设顺序项启停不能被内置只读状态锁死。');
assert(tab.includes('builtin_override_${presetId}') && tab.includes('（自定义配置）'), '内置酒馆预设首次修改顺序项时必须生成玩家自定义配置副本。');
assert(tab.includes('disabled={!canToggleOrderSlot}') && !tab.includes('disabled={!canEdit} onChange={(next) => patchOrderSlot'), '顺序项开关必须使用 canToggleOrderSlot，而不是 canEdit。');
assert(tab.includes('本地审查') && tab.includes('本地审查报告'), '酒馆预设 UI 必须保留本地审查入口和报告区。');
assert(tab.includes('runLocalReview') && tab.includes('buildLocalReviewText'), '酒馆预设审查必须只运行本地结构扫描。');
assert(tab.includes('world_info') && tab.includes('世界书：') && tab.includes('getPresetWorldInfoEntries'), '本地审查必须统计 ST world_info。');
assert(tab.includes('预设世界书') && tab.includes('patchWorldInfoEntry') && tab.includes('world_info 只在主剧情酒馆消息链中按关键词触发'), '酒馆预设 UI 必须支持查看和单条启停 ST world_info。');
assert(tab.includes('顺序槽位') && !tab.includes('角色槽位'), 'UI 不能再把 character_id 称为角色槽位。');
assert(tab.includes('regex_scripts') && tab.includes('正则脚本：') && tab.includes('analyzeTavernRegexScript'), '本地审查必须统计并提示 ST regex_scripts 风险。');
assert(tab.includes('预设正则脚本') && tab.includes('dryRunTavernRegexScript') && tab.includes('DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE'), '酒馆预设 UI 必须提供 ST regex_scripts 查看和干跑预览。');
assert(tab.includes('data-tavern-regex-panel="true"') && tab.includes('当前预设没有附带 regex_scripts'), '酒馆预设 UI 必须常驻显示正则面板入口，即使当前预设没有 regex_scripts。');
assert(tab.includes('scriptName') && tab.includes('findRegex') && tab.includes('replaceString'), '酒馆预设正则 UI 必须兼容 ST 原版驼峰字段。');
assert(tab.includes('主剧情只会执行安全输出清理类正则') && tab.includes('真实运行只放开安全输出清理类正则'), '正则脚本 UI 必须明确只放开安全输出清理类正则。');
assert(!tab.includes('chatCompletionNonStream') && !tab.includes('fallbackPrompt'), '酒馆预设本地审查不能再调用外部 AI 或保留空回重试提示词。');
assert(!tab.includes('aiReviewApiConfigId') && !tab.includes('审查 API：跟随主 API'), '酒馆预设页不能再保留旧的审查 API 下拉选择。');
assert(!tab.includes('buildEffectivePresetReviewApiConfig') && !tab.includes('settings.stAiReviewApi'), '酒馆预设页不能再依赖预设审查子 API 配置。');
assert(tab.includes('function MacroInspector'), '酒馆预设 UI 必须提供宏检测区域。');
assert(tab.includes('详细预览'), '酒馆预设 UI 必须使用独立详情预览区。');

assert(guard.includes('export function applyTavernFormatGuard'), 'ST V2 格式保护层必须独立导出。');
assert(guard.includes('matchesTavernCotPlaceholder') && guard.includes('matchesTavernFormatPlaceholder'), '格式保护层必须集中处理 COT/format 占位符检测。');
assert(builder.includes("from './tavernFormatGuard'"), '消息链构建器必须复用 tavernFormatGuard。');
assert(!settings.includes('stAiReviewApi') && !settings.includes('预设审查API覆盖'), '游戏设置不能再保留外部 AI 审查 API 配置。');
assert(!settings.includes('stCharCardDescription'), '游戏设置不能再保留角色卡描述字段，{{char}} 应由项目运行时兼容层生成。');
assert(!apiSettings.includes("key: 'presetReview'") && !apiSettings.includes('PresetReviewApiSettingsTab'), 'API 设置不能再提供预设审查子配置页。');
assert(regexProcessor.includes('Object.entries(raw as Record<string, unknown>)'), '正则脚本 UI 依赖 normalizeTavernRegexScripts 支持对象映射形式 regex_scripts。');

console.log('Tavern preset UI edit/export regression ok');
