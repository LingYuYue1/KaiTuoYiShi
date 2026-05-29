import fs from 'node:fs';

const appSource = fs.readFileSync('App.tsx', 'utf8');
const saveLoadSource = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const sendWorkflowSource = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const allSources = [
  appSource,
  saveLoadSource,
  useGameSource,
  sendWorkflowSource,
  fs.readFileSync('hooks/useGameState.ts', 'utf8'),
].join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!allSources.includes('phoneSystemState'), '手机运行时数据不得写入或读取全局 phoneSystemState，避免多存档聊天/通讯录互串。');
assert(!saveLoadSource.includes('mergePhoneSystems'), '读档不得把目标存档手机与外部手机状态合并。');
assert(saveLoadSource.includes('state.set手机(归一化手机系统(save.手机))'), '读档手机状态必须只来自目标存档本身。');
assert(saveLoadSource.includes('state.set智库(归一化智库系统(save.智库 ?? { 条目: [] }))'), '旧存档缺智库时必须用空智库兜底，不能沿用当前运行态。');
assert(!saveLoadSource.includes('save.智库 ?? state.智库'), '读档不得用当前运行态智库兜底。');
assert(saveLoadSource.includes('state.setNPC(归一化NPC记录列表(save.NPC))'), '读档 NPC 必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('state.set新闻(归一化新闻列表(save.新闻))'), '读档新闻必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('state.setVariableBatches(save.variableBatches ?? [])'), '读档变量批次必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('state.setQueueTasks(save.queueTasks ?? [])'), '读档后台队列必须来自目标存档或空列表兜底。');
assert(appSource.includes('onPhoneChange={state.set手机}'), '手机 UI 修改只能进入当前运行态，不能写全局手机备份。');

console.log('save isolation regression ok');
