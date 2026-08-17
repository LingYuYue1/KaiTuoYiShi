import fs from 'node:fs';

function readSource(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('hooks/useGame/sendWorkflow.ts');
const useGameSource = readSource('hooks/useGame.ts');
const chatSource = readSource('models/chat.ts');
const turnItemSource = readSource('components/features/Chat/TurnItem.tsx');
const saveLoadSource = readSource('hooks/useGame/saveLoadWorkflow.ts');
const newsSource = readSource('hooks/useGame/newsWorkflow.ts');
const settingsSource = readSource('models/settings.ts');
const dbSource = readSource('services/dbService.ts');
const compactorSource = readSource('utils/saveRuntimeCompactor.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('const preTurnSnapshot = compactPreTurnSnapshot({'), 'sendWorkflow 必须先构建轻量回滚快照。');
assert(!source.includes('cloneForSnapshot(state.相册)'), 'sendWorkflow 不得在压缩前完整深拷贝相册图片。');
assert(compactorSource.includes('new WeakMap<object, unknown>()'), '快照压缩必须使用 WeakMap 隔离重复对象引用。');
assert(compactorSource.includes('const compacted = compactDataImages({'), '快照必须对整个初步状态递归移除大型运行数据。');
assert(!compactorSource.includes('structuredClone'), '快照压缩不得在递归独立复制后再次深拷贝。');
assert(compactorSource.includes('return compacted;'), '快照压缩必须直接返回一次性独立复制结果。');
assert(!source.includes('state.setPendingVariable(false);\n\n      const npcSource'), '变量模型结束后不得提前解除后台结算锁。');
assert(source.includes('const assertWorkflowActive = () =>'), '后台结算阶段必须有当前工作流闸门。');
assert(/assertWorkflowActive\(\);\s+mem = compression\.memory/.test(source), '记忆压缩 await 后必须检查当前工作流，避免旧记忆写回。');
assert(source.includes('shouldCommit: isCurrentWorkflow'), '新闻/变量等子流程必须接收当前工作流提交闸门。');
assert(/assertWorkflowActive\(\);\s+state\.set忆庭\(yitingAfterTurnRecall\)/.test(source), '忆庭回忆档案提交前必须检查当前工作流，避免重roll后旧回忆写回。');
assert(source.includes('turnCount: state.turnCount + 1'), '自动存档必须保存真实 turnCount。');
// 工作包G：初始重 Roll 只保留尾部 buildRerollGenerationGuard（B5）一份，system 侧 A2 已删除
assert(!source.includes('# 重roll生成约束'), '重roll system 侧重复约束（A2）必须已删除。');
assert(source.includes('重roll nonce'), '重roll请求必须带 nonce，避免同上下文确定性复刻。');
assert(source.includes('function normalizeRerollCompareText'), '重roll必须规范化正文用于相似度检测。');
assert(source.includes('function calculateRerollSimilarity'), '重roll必须计算上一版与新版的相似度。');
assert(source.includes('function buildRerollGenerationGuard'), '重roll必须在消息尾部追加强避重复约束。');
assert(source.includes('function buildRerollSimilarityRetryGuard'), '重roll相似时必须追加自动换写提示。');
// 工作包C：重roll守卫经 turnConstraints 进入分层 finalizer（任务序列之前）
const constraintsStart = source.indexOf('const turnConstraints: 聊天消息[] = [];');
const rerollTail = source.indexOf('buildRerollGenerationGuard(deps.rerollContext.nonce', constraintsStart);
const finalizeCall = source.indexOf('const finalizedMainRequest = finalizeMainRequest({');
assert(
  constraintsStart >= 0
  && rerollTail > constraintsStart
  && finalizeCall > rerollTail,
  '重roll强约束必须经 turnConstraints 进入统一请求最终化器（任务序列之前）。',
);
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
assert(
  useGameSource.includes('state.loading || state.pendingVariable')
  || useGameSource.includes('s.loading || s.pendingVariable'),
  '重roll入口必须在后台结算期间硬阻止。',
);
assert(newsSource.includes('shouldCommit?: () => boolean'), '新闻子流程必须支持提交闸门。');
assert(newsSource.includes('params.shouldCommit?.() === false'), '新闻子流程写入前必须检查提交闸门。');
assert(settingsSource.includes('turnCount?: number'), '存档数据必须持久化真实 turnCount。');
assert(saveLoadSource.includes('turnCount: overrides?.turnCount ?? state.turnCount'), '保存负载必须写入真实 turnCount。');
assert(!saveLoadSource.includes('delete clean.preTurnSnapshot'), '本地存档必须保留最新 preTurnSnapshot，读档后立即重roll才能完整回滚变量切片。');
assert(saveLoadSource.includes('state.setTurnCount(save.turnCount ?? (safeChatHistory.length + 1))') || saveLoadSource.includes('state.setTurnCount(save.turnCount ?? (save.chatHistory.length + 1))'), '读档必须优先恢复真实 turnCount。');
assert(dbSource.includes('turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1)'), '存档摘要必须优先显示真实 turnCount。');

// ── 主剧情生成失败后重 roll 不多回退一回合 ──
// user 消息必须携带 preTurnSnapshot，这样生成失败时重 roll 能只砍孤立 user
assert(source.includes('preTurnSnapshot,\n    });') || source.includes('preTurnSnapshot,'), 'sendWorkflow 创建 user 消息时必须携带 preTurnSnapshot，确保生成失败时重 roll 能找到快照。');
// assistant 成功后必须清掉 user 上的 snapshot，避免存档膨胀
assert(source.includes('assistant 消息已携带 preTurnSnapshot，清掉 user 消息上的'), 'assistant 成功后必须清掉 user 消息上的 preTurnSnapshot，避免存档膨胀。');
// handleReroll 必须检测末尾孤立 user 的情况
assert(useGameSource.includes('最后一条是 user 且没有对应的 assistant'), 'handleReroll 必须检测末尾孤立 user（主剧情生成失败）的情况。');
assert(useGameSource.includes('已回滚到本回合发送前'), '孤立 user 重 roll 提示必须是"本回合"，不能误写"上一回合"。');
assert(useGameSource.includes('rerollContextRef.current = null;'), '生成失败的重 roll 不需要 rerollContext（没有上一版回复可比对）。');

console.log('reroll regression ok');
