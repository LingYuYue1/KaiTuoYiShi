import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const useGameStateSource = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const saveLoadSource = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');

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
  presetSource.includes(".filter((entry) => entry.分类 !== 'story')") &&
    presetSource.includes('composeZhikuSystem') &&
    useGameStateSource.includes('composeZhikuSystem(preset, savedZhiku)') &&
    useGameStateSource.includes('buildZhikuCustomSystem(savedZhiku)') &&
    presetSource.includes("!entry.builtin && ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)"),
  'V3 启动加载必须只接纳当前目录和正式 ZZ 自制资料',
);

assert(
  !presetSource.includes('BUNDLED_MAIN_STORY_TITLES') &&
    !presetSource.includes('isBundledZhikuDuplicate') &&
    saveLoadSource.includes('loadBundledZhikuCatalogWithFallback()') &&
    saveLoadSource.includes('composeZhikuSystem(catalogResult.system, save.智库)'),
  'V3 读档不得恢复旧剧情智库迁移分支',
);

console.log('zhiku main story removal regression passed');
