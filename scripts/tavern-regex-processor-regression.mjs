import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tavern-regex-processor-regression');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

cleanTempDir();
transpileModule('hooks/useGame/tavernRegexProcessor.ts');

const url = pathToFileURL(path.join(tempDir, 'hooks/useGame/tavernRegexProcessor.mjs')).href;
const {
  analyzeTavernRegexScript,
  applyTavernOutputRegexScripts,
  dryRunTavernRegexScript,
  extractTavernRegexScripts,
  normalizeTavernRegexScripts,
} = await import(url);

const rawScripts = normalizeTavernRegexScripts([
  { id: 'a', find_regex: 'foo', replace_string: 'bar' },
  null,
  'bad',
]);
assert(rawScripts.length === 1, 'normalizeTavernRegexScripts 应过滤非对象条目');

const mappedScripts = normalizeTavernRegexScripts({
  mapped_prompt_cleanup: { script_name: 'prompt cleanup mapped', find_regex: 'foo', replace_string: 'bar' },
  invalid: null,
});
assert(mappedScripts.length === 1, 'normalizeTavernRegexScripts 应支持对象映射形式');
assert(mappedScripts[0].id === 'mapped_prompt_cleanup', '对象映射形式应把 key 补为脚本 id');

const promptScript = { script_name: 'prompt cleanup', find_regex: 'foo', replace_string: 'bar' };
const promptSafety = analyzeTavernRegexScript(promptScript);
assert(promptSafety.kind === 'prompt_preprocess', 'prompt 类脚本应归类为 prompt_preprocess');
const promptDryRun = dryRunTavernRegexScript(promptScript, 'foo <正文>ok</正文>');
assert(promptDryRun.ok === true, '低风险 prompt 脚本干跑应可通过');
assert(promptDryRun.after.includes('bar'), '干跑应展示替换结果');

const camelCaseScript = { scriptName: 'prompt cleanup camel', findRegex: '/foo/g', replaceString: 'bar' };
const camelSafety = analyzeTavernRegexScript(camelCaseScript);
assert(camelSafety.kind === 'prompt_preprocess', 'ST 驼峰字段 scriptName/findRegex/replaceString 应可被识别');
const camelDryRun = dryRunTavernRegexScript(camelCaseScript, 'foo foo');
assert(camelDryRun.matches === 2 && camelDryRun.after === 'bar bar', 'ST /pattern/flags 格式 findRegex 应可干跑');

const extractedOfficialLikeScripts = extractTavernRegexScripts({
  regex_scripts: [{ id: 'top', scriptName: 'prompt top', findRegex: 'top', replaceString: 'x' }],
  extensions: {
    regex_scripts: [{ id: 'extension', scriptName: 'prompt extension', findRegex: 'extension', replaceString: 'x' }],
    RegexBinding: {
      regexes: [{ id: 'binding', scriptName: 'prompt binding', findRegex: 'binding', replaceString: 'x' }],
    },
    SPreset: {
      RegexBinding: {
        regexes: [{ id: 'spreset_binding', scriptName: 'prompt spreset', findRegex: 'spreset', replaceString: 'x' }],
      },
    },
    tavern_helper: {
      scripts: [{ id: 'helper_nested', scriptName: 'prompt helper nested', findRegex: 'helper_nested', replaceString: 'x' }],
    },
  },
  tavern_helper: {
    scripts: [{ id: 'helper', scriptName: 'prompt helper', findRegex: 'helper', replaceString: 'x' }],
  },
});
assert(extractedOfficialLikeScripts.length === 6, 'extractTavernRegexScripts should read top-level, extensions, SPreset and tavern_helper regex scripts');
assert(extractedOfficialLikeScripts.some((script) => script.id === 'spreset_binding'), 'SPreset.RegexBinding.regexes should be extracted');

const displayScript = { script_name: 'display css rewrite', find_regex: 'foo', replace_string: 'bar' };
const displaySafety = analyzeTavernRegexScript(displayScript);
assert(displaySafety.kind === 'display_replace' && displaySafety.risky, '显示层/CSS 脚本应判为高风险 display_replace');
const displayDryRun = dryRunTavernRegexScript(displayScript, 'foo');
assert(displayDryRun.ok === false, '显示层/CSS 脚本干跑结果应不可执行');

const protocolScript = { script_name: 'output postprocess', find_regex: '<正文>', replace_string: '' };
const protocolDryRun = dryRunTavernRegexScript(protocolScript, '<正文>hello</正文>');
assert(protocolDryRun.ok === false, '删除项目协议标签的脚本必须被拦截');
assert(protocolDryRun.safety.blocksProtocolTags === true, '协议标签风险必须被标记');

const memoryProtocolScript = { script_name: 'output postprocess', find_regex: '<短期记忆>[\\s\\S]*?<\\/短期记忆>', replace_string: '' };
const memoryProtocolSafety = analyzeTavernRegexScript(memoryProtocolScript);
assert(memoryProtocolSafety.kind === 'blocked' && memoryProtocolSafety.blocksProtocolTags, '短期记忆等主剧情协议标签也必须被正则安全层保护');

const commentCleanupScript = { scriptName: 'HTML注释-去除', findRegex: '/<!--\\s*([\\s\\S]*?)\\s*-->/g', replaceString: '' };
const commentCleanupSafety = analyzeTavernRegexScript(commentCleanupScript);
assert(commentCleanupSafety.kind === 'output_postprocess' && commentCleanupSafety.risky === false, 'HTML 注释清理应归类为安全输出后处理');

const cleanupResult = applyTavernOutputRegexScripts(
  '<正文>正文</正文>\n<!-- 满足动作改写，补充道谢对白 -->\n<math>抗截断占位</math>\n<行动选项>1. 出门</行动选项>',
  {
    regex_scripts: [
      commentCleanupScript,
      { scriptName: '抗截断-清理math', findRegex: '<math>([\\s\\S]*?)<\\/math>', replaceString: '' },
      { scriptName: 'CoT-简约美化', findRegex: '/^([\\s\\S]*<\\/think(?:ing)?>)/i', replaceString: '<style>bad</style>$1' },
    ],
  },
);
assert(cleanupResult.applied.includes('HTML注释-去除'), '安全输出清理应执行 HTML 注释正则');
assert(cleanupResult.applied.includes('抗截断-清理math'), '安全输出清理应执行抗截断 math 正则');
assert(!cleanupResult.text.includes('满足动作改写') && !cleanupResult.text.includes('<math>'), '安全输出清理应移除元注释与抗截断占位');
assert(cleanupResult.text.includes('<正文>') && cleanupResult.text.includes('<行动选项>'), '安全输出清理不得删除项目协议标签');
assert(cleanupResult.skipped.some((item) => item.includes('CoT-简约美化')), 'HTML/CSS 美化类高风险正则必须跳过');

const ambiguousCleanupResult = applyTavernOutputRegexScripts('【旁白】正文内容', {
  regex_scripts: [
    { scriptName: 'HTML注释-去除', findRegex: '/^([\\s\\S]*)$/g', replaceString: '' },
  ],
});
assert(ambiguousCleanupResult.text === '【旁白】正文内容', '安全输出清理不能仅凭脚本名执行泛匹配正文的正则');
assert(ambiguousCleanupResult.skipped.some((item) => item.includes('HTML注释-去除')), '泛匹配清理脚本应被跳过并记录原因');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('✓ Tavern regex processor regression ok');
