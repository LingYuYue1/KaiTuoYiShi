// Story Runtime Authority Inventory（G0 阶段 0 交付物）
//
// 依据：docs/superpowers/specs/2026-08-06-story-composition-v3-implementation-plan.md
//   - 2.5.2/2.5.3 全仓写入审计与 owner 分区
//   - 阶段 0：`story-runtime-authority-inventory.mjs`：输出 2.5.3 全仓写/读入口清单和 hash
//
// 本脚本只读扫描生产源码，不写任何生产状态。它列出所有可能写入或推进以下内容的入口：
//   剧情状态 / 动态世界或世界事件 / 新闻 / NPC 知情状态 / 正文发布 / 重 roll-读档分支状态 / 存档持久化
//
// 分类规则（禁止只做关键词计数）：
//   - 每个命中先用固定模式定位，再用 TypeScript AST 对命中行做上下文分类（call /
//     capability_pass / field_write / field_read / definition / string_or_comment_reference），
//     无法定位上下文的行标记为 `needsManualReview` 并归入 manual_review 类别。
//   - 每条命中输出：file/line/symbol、kind（计划规定的 kind 枚举）、ownerClassification、
//     risk（P0-P3）、plannedClosureStage、category（真实写入点 / setter 传递或暴露点 /
//     只读消费点 / 需人工复核点）。
//   - 新模式未带完整分类元数据时直接抛错退出码 1，禁止靠 allowlist 默默忽略。
//
// 五条单独红线（每条均给出证据行）：
//   RL1 load/hydrate/migrate/restore/reroll/turnSnapshot 普通路径调用 opening align 或 auto align
//   RL2 新闻模型/UI 直接 set新闻
//   RL3 主剧情或变量模型直接写 世界.全局事件
//   RL4 NarrativePublicationGate 前写 streamingMessage/chatHistory
//   RL5 手机/NPC prompt 从新闻或全局字符串推断角色已知

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const REQUIRED_AUDIT_FILES = [
  'utils/variableExecutor.ts',
  'utils/variableFacts.ts',
  'utils/variableRegistry.ts',
  'hooks/useGame/sendWorkflow.ts',
  'hooks/useGame/newsWorkflow.ts',
  'hooks/useGame/saveLoadWorkflow.ts',
  'hooks/useGame/turnSnapshot.ts',
  'hooks/useGame.ts',
  'hooks/useGameState.ts',
  'App.tsx',
  'components/features/NewGame/NewGameWizard.tsx',
  'data/storyWeavingPreset.ts',
  'components/features/Settings/VariableManager.tsx',
  'components/features/Path/PathAwakeningInvitation.tsx',
  'components/features/Path/PathDebugView.tsx',
  'components/features/GameSystems/PlotPanel.tsx',
  'utils/saveDeltaStorage.ts',
  'models/queueTask.ts',
  'hooks/useGame/systemPromptBuilder.ts',
  'hooks/useGame/tavernMessageChainBuilder.ts',
  'hooks/useGame/historyWindow.ts',
  'hooks/useGame/memoryUtils.ts',
];

// 计划允许的扫描根目录；App.tsx 单独允许。
const ALLOWED_SCAN_ROOTS = new Set(['App.tsx', 'hooks', 'services', 'utils', 'components', 'data', 'models', 'prompts']);

const PLAN_KINDS = new Set([
  'setter_call',
  'setter_capability_pass',
  'persistence_write',
  'legacy_read',
  'align_or_progress',
  'command_registry',
  'projection_write',
]);

// 模式定义。ambiguous 为 true 时，AST 必须区分读写上下文，否则标 needsManualReview。
const PATTERNS = [
  { symbol: 'set世界()', kind: 'setter_call', test: /\bset世界\s*\(/u, owner: 'legacy_owner', risk: 'P1', stage: 'S5', ambiguous: false },
  { symbol: 'set世界 exposure', kind: 'setter_capability_pass', test: /\bset世界\s*:/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: 'set新闻()', kind: 'setter_call', test: /\bset新闻\s*\(/u, owner: 'legacy_owner', risk: 'P0', stage: 'S5', ambiguous: false },
  { symbol: 'set新闻 exposure', kind: 'setter_capability_pass', test: /\bset新闻\s*:/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: 'set剧情编织()', kind: 'setter_call', test: /\bset剧情编织\s*\(/u, owner: 'legacy_owner', risk: 'P1', stage: 'S5', ambiguous: false },
  { symbol: 'set剧情编织 exposure', kind: 'setter_capability_pass', test: /\bset剧情编织\s*:/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: 'storyWeavingSystem setting write', kind: 'persistence_write', test: /saveSetting\s*(?:<[^>]+>)?\s*\(\s*['"]storyWeavingSystem['"]/u, owner: 'legacy_owner', risk: 'P2', stage: 'S3', ambiguous: false },
  { symbol: 'storyWeavingSystem setting update', kind: 'persistence_write', test: /updateSetting\s*(?:<[^>]+>)?\s*\(\s*['"]storyWeavingSystem['"]/u, owner: 'legacy_owner', risk: 'P2', stage: 'S3', ambiguous: false },
  { symbol: 'appendWorldEvents()', kind: 'projection_write', test: /\bappendWorldEvents\s*\(/u, owner: 'compatibility_projection', risk: 'P1', stage: 'S4', ambiguous: false },
  { symbol: '世界.全局事件 command', kind: 'command_registry', test: /世界\.全局事件/u, owner: 'legacy_owner', risk: 'P0', stage: 'S2', ambiguous: false },
  { symbol: '全局事件 field', kind: 'legacy_read', test: /全局事件/u, owner: 'read_only', risk: 'P2', stage: 'S4', ambiguous: true },
  { symbol: 'worldEvents field', kind: 'legacy_read', test: /\bworldEvents\b/u, owner: 'read_only', risk: 'P3', stage: 'S4', ambiguous: true },
  { symbol: 'autoAlignCanonStoryProgress()', kind: 'align_or_progress', test: /\bautoAlignCanonStoryProgress\s*\(/u, owner: 'legacy_owner', risk: 'P1', stage: 'S5', ambiguous: false },
  { symbol: 'alignStoryWeavingToOpeningArchive()', kind: 'align_or_progress', test: /\balignStoryWeavingToOpeningArchive\s*\(/u, owner: 'compatibility_projection', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: '剧情规划 field', kind: 'legacy_read', test: /剧情规划/u, owner: 'read_only', risk: 'P2', stage: 'S5', ambiguous: true },
  { symbol: 'storyPlan field', kind: 'legacy_read', test: /\bstoryPlan\b/u, owner: 'read_only', risk: 'P2', stage: 'S5', ambiguous: true },
  { symbol: 'news root callback', kind: 'setter_capability_pass', test: /\bonNewsChange\b/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: 'story weaving root callback', kind: 'setter_capability_pass', test: /\bonStoryWeavingChange\b/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
  { symbol: 'world root callback', kind: 'setter_capability_pass', test: /\bon世界Change\b/u, owner: 'legacy_owner', risk: 'P2', stage: 'S5', ambiguous: false },
];

// 按 文件 + symbol 覆盖默认 owner/risk/stage。键格式 `${file}::${symbol}`。
const OVERRIDES = new Map([
  ['hooks/useGame/sendWorkflow.ts::autoAlignCanonStoryProgress()', { owner: 'legacy_owner', risk: 'P1', stage: 'S5' }],
  ['hooks/useGame/sendWorkflow.ts::appendWorldEvents()', { owner: 'compatibility_projection', risk: 'P1', stage: 'S4' }],
  ['hooks/useGame/sendWorkflow.ts::全局事件 field', { owner: 'compatibility_projection', risk: 'P1', stage: 'S4' }],
  ['hooks/useGame/sendWorkflow.ts::worldEvents field', { owner: 'compatibility_projection', risk: 'P2', stage: 'S4' }],
  ['hooks/useGame/newsWorkflow.ts::set新闻()', { owner: 'legacy_owner', risk: 'P0', stage: 'S5' }],
  ['hooks/useGame/saveLoadWorkflow.ts::autoAlignCanonStoryProgress()', { owner: 'legacy_owner', risk: 'P0', stage: 'S5' }],
  ['hooks/useGame/saveLoadWorkflow.ts::alignStoryWeavingToOpeningArchive()', { owner: 'legacy_owner', risk: 'P0', stage: 'S5' }],
  ['hooks/useGame/turnSnapshot.ts::autoAlignCanonStoryProgress()', { owner: 'legacy_owner', risk: 'P0', stage: 'S5' }],
  ['hooks/useGame/turnSnapshot.ts::alignStoryWeavingToOpeningArchive()', { owner: 'legacy_owner', risk: 'P0', stage: 'S5' }],
  ['utils/variableExecutor.ts::世界.全局事件 command', { owner: 'legacy_owner', risk: 'P0', stage: 'S2' }],
  ['utils/variableFacts.ts::全局事件 field', { owner: 'compatibility_projection', risk: 'P2', stage: 'S2' }],
  ['utils/variableRegistry.ts::全局事件 field', { owner: 'read_only', risk: 'P3', stage: 'retain' }],
  ['components/features/Settings/VariableManager.tsx::set剧情编织()', { owner: 'gameplay_owner', risk: 'P1', stage: 'S5' }],
  ['components/features/Settings/VariableManager.tsx::set剧情编织 exposure', { owner: 'gameplay_owner', risk: 'P2', stage: 'S5' }],
  ['components/features/GameSystems/PlotPanel.tsx::set剧情编织()', { owner: 'legacy_owner', risk: 'P1', stage: 'S5' }],
  ['components/features/Path/PathAwakeningInvitation.tsx::set世界()', { owner: 'gameplay_owner', risk: 'P1', stage: 'S5' }],
  ['components/features/Path/PathDebugView.tsx::set世界()', { owner: 'gameplay_owner', risk: 'P1', stage: 'S5' }],
  ['components/features/NewGame/NewGameWizard.tsx::set世界()', { owner: 'gameplay_owner', risk: 'P1', stage: 'S3' }],
  ['components/features/NewGame/NewGameWizard.tsx::全局事件 field', { owner: 'gameplay_owner', risk: 'P2', stage: 'S3' }],
  ['hooks/useGame.ts::set剧情编织()', { owner: 'legacy_owner', risk: 'P1', stage: 'S5' }],
  ['hooks/useGame.ts::set新闻()', { owner: 'legacy_owner', risk: 'P1', stage: 'S5' }],
  ['hooks/useGame.ts::set世界()', { owner: 'legacy_owner', risk: 'P1', stage: 'S5' }],
  ['hooks/useGame.ts::set世界 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['hooks/useGame.ts::set新闻 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['hooks/useGame.ts::set剧情编织 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['hooks/useGameState.ts::set世界 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['hooks/useGameState.ts::set新闻 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['hooks/useGameState.ts::set剧情编织 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['App.tsx::set世界 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['App.tsx::set新闻 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['App.tsx::set剧情编织 exposure', { owner: 'legacy_owner', risk: 'P2', stage: 'S5' }],
  ['data/storyWeavingPreset.ts::alignStoryWeavingToOpeningArchive()', { owner: 'compatibility_projection', risk: 'P2', stage: 'S5' }],
  ['hooks/useGame/systemPromptBuilder.ts::全局事件 field', { owner: 'read_only', risk: 'P0', stage: 'S5' }],
  ['hooks/useGame/systemPromptBuilder.ts::剧情规划 field', { owner: 'read_only', risk: 'P2', stage: 'S5' }],
  ['utils/saveDeltaStorage.ts::storyWeavingSystem setting write', { owner: 'legacy_owner', risk: 'P2', stage: 'S3' }],
  ['utils/saveDeltaStorage.ts::storyWeavingSystem setting update', { owner: 'legacy_owner', risk: 'P2', stage: 'S3' }],
  ['models/queueTask.ts::剧情规划 field', { owner: 'gameplay_owner', risk: 'P2', stage: 'S3' }],
  ['models/queueTask.ts::storyPlan field', { owner: 'gameplay_owner', risk: 'P2', stage: 'S3' }],
]);

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function listTrackedProductionFiles(root) {
  const output = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return output
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter((file) => /\.(?:ts|tsx|js|jsx)$/u.test(file))
    .filter((file) => {
      const top = file.split('/')[0];
      return file === 'App.tsx' || ALLOWED_SCAN_ROOTS.has(top);
    });
}

function readHead(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function lineStartsOf(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

// 返回包含 line(1-based) 行首 token 的所有祖先节点（按跨度从大到小），最深的在末尾。
// 包含规则：节点起始于目标行（token 起始 >= 行首非空白位置且 < 行尾），或节点跨行包含行首 token。
function findNodeContext(sourceFile, lineStarts, line, text) {
  let start = lineStarts[line - 1] ?? 0;
  while (start < text.length && /\s/u.test(text[start])) start += 1;
  const lineEnd = lineStarts[line] ?? text.length;
  const chain = [];
  const visit = (node) => {
    const nodeStart = node.getStart(sourceFile);
    const nodeEnd = node.getEnd();
    const startsOnLine = nodeStart >= start && nodeStart < lineEnd;
    const containsToken = nodeStart <= start && start < nodeEnd;
    if (startsOnLine || containsToken) {
      chain.push(node);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  chain.sort((left, right) => (right.getEnd() - right.getStart(sourceFile)) - (left.getEnd() - left.getStart(sourceFile)));
  return chain;
}

function getNodeKindName(node) {
  return ts.SyntaxKind[node.kind] ?? String(node.kind);
}

function findEnclosingFunctionName(chain) {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index];
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
      return 'anonymous_function';
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      return node.name.getText();
    }
  }
  return 'module_scope';
}

function isWriteTarget(node, sourceFile) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    const op = parent.operatorToken.kind;
    return op === ts.SyntaxKind.EqualsToken
      || op === ts.SyntaxKind.PlusEqualsToken
      || op === ts.SyntaxKind.QuestionQuestionEqualsToken
      || op === ts.SyntaxKind.MinusEqualsToken;
  }
  if (ts.isPrefixUnaryExpression(parent) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) {
    return true;
  }
  return false;
}

function findCallExpressionOnLine(chain, calleeNames) {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index];
    if (!ts.isCallExpression(node)) continue;
    const callee = node.expression.getText();
    if (calleeNames.some((name) => callee === name || callee.endsWith('.' + name))) return node;
  }
  return undefined;
}

function findFieldAccessOnLine(chain, fieldNames) {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index];
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = node.name && typeof node.name.getText === 'function' ? node.name.getText() : '';
      if (fieldNames.some((field) => field === name)) return node;
    }
  }
  return undefined;
}

// AST 上下文分类：返回 { context, enclosingFunction, detail }
function classifyAstContext(file, text, line, pattern, sourceFile, lineStarts) {
  const chain = findNodeContext(sourceFile, lineStarts, line, text);
  if (!chain.length) {
    const trimmed = text.slice(lineStarts[line - 1] ?? 0, lineStarts[line] ?? text.length).trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return { context: 'string_or_comment_reference', enclosingFunction: 'comment', detail: '命中位于注释文本中（无 AST 节点）' };
    }
    return { context: 'unresolved', enclosingFunction: 'unknown', detail: '未能在 AST 中找到包含该行的节点' };
  }
  const enclosingFunction = findEnclosingFunctionName(chain);
  const symbol = pattern.symbol;

  if (/\(\)$/u.test(symbol)) {
    const callee = symbol.replace(/\(\)$/u, '');
    const call = findCallExpressionOnLine(chain, [callee]);
    if (call) {
      return { context: 'call', enclosingFunction, detail: `CallExpression ${callee}()` };
    }
    // 定义站点（函数声明/方法声明/箭头函数名）
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const node = chain[index];
      const name = ts.isFunctionDeclaration(node) && node.name
        ? node.name.text
        : ts.isMethodDeclaration(node) && node.name
          ? node.name.getText()
          : '';
      if (name === callee) {
        return { context: 'definition', enclosingFunction, detail: `函数定义站点（非运行写入点）：${callee}` };
      }
    }
    return { context: 'string_or_comment_reference', enclosingFunction, detail: `标识符 ${callee} 出现在非调用位置` };
  }

  if (symbol === '世界.全局事件 command' || symbol === '全局事件 field' || symbol === 'worldEvents field') {
    const field = symbol.includes('worldEvents') ? 'worldEvents' : '全局事件';
    const access = findFieldAccessOnLine(chain, [field, 'worldEvents']);
    if (access) {
      if (isWriteTarget(access, sourceFile)) {
        return { context: 'field_write', enclosingFunction, detail: `${field} 作为赋值/复合赋值目标` };
      }
      return { context: 'field_read', enclosingFunction, detail: `${field} 被读取` };
    }
    // 字符串/命令注册（变量命令 key、prompt 文本等）
    return { context: 'string_or_comment_reference', enclosingFunction, detail: `${field} 以字符串或命令 key 形式出现` };
  }

  if (symbol === '剧情规划 field' || symbol === 'storyPlan field') {
    const field = symbol === 'storyPlan field' ? 'storyPlan' : '剧情规划';
    const access = findFieldAccessOnLine(chain, [field]);
    if (access) {
      return {
        context: isWriteTarget(access, sourceFile) ? 'field_write' : 'field_read',
        enclosingFunction,
        detail: `${field} ${isWriteTarget(access, sourceFile) ? '作为写入目标' : '被读取'}`,
      };
    }
    return { context: 'string_or_comment_reference', enclosingFunction, detail: `${field} 以字符串/协议标签形式出现` };
  }

  if (/ exposure$/u.test(symbol) || /callback$/u.test(symbol)) {
    const name = symbol.replace(/ exposure$/u, '').replace(/ callback$/u, '');
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const node = chain[index];
      if (ts.isJsxAttribute(node) || ts.isJsxExpression(node) || ts.isPropertyAssignment(node)) {
        return { context: 'capability_pass', enclosingFunction, detail: `${name} 通过 ${getNodeKindName(node)} 传递给消费方` };
      }
    }
    return { context: 'string_or_comment_reference', enclosingFunction, detail: `${name} 出现在非 JSX/属性位置` };
  }

  return { context: 'string_or_comment_reference', enclosingFunction, detail: '常规标识符引用' };
}

function scanFile(root, file, sourceCache) {
  const absolutePath = path.join(root, file);
  if (!fs.existsSync(absolutePath)) return { entries: [], source: null };
  const source = fs.readFileSync(absolutePath, 'utf8');
  const lines = source.split(/\r?\n/u);
  const lineStarts = lineStartsOf(source);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const snippet = lines[index].trim().replace(/\s+/gu, ' ');
    if (!snippet) continue;
    for (const pattern of PATTERNS) {
      if (!pattern.test.test(lines[index])) continue;
      const context = classifyAstContext(file, source, index + 1, pattern, sourceFile, lineStarts);
      const override = OVERRIDES.get(`${file}::${pattern.symbol}`) || {};
      // AST 确认是字段写入目标（赋值/复合赋值左侧）时，legacy_read 提升为真实写入点。
      let kind = pattern.kind;
      if (context.context === 'field_write' && kind === 'legacy_read') kind = 'setter_call';
      if (!PLAN_KINDS.has(kind)) {
        throw new Error(`unclassified pattern symbol: ${pattern.symbol} (kind=${kind})`);
      }
      const ownerClassification = override.owner ?? pattern.owner;
      const risk = override.risk ?? pattern.risk;
      const plannedClosureStage = override.stage ?? pattern.stage;
      const contextIsAmbiguous = context.context === 'unresolved'
        || (pattern.ambiguous && context.context !== 'field_read' && context.context !== 'field_write');
      const needsManualReview = contextIsAmbiguous || context.context === 'unresolved';
      let category = 'read_only';
      if (['setter_call', 'persistence_write', 'align_or_progress', 'projection_write', 'command_registry'].includes(kind)) {
        category = 'real_write';
      } else if (kind === 'setter_capability_pass') {
        category = 'setter_pass';
      } else if (needsManualReview) {
        category = 'manual_review';
      }
      entries.push({
        file,
        line: index + 1,
        symbol: pattern.symbol,
        kind,
        ownerClassification,
        risk,
        plannedClosureStage,
        category,
        context: context.context,
        enclosingFunction: context.enclosingFunction,
        needsManualReview,
        detail: context.detail,
        snippet: snippet.slice(0, 220),
      });
    }
  }
  sourceCache.set(file, source);
  return { entries, source };
}

// ── 五条单独红线 ──────────────────────────────────────────────

function buildRedLines(root, entries, sourceCache) {
  const byFile = (file) => entries.filter((entry) => entry.file === file);
  const alignInLifecycle = byFile('hooks/useGame/saveLoadWorkflow.ts')
    .concat(byFile('hooks/useGame/turnSnapshot.ts'))
    .filter((entry) => ['autoAlignCanonStoryProgress()', 'alignStoryWeavingToOpeningArchive()'].includes(entry.symbol));

  const newsRootWriters = entries.filter((entry) => entry.symbol === 'set新闻()');

  const worldEventWriters = entries.filter((entry) =>
    (entry.file === 'hooks/useGame/sendWorkflow.ts' && entry.symbol === 'appendWorldEvents()')
    || (entry.file === 'utils/variableExecutor.ts' && entry.symbol === '世界.全局事件 command'));

  // RL4：正文/历史写入是否早于剧情判定
  const sendWorkflowSource = sourceCache.get('hooks/useGame/sendWorkflow.ts') || '';
  const sendWorkflowLines = sendWorkflowSource.split(/\r?\n/u);
  const streamingWrites = [];
  const alignmentLines = [];
  const parseLines = [];
  for (let index = 0; index < sendWorkflowLines.length; index += 1) {
    const line = index + 1;
    const text = sendWorkflowLines[index];
    if (/streamMessageSetter\.set\s*\(/u.test(text) || /\bsetStreamingMessage\s*\(/u.test(text) || /\bsetChatHistory\s*\(/u.test(text)) {
      streamingWrites.push({ file: 'hooks/useGame/sendWorkflow.ts', line, symbol: /setChatHistory/u.test(text) ? 'setChatHistory()' : 'streaming write' });
    }
    if (/\bautoAlignCanonStoryProgress\s*\(/u.test(text)) alignmentLines.push(line);
    if (/\bparseResponse\s*\(/u.test(text)) parseLines.push(line);
  }
  const firstAlignment = alignmentLines.length ? Math.min(...alignmentLines) : Infinity;
  const firstParse = parseLines.length ? Math.min(...parseLines) : Infinity;
  const preAdjudicationWrites = streamingWrites.filter((hit) => hit.line < firstAlignment || hit.line < firstParse);

  // RL5：手机/NPC prompt 从新闻或全局字符串推断角色已知
  const rl5Evidence = [];
  const systemPromptSource = sourceCache.get('hooks/useGame/systemPromptBuilder.ts') || '';
  const spLines = systemPromptSource.split(/\r?\n/u);
  for (let index = 0; index < spLines.length; index += 1) {
    const text = spLines[index];
    if (/buildNewsSection\s*\(/u.test(text) || /buildRecentWorldEventsSection\s*\(/u.test(text) || /新闻注入|近期新闻/u.test(text)) {
      rl5Evidence.push({ file: 'hooks/useGame/systemPromptBuilder.ts', line: index + 1, symbol: /buildNewsSection/u.test(text) ? 'buildNewsSection()' : /buildRecentWorldEventsSection/u.test(text) ? 'buildRecentWorldEventsSection()' : '新闻注入段' });
    }
  }
  const newsModelSource = sourceCache.get('services/ai/newsModel.ts') || '';
  const nmLines = newsModelSource.split(/\r?\n/u);
  for (let index = 0; index < nmLines.length; index += 1) {
    if (/(正文|动态世界|剧情|世界)/u.test(nmLines[index]) && /(读取|提取|摘要|摘要来源|来源)/u.test(nmLines[index])) {
      rl5Evidence.push({ file: 'services/ai/newsModel.ts', line: index + 1, symbol: 'news model 从正文/世界/剧情字符串生成' });
    }
  }

  return [
    {
      id: 'RL1',
      title: 'load/hydrate/migrate/restore/reroll/turnSnapshot 普通路径调用 opening align 或 auto align',
      violated: alignInLifecycle.length > 0,
      evidence: alignInLifecycle.map((entry) => ({
        file: entry.file,
        line: entry.line,
        symbol: entry.symbol,
        enclosingFunction: entry.enclosingFunction,
      })),
    },
    {
      id: 'RL2',
      title: '新闻模型/UI 直接 set新闻',
      violated: newsRootWriters.length > 0,
      evidence: newsRootWriters.map((entry) => ({
        file: entry.file,
        line: entry.line,
        symbol: entry.symbol,
        enclosingFunction: entry.enclosingFunction,
      })),
    },
    {
      id: 'RL3',
      title: '主剧情或变量模型直接写 世界.全局事件',
      violated: worldEventWriters.length > 0,
      evidence: worldEventWriters.map((entry) => ({
        file: entry.file,
        line: entry.line,
        symbol: entry.symbol,
        enclosingFunction: entry.enclosingFunction,
      })),
    },
    {
      id: 'RL4',
      title: 'NarrativePublicationGate 前写 streamingMessage/chatHistory',
      violated: preAdjudicationWrites.length > 0,
      evidence: preAdjudicationWrites,
      detail: `第一个 autoAlignCanonStoryProgress 调用在第 ${firstAlignment} 行，第一个 parseResponse 调用在第 ${firstParse} 行`,
    },
    {
      id: 'RL5',
      title: '手机/NPC prompt 从新闻或全局字符串推断角色已知',
      violated: rl5Evidence.length > 0,
      evidence: rl5Evidence,
    },
  ];
}

export function buildAuthorityInventory(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  for (const pattern of PATTERNS) {
    if (!PLAN_KINDS.has(pattern.kind) || !pattern.owner || !pattern.risk || !pattern.stage) {
      throw new Error(`pattern ${pattern.symbol} 缺少完整分类元数据（禁止 allowlist 忽略）`);
    }
  }
  const trackedFiles = listTrackedProductionFiles(root);
  const scanned = new Set(trackedFiles);
  for (const requiredFile of REQUIRED_AUDIT_FILES) {
    if (fs.existsSync(path.join(root, requiredFile))) scanned.add(requiredFile);
  }
  const files = [...scanned].sort((left, right) => left.localeCompare(right, 'en'));
  const sourceCache = new Map();
  const entries = files
    .flatMap((file) => scanFile(root, file, sourceCache).entries)
    .sort((left, right) => (
      left.file.localeCompare(right.file, 'en')
      || left.line - right.line
      || left.symbol.localeCompare(right.symbol, 'en')
    ));
  const coverage = REQUIRED_AUDIT_FILES.map((file) => ({
    file,
    exists: fs.existsSync(path.join(root, file)),
    scanned: scanned.has(file),
    matchCount: entries.filter((entry) => entry.file === file).length,
  }));
  const countsByKind = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.kind))]
      .sort()
      .map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]),
  );
  const categoryCounts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.category))]
      .sort()
      .map((category) => [category, entries.filter((entry) => entry.category === category).length]),
  );
  const manualReviewEntries = entries.filter((entry) => entry.needsManualReview);
  const unresolvedEntries = entries.filter((entry) => entry.context === 'unresolved');
  if (unresolvedEntries.length) {
    throw new Error('存在无法分类的命中（禁止 allowlist 忽略）：'
      + unresolvedEntries.map((entry) => `${entry.file}:${entry.line} ${entry.symbol}`).join(', '));
  }
  const redLines = buildRedLines(root, entries, sourceCache);
  const inventoryHash = sha256(JSON.stringify({ entries, coverage, redLines }));
  return {
    schemaVersion: 'story-runtime-authority-inventory@2',
    sourceHead: readHead(root),
    inventoryHash: 'sha256:' + inventoryHash,
    scannedFileCount: files.length,
    entryCount: entries.length,
    countsByKind,
    categoryCounts,
    manualReviewCount: manualReviewEntries.length,
    redLines,
    coverage,
    entries,
  };
}

function printHumanReport(report) {
  console.log('Story Runtime Authority Inventory');
  console.log('hash: ' + report.inventoryHash);
  console.log('tracked production files scanned: ' + report.scannedFileCount);
  console.log('authority/read entries: ' + report.entryCount);
  console.log('categories: ' + JSON.stringify(report.categoryCounts));
  console.log('kinds: ' + JSON.stringify(report.countsByKind));
  console.log('manual review entries: ' + report.manualReviewCount);
  for (const redLine of report.redLines) {
    console.log((redLine.violated ? 'VIOLATED' : 'clean') + ' | ' + redLine.id + ' | ' + redLine.title);
    for (const evidence of redLine.evidence) {
      console.log('  ' + evidence.file + ':' + evidence.line + ' | ' + (evidence.symbol || '') + (evidence.enclosingFunction ? ' @ ' + evidence.enclosingFunction : ''));
    }
    if (redLine.detail) console.log('  detail: ' + redLine.detail);
  }
  for (const entry of report.entries) {
    console.log(
      [entry.kind, entry.category, entry.ownerClassification, entry.risk, entry.plannedClosureStage, entry.context]
        .join(' | ')
        + ' | ' + entry.file + ':' + entry.line
        + ' | ' + entry.symbol
        + (entry.needsManualReview ? ' | MANUAL_REVIEW: ' + entry.detail : ''),
    );
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    const report = buildAuthorityInventory();
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    const missing = report.coverage.filter((item) => !item.exists || !item.scanned);
    if (missing.length) {
      console.error('authority inventory failed: required files missing from scan: ' + missing.map((item) => item.file).join(', '));
      process.exitCode = 1;
    }
    if (report.redLines.some((line) => !line.violated)) {
      console.error('authority inventory failed: 存在未被当前代码触发的红线（G0 基线要求五条红线均有证据）：'
        + report.redLines.filter((line) => !line.violated).map((line) => line.id).join(', '));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('authority inventory failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

export { REQUIRED_AUDIT_FILES };
