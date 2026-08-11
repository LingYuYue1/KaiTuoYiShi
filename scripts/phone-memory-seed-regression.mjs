import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
// 全项目修复：手机双写编排提升为独立纯事务模块（services/phoneMemoryDualWrite.ts），
// 手机来源标记等行为要求不变，仅实现位置迁移。
const phoneDualWrite = fs.readFileSync('services/phoneMemoryDualWrite.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
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

assert(sendWorkflow.includes('fallbackGlobalCooldown'), 'fallback phone seeds must have a global cooldown.');
assert(sendWorkflow.includes('lastNonUrgentSeedTurn'), 'fallback phone seeds must check the most recent non-urgent seed turn.');
assert(sendWorkflow.includes("seed.priority !== 'urgent'"), 'fallback phone seed cooldown must not treat urgent seeds as ordinary low-frequency seeds.');
assert(sendWorkflow.includes('function buildFallbackPhoneSeed'), 'main workflow must keep low-frequency fallback phone seeds.');
assert(sendWorkflow.includes("seed.status === 'pending'"), 'fallback phone seeds must check pending seeds to avoid spam.');
assert(sendWorkflow.includes('phoneAfterFallbackSeed'), 'main workflow must write fallback phone seeds into phone state.');
assert(sendWorkflow.includes("pushQueueTask(state, 'phone'"), 'fallback phone seeds must surface in the background task queue.');
assert(sendWorkflow.includes("priority: 'low'"), 'fallback phone seeds must be low priority by default.');
assert(sendWorkflow.includes('hasRecentSimilarPhoneSeed'), 'fallback phone seeds must avoid recently repeated target/event combinations.');

assert(variableFacts.includes('hasRecentNonUrgentPhoneSeed'), 'variable phone_seed facts must also respect a global low-frequency cooldown.');
assert(variableFacts.includes("priority === 'low' || priority === 'normal'"), 'global phone_seed cooldown must apply only to low/normal priority seeds.');
assert(variableFacts.includes("seed.priority === 'urgent' || seed.priority === 'high'"), 'global phone_seed cooldown must not block high/urgent seeds.');
assert(variableFacts.includes('relatedNpcIds = Array.from(new Set'), 'phone_seed facts must backfill relatedNpcIds for contact/NPC association.');
assert(variableFacts.includes('hasRecentSimilarPhoneSeed(phone'), 'variable phone_seed writes must reject recent duplicate target/event seeds.');

assert(phoneModal.includes('commitPhoneMemory = async'), 'phone UI must write communication summaries back to memory.');
// 每次手机回复必须至少强制一次摘要落盘（force 语义保留，随 operationSourceId 一起传入）。
assert(phoneModal.includes('force: true') && phoneModal.includes('operationSourceId'), 'each phone reply must force at least one handoff summary.');
assert(phoneModal.includes('onNpcRecordsChange'), 'private chat summaries must be able to write back to NPC companion memories.');
assert((phoneModal + phoneDualWrite).includes("来源: '手机'"), 'phone-origin NPC memories must be marked with the phone source.');
assert(phoneModal.includes('FALLBACK_STORY_CONTACTS'), 'phone contacts must have story fallback contacts when the address book is empty.');
assert(phoneModal.includes('buildFallbackContactsFromStory'), 'phone fallback contacts must be inferred from recent story/location context.');
assert(phoneModal.includes('mainChatHistory') && phoneModal.includes('existingContacts: phone.contacts'), 'fallback contacts must rescue empty old saves without overwriting existing contacts.');

assert(phoneModal.includes('groupByTargetId'), 'group seeds must bind to an existing group when seed.targetId points to that chat.');
assert(phoneModal.includes('fallbackGroupSpeakers'), 'group replies must have speaker fallback when the model omits a resolvable name prefix.');
assert(phoneModal.includes('index % Math.max(1, fallbackGroupSpeakers.length)'), 'group speaker fallback must rotate through participants.');
assert(phoneModal.includes('contacts,'), 'phone reply generation must receive contacts so group participants can resolve from the address book.');

assert(phoneService.includes('evaluatePhoneReplyQuality'), 'phone replies must be deduped before landing.');
assert(phoneService.includes('arePhoneMessagesTooSimilar'), 'phone reply dedupe must include similarity checks, not only exact equality.');
assert(phoneService.includes('evaluatePhoneReplyQuality'), 'phone replies must be quality-filtered before landing.');
assert(phoneService.includes('buildPhoneQualitySupplementMessages'), 'thin or repeated replies must use one targeted model supplement.');
assert(phoneService.includes("ctx.chat.type === 'group' ? { min: 12, max: 30 } : { min: 4, max: 8 }"), 'service-level private and group reply limits must match the product rules.');
assert(phoneService.includes('PhoneReplyQualityError'), 'two failed quality attempts must surface an explicit error.');
assert(!phoneService.includes('buildNonRepeatingPhoneFallback'), 'private replies must not use local fixed filler.');
assert(!phoneService.includes('buildGroupFallbackPhoneMessages'), 'group replies must not use local fixed filler.');
assert(phoneOutputFormat.includes('两人群聊应体现双方') && phoneOutputFormat.includes('三人及以上群聊通常至少出现 3 位不同发言者'), 'group phone prompt must adapt speaker diversity to participant count.');
assert(phoneService.includes('12-30 条'), 'group phone user prompt must require 12-30 messages.');
assert(phoneService.includes('formatPhoneGroupParticipant'), 'group phone context must list participants from NPC records or contacts.');
// 批次6(2026-07-26): 条数规则三处复写收敛为 phoneOutputFormat 单一权威;cot/worldbook 改引用行。
assert(phoneCot.includes('以「手机系统输出格式」模块为唯一权威') || phoneCot.includes('按「手机系统输出格式」模块'), 'phone CoT must defer count rules to the output-format authority.');
assert(!phoneCot.includes('12-30 条') && !phoneCot.includes('12-20 条'), 'phone CoT must not duplicate the group-chat count rule.');
assert(phoneWorldbook.includes('以「手机系统输出格式」模块为唯一权威') || phoneWorldbook.includes('按「手机系统输出格式」模块'), 'phone worldbook must defer count rules to the output-format authority.');
assert(!phoneWorldbook.includes('12-30 条') && !phoneWorldbook.includes('12-20 条'), 'phone worldbook must not duplicate the group-chat count rule.');
assert(builtinPromptModules.includes('群聊 12-30 条'), 'builtin phone prompt module description must match the runtime group-chat 12-30 rule.');
assert(!builtinPromptModules.includes('群聊 12-20 条'), 'builtin phone prompt module description must not keep the retired 12-20 group-chat rule.');

assert((variableModel.includes('低频跟进') || variableOutputFormat.includes('低频跟进')) || variableModel.includes('手机不能长期沉默'), 'variable model prompt must audit low-frequency proactive phone messages.');
assert(variableWorldbook.includes('手机不能长期沉默'), 'variable worldbook must audit low-frequency proactive phone messages.');
assert(queueTask.includes("'phone'"), 'queue task types must include phone.');
assert(drawer.includes("latestTaskById.get('phone')"), 'variable drawer must display phone queue tasks.');

console.log('phone memory and seed regression ok');
