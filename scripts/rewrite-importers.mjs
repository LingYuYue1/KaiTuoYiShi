// 全仓引用方重写：把从 workspaces 导入已拆分符号的 import 指向新文件（真实项目）
// 用法: node scripts/rewrite-importers.mjs [--dry]
import { Project } from 'ts-morph';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ownerBasename } from './workspace-manifest.mjs';

const ROOT = process.cwd();
const ALBUM_DIR = join(ROOT, 'components/features/GameSystems/album');
const dry = process.argv.includes('--dry');
const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || ['node_modules', 'backups', '.tmp-split', 'dist'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e)) files.push(p);
  }
})(join(ROOT, 'components'));
files.push(join(ROOT, 'App.tsx'));

const rewrites = [];
for (const file of files) {
  const f = project.addSourceFileAtPath(file);
  for (const imp of f.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    if (!/workspaces$/.test(mod)) continue; // './workspaces' / './album/workspaces' / '@/.../workspaces'
    for (const spec of imp.getNamedImports()) {
      const base = ownerBasename(spec.getName());
      if (!base) continue; // framework 符号留在 workspaces
      const dir = f.getDirectoryPath();
      let rel = relative(dir, join(ALBUM_DIR, base)).split('\\').join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      rewrites.push({ file, from: mod, name: spec.getName(), to: rel, isTypeOnly: imp.isTypeOnly() || spec.isTypeOnly() });
      console.log(`重写: ${file.replace(ROOT + '/', '')} ${spec.getName()} -> ${rel}`);
    }
  }
}
console.log(`\n共 ${rewrites.length} 条重写`);

if (!dry && rewrites.length) {
  const byFile = new Map();
  for (const r of rewrites) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [file, list] of byFile) {
    const f = project.addSourceFileAtPath(file);
    for (const r of list) {
      const imp = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.from && i.getNamedImports().some((s) => s.getName() === r.name));
      if (!imp) {
        console.warn(`跳过（找不到 import）: ${r.name} @ ${file}`);
        continue;
      }
      const spec = imp.getNamedImports().find((s) => s.getName() === r.name);
      if (r.isTypeOnly) {
        const t = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.to && i.isTypeOnly());
        if (t) t.addNamedImport({ name: r.name });
        else f.addImportDeclaration({ moduleSpecifier: r.to, namedImports: [r.name], isTypeOnly: true });
      } else {
        const t = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.to && !i.isTypeOnly());
        if (t) t.addNamedImport({ name: r.name });
        else f.addImportDeclaration({ moduleSpecifier: r.to, namedImports: [r.name] });
      }
      spec.remove();
    }
    for (const imp of [...f.getImportDeclarations()]) {
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) imp.remove();
    }
    f.saveSync();
    console.log('保存: ' + file.replace(ROOT + '/', ''));
  }
} else if (dry) {
  console.log('[dry] 未写盘');
}
