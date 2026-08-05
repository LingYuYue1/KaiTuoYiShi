import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};
const productionLayoutPath = path.join(root, 'components/features/ZhikuV3/zhiku-layout.production.json');

if (!fs.existsSync(productionLayoutPath)) {
  throw new Error('The workbench-approved Zhiku layout must be promoted to a production JSON file.');
}

const app = read('App.tsx');
const manager = read('components/features/ZhikuV3/ZhikuManagerModal.tsx');
const experience = read('components/features/ZhikuV3/ZhikuExperience.tsx');
const screen = read('components/features/ZhikuV3/ZhikuScreen.tsx');
const types = read('components/features/ZhikuV3/types.ts');
const categoryField = read('components/features/ZhikuV3/CategoryField.tsx');
const categoryNode = read('components/features/ZhikuV3/CategoryNode.tsx');
const orbitLayer = read('components/features/ZhikuV3/DataOrbitLayer.tsx');
const zhikuStyles = read('components/features/ZhikuV3/zhiku-v3.css');
const productionLayout = JSON.parse(fs.readFileSync(productionLayoutPath, 'utf8'));

requireText(manager, "import { ZhikuExperience }", 'full-screen production entry');
requireText(manager, 'storyWeavingSystem: 剧情编织系统', 'story weaving source contract');
requireText(manager, '<ZhikuExperience', 'new Zhiku UI');
requireText(manager, 'storyWeavingSystem={storyWeavingSystem}', 'story source forwarding');
requireText(manager, 'role="dialog"', 'isolated full-screen surface');
requireText(manager, 'fixed inset-0', 'viewport takeover');
requireText(app, "if (id === 'zhiku')", 'in-game Zhiku routing');
requireText(app, 'setActiveSystem(null)', 'legacy drawer shutdown');
requireText(app, 'setShowZhikuManager(true)', 'shared full-screen entry activation');
requireText(types, "import productionLayoutSource from './zhiku-layout.production.json'", 'approved layout source');
requireText(types, 'export const ZHIKU_PRODUCTION_LAYOUT', 'typed production layout');
requireText(experience, 'ZHIKU_PRODUCTION_LAYOUT', 'approved layout import');
requireText(experience, 'layout={ZHIKU_PRODUCTION_LAYOUT}', 'approved production layout');
requireText(experience, 'const hasShownLobbyRef = useRef(false)', 'one-shot lobby entrance state');
requireText(experience, 'entering={shouldAnimateLobby}', 'production entrance trigger');
requireText(screen, 'className="zhiku-v3-screen__stage"', 'fixed-ratio composition stage');
requireText(screen, "data-entering={entering ? 'true' : 'false'}", 'entrance animation state');
requireText(screen, 'entering={entering}', 'orbit data-flow entrance state');
requireText(categoryField, 'className="zhiku-v3-field__render-slot"', 'production category render slot');
requireText(categoryField, "'--zhiku-node-reveal-order': revealOrder", 'independent node reveal order');
requireText(categoryNode, 'className="zhiku-v3-node__decode"', 'node-local binary decode layer');
requireText(orbitLayer, "'--zhiku-orbit-opacity': opacity", 'orbit opacity animation token');
requireText(orbitLayer, 'entering && !reducedMotion', 'one-shot route packet rendering');
requireText(orbitLayer, 'className="zhiku-v3-orbits__packet"', 'route-bound binary packet');
requireText(orbitLayer, '<animateMotion', 'route packet motion');
requireText(orbitLayer, '<mpath', 'route path attachment');
requireText(zhikuStyles, '.zhiku-v3-field__render-slot { display: contents; }', 'scoped render wrapper style');
requireText(zhikuStyles, 'width: min(100cqw, calc(100cqh * 16 / 9));', 'stage width constraint');
requireText(zhikuStyles, 'height: min(100cqh, calc(100cqw * 9 / 16));', 'stage height constraint');
requireText(zhikuStyles, 'width: clamp(104px, 10.4cqw, 192px);', 'stage-relative node width');
requireText(zhikuStyles, 'height: clamp(128px, 12cqw, 220px);', 'stage-relative node height');
requireText(zhikuStyles, "[data-entering='true']", 'scoped entrance animation selectors');
requireText(zhikuStyles, '.zhiku-v3-orbits__packet-glyph', 'route packet glyph style');
requireText(zhikuStyles, '@keyframes zhiku-v3-icon-decode', 'node icon decode animation');
requireText(zhikuStyles, '@keyframes zhiku-v3-icon-resolve', 'node emblem resolution animation');
requireText(zhikuStyles, '@keyframes zhiku-v3-node-enter', 'staggered node animation');
requireText(zhikuStyles, '@keyframes zhiku-v3-header-enter', 'header landing animation');
requireText(zhikuStyles, '@media (prefers-reduced-motion: reduce)', 'system reduced-motion fallback');

for (const obsoleteAnimation of [
  'zhiku-v3-boot-scan',
  'zhiku-v3-boot-sweep',
  'zhiku-v3-boot-axis',
  'zhiku-v3-boot-core',
  'zhiku-v3-data-veil',
  'zhiku-v3-data-stream-forward',
  'zhiku-v3-data-stream-reverse',
]) {
  if (zhikuStyles.includes(obsoleteAnimation)) {
    throw new Error(`The abrupt scan animation must be removed: ${obsoleteAnimation}`);
  }
}

if (zhikuStyles.includes('.zhiku-v3-field > div { display: contents; }')) {
  throw new Error('Production category slots must not be flattened by a broad direct-child selector.');
}

const pageFrameIndex = screen.indexOf('<ZhikuPageFrame');
const compositionStageIndex = screen.indexOf('className="zhiku-v3-screen__stage"');
if (pageFrameIndex < 0 || compositionStageIndex < 0 || pageFrameIndex > compositionStageIndex) {
  throw new Error('The full-bleed page frame must sit outside the fixed-ratio composition stage.');
}
if (/\.zhiku-v3-screen__stage\s*\{[^}]*background\s*:/s.test(zhikuStyles)) {
  throw new Error('The fixed-ratio composition stage must remain transparent over the full-bleed background.');
}

const expectedSavedNodes = {
  character: [49.51724137931035, 46.547892720306514, 1.3],
  story: [35.51724137931034, 20.773946360153257, 0.88],
  aeon: [62, 18, 0.78],
  enemy: [66.41379310344826, 62.08429118773947, 0.95],
  path: [76.27586206896552, 32.157088122605366, 0.8],
  term: [80.13793103448276, 72.81226053639847, 0.76],
  event: [52.700184259015536, 84.16153373694833, 0.76],
  faction: [35.16366612111293, 77.61865793780687, 0.76],
  location: [30.620689655172413, 49.81226053639847, 0.8],
};

for (const [id, expected] of Object.entries(expectedSavedNodes)) {
  const node = productionLayout.nodes?.find((item) => item.id === id);
  const actual = node ? [node.x, node.y, node.scale] : null;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Production layout drifted from the saved workbench node ${id}: ${JSON.stringify(actual)}`);
  }
}

const productionEntryCount = (app.match(/<ZhikuManagerModal/g) ?? []).length;
if (productionEntryCount !== 2) {
  throw new Error(`Expected home and in-game Zhiku entries, got ${productionEntryCount}.`);
}

const storySourceCount = (app.match(/storyWeavingSystem=\{state\.剧情编织\}/g) ?? []).length;
if (storySourceCount !== 2) {
  throw new Error(`Both production entries must receive story weaving data, got ${storySourceCount}.`);
}

for (const forbidden of [
  "const ZhikuMaintenancePanel = lazyWithRetry",
  "case 'zhiku':",
  '<ZhikuMaintenancePanel',
]) {
  if (app.includes(forbidden)) throw new Error(`Legacy Zhiku drawer UI must be offline in App.tsx: ${forbidden}`);
}

for (const forbidden of ["from '@/components/ui/Modal'", '<Modal', '<ZhikuMaintenancePanel']) {
  if (manager.includes(forbidden)) throw new Error(`Zhiku production entry must render the new full-screen UI: ${forbidden}`);
}

for (const forbidden of ['ZhikuMaintenancePanel', 'showMaintenance', 'onOpenMaintenance', 'zhiku-v3-maintenance']) {
  if (experience.includes(forbidden)) throw new Error(`V3 production experience must not restore retired maintenance UI: ${forbidden}`);
}

console.log('ZHIKU_PRODUCTION_UI_REGRESSION_OK');
