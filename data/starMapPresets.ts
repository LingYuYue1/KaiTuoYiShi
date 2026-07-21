import type { StarMapLocation, StarMapSceneAnchor } from '@/models/starMap';
import { STAR_MAP_LOCATION_DEFINITIONS } from './starMapLocationDefinitions';

export { STAR_MAP_WAYPOINTS } from './starMapWaypoints';

const TRAIN_SCENE_ANCHOR_IDS: Readonly<Record<string, string>> = {
  express_conductor_console: 'control_console',
  express_conductor_star_rail_display: 'star_rail_display',
  express_conductor_archive_cabinet: 'archive_cabinet',
  express_conductor_rest_corner: 'rest_corner',
  express_parlor_supply: 'central_bar',
  express_party_pastry_display: 'pastry_display',
  express_party_lounge_tables: 'lounge_tables',
  express_party_window_table: 'window_table',
  express_danheng_sleeping_area: 'sleeping_area',
  express_danheng_archive_terminal: 'archive_terminal',
  express_danheng_data_shelf: 'data_shelf',
  express_march_bed: 'bed',
  express_march_photo_wall: 'photo_wall',
  express_march_camera_rack: 'camera_rack',
  express_himeko_coffee_table: 'coffee_table',
  express_himeko_route_desk: 'route_desk',
  express_himeko_bookshelf: 'bookshelf',
  express_welt_drawing_desk: 'drawing_desk',
  express_welt_equipment_cabinet: 'equipment_cabinet',
  express_welt_reading_chair: 'reading_chair',
  express_observation_long_sofa: 'sofa_left',
  express_observation_main_table: 'main_table',
  express_observation_terminal_seat: 'public_terminal',
  express_data_bank: 'data_bank',
};

const SCENE_ANCHOR_PARENT_IDS: Readonly<Record<string, string>> = {
  express_data_bank: 'express_observation_car',
  express_conductor_console: 'express_conductor_room',
  express_conductor_quarters: 'express_conductor_room',
  express_conductor_console_seat: 'express_conductor_room',
  express_conductor_star_rail_display: 'express_conductor_room',
  express_conductor_archive_cabinet: 'express_conductor_room',
  express_conductor_rest_corner: 'express_conductor_room',
  express_parlor_supply: 'express_party_car',
  express_party_lounge_tables: 'express_party_car',
  express_party_bar_inside: 'express_party_car',
  express_party_pastry_display: 'express_party_car',
  express_party_left_sofa: 'express_party_car',
  express_party_window_table: 'express_party_car',
  express_observation_sofa_side: 'express_observation_car',
  express_observation_table_side: 'express_observation_car',
  express_observation_long_sofa: 'express_observation_car',
  express_observation_window: 'express_observation_car',
  express_observation_main_table: 'express_observation_car',
  express_observation_terminal_seat: 'express_observation_car',
  express_danheng_sleeping_area: 'express_room_danheng',
  express_danheng_archive_terminal: 'express_room_danheng',
  express_danheng_data_shelf: 'express_room_danheng',
  express_march_bed: 'express_room_march',
  express_march_photo_wall: 'express_room_march',
  express_march_camera_rack: 'express_room_march',
  express_himeko_coffee_table: 'express_room_himeko',
  express_himeko_route_desk: 'express_room_himeko',
  express_himeko_bookshelf: 'express_room_himeko',
  express_welt_drawing_desk: 'express_room_welt',
  express_welt_equipment_cabinet: 'express_room_welt',
  express_welt_reading_chair: 'express_room_welt',
};

const OMITTED_LOCATION_IDS = new Set([
  'herta_master_reception_center',
  'herta_master_external_passage',
]);

const TRAIN_LOCATION_NAVIGATION: Readonly<Record<string, StarMapLocation['navigationMode']>> = {
  express_conductor_room: 'terminal',
  express_observation_car: 'terminal',
  express_party_car: 'interior',
  express_guest_corridor: 'interior',
  express_trailblazer_room_entry: 'interior',
  express_room_danheng: 'interior',
  express_room_march: 'interior',
  express_room_himeko: 'interior',
  express_room_welt: 'interior',
};

const TRAIN_PLAYER_EXTENSION_BOUNDARIES = new Set([
  'express_party_car',
  'express_guest_corridor',
]);

const TRAIN_LOCATION_LOCK_REASONS: Readonly<Record<string, string>> = {
  express_trailblazer_room_entry: '随开拓旅程推进后解锁。',
};

const sceneAnchorsByLocation = new Map<string, StarMapSceneAnchor[]>();
for (const location of STAR_MAP_LOCATION_DEFINITIONS) {
  const parentLocationId = SCENE_ANCHOR_PARENT_IDS[location.id];
  const anchorId = TRAIN_SCENE_ANCHOR_IDS[location.id];
  if (!parentLocationId || !anchorId) continue;
  const anchor: StarMapSceneAnchor = {
    id: anchorId,
    name: location.name,
    aliases: location.aliases,
    description: location.description,
    tags: Array.from(new Set([...location.tags.filter((tag) => tag !== '四级地图'), '场景锚点', 'NPC 落点'])),
    mapPosition: location.mapPosition,
  };
  const anchors = sceneAnchorsByLocation.get(parentLocationId) ?? [];
  anchors.push(anchor);
  sceneAnchorsByLocation.set(parentLocationId, anchors);
}

const SCENE_ANCHOR_SOURCE_IDS = new Set(Object.keys(SCENE_ANCHOR_PARENT_IDS));

export const STAR_MAP_LOCATIONS: StarMapLocation[] = STAR_MAP_LOCATION_DEFINITIONS
  .filter((location) => !SCENE_ANCHOR_SOURCE_IDS.has(location.id) && !OMITTED_LOCATION_IDS.has(location.id))
  .map((location) => {
    const sceneAnchors = sceneAnchorsByLocation.get(location.id);
    const navigationMode = TRAIN_LOCATION_NAVIGATION[location.id] ?? location.navigationMode;
    const allowsPlayerChildren = TRAIN_PLAYER_EXTENSION_BOUNDARIES.has(location.id)
      ? true
      : location.allowsPlayerChildren;
    const lockReason = TRAIN_LOCATION_LOCK_REASONS[location.id] ?? location.lockReason;
    if (!sceneAnchors && !navigationMode && allowsPlayerChildren === undefined && !lockReason) return location;
    return {
      ...location,
      navigationMode,
      allowsPlayerChildren,
      lockReason,
      sceneAnchors: sceneAnchors ?? location.sceneAnchors ?? [],
    };
  });

export function getStarMapLocationsByWaypoint(waypointId: string): StarMapLocation[] {
  return STAR_MAP_LOCATIONS.filter((location) => location.waypointId === waypointId);
}
