import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const useGameStateSource = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');

const removedChapterFiles = [
  'herta-station-chapters.json',
  'jarilo-vi-chapters.json',
  'jarilo-vi-sunrise-chapters.json',
  'xianzhou-luofu-travel-chapters.json',
  'xianzhou-luofu-cloud-tree-chapters.json',
  'xianzhou-luofu-aftermath-chapters.json',
];

for (const file of removedChapterFiles) {
  assert(!fs.existsSync(path.join('public/zhiku-presets', file)), `主线剧情智库文件仍存在：${file}`);
  assert(!presetSource.includes(file), `内置智库注册表仍引用主线剧情文件：${file}`);
}

const presetDir = 'public/zhiku-presets';
for (const file of fs.readdirSync(presetDir).filter((item) => item.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(presetDir, file), 'utf8'));
  for (const entry of data.entries ?? []) {
    assert(entry['分类'] !== 'story', `智库预设不应再包含主线剧情 story 条目：${file} :: ${entry['标题']}`);
    assert(
      !(typeof entry['来源'] === 'string' && entry['来源'].includes('开拓轶事·项目内置剧情')),
      `智库预设不应再包含项目内置剧情来源：${file} :: ${entry['标题']}`,
    );
  }
}

assert(
  presetSource.includes("source.includes('开拓轶事·项目内置剧情')") &&
    presetSource.includes('BUNDLED_MAIN_STORY_TITLES'),
  '旧存档内置主线剧情过滤规则缺失',
);

assert(
  presetSource.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)') &&
    presetSource.includes('mergeBundledZhikuSystem') &&
    presetSource.includes('hydrateRuntimeZhiku') &&
    useGameStateSource.includes('hydrateRuntimeZhiku(savedZhiku, { migrationAt })'),
  '启动加载时必须经 hydrateRuntimeZhiku 过滤旧存档残留的主线剧情智库条目',
);

assert(
  presetSource.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)') &&
    useGameSource.includes('hydrateRuntimeZhiku(save.智库') &&
    useGameSource.includes('await saveToRuntime(save'),
  '导入存档时必须经 hydrateRuntimeZhiku 过滤旧存档残留的主线剧情智库条目',
);

console.log('zhiku main story removal regression passed');
