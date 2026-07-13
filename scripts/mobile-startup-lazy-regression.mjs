import fs from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const appSource = await fs.readFile(path.join(root, 'App.tsx'), 'utf8');

const lazyModules = [
  '@/components/features/NewGame/NewGameWizard',
  '@/components/features/Settings/SettingsModal',
  '@/components/features/SaveLoad/SaveLoadModal',
  '@/components/features/Phone/PhoneModal',
  '@/components/features/Worldbook/WorldbookManagerModal',
  '@/components/features/GameSystems/ZhikuManagerModal',
  '@/components/features/CloudSave/GitHubCloudSaveModal',
  '@/components/features/Release/ReleaseAnnouncementsModal',
  '@/components/features/GameSystems/PlotPanel',
  '@/components/features/GameSystems/YitingPanel',
  '@/components/features/GameSystems/ZhikuPanel',
  '@/components/features/GameSystems/MemoryPanel',
  '@/components/features/GameSystems/AlbumPanel',
  '@/components/features/GameSystems/StarMapPanel',
];

for (const modulePath of lazyModules) {
  const staticImportRe = new RegExp(`^import\\s+(?!type\\b)[^;]+from ['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];`, 'm');
  assert(!staticImportRe.test(appSource), `${modulePath} 不应被 App.tsx 运行时静态导入。`);
  assert(appSource.includes(`lazy(() => import('${modulePath}')`), `${modulePath} 应通过 React.lazy 按需加载。`);
}

assert(appSource.includes('import { lazy, Suspense,'), 'App.tsx 应引入 lazy 和 Suspense。');
assert(appSource.includes('<Suspense fallback={<LazySurfaceFallback label="系统面板载入中" />}>'), '系统抽屉内容应有 Suspense fallback。');
assert(appSource.includes('<Suspense fallback={<LazySurfaceFallback label="手机载入中" />}>'), '手机弹窗应有 Suspense fallback。');

console.log('mobile startup lazy regression ok');
