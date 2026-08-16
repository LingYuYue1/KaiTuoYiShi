import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.resolve(root, 'dist');
const avatarOutputDir = path.resolve(distRoot, 'assets/builtin-avatars/candidates');
const relativeOutput = path.relative(distRoot, avatarOutputDir);

if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error(`Refusing to clean unexpected avatar output path: ${avatarOutputDir}`);
}

if (!fs.existsSync(avatarOutputDir)) {
  console.log('Retired avatar artifact cleanup: no previous output directory.');
  process.exit(0);
}

const retiredPngs = fs.readdirSync(avatarOutputDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'));

for (const entry of retiredPngs) {
  fs.unlinkSync(path.join(avatarOutputDir, entry.name));
}

console.log(`Retired avatar artifact cleanup: removed ${retiredPngs.length} stale PNG files.`);
