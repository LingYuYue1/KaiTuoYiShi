import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const experience = read('components/features/ZhikuV3/ZhikuExperience.tsx');
const archive = read('components/features/ZhikuV3/ArchiveBrowser.tsx');
const archiveCss = read('components/features/ZhikuV3/archive-browser.css');
const story = read('components/features/ZhikuV3/StoryArchiveReader.tsx');
const storyCss = read('components/features/ZhikuV3/story-archive-reader.css');
const control = read('components/features/ZhikuV3/ReaderFontSizeControl.tsx');
const controlCss = read('components/features/ZhikuV3/reader-font-size-control.css');
const fontSize = read('components/features/ZhikuV3/readerFontSize.ts');

requireText(experience, 'useZhikuReaderFontSize()', 'shared reader preference owner');
requireText(experience, 'readerFontSize={readerFontSize}', 'shared size passed to archive surfaces');
requireText(experience, 'onDecreaseReaderFontSize={decreaseReaderFontSize}', 'shared decrease command');
requireText(experience, 'onIncreaseReaderFontSize={increaseReaderFontSize}', 'shared increase command');

requireText(fontSize, "'kaituo-zhiku-reader-font-size'", 'persisted reader preference');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_MIN = 14', 'reader minimum size');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_MAX = 24', 'reader maximum size');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_DEFAULT = 17', 'larger default reader size');
requireText(fontSize, 'window.localStorage.setItem', 'reader preference writeback');
requireText(fontSize, 'clampReaderFontSize', 'persisted value validation');

requireText(control, '减小档案字号', 'accessible decrease command');
requireText(control, '增大档案字号', 'accessible increase command');
requireText(control, 'aria-live="polite"', 'announced reader value');
requireText(control, 'disabled={value <= ZHIKU_READER_FONT_SIZE_MIN}', 'minimum boundary state');
requireText(control, 'disabled={value >= ZHIKU_READER_FONT_SIZE_MAX}', 'maximum boundary state');
requireText(controlCss, 'width: 116px', 'stable desktop control width');
requireText(controlCss, 'height: 44px', 'mobile touch control height');
requireText(controlCss, 'env(safe-area-inset-top)', 'mobile notch clearance');
requireText(controlCss, '@media (max-width: 360px)', 'compact narrow-screen control');

requireText(archive, '<ReaderFontSizeControl', 'archive font control');
requireText(archive, 'buildZhikuReaderStyle(readerFontSize)', 'archive reader variables');
requireText(archiveCss, 'var(--zhiku-reader-font-size, 17px)', 'archive body size variable');
requireText(archiveCss, 'var(--zhiku-reader-injection-font-size, 16px)', 'injection size variable');

requireText(story, '<ReaderFontSizeControl', 'story font control');
requireText(story, 'buildZhikuReaderStyle(readerFontSize)', 'story reader variables');
requireText(storyCss, 'var(--zhiku-reader-font-size, 17px)', 'story body size variable');
requireText(storyCss, 'var(--zhiku-reader-lead-font-size, 18px)', 'story lead size variable');
requireText(storyCss, 'var(--zhiku-reader-dropcap-font-size, 39px)', 'story drop cap size variable');

console.log('ZHIKU_READER_FONT_SIZE_REGRESSION_OK');
