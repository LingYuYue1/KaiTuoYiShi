import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const useGameStateSource = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const rootCapabilitiesSource = fs.readFileSync('src/kernel/application/rootCapabilities.ts', 'utf8');

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
  !presetSource.includes('BUNDLED_MAIN_STORY_TITLES') &&
    !presetSource.includes("source.includes('开拓轶事·项目内置剧情')") &&
    !useGameStateSource.includes('migrationAt'),
  '当前精确智库目录不得保留旧主线过滤器或迁移参数',
);

assert(
  presetSource.includes('current.条目.filter((entry) => !entry.builtin)') &&
    rootCapabilitiesSource.includes('hydrateRuntimeZhiku(save.智库)'),
  '加载当前存档时必须合并当前内置目录，并保留非重复自制条目',
);

console.log('zhiku main story removal regression passed');
