import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-coverage-'));
const outfile = path.join(outDir, 'variableModel.bundle.mjs');
const factsOutfile = path.join(outDir, 'variableFacts.bundle.mjs');

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

await esbuild.build({
  entryPoints: [path.join(root, 'services/ai/variableModel.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [
    {
      name: 'mock-variable-api',
      setup(build) {
        build.onResolve({ filter: /^@\/services\/ai\/chatCompletionClient$/ }, () => ({
          path: 'mock-variable-api',
          namespace: 'coverage-test',
        }));
        build.onLoad({ filter: /.*/, namespace: 'coverage-test' }, () => ({
          contents: `
            const responses = [
              \`<thinking>只提取到三月七的态度变化。</thinking>
<变量事实>{"facts":[{"type":"npc","id":"npc_march7th","name":"三月七","affinityDelta":2,"memory":"三月七认可玩家顺利完成转移。","evidence":"正文写明三月七认可玩家"}]}</变量事实>
<变量更新>set 世界.氛围变化 = "转移完成后的短暂轻松"</变量更新>\`,
              \`<thinking>定向复审确认还遗漏了耗时、抵达地点和获得实体权限卡。</thinking>
<变量事实>{"facts":[{"type":"npc","id":"npc_march7th","name":"三月七","affinityDelta":3,"recentInteraction":"三月七在主控舱段确认转移完成。","memory":"重复输出不应再次结算。","evidence":"重复 NPC"},{"type":"time","mode":"elapsed","minutes":10,"evidence":"十分钟后"},{"type":"location","location":"黑塔空间站·主控舱段","evidence":"抵达主控舱段"},{"type":"item","action":"gain","category":"key","name":"备用权限卡","description":"可用于开启受限舱门的实体权限卡。","quantity":1,"evidence":"获得备用权限卡"}]}</变量事实>
<变量更新></变量更新>\`,
              \`<thinking>只提取到三月七的态度变化。</thinking>
<变量事实>{"facts":[{"type":"npc","id":"npc_march7th","name":"三月七","memory":"三月七认可玩家。","evidence":"正文写明三月七认可玩家"}]}</变量事实>
<变量更新></变量更新>\`,
              \`<thinking>复审响应仍未确认正文中的地点变化。</thinking>
<变量事实>{"facts":[]}</变量事实>
<变量更新></变量更新>\`,
              \`<thinking>只提取到时间推进。</thinking>
<变量事实>{"facts":[{"type":"time","mode":"elapsed","minutes":2,"evidence":"两分钟后"}]}</变量事实>
<变量更新></变量更新>\`,
              \`<thinking>定向复审确认三月七的信任变化应记录。</thinking>
<变量事实>{"facts":[{"type":"npc","id":"npc_march7th","name":"三月七","affinityDelta":2,"recentInteraction":"三月七明确表示更信任玩家的判断。","evidence":"正文明确写出信任提升"}]}</变量事实>
<变量更新></变量更新>\`,
            ];
            export const calls = [];
            export async function chatCompletionNonStream(_config, request) {
              calls.push(request);
              return responses.shift() ?? '<thinking>无补充</thinking><变量事实>{"facts":[]}</变量事实><变量更新></变量更新>';
            }
          `,
          loader: 'js',
        }));
      },
    },
    {
      name: 'workspace-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, async (args) => ({
          path: await resolveWorkspaceImport(args.path),
        }));
      },
    },
  ],
});

await esbuild.build({
  entryPoints: [path.join(root, 'utils/variableFacts.ts')],
  outfile: factsOutfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [
    {
      name: 'workspace-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, async (args) => ({
          path: await resolveWorkspaceImport(args.path),
        }));
      },
    },
  ],
});

try {
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const factsMod = await import(`${pathToFileURL(factsOutfile).href}?t=${Date.now()}`);
  const result = await mod.callVariableModel({
    provider: 'openai',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test',
    model: 'coverage-test',
    maxTokens: 800,
  }, {
    body: '十分钟后，玩家抵达黑塔空间站的主控舱段，并从值守科员手中获得一张备用权限卡。三月七笑着认可了玩家的处理。',
    variableDraft: '时间推进十分钟；地点切换到主控舱段；获得备用权限卡；三月七认可玩家。',
    userInput: '按计划完成转移。',
    turnCount: 12,
    state: {
      旅人: { 背包: [] },
      世界: { 当前时间: '17:59', 当前日期: '琥珀纪 2157.03.08', 当前地点: '黑塔空间站·收容舱段', 当前天气: 'clear', 开拓天数: 2, 全局事件: [] },
      记忆: {},
      忆庭: {},
      智库: {},
      手机: { messageSeeds: [] },
      NPC: [{ id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', 同行: true, 同行记忆: [], 备注: [] }],
      新闻: [],
      剧情: [],
    },
  });

  const parsed = factsMod.parseVariableFacts(result.rawText);
  const types = new Set(parsed.facts.map((fact) => fact.type));
  assert(result.coverage?.reviewAttempted === true, '合法但只覆盖 NPC 的首轮响应必须触发变量覆盖复审。');
  assert(result.coverage?.missingTypes?.join(',') === 'time,location,item', `复审目标应只包含缺失类别，实际为：${result.coverage?.missingTypes?.join(',') ?? '无'}`);
  for (const type of ['npc', 'time', 'location', 'item']) {
    assert(types.has(type), `补写合并后仍缺少 ${type} fact。`);
  }
  assert(parsed.facts.filter((fact) => fact.type === 'npc').length === 1, '补写重复输出同一 NPC 时不得重复结算。');
  assert(parsed.facts.find((fact) => fact.type === 'npc')?.affinityDelta === 2, '同一 NPC 的首轮已接受事实必须保持优先。');
  assert(parsed.facts.find((fact) => fact.type === 'npc')?.recentInteraction === '三月七在主控舱段确认转移完成。', `同一 NPC 的补写新字段必须合并，不能整条丢弃：${JSON.stringify(parsed.facts.find((fact) => fact.type === 'npc'))}`);
  assert((result.rawText.match(/set 世界\.氛围变化/g) ?? []).length === 1, '首轮兼容命令必须保留且只能执行一次。');
  assert(result.coverage?.unresolvedTypes?.length === 0, '补写已覆盖全部高置信度类别，不应残留疑似遗漏。');
  assert(result.coverage?.supplementedTypes?.join(',') === 'time,location,item', '覆盖报告必须记录实际补写的类别。');

  const unresolved = await mod.callVariableModel({
    provider: 'openai',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test',
    model: 'coverage-test',
  }, {
    body: '玩家抵达黑塔空间站的主控舱段，三月七点头认可了玩家。',
    userInput: '进入主控舱段。',
    turnCount: 13,
    state: {
      世界: { 当前地点: '黑塔空间站·收容舱段', 当前天气: 'clear' },
      NPC: [{ id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', 同行: true, 同行记忆: [], 备注: [] }],
    },
  });
  assert(unresolved.coverage?.reviewAttempted === true, '疑似漏写地点时必须触发覆盖复审。');
  assert(unresolved.coverage?.unresolvedTypes?.join(',') === 'location', '复审仍未补写时必须保留 location 未确认警告。');

  const npcCoverage = await mod.callVariableModel({
    provider: 'openai',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test',
    model: 'coverage-test',
  }, {
    body: '两分钟后，三月七认真地点了点头，明确表示比之前更信任玩家的判断。',
    userInput: '把判断依据解释给三月七。',
    turnCount: 14,
    state: {
      世界: { 当前地点: '黑塔空间站·主控舱段', 当前天气: 'clear' },
      NPC: [{ id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', 同行: true, 同行记忆: [], 备注: [] }],
    },
  });
  assert(npcCoverage.coverage?.missingTypes?.join(',') === 'npc', '正文明确出现伙伴信任变化但首轮只写时间时，必须定向补写 npc。');
  assert(factsMod.parseVariableFacts(npcCoverage.rawText).facts.some((fact) => fact.type === 'npc'), '伙伴关系补写必须进入最终 facts。');

  console.log('variable coverage regression ok');
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
