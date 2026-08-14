#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.scss', '.html']);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'backups', 'coverage', '.tmp', '.tmp-*']);
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };
const DEFAULT_MAX_RESULTS = 1000;

const RULES = [
  ['comment.structural.long-block', 'low', '多行块注释候选'],
  ['comment.structural.consecutive-lines', 'low', '连续多行 // 注释候选'],
  ['comment.structural.long-line', 'low', '注释单行过长'],
  ['comment.navigation-banner', 'low', '分隔/导航横幅注释'],
  ['comment.spec.task-marker', 'medium', '包含任务、审计或路线图标记'],
  ['comment.spec.phase-marker', 'medium', '包含内部阶段/步骤标记'],
  ['comment.spec.ticket-marker', 'medium', '包含提交、任务号或文档引用'],
  ['comment.spec.version-date-marker', 'low', '包含版本或日期标记'],
  ['comment.history.migration', 'medium', '包含迁移或旧实现历史'],
  ['comment.history.legacy', 'low', '包含 legacy/旧版兼容说明'],
  ['comment.roadmap.todo', 'medium', '包含未完成或未来计划'],
  ['comment.workaround', 'medium', '包含临时方案或 workaround'],
  ['comment.how-only', 'medium', '疑似解释 how 而非 why'],
  ['comment.redundant-responsibility', 'low', '疑似重复职责/接线说明'],
  ['comment.negation-only', 'low', '否定或范围限定缺少 why 线索'],
  ['comment.absolute-claim', 'low', '包含可能过时的绝对断言'],
  ['comment.commented-code', 'high', '疑似被注释掉的代码'],
  ['comment.lint-suppression', 'low', '包含 lint/type suppression'],
  ['comment.dead-code-claim', 'medium', '声称无调用方或未使用'],
  ['comment.possible-stale-claim', 'medium', '可能与当前实现不一致'],
];

const RULE_BY_ID = new Map(RULES.map(([id, severity, description]) => [id, { id, severity, description }]));
const ALL_RULE_IDS = new Set(RULE_BY_ID.keys());

const SPEC_MARKERS = [
  /片\s*[A-Za-z0-9一二三四五六七八九十-]+/u,
  /panel[-_]p?[0-9]+/iu,
  /子任务/u,
  /任务[：:]/u,
  /reviewer/iu,
  /审计/u,
  /路线图/u,
  /roadmap/iu,
];

const PHASE_MARKERS = [
  /Phase\s*[0-9]+/iu,
  /Step\s*[0-9]+/iu,
  /stage\s*[0-9]+/iu,
];

const TICKET_MARKERS = [
  /GitHub\s*#/iu,
  /ideal_design\.md/iu,
  /kernelization\.md/iu,
  /P[0-9]+(?:-[0-9]+)?/u,
  /D[0-9]+/u,
  /S[0-9]+/u,
  /E-[0-9]+/u,
];

const VERSION_DATE_MARKERS = [
  /v[0-9]+\.[0-9]+(?:\.[0-9]+)?/iu,
  /202[0-9][-/.][0-9]{1,2}[-/.][0-9]{1,2}/u,
];

const HISTORY_MARKERS = [
  /旧版|旧模型|旧路径|旧字段|旧逻辑|历史|迁移|已迁移|已删除|已废弃/u,
  /legacy|deprecated|obsolete|source history|retained/iu,
  /原实现|原定义|收敛前|收敛后|前版|重构前|复制原/u,
];

const ROADMAP_MARKERS = [
  /\b(?:TODO|FIXME|HACK|XXX|BUG|WIP|TEMP(?:ORARY)?|WORKAROUND)\b/iu,
  /\b(?:quick[- ]fix|remove later|delete later|clean(?: |-)?up later|for now)\b/iu,
  /以后|未来|待办|待实现|尚未实现|当前阶段|预留/u,
];

const WORKAROUND_MARKERS = [
  /\b(?:workaround|quick[- ]fix|remove later|delete later|clean(?: |-)?up later)\b/iu,
  /临时方案|临时修复|临时兜底|暂时保留|暂时兼容/u,
];

const NEGATION_MARKERS = [
  /无/u,
  /不/u,
  /仅/u,
  /只/u,
  /不得/u,
  /不能/u,
  /未/u,
  /非/u,
  /除非/u,
  /避免/u,
  /防止/u,
  /不再/u,
  /仅限/u,
  /只能/u,
  /一律/u,
  /永远/u,
  /绝不/u,
  /不会/u,
];

const WHY_MARKERS = [
  /因为|由于|否则|原因|竞态|闭包|异步|数据丢失|截断|污染|注入|安全|一致性|状态机|持久化|兼容|事务|缓存/u,
  /so that|because|otherwise|race|atomic|consisten|prevent|avoid|preserve|protect/iu,
];

const HOW_MARKERS = [
  /解释|说明|流程|步骤|首先|然后|最后|第一步|第二步|第三步|实现了|实现方式|工作原理/u,
  /负责|用于|接线|透传|只负责|只转发|不复制实现|原样转发/u,
  /how|implementation|steps?|flow|wiring|forward/iu,
];

const RESPONSIBILITY_MARKERS = [
  /只负责|仅负责|不负责|只做|仅做|只转发|仅转发|不复制|接线|透传|facade|门面|组件|面板/u,
];

const ABSOLUTE_MARKERS = [/唯一|一律|永远|绝不|不会|所有|始终|只能/u, /always|never|only|all|唯一/iu];
const DEAD_CODE_MARKERS = [/无调用方|未使用|未被.*使用|不再 import|不再直接 import|仅.*引用|仅.*使用/u, /unused|no callers?|not imported/iu];
const COMMENTED_CODE_PATTERN = /^(?:const|let|var|if|else|for|while|return|throw|await|import|export|function|async|type|interface|set[A-Z])\b/u;
const LINT_SUPPRESSION_PATTERN = /eslint-(?:disable|enable)|ts-(?:ignore|expect-error)|@ts-|istanbul ignore|coverage ignore/iu;
const CONTRACT_MARKERS = /@(?:deprecated|param|returns?|throws|see)\b|license|copyright|reference lib|reference types/iu;
const BANNER_PATTERN = /^(?:[\s\-_=─━═*·•]+|(?:[-_=─━═*·•]\s*){3,})$/u;

function parseArguments(argv) {
  const options = {
    root: path.resolve(import.meta.dirname, '..'),
    json: false,
    changed: false,
    noFail: false,
    max: DEFAULT_MAX_RESULTS,
    rules: new Set(),
    minimumSeverity: 'low',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--changed') options.changed = true;
    else if (argument === '--no-fail') options.noFail = true;
    else if (argument === '--list-rules') options.listRules = true;
    else if (argument === '--root') options.root = path.resolve(argv[++index] ?? options.root);
    else if (argument.startsWith('--root=')) options.root = path.resolve(argument.slice('--root='.length));
    else if (argument === '--rule') options.rules.add(argv[++index] ?? '');
    else if (argument.startsWith('--rule=')) options.rules.add(argument.slice('--rule='.length));
    else if (argument === '--severity') options.minimumSeverity = argv[++index] ?? options.minimumSeverity;
    else if (argument.startsWith('--severity=')) options.minimumSeverity = argument.slice('--severity='.length);
    else if (argument === '--max') options.max = Number(argv[++index] ?? DEFAULT_MAX_RESULTS);
    else if (argument.startsWith('--max=')) options.max = Number(argument.slice('--max='.length));
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!['low', 'medium', 'high'].includes(options.minimumSeverity)) {
    throw new Error(`Invalid severity: ${options.minimumSeverity}`);
  }
  if (!Number.isInteger(options.max) || options.max < 0) throw new Error('--max must be a non-negative integer');
  for (const rule of options.rules) if (!ALL_RULE_IDS.has(rule)) throw new Error(`Unknown rule: ${rule}`);
  return options;
}

function printHelp() {
  process.stdout.write([
    'Usage: node scripts/comment_violation_scan.mjs [options]',
    '',
    'Options:',
    '  --changed             Scan changed and untracked files only',
    '  --json                Emit JSON output',
    '  --no-fail             Always exit with status 0',
    '  --root <path>         Override repository root',
    '  --rule <rule>         Filter to one rule; may be repeated',
    '  --severity <level>    Minimum severity: low, medium, high',
    '  --max <n>             Maximum human-readable findings (default: 1000)',
    '  --list-rules          Print all rules and exit',
    '  --help                Show this help',
    '',
  ].join('\n'));
}

function printRules() {
  for (const [id, severity, description] of RULES) process.stdout.write(`${id}\t${severity}\t${description}\n`);
}

function isIgnoredDirectory(name) {
  return [...IGNORED_DIRECTORIES].some((pattern) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern);
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !isIgnoredDirectory(entry.name)) await walk(path.join(directory, entry.name));
      if (!entry.isFile()) continue;
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(path.join(directory, entry.name));
    }
  }
  await walk(root);
  return files.sort();
}

function changedFiles(root) {
  try {
    const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean))]
      .map((value) => path.resolve(root, value))
      .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  } catch {
    return null;
  }
}

function isRegexStart(text, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/u.test(text[cursor])) cursor -= 1;
  if (cursor < 0) return true;
  const previous = text[cursor];
  if ('([{,:;=!?&|+-*%^~<>'.includes(previous)) return true;
  let end = cursor + 1;
  while (cursor >= 0 && /[A-Za-z_$]/u.test(text[cursor])) cursor -= 1;
  const word = text.slice(cursor + 1, end);
  return new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'else', 'do', 'new']).has(word);
}

function skipQuoted(text, start, quote) {
  let cursor = start + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (text[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return text.length;
}

function skipRegex(text, start) {
  let cursor = start + 1;
  let inCharacterClass = false;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (text[cursor] === '[') inCharacterClass = true;
    if (text[cursor] === ']') inCharacterClass = false;
    if (text[cursor] === '/' && !inCharacterClass) {
      cursor += 1;
      while (/[A-Za-z]/u.test(text[cursor] ?? '')) cursor += 1;
      return cursor;
    }
    if (text[cursor] === '\n' || text[cursor] === '\r') return start + 1;
    cursor += 1;
  }
  return text.length;
}

function extractComments(text, extension) {
  const comments = [];
  const html = extension === '.html';
  const css = extension === '.css' || extension === '.scss';
  let cursor = 0;
  while (cursor < text.length) {
    if (html && text.startsWith('<!--', cursor)) {
      const end = text.indexOf('-->', cursor + 4);
      const finish = end < 0 ? text.length : end + 3;
      comments.push({ start: cursor, end: finish, kind: 'html' });
      cursor = finish;
      continue;
    }
    if (!css && !html && text.startsWith('//', cursor)) {
      const end = text.indexOf('\n', cursor + 2);
      const finish = end < 0 ? text.length : end;
      comments.push({ start: cursor, end: finish, kind: 'line' });
      cursor = finish;
      continue;
    }
    if (text.startsWith('/*', cursor)) {
      const end = text.indexOf('*/', cursor + 2);
      const finish = end < 0 ? text.length : end + 2;
      comments.push({ start: cursor, end: finish, kind: 'block' });
      cursor = finish;
      continue;
    }
    if (!html && (text[cursor] === '"' || text[cursor] === "'" || text[cursor] === '`')) {
      cursor = skipQuoted(text, cursor, text[cursor]);
      continue;
    }
    if (!html && !css && text[cursor] === '/' && text[cursor + 1] !== '/' && text[cursor + 1] !== '*' && isRegexStart(text, cursor)) {
      const next = skipRegex(text, cursor);
      if (next !== cursor + 1) {
        cursor = next;
        continue;
      }
    }
    cursor += 1;
  }
  return comments;
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function positionAt(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

function materializeComment(text, location, rawComment) {
  const raw = text.slice(rawComment.start, rawComment.end);
  const content = rawComment.kind === 'line'
    ? raw.slice(2)
    : rawComment.kind === 'html'
      ? raw.slice(4, raw.endsWith('-->') ? -3 : undefined)
      : raw.slice(2, raw.endsWith('*/') ? -2 : undefined);
  const normalized = content
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\*\s?/u, '').trimEnd())
    .join('\n')
    .trim();
  const end = positionAt(location, Math.max(rawComment.start, rawComment.end - 1));
  return {
    ...rawComment,
    raw,
    content: normalized,
    line: positionAt(location, rawComment.start).line,
    column: positionAt(location, rawComment.start).column,
    endLine: end.line,
    endColumn: end.column,
    lineCount: end.line - positionAt(location, rawComment.start).line + 1,
    unterminated: rawComment.kind !== 'line' && !raw.endsWith(rawComment.kind === 'html' ? '-->' : '*/'),
  };
}

function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function isContractComment(comment) {
  return CONTRACT_MARKERS.test(comment.content);
}

function addIssue(issues, comment, ruleId, message, extra = {}) {
  const rule = RULE_BY_ID.get(ruleId);
  if (!rule) return;
  issues.push({
    rule: rule.id,
    severity: rule.severity,
    message,
    line: comment.line,
    column: comment.column,
    endLine: comment.endLine,
    endColumn: comment.endColumn,
    kind: comment.kind,
    lineCount: comment.lineCount,
    snippet: comment.content.replace(/\s+/gu, ' ').trim().slice(0, 280),
    ...extra,
  });
}

function analyzeComment(comment, issues) {
  const content = comment.content;
  if (!content) return;
  const contract = isContractComment(comment);
  const lines = content.split('\n');
  const significantLines = lines.map((line) => line.trim()).filter(Boolean);

  if (!contract && comment.lineCount >= 5) addIssue(issues, comment, 'comment.structural.long-block', '块注释至少包含五行，检查是否混入了流程复述或历史说明。');
  if (significantLines.length === 1 && BANNER_PATTERN.test(significantLines[0])) addIssue(issues, comment, 'comment.navigation-banner', '纯分隔符注释通常只提供视觉导航，可考虑删除。');
  if (lines.some((line) => line.length > 180)) addIssue(issues, comment, 'comment.structural.long-line', '注释单行超过 180 个字符，可能承载过多实现叙述。');

  if (matchesAny(SPEC_MARKERS, content) && !contract) addIssue(issues, comment, 'comment.spec.task-marker', '注释包含任务、审计或路线图标记，应改为当前架构事实或移入文档。');
  if (matchesAny(PHASE_MARKERS, content) && !contract) addIssue(issues, comment, 'comment.spec.phase-marker', '注释包含内部 Phase/Step/stage 标记，文件结构或能力名称可能已足够表达。');
  if (matchesAny(TICKET_MARKERS, content) && !contract) addIssue(issues, comment, 'comment.spec.ticket-marker', '注释包含任务号、提交号或设计文档引用。');
  if (matchesAny(VERSION_DATE_MARKERS, content) && !contract) addIssue(issues, comment, 'comment.spec.version-date-marker', '注释包含可能随时间失效的版本或日期信息。');
  if (matchesAny(HISTORY_MARKERS, content) && !contract) addIssue(issues, comment, 'comment.history.migration', '注释描述旧实现或迁移历史，确认是否仍是当前行为必需的兼容说明。');
  if (/legacy|deprecated|obsolete/iu.test(content) && !contract) addIssue(issues, comment, 'comment.history.legacy', '注释包含 legacy/废弃兼容说明，避免保留纯历史背景。');
  if (matchesAny(ROADMAP_MARKERS, content)) addIssue(issues, comment, 'comment.roadmap.todo', '注释包含未完成、未来或占位语义，应删除、改成当前事实或转正式 issue。');
  if (matchesAny(WORKAROUND_MARKERS, content)) addIssue(issues, comment, 'comment.workaround', '注释包含临时方案标记，应确认是否仍需要保留。');

  const hasHow = matchesAny(HOW_MARKERS, content);
  const hasWhy = matchesAny(WHY_MARKERS, content);
  if (!contract && hasHow && !hasWhy && (comment.lineCount >= 2 || content.length >= 80)) {
    addIssue(issues, comment, 'comment.how-only', '注释更像是在复述实现步骤、职责或接线方式，未发现明确 why。');
  }
  if (!contract && matchesAny(RESPONSIBILITY_MARKERS, content) && content.length >= 45) {
    addIssue(issues, comment, 'comment.redundant-responsibility', '注释可能只是重复模块/组件职责，检查是否可由名称、类型或调用关系替代。');
  }
  if (!contract && matchesAny(NEGATION_MARKERS, content) && !hasWhy && content.length >= 50) {
    addIssue(issues, comment, 'comment.negation-only', '注释包含否定或范围限定，但没有解释该限制存在的原因。');
  }
  if (!contract && matchesAny(ABSOLUTE_MARKERS, content) && !hasWhy && content.length >= 35) {
    addIssue(issues, comment, 'comment.absolute-claim', '注释包含唯一、永远、所有、不会等绝对断言，需确认是否会随架构变化而过时。');
  }
  if (comment.kind === 'line' && COMMENTED_CODE_PATTERN.test(content.trim())) {
    addIssue(issues, comment, 'comment.commented-code', '注释内容看起来像被禁用的代码。');
  }
  if (LINT_SUPPRESSION_PATTERN.test(content)) addIssue(issues, comment, 'comment.lint-suppression', 'lint/type suppression 应包含针对当前约束的简短 why。');
  if (matchesAny(DEAD_CODE_MARKERS, content)) addIssue(issues, comment, 'comment.dead-code-claim', '注释声称无调用方、未使用或不再导入，应与全仓引用结果核对。');
  if (/未来|以后|暂未实现|未实现|当前阶段/iu.test(content)) addIssue(issues, comment, 'comment.possible-stale-claim', '注释描述未来或当前阶段状态，需确认是否已被代码变动淘汰。');
}

function analyzeFile(relativePath, text) {
  const extension = path.extname(relativePath).toLowerCase();
  const starts = lineStarts(text);
  const comments = extractComments(text, extension).map((comment) => materializeComment(text, starts, comment));
  const issues = [];
  for (const comment of comments) analyzeComment(comment, issues);

  for (let index = 0; index < comments.length; index += 1) {
    const current = comments[index];
    if (current.kind !== 'line') continue;
    let next = index + 1;
    while (next < comments.length && comments[next].kind === 'line' && comments[next].line === comments[next - 1].endLine + 1) next += 1;
    const count = next - index;
    if (count >= 3) {
      addIssue(issues, current, 'comment.structural.consecutive-lines', `连续 ${count} 行 // 注释，检查是否应压缩为 why 或删除。`, { consecutiveLines: count });
      index = next - 1;
    }
  }
  return { comments, issues };
}

function severityAtLeast(value, minimum) {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[minimum];
}

function formatIssue(relativePath, issue) {
  return `${relativePath}:${issue.line}:${issue.column} [${issue.severity}] ${issue.rule}\n  ${issue.message}\n  ${issue.snippet}`;
}

function summarize(issues) {
  const byRule = {};
  const bySeverity = { low: 0, medium: 0, high: 0 };
  for (const issue of issues) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
    bySeverity[issue.severity] += 1;
  }
  return { total: issues.length, bySeverity, byRule };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.listRules) return printRules();

  const root = options.root;
  const allFiles = options.changed ? changedFiles(root) ?? await collectFiles(root) : await collectFiles(root);
  const files = allFiles.filter((file) => path.basename(file) !== path.basename(import.meta.filename) || path.dirname(file) !== path.dirname(import.meta.filename));
  const findings = [];
  let commentCount = 0;

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const result = analyzeFile(relativePath, text);
    commentCount += result.comments.length;
    for (const issue of result.issues) {
      if (options.rules.size && !options.rules.has(issue.rule)) continue;
      if (!severityAtLeast(issue.severity, options.minimumSeverity)) continue;
      findings.push({ file: relativePath, ...issue });
    }
  }

  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
  const summary = summarize(findings);
  const output = {
    root,
    mode: options.changed ? 'changed' : 'all',
    filesScanned: files.length,
    commentsScanned: commentCount,
    summary,
    findings,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(`Scanned ${files.length} files and ${commentCount} comments. Found ${summary.total} candidates.\n`);
    process.stdout.write(`Severity: high=${summary.bySeverity.high}, medium=${summary.bySeverity.medium}, low=${summary.bySeverity.low}\n`);
    const visible = findings.slice(0, options.max);
    if (!visible.length) process.stdout.write('No candidates matched the selected rules.\n');
    else for (const issue of visible) process.stdout.write(`${formatIssue(issue.file, issue)}\n`);
    if (visible.length < findings.length) process.stdout.write(`Output truncated to ${options.max} findings; use --json for the complete result.\n`);
  }

  if (summary.total > 0 && !options.noFail) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
