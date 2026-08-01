import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8');
const allScripts = fs.readdirSync('scripts');

const desktopScripts = Object.keys(packageJson.scripts ?? {})
  .filter((name) => name.startsWith('desktop:') || name === 'test:desktop-edition');
assert(desktopScripts.length === 0, `package.json 仍暴露桌面脚本：${desktopScripts.join(', ')}`);
assert(!packageJson.dependencies?.['@tauri-apps/api'], 'package.json 仍包含 Tauri API 依赖。');
assert(!packageJson.dependencies?.['@tauri-apps/plugin-updater'], 'package.json 仍包含 Tauri updater 依赖。');
assert(!packageJson.devDependencies?.['@tauri-apps/cli'], 'package.json 仍包含 Tauri CLI 依赖。');
assert(!lockfile.includes('@tauri-apps/'), 'pnpm-lock.yaml 仍包含 Tauri 包。');

const staleScriptFiles = allScripts.filter((name) => /^desktop-.*\.mjs$/i.test(name));
assert(staleScriptFiles.length === 0, `scripts/ 仍存在桌面脚本：${staleScriptFiles.join(', ')}`);
assert(!fs.existsSync('src-tauri/Cargo.toml'), 'src-tauri Rust 工程仍可作为构建入口。');
assert(!fs.existsSync('src-tauri/src'), 'src-tauri Rust 源码目录仍存在。');

function walkFiles(entry) {
  if (!fs.existsSync(entry)) return [];
  const stat = fs.statSync(entry);
  if (stat.isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((child) => {
    const childPath = path.join(entry, child.name);
    return child.isDirectory() ? walkFiles(childPath) : [childPath];
  });
}

const effectiveSourceFiles = [
  'App.tsx',
  'main.tsx',
  'vite.config.ts',
  'components',
  'hooks',
  'services',
  'utils',
].flatMap(walkFiles);
const runtimeDesktopImport = /@tauri-apps\/|services[\\/]desktop[\\/]|desktopRuntime|DesktopHomeScreen/;
for (const file of effectiveSourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!runtimeDesktopImport.test(source), `生产入口仍引用桌面运行时：${file}`);
}

const regressionRunner = fs.readFileSync('scripts/run-all-regressions.mjs', 'utf8');
assert(!regressionRunner.includes('desktop-edition-regression'), '全量回归仍引用已退休的桌面回归。');

console.log('[web-only-retirement-regression] ok');
