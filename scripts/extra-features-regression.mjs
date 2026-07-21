import fs from 'node:fs';
import { readTurnWorkflowSource } from './lib/turn-workflow-source.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const extraTab = fs.readFileSync('components/features/Settings/ExtraFeaturesSettingsTab.tsx', 'utf8');
const sendWorkflow = readTurnWorkflowSource();
const useGameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const settingsPlanes = fs.readFileSync('models/settingsPlanes.ts', 'utf8');
const saveLoadWorkflow = fs.readFileSync('hooks/useGame.ts', 'utf8');
const sanitizer = fs.readFileSync('utils/textSanitizer.ts', 'utf8');

assert(settings.includes('额外功能: 额外功能设置'), '游戏设置必须包含额外功能设置。');
assert(settings.includes("words: ['极其']"), '污染词清理默认必须包含“极其”。');
assert(settings.includes('归一化额外功能设置'), '旧存档必须能归一化额外功能设置。');
assert(settingsModal.includes("'extra'"), '设置弹窗必须新增额外功能 tab。');
assert(settingsModal.includes('ExtraFeaturesSettingsTab'), '设置弹窗必须渲染额外功能页。');
assert(extraTab.includes('污染词清理') && extraTab.includes('极其'), '额外功能页必须提供污染词清理配置。');
assert(settingsPlanes.includes('extraFeatures: settings.额外功能') && settingsPlanes.includes('额外功能: story.extraFeatures'), '额外功能必须通过 typed story policy 拆分与还原。');
assert(useGameState.includes('composeSettings'), '启动必须从 typed settings planes 还原额外功能。');
assert(!saveLoadWorkflow.includes('save.gameSettings'), '读档不得从旧 save.gameSettings 恢复设备设置。');
assert(sendWorkflow.includes('sanitizeParsedResponse(result.parsed, input.settings.额外功能)'), '主回复落地前必须清理 parsedResponse。');
assert(sendWorkflow.includes('sanitizeContaminatedText(normalizedBody, input.settings.额外功能)'), '正文进入历史前必须清理污染词。');
assert(sendWorkflow.includes('input.finalized.parsed.variableDraft'), '变量模型必须读取清理后的变量草稿。');
assert(sendWorkflow.includes('input.parsed.worldEvents'), '动态世界必须读取清理后的世界事件。');
assert(sanitizer.includes('next = next.split(word).join'), '污染词清理必须从文本中删除命中的词。');
assert(sanitizer.includes('if (!config?.enabled) return text'), '关闭污染词清理时不得改写文本。');
for (const field of ['thinking', 'body', 'memory', 'variableDraft', 'storyPlan', 'worldEvents', 'actionOptions', 'rawText']) {
  assert(sanitizer.includes(field), `sanitizeParsedResponse 必须清理 ${field}。`);
}

console.log('extra features regression ok');
