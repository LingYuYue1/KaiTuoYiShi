import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const presets = read('data/starMapPresets.ts');
const panel = read('components/features/GameSystems/StarMapPanel.tsx');
const model = read('models/starMap.ts');
const jariloBlueprintAsset = path.join(root, 'public/assets/star-map/jarilo-architectural-blueprint.webp');

const jariloSource = presets.slice(presets.indexOf("id: 'jarilo_overworld'"), presets.indexOf("id: 'luofu_central_starskiff_haven'"));
const upperLocations = ['行政区', '城郊雪原', '边缘通路', '铁卫禁区', '残响回廊', '永冬岭', '造物之柱', '旧武器试验场'];
const lowerLocations = ['磐岩镇', '大矿区', '铆钉镇', '机械聚落'];
for (const name of upperLocations) assert(jariloSource.includes(`name: '${name}'`), `Jarilo upper location is missing: ${name}`);
for (const name of lowerLocations) assert(jariloSource.includes(`name: '${name}'`), `Jarilo lower location is missing: ${name}`);
assert((jariloSource.match(/id: 'jarilo_overworld'/g) ?? []).length === 1, 'Jarilo upper zone must exist exactly once.');
assert((jariloSource.match(/id: 'jarilo_underworld'/g) ?? []).length === 1, 'Jarilo lower zone must exist exactly once.');
assert(jariloSource.includes("parentId: 'jarilo_overworld'"), 'Upper locations must use the upper-zone parent.');
assert(jariloSource.includes("parentId: 'jarilo_underworld'"), 'Lower locations must use the lower-zone parent.');
assert((jariloSource.match(/status: 'known'/g) ?? []).length >= 14, 'All Jarilo zones and locations must be visible by default.');
assert(jariloSource.includes("aliases: ['贝洛伯格', '贝洛伯格上层区'"), 'Generic Belobog openings must resolve to the upper zone.');
assert(jariloSource.includes("'贝洛伯格城外'"), 'Belobog outskirts openings must resolve to the snow plains.');

for (const anchor of ['克里珀堡', '历史文化博物馆', '歌德宾馆', '机械屋「永动」', '搏击俱乐部', '娜塔莎的诊所', '歌德大饭店']) {
  assert(jariloSource.includes(`name: '${anchor}'`), `Jarilo final location anchor is missing: ${anchor}`);
}
assert(jariloSource.includes("id: 'jarilo_administrative_district'") && jariloSource.includes("navigationMode: 'interior'"), 'Administrative district must open its fourth-level location map.');
assert(jariloSource.includes("id: 'jarilo_boulder_town'") && jariloSource.includes("navigationMode: 'interior'"), 'Boulder Town must open its fourth-level location map.');

assert(panel.includes('isJariloDetailMap'), 'Jarilo detail map visual mode is missing.');
assert(panel.includes('function JariloDistrictSchematic'), 'Jarilo upper/lower district schematic is missing.');
assert(panel.includes('data-star-map-schematic="jarilo-districts"'), 'Jarilo schematic marker is missing.');
assert(panel.includes("url('/assets/star-map/jarilo-architectural-blueprint.webp')"), 'Jarilo architectural blueprint background is not wired into the detail map.');
assert(panel.includes('data-star-map-background-asset="jarilo-architectural-blueprint"'), 'Jarilo blueprint background asset marker is missing.');
assert(fs.existsSync(jariloBlueprintAsset) && fs.statSync(jariloBlueprintAsset).size > 20_000, 'Jarilo architectural blueprint asset is missing or empty.');
assert(panel.includes("isLuofuDetailMap || isJariloDetailMap || isHertaDetailMap ? 'pointer-events-none absolute inset-0'"), 'Jarilo blueprint must fill the existing detail-map canvas without changing node positions.');
assert(!panel.includes('SURFACE LOCK /') && !panel.includes('BELOBOG / OVERWORLD') && !panel.includes('UNDERWORLD / FURNACE LINE'), 'Jarilo blueprint must not retain the old CSS schematic labels.');
assert(panel.includes('function JariloAdministrativeDistrictBackdrop'), 'Administrative district fourth-level background is missing.');
assert(panel.includes('function JariloBoulderTownBackdrop'), 'Boulder Town fourth-level background is missing.');
assert(panel.includes("waypoint.id === 'jarilo_vi' ? '查看地点地图'"), 'Jarilo location-map action label is missing.');
assert(panel.includes('data-anchor-card="true"') && panel.includes('min-w-[156px]') && panel.includes('min-h-[58px]'), 'Fourth-level location cards must reserve a larger NPC-ready footprint.');
assert(panel.includes("读取NPC头像(npc, '档案')") && panel.includes('npcRecords={roomNpcs.filter((npc) => npc.anchorId === anchor.id)}'), 'Fourth-level cards must render explicitly anchored NPC avatars.');
assert(panel.includes("npc.姓名.trim().slice(0, 1) || '?'"), 'NPC avatar fallback initials are missing.');
assert(model.includes("normalizeStarMapLocationText"), 'Jarilo current-location matching must use shared normalization.');

console.log('jarilo-star-map-regression: ok');
