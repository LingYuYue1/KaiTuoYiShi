import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const experience = read('components/features/ZhikuV2/ZhikuExperience.tsx');
const archive = read('components/features/ZhikuV2/ArchiveBrowser.tsx');
const story = read('components/features/ZhikuV2/StoryArchiveReader.tsx');
const control = read('components/features/ZhikuV2/ReaderFontSizeControl.tsx');
const controlCss = read('components/features/ZhikuV2/reader-font-size-control.css');

requireText(experience, "loadAllBundledZhikuPresets({ cacheBust: Date.now() })", 'cache-busted preset reload');
requireText(experience, 'mergeBundledZhikuSystem(bundled, zhikuSystem, migrationAt)', 'runtime and custom entry preserving merge');
requireText(experience, "saveSetting('zhikuSystem', buildPersistedZhikuSystem(next))", 'refreshed system persistence');
requireText(experience, 'onRefreshBundled={isDevBuild ? handleRefreshBundled : undefined}', 'development-only reader refresh command');
requireText(experience, 'refreshStatus={refreshStatus}', 'reader refresh state forwarding');

requireText(archive, 'onRefresh={onRefreshBundled}', 'archive refresh control');
requireText(story, 'onRefresh={onRefreshBundled}', 'story refresh control');
requireText(control, 'RefreshCw', 'refresh icon');
requireText(control, "disabled={refreshStatus === 'loading'}", 'duplicate refresh guard');
requireText(control, 'aria-busy={refreshStatus ===', 'accessible loading state');
requireText(controlCss, "[data-has-refresh='true']", 'adjacent refresh control layout');
requireText(controlCss, 'zhiku-v2-reader-refresh-spin', 'refresh loading animation');

console.log('ZHIKU_V3_READER_REFRESH_REGRESSION_OK');
