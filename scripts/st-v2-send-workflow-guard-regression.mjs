/**
 * ST V2 sendWorkflow 接入红线检查。
 *
 * 这是轻量静态回归：确保 V2 只作为旁路接入，且失败可回退 legacy。
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sendWorkflow = fs.readFileSync(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
const contextSnapshot = fs.readFileSync(path.join(root, 'hooks/useGame/contextSnapshot.ts'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'models/settings.ts'), 'utf8');
const systemPromptBuilder = fs.readFileSync(path.join(root, 'hooks/useGame/systemPromptBuilder.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sendWorkflow.includes("import { buildTavernMessageChain } from './tavernMessageChainBuilder';"), 'sendWorkflow 应显式导入 ST V2 消息链构建器');
assert(sendWorkflow.includes("import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';"), 'sendWorkflow 应通过 helper 派生当前 V2 预设');
assert(sendWorkflow.includes('const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());'), 'sendWorkflow 应在运行时派生当前 V2 预设并包含内置 V2 副本');
assert(sendWorkflow.includes('state.gameSettings.enableStPreset !== false'), 'ST V2 分流必须与 UI 一致：旧存档缺省视为开启，只有显式 false 才关闭');
assert(sendWorkflow.includes('currentPresetV2?.preset?.prompts?.length'), 'ST V2 分流必须要求有效 prompts');
assert(sendWorkflow.includes('currentPresetV2?.preset?.prompt_order?.length'), 'ST V2 分流必须要求有效 prompt_order');
assert(sendWorkflow.includes('catch (error)'), 'ST V2 构建必须有 catch 回退');
assert(sendWorkflow.includes('已回退 legacy 主剧情路径'), 'ST V2 失败必须记录回退 legacy');
assert(sendWorkflow.includes('if (tavernV2Messages)') && sendWorkflow.includes('} else {'), 'apiMessages 组装必须保留非 V2 legacy 分支');
assert(
  sendWorkflow.includes('const recentHistory = awakeningPhase')
    && sendWorkflow.includes('? getPathAwakeningHistoryWindow(updatedHistory, awakeningPhase)')
    && sendWorkflow.includes(': getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);'),
  'ST V2 必须复用当前 scope 的原生历史窗口：普通主剧情使用近期历史，狭间使用专用裁剪',
);
assert(sendWorkflow.includes('const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id);'), 'ST V2 Tavern 历史必须排除本轮用户输入，避免 chatHistory 与 userInput 重复');
const tavernBuildCall = sendWorkflow.slice(
  sendWorkflow.indexOf('tavernV2Messages = buildTavernMessageChain({'),
  sendWorkflow.indexOf('}).map((msg) => 创建聊天消息(msg.role, msg.content));', sendWorkflow.indexOf('tavernV2Messages = buildTavernMessageChain({')),
);
assert(tavernBuildCall.includes('chatHistory: insertDepthIntoHistory(tavernHistory, nativeDepthMessages)'), 'ST V2 buildTavernMessageChain 必须只接收排除本轮输入、并已按历史语义插入 depth 的 tavernHistory');
assert(tavernBuildCall.includes('includeNativeContextInWorldbook: false'), 'ST V2 叠加模式不得在 Tavern worldbook 里重复注入原生底座模块');
assert(!tavernBuildCall.includes('worldbookExtraTexts: [天气片断]'), 'ST V2 不得重复把天气片段塞进 Tavern 消息链');
assert(!tavernBuildCall.includes('chatHistory: updatedHistory') && !tavernBuildCall.includes('chatHistory: state.chatHistory'), 'ST V2 禁止向 Tavern chatHistory 传全量历史');
assert(sendWorkflow.includes('preTurnHistory: tavernV2Messages ? [] : preTurnHistory'), 'ST V2 生效时 finalizer 不得再次 prepend 原生历史');
assert(sendWorkflow.includes('const depthMessages = tavernV2Messages ? [] : nativeDepthMessages;'), 'ST V2 生效时 finalizer 不得再次插入原生 depth');
const tavernBranch = sendWorkflow.slice(
  sendWorkflow.indexOf('if (tavernV2Messages)'),
  sendWorkflow.indexOf('} else {', sendWorkflow.indexOf('if (tavernV2Messages)')),
);
assert(tavernBranch && !tavernBranch.includes("systemPrompt = ''"), 'ST V2 只能叠加 Tavern messages，不能清空原生游戏 systemPrompt');
assert(contextSnapshot.includes("import { buildTavernMessageChain } from './tavernMessageChainBuilder';"), '主剧情上下文快照必须复用 Tavern V2 消息链构建器');
assert(contextSnapshot.includes("import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';"), '主剧情上下文快照必须通过 helper 派生当前 V2 预设');
assert(contextSnapshot.includes('const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());'), '主剧情上下文快照必须包含内置 V2 预设副本');
assert(contextSnapshot.includes('state.gameSettings.enableStPreset !== false'), '主剧情上下文快照必须与真实发送保持相同的 V2 开关语义');
assert(
  contextSnapshot.includes('const recentHistory = awakeningPhase')
    && contextSnapshot.includes('? getPathAwakeningHistoryWindow(recallHistory, awakeningPhase)')
    && contextSnapshot.includes(': getMainHistoryWindow(recallHistory, state.gameSettings, state.记忆);'),
  '上下文快照中的 Tavern V2 必须与真实发送一样按 scope 复用普通或狭间专用历史窗口',
);
assert(contextSnapshot.includes('const tavernHistory = recentHistory.filter((msg, index) => {'), '主剧情上下文快照必须排除当前用户输入，避免 Tavern 预览重复');
assert(contextSnapshot.includes('chatHistory: insertDepthIntoHistory(tavernHistory, nativeDepthMessages)'), '主剧情上下文快照中的 Tavern 历史必须与真实发送一样先插入 depth');
assert(contextSnapshot.includes('preTurnHistory: tavernStatus.used ? [] : preTurnHistory'), '主剧情上下文快照在 Tavern V2 生效时不得再次 prepend 原生历史');
assert(contextSnapshot.includes('includeNativeContextInWorldbook: false'), '主剧情上下文快照必须标记 Tavern 叠加模式不重复注入原生底座模块');
assert(contextSnapshot.includes('酒馆预设消息链') && contextSnapshot.includes('tavern_preset_message_chain'), '主剧情上下文快照必须把 Tavern V2 messages 单独显示为酒馆预设消息链');
assert(contextSnapshot.includes('额外 API messages') && contextSnapshot.includes('原生游戏底座 systemPrompt 仍会完整发送'), '主剧情上下文快照必须明确标记 V2 是叠加模式，原生游戏底座仍发送');
assert(contextSnapshot.includes('只使用原生近期历史窗口') && contextSnapshot.includes('排除当前用户输入'), '主剧情上下文快照必须说明 Tavern chatHistory 不再使用全量历史且不重复本轮输入');
assert(systemPromptBuilder.includes('settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2)'), 'V2 选中时必须过滤 legacy st_import_* 模块，避免 V1/V2 重复注入');
assert(systemPromptBuilder.includes('避免同一份 ST 预设以 V1 模块和 V2 消息链两种形态重复注入'), 'systemPromptBuilder 必须记录 V2 与 legacy V1 模块隔离原因');
assert(settings.includes('currentStPresetIdV2: null'), '默认设置不得自动激活 ST V2 预设');
assert(!settings.includes('currentStPreset: null'), 'settings 不应持久化 currentStPreset 缓存');

console.log('✓ ST V2 sendWorkflow 旁路接入红线检查通过');
