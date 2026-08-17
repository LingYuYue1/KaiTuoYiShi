import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
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
  landing.includes('开拓轶事 v{pkg.version}'),
  'Landing page must show the current version.',
);
const majorMinor = pkg.version.split('.').slice(0, 2).join('.');
assert(
  data.includes(`version: 'v${majorMinor}'`) &&
    data.indexOf(`version: 'v${majorMinor}'`) < data.indexOf("version: 'v2.0'"),
  'Announcement data must open with a notice for the current version.',
);
assert(
  landing.includes('作者：牢凌') &&
    landing.includes('贡献者：11MOMO') &&
    landing.includes('>Penna Mch</strong>'),
  'Landing page must show the current author and contributor credits.',
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
  data.includes("version: 'v1.2.2'") &&
    data.indexOf("version: 'v1.2.2'") < data.indexOf("version: 'v1.2.1'") &&
    data.includes('失败草稿') &&
    data.includes('批量记忆重建') &&
    data.includes('NovelAI') &&
    data.includes('阿格莱雅') &&
    data.includes('星期日'),
  'Release announcement data must include the current v1.2.2 stability, NAI, and Zhiku notice.',
);
assert(
  data.includes("version: 'v1.2'") &&
    data.indexOf("version: 'v1.2'") < data.indexOf("version: 'v1.1'") &&
    data.includes('完整云备份') &&
    data.includes('合并去重') &&
    data.includes('每棵存档树') &&
    data.includes('本版本不包含地图分支内容'),
  'Release announcement data must include the current v1.2 save stability notice.',
);
assert(
  data.includes("version: 'v1.0'") &&
    data.indexOf("version: 'v1.0'") < data.indexOf("version: 'v0.8.1'") &&
    data.includes('酒馆预设') &&
    data.includes('正文格式保护') &&
    data.includes('token') &&
    data.includes('智库') &&
    data.includes('天气氛围') &&
    data.includes('抢话') &&
    data.includes('防抢话') &&
    data.includes('AI 生成战技') &&
    data.includes('v1.0'),
  'Release announcement data must include the current v1.0 player-facing notice.',
);

console.log('release announcements regression ok');
