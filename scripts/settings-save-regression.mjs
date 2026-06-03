import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const independentTabs = [
  'MemorySystemSettings.tsx',
  'YitingSettingsTab.tsx',
  'NewsSystemSettingsTab.tsx',
  'PhoneSystemSettingsTab.tsx',
  'ZhikuSettingsTab.tsx',
  'StoryWeavingSettingsTab.tsx',
  'VariableUpdateSettings.tsx',
  'ImageGenerationSettingsTab.tsx',
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
  'ImageGenerationSettingsTab',
]) {
  assert(settingsModal.includes(`<${tab}`), `设置弹窗必须渲染 ${tab}。`);
  assert(settingsModal.includes('onChange={persistGameSettingsChange}'), '独立接口设置页必须使用统一持久化 onChange。');
}
assert(settingsModal.includes('onGameSettingsChange={persistGameSettingsChange}'), '变量更新和 API 配置批量修改必须使用统一持久化入口。');

for (const file of independentTabs) {
  const source = fs.readFileSync(`components/features/Settings/${file}`, 'utf8');
  assert(source.includes('handleSave'), `${file} 必须保留保存按钮处理函数。`);
  assert(source.includes("saveSetting('gameSettings'"), `${file} 的保存按钮必须写入 gameSettings。`);
  assert(source.includes('onClick={handleSave}'), `${file} 的保存按钮必须绑定 handleSave。`);
}

console.log('settings save regression ok');
