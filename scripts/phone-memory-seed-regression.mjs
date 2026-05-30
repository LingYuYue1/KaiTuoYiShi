import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const queueTask = fs.readFileSync('models/queueTask.ts', 'utf8');
const drawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');
assert(sendWorkflow.includes('fallbackGlobalCooldown'), 'fallback phone seeds must have a global cooldown.');
assert(sendWorkflow.includes('lastNonUrgentSeedTurn'), 'fallback phone seeds must check the most recent non-urgent seed turn.');
assert(sendWorkflow.includes("seed.priority !== 'urgent'"), 'fallback phone seed cooldown must not treat urgent seeds as ordinary low-frequency seeds.');
assert(variableFacts.includes('hasRecentNonUrgentPhoneSeed'), 'variable phone_seed facts must also respect a global low-frequency cooldown.');
assert(variableFacts.includes("priority === 'low' || priority === 'normal'"), 'global phone_seed cooldown must apply only to low/normal priority seeds.');
assert(variableFacts.includes("seed.priority === 'urgent' || seed.priority === 'high'"), 'global phone_seed cooldown must not block high/urgent seeds.');

assert(phoneModal.includes('commitPhoneMemory = async'), '手机 UI 必须有通讯摘要回写记忆函数。');
assert(phoneModal.includes('{ force: true }'), '每次手机回复都必须强制回写一条可承接摘要，不能只等压缩阈值。');
assert(phoneModal.includes("手机${activeChat.type === 'group'"), '玩家主动手机聊天必须把会话对象写进摘要。');
assert(phoneModal.includes('主动来信「${seed.title}」'), '主动来信生成后也必须回写记忆摘要。');
assert(phoneModal.includes('onNpcRecordsChange'), '私聊摘要必须能写回对应 NPC 同行记忆。');
assert(phoneModal.includes("来源: '手机'"), '手机写入 NPC 同行记忆时来源必须标记为手机。');

assert(phoneService.includes('最近已发送短讯（禁止复读或同序改写）'), '手机模型上下文必须注入最近短讯禁止复读清单。');
assert(phoneService.includes('dedupePhoneReply'), '手机回复落地前必须做结果去重，避免主动来信原样复读。');
assert(phoneService.includes('arePhoneMessagesTooSimilar'), '手机回复去重必须包含相似度判断，而不只做完全相等。');
assert(phoneService.includes('buildNonRepeatingPhoneFallback'), '手机回复全组重复时必须有不复读兜底短讯。');

assert(sendWorkflow.includes('function buildFallbackPhoneSeed'), '主流程必须有低频主动来信兜底种子。');
assert(sendWorkflow.includes('没有待处理来信') || sendWorkflow.includes("seed.status === 'pending'"), '兜底来信必须检查待处理种子，避免刷屏。');
assert(sendWorkflow.includes('phoneAfterFallbackSeed'), '主流程必须把兜底来信写入手机状态并用于自动存档。');
assert(sendWorkflow.includes("pushQueueTask(state, 'phone'"), '手机兜底种子必须进入后台队列提示。');
assert(sendWorkflow.includes("priority: 'low'"), '兜底主动来信必须默认低优先级。');
assert(sendWorkflow.includes('hasRecentSimilarPhoneSeed'), '兜底主动来信种子必须检查近期同对象同事件，避免隔几回合重复生成。');

assert(variableFacts.includes('relatedNpcIds = Array.from(new Set'), 'phone_seed 必须补齐 relatedNpcIds，便于联系人/NPC 关联。');
assert(variableFacts.includes('phone_seed 已忽略：近期已有同对象同事件的主动来信'), '变量模型写入 phone_seed 时必须拒绝近期重复事件。');
assert(variableModel.includes('手机不能长期沉默') || variableModel.includes('低频跟进'), '变量模型提示词必须要求审计低频主动来信。');
assert(variableWorldbook.includes('手机不能长期沉默'), '变量世界书必须要求审计低频主动来信。');
assert(queueTask.includes("'phone'"), '队列任务类型必须包含 phone。');
assert(drawer.includes("latestTaskById.get('phone')"), '处理队列必须展示手机来信任务。');

console.log('phone memory and seed regression ok');
