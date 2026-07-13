import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const presets = read('data/starMapPresets.ts');
const panel = read('components/features/GameSystems/StarMapPanel.tsx');
const luofuBlueprintAsset = path.join(root, 'public/assets/star-map/luofu-starskiff-digital-blueprint.webp');
const luofuSource = presets.slice(presets.indexOf("id: 'luofu_central_starskiff_haven'"), presets.indexOf("id: 'penacony_reverie_reality'"));

const locations = [
  '星槎海中枢', '流云渡', '迴星港', '长乐天',
  '金人巷', '太卜司', '工造司', '绥园',
  '丹鼎司', '鳞渊境', '幽囚狱', '竞锋舰',
];

for (const location of locations) {
  assert(luofuSource.includes(`name: '${location}'`), `Luofu second-level location is missing: ${location}`);
}

assert(locations.length === 12, 'Luofu second-level location inventory must contain 12 cards.');
assert((luofuSource.match(/status: 'known'/g) ?? []).length === 12, 'All twelve Luofu locations must be visible by default.');
assert(!luofuSource.includes("parentId: 'luofu_"), 'Luofu official regions must remain direct second-level locations.');
assert(!presets.includes("id: 'luofu_port_routes'") && !presets.includes("id: 'luofu_market_districts'"), 'Temporary Luofu navigation groups must stay removed.');
assert(!luofuSource.includes("navigationMode: 'interior'"), 'Luofu fourth-level entries must remain deferred.');
assert(luofuSource.includes("aliases: ['回星港'"), 'Traditional/simplified Stargazer Navalia aliases are missing.');
assert(luofuSource.includes("name: '金人巷'") && luofuSource.includes("name: '绥园'") && luofuSource.includes("name: '幽囚狱'") && luofuSource.includes("name: '竞锋舰'"), 'New Luofu official regions are incomplete.');

assert(panel.includes('isLuofuDetailMap'), 'Luofu detail-map visual mode is missing.');
assert(panel.includes('function LuofuDelveSchematic'), 'Luofu delve navigation schematic is missing.');
assert(panel.includes('data-star-map-schematic="luofu-atlas"'), 'Luofu atlas background marker is missing.');
assert(panel.includes("url('/assets/star-map/luofu-starskiff-digital-blueprint.webp')"), 'Luofu starskiff blueprint background is not wired into the detail map.');
assert(panel.includes('data-star-map-background-asset="luofu-starskiff-digital-blueprint"'), 'Luofu blueprint background asset marker is missing.');
assert(fs.existsSync(luofuBlueprintAsset) && fs.statSync(luofuBlueprintAsset).size > 20_000, 'Luofu starskiff blueprint asset is missing or empty.');
assert(panel.includes("filter: 'saturate(0.9) brightness(0.78) contrast(1.08)'"), 'Luofu digital blueprint must keep its readable ice-blue screen treatment.');
assert(panel.includes('bg-[rgba(13,53,82,0.07)]'), 'Luofu digital blueprint must use a light blue-gray overlay instead of a dark or parchment treatment.');
assert(panel.includes("isLuofuDetailMap || isJariloDetailMap || isHertaDetailMap ? 'pointer-events-none absolute inset-0'"), 'Luofu blueprint background must fill the existing detail-map canvas without changing node layout.');
assert(!panel.includes('DELVE NAVIGATION / 洞天航路') && !panel.includes('JADE GATE ARRAY / 玉界门阵列'), 'Luofu atlas background must not expose radar-style technical labels.');
assert(panel.includes('function LuofuLocationPager') && panel.includes('data-luofu-location-pager="true"'), 'Luofu second-level pager is missing.');
assert(panel.includes('const pageSize = 4') && panel.includes('LUOFU_LOCATION_ORDER'), 'Luofu pager must show four ordered regions per page.');
assert(panel.includes('<TrainLocationNode') && panel.includes('position={nodePositions[index]}'), 'Luofu paging must reuse the shared second-level location node visual.');
assert(panel.includes('向左浏览罗浮区域') && panel.includes('向右浏览罗浮区域'), 'Luofu pager navigation arrows are missing.');
assert(panel.includes('pointer-events-none absolute inset-0 z-20') && panel.includes('left-4 top-4 z-30'), 'Luofu pager must not block breadcrumb navigation.');
assert(panel.includes("String(page + 1).padStart(2, '0')"), 'Luofu pager page indicator is missing.');

console.log('luofu-star-map-regression: ok');
