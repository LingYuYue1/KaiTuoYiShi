import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const wizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const journeyPresets = fs.readFileSync('data/journeyPresets.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const openingCot = fs.readFileSync('prompts/cot/openingCot.ts', 'utf8');
const builtinWorldbook = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const openingCoreLore = fs.readFileSync('data/lore/openingCoreLore.json', 'utf8');
const openingCorePreset = fs.readFileSync('public/worldbook-presets/opening-core.json', 'utf8');
const worldbookUtil = fs.readFileSync('utils/worldbook.ts', 'utf8');
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
  !journeyPresets.includes('星之苏醒') &&
    !wizard.includes('星之苏醒') &&
    !openingCoreLore.includes('星之苏醒') &&
    !openingCorePreset.includes('星之苏醒'),
  '开局锚点、UI fallback 和开局核心资料不得硬编码“星之苏醒”，避免选择穹时被默认星偏置覆盖。',
);

const openingBiasTargets = [wizard, journeyPresets, builtinWorldbook, openingCoreLore, openingCorePreset, openingCot, sendWorkflow];
const forbiddenOpeningBiasTerms = [
  '原作的两位主角',
  '原作主角(星 / 穹)',
  '原作主角（星 / 穹）',
  '原作主角星 / 穹',
  '星 / 穹尚未以',
  '星/穹苏醒前夕',
  '故事固定从星/穹',
];
assert(
  forbiddenOpeningBiasTerms.every((term) => openingBiasTargets.every((source) => !source.includes(term))),
  '开局相关资料、UI 与新闻预处理不得继续静态写死星/穹或两位主角。',
);

assert(
  journeyPresets.includes('黑塔空间站 · 主线苏醒前夕') &&
    journeyPresets.includes('所选原著主角仍沉睡在封存舱中') &&
    journeyPresets.includes('所选原著主角尚未正式苏醒') &&
    wizard.includes("selectedScenario?.name ?? '黑塔空间站 · 主线苏醒前夕'"),
  '默认黑塔空间站开局必须使用中性的原著主角苏醒锚点。',
);

assert(
  systemPromptBuilder.includes('星不是本周目默认原著主角') &&
    systemPromptBuilder.includes('涉及封存舱、星核载体或原著主角线索时优先写穹') &&
    systemPromptBuilder.includes('不得默认只选星'),
  'system prompt 必须强化单穹与双主角门禁，防止模型回落到默认星。',
);

assert(
  worldbookUtil.includes('function formatOriginalProtagonistSubject') &&
    worldbookUtil.includes("if (originalProtagonist === '星') return '原作主角星';") &&
    worldbookUtil.includes("if (originalProtagonist === '穹') return '原作主角穹';") &&
    worldbookUtil.includes("if (originalProtagonist === '星穹双主角') return '原作主角星与穹';"),
  '世界书占位符必须能按星、穹、双主角动态渲染原著主角。',
);

assert(
  builtinWorldbook.includes('{originalProtagonistSubject}此刻仍处于站内深层封存状态') &&
    openingCoreLore.includes('{originalProtagonistSubject}此刻仍处于站内深层封存状态') &&
    openingCorePreset.includes('{originalProtagonistSubject}此刻仍处于站内深层封存状态') &&
    sendWorkflow.includes('formatOriginalProtagonistForOpening(effectiveWorld.原著主角)'),
  '开局资料与新闻预处理必须读取动态原著主角，而不是静态星/穹。',
);

assert(
  openingCot.includes('若原著主角选择为「穹」') &&
    openingCot.includes('不得因为默认记忆把场景写成星') &&
    openingCot.includes('不得默认只剩星') &&
    builtinWorldbook.includes('涉及封存舱、星核载体或原著主角线索时优先写穹'),
  '开局 COT 与内置世界书必须同步约束穹/双主角，不只依赖 UI 状态。',
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
