import fs from 'node:fs';

const builder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('function buildResponseLengthSection'), 'systemPromptBuilder 必须有不可关闭的正文字数硬约束段。');
assert(builder.includes('# 正文字数硬约束'), '正文字数硬约束必须有独立标题，方便上下文预览定位。');
assert(builder.includes('settings.wordCountTarget'), '正文字数硬约束必须读取 settings.wordCountTarget。');
assert(builder.includes('当前游戏设置的正文字数目标：不少于'), '硬约束必须明确不少于当前设置字数。');
assert(builder.includes('优先于可编辑提示词模块'), '硬约束必须覆盖旧模块/自定义模块的冲突字数描述。');

const calls = [...builder.matchAll(/buildResponseLengthSection\(settings\)/g)];
assert(calls.length >= 2, '主剧情和开局 prompt 都必须注入正文字数硬约束。');
assert(contextSnapshot.includes('splitPromptSections(systemPrompt)'), '上下文查看必须展示 system prompt 分段，才能看到字数硬约束。');

console.log('prompt context regression ok');
