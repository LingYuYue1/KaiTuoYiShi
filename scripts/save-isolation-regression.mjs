import fs from 'node:fs';

const appSource = fs.readFileSync('App.tsx', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const zhikuPresetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const savePackageSource = fs.readFileSync('services/savePackage.ts', 'utf8');
const settingsSource = fs.readFileSync('models/settings.ts', 'utf8');
const rootCapabilitiesSource = fs.readFileSync('src/kernel/application/rootCapabilities.ts', 'utf8');
const portableSaveSource = fs.readFileSync('src/kernel/application/portableSave.ts', 'utf8');
const sendWorkflowSource = fs.readFileSync('src/kernel/workflows/sendWorkflow.ts', 'utf8');
const allSources = [
  appSource,
  useGameSource,
  sendWorkflowSource,
  fs.readFileSync('hooks/useGameState.ts', 'utf8'),
].join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!allSources.includes('phoneSystemState'), '手机运行时数据不得写入或读取全局 phoneSystemState，避免多存档聊天/通讯录互串。');
assert(!useGameSource.includes('mergePhoneSystems'), '读档不得把目标存档手机与外部手机状态合并。');

// Session-boundary 智库 hydration (Issue 3): load/new-game must re-merge bundled catalog, not raw shells.
assert(
  zhikuPresetSource.includes('export async function hydrateRuntimeZhiku') &&
    zhikuPresetSource.includes('mergeBundledZhikuSystem(bundled, savedOrCurrent') &&
    zhikuPresetSource.includes('mergeZhikuRuntimeUnlockOverrides') &&
    zhikuPresetSource.includes('current.条目.filter((entry) => !entry.builtin)'),
  'hydrateRuntimeZhiku must re-merge bundled catalog with save custom/unlock deltas.',
);
assert(
  rootCapabilitiesSource.includes('hydrateRuntimeZhiku(save.智库') &&
    useGameSource.includes('restoreIntoSession(id, APP_SESSION_ID)') &&
    useGameSource.includes('await hydrateRuntimeZhiku(current.智库') &&
    !rootCapabilitiesSource.includes('zhikuRuntime: save.智库!'),
  '读档/开局必须经 hydrateRuntimeZhiku，不得把存档壳条目原样写入 runtime。',
);
assert(
  portableSaveSource.includes('智库: buildPersistedZhikuSystem(story.content.zhikuRuntime)') &&
    zhikuPresetSource.includes('export function buildPersistedZhikuSystem'),
  '存档应持久化智库壳（自定义 + 解锁增量），读档时再 hydrate。',
);
assert(!useGameSource.includes('save.智库 ?? state.智库'), '读档不得用当前运行态智库兜底。');

// Phone / NPC / news / batches come only from the exact target save.
assert(rootCapabilitiesSource.includes('phone: save.手机!'), '读档手机状态必须只来自目标存档本身。');

// V3 authority-plane invariants (review round 2):
// 1. React subscribes to one kernel projection store; field-by-field projection
//    replay and story graph setters are unrepresentable.
const useGameStateSource = fs.readFileSync('hooks/useGameState.ts', 'utf8');
assert(!useGameSource.includes('applySessionView'), 'field-by-field applySessionView must be deleted.');
assert(useGameStateSource.includes('useSyncExternalStore') && useGameStateSource.includes('SessionProjectionStore'), 'React must subscribe to the single kernel projection store.');
for (const forbidden of ['set旅人', 'set世界', 'set记忆', 'set智库', 'set手机', 'setNPC', 'set相册', 'set剧情编织']) {
  assert(!useGameStateSource.includes(`${forbidden}: React.Dispatch`), `useGameState must not expose story setter ${forbidden}.`);
}
// 2. Autosave is owned by the save client and follows committed projections.
assert(
  rootCapabilitiesSource.includes('followAutosave(session)') &&
    rootCapabilitiesSource.includes('if (!policy.autosaveOnTurn) return;') &&
    !useGameSource.includes('saveCompletedTurnAutomatically'),
  '自动存档必须由 save client 订阅提交事件并读取 SavePolicy。',
);
// 3. Worldbook trigger history is story-owned: read from runtime, written via
//    the mutable command candidate, never through the disposable gameSettings overlay.
assert(
  sendWorkflowSource.includes('worldbookTriggerStates: state.worldbookTriggerStates') &&
    !sendWorkflowSource.includes('state.gameSettings!.worldbookTriggerStates'),
  '世界书触发状态只能读取剧情面字段，不得回退设备覆盖。',
);
assert(
  sendWorkflowSource.includes('state.worldbookTriggerStates = nextTriggerStates ?? {}') &&
    !sendWorkflowSource.includes('state.gameSettings.worldbookTriggerStates'),
  '世界书触发状态必须写入命令候选剧情面，不得写入 gameSettings。',
);
// 4. Reroll restores the story-plane pending trigger.
const findBaseSource = fs.readFileSync('src/kernel/domain/turn/findTurnBaseSnapshot.ts', 'utf8');
assert(
  findBaseSource.includes('pendingOpeningTrigger: preTurn.pendingOpeningTrigger'),
  'reroll 回滚必须恢复 pendingOpeningTrigger。',
);
// 5. Turn commits carry the story fields forward and write the journal live.
assert(!fs.existsSync('src/kernel/adapters/browser/BrowserTurnEngine.ts'), '旧 BrowserTurnEngine 必须删除。');
const executeTurnSource = fs.readFileSync('src/kernel/application/executeTurn.ts', 'utf8');
assert(executeTurnSource.includes('appendTurnJournalEntry(nextStory'), '正常回合必须写入 durable TurnJournal。');
assert(!sendWorkflowSource.includes('preTurnSnapshot,'), '聊天消息不得继续携带正式回滚快照。');
assert(!findBaseSource.includes('assistant.preTurnSnapshot'), 'reroll 只能读取 TurnJournal，不得回退聊天消息快照。');
// 6. React-to-kernel graph checkpoint is deleted, not repaired.
assert(!fs.existsSync('src/kernel/application/checkpointSession.ts'), 'session checkpoint application path must not exist.');
assert(!useGameSource.includes('session.checkpoint'), 'useGame must not upload a reconstructed runtime graph.');
// 7. The user-facing save pipeline carries the V3 story fields both ways.
for (const saved of ['turnJournal: story.conversation.turnJournal', 'worldbookTriggerStates: { ...story.content.worldbookTriggerStates }', 'pendingOpeningTrigger: story.turn.pendingOpeningTrigger']) {
  assert(portableSaveSource.includes(saved), `portable save 必须写出剧情面字段：${saved}`);
}
for (const restored of ['turnJournal: save.turnJournal', 'worldbookTriggerStates: save.worldbookTriggerStates', 'pendingOpeningTrigger: save.pendingOpeningTrigger']) {
  assert(rootCapabilitiesSource.includes(restored), `存档恢复用例必须恢复剧情面字段：${restored}`);
}
assert(rootCapabilitiesSource.includes('characters: { npcs: save.NPC! }'), '读档 NPC 必须来自目标存档。');
assert(rootCapabilitiesSource.includes('news: save.新闻!'), '读档新闻必须来自目标存档。');
assert(rootCapabilitiesSource.includes('systems: { variableBatches: save.variableBatches! }'), '读档变量批次必须来自目标存档。');
assert(rootCapabilitiesSource.includes('jobs: { records: save.jobs }'), '读档 durable jobs 必须来自目标存档。');
assert(rootCapabilitiesSource.includes('policy: save.policy'), '读档剧情策略必须来自目标存档。');

assert(!appSource.includes('state.set手机') && !appSource.includes('onPhoneChange='), '手机 UI 修改必须走 ISession.phone，不得接收 React 手机 setter。');

// Portable saves carry story state only; device fields are absent from the type itself.
const saveTypeSource = settingsSource.slice(
  settingsSource.indexOf('export interface 存档数据'),
  settingsSource.indexOf('\n}', settingsSource.indexOf('export interface 存档数据')),
);
for (const forbidden of ['apiSettings', 'gameSettings', 'theme']) {
  assert(!saveTypeSource.includes(forbidden), `存档类型不得声明设备字段：${forbidden}`);
}
assert(!savePackageSource.includes('stripDevicePreferencesFromSave'), '存档导出不应保留运行时清洗兼容层。');
assert(
  !savePackageSource.includes('apiSettings:') &&
    !savePackageSource.includes('gameSettings:') &&
    !savePackageSource.includes('theme:'),
  '存档包导出不得重新引入嵌入式设备偏好与 API 配置。',
);
assert(!savePackageSource.includes('function stripEmbeddedApiSettings'), '存档包不得维护设备偏好清洗逻辑。');

console.log('save isolation regression ok');
