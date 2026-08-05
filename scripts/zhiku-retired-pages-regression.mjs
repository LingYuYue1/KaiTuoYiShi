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
const zhikuPanel = fs.readFileSync('components/features/ZhikuV3/ZhikuMaintenancePanel.tsx', 'utf8');
const useGameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');

for (const file of retiredPresetFiles) {
  assert(!fs.existsSync(path.join(presetDir, file)), `退役智库预设文件不应存在：${file}`);
  assert(!presetSource.includes(file), `内置智库注册表不应再引用退役预设文件：${file}`);
}

for (const id of retiredPresetIds) {
  assert(!presetSource.includes(id), `内置智库注册表不应再引用退役预设 id：${id}`);
}

assert(
  zhikuModel.includes("RETIRED_ZHIKU_CATEGORIES = ['npc', 'item', 'system']") &&
    zhikuModel.includes('isRetiredZhikuCategory'),
  '智库模型必须声明 NPC / 道具 / 系统 为退役分类，供旧存档过滤与 UI 隐藏。',
);

assert(
  presetSource.includes('shouldRemoveRetiredZhikuEntry') &&
    presetSource.includes('removeRetiredZhikuEntries') &&
    presetSource.includes('.filter((entry) => !shouldRemoveRetiredZhikuEntry(entry))'),
  '智库预设加载与持久化必须过滤退役分类。',
);

assert(
  presetSource.includes('mergeBundledZhikuSystem') &&
    presetSource.includes('removeRetiredZhikuEntries(') &&
    useGameState.includes('mergeBundledZhikuSystem') &&
    saveLoad.includes('mergeBundledZhikuSystem'),
  '启动加载与读档流程必须通过统一合并入口清理旧存档残留的退役智库页条目。',
);

assert(
  zhikuPanel.includes("const categories: 智库分类[] = ['character', 'location', 'faction', 'term', 'event', 'enemy']") &&
    zhikuPanel.includes('!isRetiredZhikuCategory(entry.分类)'),
  '智库面板不应再显示 NPC / 道具 / 系统 三个分类页。',
);

for (const file of fs.readdirSync(presetDir).filter((item) => item.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(presetDir, file), 'utf8'));
  for (const entry of data.entries ?? []) {
    assert(!['npc', 'item', 'system'].includes(entry['分类']), `智库预设不应再包含退役分类条目：${file} :: ${entry['标题']}`);
  }
}

console.log('zhiku retired pages regression passed');
