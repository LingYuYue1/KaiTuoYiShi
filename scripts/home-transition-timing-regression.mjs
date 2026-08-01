import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'global.css'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const readTiming = (name) => {
  const match = app.match(new RegExp(`const ${name} = (\\d+);`));
  return match ? Number(match[1]) : 0;
};

for (const [totalName, switchName, reducedTotalName, reducedSwitchName] of [
  ['HOME_JOURNEY_ANIMATION_MS', 'HOME_JOURNEY_VIEW_SWITCH_MS', 'HOME_JOURNEY_REDUCED_MOTION_MS', 'HOME_JOURNEY_REDUCED_VIEW_SWITCH_MS'],
  ['SAVE_LOAD_ANIMATION_MS', 'SAVE_LOAD_VIEW_SWITCH_MS', 'SAVE_LOAD_REDUCED_MOTION_MS', 'SAVE_LOAD_REDUCED_VIEW_SWITCH_MS'],
  ['BOOK_OPEN_ANIMATION_MS', 'BOOK_OPEN_VIEW_SWITCH_MS', 'BOOK_OPEN_REDUCED_MOTION_MS', 'BOOK_OPEN_REDUCED_VIEW_SWITCH_MS'],
]) {
  const total = readTiming(totalName);
  const switchDelay = readTiming(switchName);
  const reducedTotal = readTiming(reducedTotalName);
  const reducedSwitch = readTiming(reducedSwitchName);
  assert(total > 0 && switchDelay > 0 && switchDelay <= total, `${switchName} must stay within ${totalName}.`);
  assert(reducedTotal > 0 && reducedSwitch > 0 && reducedSwitch <= reducedTotal, `${reducedSwitchName} must stay within ${reducedTotalName}.`);
}

assert(app.includes('void NewGameWizard.preload();'), 'Home journey must preload the new-game surface.');
assert(app.includes('void SaveLoadModal.preload();'), 'Save-load transition must preload the save surface.');
assert(app.includes('void WorldbookManagerModal.preload();'), 'Book transition must preload the worldbook surface.');
assert(app.includes('const switchDelay = Math.min(getHomeJourneyViewSwitchDelay(), totalDelay);'), 'Home journey must cap its view-switch delay.');
assert(app.includes('const switchDelay = Math.min(getSaveLoadViewSwitchDelay(), totalDelay);'), 'Save-load must cap its view-switch delay.');
assert(app.includes('const switchDelay = Math.min(getBookOpenViewSwitchDelay(), totalDelay);'), 'Book-open must cap its view-switch delay.');
assert(/await wait\(switchDelay\);\s*actions\.handleNewGame\(\);/.test(app), 'Home journey must switch only after its configured delay.');
assert(/await wait\(switchDelay\);\s*setShowSaveLoad\(true\);/.test(app), 'Save-load must open only after its configured delay.');
assert(/await wait\(switchDelay\);\s*setShowWorldbookManager\(true\);/.test(app), 'Worldbook must open only after its configured delay.');
assert(app.includes('await wait(Math.max(totalDelay - switchDelay, 0));'), 'Transitions must keep their remaining overlay timing after switching views.');
assert(readTiming('JOURNEY_LAUNCH_ANIMATION_MS') > 0, 'Journey launch animation timing must remain configured.');
assert(css.includes('.kaituo-journey-launch { animation-duration: 2.2s; }') || css.includes('animation-duration: 2.2s;'), 'Journey launch overlay root must last as long as the starburst animation.');
assert(css.includes('.kaituo-home-journey { animation-duration: 1.78s; }'), 'Home journey overlay duration should be visible.');
assert(css.includes('.kaituo-save-load { animation-duration: 1.64s; }'), 'Save-load overlay duration should be visible.');
assert(css.includes('.kaituo-book-open { animation-duration: 1.72s; }'), 'Book-open overlay duration should be visible.');
assert(css.includes('animation-duration: 0.72s !important;'), 'Reduced-motion transitions should remain visible instead of flashing.');

console.log('home-transition-timing-regression: ok');
