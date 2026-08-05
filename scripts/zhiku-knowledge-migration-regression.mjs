import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const presetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const retrievalSource = fs.readFileSync('services/zhikuRetrieval.ts', 'utf8');
const runtimeUnlockSource = fs.readFileSync('services/zhikuRuntimeUnlock.ts', 'utf8');

const migratedPresets = [
  {
    id: 'zhiku_paths_core',
    file: 'public/zhiku-presets/paths-core.json',
    expectedSpoiler: '中度',
    expectedDefaultUnlock: '默认可用',
    lockedAfterIndex: Infinity,
  },
  {
    id: 'zhiku_aeons_core',
    file: 'public/zhiku-presets/aeons-core.json',
    expectedSpoiler: '重大',
    expectedDefaultUnlock: '默认可用',
    lockedAfterIndex: Infinity,
  },
  {
    id: 'zhiku_xianzhou_history',
    file: 'public/zhiku-presets/xianzhou-history.json',
    expectedSpoiler: '重大',
    expectedDefaultUnlock: '可预热',
    lockedAfterIndex: 2,
  },
];

for (const preset of migratedPresets) {
  assert(presetSource.includes(`id: '${preset.id}'`), `缺少迁移智库预设注册：${preset.id}`);
  assert(presetSource.includes(`'${preset.id}'`), `可联动迁移资料兜底未包含：${preset.id}`);

  const raw = fs.readFileSync(preset.file, 'utf8');
  const data = JSON.parse(raw);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  assert(entries.length > 0, `迁移智库预设没有条目：${preset.file}`);

  entries.forEach((entry, index) => {
    const label = `${preset.file} :: ${entry['标题'] ?? '<未命名>'}`;
    const keywords = Array.isArray(entry['关键词']) ? entry['关键词'] : [];
    const scopes = Array.isArray(entry['使用范围']) ? entry['使用范围'] : [];
    const shouldBeLocked = index >= preset.lockedAfterIndex;

    assert(entry['资料类型'] === '迁移设定资料', `${label} 未标记资料类型`);
    assert(entry['解锁状态'] === (shouldBeLocked ? '未解锁' : preset.expectedDefaultUnlock), `${label} 解锁状态不符合分级联动预期`);
    assert(entry['剧透等级'] === preset.expectedSpoiler, `${label} 剧透等级不符合预期`);
    assert(scopes.includes('智库') && scopes.includes('设定浏览') && scopes.includes('主剧情'), `${label} 使用范围必须包含智库/设定浏览/主剧情`);
    assert(entry['可否主剧情注入'] === true, `${label} 必须允许主剧情按门禁联动`);
    assert(Number(entry['重要度']) <= 3, `${label} 重要度不得继续全量压到 5`);
    assert(keywords.includes('资料类型:迁移设定资料'), `${label} 关键词缺少迁移资料标签`);
    assert(keywords.includes('来源层级:混合资料'), `${label} 关键词缺少混合来源标签`);
    assert(keywords.includes(`解锁:${shouldBeLocked ? '未解锁' : preset.expectedDefaultUnlock}`), `${label} 关键词缺少解锁标签`);
    assert(keywords.includes(`剧透:${preset.expectedSpoiler}`), `${label} 关键词缺少剧透标签`);
    if (shouldBeLocked) {
      assert(
        typeof entry['解锁条件'] === 'string' && entry['解锁条件'].length >= 8,
        `${label} 未解锁资料必须提供可被剧情编织归档命中的解锁关键词`,
      );
    }
  });
}

assert(
  presetSource.includes('LINKABLE_LORE_PRESET_IDS') &&
    presetSource.includes('normalizeLinkedLoreEntry') &&
    presetSource.includes("entry.解锁状态 || (isLockedXianzhouHistory ? '未解锁' : '默认可用')") &&
    presetSource.includes("entry.使用范围?.length ? entry.使用范围 : ['智库', '设定浏览', '主剧情']") &&
    presetSource.includes('可否主剧情注入: entry.可否主剧情注入 ?? true'),
  '内置迁移资料加载兜底缺失，重新导出 JSON 时可能丢失可控联动门禁',
);

assert(
  retrievalSource.includes("if (entry.可否主剧情注入 === false) return '该资料标记为不可主剧情注入。';") &&
    retrievalSource.includes('const meta = 解析智库软结构标签(entry);') &&
    retrievalSource.includes('/未解锁|锁定|只读/i.test(unlock)') &&
    retrievalSource.includes('可预热') &&
    retrievalSource.includes('不把混合推论写成已经确认的事实'),
  '主剧情智库召回门禁没有覆盖不可注入、范围限制、可预热和迁移资料使用边界',
);

assert(
  runtimeUnlockSource.includes("if (entry.分类 === 'story') return null;") &&
    runtimeUnlockSource.includes('isRuntimeUnlockableZhikuEntry') &&
    runtimeUnlockSource.includes('迁移设定资料') &&
    !runtimeUnlockSource.includes("if (entry.分类 !== 'character') return null;"),
  '智库运行时解锁必须支持非角色迁移设定资料，不能只解锁 character',
);

console.log('zhiku knowledge migration regression passed');
