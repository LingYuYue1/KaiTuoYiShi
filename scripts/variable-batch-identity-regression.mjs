import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-batch-identity-'));
const outfile = path.join(tempDir, 'identity.mjs');

await esbuild.build({
  entryPoints: [path.join(root, 'utils/variableBatchIdentity.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const base = path.join(root, args.path.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
          try {
            await fs.access(candidate);
            return { path: candidate };
          } catch {
            // try next extension
          }
        }
        return { path: base };
      });
    },
  }],
});

try {
  const { linkVariableBatchesToChatHistory, findLinkedVariableBatchAssistant } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const history = [
    { id: 'u-1', role: 'user', content: '第一回合', timestamp: 1, gameTime: '1' },
    { id: 'a-1', role: 'assistant', content: '第一正文', timestamp: 2, gameTime: '琥珀纪 2157.01.01 08:00' },
    { id: 'u-2', role: 'user', content: '第二回合', timestamp: 3, gameTime: '2' },
    { id: 'a-2', role: 'assistant', content: '第二正文', timestamp: 4, gameTime: '琥珀纪 2157.01.01 09:00' },
  ];
  const linked = linkVariableBatchesToChatHistory([
    { id: 'b-1', turn: 1, timestamp: 1, source: 'calibration', results: [] },
  ], history);
  assert(linked[0].associationStatus === 'linked', '唯一旧回合必须迁移为 linked。');
  assert(linked[0].targetMessageId === 'a-1' && linked[0].targetUserMessageId === 'u-1', '旧批次必须绑定对应 user/assistant 消息。');
  assert(typeof linked[0].turnId === 'string' && linked[0].turnId.length > 0, '旧批次迁移必须派生稳定 turnId。');
  assert(findLinkedVariableBatchAssistant(history, linked[0])?.id === 'a-1', 'linked 批次必须能精确取回 assistant。');

  const ambiguous = linkVariableBatchesToChatHistory([
    { id: 'b-2', turn: 2, timestamp: 2, source: 'calibration', results: [] },
    { id: 'b-3', turn: 2, timestamp: 3, source: 'calibration', results: [] },
  ], history);
  assert(ambiguous.every((batch) => batch.associationStatus === 'linked'), '批次本身重复不应改变消息一对一关联。');

  const noMatch = linkVariableBatchesToChatHistory([
    { id: 'b-4', turn: 99, timestamp: 4, source: 'calibration', results: [] },
  ], history);
  assert(noMatch[0].associationStatus === 'unlinked', '找不到正文的旧批次必须标记 unlinked。');
  assert(findLinkedVariableBatchAssistant(history, noMatch[0]) === undefined, 'unlinked 批次不得回退到最新 assistant。');

  console.log('variable batch identity regression ok');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
