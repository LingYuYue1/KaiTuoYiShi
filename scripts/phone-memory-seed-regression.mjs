import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const queueTask = fs.readFileSync('models/queueTask.ts', 'utf8');
const drawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');

assert(phoneModal.includes('commitPhoneMemory = async'), '手机 UI 必须有通讯摘要回写记忆函数。');
assert(phoneModal.includes('{ force: true }'), '每次手机回复都必须强制回写一条可承接摘要，不能只等压缩阈值。');
assert(phoneModal.includes("手机${activeChat.type === 'group'"), '玩家主动手机聊天必须把会话对象写进摘要。');
assert(phoneModal.includes('主动来信「${seed.title}」'), '主动来信生成后也必须回写记忆摘要。');
assert(phoneModal.includes('onNpcRecordsChange'), '私聊摘要必须能写回对应 NPC 同行记忆。');
assert(phoneModal.includes("来源: '手机'"), '手机写入 NPC 同行记忆时来源必须标记为手机。');

assert(sendWorkflow.includes('function buildFallbackPhoneSeed'), '主流程必须有低频主动来信兜底种子。');
assert(sendWorkflow.includes('没有待处理来信') || sendWorkflow.includes("seed.status === 'pending'"), '兜底来信必须检查待处理种子，避免刷屏。');
assert(sendWorkflow.includes('phoneAfterFallbackSeed'), '主流程必须把兜底来信写入手机状态并用于自动存档。');
assert(sendWorkflow.includes("pushQueueTask(state, 'phone'"), '手机兜底种子必须进入后台队列提示。');
assert(sendWorkflow.includes("priority: 'low'"), '兜底主动来信必须默认低优先级。');

assert(variableFacts.includes('relatedNpcIds = Array.from(new Set'), 'phone_seed 必须补齐 relatedNpcIds，便于联系人/NPC 关联。');
assert(variableModel.includes('手机不能长期沉默') || variableModel.includes('低频跟进'), '变量模型提示词必须要求审计低频主动来信。');
assert(variableWorldbook.includes('手机不能长期沉默'), '变量世界书必须要求审计低频主动来信。');
assert(queueTask.includes("'phone'"), '队列任务类型必须包含 phone。');
assert(drawer.includes("latestTaskById.get('phone')"), '处理队列必须展示手机来信任务。');

console.log('phone memory and seed regression ok');
