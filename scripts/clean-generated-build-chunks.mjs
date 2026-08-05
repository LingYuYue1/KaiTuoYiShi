import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.resolve(root, 'dist');
const assetsRoot = path.resolve(distRoot, 'assets');
const relativeAssets = path.relative(distRoot, assetsRoot);

if (!relativeAssets || relativeAssets.startsWith('..') || path.isAbsolute(relativeAssets)) {
  throw new Error(`Refusing to clean unexpected build assets path: ${assetsRoot}`);
}

if (!fs.existsSync(assetsRoot)) {
  console.log('Generated build chunk cleanup: no previous assets directory.');
  process.exit(0);
}

const generatedChunks = fs.readdirSync(assetsRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:css|js)$/iu.test(entry.name));

for (const entry of generatedChunks) {
  fs.unlinkSync(path.join(assetsRoot, entry.name));
}

console.log(`Generated build chunk cleanup: removed ${generatedChunks.length} stale JS/CSS files.`);
