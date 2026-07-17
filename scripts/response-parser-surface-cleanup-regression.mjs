import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-response-parser-surface-cleanup-regression');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
    .replace(/@\/(models)\//g, (_match, folder) => {
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

cleanTempDir();
transpileModule('models/chat.ts');
transpileModule('src/kernel/protocol/mainResponse.ts');

const parserUrl = pathToFileURL(path.join(tempDir, 'src/kernel/protocol/mainResponse.mjs')).href;
const { hasClosedResponseField, parseResponse } = await import(parserUrl);

const stStyleOutput = `<thinking>
- **【问题】非传统写作**: ST 预设思维链。
</thinking>

### 正文

【旁白】车厢里的点心香气逐渐铺开。
<!-- 满足动作改写，补充道谢对白 -->
<math>抗截断占位</math>

<行动选项>
- 选项 1：尝一口点心。

<短期记忆>
- 凌跟随三月七和星前往观景车厢。

<动态世界>
- 无`;

const parsed = parseResponse(stStyleOutput, { repair: true });
assert(parsed.thinking.includes('ST 预设思维链'), 'ST thinking 仍应被解析为 thinking，不应混入正文。');
assert(parsed.body.includes('【旁白】车厢里的点心香气逐渐铺开。'), '正文叙事应保留。');
assert(!parsed.body.includes('### 正文'), 'ST Markdown 正文标题不得进入正文。');
assert(!parsed.body.includes('满足动作改写'), 'HTML 元注释不得进入正文。');
assert(!parsed.body.includes('<math>'), '抗截断 math 占位不得进入正文。');
assert(parsed.actionOptions.some((item) => item.includes('尝一口点心')), '行动选项应继续被解析。');
assert(parsed.memory.includes('凌跟随三月七'), '短期记忆应继续被解析。');

const geminiWrappedOutput = `当然，以下是本回合内容：
<thinking>Step0: 读取上下文。</thinking>
<正文>【旁白】舱门缓缓开启。</正文>
<短期记忆>- 舱门开启。</短期记忆>
<动态世界>- 无</动态世界>
<变量草稿>- 无</变量草稿>
祝游戏愉快。`;
const geminiWrapped = parseResponse(geminiWrappedOutput);
assert(geminiWrapped.body === '【旁白】舱门缓缓开启。', 'Gemini 在完整协议前后附加套话时，正文必须照常提交。');
assert(geminiWrapped.thinking === 'Step0: 读取上下文。', 'Gemini 套话不得污染 canonical thinking。');

const aliasedBody = parseResponse('<thinking>Step0: 读取上下文。</thinking><body>【旁白】别名正文。</body>');
assert(aliasedBody.body === '【旁白】别名正文。', '正文别名必须与 canonical 正文一样被解析。');
assert(hasClosedResponseField('<body>【旁白】别名正文。</body>', 'body'), '协议校验必须与正文别名解析共享同一标签定义。');

const noBodyWithWrapperOnly = parseResponse(`<thinking>Step0: 读取上下文。</thinking>
<短期记忆>- 没有正文。</短期记忆>
模型附言不应成为正文。`);
assert(noBodyWithWrapperOnly.body === '', '缺少 <正文> 时，协议块后的模型附言不得被防御性地伪装成正文。');

const nonProtocolError = parseResponse('upstream gateway returned an error page');
assert(nonProtocolError.body === '', '非模型协议内容不得被防御性地转换成正文。');

const wrappedBody = parseResponse(`<正文>
正文：
【旁白】有效正文。
<Q>抗空回占位</WF>
\`\`\`
</正文>`, { repair: true });
assert(wrappedBody.body === '【旁白】有效正文。', '正文块内的 ST 标题、代码围栏和抗空回占位应被清理。');

const multiFeatureBody = parseResponse(`<正文>
【旁白】正文开始。
<tucao>吐槽不应进入正文</tucao>
<danmu>弹幕不应进入正文</danmu>
<htmlcontent><div>HTML 不应进入正文</div></htmlcontent>
<current_event>当前事件卡片</current_event>
<progress>进度卡片</progress>
<details><summary>摘要</summary>摘要卡片</details>
【旁白】正文结束。
</正文>

<行动选项>
- 选项 1：继续正常行动。
</行动选项>

<短期记忆>
- 正常记忆保留。
</短期记忆>`, { repair: true });
assert(multiFeatureBody.body.includes('【旁白】正文开始。') && multiFeatureBody.body.includes('【旁白】正文结束。'), '正文清理必须保留正常叙事文本。');
assert(!/吐槽|弹幕|HTML|当前事件卡片|进度卡片|摘要卡片/.test(multiFeatureBody.body), 'ST 多功能标签块不得污染正文。');
assert(multiFeatureBody.actionOptions.some((item) => item.includes('继续正常行动')), '正文清理不得清掉项目行动选项标签内容。');
assert(multiFeatureBody.memory.includes('正常记忆保留'), '正文清理不得清掉项目短期记忆标签内容。');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('response parser surface cleanup regression ok');
