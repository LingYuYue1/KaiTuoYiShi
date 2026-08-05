import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const presetRoot = path.join(root, 'public', 'zhiku-presets');
const bundlePath = path.join(os.tmpdir(), `zhiku-character-rebuild-${process.pid}-${Date.now()}.mjs`);
const characterFields = [
  '核心身份与阵营',
  '独立人格与行为',
  '说话方式',
  '台词语料',
  '外貌锚点',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
];
const retiredCharacterPresetFiles = [
  'express-characters.json',
  'express-support-characters.json',
  'herta-station-characters.json',
  'xianzhou-luofu-characters.json',
  'xianzhou-alliance-characters.json',
  'jarilo-vi-characters.json',
  'penacony-characters.json',
  'amphoreus-characters.json',
  'faction-characters.json',
  'genius-society-characters.json',
];

try {
  const presetSource = fs.readFileSync(path.join(root, 'data', 'zhikuPreset.ts'), 'utf8');
  const presetFiles = fs.readdirSync(presetRoot).filter((name) => name.endsWith('.json')).sort();
  const rawCharacters = [];
  const characterPresetFiles = new Set();

  for (const fileName of presetFiles) {
    const payload = JSON.parse(fs.readFileSync(path.join(presetRoot, fileName), 'utf8'));
    for (const entry of payload.entries ?? []) {
      if (entry.分类 !== 'character') continue;
      rawCharacters.push({ ...entry, __fileName: fileName });
      characterPresetFiles.add(fileName);
    }
  }

  assert(presetFiles.length === 23, `expected 23 bundled preset files, got ${presetFiles.length}`);
  assert(rawCharacters.length === 99, `expected 99 active character entries after Zandar removal, got ${rawCharacters.length}`);
  assert(!rawCharacters.some((entry) => entry.标题 === '赞达尔'), 'intentionally removed Zandar profile must not return');
  assert(
    !rawCharacters.some((entry) => entry.id === 'JS-018'),
    'intentionally removed Zandar machine id must not return',
  );

  const rawIds = new Set();
  for (const entry of rawCharacters) {
    assert(/^[A-Z]{2}-\d{3}$/u.test(entry.id), `${entry.__fileName}/${entry.标题} is missing its formal machine id`);
    assert(!rawIds.has(entry.id), `duplicate character source id: ${entry.id}`);
    rawIds.add(entry.id);
    assert(typeof entry.标题 === 'string' && entry.标题.trim(), `${entry.__fileName} contains an untitled character entry`);
    assert(typeof entry.原文 === 'string' && entry.原文.trim(), `${entry.__fileName}/${entry.标题} is missing archive preview content`);
    assert(entry.注入内容?.类型 === 'character', `${entry.__fileName}/${entry.标题} must use character injection content`);
    for (const field of characterFields) {
      assert(
        typeof entry.注入内容[field] === 'string' && entry.注入内容[field].trim(),
        `${entry.__fileName}/${entry.标题} is missing injection field ${field}`,
      );
    }
  }

  for (const fileName of characterPresetFiles) {
    assert(
      presetSource.includes(`/zhiku-presets/${fileName}`),
      `active character preset is not bundled: ${fileName}`,
    );
  }
  for (const fileName of retiredCharacterPresetFiles) {
    assert(!presetSource.includes(fileName), `retired V1 character preset must not be bundled: ${fileName}`);
    assert(!fs.existsSync(path.join(presetRoot, fileName)), `retired V1 character source must stay deleted: ${fileName}`);
  }

  assert(
    presetSource.includes('2026-07-30-arlan-injection-natural-profile-1'),
    'Herta Station cache version must keep the accepted Arlan profile refresh',
  );
  assert(
    presetSource.includes('ZHIKU_V3_DATA_VERSION') &&
      presetSource.includes('encodeURIComponent(version)') &&
      presetSource.includes('cacheBust') &&
      presetSource.includes('&r='),
    'bundled preset loading must retain versioned cache busting',
  );
  assert(
    !fs.existsSync(path.join(root, 'data', 'zhikuIdentityRegistry.ts')) &&
      !presetSource.includes('shouldRemoveLegacyZhikuCharacterEntry'),
    'retired identity registry and legacy character filters must stay removed',
  );

  await build({
    stdin: {
      contents: [
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-character-rebuild-regression-entry.ts',
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
  const system = await api.loadAllBundledZhikuPresets({ cacheBust: 'character-rebuild-regression' });
  const loadedCharacters = system.条目.filter((entry) => entry.分类 === 'character');

  assert(
    loadedCharacters.length === rawCharacters.length,
    `loader filtered an active rebuilt character: expected ${rawCharacters.length}, got ${loadedCharacters.length}`,
  );
  assert(loadedCharacters.every((entry) => /^[A-Z]{2}-\d{3}$/u.test(entry.id)), 'all active characters must load their source-owned machine IDs');
  assert(
    new Set(loadedCharacters.map((entry) => entry.id)).size === loadedCharacters.length,
    'loaded character machine ids must stay unique',
  );
  assert(!loadedCharacters.some((entry) => entry.标题 === '赞达尔'), 'Zandar must stay absent after production loading');

  console.log(
    `ZHIKU_CHARACTER_REBUILD_REGRESSION_OK sources=${rawCharacters.length} presets=${characterPresetFiles.size}`,
  );
} finally {
  fs.rmSync(bundlePath, { force: true });
}
