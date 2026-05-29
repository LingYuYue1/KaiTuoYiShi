import fs from 'node:fs';

const source = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
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
assert(source.includes('assertWorkflowActive();\n      const turnRecallEntry = turnRecallEntryResult.entry;'), '忆庭入库前必须检查当前工作流，避免重roll后旧纪要写回。');
assert(source.includes('turnCount: state.turnCount + 1'), '自动存档必须保存真实 turnCount。');
assert(source.includes('# 重roll生成约束'), '重roll请求必须注入避重复约束。');
assert(source.includes('重roll nonce'), '重roll请求必须带 nonce，避免同上下文确定性复刻。');
assert(useGameSource.includes('rerollContextRef'), 'useGame 必须保存一次性重roll上下文。');
assert(useGameSource.includes('previousResponse'), 'reroll 必须记录上一版回复摘录供避重复。');
assert(useGameSource.includes('onAfterSend: () => {\n          rerollContextRef.current = null;'), '重roll上下文必须在发送结束后清空。');
assert(useGameSource.includes('state.loading || state.pendingVariable'), '重roll入口必须在后台结算期间硬阻止。');
assert(newsSource.includes('shouldCommit?: () => boolean'), '新闻子流程必须支持提交闸门。');
assert(newsSource.includes('params.shouldCommit?.() === false'), '新闻子流程写入前必须检查提交闸门。');
assert(settingsSource.includes('turnCount?: number'), '存档数据必须持久化真实 turnCount。');
assert(saveLoadSource.includes('turnCount: overrides?.turnCount ?? state.turnCount'), '保存负载必须写入真实 turnCount。');
assert(saveLoadSource.includes('state.setTurnCount(save.turnCount ?? (save.chatHistory.length + 1))'), '读档必须优先恢复真实 turnCount。');
assert(dbSource.includes('s.turnCount ?? ((s.chatHistory?.length ?? 0) + 1)'), '存档列表必须优先显示真实 turnCount。');

console.log('reroll regression ok');
