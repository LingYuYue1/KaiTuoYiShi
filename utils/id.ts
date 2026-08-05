export const UNIFIED_ID_DB_VERSION = 8;

export function createUnifiedId(): string {
  const timestamp = Math.floor(Date.now() / 10).toString(16).padStart(10, '0');
  const timestampPrefix = timestamp.slice(0, 4);
  const timestampSuffix = timestamp.slice(4);
  const version = UNIFIED_ID_DB_VERSION.toString(16).padStart(3, '0');
  const random = Math.floor(Math.random() * 16).toString(16);
  return `${timestampPrefix}-${timestampSuffix}-${version}${random}`;
}
