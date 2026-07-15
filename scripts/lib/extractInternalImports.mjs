/**
 * Shared newline-tolerant internal import extractor.
 * Used by pathaufcalls inventory generation and regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '../..');

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'target',
  'gen',
  'analytics_forgrok_old_depreciated',
  '.tmp-regression',
  '.claude',
  '.reasonix',
  '.trae',
  'backups',
]);

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'url',
  'http',
  'https',
  'crypto',
  'buffer',
  'stream',
  'util',
  'os',
  'child_process',
  'events',
  'process',
  'module',
  'assert',
  'worker_threads',
]);

export function topGroup(p) {
  if (['App.tsx', 'index.tsx', 'vite.config.ts', 'global.d.ts'].includes(p)) return 'root';
  if (p.startsWith('src-tauri')) return 'src-tauri';
  return p.split('/')[0];
}

export const PRIMARY_GROUPS = new Set([
  'root',
  'components',
  'hooks',
  'services',
  'models',
  'utils',
  'data',
  'prompts',
  'functions',
  'styles',
  'src-tauri',
]);

function shouldSkipDir(name) {
  if (EXCLUDE_DIRS.has(name)) return true;
  if (name.startsWith('.tmp')) return true;
  return false;
}

export function walkCodeFiles(root = REPO_ROOT, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      if (full.includes(`${path.sep}src-tauri${path.sep}target`)) continue;
      walkCodeFiles(full, files);
      continue;
    }
    if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export function rel(p, root = REPO_ROOT) {
  return path.relative(root, p).split(path.sep).join('/');
}

/** Blank out comments while preserving newlines (keeps line structure for diagnostics). */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Extract module specifiers from import/export/require/dynamic-import.
 * Newline-tolerant: multi-line `import {\n  a,\n} from 'x'` is matched.
 */
export function extractImportSpecs(sourceText) {
  const cleaned = stripComments(sourceText);
  const specs = new Set();

  // Statement-start anchored where possible to reduce string false positives.
  // [\s\S]*? allows newlines between import/export and from.
  const patterns = [
    // import … from 'spec'  /  import type … from 'spec'
    /(?:^|[;\n])\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/gm,
    // export … from 'spec'  /  export type … from 'spec'  /  export { x } from 'spec'
    /(?:^|[;\n])\s*export\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/gm,
    // side-effect: import 'spec'
    /(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/gm,
    // dynamic import('spec') — may appear mid-expression
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // require('spec')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(cleaned))) {
      const spec = match[1];
      // Reject absurdly long catches from runaway [\s\S]*? (cross-file garbage)
      if (spec && spec.length < 500) specs.add(spec);
    }
  }
  return specs;
}

export function resolveImport(fromFile, spec, root = REPO_ROOT) {
  if (!spec) return null;
  if (
    spec.startsWith('http://') ||
    spec.startsWith('https://') ||
    spec.startsWith('data:')
  ) {
    return null;
  }
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec)) return null;
  // bare npm package (including @scope/pkg)
  if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/')) {
    return null;
  }
  if (spec.startsWith('/') && !spec.startsWith('//')) {
    // absolute URL path, not a repo file
    return null;
  }

  let resolved;
  if (spec.startsWith('@/')) {
    resolved = path.join(root, spec.slice(2));
  } else {
    resolved = path.resolve(path.dirname(fromFile), spec);
  }

  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.mjs`,
    `${resolved}.cjs`,
    `${resolved}.json`,
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.tsx'),
    path.join(resolved, 'index.js'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return {
          kind: 'internal',
          target: rel(candidate, root),
        };
      }
    } catch {
      // ignore
    }
  }
  return {
    kind: 'unresolved-internal',
    target: rel(resolved, root),
  };
}

/**
 * Extract all internal edges from the repo.
 * @param {{ includeScripts?: boolean, root?: string }} opts
 * @returns {{ source: string, target: string, raw: string, kind: string }[]}
 */
export function extractInternalEdges(opts = {}) {
  const root = opts.root ?? REPO_ROOT;
  const includeScripts = opts.includeScripts ?? true;
  const files = walkCodeFiles(root);
  const seen = new Set();
  const edges = [];

  for (const file of files) {
    const source = rel(file, root);
    if (!includeScripts && source.startsWith('scripts/')) continue;
    // skip the extractor itself and pure regression scripts noise only when not including scripts
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractImportSpecs(text)) {
      const resolved = resolveImport(file, spec, root);
      if (!resolved) continue;
      const key = `${source}\t${resolved.target}\t${spec}\t${resolved.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source,
        target: resolved.target,
        raw: spec,
        kind: resolved.kind,
      });
    }
  }
  return edges;
}

export function primaryEdges(edges) {
  return edges.filter((e) => PRIMARY_GROUPS.has(topGroup(e.source)));
}
