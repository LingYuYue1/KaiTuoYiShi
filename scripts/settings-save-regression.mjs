import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const albumPanel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const independentTabs = [
  'MemorySystemSettings.tsx',
  'YitingSettingsTab.tsx',
  'NewsSystemSettingsTab.tsx',
  'PhoneSystemSettingsTab.tsx',
  'ZhikuSettingsTab.tsx',
  'StoryWeavingSettingsTab.tsx',
  'VariableUpdateSettings.tsx',
];

assert(settingsModal.includes('persistGameSettingsChange'), '设置弹窗必须统一持久化游戏设置变更。');
assert(settingsModal.includes("saveSetting('gameSettings', next)"), '设置弹窗变更游戏设置时必须立即写入 IndexedDB。');
for (const tab of [
  'MemorySystemSettingsTab',
  'YitingSettingsTab',
  'NewsSystemSettingsTab',
  'PhoneSystemSettingsTab',
  'ZhikuSettingsTab',
  'StoryWeavingSettingsTab',
]) {
  assert(apiSettings.includes(`<${tab}`), `设置弹窗必须渲染 ${tab}（位于 ApiSettings.tsx）。`);
  assert(apiSettings.includes('onChange={onGameSettingsChange}'), '独立接口设置页必须使用统一持久化 onChange（通过 onGameSettingsChange prop 传递）。');
}
assert(settingsModal.includes('onGameSettingsChange={persistGameSettingsChange}'), '变量更新和 API 配置批量修改必须使用统一持久化入口。');
assert(!settingsModal.includes('<ImageGenerationSettingsTab'), '文生图设置已迁移到相册，设置弹窗不应再渲染。');
assert(albumPanel.includes('<ImageGenerationSettingsTab'), '相册工作台必须渲染文生图设置。');
assert(albumPanel.includes('onChange={persistGameSettingsChange}'), '相册文生图设置必须使用即时持久化 onChange。');

for (const file of independentTabs) {
  const source = fs.readFileSync(`components/features/Settings/${file}`, 'utf8');
  assert(source.includes('handleSave'), `${file} 必须保留保存按钮处理函数。`);
  assert(source.includes("saveSetting('gameSettings'"), `${file} 的保存按钮必须写入 gameSettings。`);
  assert(source.includes('onClick={handleSave}'), `${file} 的保存按钮必须绑定 handleSave。`);
}

const imageSettings = fs.readFileSync('components/features/Settings/ImageGenerationSettingsTab.tsx', 'utf8');
assert(imageSettings.includes('handleSave'), 'ImageGenerationSettingsTab.tsx 必须保留保存按钮处理函数。');
assert(imageSettings.includes("saveSetting('gameSettings'"), 'ImageGenerationSettingsTab.tsx 的保存按钮必须写入 gameSettings。');
assert(imageSettings.includes('onClick={handleSave}'), 'ImageGenerationSettingsTab.tsx 的保存按钮必须绑定 handleSave。');

console.log('settings save regression ok');
