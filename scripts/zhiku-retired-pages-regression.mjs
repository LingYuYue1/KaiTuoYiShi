import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const retiredPresetFiles = [
  'npc-core.json',
  'npc-expanded.json',
  'item-core.json',
  'item-expanded.json',
  'battle-expanded.json',
];

const retiredPresetIds = [
  'zhiku_npc_core',
  'zhiku_npc_expanded',
  'zhiku_item_core',
  'zhiku_item_expanded',
  'zhiku_battle_expanded',
];

const presetDir = 'public/zhiku-presets';
const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const zhikuModel = fs.readFileSync('models/zhiku.ts', 'utf8');
const useGameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');

assert(
  !fs.existsSync('components/features/ZhikuV3/ZhikuMaintenancePanel.tsx'),
  '旧智库维护面板不应继续存在。',
);

for (const file of retiredPresetFiles) {
  assert(!fs.existsSync(path.join(presetDir, file)), `退役智库预设文件不应存在：${file}`);
  assert(!presetSource.includes(file), `内置智库注册表不应再引用退役预设文件：${file}`);
}

for (const id of retiredPresetIds) {
  assert(!presetSource.includes(id), `内置智库注册表不应再引用退役预设 id：${id}`);
}

assert(
  zhikuModel.includes("export type 智库分类 = 'story' | 'character' | 'location' | 'faction' | 'term' | 'event' | 'enemy'") &&
    !zhikuModel.includes('RETIRED_ZHIKU_CATEGORIES') &&
    !zhikuModel.includes('isRetiredZhikuCategory'),
  'V3 模型不应继续声明 NPC / 道具 / 系统 旧分类。',
);

assert(
  !presetSource.includes('shouldRemoveRetiredZhikuEntry') &&
    !presetSource.includes('removeRetiredZhikuEntries'),
  'V3 不应保留退役分类迁移函数。',
);

assert(
  presetSource.includes('composeZhikuSystem') &&
    useGameState.includes('composeZhikuSystem') &&
    saveLoad.includes('composeZhikuSystem') &&
    !useGameState.includes('mergeBundledZhikuSystem') &&
    !saveLoad.includes('mergeBundledZhikuSystem'),
  '启动加载与读档流程必须只使用 V3 组合入口。',
);

for (const file of fs.readdirSync(presetDir).filter((item) => item.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(presetDir, file), 'utf8'));
  for (const entry of data.entries ?? []) {
    assert(!['npc', 'item', 'system'].includes(entry['分类']), `智库预设不应再包含退役分类条目：${file} :: ${entry['标题']}`);
  }
}

console.log('zhiku retired pages regression passed');
