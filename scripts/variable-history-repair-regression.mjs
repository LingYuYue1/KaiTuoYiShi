import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const out = path.join(os.tmpdir(), `variable-history-repair-${process.pid}-${Date.now()}.mjs`);
await build({
  stdin: {
    contents: "export * from './services/variableHistoryRepair'; export * from './utils/variableRepair';",
    resolveDir: root,
    sourcefile: 'variable-history-repair-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: out,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

try {
  const api = await import(`${pathToFileURL(out).href}?v=${Date.now()}`);
  const history = [
    { id: 'u1', role: 'user', content: '检查门禁卡', timestamp: 1, gameTime: '3' },
    { id: 'a1', role: 'assistant', content: '你拿到了门禁卡。', timestamp: 2, gameTime: '3' },
    { id: 'u2', role: 'user', content: '继续', timestamp: 3, gameTime: '4' },
    { id: 'a2', role: 'assistant', content: '你确认门禁卡仍在手中。', timestamp: 4, gameTime: '4' },
  ];
  const candidates = api.listVariableHistoryRepairCandidates(history, []);
  if (candidates.length !== 2 || candidates[0].status !== 'missing') throw new Error('缺失批次候选筛选失败');

  const item = {
    id: 'item-1', category: 'safe', commands: [{ action: 'push', key: '旅人.背包', value: { name: '门禁卡' } }], evidence: [], reason: 'same',
    fact: { id: 'fact-1', fingerprint: 'fact-1', semanticFingerprint: 'semantic-card', type: 'item', fact: { type: 'item', action: 'gain', category: 'key', name: '门禁卡' }, sourceTurn: 3, evidence: [], producedBy: 'history_repair' },
  };
  const makePlan = (id, turn) => ({ id, schemaVersion: 1, mode: 'repair', turn, baseStateFingerprint: 'base', createdAt: turn, analysis: { rawText: '', parsedFacts: { facts: [], parseErrors: [] }, factCommands: { commands: [], notes: [], warnings: [] }, commands: item.commands, results: [], nextState: {}, facts: [item.fact], legacyCommandCount: 0, skippedTravelerProfileLegacyCount: 0 }, items: [{ ...item, id }], safeCommands: item.commands, confirmationCommands: [], conflictItems: [], skippedItems: [] });
  const merged = api.mergeVariableRepairPlans([makePlan('p1', 3), makePlan('p2', 4)]);
  if (merged.items.length !== 1 || merged.safeCommands.length !== 1) throw new Error('跨回合重复事实未去重');
  console.log('variable history repair regression ok');
} finally {
  await fs.rm(out, { force: true });
}
