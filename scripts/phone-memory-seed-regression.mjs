import fs from 'node:fs';
import { readTurnWorkflowSource } from './lib/turn-workflow-source.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const phoneCommands = fs.readFileSync('src/kernel/application/executePhoneCommand.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const sendWorkflow = readTurnWorkflowSource();
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableOutputFormat = fs.readFileSync('prompts/cot/variableOutputFormat.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const phoneCot = fs.readFileSync('prompts/cot/phoneCot.ts', 'utf8');
const phoneOutputFormat = fs.readFileSync('prompts/cot/phoneOutputFormat.ts', 'utf8');
const phoneWorldbook = fs.readFileSync('data/phoneWorldbook.ts', 'utf8');
const builtinPromptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const queueTask = fs.readFileSync('models/queueTask.ts', 'utf8');
const drawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');

assert(!sendWorkflow.includes('buildFallbackPhoneSeed'), '主流程不得凭隐藏默认逻辑制造手机来信种子。');

assert(variableFacts.includes('hasRecentNonUrgentPhoneSeed'), 'variable phone_seed facts must also respect a global low-frequency cooldown.');
assert(variableFacts.includes("priority === 'low' || priority === 'normal'"), 'global phone_seed cooldown must apply only to low/normal priority seeds.');
assert(variableFacts.includes("seed.priority === 'urgent' || seed.priority === 'high'"), 'global phone_seed cooldown must not block high/urgent seeds.');
assert(variableFacts.includes('relatedNpcIds = Array.from(new Set'), 'phone_seed facts must backfill relatedNpcIds for contact/NPC association.');
assert(variableFacts.includes('hasRecentSimilarPhoneSeed(phone'), 'variable phone_seed writes must reject recent duplicate target/event seeds.');

assert(phoneCommands.includes('commitMemory('), 'phone kernel command must write communication summaries back to memory.');
assert(phoneCommands.includes('compressNpcMemoryLedger({'), 'phone replies must pass through NPC memory compression.');
assert(phoneCommands.includes("source: '手机'"), 'phone-origin NPC memories must be marked with the phone source.');
assert(phoneCommands.includes('function buildContacts(phone: 手机系统, npcs: readonly NPC记录[])'), 'phone contacts must be derived from current NPC authority when the address book is incomplete.');
assert(phoneCommands.includes('!contacts.some((contact) => contact.npcId === npc.id)'), 'derived contacts must not overwrite existing contacts.');

assert(phoneCommands.includes('candidate.id === seed.targetId || sameMembers'), 'group seeds must bind to an existing group when seed.targetId points to that chat.');
assert(phoneCommands.includes('contacts.find((item) => item.name === speakerName'), 'group replies must resolve speakers through current contacts.');
assert(phoneCommands.includes('const contacts = buildContacts(phoneInput, story.characters.npcs)') && phoneCommands.includes('contacts,'), 'phone reply generation must receive contacts derived from current authority.');

assert(phoneService.includes('evaluatePhoneReplyQuality'), 'phone replies must be deduped before landing.');
assert(phoneService.includes('arePhoneMessagesTooSimilar'), 'phone reply dedupe must include similarity checks, not only exact equality.');
assert(phoneService.includes('evaluatePhoneReplyQuality'), 'phone replies must be quality-filtered before landing.');
assert(phoneService.includes('throw new PhoneReplyQualityError(') && !phoneService.includes('buildPhoneQualitySupplementMessages'), 'thin or repeated replies must fail explicitly without a hidden second model call.');
assert(phoneService.includes("ctx.chat.type === 'group' ? { min: 12, max: 30 } : { min: 4, max: 8 }"), 'service-level private and group reply limits must match the product rules.');
assert(phoneService.includes('PhoneReplyQualityError'), 'two failed quality attempts must surface an explicit error.');
assert(!phoneService.includes('buildNonRepeatingPhoneFallback'), 'private replies must not use local fixed filler.');
assert(!phoneService.includes('buildGroupFallbackPhoneMessages'), 'group replies must not use local fixed filler.');
assert(phoneOutputFormat.includes('两人群聊应体现双方') && phoneOutputFormat.includes('三人及以上群聊通常至少出现 3 位不同发言者'), 'group phone prompt must adapt speaker diversity to participant count.');
assert(phoneService.includes('12-30 条'), 'group phone user prompt must require 12-30 messages.');
assert(phoneService.includes('formatPhoneGroupParticipant'), 'group phone context must list participants from NPC records or contacts.');
assert(phoneCot.includes('整个群聊总量必须为 12-30 条'), 'phone CoT must match the runtime group-chat 12-30 message rule.');
assert(phoneCot.includes('两人群聊应体现双方') && phoneCot.includes('三人及以上群聊通常至少出现 3 位不同发言者'), 'phone CoT must adapt speaker diversity to participant count.');
assert(!phoneCot.includes('整个群聊总量必须为 12-20 条'), 'phone CoT must not keep the retired 12-20 group-chat rule.');
assert(phoneWorldbook.includes('整个群聊本轮总回复量必须为 12-30 条'), 'phone worldbook must match the runtime group-chat 12-30 message rule.');
assert(phoneWorldbook.includes('两人群聊应体现双方') && phoneWorldbook.includes('三人及以上群聊通常至少出现 3 位不同发言者'), 'phone worldbook must adapt speaker diversity to participant count.');
assert(!phoneWorldbook.includes('整个群聊本轮总回复量必须为 12-20 条'), 'phone worldbook must not keep the retired 12-20 group-chat rule.');
assert(builtinPromptModules.includes('群聊 12-30 条'), 'builtin phone prompt module description must match the runtime group-chat 12-30 rule.');
assert(!builtinPromptModules.includes('群聊 12-20 条'), 'builtin phone prompt module description must not keep the retired 12-20 group-chat rule.');

assert((variableModel.includes('低频跟进') || variableOutputFormat.includes('低频跟进')) || variableModel.includes('手机不能长期沉默'), 'variable model prompt must audit low-frequency proactive phone messages.');
assert(variableWorldbook.includes('手机不能长期沉默'), 'variable worldbook must audit low-frequency proactive phone messages.');
assert(queueTask.includes("'phone'"), 'queue task types must include phone.');
assert(!drawer.includes('pendingVariable'), 'variable drawer must not reconstruct transient phone queue state outside kernel authority.');

console.log('phone memory and seed regression ok');
