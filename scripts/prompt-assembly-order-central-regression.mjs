// 提示词八区重组与消息模式分流 · 集中回归（2026-08-12 工作包 A-H）
// 直接驱动生产函数（esbuild 编译 scripts/_central-asserts.ts）。
// 运行：node scripts/prompt-assembly-order-central-regression.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-assembly-central-'));

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* continue */ }
  }
  throw new Error(`无法解析工作区导入: ${specifier}`);
}

const entryPath = path.join(root, 'scripts', '_central-asserts.ts');
const outfile = path.join(outDir, 'central-asserts.mjs');
await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  plugins: [{
    name: 'workspace-resolver',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const resolved = await resolveWorkspaceImport(args.path);
        return { path: resolved };
      });
    },
  }],
  logLevel: 'silent',
});

await import(pathToFileURL(outfile).href);

const sendWorkflowSource = await fs.readFile(path.join(root, 'hooks', 'useGame', 'sendWorkflow.ts'), 'utf8');
const contextSnapshotSource = await fs.readFile(path.join(root, 'hooks', 'useGame', 'contextSnapshot.ts'), 'utf8');
const systemPromptBuilderSource = await fs.readFile(path.join(root, 'hooks', 'useGame', 'systemPromptBuilder.ts'), 'utf8');
const tavernBuilderSource = await fs.readFile(path.join(root, 'hooks', 'useGame', 'tavernMessageChainBuilder.ts'), 'utf8');
const promptAssemblyContextSource = await fs.readFile(path.join(root, 'hooks', 'useGame', 'promptAssemblyContext.ts'), 'utf8');

function assertSource(condition, message) {
  if (!condition) throw new Error(message);
}

assertSource(!sendWorkflowSource.includes('const worldbookPlan = isOpeningSystemTrigger ? null'), '开局不得跳过单次 worldbook plan。');
assertSource(sendWorkflowSource.includes('resolvePromptWorldbookPlan('), '真实发送必须使用共享的确定性 worldbook plan 入口。');
assertSource(contextSnapshotSource.includes('resolvePromptWorldbookPlan('), '上下文快照必须使用共享的确定性 worldbook plan 入口。');
assertSource(promptAssemblyContextSource.includes('buildPromptWorldbookContext') && promptAssemblyContextSource.includes('buildPromptMacroContext'), '发送与快照必须共享 worldbook/macro 上下文构造器。');
assertSource(!systemPromptBuilderSource.includes('buildPromptLikeWorldbookInjection(worldbooks'), '开局 builder 不得通过旧包装器重新解析规则/常驻世界书。');
assertSource(!systemPromptBuilderSource.includes('buildWorldbookInjection(worldbooks'), '开局 builder 不得通过旧包装器重新解析关键词世界书。');
assertSource(!systemPromptBuilderSource.includes('buildWorldbookChatModuleMessages(worldbooks'), '开局 builder 不得通过旧包装器重新解析 depth 世界书。');
assertSource(contextSnapshotSource.includes(': isPathAwakeningTurn\n      ? buildPathAwakeningSystemPrompt('), '狭间上下文快照必须使用专用 builder。');
assertSource(sendWorkflowSource.includes('if (!isPathAwakeningTurn && state.gameSettings.手机系统.enabled'), '狭间回合必须跳过 fallback 手机种子。');
assertSource(sendWorkflowSource.includes('&& !tavernV2Messages') && sendWorkflowSource.includes('&& !isOpeningSystemTrigger') && sendWorkflowSource.includes('&& !isPathAwakeningTurn'), 'DeepSeek 主剧情守卫必须排除 Tavern V2、opening 与 pathAwakening。');
assertSource(contextSnapshotSource.includes('&& !tavernStatus.used') && contextSnapshotSource.includes('&& !isOpeningSystemTrigger') && contextSnapshotSource.includes('&& !isPathAwakeningTurn'), '上下文快照必须与真实发送使用同一 DeepSeek/Tavern/scope 门禁。');
assertSource(sendWorkflowSource.includes('deps.rerollContext && !rerollSimilarityRetried && rerollSimilarity >= 0.86'), '重 Roll 相似度 guard 每轮只能追加一次。');
assertSource(tavernBuilderSource.includes('if (!historyInjected)'), 'Tavern 重复 chatHistory 槽必须有唯一性门禁。');
assertSource(tavernBuilderSource.includes('if (!latestInputInjected && params.latestUserInput)'), 'Tavern 重复 input 槽必须有唯一性门禁。');
assertSource(sendWorkflowSource.includes('if (isOpeningSystemTrigger && !tavernV2Messages)'), 'Tavern 开局生效时不得再次追加 opening turnConstraint。');
assertSource(sendWorkflowSource.includes('if (isAwakeningEnterTrigger && awakeningInstruction && !tavernV2Messages)'), 'Tavern 踏入狭间生效时不得再次追加 awakening turnConstraint。');
assertSource(contextSnapshotSource.includes('if (isOpeningSystemTrigger && !tavernStatus.used)'), '快照必须与真实发送使用相同的 Tavern 开局指令去重门禁。');
assertSource(sendWorkflowSource.includes('getPathAwakeningHistoryWindow(updatedHistory, awakeningPhase)'), '真实发送必须使用狭间阶段专用历史窗口。');
assertSource(contextSnapshotSource.includes('getPathAwakeningHistoryWindow(recallHistory, awakeningPhase)'), '快照必须使用狭间阶段专用历史窗口。');
assertSource(tavernBuilderSource.includes('cotPrompt: cotCompatReference') && tavernBuilderSource.includes('formatPrompt: formatCompatReference'), 'Tavern {{cot}}/{{format}} 必须展开为短兼容引用，不能传入原生区8全文。');
assertSource(systemPromptBuilderSource.includes('zhikuCompilation?: ZhikuTurnCompilation') && systemPromptBuilderSource.includes('buildOpeningAbilitySections'), '开局 builder 必须支持必要智库与按需能力资料。');

await fs.rm(outDir, { recursive: true, force: true });
console.log('\nprompt-assembly-order-central-regression: 全部通过');
