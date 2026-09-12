import fs from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
async function readSource(relativePath) {
  return (await fs.readFile(path.join(root, relativePath), 'utf8')).replace(/\r\n?/g, '\n');
}

const app = await readSource('App.tsx');
const settings = await readSource('components/features/Settings/SettingsModal.tsx');
const manager = await readSource('components/features/Settings/VariableManager.tsx');

assert(
  (app.match(/variableEditingLocked=\{state\.loading \|\| state\.pendingVariable\}/g) ?? []).length === 2,
  'home and game settings surfaces must both lock variable editing during workflows',
);
assert(settings.includes('editingLocked={variableEditingLocked}'), 'settings must pass the workflow lock to variable manager');
assert(manager.includes('const [jsonDraft, setJsonDraft] = useState<string | null>(null);'), 'JSON draft must be lazy');
assert(manager.includes('canonicalizeJsonValue'), '变量编辑器必须复用共享 JSON 边界工具');
assert(!manager.includes('JSON.parse(JSON.stringify(value))'), '变量编辑器不得用 JSON 往返 clone 掩盖 undefined 边界问题');
assert(manager.includes('canonicalizeEditorValue'), '保存 JSON 前必须执行可读的 JSON 边界校验');
assert(!manager.includes('setJsonDraft(toJson(next));\n    setError(null);\n  };'), 'field edits must not serialize the full draft');
assert(manager.includes('{expanded && ('), 'tree children must mount only while expanded');
assert(manager.includes('value.slice(0, visibleArrayItems)'), 'large arrays must render in bounded batches');
assert(manager.includes('disabled={props.editingLocked}'), 'save controls must be disabled while workflow writes are active');
assert(manager.includes('<fieldset\n          disabled={props.editingLocked}'), 'nested variable inputs must inherit the workflow lock');

console.log('variable editor stability regression ok');
