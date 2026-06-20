import fs from 'node:fs';

const source = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const chatSource = fs.readFileSync('models/chat.ts', 'utf8');
const turnItemSource = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const saveLoadSource = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const newsSource = fs.readFileSync('hooks/useGame/newsWorkflow.ts', 'utf8');
const settingsSource = fs.readFileSync('models/settings.ts', 'utf8');
const dbSource = fs.readFileSync('services/dbService.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('function cloneForSnapshot'), 'sendWorkflow 必须保留快照深拷贝函数。');
assert(source.includes('structuredClone'), '快照应优先使用 structuredClone，避免引用污染。');
assert(source.includes('旅人: cloneForSnapshot(state.旅人)'), 'preTurnSnapshot.旅人 必须深拷贝。');
assert(source.includes('记忆: cloneForSnapshot(state.记忆)'), 'preTurnSnapshot.记忆 必须深拷贝。');
assert(source.includes('忆庭: cloneForSnapshot(state.忆庭)'), 'preTurnSnapshot.忆庭 必须深拷贝。');
assert(source.includes('手机: cloneForSnapshot(state.手机)'), 'preTurnSnapshot.手机 必须深拷贝。');
assert(source.includes('新闻: cloneForSnapshot(state.新闻)'), 'preTurnSnapshot.新闻 必须深拷贝。');
assert(source.includes('剧情编织: cloneForSnapshot(state.剧情编织)'), 'preTurnSnapshot.剧情编织 必须深拷贝。');
assert(source.includes('variableBatches: cloneForSnapshot(state.variableBatches)'), 'preTurnSnapshot.variableBatches 必须深拷贝。');
assert(!source.includes('state.setPendingVariable(false);\n\n      const npcSource'), '变量模型结束后不得提前解除后台结算锁。');
assert(source.includes('const assertWorkflowActive = () =>'), '后台结算阶段必须有当前工作流闸门。');
assert(source.includes('assertWorkflowActive();\n    mem = compression.memory'), '记忆压缩 await 后必须检查当前工作流，避免旧记忆写回。');
assert(source.includes('shouldCommit: isCurrentWorkflow'), '新闻/变量等子流程必须接收当前工作流提交闸门。');
assert(/assertWorkflowActive\(\);\s*const turnRecallEntry = turnRecallEntryResult\.entry;/.test(source), '忆庭入库前必须检查当前工作流，避免重roll后旧纪要写回。');
assert(source.includes('turnCount: state.turnCount + 1'), '自动存档必须保存真实 turnCount。');
assert(source.includes('# 重roll生成约束'), '重roll请求必须注入避重复约束。');
assert(source.includes('重roll nonce'), '重roll请求必须带 nonce，避免同上下文确定性复刻。');
assert(source.includes('function normalizeRerollCompareText'), '重roll必须规范化正文用于相似度检测。');
assert(source.includes('function calculateRerollSimilarity'), '重roll必须计算上一版与新版的相似度。');
assert(source.includes('function buildRerollGenerationGuard'), '重roll必须在消息尾部追加强避重复约束。');
assert(source.includes('function buildRerollSimilarityRetryGuard'), '重roll相似时必须追加自动换写提示。');
assert(source.includes('apiMessages.push(创建聊天消息(\n        \'user\',\n        buildRerollGenerationGuard'), '重roll强约束必须作为最后 user 消息进入主请求。');
assert(source.includes('calculateRerollSimilarity(candidateText, deps.rerollContext.previousResponse)'), '主剧情必须对重roll候选正文做相似度校验。');
assert(source.includes('rerollSimilarity >= 0.86'), '重roll相似度阈值必须锁定，防止一模一样回复放行。');
assert(source.includes('buildRerollSimilarityRetryGuard(deps.rerollContext.previousResponse, rerollSimilarity)'), '重roll过像时必须追加换写守卫后重试。');
assert(source.includes('重roll结果与上一版过于相似，正在强制换写。'), '重roll过像时必须在队列中提示正在强制换写。');
assert(source.includes('(deepSeekMainActive || deps.rerollContext) ? Math.max(2, configuredMaxAttempts)'), '重roll即使未开启自动重试，也必须至少保留一次换写重试机会。');
assert(chatSource.includes('rerollSimilarity?: number') && chatSource.includes('rerollSimilarityRetried?: boolean'), '聊天 debugContext 必须保存重roll相似度诊断。');
assert(turnItemSource.includes('重roll相似度') && turnItemSource.includes('重roll自动换写'), '请求上下文必须展示重roll相似度与自动换写状态。');
assert(useGameSource.includes('rerollContextRef'), 'useGame 必须保存一次性重roll上下文。');
assert(useGameSource.includes('previousResponse'), 'reroll 必须记录上一版回复摘录供避重复。');
assert(useGameSource.includes('onAfterSend: () => {\n          rerollContextRef.current = null;'), '重roll上下文必须在发送结束后清空。');
assert(useGameSource.includes('state.loading || state.pendingVariable'), '重roll入口必须在后台结算期间硬阻止。');
assert(newsSource.includes('shouldCommit?: () => boolean'), '新闻子流程必须支持提交闸门。');
assert(newsSource.includes('params.shouldCommit?.() === false'), '新闻子流程写入前必须检查提交闸门。');
assert(settingsSource.includes('turnCount?: number'), '存档数据必须持久化真实 turnCount。');
assert(saveLoadSource.includes('turnCount: overrides?.turnCount ?? state.turnCount'), '保存负载必须写入真实 turnCount。');
assert(!saveLoadSource.includes('delete clean.preTurnSnapshot'), '本地存档必须保留最新 preTurnSnapshot，读档后立即重roll才能完整回滚变量切片。');
assert(saveLoadSource.includes('state.setTurnCount(save.turnCount ?? (safeChatHistory.length + 1))') || saveLoadSource.includes('state.setTurnCount(save.turnCount ?? (save.chatHistory.length + 1))'), '读档必须优先恢复真实 turnCount。');
assert(dbSource.includes('turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1)'), '存档摘要必须优先显示真实 turnCount。');

console.log('reroll regression ok');
