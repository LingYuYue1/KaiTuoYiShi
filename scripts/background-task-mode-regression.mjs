import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[background-task-mode] ${message}`);
    process.exit(1);
  }
}

const settings = read('models/settings.ts');
const gameSettings = read('components/features/Settings/GameSettings.tsx');
const sendWorkflow = read('hooks/useGame/sendWorkflow.ts');
const gameState = read('hooks/useGameState.ts');
const saveLoad = read('hooks/useGame/saveLoadWorkflow.ts');

assert(settings.includes("export type 后台任务模式 = 'sequential' | 'parallel'"), 'settings must define sequential/parallel background task mode.');
assert(settings.includes('backgroundTaskMode: 后台任务模式'), 'game settings must persist backgroundTaskMode.');
assert(settings.includes("backgroundTaskMode: 'sequential'"), 'background task mode must default to sequential.');

assert(gameSettings.includes('后台任务模式'), 'game settings UI must expose background task mode.');
assert(gameSettings.includes('稳序') && gameSettings.includes('并行'), 'background task mode UI must show sequential and parallel labels.');
assert(gameSettings.includes('主剧情前的忆庭召回与智库召回始终会先完成'), 'UI must explain pre-main recalls still finish before main story.');

assert(gameState.includes('backgroundTaskMode: savedGame.backgroundTaskMode ?? defaults.backgroundTaskMode'), 'old local settings must normalize missing backgroundTaskMode.');
assert(saveLoad.includes('backgroundTaskMode: localSettings.backgroundTaskMode ?? 创建默认游戏设置().backgroundTaskMode'), 'loaded saves must preserve local backgroundTaskMode preference.');
assert(saveLoad.includes('state.setGameSettings(preserveLocalApiGameSettings(nextGameSettingsFromSave, state.gameSettings))'), 'save load must apply local-preference preservation when importing save settings.');

const recallStart = sendWorkflow.indexOf('const [yitingPreview, zhikuPreview] = await Promise.all([');
assert(recallStart >= 0, 'pre-main yiting/zhiku recall must remain parallel with Promise.all.');
const recallBlock = sendWorkflow.slice(recallStart, recallStart + 2600);
assert(recallBlock.includes('retrieveYitingContextWithModel') && recallBlock.includes('compileZhikuTurnWithModel'), 'pre-main Promise.all must include both yiting and zhiku recall.');

assert(sendWorkflow.includes("state.gameSettings.backgroundTaskMode ?? 'sequential'"), 'send workflow must read backgroundTaskMode with sequential fallback.');
assert(sendWorkflow.includes('runNewsBackgroundJob()'), 'send workflow must isolate news background job.');
assert(sendWorkflow.includes('runYitingArchiveJob()'), 'send workflow must isolate yiting archive job.');
assert(sendWorkflow.includes('runPhoneFallbackJob()'), 'send workflow must isolate phone fallback job.');
assert(sendWorkflow.includes('runNarrativeImageJob()'), 'send workflow must isolate narrative image job.');
assert(sendWorkflow.includes('await Promise.all([') && sendWorkflow.includes('runNarrativeImageJob(),'), 'parallel mode must launch independent background jobs together.');
assert(sendWorkflow.includes('chatHistory: finalHistoryForSave'), 'auto-save must use the final chat history after narrative images finish.');

console.log('[background-task-mode] ok');
