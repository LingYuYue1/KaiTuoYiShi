import fs from 'node:fs';

const appSource = fs.readFileSync('App.tsx', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const zhikuPresetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const savePackageSource = fs.readFileSync('services/savePackage.ts', 'utf8');
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
    zhikuPresetSource.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)'),
  'hydrateRuntimeZhiku must re-merge bundled catalog with save custom/unlock deltas.',
);
assert(
  useGameSource.includes('hydrateRuntimeZhiku(save.智库') &&
    useGameSource.includes('await saveToRuntime(save') &&
    useGameSource.includes('await hydrateRuntimeZhiku(current.智库') &&
    !useGameSource.includes('智库: save.智库!'),
  '读档/开局必须经 hydrateRuntimeZhiku，不得把存档壳条目原样写入 runtime。',
);
assert(
  useGameSource.includes('智库: buildPersistedZhikuSystem(runtime.智库)') &&
    zhikuPresetSource.includes('export function buildPersistedZhikuSystem'),
  '存档应持久化智库壳（自定义 + 解锁增量），读档时再 hydrate。',
);
assert(!useGameSource.includes('save.智库 ?? state.智库'), '读档不得用当前运行态智库兜底。');

// Phone / NPC / news / batches come only from the target save via saveToRuntime.
assert(useGameSource.includes('手机: save.手机!'), '读档手机状态必须只来自目标存档本身。');
assert(useGameSource.includes('NPC: save.NPC!'), '读档 NPC 必须来自目标存档。');
assert(useGameSource.includes('新闻: save.新闻!'), '读档新闻必须来自目标存档。');
assert(useGameSource.includes('variableBatches: save.variableBatches!'), '读档变量批次必须来自目标存档。');
assert(useGameSource.includes('queueTasks: save.queueTasks!'), '读档后台队列必须来自目标存档。');

assert(appSource.includes('onPhoneChange={state.set手机}'), '手机 UI 修改只能进入当前运行态，不能写全局手机备份。');

// Portable saves carry story state only; legacy device preferences are removed wholesale.
assert(savePackageSource.includes('stripDevicePreferencesFromSave'), '存档包导出必须经唯一的设备偏好清洗边界。');
assert(
  !savePackageSource.includes('apiSettings:') &&
    !savePackageSource.includes('gameSettings:') &&
    !savePackageSource.includes('theme:'),
  '存档包导出不得重新引入嵌入式设备偏好与 API 配置。',
);
assert(!savePackageSource.includes('function stripEmbeddedApiSettings'), '存档包不得重复维护第二套设备偏好清洗逻辑。');

console.log('save isolation regression ok');
