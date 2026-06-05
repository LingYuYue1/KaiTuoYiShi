import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const wizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert(
  wizard.includes("OPENING_PLAYER_PRESETS_KEY = 'openingPlayerPresets'") &&
    wizard.includes('loadSetting<OpeningPlayerPreset[]>') &&
    wizard.includes('saveSetting(OPENING_PLAYER_PRESETS_KEY'),
  '开局预设必须保存到 settings，而不是游戏存档。',
);

assert(
  wizard.includes('interface OpeningPresetDraft') &&
    wizard.includes('storyMode: 剧情模式') &&
    wizard.includes('customStartPrompt: string') &&
    wizard.includes('canonicalTrailblazer: CanonicalTrailblazer') &&
    wizard.includes('selectedAbilityIds: string[]'),
  '开局预设必须覆盖世界模式、角色、命途能力、原著主角和切入说明。',
);

assert(
  wizard.includes('function OpeningPresetControls') &&
    wizard.includes('我的开局预设') &&
    wizard.includes('保存') &&
    wizard.includes('套用') &&
    wizard.includes('删除'),
  '开局向导必须提供保存、套用、删除玩家预设的 UI。',
);

assert(
  wizard.includes('applyOpeningPreset') &&
    wizard.includes('setStoryMode(draft.storyMode)') &&
    wizard.includes('setCustomStartPrompt(draft.customStartPrompt)') &&
    wizard.includes('setCanonicalTrailblazer(draft.canonicalTrailblazer)'),
  '套用开局预设必须恢复核心开局字段。',
);

assert(
  wizard.includes('只保存开局表单，不保存 API key 或存档进度。'),
  '预设 UI 必须说明不会保存 API key 或存档进度。',
);

assert(
  pkg.scripts?.['test:opening-preset'] === 'node scripts/opening-preset-regression.mjs',
  'package.json 必须提供 test:opening-preset 回归脚本。',
);

console.log('opening preset regression passed');
