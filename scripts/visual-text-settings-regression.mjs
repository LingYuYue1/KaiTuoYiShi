import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const settings = read('models/settings.ts');
const modal = read('components/features/Settings/SettingsModal.tsx');
const visualTab = read('components/features/Settings/VisualSettingsTab.tsx');
const app = read('App.tsx');
const chatList = read('components/features/Chat/ChatList.tsx');
const turnItem = read('components/features/Chat/TurnItem.tsx');
const renderer = read('components/features/Chat/MessageRenderers.tsx');
const useGameState = read('hooks/useGameState.ts');
const saveLoad = read('hooks/useGame/saveLoadWorkflow.ts');

assert(settings.includes('export interface VisualTextSettings'), 'settings model should define VisualTextSettings');
assert(settings.includes('visualTextSettings: 创建默认视觉文本设置()'), 'default game settings should include visualTextSettings');
assert(settings.includes('export function 归一化视觉文本设置'), 'settings model should expose visual text normalizer');
assert(settings.includes('Math.max(13, Math.min(30'), 'visual text normalizer should clamp font size to supported range');

assert(modal.includes("import { VisualSettingsTab } from './VisualSettingsTab'"), 'SettingsModal should import VisualSettingsTab');
assert(modal.includes("'visual'"), 'SettingsModal tab union should include visual');
assert(modal.includes("key: 'visual'"), 'SettingsModal should register visual tab');
assert(modal.includes('<VisualSettingsTab settings={gameSettings} onChange={persistGameSettingsChange} />'), 'SettingsModal should render VisualSettingsTab');

assert(visualTab.includes('旁白正文'), 'VisualSettingsTab should expose narration font control');
assert(visualTab.includes('角色台词'), 'VisualSettingsTab should expose dialogue font control');
assert(visualTab.includes('玩家发言'), 'VisualSettingsTab should expose player font control');
assert(visualTab.includes('恢复默认'), 'VisualSettingsTab should provide reset action');

assert(app.includes('visualTextSettings={state.gameSettings.visualTextSettings}'), 'App should pass visualTextSettings to ChatList');
assert(chatList.includes('visualTextSettings?: VisualTextSettings'), 'ChatList should accept visualTextSettings');
assert(chatList.includes('visualTextSettings={visualTextSettings}'), 'ChatList should pass visualTextSettings to turns');
assert(turnItem.includes('visualTextSettings?: VisualTextSettings'), 'TurnItem should accept visualTextSettings');
assert(turnItem.includes('fontSize={visualTextSettings?.playerFontSize ?? 14}'), 'UserTurnBubble should use player font setting');
assert(renderer.includes('fontSettings.narrationFontSize'), 'BodyBlock should use narration font setting');
assert(renderer.includes('fontSettings.dialogueFontSize'), 'BodyBlock should use dialogue font setting');
assert(renderer.includes('fontSettings.playerFontSize'), 'BodyBlock should use player font setting');

assert(useGameState.includes('归一化视觉文本设置(savedGame.visualTextSettings)'), 'startup settings load should normalize visualTextSettings');
assert(useGameState.includes('归一化视觉文本设置(prev.visualTextSettings)'), 'state migration effect should normalize visualTextSettings');
// 全项目修复：buildSavePayload 支持 gameSettings 覆盖值（gameSettingsForSave），
// 正常路径与 state.gameSettings 等价；归一化行为要求不变。
assert(saveLoad.includes('归一化视觉文本设置(state.gameSettings.visualTextSettings)') || saveLoad.includes('归一化视觉文本设置(gameSettingsForSave.visualTextSettings)'), 'save payload should normalize visualTextSettings');
assert(
  saveLoad.includes('归一化视觉文本设置(safeGameSettings.visualTextSettings)') ||
    saveLoad.includes('归一化视觉文本设置(save.gameSettings.visualTextSettings)'),
  'save load should normalize visualTextSettings from save',
);

console.log('PASS visual text settings regression');
