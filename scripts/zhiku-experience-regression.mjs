import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const experience = read('components/features/ZhikuV3/ZhikuExperience.tsx');
const screen = read('components/features/ZhikuV3/ZhikuScreen.tsx');
const header = read('components/features/ZhikuV3/ZhikuHeader.tsx');
const css = read('components/features/ZhikuV3/zhiku-v3.css');

requireText(experience, 'export function ZhikuExperience', 'unified production container');
requireText(experience, 'buildZhikuProductionData(zhikuSystem, storyWeavingSystem)', 'live production data adapter');
requireText(experience, "selectedCategoryId === 'story'", 'dedicated story route');
requireText(experience, '<StoryArchiveReader', 'story archive final page');
requireText(experience, '<ArchiveBrowser', 'shared reference final page');
requireText(experience, '<ZhikuScreen', 'category hub');
requireText(experience, 'setSelectedCategoryId(null)', 'same-container back navigation');
requireText(experience, "event.key !== 'Escape'", 'Escape navigation');
requireText(experience, 'if (showMaintenance)', 'Escape closes maintenance first');
requireText(experience, 'onClose?.()', 'root close behavior');
requireText(experience, '<ZhikuMaintenancePanel', 'V3 maintenance surface contract');
requireText(experience, 'onZhikuSystemChange={onZhikuSystemChange}', 'maintenance write contract preservation');
requireText(experience, 'settings={settings}', 'maintenance settings contract preservation');
requireText(screen, 'onOpenMaintenance?: () => void', 'optional hub maintenance command');
requireText(header, 'aria-label="维护智库"', 'accessible maintenance command');
requireText(header, '<Wrench', 'maintenance tool icon');
requireText(css, '.zhiku-v3-maintenance__content', 'full-screen maintenance surface');
requireText(css, '@media (max-width: 520px)', 'narrow maintenance layout');

if (experience.includes('搜索智库条目') || experience.includes('query')) {
  throw new Error('Player-facing ZhikuExperience must not restore the retired search feature.');
}
console.log('ZHIKU_EXPERIENCE_REGRESSION_OK');
