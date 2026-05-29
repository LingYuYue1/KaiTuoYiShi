import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetPath = path.resolve(root, process.argv[2] ?? 'data/storyWeavingCanonDecomposed.json');

const expectedSeries = [
  { id: 'story_canon_zhiku_herta_station_chapter1', minSegments: 6 },
  { id: 'story_canon_zhiku_jarilo_vi_chapters', minSegments: 13 },
  { id: 'story_canon_zhiku_jarilo_vi_sunrise_chapters', minSegments: 10 },
  { id: 'story_canon_zhiku_xianzhou_luofu_travel_chapters', minSegments: 10 },
  { id: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters', minSegments: 5 },
  { id: 'story_canon_zhiku_xianzhou_luofu_aftermath_chapters', minSegments: 1 },
];

function fail(message) {
  throw new Error(message);
}

function readText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value) {
  return Array.isArray(value)
    ? value.map(readText).filter(Boolean)
    : [];
}

function compact(value) {
  return readText(value).replace(/\s+/g, '');
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(fs.existsSync(targetPath), `找不到剧情编织 canon 分解文件：${targetPath}`);

const system = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
const seriesList = Array.isArray(system.系列列表) ? system.系列列表 : [];
assert(seriesList.length > 0, '文件必须包含 系列列表。');

let totalSegments = 0;
const warnings = [];

for (const expected of expectedSeries) {
  const series = seriesList.find((item) => item?.id === expected.id || item?.内置预设ID === expected.id);
  assert(series, `缺少内置系列：${expected.id}`);

  const segments = Array.isArray(series.分段列表) ? series.分段列表 : [];
  assert(
    segments.length >= expected.minSegments,
    `系列 ${series.标题 ?? expected.id} 分段数不足：${segments.length}/${expected.minSegments}`,
  );
  totalSegments += segments.length;

  for (const segment of segments) {
    const label = `${series.标题 ?? expected.id} / ${segment?.组号 ?? '?'}:${segment?.标题 ?? '未命名'}`;
    const summary = compact(segment?.原文摘要);
    const overview = compact(segment?.本段概括);
    const endStates = textList(segment?.本段结束状态);
    const events = Array.isArray(segment?.关键事件) ? segment.关键事件 : [];
    const roleProgress = Array.isArray(segment?.角色推进) ? segment.角色推进 : [];

    assert(segment?.处理状态 === '已完成', `${label} 不是已完成分解状态。`);
    assert(readText(segment?.本段概括), `${label} 缺少本段概括。`);
    assert(readText(segment?.原文摘要), `${label} 缺少原文摘要。`);
    assert(endStates.length > 0, `${label} 缺少本段结束状态。`);
    assert(events.length > 0, `${label} 缺少关键事件。`);

    if (roleProgress.length === 0) {
      warnings.push(`${label} 没有角色推进；如果该段确实无人际/立场变化，可以接受。`);
    }

    for (const state of endStates) {
      const stateKey = compact(state);
      assert(stateKey !== summary && stateKey !== overview, `${label} 的结束状态直接复制了摘要/概括：${state}`);
    }

    for (const event of events) {
      for (const result of textList(event?.事件结果)) {
        const resultKey = compact(result);
        assert(resultKey !== summary && resultKey !== overview, `${label} 的事件结果直接复制了摘要/概括：${result}`);
      }
    }
  }
}

console.log(`story weaving canon validation ok: ${expectedSeries.length} series, ${totalSegments} segments`);
if (warnings.length) {
  console.log(`warnings: ${warnings.length}`);
  for (const warning of warnings.slice(0, 10)) console.log(`- ${warning}`);
  if (warnings.length > 10) console.log(`- ...and ${warnings.length - 10} more`);
}
