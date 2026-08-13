/**
 * ST V2 preset integration regression.
 *
 * This script ties together the focused ST/Tavern regressions and adds a
 * static isolation check: Tavern V2 must stay on the main-story side path and
 * must not leak into independent calibration systems.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const node = process.execPath;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runScript(script) {
  const result = spawnSync(node, [path.join(root, script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  assert(result.status === 0, `${script} failed with exit code ${result.status}`);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const focusedRegressions = [
  'scripts/st-preset-import-regression.mjs',
  'scripts/st-preset-migration-regression.mjs',
  'scripts/tavern-message-chain-regression.mjs',
  'scripts/tavern-regex-processor-regression.mjs',
  'scripts/response-parser-surface-cleanup-regression.mjs',
  'scripts/builtin-tavern-preset-surface-audit.mjs',
  'scripts/st-v2-ui-edit-export-regression.mjs',
  'scripts/st-v2-send-workflow-guard-regression.mjs',
  'scripts/builtin-presets-v2-regression.mjs',
  'scripts/builtin-tavern-v2-message-chain-regression.mjs',
  'scripts/builtin-shuangrenchenghang-format-guard-regression.mjs',
];

for (const script of focusedRegressions) {
  runScript(script);
}

const settings = read('models/settings.ts');
assert(!settings.includes('stCharCardDescription'), 'settings must not restore a player-editable character-card description field');
assert(settings.includes('prompt_order.character_id 顺序槽位，不代表本项目角色卡'), 'currentStCharacterId must be documented as an order slot, not a role-card id');

const promptTab = read('components/features/Settings/PromptModulesTab.tsx');
assert(!promptTab.includes('AI 审查报告'), 'external AI review UI must remain removed');
assert(promptTab.includes('本地审查') && promptTab.includes('world_info') && promptTab.includes('regex_scripts'), 'local review must cover world_info and regex_scripts');
assert(promptTab.includes('预设世界书') && promptTab.includes('patchWorldInfoEntry'), 'Tavern preset UI must expose per-entry world_info management');

const parser = read('utils/stPresetParser.ts');
assert(parser.includes('parseSTPresetV2'), 'V2 parser entry must exist');
assert(parser.includes('parseSTWorldInfoEntries'), 'V1 compatibility parser must keep migrating world_info entries');

const responseParser = read('services/ai/responseParser.ts');
assert(responseParser.includes('stripStSurfaceNoiseFromBody'), 'response parser must clean ST Markdown headings and helper tags from landed body text');
assert(responseParser.includes('### 正文') === false, 'response parser should clean heading patterns generically instead of hardcoding one sample output');

const messageBuilder = read('hooks/useGame/tavernMessageChainBuilder.ts');
assert(messageBuilder.includes('buildTavernCharRuntimeProfile'), '{{char}} must be handled by the project runtime compatibility layer');
assert(messageBuilder.includes('processMacros'), 'enabled prompt_order entries must run through the macro engine');
assert(messageBuilder.includes('buildPresetWorldInfoText'), 'matched ST world_info must be injected through the Tavern message chain');

const contextSnapshot = read('hooks/useGame/contextSnapshot.ts');
assert(contextSnapshot.includes('buildTavernMessageChain'), 'main context snapshot must preview Tavern V2 API messages when active');
assert(contextSnapshot.includes('酒馆预设状态'), 'main context snapshot must show Tavern V2 activation diagnostics');
assert(contextSnapshot.includes('原生游戏底座 systemPrompt 仍会完整发送'), 'Tavern V2 snapshot must document additive mode');

const systemPromptBuilder = read('hooks/useGame/systemPromptBuilder.ts');
assert(systemPromptBuilder.includes('settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2)'), 'V2 activation must filter legacy V1 st_import modules from native systemPrompt');
assert(systemPromptBuilder.includes('避免同一份 ST 预设以 V1 模块和 V2 消息链两种形态重复注入'), 'systemPromptBuilder must document legacy V1/V2 duplicate injection isolation');

const sendWorkflow = read('hooks/useGame/sendWorkflow.ts');
const tavernBranchStart = sendWorkflow.indexOf('if (tavernV2Messages)');
const tavernBranchEnd = sendWorkflow.indexOf('} else {', tavernBranchStart);
assert(tavernBranchStart >= 0 && tavernBranchEnd > tavernBranchStart, 'sendWorkflow must keep a Tavern V2 messages branch');
assert(!sendWorkflow.slice(tavernBranchStart, tavernBranchEnd).includes("systemPrompt = ''"), 'Tavern V2 must not replace the native game systemPrompt');
const tavernBuildCall = sendWorkflow.slice(
  sendWorkflow.indexOf('tavernV2Messages = buildTavernMessageChain({'),
  sendWorkflow.indexOf('}).map((msg) => 创建聊天消息(msg.role, msg.content));', sendWorkflow.indexOf('tavernV2Messages = buildTavernMessageChain({')),
);
assert(
  sendWorkflow.includes('const recentHistory = awakeningPhase')
    && sendWorkflow.includes('? getPathAwakeningHistoryWindow(updatedHistory, awakeningPhase)')
    && sendWorkflow.includes(': getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);'),
  'Tavern V2 must reuse the native history window selected for the active scope',
);
assert(sendWorkflow.includes('const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id);'), 'Tavern V2 must remove the current user message from Tavern history');
assert(tavernBuildCall.includes('chatHistory: insertDepthIntoHistory(tavernHistory, nativeDepthMessages)'), 'Tavern V2 must use the filtered native history window with depth inserted before the task sequence');
assert(tavernBuildCall.includes('includeNativeContextInWorldbook: false'), 'Tavern V2 additive mode must not duplicate native base prompt modules in Tavern worldbook');
assert(!tavernBuildCall.includes('worldbookExtraTexts: [天气片断]'), 'Tavern V2 must not duplicate weather text outside native systemPrompt');
assert(!tavernBuildCall.includes('chatHistory: updatedHistory') && !tavernBuildCall.includes('chatHistory: state.chatHistory'), 'Tavern V2 must not receive full chat history');
assert(sendWorkflow.includes('preTurnHistory: tavernV2Messages ? [] : preTurnHistory'), 'Tavern V2 finalization must not prepend native history a second time');
assert(contextSnapshot.includes('酒馆预设消息链') && contextSnapshot.includes('只使用原生近期历史窗口') && contextSnapshot.includes('排除当前用户输入'), 'Tavern V2 snapshot must separate preset messages and document the filtered limited history window');

const regexProcessor = read('hooks/useGame/tavernRegexProcessor.ts');
assert(regexProcessor.includes('applyTavernOutputRegexScripts') && regexProcessor.includes('isSafeOutputCleanupCandidate'), 'regex_scripts runtime must only allow the safe output-cleanup layer');
assert(regexProcessor.includes('blocked') && regexProcessor.includes('dryRunTavernRegexScript'), 'high-risk regex_scripts must stay behind the safety/dry-run layer');

const independentSystemFiles = [
  'services/ai/phoneService.ts',
  'services/ai/variableModel.ts',
  'services/storyWeaving.ts',
  'services/ai/zhikuService.ts',
  'services/ai/yitingService.ts',
];

for (const file of independentSystemFiles) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const source = read(file);
  assert(!source.includes('tavernMessageChainBuilder'), `${file} must not import Tavern message chain builder`);
  assert(!source.includes('buildTavernMessageChain'), `${file} must not call Tavern message chain builder`);
  assert(!source.includes('stPresetsV2'), `${file} must not depend on ST V2 preset storage`);
}

console.log('✓ ST V2 preset integration regression passed');
