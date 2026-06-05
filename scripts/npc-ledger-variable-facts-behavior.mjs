import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-ledger-facts-'));
const outfile = path.join(outDir, 'variableFacts.bundle.mjs');
const npcOutfile = path.join(outDir, 'npc.bundle.mjs');

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
  entryPoints: [path.join(root, 'utils/variableFacts.ts')],
  outfile,
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

await esbuild.build({
  entryPoints: [path.join(root, 'models/npc.ts')],
  outfile: npcOutfile,
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

const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
const { parseVariableFacts, factsToVariableCommands } = mod;
const npcMod = await import(`${pathToFileURL(npcOutfile).href}?t=${Date.now()}`);
const { selectNpcLedgersForTurn } = npcMod;

const rawText = `<变量事实>
{
  "facts": [
    {
      "type": "npc",
      "id": "npc_march7th",
      "name": "三月七",
      "memory": "三月七把寻找失踪科员的请求交给玩家，并给了备用通讯码。",
      "recentInteraction": "三月七在主控舱段委托玩家寻找失踪科员，并约定用备用通讯码联系。",
      "relationshipStage": "信任中的同行委托",
      "sharedExperiences": ["在主控舱段约定一起追查失踪科员"],
      "openItems": ["帮三月七寻找失踪科员并回传线索"],
      "mustRemember": ["三月七给过玩家备用通讯码，后续联系不能写成陌生人"],
      "evidence": "正文写明三月七交给玩家备用通讯码并委托追查"
    },
    {
      "type": "npc",
      "id": "npc_danheng",
      "name": "丹恒",
      "memory": "丹恒发现玩家隐瞒了星核线索，暂时压下质问但保留警惕。",
      "recentInteraction": "丹恒要求玩家解释星核线索来源，玩家没有完全说明。",
      "relationshipStage": "合作但存在警惕",
      "unresolvedConflicts": ["玩家隐瞒星核线索来源，丹恒尚未完全信任解释"],
      "doNotForget": ["丹恒已经察觉玩家隐瞒星核线索，冲突解决前不能写成毫无芥蒂"],
      "evidence": "正文写明丹恒沉默片刻后要求玩家之后给出完整解释"
    }
  ]
}
</变量事实>`;

const parsed = parseVariableFacts(rawText);
assert(parsed.parseErrors.length === 0, `变量事实不应解析失败：${parsed.parseErrors.join('；')}`);
assert(parsed.facts.length === 2, '应该解析出两条 NPC 事实。');

const state = {
  世界: { 当前时间: '10:00', 当前日期: '琥珀纪 2157.03.07', 开拓天数: 1 },
  NPC: [
    {
      id: 'npc_march7th',
      姓名: '三月七',
      阶位: 'companion',
      好感度: 0,
      关系: 'friend',
      同行: true,
      初见回合: 1,
      最近回合: 10,
      同行记忆: [],
      备注: [],
      原著角色: true,
    },
    {
      id: 'npc_danheng',
      姓名: '丹恒',
      阶位: 'companion',
      好感度: 0,
      关系: 'acquaintance',
      同行: true,
      初见回合: 1,
      最近回合: 10,
      同行记忆: [],
      备注: [],
      原著角色: true,
    },
  ],
  手机: { messageSeeds: [] },
};

const result = factsToVariableCommands(parsed.facts, state, 12, { phoneSeedsEnabled: false });
const keys = result.commands.map((command) => command.key);

for (const key of [
  'NPC[id=npc_march7th].最近互动',
  'NPC[id=npc_march7th].当前关系阶段',
  'NPC[id=npc_march7th].共同经历',
  'NPC[id=npc_march7th].未完成事项',
  'NPC[id=npc_march7th].必须记得',
  'NPC[id=npc_march7th].同行记忆',
  'NPC[id=npc_danheng].最近互动',
  'NPC[id=npc_danheng].当前关系阶段',
  'NPC[id=npc_danheng].未解决冲突',
  'NPC[id=npc_danheng].禁止遗忘',
  'NPC[id=npc_danheng].同行记忆',
]) {
  assert(keys.includes(key), `缺少 NPC 账本命令：${key}`);
}

assert(result.warnings.length === 0, `不应产生警告：${result.warnings.join('；')}`);

const selection = selectNpcLedgersForTurn({
  turnCount: 100,
  limit: 2,
  recentWindow: 15,
  records: [
    {
      id: 'npc_high_1',
      姓名: '高分甲',
      阶位: 'companion',
      好感度: 100,
      关系: 'close',
      同行: false,
      初见回合: 1,
      最近回合: 99,
      同行记忆: [{ id: 'mem_high_1', 回合: 99, 摘要: '近期出现过。', 来源: '变量' }],
      备注: [],
    },
    {
      id: 'npc_high_2',
      姓名: '高分乙',
      阶位: 'companion',
      好感度: 100,
      关系: 'close',
      同行: false,
      初见回合: 1,
      最近回合: 98,
      同行记忆: [{ id: 'mem_high_2', 回合: 98, 摘要: '近期也出现过。', 来源: '变量' }],
      备注: [],
    },
    {
      id: 'npc_protected',
      姓名: '承诺者',
      阶位: 'extra',
      好感度: 0,
      关系: 'stranger',
      同行: false,
      初见回合: 1,
      最近回合: 1,
      同行记忆: [],
      未完成事项: ['玩家答应替承诺者送回关键资料'],
      必须记得: ['承诺者已经把关键资料托付给玩家'],
      备注: [],
    },
  ],
});

assert(selection.selected.length === 2, 'NPC 账本选择应该遵守 limit。');
assert(selection.selected.some((item) => item.npc.姓名 === '承诺者'), '带未完成事项/必须记得的 NPC 必须获得保护事项保底。');
assert(selection.selected.find((item) => item.npc.姓名 === '承诺者')?.reasons.includes('保护事项保底'), '保护事项保底应进入选择原因，便于诊断。');

await fs.rm(outDir, { recursive: true, force: true });

console.log('npc ledger variable facts behavior ok');
