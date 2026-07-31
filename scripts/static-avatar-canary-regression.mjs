import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('data/staticAssetManifest.json'));

const expected = {
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

assert.equal(manifest.schemaVersion, 1, 'static asset manifest schema must remain version 1');
assert.equal(manifest.assetBaseUrl, 'https://lingkvault.cc.cd', 'canary must use the custom K-Vault domain');
assert.deepEqual(Object.keys(manifest.assets).sort(), Object.keys(expected).sort(), 'only three canary avatars may be remote');

for (const [logicalId, contract] of Object.entries(expected)) {
  const asset = manifest.assets[logicalId];
  assert.ok(asset, `missing manifest asset ${logicalId}`);
  assert.equal(asset.sha256, contract.digest, `${logicalId} digest mismatch`);
  assert.equal(asset.path, `/static/${contract.digest}.webp`, `${logicalId} must use a content-addressed WebP path`);
  assert.equal(asset.bytes, contract.bytes, `${logicalId} byte length mismatch`);
  assert.equal(asset.width, 768, `${logicalId} width mismatch`);
  assert.equal(asset.height, 768, `${logicalId} height mismatch`);
  assert.equal(asset.contentType, 'image/webp', `${logicalId} content type mismatch`);
}

const serializedManifest = JSON.stringify(manifest);
for (const forbidden of ['sourceKey', 'telegram', 'TG_', 'Bot_Token', 'api_token', 'KVAULT_API_TOKEN']) {
  assert.ok(!serializedManifest.toLowerCase().includes(forbidden.toLowerCase()), `manifest must not contain ${forbidden}`);
}

const candidateDir = path.join(root, 'public/assets/builtin-avatars/candidates');
const localPngs = fs.readdirSync(candidateDir).filter((name) => name.endsWith('.png'));
assert.equal(localPngs.length, 33, 'stage 3 must retain all 33 local PNG avatars');
for (const logicalId of Object.keys(expected)) {
  const [, owner, variant] = logicalId.split(':');
  assert.ok(fs.existsSync(path.join(candidateDir, `${owner}-${variant}.png`)), `${logicalId} local rollback source is missing`);
}

const placeholderPath = path.join(root, 'public/assets/static-fallback/avatar-placeholder.webp');
const placeholder = fs.readFileSync(placeholderPath);
assert.ok(placeholder.length > 256, 'local avatar placeholder must not be empty');
assert.equal(placeholder.subarray(0, 4).toString('ascii'), 'RIFF', 'placeholder must be a WebP RIFF file');
assert.equal(placeholder.subarray(8, 12).toString('ascii'), 'WEBP', 'placeholder must be a WebP image');

const resolver = read('utils/staticAssets.ts');
for (const contract of Object.values(expected)) {
  assert.ok(serializedManifest.includes(contract.digest), `resolver manifest must retain ${contract.digest}`);
}
assert.ok(resolver.includes("STATIC_ASSET_FALLBACK_AVATAR = '/assets/static-fallback/avatar-placeholder.webp'"), 'resolver must expose the local placeholder');
assert.ok(resolver.includes("const STATIC_ASSET_LOGICAL_ID_PREFIX = 'static:'"), 'resolver must support logical static references');
assert.ok(resolver.includes('entry.path.includes(entry.sha256)'), 'resolver must reject path/digest mismatches');
assert.ok(resolver.includes("url.origin === base.origin"), 'remote static URL detection must stay on the manifest origin');

const builtin = read('data/builtinAvatars.ts');
for (const id of ['caelus-01', 'bronya-02', 'asta-03']) {
  assert.ok(builtin.includes(`src: avatarSource('${id}')`), `${id} must resolve through the static manifest`);
  assert.ok(builtin.includes(`reference: avatarReference('${id}')`), `${id} must preserve a logical mount reference`);
}
assert.ok(builtin.includes('isRemoteStaticAssetUrl(candidate.src)'), 'default surfaces must deliberately exercise migrated canary avatars');
assert.ok(builtin.includes('candidates?.[0]?.src'), 'non-canary characters must retain their original local default');

const resilientImage = read('components/ui/ResilientImage.tsx');
assert.ok(resilientImage.includes('resolveStaticAssetReference(src) ?? src'), 'image component must resolve saved static references');
assert.ok(resilientImage.includes("displaySrc !== fallbackSrc"), 'image fallback must stop after one substitution');
assert.ok(resilientImage.includes("data-static-asset-fallback={displaySrc === fallbackSrc ? 'true' : 'false'}"), 'fallback state must be observable in UI verification');

const albumActions = read('utils/albumActions.ts');
assert.ok(albumActions.includes("if (trimmed.startsWith('static:'))"), 'album resolver must recognize static logical references');
assert.ok(albumActions.includes('return resolveStaticAssetReference(trimmed)'), 'album resolver must map static references through the manifest');
assert.ok(albumActions.includes('return trimmed'), 'legacy local paths and remote URLs must remain compatible');

const albumWorkspace = read('components/features/GameSystems/album/workspaces.tsx');
const albumPanel = read('components/features/GameSystems/AlbumPanel.tsx');
assert.ok(albumWorkspace.includes('mountSrc?: string'), 'character library entries must separate display URLs from persisted references');
assert.ok(albumWorkspace.includes('mountSrc: candidate.reference'), 'built-in canary entries must expose their logical mount reference');
assert.ok(albumPanel.includes('item?.mountSrc || item?.src || params.src'), 'mounting must prefer the logical reference');

const resilientSurfaces = [
  'components/features/ZhikuV2/ArchiveBrowser.tsx',
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
  assert.ok(source.includes("@/components/ui/ResilientImage"), `${file} must import the shared resilient image`);
  assert.ok(source.includes('<ResilientImage'), `${file} must render the shared resilient image`);
}

console.log('Static avatar canary regression passed: 3 remote avatars, 33 local rollback PNGs, shared fallback coverage.');
