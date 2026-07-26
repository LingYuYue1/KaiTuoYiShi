import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

async function importPhoneServiceWithMock() {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['services/ai/phoneService.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@': process.cwd() },
    logLevel: 'silent',
    plugins: [{
      name: 'mock-phone-chat-client',
      setup(buildApi) {
        buildApi.onResolve({ filter: /chatCompletionClient$/ }, () => ({
          path: 'phone-chat-client',
          namespace: 'phone-test',
        }));
        buildApi.onLoad({ filter: /.*/, namespace: 'phone-test' }, () => ({
          contents: `
            export async function chatCompletionNonStream(_config, options) {
              globalThis.__phoneTestCalls.push(options);
              if (!globalThis.__phoneTestResponses.length) throw new Error('missing mocked phone response');
              return globalThis.__phoneTestResponses.shift();
            }
          `,
          loader: 'js',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const phoneService = await importPhoneServiceWithMock();

const config = {
  id: 'phone-test',
  name: 'phone-test',
  provider: 'openai_compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  maxTokens: 200,
  temperature: 0.7,
  retryCount: 0,
  createdAt: 0,
  updatedAt: 0,
};

const contact = {
  id: 'npc_march',
  npcId: 'march',
  name: '三月七',
  available: true,
};

const npc = {
  id: 'march',
  姓名: '三月七',
  别名: '三月',
  阶位: 'companion',
  好感度: 45,
  关系: 'friend',
  同行: true,
  初见回合: 1,
  最近回合: 9,
  当前关系阶段: '熟悉的伙伴',
  最近互动: '一起整理了相机里的照片',
  同行记忆: [],
  总结记忆: [],
  备注: [],
};

function createPrivateContext() {
  return {
    traveler: { 姓名: '开拓者' },
    world: { 当前时间: '午后' },
    npcRecords: [npc],
    news: [],
    turnCount: 9,
    contact,
    contacts: [contact],
    userText: 'PLAYER_INPUT_SENTINEL：刚才拍的照片可以发给我吗？',
    chat: {
      id: 'chat_march',
      type: 'private',
      title: '三月七',
      participantIds: [contact.id],
      messages: [
        { id: 'old', senderId: contact.id, senderName: '三月七', role: 'contact', content: 'OLD_PHONE_REPLY_SENTINEL', turn: 8, timestamp: 1 },
        { id: 'current', senderId: 'player', senderName: '开拓者', role: 'player', content: 'PLAYER_INPUT_SENTINEL：刚才拍的照片可以发给我吗？', turn: 9, timestamp: 2 },
      ],
      localArchive: { threshold: 8, entries: [], compressedSummaries: [] },
      unread: 0,
      updatedAt: 2,
    },
  };
}

function mockResponses(...responses) {
  globalThis.__phoneTestCalls = [];
  globalThis.__phoneTestResponses = [...responses];
}

function jsonReply(messages, summary = '测试摘要') {
  return JSON.stringify({ messages, summary });
}

const directMessages = [
  '当然可以，我刚把照片导出来。',
  '车窗边那张光线特别好，我先发那张。',
  '空间站拍的那组也在，要不要一起打包？',
  '原图有点大，通讯会多跑一会儿。',
];
mockResponses(jsonReply(directMessages));
const direct = await phoneService.generatePhoneReply(config, createPrivateContext(), 0, []);
assert.deepEqual(direct.messages, directMessages, 'a valid private reply should land unchanged');
assert.equal(globalThis.__phoneTestCalls.length, 1, 'a valid reply must not trigger a quality supplement call');
assert.ok(globalThis.__phoneTestCalls[0].maxTokens >= 1600, 'private output budget must support up to eight messages');
const firstRequestText = globalThis.__phoneTestCalls[0].messages.map((message) => message.content).join('\n');
assert.equal(firstRequestText.split('PLAYER_INPUT_SENTINEL').length - 1, 1, 'the current player message must be injected exactly once');

const partialFirst = [
  'OLD_PHONE_REPLY_SENTINEL',
  '我已经把相册按时间整理好了。',
  '车窗边那张的光线最漂亮。',
  '车窗边那张的光线最漂亮。',
];
const partialSecond = [
  '你想先看空间站拍的那一组吗？',
  '还是我直接把全部原图发给你？',
];
mockResponses(jsonReply(partialFirst, '首轮摘要'), jsonReply(partialSecond, '合并摘要'));
const supplemented = await phoneService.generatePhoneReply(config, createPrivateContext(), 0, []);
assert.equal(globalThis.__phoneTestCalls.length, 2, 'a thin or repeated reply must trigger exactly one quality supplement call');
assert.deepEqual(supplemented.messages, [partialFirst[1], partialFirst[2], ...partialSecond], 'valid first-pass messages must be preserved and supplemented');
assert.ok(!supplemented.messages.includes('OLD_PHONE_REPLY_SENTINEL'), 'recent history duplicates must not land again');
assert.ok(globalThis.__phoneTestCalls[1].messages.at(-1).content.includes('只补充缺少的有效短讯'), 'the second call must be a targeted supplement');
const supplementRequestText = globalThis.__phoneTestCalls[1].messages.map((message) => message.content).join('\n');
assert.equal(supplementRequestText.split('PLAYER_INPUT_SENTINEL').length - 1, 1, 'the quality supplement request must not duplicate the current player message');

mockResponses(jsonReply(['只返回一句']), jsonReply(['只返回一句']));
await assert.rejects(
  () => phoneService.generatePhoneReply(config, createPrivateContext(), 0, []),
  (error) => error?.name === 'PhoneReplyQualityError',
  'two insufficient quality results must fail instead of generating local filler',
);
assert.equal(globalThis.__phoneTestCalls.length, 2, 'quality recovery must stop after one supplement call');

const groupContext = {
  ...createPrivateContext(),
  contact: undefined,
  chat: {
    ...createPrivateContext().chat,
    id: 'group_train',
    type: 'group',
    title: '列车组频道',
    participantIds: ['npc_march', 'npc_dan', 'npc_himeko'],
  },
};
const groupMessages = Array.from({ length: 12 }, (_, index) => `${['三月七', '丹恒', '姬子'][index % 3]}：群聊测试消息 ${index + 1}`);
mockResponses(jsonReply(groupMessages, '群聊摘要'));
const group = await phoneService.generatePhoneReply(config, groupContext, 0, []);
assert.equal(group.messages.length, 12, 'group replies must accept the configured minimum of twelve messages');
assert.equal(globalThis.__phoneTestCalls.length, 1, 'a valid group reply must not trigger supplementation');
assert.ok(globalThis.__phoneTestCalls[0].maxTokens >= 4096, 'group output budget must support up to thirty messages');

const customOnlyPrompt = phoneService.buildPhoneSystemPrompt(createPrivateContext(), [{
  id: 'custom_phone_style_test',
  content: 'CUSTOM_PHONE_STYLE_SENTINEL',
  enabled: true,
  scope: ['calibration'],
  order: 20,
}]);
assert.ok(customOnlyPrompt.includes('不可覆盖的手机运行时契约'), 'custom modules must not replace the runtime contract');
assert.ok(customOnlyPrompt.includes('CUSTOM_PHONE_STYLE_SENTINEL'), 'custom phone modules must still be appended');
assert.ok(customOnlyPrompt.includes('4-8'), 'the runtime contract must keep the private reply range');
assert.ok(customOnlyPrompt.includes('不得声称读取全局记忆'), 'the runtime contract must keep the repaired knowledge boundary');

const phoneServiceSource = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const phoneStyleSource = fs.readFileSync('prompts/cot/phoneStyle.ts', 'utf8');
for (const retiredFallback of [
  '我想了想，还是等你那边确认后再说。',
  '有新情况记得回我，我这边先盯着。',
  '我刚才又想起一件小事。',
  '等你方便的时候回我一下就好。',
]) {
  assert.ok(!phoneServiceSource.includes(retiredFallback), `retired local fallback must be removed: ${retiredFallback}`);
}
assert.ok(phoneStyleSource.includes('稳定角色底色') && phoneStyleSource.includes('不得借场景让角色突然 OOC'), 'the default phone style must preserve character identity across scenes');
assert.ok(phoneStyleSource.includes('日常即时通讯'), 'the default phone style must guide natural everyday messaging');

console.log('phone reply quality and style regression ok');
