// 机械化拆分脚本：workspaces.tsx -> albumWorkspaceLogic.ts + workspaceComponents.tsx + workspaces.tsx
// 只操作 .tmp-split/album/ 副本。符号级依赖分析（getSymbol），自动生成/合并/清理 import，重写引用方。
// 用法: node scripts/split-workspaces.mjs [--dry]
import { Project, SyntaxKind } from 'ts-morph';
import { readdirSync, existsSync } from 'fs';
import { logicFns, logicTypes, componentFns, componentConsts, movedNames, ownerBasename } from './workspace-manifest.mjs';

const DIR = '.tmp-split/album';
const SRC = `${DIR}/workspaces.tsx`;
const LOGIC_FILE = `${DIR}/albumWorkspaceLogic.ts`;
const COMPONENTS_FILE = `${DIR}/workspaceComponents.tsx`;
const dry = process.argv.includes('--dry');

const MANIFEST = {
  logic: { file: LOGIC_FILE, fns: logicFns, types: logicTypes, consts: [] },
  components: { file: COMPONENTS_FILE, fns: componentFns, types: [], consts: componentConsts },
};
const ownerOf = (name) => {
  const base = ownerBasename(name);
  if (!base) return null;
  return `${DIR}/${base}${base === 'albumWorkspaceLogic' ? '.ts' : '.tsx'}`;
};

// ---------- 依赖分析 ----------
const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const src = project.addSourceFileAtPath(SRC);

function getNode(name) {
  return src.getFunction(name) ?? src.getVariableStatement(name) ?? src.getInterface(name) ?? src.getTypeAlias(name);
}

function isTopLevel(decl) {
  return decl.getParent()?.isKind(SyntaxKind.SourceFile) ?? false;
}

function collectDeps(node) {
  // 返回 { imports: Map<module, Set<{name, isTypeOnly}>>, internalRefs: Set<name> }
  const imports = new Map();
  const internalRefs = new Set();
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const sym = id.getSymbol();
    if (!sym) continue;
    for (const decl of sym.getDeclarations()) {
      const declFile = decl.getSourceFile();
      if (declFile === src) {
        if (decl.isKind(SyntaxKind.ImportSpecifier)) {
          const imp = decl.getImportDeclaration();
          const mod = imp.getModuleSpecifierValue();
          if (!imports.has(mod)) imports.set(mod, new Set());
          imports.get(mod).add({ name: decl.getName(), isTypeOnly: imp.isTypeOnly() || decl.isTypeOnly() });
          continue;
        }
        if (!isTopLevel(decl)) continue; // 局部变量/参数/嵌套函数
        internalRefs.add(decl.getName());
      }
      // 其他文件中的全局/内置定义忽略
    }
  }
  return { imports, internalRefs };
}

const plan = { logic: [], components: [] };
for (const layer of Object.values(MANIFEST)) {
  const names = [...layer.fns, ...layer.types, ...layer.consts];
  for (const name of names) {
    const node = getNode(name);
    if (!node) throw new Error(`符号不存在: ${name}`);
    const { imports, internalRefs } = collectDeps(node);
    // 层内自洽校验：internalRefs 中非本层符号 => 跨层/框架引用
    const layerNames = new Set(names);
    for (const ref of internalRefs) {
      if (layerNames.has(ref)) continue;
      if (movedNames.has(ref)) {
        throw new Error(`跨层引用: ${name} -> ${ref}（${ownerOf(ref)}），需先修正分层`);
      }
      // 框架层符号被本层引用 => 不允许
      if (!movedNames.has(ref)) {
        throw new Error(`依赖未移动符号: ${name} -> ${ref}（框架层）`);
      }
    }
    plan[layer === MANIFEST.logic ? 'logic' : 'components'].push({
      name, node, text: node.getText(), imports,
    });
    console.log(`分析: ${name} -> ${layer.file}（${imports.size} 个外部模块）`);
  }
}

// ---------- 目标文件 ----------
const logicFile = project.createSourceFile(LOGIC_FILE, '', { overwrite: true });
const componentsFile = project.createSourceFile(COMPONENTS_FILE, '', { overwrite: true });

const emitImports = (file, imports) => {
  for (const [mod, specs] of imports) {
    const names = [...specs];
    const valueNames = [...new Set(names.filter((s) => !s.isTypeOnly).map((s) => s.name))].sort((a, b) => a.localeCompare(b));
    const typeNames = [...new Set(names.filter((s) => s.isTypeOnly).map((s) => s.name))].sort((a, b) => a.localeCompare(b));
    if (valueNames.length) file.addImportDeclaration({ moduleSpecifier: mod, namedImports: valueNames });
    if (typeNames.length) file.addImportDeclaration({ moduleSpecifier: mod, namedImports: typeNames, isTypeOnly: true });
  }
};

if (!dry) {
  // 1. 移动（先 types 后 fns；consts 归函数区）
  for (const layer of Object.values(MANIFEST)) {
    const file = layer.file === LOGIC_FILE ? logicFile : componentsFile;
    const items = plan[layer.file === LOGIC_FILE ? 'logic' : 'components'];
    for (const item of items) {
      file.addStatements(item.text + '\n');
      item.node.remove();
    }
  }
  // 2. import 写入目标文件（合并去重）
  const allImports = { logic: new Map(), components: new Map() };
  for (const item of [...plan.logic, ...plan.components]) {
    const target = ownerOf(item.name) === LOGIC_FILE ? 'logic' : 'components';
    for (const [mod, specs] of item.imports) {
      if (!allImports[target].has(mod)) allImports[target].set(mod, new Set());
      for (const s of specs) allImports[target].get(mod).add(s);
    }
  }
  for (const key of ['logic', 'components']) {
    const merged = new Map();
    for (const [mod, specs] of allImports[key]) {
      for (const s of specs) {
        if (!merged.has(mod)) merged.set(mod, new Set());
        merged.get(mod).add(s);
      }
    }
    emitImports(key === 'logic' ? logicFile : componentsFile, merged);
  }
  logicFile.saveSync();
  componentsFile.saveSync();

  // 3. 源文件：引用已移符号 -> 补 import（不依赖 getSymbol：扫描剩余代码中所有 moved 名字的引用）
  const need = new Map(); // file -> { values: Set, types: Set }
  for (const id of src.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = id.getText();
    if (!movedNames.has(text)) continue;
    const owner = ownerOf(text);
    if (!owner) continue;
    if (!need.has(owner)) need.set(owner, { values: new Set(), types: new Set() });
    if (logicTypes.includes(text)) need.get(owner).types.add(text);
    else need.get(owner).values.add(text);
  }
  for (const [owner, { values, types }] of need) {
    const rel = './' + owner.split('/').pop().replace(/\.(ts|tsx)$/, '');
    if (values.size) {
      const existing = src.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === rel && !i.isTypeOnly());
      if (existing) {
        for (const n of values) existing.addNamedImport({ name: n, isTypeOnly: false });
      } else {
        src.addImportDeclaration({ moduleSpecifier: rel, namedImports: [...values].sort() });
      }
    }
    if (types.size) {
      const existingT = src.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === rel && i.isTypeOnly());
      if (existingT) {
        for (const n of types) existingT.addNamedImport({ name: n });
      } else {
        src.addImportDeclaration({ moduleSpecifier: rel, namedImports: [...types].sort(), isTypeOnly: true });
      }
    }
    console.log(`源文件补 import: ${rel} <- ${[...values, ...types].join(', ')}`);
  }

  // 4. 源文件清理未用 import
  const usedSpecs = new Set();
  for (const id of src.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const sym = id.getSymbol();
    if (!sym) continue;
    for (const d of sym.getDeclarations()) {
      if (d.isKind(SyntaxKind.ImportSpecifier)) usedSpecs.add(d);
    }
  }
  for (const imp of [...src.getImportDeclarations()]) {
    const named = imp.getNamedImports();
    for (const spec of named) {
      if (!usedSpecs.has(spec)) {
        spec.remove();
        console.log(`清理未用 import: ${imp.getModuleSpecifierValue()} <- ${spec.getName()}`);
      }
    }
    if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) {
      imp.remove();
      console.log(`删除空 import 声明: ${imp.getModuleSpecifierValue()}`);
    }
  }

  // 5. 引用方重写（副本内除产物外所有 .ts/.tsx）：先收集变更清单，再逐条重新定位执行
  const rewrites = [];
  for (const entry of readdirSync(DIR)) {
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (['workspaces.tsx', 'albumWorkspaceLogic.ts', 'workspaceComponents.tsx'].includes(entry)) continue;
    const f = project.addSourceFileAtPath(`${DIR}/${entry}`);
    for (const imp of f.getImportDeclarations()) {
      if (imp.getModuleSpecifierValue() !== './workspaces') continue;
      for (const spec of imp.getNamedImports()) {
        const owner = ownerOf(spec.getName());
        if (!owner) continue; // framework 符号留在原路径
        rewrites.push({
          file: entry,
          from: './workspaces',
          name: spec.getName(),
          to: './' + owner.split('/').pop().replace(/\.(ts|tsx)$/, ''),
          isTypeOnly: imp.isTypeOnly() || spec.isTypeOnly(),
        });
        console.log(`引用方重写: ${entry} ${spec.getName()} -> ${rewrites[rewrites.length - 1].to}`);
      }
    }
  }
  const byFile = new Map();
  for (const r of rewrites) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [entry, list] of byFile) {
    const f = project.addSourceFileAtPath(`${DIR}/${entry}`);
    for (const r of list) {
      const imp = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.from && i.getNamedImports().some((s) => s.getName() === r.name));
      if (!imp) throw new Error(`引用方重写: ${entry} 找不到 ${r.from} / ${r.name}`);
      const spec = imp.getNamedImports().find((s) => s.getName() === r.name);
      if (!spec) throw new Error(`引用方重写: ${entry} 找不到 ${r.name}`);
      if (r.isTypeOnly) {
        const targetT = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.to && i.isTypeOnly());
        if (targetT) {
          targetT.addNamedImport({ name: r.name });
        } else {
          f.addImportDeclaration({ moduleSpecifier: r.to, namedImports: [r.name], isTypeOnly: true });
        }
      } else {
        const target = f.getImportDeclarations().find((i) => i.getModuleSpecifierValue() === r.to && !i.isTypeOnly());
        if (target) {
          target.addNamedImport({ name: r.name, isTypeOnly: false });
        } else {
          f.addImportDeclaration({ moduleSpecifier: r.to, namedImports: [r.name] });
        }
      }
      spec.remove();
    }
    for (const imp of [...f.getImportDeclarations()]) {
      if (imp.getModuleSpecifierValue() !== './workspaces') continue;
      if (imp.getNamedImports().length === 0 && !imp.getDefaultImport()) imp.remove();
    }
    f.saveSync();
    console.log(`引用方保存: ${entry}`);
  }

  src.saveSync();
  console.log('\n拆分完成。');
} else {
  console.log('\n[dry] 未写盘。');
}
