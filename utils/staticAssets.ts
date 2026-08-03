import staticAssetManifest from '@/data/staticAssetManifest.json';

export const STATIC_ASSET_FALLBACK_AVATAR = '/assets/static-fallback/avatar-placeholder.webp';

const STATIC_ASSET_LOGICAL_ID_PREFIX = 'static:';
const STATIC_ASSET_PATH_PATTERN = /^\/static\/[0-9a-f]{64}\.webp$/;
const STATIC_ASSET_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const LEGACY_BUILTIN_AVATAR_PATH_PATTERN = /(?:^|\/)public\/assets\/builtin-avatars\/candidates\/([^/?#]+?)-(\d{1,2})\.png$/i;
const BUILTIN_AVATAR_PATH_PATTERN = /(?:^|\/)assets\/builtin-avatars\/candidates\/([^/?#]+?)-(\d{1,2})\.png$/i;

interface StaticAssetManifestEntry {
  path: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
}

interface StaticAssetManifest {
  schemaVersion: number;
  assetBaseUrl: string;
  assets: Record<string, StaticAssetManifestEntry>;
}

const manifest = staticAssetManifest as StaticAssetManifest;

function isValidManifestEntry(entry: StaticAssetManifestEntry | undefined): entry is StaticAssetManifestEntry {
  return Boolean(
    entry
    && STATIC_ASSET_PATH_PATTERN.test(entry.path)
    && STATIC_ASSET_DIGEST_PATTERN.test(entry.sha256)
    && entry.path.includes(entry.sha256)
    && Number.isSafeInteger(entry.width)
    && entry.width > 0
    && Number.isSafeInteger(entry.height)
    && entry.height > 0
    && Number.isSafeInteger(entry.bytes)
    && entry.bytes > 0
    && entry.contentType === 'image/webp'
  );
}

function getStaticAssetEntry(logicalId: string): StaticAssetManifestEntry | undefined {
  const entry = manifest.assets[logicalId];
  return isValidManifestEntry(entry) ? entry : undefined;
}

function getLegacyBuiltinAvatarLogicalId(reference: string): string | undefined {
  const normalizedReference = reference.trim().replace(/\\/g, '/');
  let pathname = normalizedReference;

  try {
    if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(normalizedReference)) {
      pathname = new URL(normalizedReference).pathname;
    }
  } catch {
    return undefined;
  }

  const cleanPath = pathname.split(/[?#]/, 1)[0];
  const match = LEGACY_BUILTIN_AVATAR_PATH_PATTERN.exec(cleanPath)
    ?? BUILTIN_AVATAR_PATH_PATTERN.exec(cleanPath);
  if (!match) return undefined;

  let owner = match[1];
  try {
    owner = decodeURIComponent(owner);
  } catch {
    return undefined;
  }
  const variant = match[2].padStart(2, '0');
  const logicalId = `avatar:${owner.toLowerCase()}:${variant}`;
  return getStaticAssetEntry(logicalId) ? logicalId : undefined;
}

export function createStaticAssetReference(logicalId: string): string {
  return `${STATIC_ASSET_LOGICAL_ID_PREFIX}${logicalId}`;
}

export function resolveStaticAssetReference(reference: string | undefined): string | undefined {
  const value = reference?.trim();
  if (!value) return undefined;
  const logicalId = value.startsWith(STATIC_ASSET_LOGICAL_ID_PREFIX)
    ? value.slice(STATIC_ASSET_LOGICAL_ID_PREFIX.length)
    : getLegacyBuiltinAvatarLogicalId(value) ?? value;
  const entry = getStaticAssetEntry(logicalId);
  if (!entry) return undefined;
  return new URL(entry.path, manifest.assetBaseUrl).toString();
}

export function resolveStaticAssetOrLocal(
  logicalId: string,
  localFallback: string,
): string {
  return resolveStaticAssetReference(logicalId) ?? localFallback;
}

export function isRemoteStaticAssetUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const base = new URL(manifest.assetBaseUrl);
    const url = new URL(value, base);
    return url.origin === base.origin && STATIC_ASSET_PATH_PATTERN.test(url.pathname);
  } catch {
    return false;
  }
}
