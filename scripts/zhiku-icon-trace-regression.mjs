import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storyPath = new URL('../stories/ZhikuIconTrace.stories.tsx', import.meta.url);
const enemyAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/enemy-emblem-precision-h.svg',
  import.meta.url,
);
const factionAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/faction-emblem-precision-a.svg',
  import.meta.url,
);
const termAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/term-emblem-precision-a.svg',
  import.meta.url,
);
const locationAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/location-emblem-concept-a.svg',
  import.meta.url,
);
const storyArchiveAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/story-archive-emblem-concept-a.svg',
  import.meta.url,
);
const pathAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/path-emblem-precision-c.svg',
  import.meta.url,
);
const eventAssetPath = new URL(
  '../public/assets/zhiku/icon-trace/event-emblem-concept-a.svg',
  import.meta.url,
);

const [storySource, enemyAsset, factionAsset, termAsset, locationAsset, storyArchiveAsset, pathAsset, eventAsset] = await Promise.all([
  readFile(storyPath, 'utf8'),
  readFile(enemyAssetPath, 'utf8'),
  readFile(factionAssetPath, 'utf8'),
  readFile(termAssetPath, 'utf8'),
  readFile(locationAssetPath, 'utf8'),
  readFile(storyArchiveAssetPath, 'utf8'),
  readFile(pathAssetPath, 'utf8'),
  readFile(eventAssetPath, 'utf8'),
]);

assert.match(
  storySource,
  /const ENEMY_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/enemy-emblem-precision-h\.svg';/,
  '敌对生物 Story 必须引用带版本的高精度资源，避免同名 SVG 被浏览器缓存',
);
assert.doesNotMatch(
  storySource,
  /const ENEMY_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/enemy-emblem-trace\.svg';/,
  '敌对生物 Story 不得继续引用可被覆盖的通用描摹路径',
);
assert.match(enemyAsset, /fill="currentColor"/);
assert.match(enemyAsset, /fill-rule="evenodd"/);
assert.match(
  storySource,
  /const FACTION_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/faction-emblem-precision-a\.svg';/,
  '派系 Story 必须引用带版本的高精度资源，避免同名 SVG 被浏览器缓存',
);
assert.match(storySource, /export const 派系图标对照: Story/);
assert.match(factionAsset, /fill="currentColor"/);
assert.match(factionAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(factionAsset, /M216\.85 178L219 179\.12/);
assert.match(
  storySource,
  /const TERM_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/term-emblem-precision-a\.svg';/,
  '专有名词 Story 必须引用带版本的高精度资源，避免同名 SVG 被浏览器缓存',
);
assert.match(storySource, /export const 专有名词图标对照: Story/);
assert.match(storySource, /traceCode: 'TRACE 05'/);
assert.match(termAsset, /fill="currentColor"/);
assert.match(termAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(termAsset, /#[0-9a-f]{3,8}/i, '专有名词 SVG 不得保留红色感叹号颜色');
assert.match(
  termAsset,
  /M267 40C291 41 311 56 318 79C321 91 319 103 313 114L306 109C311 98 313 90 310 81C305 63 289 51 265 47Z/,
  '专有名词 SVG 必须保留右上角被感叹号遮挡区域的补全轮廓',
);
assert.match(
  storySource,
  /const LOCATION_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/location-emblem-concept-a\.svg';/,
  '地点原创候选必须使用独立版本路径，避免覆盖已确认资源',
);
assert.match(storySource, /export const 地点图标设计候选: Story/);
assert.match(storySource, /traceCode: 'TRACE 06 \/ APPROVED A'/);
assert.match(locationAsset, /viewBox="0 0 320 320"/);
assert.match(locationAsset, /fill="currentColor"/);
assert.match(locationAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(locationAsset, /<text\b|<image\b|#[0-9a-f]{3,8}/i);
assert.match(
  storySource,
  /const STORY_ARCHIVE_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/story-archive-emblem-concept-a\.svg';/,
  '剧情档案原创候选必须使用独立版本路径，避免覆盖已确认资源',
);
assert.match(storySource, /export const 剧情档案图标设计候选: Story/);
assert.match(storySource, /traceCode: 'TRACE 07 \/ APPROVED A'/);
assert.match(storyArchiveAsset, /viewBox="0 0 320 320"/);
assert.match(storyArchiveAsset, /fill="currentColor"/);
assert.match(storyArchiveAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(storyArchiveAsset, /<text\b|<image\b|#[0-9a-f]{3,8}/i);
assert.match(
  storySource,
  /const PATH_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/path-emblem-precision-c\.svg';/,
  '命途原创候选必须使用独立版本路径，避免覆盖已确认资源',
);
assert.match(storySource, /export const 命途图标设计候选: Story/);
assert.match(storySource, /traceCode: 'TRACE 08 \/ PRECISION C'/);
assert.match(pathAsset, /viewBox="0 0 320 320"/);
assert.match(pathAsset, /fill="currentColor"/);
assert.match(pathAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(pathAsset, /<text\b|<image\b|#[0-9a-f]{3,8}/i);
assert.equal(
  (pathAsset.match(/<path\b/g) ?? []).length,
  1,
  '命途精密候选必须保持单一主路径，避免退回多层几何元素堆叠',
);
assert.ok(
  (pathAsset.match(/\bC(?=-?\d)/g) ?? []).length >= 100,
  '命途精密候选必须保留连续曲面细节',
);
assert.ok(
  (pathAsset.match(/Z/g) ?? []).length >= 20,
  '命途精密候选必须保留足够的内部负形轮廓',
);
assert.match(
  storySource,
  /const EVENT_TRACE_SRC = '\/assets\/zhiku\/icon-trace\/event-emblem-concept-a\.svg';/,
  '事件原创候选必须使用独立版本路径，避免覆盖已确认资源',
);
assert.match(storySource, /export const 事件图标设计候选: Story/);
assert.match(storySource, /traceCode: 'TRACE 09 \/ CONCEPT A'/);
assert.match(eventAsset, /viewBox="0 0 320 320"/);
assert.match(eventAsset, /fill="currentColor"/);
assert.match(eventAsset, /fill-rule="evenodd"/);
assert.doesNotMatch(eventAsset, /<text\b|<image\b|#[0-9a-f]{3,8}/i);
assert.equal(
  (eventAsset.match(/<path\b/g) ?? []).length,
  1,
  '事件候选必须保持统一主路径和连续整体轮廓',
);
assert.ok(
  (eventAsset.match(/\bC(?=-?\d)/g) ?? []).length >= 100,
  '事件候选必须保留精密曲面细节',
);
assert.ok(
  (eventAsset.match(/Z/g) ?? []).length >= 20,
  '事件候选必须保留足够的因果流线负形',
);

console.log('ZHIKU_ICON_TRACE_REGRESSION_OK');
