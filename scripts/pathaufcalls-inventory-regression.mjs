/**
 * Structural regression: PathAufCalls.md must inventory all internal app
 * import edges (and document internal /api + Tauri bridges).
 *
 * Re-extracts imports from the live tree with a newline-tolerant parser
 * and asserts each primary edge appears in the inventory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractInternalEdges,
  primaryEdges,
  REPO_ROOT,
  topGroup,
} from './lib/extractInternalImports.mjs';

const __filename = fileURLToPath(import.meta.url);
const DOC_PATH = path.join(REPO_ROOT, 'PathAufCalls.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- extract with fixed newline-tolerant parser ---
const allEdges = extractInternalEdges({ includeScripts: true, root: REPO_ROOT });
const primary = primaryEdges(allEdges);

// --- document gates ---
assert(fs.existsSync(DOC_PATH), 'PathAufCalls.md must exist at repo root');
const doc = fs.readFileSync(DOC_PATH, 'utf8');
assert(doc.trim().length > 1000, 'PathAufCalls.md must be non-empty Markdown');

const requiredHeadings = [
  'Architecture snapshot',
  'Internal API routes',
  'Observed dependency patterns',
  'UI → Kernel',
  'Complete internal import inventory',
  'Potential Kernel',
  'Tauri',
];
for (const heading of requiredHeadings) {
  assert(doc.includes(heading), `PathAufCalls.md missing section/marker: ${heading}`);
}

const requiredRoutes = [
  '/api/qianfan',
  '/api/opencode',
  '/api/pioneer',
  '/api/ark',
  '/api/auth/github',
  '/api/auth/github-config',
  '/api/presence',
];
for (const route of requiredRoutes) {
  assert(doc.includes(route), `PathAufCalls.md must document internal route ${route}`);
}

const requiredGroups = [
  'components',
  'hooks',
  'services',
  'models',
  'utils',
  'data',
  'functions',
];
for (const group of requiredGroups) {
  const sample = primary.find((e) => topGroup(e.source) === group);
  if (sample) {
    assert(
      doc.includes(`\`${sample.source}\``),
      `inventory must list a file from ${group}: expected ${sample.source}`,
    );
  }
}

assert(doc.includes('`App.tsx`'), 'inventory must include App.tsx');
assert(doc.includes('`index.tsx`'), 'inventory must include index.tsx');
assert(doc.includes('`vite.config.ts`'), 'inventory must include vite.config.ts');

// Every primary edge must appear as source → target table cells
const missing = [];
for (const edge of primary) {
  const needle = `| \`${edge.source}\` | \`${edge.target}\` |`;
  const alt = `\`${edge.source}\` | \`${edge.target}\``;
  if (!doc.includes(needle) && !doc.includes(alt)) {
    missing.push(edge);
  }
}

if (missing.length > 0) {
  const preview = missing
    .slice(0, 15)
    .map((e) => `  ${e.source} → ${e.target} (${e.raw})`)
    .join('\n');
  throw new Error(
    `PathAufCalls.md missing ${missing.length}/${primary.length} primary edges.\n${preview}`,
  );
}

// Known multi-line edges that previously slipped past the broken extractor
const mustHave = [
  ['services/dbService.ts', 'services/desktop/desktopSaveMirror.ts'],
  ['services/dbService.ts', 'services/desktop/desktopAssetMirror.ts'],
  ['components/features/Settings/StorageManager.tsx', 'services/desktop/desktopBridge.ts'],
  ['hooks/useGame/sendWorkflow.ts', 'services/workflowRecovery.ts'],
  ['hooks/useGame/sendWorkflow.ts', 'hooks/useGame/memoryUtils.ts'],
  [
    'components/features/GameSystems/album/albumArchiveWorkerClient.ts',
    'components/features/GameSystems/album/albumArchive.ts',
  ],
  [
    'components/features/CloudSave/GitHubCloudSaveModal.tsx',
    'services/githubCloudSave.ts',
  ],
];
for (const [source, target] of mustHave) {
  assert(
    doc.includes(`| \`${source}\` | \`${target}\` |`) ||
      doc.includes(`\`${source}\` | \`${target}\``),
    `inventory must include multi-line edge ${source} → ${target}`,
  );
}

// Coupling section must call out concrete UI→Kernel examples
assert(
  doc.includes('services/dbService') || doc.includes('`services/dbService.ts`'),
  'coupling notes must mention dbService UI→Kernel surface',
);
assert(
  /UI.*Kernel|Kernel.*UI/i.test(doc),
  'document must be Kernel/UI separation-aware',
);

assert(
  doc.includes('chatCompletionClient') || doc.includes('`services/ai/chatCompletionClient.ts`'),
  'must document chatCompletionClient as /api consumer',
);
assert(
  doc.includes('useGitHubOAuth') || doc.includes('`hooks/useGitHubOAuth.ts`'),
  'must document OAuth hook',
);

assert(doc.includes('desktop_app_info'), 'must document Tauri desktop_app_info');
assert(
  doc.includes('desktopBridge') || doc.includes('desktopBridge.ts'),
  'must document desktopBridge',
);

assert(
  /external-out-of-scope|Excluded from primary|third-party/i.test(doc),
  'must explicitly exclude external/third-party APIs from primary edges',
);

// Sanity: fixed extractor finds more than the old broken ~947 baseline
assert(
  primary.length >= 1000,
  `expected newline-tolerant extract to find ≥1000 primary edges, got ${primary.length}`,
);

console.log(
  `pathaufcalls inventory regression ok: ${primary.length} primary edges covered (100%), multiline samples verified, routes+sections ok`,
);
