import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const mobileLayout = read('components/features/ZhikuV3/mobileLayout.ts');
const screen = read('components/features/ZhikuV3/ZhikuScreen.tsx');
const field = read('components/features/ZhikuV3/CategoryField.tsx');
const orbits = read('components/features/ZhikuV3/DataOrbitLayer.tsx');
const hubCss = read('components/features/ZhikuV3/zhiku-v3.css');
const archive = read('components/features/ZhikuV3/ArchiveBrowser.tsx');
const archiveCss = read('components/features/ZhikuV3/archive-browser.css');
const story = read('components/features/ZhikuV3/StoryArchiveReader.tsx');
const storyCss = read('components/features/ZhikuV3/story-archive-reader.css');
const fontControlCss = read('components/features/ZhikuV3/reader-font-size-control.css');

for (const id of ['character', 'story', 'aeon', 'path', 'enemy', 'term', 'event', 'faction', 'location']) {
  requireText(mobileLayout, `id: '${id}'`, `portrait placement for ${id}`);
}

requireText(screen, 'nodes={ZHIKU_MOBILE_NODE_LAYOUT}', 'mobile orbit placement source');
requireText(screen, 'mobileNodes={ZHIKU_MOBILE_NODE_LAYOUT}', 'mobile node placement source');
requireText(screen, 'layoutVariant="desktop"', 'desktop orbit variant');
requireText(screen, 'layoutVariant="mobile"', 'mobile orbit variant');
requireText(field, "'--zhiku-node-mobile-x'", 'mobile node x token');
requireText(field, "'--zhiku-node-mobile-y'", 'mobile node y token');
requireText(field, "'--zhiku-node-mobile-scale'", 'mobile node scale token');
requireText(field, "'--zhiku-node-x'", 'desktop node x token');
requireText(hubCss, 'left: var(--zhiku-node-x)', 'desktop node x activation');
requireText(orbits, "layoutVariant?: 'desktop' | 'mobile'", 'responsive orbit contract');
requireText(orbits, 'mobileLayout ? 43 : 39', 'portrait orbit geometry');
requireText(hubCss, '@media (max-width: 640px) and (orientation: portrait)', 'portrait hub breakpoint');
requireText(hubCss, '.zhiku-v3-orbits--desktop { display: none; }', 'portrait desktop orbit removal');
requireText(hubCss, '.zhiku-v3-orbits--mobile { display: block; }', 'portrait orbit activation');
requireText(hubCss, 'left: var(--zhiku-node-mobile-x)', 'portrait node x activation');
requireText(hubCss, 'scale(var(--zhiku-node-mobile-scale, 1))', 'portrait node scale activation');
requireText(hubCss, 'env(safe-area-inset-top)', 'hub notch-safe header');
requireText(hubCss, 'width: 44px', 'hub touch target');
requireText(hubCss, '@media (max-height: 520px) and (orientation: landscape)', 'short landscape hub layout');

requireText(archive, "useState<'catalog' | 'detail'>", 'archive mobile master-detail state');
requireText(archive, 'data-mobile-pane={mobilePane}', 'archive mobile pane marker');
requireText(archive, "setMobilePane('detail')", 'archive item opens detail');
requireText(archive, 'zhiku-v3-browser__mobile-catalog-trigger', 'archive catalog return command');
requireText(archiveCss, '@media (max-width: 640px)', 'archive mobile breakpoint');
requireText(archiveCss, "data-mobile-pane='catalog'", 'archive catalog-only surface');
requireText(archiveCss, "data-mobile-pane='detail'", 'archive detail-only surface');
requireText(archiveCss, 'overflow-x: hidden', 'archive horizontal overflow protection');
requireText(archiveCss, 'word-break: break-word', 'injection payload wrapping');
requireText(archiveCss, 'env(safe-area-inset-bottom)', 'archive bottom safe area');

requireText(story, "useState<'catalog' | 'detail'>", 'story mobile master-detail state');
requireText(story, 'data-mobile-pane={mobilePane}', 'story mobile pane marker');
requireText(story, 'selectChapter(getInitialChapter(volume), false)', 'volume expansion stays in catalog');
requireText(story, 'zhiku-v3-story-reader__mobile-catalog-trigger', 'story catalog return command');
requireText(storyCss, '@media (max-width: 640px)', 'story mobile breakpoint');
requireText(storyCss, "data-mobile-pane='catalog'", 'story catalog-only surface');
requireText(storyCss, "data-mobile-pane='detail'", 'story detail-only surface');
requireText(storyCss, 'overscroll-behavior: contain', 'story local reading scroll');
requireText(storyCss, 'grid-template-columns: minmax(0, 1fr)', 'stacked story navigation');
requireText(storyCss, 'env(safe-area-inset-bottom)', 'story bottom safe area');
requireText(fontControlCss, 'top: max(12px, env(safe-area-inset-top))', 'reader control top safe area');
requireText(fontControlCss, 'right: max(66px, calc(54px + env(safe-area-inset-right)))', 'reader control close-button clearance');
requireText(fontControlCss, '@media (max-width: 360px)', 'compact reader control fallback');

console.log('ZHIKU_MOBILE_UI_REGRESSION_OK');
