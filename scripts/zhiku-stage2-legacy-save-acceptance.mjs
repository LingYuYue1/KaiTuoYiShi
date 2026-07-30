import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function contentProjection(entry) {
  const {
    id: _id,
    兼容ID: _legacyIds,
    治理分类: _governanceCategory,
    资料所有者: _owner,
    来源预设ID: _sourcePresetId,
    来源文件: _sourceFile,
    来源序号: _sourceIndex,
    资料版本: _schemaVersion,
    辅助字段版本: _auxiliaryFieldsVersion,
    ...content
  } = entry;
  return content;
}

const root = process.cwd();
const savePath = process.argv[2];
assert(savePath, 'usage: node scripts/zhiku-stage2-legacy-save-acceptance.mjs <legacy-save.json>');
assert(fs.existsSync(savePath), `legacy save does not exist: ${savePath}`);
assert(path.extname(savePath).toLowerCase() === '.json', 'legacy save acceptance currently requires an exported JSON save');

const bundlePath = path.join(os.tmpdir(), `zhiku-stage2-legacy-save-${process.pid}-${Date.now()}.mjs`);
const originalBuffer = fs.readFileSync(savePath);
const originalHash = sha256(originalBuffer);

try {
  const save = JSON.parse(originalBuffer.toString('utf8'));
  assert(save && typeof save === 'object' && save.智库 && Array.isArray(save.智库.条目), 'legacy save has no zhiku system');

  await build({
    stdin: {
      contents: [
        "export * from './models/zhiku';",
        "export * from './models/zhikuGovernance';",
        "export * from './data/zhikuCustomGovernance';",
        "export * from './data/zhikuIdentityRegistry';",
        "export * from './data/zhikuPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage2-legacy-save-acceptance-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: bundlePath,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  globalThis.fetch = async (input) => {
    const requestPath = String(input).split('?')[0].replace(/^\//u, '');
    const filePath = path.join(root, 'public', requestPath);
    if (!fs.existsSync(filePath)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(filePath), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const legacySystem = api.归一化智库系统(save.智库);
  const legacyCustomEntries = legacySystem.条目.filter((entry) => !entry.builtin);
  assert(legacyCustomEntries.length > 0, 'legacy save must contain at least one custom zhiku entry');
  assert(legacyCustomEntries.every((entry) => !api.ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)), 'fixture is no longer a legacy custom-id save');

  const bundled = await api.loadAllBundledZhikuPresets();
  assert(bundled.条目.length === 162, `bundled migration input changed: ${bundled.条目.length}`);
  const merged = api.mergeBundledZhikuSystem(bundled, save.智库, Date.now());
  const migratedCustomEntries = merged.条目.filter((entry) => !entry.builtin);
  assert(migratedCustomEntries.length === legacyCustomEntries.length, 'legacy custom entry count changed during migration');

  for (const legacyEntry of legacyCustomEntries) {
    const migrated = migratedCustomEntries.find((entry) => entry.兼容ID?.includes(legacyEntry.id));
    assert(migrated, `legacy custom id was not retained as an alias: ${legacyEntry.id}`);
    assert(api.ZHIKU_CUSTOM_ID_PATTERN.test(migrated.id), `legacy custom entry did not receive a ZZ id: ${migrated.id}`);
    assert(migrated.资料所有者 === 'custom-user-data', 'legacy custom owner did not migrate');
    assert(migrated.资料版本 === api.ZHIKU_CUSTOM_SCHEMA_VERSION, 'legacy custom schema version did not migrate');
    assert(migrated.辅助字段版本 === 0, 'legacy auxiliary fields must remain explicitly unverified');
    assert(
      JSON.stringify(contentProjection(migrated)) === JSON.stringify(contentProjection(legacyEntry)),
      'legacy custom content changed during identity migration',
    );
  }

  const persisted = api.buildPersistedZhikuSystem(merged);
  assert(persisted.条目.length === migratedCustomEntries.length, 'slim persistence copied builtin entries or dropped custom entries');
  assert(persisted.条目.every((entry) => !entry.builtin && api.ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)), 'persisted zhiku must contain only migrated custom entries');
  assert(persisted.自制资料契约版本 === api.ZHIKU_CUSTOM_SCHEMA_VERSION, 'persisted custom contract version is missing');
  assert(Number.isInteger(persisted.自制资料下一个序号), 'persisted next custom sequence is missing');

  const finalHash = sha256(fs.readFileSync(savePath));
  assert(finalHash === originalHash, 'legacy save fixture was modified during read-only acceptance');

  console.log(JSON.stringify({
    fixtureHash: originalHash,
    legacyCustomEntries: legacyCustomEntries.length,
    migratedCustomEntries: migratedCustomEntries.length,
    bundledEntries: bundled.条目.length,
    persistedEntries: persisted.条目.length,
    nextCustomSequence: persisted.自制资料下一个序号,
  }));
  console.log('ZHIKU_STAGE2_LEGACY_SAVE_ACCEPTANCE_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
