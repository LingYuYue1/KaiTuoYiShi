import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countOccurrences(source, token) {
  return source.split(token).length - 1;
}

const systemDrawer = fs.readFileSync('components/layout/SystemDrawer.tsx', 'utf8');
const newGameWizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const skillPanel = fs.readFileSync('components/features/GameSystems/SkillPanel.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert(
  systemDrawer.includes('aria-hidden={!open}') && systemDrawer.includes('inert={!open}'),
  '关闭的系统抽屉必须同时退出辅助语义和键盘交互。',
);
assert(
  !systemDrawer.includes('preventDefault()') && !systemDrawer.includes("addEventListener('keydown'"),
  '系统抽屉不应通过全局键盘拦截修补焦点顺序。',
);

const persistenceStart = newGameWizard.indexOf('const persistOpeningPresets');
const persistenceEnd = newGameWizard.indexOf('const applyOpeningPreset', persistenceStart);
const persistenceBlock = newGameWizard.slice(persistenceStart, persistenceEnd);
assert(persistenceStart >= 0 && persistenceEnd > persistenceStart, '必须保留开局预设持久化边界。');
const preferenceWriteIndex = persistenceBlock.indexOf('await setPreference(');
const statePublishIndex = persistenceBlock.indexOf('setOpeningPresets(normalized)');
assert(preferenceWriteIndex >= 0 && statePublishIndex >= 0, '开局预设持久化边界必须包含落盘和界面发布。');
assert(
  preferenceWriteIndex < statePublishIndex,
  '开局预设必须先持久化成功，再发布新的界面列表。',
);
assert(
  newGameWizard.includes("useState<'save' | 'delete' | null>(null)") &&
    newGameWizard.includes('if (presetMutation) return;') &&
    newGameWizard.includes('if (!selectedPresetId || presetMutation) return;'),
  '开局预设保存和删除必须共享同一个进行中操作锁。',
);
assert(
  newGameWizard.includes("pendingMutation === 'save' ? '保存中…' : '保存'") &&
    newGameWizard.includes("pendingMutation === 'delete' ? '删除中…' : '删除'"),
  '开局预设操作必须显示明确的进行中状态。',
);

assert(
  skillPanel.includes('panel-btn strong hidden md:inline-flex'),
  '战技面板的顶部保存动作必须仅在桌面端显示。',
);
assert(
  skillPanel.includes('className="mt-4 md:hidden"') &&
    countOccurrences(skillPanel, 'onClick={saveSkill}') === 2,
  '移动端必须在表单末尾提供复用 saveSkill 的唯一可见保存动作。',
);

assert(
  pkg.scripts?.['test:ui-interaction-boundaries'] === 'node scripts/ui-interaction-boundaries-regression.mjs',
  'package.json 必须暴露 UI 交互边界回归脚本。',
);

console.log('ui interaction boundaries regression ok');
