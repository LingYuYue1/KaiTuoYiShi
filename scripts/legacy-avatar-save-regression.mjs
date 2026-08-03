import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import ts from 'typescript';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('data/staticAssetManifest.json'));
const source = read('utils/staticAssets.ts').replace(
  "import staticAssetManifest from '@/data/staticAssetManifest.json';",
  `const staticAssetManifest = ${JSON.stringify(manifest)};`,
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}`;
const { resolveStaticAssetReference } = await import(moduleUrl);

const expected = `https://lingkvault.cc.cd${manifest.assets['avatar:asta:03'].path}`;
const legacyReferences = [
  '/assets/builtin-avatars/candidates/asta-03.png',
  'assets/builtin-avatars/candidates/asta-03.png',
  'https://legacy.example.invalid/assets/builtin-avatars/candidates/asta-03.png',
  '/public/assets/builtin-avatars/candidates/asta-03.png',
];

for (const reference of legacyReferences) {
  assert.equal(
    resolveStaticAssetReference(reference),
    expected,
    `legacy avatar reference must migrate to the manifest: ${reference}`,
  );
}

assert.equal(resolveStaticAssetReference('static:avatar:asta:03'), expected, 'logical avatar references must keep resolving');
assert.equal(resolveStaticAssetReference('/assets/builtin-avatars/candidates/not-an-avatar.png'), undefined, 'unknown legacy paths must not guess an asset');

function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-avatar-save-'));
try {
  const outfile = path.join(outDir, 'npc.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'models/npc.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'workspace-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({ path: resolveWorkspaceImport(args.path) }));
      },
    }],
  });
  const npc = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const silverWolf = `https://lingkvault.cc.cd${manifest.assets['avatar:silver-wolf:01'].path}`;
  const guiji = `https://lingkvault.cc.cd${manifest.assets['avatar:guiji:01'].path}`;
  const placeholder = '/assets/static-fallback/avatar-placeholder.webp';

  assert.equal(npc.读取NPC头像({ 姓名: '银狼' }), silverWolf, 'expanded built-in avatars must not depend on the smaller canonical character registry');
  assert.equal(npc.读取NPC头像({ 姓名: '银狼LV.999' }), silverWolf, 'saved NPC display aliases must resolve to their current built-in avatar');
  assert.equal(npc.读取NPC头像({ 姓名: '归寂' }), guiji, 'new character avatars must render outside Zhiku');
  assert.equal(npc.读取NPC头像({ 姓名: '银狼', 头像: placeholder }, '正文'), silverWolf, 'legacy generic placeholders must yield to a current character avatar');
  assert.equal(npc.读取NPC头像({ 姓名: '银狼', 头像: 'https://player.example/custom.webp' }), 'https://player.example/custom.webp', 'player-provided avatars must keep priority');
  assert.equal(npc.读取NPC头像({ 姓名: '自定义角色', 头像: placeholder }), placeholder, 'unknown characters must keep their saved placeholder');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}

const albumWorkspace = read('components/features/GameSystems/album/workspaces.tsx');
assert.match(albumWorkspace, /getBuiltinAvatarSetForNames\(npc\.姓名, npc\.别名\)/, 'the companion album must use the expanded avatar identity list');

console.log('Legacy avatar save regression passed: old references and expanded NPC identities resolve outside Zhiku.');
