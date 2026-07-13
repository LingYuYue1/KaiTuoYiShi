import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'global.css'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!app.includes('VIEW_SWITCH_MS'), 'Home transition handlers must not switch views before overlays finish.');
assert(!app.includes('getHomeJourneyViewSwitchDelay'), 'Home journey must wait for the full overlay before opening the next view.');
assert(!app.includes('getSaveLoadViewSwitchDelay'), 'Save-load transition must wait for the full overlay before opening the modal.');
assert(!app.includes('getBookOpenViewSwitchDelay'), 'Book-open transition must wait for the full overlay before opening worldbook.');
assert(app.includes('await wait(getHomeJourneyDelay());\n    actions.handleNewGame();'), 'Home journey should call handleNewGame after the full transition delay.');
assert(app.includes('await wait(getSaveLoadDelay());\n    setShowSaveLoad(true);'), 'Save-load modal should open after the full transition delay.');
assert(app.includes('await wait(getBookOpenDelay());\n    setShowWorldbookManager(true);'), 'Worldbook modal should open after the full book transition delay.');
assert(app.includes('const JOURNEY_LAUNCH_ANIMATION_MS = 2200;'), 'Journey launch delay should be long enough for the full star-rail animation.');
assert(app.includes('const HOME_JOURNEY_ANIMATION_MS = 1780;'), 'Home journey delay should not collapse into a flash.');
assert(app.includes('const SAVE_LOAD_ANIMATION_MS = 1640;'), 'Save-load delay should not collapse into a flash.');
assert(app.includes('const BOOK_OPEN_ANIMATION_MS = 1720;'), 'Book-open delay should not collapse into a flash.');
assert(css.includes('.kaituo-journey-launch { animation-duration: 2.2s; }') || css.includes('animation-duration: 2.2s;'), 'Journey launch overlay root must last as long as the starburst animation.');
assert(css.includes('.kaituo-home-journey { animation-duration: 1.78s; }'), 'Home journey overlay duration should be visible.');
assert(css.includes('.kaituo-save-load { animation-duration: 1.64s; }'), 'Save-load overlay duration should be visible.');
assert(css.includes('.kaituo-book-open { animation-duration: 1.72s; }'), 'Book-open overlay duration should be visible.');
assert(css.includes('animation-duration: 0.72s !important;'), 'Reduced-motion transitions should remain visible instead of flashing.');

console.log('home-transition-timing-regression: ok');
