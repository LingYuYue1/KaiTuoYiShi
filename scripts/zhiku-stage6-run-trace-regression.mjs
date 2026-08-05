import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage6-trace-${process.pid}-${Date.now()}.mjs`);

const characterInjection = (name, form) => ({
  类型: 'character',
  核心身份与阵营: `${name}身份`,
  独立人格与行为: `${name}人格`,
  外貌锚点: `${form}外貌`,
  说话方式: `${name}说话方式`,
  台词语料: `${name}台词`,
  当前形态与能力边界: `${form}能力边界`,
  精简角色故事: `${name}精简故事`,
  演绎红线: `${name}演绎红线`,
});

const loreInjection = (name) => ({
  类型: 'lore',
  核心定义: `${name}定义`,
  关键事实: `${name}事实`,
  叙事用途: `${name}用途`,
  演绎边界: `${name}边界`,
});

const entry = (overrides) => ({
  id: overrides.id,
  标题: overrides.标题,
  分类: overrides.分类 ?? 'character',
  摘要: '',
  原文: `完整预览原文-${overrides.id}-不得进入trace`,
  注入内容: overrides.注入内容,
  关键词: overrides.关键词 ?? [],
  触发关键词: overrides.触发关键词 ?? overrides.关键词 ?? [],
  辅助关键词: [],
  互斥组ID: overrides.互斥组ID,
  资料类型: overrides.资料类型,
  关联角色ID: overrides.关联角色ID,
  关联形态ID: overrides.关联形态ID,
  解锁状态: overrides.解锁状态,
  剧透等级: overrides.剧透等级,
  使用范围: overrides.使用范围 ?? ['主剧情'],
  可否主剧情注入: overrides.可否主剧情注入 ?? true,
  关联条目ID: [],
  重要度: 5,
  可用于联动: true,
  builtin: true,
  createdAt: 1,
  updatedAt: overrides.updatedAt ?? 1,
});

try {
  await build({
    stdin: {
      contents: [
        "export * from './services/zhikuRuntimeCompiler';",
        "export * from './services/zhikuRunTrace';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage6-run-trace-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: bundlePath,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  const runtime = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const system = {
    目录版本: 'stage6-fixture-v1',
    目录修订: 42,
    条目: [
      entry({
        id: 'TRACE-DH-BASE',
        标题: '丹恒',
        关键词: ['丹恒'],
        互斥组ID: 'character:danheng:form',
        资料类型: '主体档案',
        关联角色ID: '丹恒',
        关联形态ID: '常态',
        注入内容: characterInjection('丹恒', '常态'),
        updatedAt: 1,
      }),
      entry({
        id: 'TRACE-DH-IL',
        标题: '丹恒·饮月',
        关键词: ['丹恒·饮月', '饮月'],
        互斥组ID: 'character:danheng:form',
        资料类型: '形态档案',
        关联角色ID: '丹恒',
        关联形态ID: '饮月',
        注入内容: characterInjection('丹恒', '饮月'),
        updatedAt: 2,
      }),
      entry({
        id: 'TRACE-LORE',
        标题: '持明族',
        分类: 'faction',
        关键词: ['持明族'],
        注入内容: loreInjection('持明族'),
      }),
      entry({
        id: 'TRACE-BLOCKED',
        标题: '未解锁重大秘密',
        分类: 'term',
        关键词: ['秘密'],
        解锁状态: '未解锁',
        剧透等级: '重大',
        注入内容: loreInjection('重大秘密'),
      }),
      entry({
        id: 'TRACE-STORY',
        标题: '只读剧情档案',
        分类: 'story',
        关键词: ['剧情档案'],
        注入内容: loreInjection('剧情档案'),
      }),
    ],
  };

  const compilation = runtime.compileZhikuTurn({
    system,
    query: '丹恒·饮月提到了持明族秘密和剧情档案。',
    limit: 8,
    scope: 'main',
    participation: { present: ['丹恒'], anticipated: [], mentioned: [], background: [] },
    sceneContext: { presentNpcNamesForFallback: ['丹恒'] },
  });
  const trace = compilation.runTrace;

  assert(trace.schemaVersion === 1, 'trace schema version must be explicit');
  assert(trace.compileId === compilation.compileId, 'trace and compilation must share one compile identity');
  assert(trace.catalogVersion === 'stage6-fixture-v1' && trace.catalogRevision === 42, 'trace must retain catalog version and revision');
  assert(trace.inputSummaryHash && !JSON.stringify(trace).includes(compilation.mainStoryInjection), 'trace must store an input hash instead of copying the full injection');
  assert(trace.finalSelection.allIds.join('|') === compilation.entries.map((item) => item.id).join('|'), 'trace must derive final IDs from the existing compiler result');
  assert(trace.finalSelection.allIds.includes('TRACE-DH-IL') && !trace.finalSelection.allIds.includes('TRACE-DH-BASE'), 'mutually exclusive forms must keep only the explicit legal form');
  assert(!trace.finalSelection.allIds.includes('TRACE-BLOCKED'), 'blocked entries must never enter final selection');
  assert(!trace.finalSelection.allIds.includes('TRACE-STORY'), 'story archives must never enter the Zhiku payload');

  const retainedForm = trace.candidates.find((item) => item.entryId === 'TRACE-DH-IL');
  const replacedForm = trace.candidates.find((item) => item.entryId === 'TRACE-DH-BASE');
  const blocked = trace.candidates.find((item) => item.entryId === 'TRACE-BLOCKED');
  assert(retainedForm?.decision === 'selected' && retainedForm.channels.includes('keyword'), 'selected form must expose its keyword channel');
  assert(replacedForm?.decision === 'replaced' && replacedForm.replacement?.retainedEntryId === 'TRACE-DH-IL', 'replaced form must point to the retained stable ID');
  assert(blocked?.decision === 'filtered' && blocked.gate.passed === false && blocked.gate.reason, 'blocked entry must expose a machine-readable gate result');
  assert(!JSON.stringify(trace).includes('完整预览原文-'), 'trace must not copy full preview archive text');

  const payloadBefore = JSON.stringify({
    systemPrompt: compilation.mainStoryInjection,
    messages: [{ role: 'user', content: '继续。' }],
  });
  const actualTrace = runtime.attachZhikuRequestReceipt(trace, {
    kind: 'actual',
    requestHash: 'actual-hash',
    predictedRequestHash: 'predicted-hash',
    provider: 'fixture-provider',
    model: 'fixture-model',
    transport: 'fixture',
    endpoint: 'fixture',
    mode: 'native',
    streaming: false,
    prefixApplied: false,
    finishReason: 'stop',
    usage: { source: 'api', inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationSec: 1.2,
    differenceReasons: ['fixture difference'],
  });
  const payloadAfter = JSON.stringify({
    systemPrompt: compilation.mainStoryInjection,
    messages: [{ role: 'user', content: '继续。' }],
  });
  assert(payloadBefore === payloadAfter, 'attaching diagnostics must not mutate or rebuild the model payload');
  assert(!trace.requestReceipt && actualTrace.requestReceipt?.finishReason === 'stop', 'receipt attachment must be immutable and preserve finishReason');

  const sendWorkflow = fs.readFileSync(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
  const contextSnapshot = fs.readFileSync(path.join(root, 'hooks/useGame/contextSnapshot.ts'), 'utf8');
  const chatModel = fs.readFileSync(path.join(root, 'models/chat.ts'), 'utf8');
  assert(sendWorkflow.includes('zhikuRunTrace: zhikuActualTrace') && sendWorkflow.includes('zhikuFinishReason: result.finishReason'), 'real assistant debugContext must persist trace and finishReason');
  assert(contextSnapshot.includes('智库本回合结构化预演') && contextSnapshot.includes('智库上一回合结构化实发'), 'context snapshot must distinguish prediction from actual trace');
  assert(chatModel.includes('zhikuCatalogRevision?: number') && chatModel.includes('zhikuRequestDifferenceReasons?: string[]'), 'chat debug contract must retain revision and prediction/actual difference reasons');

  console.log(JSON.stringify({
    compileId: trace.compileId,
    finalIds: trace.finalSelection.allIds,
    candidateCount: trace.candidates.length,
    blockedReason: blocked.gate.reason,
  }));
  console.log('ZHIKU_STAGE6_RUN_TRACE_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
