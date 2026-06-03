import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const avatarTs = fs.readFileSync(path.join(root, 'data/builtinAvatars.ts'), 'utf8');
const manifestPath = path.join(root, 'public/assets/builtin-avatars/candidates/avatar-candidates.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const requiredIds = [
  'march7th',
  'danheng',
  'himeko',
  'welt',
  'pom-pom',
  'herta',
  'asta',
  'arlan',
  'stelle',
  'caelus',
  'bronya',
];

const errors = [];
const characters = Array.isArray(manifest.characters) ? manifest.characters : [];

for (const id of requiredIds) {
  const item = characters.find((character) => character.id === id);
  if (!item) {
    errors.push(`avatar-candidates.json missing character id: ${id}`);
    continue;
  }
  if (!Array.isArray(item.variants) || item.variants.length !== 3) {
    errors.push(`${id} should have exactly 3 avatar variants`);
    continue;
  }
  for (const variant of item.variants) {
    const filePath = path.join(root, variant.replace(/^public[\\/]/, 'public/'));
    if (!fs.existsSync(filePath)) errors.push(`${id} manifest variant does not exist: ${variant}`);
  }
}

const aliasChecks = [
  [`'丹恒·饮月': '丹恒'`, '丹恒·饮月 should reuse 丹恒 built-in avatars'],
  [`'三月七·巡猎': '三月七'`, '三月七·巡猎 should reuse 三月七 built-in avatars'],
  ['BUILTIN_AVATAR_CANONICAL_ALIASES[canonicalName] ?? canonicalName', 'getBuiltinAvatarSet should resolve avatar owner aliases'],
];

for (const [needle, message] of aliasChecks) {
  if (!avatarTs.includes(needle)) errors.push(message);
}

for (const id of requiredIds) {
  const prefix = id === 'pom-pom' ? 'pom-pom' : id;
  if (!avatarTs.includes(`${prefix}-01`)) errors.push(`builtinAvatars.ts missing ${prefix}-01`);
}

if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Builtin avatar regression passed: ${requiredIds.length} characters, 3 variants each.`);
