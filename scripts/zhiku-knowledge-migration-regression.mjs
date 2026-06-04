import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const retrievalSource = fs.readFileSync('services/zhikuRetrieval.ts', 'utf8');

const migratedPresets = [
  {
    id: 'zhiku_paths_core',
    file: 'public/zhiku-presets/paths-core.json',
    expectedSpoiler: '中度',
  },
  {
    id: 'zhiku_aeons_core',
    file: 'public/zhiku-presets/aeons-core.json',
    expectedSpoiler: '重大',
  },
  {
    id: 'zhiku_xianzhou_history',
    file: 'public/zhiku-presets/xianzhou-history.json',
    expectedSpoiler: '重大',
  },
];

for (const preset of migratedPresets) {
  assert(presetSource.includes(`id: '${preset.id}'`), `缺少迁移智库预设注册：${preset.id}`);
  assert(presetSource.includes(`'${preset.id}'`), `只读迁移资料兜底未包含：${preset.id}`);

  const raw = fs.readFileSync(preset.file, 'utf8');
  const data = JSON.parse(raw);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  assert(entries.length > 0, `迁移智库预设没有条目：${preset.file}`);

  for (const entry of entries) {
    const label = `${preset.file} :: ${entry['标题'] ?? '<未命名>'}`;
    const keywords = Array.isArray(entry['关键词']) ? entry['关键词'] : [];
    const scopes = Array.isArray(entry['使用范围']) ? entry['使用范围'] : [];

    assert(entry['资料类型'] === '迁移设定资料', `${label} 未标记资料类型`);
    assert(entry['解锁状态'] === '只读资料', `${label} 未标记只读资料`);
    assert(entry['剧透等级'] === preset.expectedSpoiler, `${label} 剧透等级不符合预期`);
    assert(scopes.includes('智库') && scopes.includes('设定浏览'), `${label} 使用范围必须限制为智库/设定浏览`);
    assert(!scopes.includes('主剧情'), `${label} 不应包含主剧情使用范围`);
    assert(entry['可否主剧情注入'] === false, `${label} 必须禁止主剧情注入`);
    assert(Number(entry['重要度']) <= 3, `${label} 重要度不得继续全量压到 5`);
    assert(keywords.includes('资料类型:迁移设定资料'), `${label} 关键词缺少迁移资料标签`);
    assert(keywords.includes('来源层级:混合资料'), `${label} 关键词缺少混合来源标签`);
    assert(keywords.includes('解锁:只读资料'), `${label} 关键词缺少只读标签`);
    assert(keywords.includes(`剧透:${preset.expectedSpoiler}`), `${label} 关键词缺少剧透标签`);
  }
}

assert(
  presetSource.includes('READONLY_MIGRATED_LORE_PRESET_IDS') &&
    presetSource.includes('可否主剧情注入: false') &&
    presetSource.includes("entry.解锁状态 || '只读资料'") &&
    presetSource.includes("entry.使用范围?.length ? entry.使用范围 : ['智库', '设定浏览']"),
  '内置迁移资料加载兜底缺失，重新导出 JSON 时可能误入主剧情',
);

assert(
  retrievalSource.includes("if (entry.可否主剧情注入 === false) return '该资料标记为不可主剧情注入。';") &&
    retrievalSource.includes('/未解锁|锁定|只读/i.test(unlock)') &&
    retrievalSource.includes('不含主剧情'),
  '主剧情智库召回门禁没有覆盖不可注入、只读和范围限制',
);

console.log('zhiku knowledge migration regression passed');
