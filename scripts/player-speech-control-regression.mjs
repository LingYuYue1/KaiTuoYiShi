import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const promptIds = read('models/prompts.ts');
const builtinModules = read('data/builtinPromptModules.ts');
const settings = read('models/settings.ts');
const gameSettingsUi = read('components/features/Settings/GameSettings.tsx');
const tavernBuilder = read('hooks/useGame/tavernMessageChainBuilder.ts');
const stateLoader = read('hooks/useGameState.ts');

assert(promptIds.includes("'builtin_no_control'"), 'builtin no-control module id must remain registered.');
assert(promptIds.includes("'builtin_player_speech_expansion'"), 'player speech expansion module id must be registered.');

assert(builtinModules.includes('const NO_CONTROL_CONTENT'), 'no-control prompt content must remain defined.');
assert(builtinModules.includes('const PLAYER_SPEECH_EXPANSION_CONTENT'), 'player speech expansion prompt content must be defined.');
assert(builtinModules.includes("id: 'builtin_player_speech_expansion'"), 'player speech expansion builtin module must be created.');
assert(builtinModules.includes("enabled: false") && builtinModules.includes('抢话模式（适度代写玩家对白）'), 'player speech expansion must default off and describe restrained speech writing.');

assert(settings.includes('enableNoControl: boolean'), 'settings must keep enableNoControl for compatibility.');
assert(settings.includes('enablePlayerSpeechExpansion: boolean'), 'settings must expose player speech expansion mode.');
assert(settings.includes('enableNoControl: true'), 'default settings must keep no-control enabled.');
assert(settings.includes('enablePlayerSpeechExpansion: false'), 'default settings must keep speech expansion disabled.');
assert(stateLoader.includes('enablePlayerSpeechExpansion: savedGame.enableNoControl === true ? false'), 'old saves must not enable speech expansion while no-control is enabled.');

assert(gameSettingsUi.includes('label="防止抢话 / 角色边界"'), 'settings UI must expose no-control switch.');
assert(gameSettingsUi.includes('label="抢话 / 适度代写玩家对白"'), 'settings UI must expose speech expansion switch.');
assert(gameSettingsUi.includes("'builtin_player_speech_expansion',\n              v"), 'speech expansion switch must toggle its module.');
assert(gameSettingsUi.includes('enableNoControl: v ? false : settings.enableNoControl'), 'speech expansion switch must disable no-control when enabled.');
assert(gameSettingsUi.includes('enablePlayerSpeechExpansion: v ? false : settings.enablePlayerSpeechExpansion'), 'no-control switch must disable speech expansion when enabled.');

assert(tavernBuilder.includes('playerSpeechExpansionPrompt'), 'Tavern builder must carry speech expansion prompt.');
assert(tavernBuilder.includes('settings?.enableNoControl === false ?'), 'Tavern builder must respect disabled no-control setting.');
assert(tavernBuilder.includes('settings?.enablePlayerSpeechExpansion === true'), 'Tavern builder must only inject speech expansion when enabled.');
assert(tavernBuilder.includes('presetContainsPlayerSpeechExpansion'), 'Tavern builder must detect preset-provided speech expansion.');
assert(tavernBuilder.includes('presetHasPlayerSpeechExpansion ?'), 'Tavern worldbook merge must avoid duplicate speech expansion.');

console.log('player speech control regression passed');
