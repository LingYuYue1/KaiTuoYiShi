/**
 * ST V2 消息链构建器回归测试。
 *
 * 只验证旁路纯函数，不接入主剧情发送链路。
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tavern-message-chain-regression');

function cleanTempDir() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function transpileModule(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countIncludes(messages, text) {
  return messages.filter((msg) => msg.content.includes(text)).length;
}

cleanTempDir();
transpileModule('utils/macroEngine.ts');
transpileModule('utils/narrativeRuntimePolicy.ts');
transpileModule('hooks/useGame/tavernFormatGuard.ts');
transpileModule('hooks/useGame/tavernMessageChainBuilder.ts');

const builderUrl = pathToFileURL(path.join(tempDir, 'hooks/useGame/tavernMessageChainBuilder.mjs')).href;
const { buildTavernMessageChain } = await import(builderUrl);

const settings = {
  stPostProcessMode: '未选择',
  enableActionOptions: true,
  promptModules: [
    { id: 'builtin_world_prompt', content: '世界观片段' },
    { id: 'builtin_main_plot_cot', content: '内置COT骨架' },
    { id: 'builtin_response_format', content: '四标签格式' },
    { id: 'builtin_action_options', content: '行动选项格式' },
    { id: 'builtin_no_control', content: '项目防抢话规则' },
    { id: 'builtin_narrator_persona', content: '叙述人格' },
    { id: 'builtin_dev_mode', content: '' },
    { id: 'builtin_writing_style', content: '文风片段' },
  ],
};

const basePreset = {
  prompts: [
    { identifier: 'worldInfoBefore', role: 'system', content: '' },
    { identifier: 'main', role: 'system', content: '你好 {{user}}，角色是 {{char}}。' },
    { identifier: 'chatHistory', role: 'system', content: '' },
    { identifier: 'personaDescription', role: 'system', content: '' },
    { identifier: 'userInput', role: 'user', content: '' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'worldInfoBefore', enabled: true },
      { identifier: 'main', enabled: true },
      { identifier: 'chatHistory', enabled: true },
      { identifier: 'personaDescription', enabled: true },
      { identifier: 'userInput', enabled: true },
    ],
  }],
};

const messages1 = buildTavernMessageChain({
  settings,
  preset: basePreset,
  characterId: 100001,
  chatHistory: [{
    role: 'assistant',
    content: '上一回合原始内容',
    parsedResponse: {
      thinking: '',
      body: '上一回合正文',
      memory: '上一回合记忆',
      commands: {},
      worldEvents: ['列车抵达匹诺康尼'],
    },
  }],
  latestUserInput: '继续',
  playerName: '星',
  playerRole: {
    姓名: '星',
    别名: '开拓者',
    性别: '未知',
    年龄: 25,
    生日: '',
    身高: '',
    身份: '星穹列车成员',
    外貌: '灰发金瞳',
    性格: '行动派',
    背景: '',
    专长知识: ['开拓'],
    头像: '',
  },
});

// 工作包D 9.3：原生区8 已完整存在，Tavern 只保留短兼容保护，不再全文复制 COT
assert(countIncludes(messages1, '内置COT骨架') === 0, '未使用 {{cot}} 时 Tavern 不得全文复制 COT（短兼容保护）。');
// 工作包D 9.3：格式同样只保留短兼容保护
assert(countIncludes(messages1, '四标签格式') === 0, '未使用 {{format}} 时 Tavern 不得全文复制回复格式。');
// 工作包D 9.3：行动选项只保留短保护提醒，不再全文复制行动选项模块
assert(countIncludes(messages1, '行动选项格式') === 0, 'Tavern 不得全文复制行动选项模块。');
assert(
  messages1.some((msg) => msg.content.includes('你好 星，角色是 当前剧情中的主要互动对象')),
  '应替换 {{user}}，并把 {{char}} 替换为项目内置兼容语义',
);
assert(messages1.some((msg) => msg.role === 'user' && msg.content === '继续'), '应注入最新用户输入');
assert(messages1.some((msg) => msg.content.includes('上一回合正文') && msg.content.includes('列车抵达匹诺康尼')), 'assistant 历史应优先使用 parsedResponse 结构化正文');
assert(messages1.some((msg) => msg.content.includes('# 玩家档案') && msg.content.includes('身份：星穹列车成员')), 'personaDescription 应注入完整玩家档案');

const placeholderPreset = {
  prompts: [
    { identifier: 'main', role: 'system', content: '正文\n{{cot}}\n{{format}}' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [{ identifier: 'main', enabled: true }],
  }],
};

const messages2 = buildTavernMessageChain({
  settings,
  preset: placeholderPreset,
  characterId: 100001,
  chatHistory: [],
  latestUserInput: '',
  playerName: '星',
  playerRole: null,
});

assert(countIncludes(messages2, '内置COT骨架') === 0, '使用 {{cot}} 时也不得复制原生区8完整 COT');
assert(countIncludes(messages2, '四标签格式') === 0, '使用 {{format}} 时也不得复制原生区8完整回复格式');
assert(countIncludes(messages2, 'Tavern COT 兼容引用') === 1, '{{cot}} 应替换为一次短兼容引用');
assert(countIncludes(messages2, 'Tavern 回复格式兼容引用') === 1, '{{format}} 应替换为一次短兼容引用');

const noControlPreset = {
  prompts: [
    { identifier: 'worldInfoBefore', role: 'system', content: '' },
    { identifier: 'boundary', role: 'system', content: '禁止代写玩家言行，不替玩家发言。' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'worldInfoBefore', enabled: true },
      { identifier: 'boundary', enabled: true },
    ],
  }],
};

const messages3 = buildTavernMessageChain({
  settings,
  preset: noControlPreset,
  characterId: 100001,
  chatHistory: [],
  latestUserInput: '',
  playerName: '星',
  playerRole: null,
});

assert(countIncludes(messages3, '项目防抢话规则') === 0, '预设已有防抢话时应跳过项目 noControl 嫁接');
assert(messages3.some((msg) => msg.content.includes('禁止代写玩家言行')), '预设自带防抢话内容应保留');

const macroPreset = {
  prompts: [
    { identifier: 'macroSet', role: 'system', content: '{{setvar::mood::晴朗}}' },
    { identifier: 'macroRead', role: 'system', content: '今日心情：{{getvar::mood}}。{{if getvar::mood == 晴朗}}可以出发{{/if}}' },
    { identifier: 'macroDisabled', role: 'system', content: '{{setvar::mood::阴沉}}' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'macroSet', enabled: true },
      { identifier: 'macroDisabled', enabled: false },
      { identifier: 'macroRead', enabled: true },
    ],
  }],
};
const messages4 = buildTavernMessageChain({
  settings,
  preset: macroPreset,
  characterId: 100001,
  chatHistory: [],
  latestUserInput: '',
  playerName: '星',
  playerRole: null,
});
assert(messages4.some((msg) => msg.content.includes('今日心情：晴朗。可以出发')), '宏应按启用顺序项共享上下文执行');
assert(!messages4.some((msg) => msg.content.includes('阴沉')), '禁用顺序项不应执行宏');

const worldInfoPreset = {
  prompts: [
    { identifier: 'worldInfoBefore', role: 'system', content: '' },
    { identifier: 'main', role: 'system', content: '主提示词' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'worldInfoBefore', enabled: true },
      { identifier: 'main', enabled: true },
    ],
  }],
  world_info: [
    {
      uid: 1,
      comment: '匹诺康尼条目',
      key: ['匹诺康尼'],
      content: '梦境酒店与家族势力需要维持连续性。',
      enabled: true,
      order: 20,
    },
    {
      uid: 2,
      comment: '未触发条目',
      key: ['贝洛伯格'],
      content: '这段不应进入当前消息链。',
      enabled: true,
      order: 10,
    },
  ],
};
const messages5 = buildTavernMessageChain({
  settings,
  preset: worldInfoPreset,
  characterId: 100001,
  chatHistory: [],
  latestUserInput: '继续调查匹诺康尼的梦境酒店。',
  playerName: '星',
  playerRole: null,
});
assert(messages5.some((msg) => msg.content.includes('# 预设世界书')), '命中的 ST world_info 应进入世界书嫁接文本');
assert(messages5.some((msg) => msg.content.includes('梦境酒店与家族势力需要维持连续性')), '命中的 ST world_info 内容应注入消息链');
assert(!messages5.some((msg) => msg.content.includes('这段不应进入当前消息链')), '未命中的 ST world_info 不应注入消息链');

const duplicateInputPreset = {
  prompts: [
    { identifier: 'chatHistory', role: 'system', content: '' },
    { identifier: 'userInput', role: 'user', content: '' },
    { identifier: 'user_input', role: 'user', content: '' },
    { identifier: 'inlineA', role: 'user', content: 'A={{userinput}}' },
    { identifier: 'inlineB', role: 'assistant', content: 'B=<user_input>' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'chatHistory', enabled: true },
      { identifier: 'chatHistory', enabled: true },
      { identifier: 'userInput', enabled: true },
      { identifier: 'user_input', enabled: true },
      { identifier: 'inlineA', enabled: true },
      { identifier: 'inlineB', enabled: true },
    ],
  }],
};
const messages6 = buildTavernMessageChain({
  settings,
  preset: duplicateInputPreset,
  characterId: 100001,
  chatHistory: [{ role: 'assistant', content: '唯一历史标记' }],
  latestUserInput: '唯一输入标记',
  scope: 'main',
  playerName: '星',
  playerRole: null,
});
assert(countIncludes(messages6, '唯一历史标记') === 1, '重复 chatHistory 槽只能注入一份历史。');
assert(countIncludes(messages6, '唯一输入标记') === 1, '多个 input 槽与占位符合计只能注入一次最新输入。');

const messagesRepeatedText = buildTavernMessageChain({
  settings,
  preset: basePreset,
  characterId: 100001,
  chatHistory: [{ role: 'user', content: '继续' }],
  latestUserInput: '继续',
  scope: 'main',
  playerName: '星',
  playerRole: null,
});
const repeatedInputOccurrences = messagesRepeatedText
  .filter((msg) => msg.role === 'user')
  .map((msg) => msg.content)
  .join('\n')
  .match(/继续/g)?.length ?? 0;
assert(repeatedInputOccurrences === 2, '旧历史与本轮输入同文时，最终链必须恰好保留一份历史文本和一份本轮任务文本。');

const messages7 = buildTavernMessageChain({
  settings: { ...settings, enableActionOptions: false },
  preset: basePreset,
  characterId: 100001,
  chatHistory: [],
  latestUserInput: '继续',
  scope: 'main',
  playerName: '星',
  playerRole: null,
});
assert(!messages7.some((msg) => msg.content.includes('项目行动选项保护')), '行动选项关闭时 Tavern 兼容保护不得要求输出行动选项。');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('✓ ST V2 消息链构建器回归测试通过');
