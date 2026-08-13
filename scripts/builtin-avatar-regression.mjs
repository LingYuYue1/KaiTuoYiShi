import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const avatarTs = read('data/builtinAvatars.ts');
const staticManifest = JSON.parse(read('data/staticAssetManifest.json'));
const inventory = JSON.parse(read('public/assets/builtin-avatars/candidates/avatar-candidates.json'));
const canonicalSource = read('data/canonicalCharacters.ts');
const canonicalModuleUrl = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(canonicalSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText, 'utf8').toString('base64')}`;
const { CANONICAL_CHARACTERS } = await import(canonicalModuleUrl);

const errors = [];
const characters = Array.isArray(inventory.characters) ? inventory.characters : [];
const characterIds = new Set();
const characterNames = new Set();
const logicalIds = new Set();

function parseVariant(character, variant) {
  if (typeof variant !== 'string' || !variant.trim()) {
    return { error: `${character.id} has an empty avatar variant` };
  }

  if (!variant.startsWith('static:')) {
    return { error: `${character.id} must use a remote static avatar reference: ${variant}` };
  }

  const logicalId = variant.slice('static:'.length);
  const match = /^avatar:([^:]+):(\d+)$/.exec(logicalId);
  if (!match || match[1] !== character.id) {
    return { error: `${character.id} has an invalid static variant: ${variant}` };
  }
  return {
    candidateId: `${match[1]}-${match[2]}`,
    logicalId,
  };
}

for (const character of characters) {
  if (!character?.id || !character?.name) {
    errors.push('avatar inventory characters must have non-empty id and name fields');
    continue;
  }
  if (characterIds.has(character.id)) errors.push(`duplicate avatar character id: ${character.id}`);
  if (characterNames.has(character.name)) errors.push(`duplicate avatar character name: ${character.name}`);
  if (character.name.includes('?')) errors.push(`${character.id} display name contains ?: ${character.name}`);
  characterIds.add(character.id);
  characterNames.add(character.name);

  const canonicalNameEntry = `canonicalName: '${character.name}'`;
  if (!avatarTs.includes(canonicalNameEntry)) {
    errors.push(`builtinAvatars.ts missing canonical display name ${canonicalNameEntry}`);
  }

  if (!Array.isArray(character.variants) || character.variants.length === 0) {
    errors.push(`${character.id} must have at least one avatar variant`);
    continue;
  }

  for (const variant of character.variants) {
    const parsed = parseVariant(character, variant);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    if (logicalIds.has(parsed.logicalId)) errors.push(`duplicate avatar logical id: ${parsed.logicalId}`);
    logicalIds.add(parsed.logicalId);

    if (!staticManifest.assets[parsed.logicalId]) {
      errors.push(`${parsed.logicalId} is missing from data/staticAssetManifest.json`);
    }
    if (!avatarTs.includes(`src: avatarSource('${parsed.candidateId}')`)) {
      errors.push(`builtinAvatars.ts missing ${parsed.candidateId} source`);
    }
    if (!avatarTs.includes(`reference: avatarReference('${parsed.candidateId}')`)) {
      errors.push(`builtinAvatars.ts missing ${parsed.candidateId} logical reference`);
    }
    const variantNumber = parsed.candidateId.match(/-(\d+)$/)?.[1];
    const titleEntry = `title: '${character.name} ${variantNumber}'`;
    if (!avatarTs.includes(titleEntry)) {
      errors.push(`builtinAvatars.ts missing display title ${titleEntry}`);
    }
  }

  for (const alias of character.aliases ?? []) {
    if (alias.includes('?')) errors.push(`${character.id} alias contains ?: ${alias}`);
    const aliasEntry = `'${alias}': '${character.name}'`;
    if (!avatarTs.includes(aliasEntry)) errors.push(`builtinAvatars.ts missing alias ${aliasEntry}`);
  }
}

if (characters.length !== 89) errors.push(`avatar inventory should contain 89 characters, got ${characters.length}`);
if (logicalIds.size !== 113) errors.push(`avatar inventory should contain 113 variants, got ${logicalIds.size}`);
const candidateDir = path.join(root, 'public/assets/builtin-avatars/candidates');
const localPngs = fs.readdirSync(candidateDir).filter((name) => name.endsWith('.png'));
if (localPngs.length !== 0) {
  errors.push(`repository must not retain character avatar PNGs, found ${localPngs.length}`);
}

for (const canonical of CANONICAL_CHARACTERS) {
  const avatarCharacter = characters.find((character) => character.name === canonical.name);
  if (!avatarCharacter) continue;
  const inventoryAliases = new Set(avatarCharacter.aliases ?? []);
  for (const alias of canonical.aliases ?? []) {
    if (!inventoryAliases.has(alias)) {
      errors.push(`${canonical.name} canonical alias is missing from avatar inventory: ${alias}`);
    }
  }
}
if (avatarTs.includes('LOCAL_AVATAR_CANDIDATE_IDS') || avatarTs.includes("const BASE = '/assets/builtin-avatars/candidates'")) {
  errors.push('builtinAvatars.ts must not retain repository-local character avatar paths');
}
if (!avatarTs.includes('resolveStaticAssetOrLocal(avatarLogicalId(id), STATIC_ASSET_FALLBACK_AVATAR)')) {
  errors.push('all remote avatars must share the local failure placeholder');
}
if (!avatarTs.includes('BUILTIN_AVATAR_CANONICAL_ALIASES[normalizedName] ?? normalizedName')) {
  errors.push('getBuiltinAvatarSet should resolve avatar owner aliases');
}
if (!avatarTs.includes('export function getBuiltinAvatarSetForNames')) {
  errors.push('expanded avatar lookup must support NPC display names and saved aliases');
}

if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Builtin avatar regression passed: ${characters.length} characters, ${logicalIds.size} remote variants, zero repository-local character avatar PNGs.`);
