import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const landing = fs.readFileSync('components/layout/LandingPage.tsx', 'utf8');
const modal = fs.readFileSync('components/features/Release/ReleaseAnnouncementsModal.tsx', 'utf8');
const data = fs.readFileSync('data/releaseAnnouncements.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  landing.includes('onReleaseAnnouncements') && landing.includes('更新公告'),
  'Landing page must expose an update announcement button.',
);
assert(
  landing.includes('onCloudSave') && landing.indexOf('GitHub 云存档') < landing.indexOf('更新公告'),
  'Update announcement button must sit next to the GitHub cloud save entry.',
);
assert(
  app.includes('ReleaseAnnouncementsModal') &&
    app.includes('showReleaseAnnouncements') &&
    app.includes('setShowReleaseAnnouncements(true)'),
  'App must open the release announcements modal from the landing page.',
);
assert(
  modal.includes("import { RELEASE_ANNOUNCEMENTS } from '@/data/releaseAnnouncements'"),
  'Release announcements modal must use the dedicated in-app announcement data source.',
);
assert(
  !modal.includes('CHANGELOG') && !data.includes('CHANGELOG'),
  'In-game announcements must not read CHANGELOG.md directly.',
);
assert(
  data.includes("version: 'v0.7'") &&
    data.indexOf("version: 'v0.7'") < data.indexOf("version: 'v0.5.2'") &&
    data.includes('智库角色档案、缓存诊断与剧情推进优化') &&
    data.includes('每回合显示 token 消耗与缓存命中信息') &&
    data.includes('剧情编织推进改为累计证据与分级跨段纠偏') &&
    data.includes('跨段纠偏时，中间段会按“已跳过”归档'),
  'Release announcement data must include the current v0.7 player-facing notice.',
);

console.log('release announcements regression ok');
