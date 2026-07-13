export type StarMapWaypointKind =
  | 'train'
  | 'planet'
  | 'space_station'
  | 'ship'
  | 'fleet'
  | 'dreamscape'
  | 'anomaly'
  | 'fan_world'
  | 'workshop';

export type StarMapSource = 'official' | 'fan' | 'workshop' | 'system';

export type StarMapStatus = 'known' | 'locked' | 'draft' | 'unregistered';

export type StarMapNavigationMode = 'terminal' | 'interior';

export type StarMapLocationKind =
  | 'zone'
  | 'district'
  | 'room'
  | 'route'
  | 'facility'
  | 'wildland'
  | 'special';

export interface StarMapPoint {
  x: number;
  y: number;
}

export interface StarMapSceneAnchor {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  tags: string[];
  mapPosition: StarMapPoint;
  legacyLocationIds?: string[];
}

export interface StarMapWaypoint {
  id: string;
  name: string;
  shortName: string;
  kind: StarMapWaypointKind;
  imageAsset?: string;
  source: StarMapSource;
  status: StarMapStatus;
  description: string;
  tags: string[];
  position: StarMapPoint;
}

export interface StarMapLocation {
  id: string;
  waypointId: string;
  parentId?: string;
  name: string;
  kind: StarMapLocationKind;
  source: StarMapSource;
  status: StarMapStatus;
  aliases: string[];
  description: string;
  tags: string[];
  mapPosition: StarMapPoint;
  navigationMode?: StarMapNavigationMode;
  allowsPlayerChildren?: boolean;
  lockReason?: string;
  sceneAnchors?: StarMapSceneAnchor[];
}

export interface StarMapLocationMatch {
  location: StarMapLocation;
  waypoint: StarMapWaypoint;
  anchor?: StarMapSceneAnchor;
  score: number;
  reason: 'exact' | 'alias' | 'anchor' | 'path' | 'contains';
}

export const STAR_MAP_MAX_LOCATION_DEPTH = 3;

export const STAR_MAP_LEGACY_LOCATION_FALLBACKS: Readonly<Record<string, string>> = {
  herta_master_reception_center: 'herta_base_reception_center',
  herta_master_external_passage: 'herta_master_core_passage',
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

export function resolveLegacyStarMapLocationId(locationId: string | undefined): string | undefined {
  if (!locationId) return undefined;
  return STAR_MAP_LEGACY_LOCATION_FALLBACKS[locationId] ?? locationId;
}

export function normalizeStarMapLocationText(text: string): string {
  return text
    .trim()
    .replace(/[\s·・「」『』【】\[\]()（）_-]+/g, '')
    .toLocaleLowerCase('zh-CN');
}

export function getStarMapLocationPath(
  location: StarMapLocation,
  locations: StarMapLocation[],
): StarMapLocation[] {
  const locationById = new Map(locations.map((item) => [item.id, item]));
  const path: StarMapLocation[] = [];
  const visited = new Set<string>();
  let cursor: StarMapLocation | undefined = location;

  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentId ? locationById.get(cursor.parentId) : undefined;
  }

  return path;
}

export function getStarMapLocationDepth(location: StarMapLocation, locations: StarMapLocation[]): number {
  return getStarMapLocationPath(location, locations).length;
}

export function getStarMapLocationChildren(locationId: string, locations: StarMapLocation[]): StarMapLocation[] {
  return locations.filter((location) => location.parentId === locationId);
}

export function canStarMapLocationAcceptPlayerChildren(
  location: StarMapLocation,
  locations: StarMapLocation[],
): boolean {
  return location.status !== 'locked'
    && location.navigationMode === 'interior'
    && location.allowsPlayerChildren === true
    && getStarMapLocationDepth(location, locations) < STAR_MAP_MAX_LOCATION_DEPTH;
}

export function findCurrentStarMapLocation(
  currentLocation: string | undefined,
  waypoints: StarMapWaypoint[],
  locations: StarMapLocation[],
): StarMapLocationMatch | null {
  const normalized = normalizeStarMapLocationText(currentLocation ?? '');
  if (!normalized) return null;

  let best: StarMapLocationMatch | null = null;

  for (const location of locations) {
    const waypoint = waypoints.find((item) => item.id === location.waypointId);
    if (!waypoint) continue;

    const path = getStarMapLocationPath(location, locations);
    const pathNames = path.map((item) => item.name);
    const locationCandidates = [location.name, ...location.aliases]
      .filter(Boolean)
      .map((name, index) => ({
        name,
        anchor: undefined as StarMapSceneAnchor | undefined,
        kind: index === 0 ? 'name' as const : 'alias' as const,
      }));
    const pathCandidates = [
      `${waypoint.name}${pathNames.join('')}`,
      `${waypoint.shortName}${pathNames.join('')}`,
      pathNames.join(''),
    ].map((name) => ({ name, anchor: undefined as StarMapSceneAnchor | undefined, kind: 'path' as const }));
    const candidates = [
      ...locationCandidates,
      ...pathCandidates,
      ...(location.sceneAnchors ?? []).flatMap((anchor) => (
        [anchor.name, ...anchor.aliases, ...(anchor.legacyLocationIds ?? [])]
          .filter(Boolean)
          .map((name) => ({ name, anchor, kind: 'anchor' as const }))
      )),
    ];
    for (const { name, anchor, kind } of candidates) {
      const candidate = normalizeStarMapLocationText(name);
      if (!candidate) continue;

      let score = 0;
      let reason: StarMapLocationMatch['reason'] = 'contains';
      if (candidate === normalized) {
        score = kind === 'path' ? 108 : kind === 'anchor' ? 106 : kind === 'name' ? 104 : 102;
        reason = kind === 'path' ? 'path' : kind === 'anchor' ? 'anchor' : kind === 'name' ? 'exact' : 'alias';
      } else if (candidate.length >= 3 && normalized.includes(candidate)) {
        score = Math.min(kind === 'path' ? 98 : 92, 48 + candidate.length);
        reason = kind === 'path' ? 'path' : kind === 'anchor' ? 'anchor' : 'contains';
      } else if (candidate.includes(normalized) && normalized.length >= 3) {
        score = Math.min(82, 38 + normalized.length);
        reason = kind === 'path' ? 'path' : kind === 'anchor' ? 'anchor' : 'contains';
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { location, waypoint, anchor, score, reason };
      }
    }
  }

  return best && best.score >= 45 ? best : null;
}
