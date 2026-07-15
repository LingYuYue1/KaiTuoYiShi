import fs from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const app = await fs.readFile(path.join(root, 'App.tsx'), 'utf8');
const lazyRetry = await fs.readFile(path.join(root, 'utils', 'lazyWithRetry.ts'), 'utf8');

assert(lazyRetry.includes('export type PreloadableLazyComponent'), 'lazyWithRetry must expose a preloadable component type');
assert(lazyRetry.includes('let modulePromise:'), 'lazyWithRetry must cache the active module import');
assert(lazyRetry.includes('modulePromise = loader().catch'), 'lazyWithRetry must share one loader promise');
assert(lazyRetry.includes('modulePromise = null;'), 'a failed preload must clear its cached promise');
assert(lazyRetry.includes('component.preload = async () =>'), 'lazyWithRetry must expose preload()');
assert(lazyRetry.includes('An idle preload must not reload the app'), 'idle preload failures must be contained');
const preloadBody = lazyRetry.split('component.preload = async () =>', 2)[1]?.split('return component;', 1)[0] ?? '';
assert(!preloadBody.includes('clearReloadMarker()'), 'background preload must not clear another chunk retry marker');

const assertPreloadBeforeTransition = (preload, transitionStart, label) => {
  const preloadIndex = app.indexOf(preload);
  const transitionIndex = app.indexOf(transitionStart, preloadIndex);
  assert(preloadIndex >= 0, `${label} must start preloading on click`);
  assert(transitionIndex > preloadIndex, `${label} must preload before its transition timing starts`);
};

assertPreloadBeforeTransition('void NewGameWizard.preload();', 'setHomeJourneyTransitioning(true);', 'new game');
assertPreloadBeforeTransition('void SaveLoadModal.preload();', 'setSaveLoadTransitioning(true);', 'save load');
assertPreloadBeforeTransition('void WorldbookManagerModal.preload();', 'setBookOpenTransitioning(true);', 'worldbook');

assert(app.includes("if (state.view !== 'home') return;"), 'idle preloading must only run on the home view');
assert(app.includes('idleWindow.requestIdleCallback(preloadZhiku, { timeout: 1200 })'), 'zhiku must preload during browser idle time');
assert(app.includes('idleWindow.cancelIdleCallback?.(idleHandle)'), 'zhiku idle preload must be cancellable');
assert(app.includes('window.setTimeout(preloadZhiku, 300)'), 'zhiku preload must support browsers without requestIdleCallback');
assert(app.includes('window.clearTimeout(timer)'), 'zhiku fallback preload must be cancellable');

console.log('home entry preload regression ok');
