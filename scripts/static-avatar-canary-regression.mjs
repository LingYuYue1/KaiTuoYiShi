import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('data/staticAssetManifest.json'));
const avatarInventory = JSON.parse(read('public/assets/builtin-avatars/candidates/avatar-candidates.json'));

const preservedCanaries = {
  'avatar:caelus:01': {
    digest: '8c78f63569206d0de5abc9ff93aa0f85e5c8189a972947038bd5550471e05e61',
    bytes: 64636,
  },
  'avatar:bronya:02': {
    digest: '8a4ebaf7444c64222c7e024baf71743a207c91be38248b290a2c38eceb6159db',
    bytes: 107444,
  },
  'avatar:asta:03': {
    digest: '2f695b5ce54b34c7d6d8af5c04d30008cccba84cb9e698361c26ed67aa4cb070',
    bytes: 118754,
  },
};
const rejectedArlanDigest = '55c7e74be88c0697af5efa17f12d27b1e8265a80d33938da294125374ef7a122';

function parseInventoryVariant(character, variant) {
  assert.ok(variant.startsWith('static:'), `avatar inventory must use a remote static reference: ${variant}`);
  const logicalId = variant.slice('static:'.length);
  const match = /^avatar:([^:]+):(\d+)$/.exec(logicalId);
  assert.ok(match, `invalid static avatar reference: ${variant}`);
  assert.equal(match[1], character.id, `${variant} owner must match ${character.id}`);
  return {
    logicalId,
    candidateId: `${match[1]}-${match[2]}`,
  };
}

const inventoryVariants = avatarInventory.characters.flatMap((character) => (
  character.variants.map((variant) => parseInventoryVariant(character, variant))
));
const expectedLogicalIds = inventoryVariants.map((variant) => variant.logicalId).sort();

assert.equal(manifest.schemaVersion, 1, 'static asset manifest schema must remain version 1');
assert.equal(manifest.assetBaseUrl, 'https://lingkvault.cc.cd', 'avatars must use the custom K-Vault domain');
assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)), 'bulk avatar manifest must record its generation time');
assert.equal(avatarInventory.characters.length, 89, 'avatar inventory must contain 89 characters');
assert.equal(expectedLogicalIds.length, 113, 'avatar inventory must contain 113 candidates');
assert.equal(new Set(expectedLogicalIds).size, 113, 'avatar inventory logical IDs must be unique');
assert.deepEqual(Object.keys(manifest.assets).sort(), expectedLogicalIds, 'all 113 avatar candidates must be remote');

const remotePaths = new Set();
const remoteDigests = new Set();
for (const logicalId of expectedLogicalIds) {
  const asset = manifest.assets[logicalId];
  assert.ok(asset, `missing manifest asset ${logicalId}`);
  assert.match(asset.sha256, /^[0-9a-f]{64}$/, `${logicalId} digest must be lowercase SHA-256`);
  assert.equal(asset.path, `/static/${asset.sha256}.webp`, `${logicalId} must use a content-addressed WebP path`);
  assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, `${logicalId} byte length must be positive`);
  assert.equal(asset.width, 768, `${logicalId} width mismatch`);
  assert.equal(asset.height, 768, `${logicalId} height mismatch`);
  assert.equal(asset.contentType, 'image/webp', `${logicalId} content type mismatch`);
  assert.ok(!remotePaths.has(asset.path), `${logicalId} duplicates remote path ${asset.path}`);
  assert.ok(!remoteDigests.has(asset.sha256), `${logicalId} duplicates digest ${asset.sha256}`);
  remotePaths.add(asset.path);
  remoteDigests.add(asset.sha256);
}

for (const [logicalId, contract] of Object.entries(preservedCanaries)) {
  const asset = manifest.assets[logicalId];
  assert.equal(asset.sha256, contract.digest, `${logicalId} canary digest must be reused`);
  assert.equal(asset.bytes, contract.bytes, `${logicalId} canary byte length must be reused`);
}
assert.equal(manifest.assets['avatar:arlan:01'].sha256, '5aa8a592848f1134222e16ee2d1652052061a4de6dbc7a734ddeff9c2f8b921b', 'approved Arlan 01 must remain production');
assert.ok(!remoteDigests.has(rejectedArlanDigest), 'rejected Arlan batch digest must stay out of the production manifest');

const serializedManifest = JSON.stringify(manifest);
for (const forbidden of ['sourceKey', 'telegram', 'TG_', 'Bot_Token', 'api_token', 'KVAULT_API_TOKEN']) {
  assert.ok(!serializedManifest.toLowerCase().includes(forbidden.toLowerCase()), `manifest must not contain ${forbidden}`);
}

const candidateDir = path.join(root, 'public/assets/builtin-avatars/candidates');
const localPngs = fs.readdirSync(candidateDir).filter((name) => name.endsWith('.png'));
assert.equal(localPngs.length, 0, 'repository must not retain character avatar PNGs after remote-only cutover');

const placeholderPath = path.join(root, 'public/assets/static-fallback/avatar-placeholder.webp');
const placeholder = fs.readFileSync(placeholderPath);
assert.ok(placeholder.length > 256, 'local avatar placeholder must not be empty');
assert.equal(placeholder.subarray(0, 4).toString('ascii'), 'RIFF', 'placeholder must be a WebP RIFF file');
assert.equal(placeholder.subarray(8, 12).toString('ascii'), 'WEBP', 'placeholder must be a WebP image');

const resolver = read('utils/staticAssets.ts');
for (const contract of Object.values(preservedCanaries)) {
  assert.ok(serializedManifest.includes(contract.digest), `resolver manifest must retain ${contract.digest}`);
}
assert.ok(resolver.includes("STATIC_ASSET_FALLBACK_AVATAR = '/assets/static-fallback/avatar-placeholder.webp'"), 'resolver must expose the local placeholder');
assert.ok(resolver.includes("const STATIC_ASSET_LOGICAL_ID_PREFIX = 'static:'"), 'resolver must support logical static references');
assert.ok(resolver.includes('entry.path.includes(entry.sha256)'), 'resolver must reject path/digest mismatches');
assert.ok(resolver.includes('url.origin === base.origin'), 'remote static URL detection must stay on the manifest origin');

const builtin = read('data/builtinAvatars.ts');
for (const variant of inventoryVariants) {
  assert.ok(builtin.includes(`src: avatarSource('${variant.candidateId}')`), `${variant.candidateId} must resolve through the static manifest`);
  assert.ok(builtin.includes(`reference: avatarReference('${variant.candidateId}')`), `${variant.candidateId} must preserve a logical mount reference`);
}
assert.ok(!builtin.includes('LOCAL_AVATAR_CANDIDATE_IDS'), 'built-in avatar sources must not retain local character avatar branches');
assert.ok(!builtin.includes("const BASE = '/assets/builtin-avatars/candidates'"), 'built-in avatar sources must not retain the removed avatar directory');
assert.ok(builtin.includes('resolveStaticAssetOrLocal(avatarLogicalId(id), STATIC_ASSET_FALLBACK_AVATAR)'), 'all remote avatars must use the shared local placeholder as fallback');
assert.ok(builtin.includes('isRemoteStaticAssetUrl(candidate.src)'), 'default surfaces must deliberately exercise migrated avatars');
assert.ok(builtin.includes('candidates?.[0]?.src'), 'manifest lookup failures must retain the first candidate fallback');

const resilientImage = read('components/ui/ResilientImage.tsx');
assert.ok(resilientImage.includes('resolveStaticAssetReference(src) ?? src'), 'image component must resolve saved static references');
assert.ok(resilientImage.includes('displaySrc !== fallbackSrc'), 'image fallback must stop after one substitution');
assert.ok(resilientImage.includes("data-static-asset-fallback={displaySrc === fallbackSrc ? 'true' : 'false'}"), 'fallback state must be observable in UI verification');

const albumActions = read('utils/albumActions.ts');
assert.ok(albumActions.includes('const resolvedStatic = resolveStaticAssetReference(trimmed)'), 'album resolver must check logical and legacy static references');
assert.ok(albumActions.includes('if (resolvedStatic) return resolvedStatic'), 'album resolver must map recognized references through the manifest');
assert.ok(albumActions.includes("if (trimmed.startsWith('static:')) return undefined"), 'invalid static references must not be rendered as literal URLs');
assert.ok(albumActions.includes('return trimmed'), 'legacy local paths and remote URLs must remain compatible');

const albumWorkspace = read('components/features/GameSystems/album/workspaces.tsx');
const albumPanel = read('components/features/GameSystems/AlbumPanel.tsx');
const packageJson = JSON.parse(read('package.json'));
const retiredAvatarCleaner = read('scripts/clean-retired-avatar-artifacts.mjs');
assert.ok(albumWorkspace.includes('mountSrc?: string'), 'character library entries must separate display URLs from persisted references');
assert.ok(albumWorkspace.includes('mountSrc: candidate.reference'), 'built-in avatar entries must expose their logical mount reference');
assert.ok(albumPanel.includes('item?.mountSrc || item?.src || params.src'), 'mounting must prefer the logical reference');
assert.ok(packageJson.scripts.build.startsWith('node scripts/clean-retired-avatar-artifacts.mjs &&'), 'production build must remove retired avatar artifacts before bundling');
assert.ok(retiredAvatarCleaner.includes("'assets/builtin-avatars/candidates'"), 'avatar artifact cleanup must stay scoped to the retired output directory');
assert.ok(retiredAvatarCleaner.includes("entry.name.toLowerCase().endsWith('.png')"), 'avatar artifact cleanup must remove only PNG files');

const resilientSurfaces = [
  'components/features/ZhikuV3/ArchiveBrowser.tsx',
  'components/features/GameSystems/album/workspaces.tsx',
  'components/features/GameSystems/CompanionPanel.tsx',
  'components/features/Phone/PhoneModal.tsx',
  'components/features/Chat/TurnItem.tsx',
  'components/features/Chat/MessageRenderers.tsx',
  'components/layout/LeftPanel.tsx',
  'components/features/Character/TravelerProfileModal.tsx',
];
for (const file of resilientSurfaces) {
  const source = read(file);
  assert.ok(source.includes('@/components/ui/ResilientImage'), `${file} must import the shared resilient image`);
  assert.ok(source.includes('<ResilientImage'), `${file} must render the shared resilient image`);
}

console.log('Static avatar regression passed: 113 remote avatars across 89 characters, zero repository-local character avatar PNGs, shared fallback coverage.');
