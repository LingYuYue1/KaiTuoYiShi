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
requireText(experience, 'onClose?.()', 'root close behavior');

for (const [source, label] of [
  [experience, 'experience'],
  [screen, 'screen'],
  [header, 'header'],
  [css, 'styles'],
]) {
  for (const forbidden of ['ZhikuMaintenancePanel', 'showMaintenance', 'onOpenMaintenance', 'zhiku-v3-maintenance']) {
    if (source.includes(forbidden)) throw new Error(`${label} must not restore retired Zhiku maintenance: ${forbidden}`);
  }
}

if (experience.includes('搜索智库条目') || experience.includes('query')) {
  throw new Error('Player-facing ZhikuExperience must not restore the retired search feature.');
}
console.log('ZHIKU_EXPERIENCE_REGRESSION_OK');
