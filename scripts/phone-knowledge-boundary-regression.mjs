import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

async function importBundled(entryPoint) {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@': process.cwd() },
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const phoneService = await importBundled('services/ai/phoneService.ts');

const modules = [
  { id: 'builtin_phone_worldbook', content: 'BUILTIN_PHONE', enabled: true, scope: ['calibration'], order: 10 },
  { id: 'custom_phone_custom_1', content: 'CUSTOM_PHONE_SENTINEL', enabled: true, scope: ['calibration'], order: 20 },
  { id: 'st_import_phone_custom_1', content: 'ST_PHONE_SENTINEL', enabled: true, scope: ['calibration'], order: 30 },
  { id: 'custom_news_custom_1', content: 'NEWS_MODULE_LEAK', enabled: true, scope: ['calibration'], order: 40 },
  { id: 'custom_phone_disabled', content: 'DISABLED_PHONE_LEAK', enabled: false, scope: ['calibration'], order: 50 },
];
const moduleSection = phoneService.buildPhonePromptModulesSection(modules);
assert(moduleSection.includes('CUSTOM_PHONE_SENTINEL'));
assert(moduleSection.includes('ST_PHONE_SENTINEL'));
assert(!moduleSection.includes('NEWS_MODULE_LEAK'));
assert(!moduleSection.includes('DISABLED_PHONE_LEAK'));

const npcMarch = {
  id: 'npc-march',
  姓名: '三月七',
  别名: '三月',
  阶位: 'companion',
  好感度: 40,
  关系: 'friend',
  同行: false,
  初见回合: 1,
  最近回合: 8,
  当前关系阶段: '熟悉的伙伴',
  最近互动: 'MARCH_RECENT_INTERACTION',
  对玩家长期印象: 'MARCH_LONG_TERM_IMPRESSION',
  共同经历: ['MARCH_SHARED_EXPERIENCE'],
  必须记得: ['MARCH_MUST_REMEMBER'],
  未完成事项: [],
  同行记忆: [{ id: 'march-memory', 回合: 8, 摘要: 'MARCH_PRIVATE_MEMORY', 来源: '正文' }],
  总结记忆: [{ id: 'march-summary', 摘要: 'MARCH_SUMMARY_MEMORY' }],
  备注: [],
};
const npcKafka = {
  ...npcMarch,
  id: 'npc-kafka',
  姓名: '卡芙卡',
  别名: undefined,
  最近互动: 'KAFKA_PRIVATE_INTERACTION',
  同行记忆: [{ id: 'kafka-memory', 回合: 8, 摘要: 'KAFKA_PRIVATE_MEMORY', 来源: '正文' }],
  总结记忆: [],
};
const npcDan = {
  ...npcMarch,
  id: 'npc-dan',
  姓名: '丹恒',
  别名: undefined,
  最近互动: 'DAN_RECENT_INTERACTION',
  同行记忆: [{ id: 'dan-memory', 回合: 8, 摘要: 'DAN_PRIVATE_MEMORY', 来源: '正文' }],
  总结记忆: [],
};

function storyMessage(id, role, content, body = '') {
  return {
    id,
    role,
    content,
    timestamp: Number(id.replace(/\D/g, '')) || 1,
    parsedResponse: role === 'assistant' ? { body } : undefined,
  };
}

const mainChatHistory = [
  storyMessage('u0', 'user', '三月七 OLD_PLAYER_CONTEXT'),
  storyMessage('a0', 'assistant', 'old', '三月七 OLD_TOO_OLD'),
  storyMessage('u1', 'user', 'UNRELATED_PLAYER_SECRET'),
  storyMessage('a1', 'assistant', 'unrelated', 'UNRELATED_MAIN_SECRET'),
  storyMessage('u2', 'user', '和三月聊聊'),
  storyMessage('a2', 'assistant', 'matched', 'SAFE_BEFORE\n三月和玩家在车厢拍照 MATCHED_STORY_EVENT\nSAFE_AFTER\nPRIVATE_FAR_FROM_MATCH'),
  storyMessage('u3', 'user', '卡芙卡出现了'),
  storyMessage('a3', 'assistant', 'kafka', '卡芙卡 NON_PARTICIPANT_STORY_SECRET'),
  storyMessage('u4', 'user', '普通行动'),
  storyMessage('a4', 'assistant', 'ordinary', 'ANOTHER_UNRELATED_SECRET'),
  storyMessage('u5', 'user', '普通行动'),
  storyMessage('a5', 'assistant', 'ordinary', 'FINAL_UNRELATED_SECRET'),
];

const privateChat = {
  id: 'chat-march',
  type: 'private',
  title: '三月七',
  participantIds: ['contact-march'],
  messages: [{ id: 'phone-1', senderId: 'npc-march', senderName: '三月七', role: 'contact', content: 'PHONE_HISTORY_SENTINEL', turn: 8, timestamp: 1 }],
  localArchive: {
    threshold: 10,
    entries: [{ id: 'local-1', turn: 8, summary: 'PHONE_LOCAL_SUMMARY', source: 'private', messageCount: 2, createdAt: 1 }],
    compressedSummaries: ['PHONE_COMPRESSED_SUMMARY'],
  },
  unread: 0,
  createdAt: 1,
  updatedAt: 1,
};

const baseContext = {
  traveler: { 姓名: '测试玩家' },
  world: { 当前日期: '测试日期', 当前地点: 'PRIVATE_PLAYER_LOCATION', 开局档案: { 玩家介入原文: 'PRIVATE_OPENING_ARCHIVE' } },
  npcRecords: [npcMarch, npcKafka],
  news: [{ id: 'news-1', 状态: 'completed', 标题: 'PUBLIC_NEWS_SENTINEL', 正文: '公开报道', 回合: 8, 类目: 'chronicle' }],
  turnCount: 8,
  chat: privateChat,
  contacts: [{ id: 'contact-march', npcId: 'npc-march', name: '三月七', available: true }],
  contact: { id: 'contact-march', npcId: 'npc-march', name: '三月七', available: true },
  mainChatHistory,
  zhiku: { 条目: [] },
  memory: { 长期记忆: ['GLOBAL_MEMORY_SECRET'], 中期记忆: [], 短期记忆: [], 即时记忆: [] },
  yiting: { 回忆档案: [{ 名称: 'YITING_SECRET' }] },
  storyWeaving: { 当前进度: { 当前待解问题: ['STORY_WEAVING_SECRET'] } },
  seed: {
    id: 'seed-mismatch',
    turn: 8,
    source: 'system',
    triggerType: 'event',
    priority: 'normal',
    targetType: 'private',
    targetId: 'npc-kafka',
    title: 'MISMATCHED_SEED_TITLE',
    context: 'MISMATCHED_SEED_SECRET',
    relatedNpcIds: ['npc-kafka'],
    status: 'pending',
  },
};

const contextText = phoneService.buildPhoneMessages(baseContext).map((message) => message.content).join('\n');
for (const allowed of [
  'MARCH_PRIVATE_MEMORY',
  'MARCH_SUMMARY_MEMORY',
  'MARCH_RECENT_INTERACTION',
  'MARCH_SHARED_EXPERIENCE',
  'PHONE_HISTORY_SENTINEL',
  'PHONE_LOCAL_SUMMARY',
  'PHONE_COMPRESSED_SUMMARY',
  'PUBLIC_NEWS_SENTINEL',
  'MATCHED_STORY_EVENT',
  'SAFE_BEFORE',
  'SAFE_AFTER',
]) assert(contextText.includes(allowed), `应注入：${allowed}`);

for (const blocked of [
  'GLOBAL_MEMORY_SECRET',
  'YITING_SECRET',
  'PRIVATE_PLAYER_LOCATION',
  'PRIVATE_OPENING_ARCHIVE',
  'STORY_WEAVING_SECRET',
  'KAFKA_PRIVATE_MEMORY',
  'KAFKA_PRIVATE_INTERACTION',
  'OLD_TOO_OLD',
  'UNRELATED_MAIN_SECRET',
  'NON_PARTICIPANT_STORY_SECRET',
  'PRIVATE_FAR_FROM_MATCH',
  'MISMATCHED_SEED_SECRET',
]) assert(!contextText.includes(blocked), `不得注入：${blocked}`);

const matchedSeedContext = {
  ...baseContext,
  seed: { ...baseContext.seed, id: 'seed-match', targetId: 'npc-march', relatedNpcIds: ['npc-march'], context: 'MATCHED_SEED_CONTEXT' },
};
assert(phoneService.buildPhoneMessages(matchedSeedContext).some((message) => message.content.includes('MATCHED_SEED_CONTEXT')));

const groupContext = {
  ...baseContext,
  npcRecords: [npcMarch, npcDan, npcKafka],
  contact: undefined,
  chat: {
    ...privateChat,
    id: 'chat-express-group',
    type: 'group',
    title: '列车组',
    participantIds: ['npc-march', 'npc-dan'],
    localArchive: { ...privateChat.localArchive, entries: [], compressedSummaries: [] },
  },
  seed: undefined,
};
const groupText = phoneService.buildPhoneMessages(groupContext).map((message) => message.content).join('\n');
assert(groupText.includes('MARCH_PRIVATE_MEMORY'));
assert(groupText.includes('DAN_PRIVATE_MEMORY'));
assert(groupText.includes('MATCHED_STORY_EVENT'));
assert(!groupText.includes('KAFKA_PRIVATE_MEMORY'));
assert(!groupText.includes('NON_PARTICIPANT_STORY_SECRET'));

const systemPrompt = phoneService.buildPhoneSystemPrompt(baseContext, modules);
assert(systemPrompt.includes('CUSTOM_PHONE_SENTINEL'));
assert(systemPrompt.includes('知情边界'));

const phoneModalSource = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
assert((phoneModalSource.match(/gameSettings\.promptModules/g) ?? []).length >= 2, '主动聊天和自动来信必须共用玩家手机提示词模块');

console.log('phone prompt and knowledge boundary regression ok');
