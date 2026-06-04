import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const service = fs.readFileSync('services/ai/apiErrorReportService.ts', 'utf8');
const tab = fs.readFileSync('components/features/Settings/ApiErrorReportsTab.tsx', 'utf8');
const modal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');

assert(service.includes("API_ERROR_REPORTS_KEY = 'apiErrorReports'"), 'API 错误报告必须有独立本地 settings key。');
assert(service.includes('appendApiErrorReport'), '必须提供 API 错误报告写入函数。');
assert(service.includes('maskApiKey'), '错误报告必须遮蔽 API Key。');
assert(service.includes('MAX_API_ERROR_REPORTS'), '错误报告必须限制最大条数。');

assert(modal.includes('ApiErrorReportsTab'), '设置弹窗必须引入 API 错误报告页。');
assert(modal.includes("'apiErrors'"), '设置弹窗必须有错误报告 tab key。');
assert(modal.includes("label: '错误报告'"), '设置弹窗必须显示错误报告页签。');
assert(tab.includes('复制当前报告'), '错误报告页必须支持复制报告。');
assert(tab.includes('清空报告'), '错误报告页必须支持清空报告。');
assert(tab.includes('Base URL'), '错误报告页必须显示 Base URL。');
assert(tab.includes('状态码'), '错误报告页必须显示状态码。');

assert(client.includes('appendApiErrorReport'), '聊天补全失败必须写入 API 错误报告。');
assert(client.includes('fetchWithApiErrorReport'), '聊天补全网络或 CORS 失败也必须写入 API 错误报告。');
assert(client.includes("source: '聊天补全'"), '流式聊天失败必须记录来源。');
assert(client.includes("source: '非流式补全'"), '非流式聊天失败必须记录来源。');
assert(apiTools.includes('appendApiErrorReport'), '模型列表和连接测试失败必须写入 API 错误报告。');
assert(apiTools.includes("requestMode: 'models'"), '模型列表失败必须标记 requestMode=models。');
assert(apiTools.includes("source: '连接测试'"), '连接测试失败必须记录来源。');
assert(apiTools.includes("source: '百度千帆模型列表'"), '百度模型列表失败必须记录来源。');
assert(sendWorkflow.includes('appendApiErrorReport'), '主剧情工作流判定失败必须写入 API 错误报告。');
assert(sendWorkflow.includes("source: '主剧情工作流'"), '主剧情自动重试必须记录为主剧情工作流来源。');
assert(sendWorkflow.includes('返回空响应，触发自动重试'), '主剧情空响应重试必须写入错误报告。');
assert(sendWorkflow.includes('alreadyReportedByApiLayer'), '主剧情工作流不应重复覆盖底层 API 错误报告。');

console.log('api error reports regression ok');
