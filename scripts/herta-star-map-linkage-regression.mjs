import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const panel = read('components/features/GameSystems/StarMapPanel.tsx');
const presets = read('data/starMapPresets.ts');
const npc = read('models/npc.ts');
const plot = read('models/plot.ts');
const saveLoad = read('hooks/useGame.ts');
const snapshot = read('hooks/useGame/turnSnapshot.ts');
const variableExecutor = read('utils/variableExecutor.ts');
const hertaBlueprintAsset = path.join(root, 'public/assets/star-map/herta-station-architectural-blueprint.webp');

const hertaInteriorIds = presets
  .split(/\n  \{\n    id: /)
  .filter((block) => block.startsWith("'herta_") && block.includes("navigationMode: 'interior'"))
  .map((block) => block.match(/^'([^']+)'/)?.[1])
  .filter(Boolean);

assert(npc.includes('locationId?: string') && npc.includes('anchorId?: string'), 'NPC map linkage fields are missing.');
assert(npc.includes('source.locationId ?? source.地图地点ID ?? source.地点ID'), 'NPC location aliases are not normalized.');
assert(npc.includes('source.anchorId ?? source.地图锚点ID ?? source.锚点ID'), 'NPC anchor aliases are not normalized.');
assert(npc.includes('locationId: preferred.locationId ?? incoming.locationId ?? base.locationId'), 'NPC merge must preserve locationId.');
assert(npc.includes('anchorId: preferred.anchorId ?? incoming.anchorId ?? base.anchorId'), 'NPC merge must preserve anchorId.');

assert(plot.includes('locationId?: string') && plot.includes('anchorId?: string'), 'Plot map linkage fields are missing.');
assert(plot.includes('export function 归一化剧情节点列表'), 'Plot node normalizer is missing.');
assert(plot.includes('source.locationId ?? source.地图地点ID ?? source.地点ID'), 'Plot location aliases are not normalized.');
assert(plot.includes('source.anchorId ?? source.地图锚点ID ?? source.锚点ID'), 'Plot anchor aliases are not normalized.');
for (const source of [saveLoad, snapshot, variableExecutor]) {
  assert(source.includes('归一化剧情节点列表'), 'A plot restore/update path bypasses map field normalization.');
}

assert(panel.includes('if (plot.locationId) return plot.locationId === location.id'), 'Explicit plot location linkage must take priority.');
assert(panel.includes('normalizeStarMapLocationText([plot.标题, plot.摘要, plot.AI引导'), 'Legacy plot semantic fallback is missing.');
assert(panel.includes('.filter((npc) => npc.locationId === locationId)'), 'Explicit NPC location linkage is missing.');
assert(panel.includes('npcRecords.filter((npc) => npc.同行 && !npc.locationId)'), 'Unlocated companion fallback is missing.');
assert(panel.includes('npc.anchorId === anchor.id') && panel.includes('plot.anchorId === anchor.id'), 'Interior anchor linkage is missing.');
assert(panel.includes('未设置锚点的角色与剧情保留在房间级'), 'Unanchored room-level fallback copy is missing.');

assert(hertaInteriorIds.length === 2, `Herta must expose exactly two interiors, found ${hertaInteriorIds.length}.`);
assert(hertaInteriorIds.includes('herta_master_herta_office'), 'Herta office interior is missing.');
assert(hertaInteriorIds.includes('herta_storage_curio_collection_room'), 'Curio collection interior is missing.');
assert(panel.includes("url('/assets/star-map/herta-station-architectural-blueprint.webp')"), 'Herta architectural blueprint background is not wired into the detail map.');
assert(panel.includes('data-star-map-background-asset="herta-station-architectural-blueprint"'), 'Herta blueprint background asset marker is missing.');
assert(fs.existsSync(hertaBlueprintAsset) && fs.statSync(hertaBlueprintAsset).size > 100_000, 'Herta architectural blueprint asset is missing or empty.');
assert(panel.includes("isLuofuDetailMap || isJariloDetailMap || isHertaDetailMap ? 'pointer-events-none absolute inset-0'"), 'Herta blueprint must fill the existing detail-map canvas without changing node positions.');
assert(presets.includes("id: 'simulated_universe'") && presets.includes("id: 'genius_hologram_gallery'"), 'Herta office anchors are incomplete.');
assert(presets.includes("id: 'main_display_platform'") && presets.includes("id: 'left_display_platform'") && presets.includes("id: 'right_display_platform'"), 'Curio display anchors are incomplete.');

assert(panel.includes('function resolveCurrentMapNavigation'), 'Current-location hierarchy resolver is missing.');
assert(panel.includes("return { view: 'interior', localRootLocationId: parent.id, interiorRootLocationId: currentMatch.location.id }"), 'Anchor matches must open their containing interior.');
assert(panel.includes("return { view: 'interior', localRootLocationId: grandparent.id, interiorRootLocationId: parent.id }"), 'Fourth-level child matches must open their parent interior.');
assert(panel.includes("if (currentMatch.location.status === 'locked')") && panel.includes("if (parent.status === 'locked')"), 'Automatic focus must not enter locked interiors.');
assert(panel.includes("selectedLocalLocation.status !== 'locked'"), 'Manual entry must block locked interiors.');
assert(panel.includes('INTERIOR / 未解锁'), 'Locked interior card state is missing.');
assert(panel.includes("location.lockReason ?? '该地点尚未在剧情中解锁。'"), 'Locked location reason is missing.');
assert(panel.includes('NPC 未标注') && panel.includes('剧情未关联'), 'Empty linkage states are missing.');
assert(panel.includes('暂无明确落点') && panel.includes('暂无关联剧情'), 'Interior empty linkage states are missing.');
assert(panel.includes('当前地点还没有登记到航图') && panel.includes('未登记地点'), 'Unknown current-location state is missing.');

console.log('herta-star-map-linkage-regression: ok');
