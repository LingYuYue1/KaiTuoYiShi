import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode, Dispatch, SetStateAction, ChangeEvent } from 'react';
import type { 世界状态 } from '@/models/world';
import { 读取NPC头像, type NPC记录 } from '@/models/npc';
import type { 剧情节点 } from '@/models/plot';
import type { StarMapLocation, StarMapLocationKind, StarMapNavigationMode, StarMapSceneAnchor, StarMapSource, StarMapWaypoint, StarMapWaypointKind } from '@/models/starMap';
import { STAR_MAP_MAX_LOCATION_DEPTH, canStarMapLocationAcceptPlayerChildren, findCurrentStarMapLocation, getStarMapLocationPath, normalizeStarMapLocationText } from '@/models/starMap';
import type { 游戏设置, 星轨航图地图包记录, 星轨航图系统设置 } from '@/models/settings';
import { STAR_MAP_LOCATIONS, STAR_MAP_WAYPOINTS } from '@/data/starMapPresets';
import { setPreference } from '@/src/ui/preferences';

interface StarMapPanelProps {
  worldState: 世界状态;
  npcRecords: NPC记录[];
  plotNodes: 剧情节点[];
  gameSettings: 游戏设置;
  onGameSettingsChange: Dispatch<SetStateAction<游戏设置>>;
}

type StarMapTab = 'map' | 'fan' | 'workshop';
type StarMapView = 'overview' | 'detail' | 'local' | 'interior';
type StarMapPackageFilter = 'all' | 'enabled' | 'disabled' | 'incomplete';
type StarMapPackageSort = 'installedAt' | 'name' | 'status' | 'incomplete';
type StarMapPackageSourceKind = 'local' | 'imported' | 'workshop' | 'system';

interface StarMapPackageDraft {
  packageId: string;
  name: string;
  version: string;
  author?: string;
  sourceKind: StarMapPackageSourceKind;
  license?: string;
  sourceUrl?: string;
  coverAsset?: string;
  tags: string[];
  waypoints: StarMapWaypoint[];
  locations: StarMapLocation[];
  warnings: string[];
}

interface StarMapPackageInstallPlan {
  installWaypoints: StarMapWaypoint[];
  installLocations: StarMapLocation[];
  skippedWaypoints: string[];
  skippedLocations: string[];
  skippedDetails: string[];
}

interface StarMapPackageInstallReport {
  mode: 'install' | 'update';
  packageId: string;
  packageName: string;
  packageVersion: string;
  packageSourceKind: StarMapPackageSourceKind;
  packageTags: string[];
  previousVersion?: string;
  installedAt: string;
  replacedWaypoints: number;
  replacedLocations: number;
  installedWaypoints: string[];
  installedLocations: string[];
  skippedItems: string[];
}

const shellClip = 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)';
const panelClip = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const chipClip = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

const KIND_LABELS: Record<StarMapWaypointKind, string> = {
  train: '列车',
  planet: '星球',
  space_station: '空间站',
  ship: '舰船',
  fleet: '舰队',
  dreamscape: '梦境',
  anomaly: '异常点',
  fan_world: '同人',
  workshop: '工坊',
};

const WAYPOINT_VISUALS: Record<
  StarMapWaypointKind,
  {
    size: number;
    core: string;
    aura: string;
    ring: string;
    mark: string;
  }
> = {
  train: {
    size: 74,
    core: 'linear-gradient(135deg, rgba(237, 211, 154, 0.96), rgba(80, 180, 213, 0.74) 48%, rgba(12, 26, 49, 0.96))',
    aura: 'rgba(var(--tj-tech-cyan), 0.42)',
    ring: 'rgba(var(--tj-amber-soft), 0.72)',
    mark: 'EXP',
  },
  planet: {
    size: 72,
    core: 'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.92), rgba(224, 188, 102, 0.92) 18%, rgba(79, 122, 172, 0.86) 46%, rgba(15, 27, 56, 0.98) 78%)',
    aura: 'rgba(var(--tj-accent-primary), 0.42)',
    ring: 'rgba(235, 197, 122, 0.74)',
    mark: 'ORB',
  },
  space_station: {
    size: 78,
    core: 'linear-gradient(135deg, rgba(221, 231, 237, 0.96), rgba(87, 170, 199, 0.82) 44%, rgba(20, 35, 61, 0.98))',
    aura: 'rgba(var(--tj-tech-cyan), 0.38)',
    ring: 'rgba(185, 227, 236, 0.72)',
    mark: 'STA',
  },
  ship: {
    size: 70,
    core: 'linear-gradient(135deg, rgba(240, 212, 152, 0.96), rgba(153, 72, 88, 0.82) 45%, rgba(22, 31, 56, 0.96))',
    aura: 'rgba(var(--tj-amber-soft), 0.36)',
    ring: 'rgba(233, 187, 94, 0.64)',
    mark: 'ARK',
  },
  fleet: {
    size: 68,
    core: 'linear-gradient(135deg, rgba(215, 230, 237, 0.92), rgba(93, 112, 145, 0.92) 52%, rgba(20, 28, 48, 0.96))',
    aura: 'rgba(160, 191, 210, 0.32)',
    ring: 'rgba(207, 223, 232, 0.58)',
    mark: 'FLT',
  },
  dreamscape: {
    size: 76,
    core: 'radial-gradient(circle at 35% 30%, rgba(255, 238, 196, 0.98), rgba(88, 188, 202, 0.76) 34%, rgba(115, 82, 178, 0.74) 60%, rgba(18, 18, 45, 0.96) 82%)',
    aura: 'rgba(133, 205, 222, 0.36)',
    ring: 'rgba(255, 219, 148, 0.6)',
    mark: 'DRM',
  },
  anomaly: {
    size: 66,
    core: 'conic-gradient(from 30deg, rgba(255, 225, 141, 0.95), rgba(73, 194, 209, 0.72), rgba(32, 42, 70, 0.96), rgba(255, 225, 141, 0.95))',
    aura: 'rgba(var(--tj-amber-soft), 0.32)',
    ring: 'rgba(252, 211, 116, 0.58)',
    mark: '???',
  },
  fan_world: {
    size: 64,
    core: 'radial-gradient(circle at 35% 26%, rgba(255,255,255,0.82), rgba(83, 201, 215, 0.72) 34%, rgba(36, 57, 96, 0.96) 78%)',
    aura: 'rgba(var(--tj-tech-cyan), 0.3)',
    ring: 'rgba(129, 218, 229, 0.58)',
    mark: 'FAN',
  },
  workshop: {
    size: 64,
    core: 'linear-gradient(135deg, rgba(237, 205, 132, 0.96), rgba(65, 91, 128, 0.88) 48%, rgba(17, 25, 45, 0.98))',
    aura: 'rgba(var(--tj-accent-primary), 0.3)',
    ring: 'rgba(236, 190, 98, 0.56)',
    mark: 'LAB',
  },
};

const ROUND_WAYPOINT_KINDS = new Set<StarMapWaypointKind>(['planet', 'dreamscape', 'anomaly', 'fan_world']);
const VEHICLE_WAYPOINT_KINDS = new Set<StarMapWaypointKind>(['train', 'ship', 'fleet']);

const FAN_BLUEPRINTS = [
  {
    title: '原著航点扩展',
    code: 'CANON+',
    status: '优先级最高',
    lead: '给列车、空间站、仙舟等既有航点补房间、街区、舱段和可探索节点。',
    rows: ['列车新增房间', '空间站未开放舱段', '城市街区与支线场景'],
  },
  {
    title: '原创同人星球',
    code: 'FAN WORLD',
    status: '规划中',
    lead: '用于承载玩家自建文明、星球、异常坐标和长期篇章舞台。',
    rows: ['星球概览', '势力 / 地貌 / 危机', '可绑定世界书与智库条目'],
  },
  {
    title: '移动据点与舰船',
    code: 'VESSEL',
    status: '规划中',
    lead: '支持原创飞船、空间站、舰队和临时行动基地，不强行归类为星球。',
    rows: ['舰船层级地图', '停泊点与路线', '可扩展房间清单'],
  },
];

const WORKSHOP_PIPELINE = [
  ['读取包信息', '识别航点、地点、别名、版本说明和作者备注。'],
  ['本地兼容检查', '检查 id 冲突、缺失父级、重复别名和不安全联动。'],
  ['预览后安装', '先展示地图包内容，确认后再写入玩家扩展配置。'],
  ['可回滚管理', '保留安装记录，后续支持禁用、删除和版本替换。'],
] as const;

const WORKSHOP_PACKAGE_TYPES = [
  '航点包：原创星球、舰船、空间站或异常坐标',
  '地点包：给官方航点补充房间、街区、舱段',
  '叙事包：地图说明、势力概要、世界书索引',
  '资源包：航点图、内部地图背景和展示素材',
];

const WORKSHOP_SCHEMA_FIELDS = [
  ['packageId', '稳定地图包标识，用于识别同一个包的后续版本；再次导入相同 packageId 会更新替换旧包写入内容。'],
  ['sourceKind', '来源类型：local / imported / workshop / system，用于区分本地包、导入包、未来线上工坊包和系统包。'],
  ['id', '唯一标识，只能新增玩家扩展；不能复用内置官方 id。建议以字母开头，只使用字母、数字、下划线和短横线。'],
  ['name / shortName', '显示名称与短名，短名用于首页航点和紧凑列表。'],
  ['kind', '航点支持 train / planet / space_station / ship / fleet / dreamscape / anomaly / fan_world；地点支持 zone / district / room / route / facility / wildland / special。'],
  ['waypointId', '地点所属父级航点。可以填官方航点 id，也可以填同包新增航点 id。'],
  ['parentId', '可选的上级地点 id，只能指向同一航点下的官方地点或同包地点；不存在、跨航点、形成循环或超过四层时会自动清空并提示。'],
  ['position / mapPosition', '百分比坐标，范围 6-94；position 用于首页，mapPosition 用于二层地图，超出范围会被修正并提示。'],
  ['aliases / tags', '用于当前剧情地点匹配和搜索，不会写入主剧情提示词。'],
  ['license / sourceUrl', '地图包授权与来源说明，只用于本地包库展示、搜索和未来工坊兼容。'],
  ['coverAsset', '可选封面资源路径；当前只接受 /assets/ 下的本地资源，外部图片路径会被忽略。'],
  ['description', '玩家可读说明，只在航图面板展示。'],
] as const;

const LOCATION_KIND_LABELS: Record<StarMapLocationKind, string> = {
  zone: '区域',
  district: '街区',
  room: '房间',
  route: '路线',
  facility: '设施',
  wildland: '野外',
  special: '特殊',
};

const LOCATION_KIND_COLORS: Record<StarMapLocationKind, string> = {
  zone: 'rgba(88, 172, 210, 0.86)',
  district: 'rgba(226, 188, 104, 0.9)',
  room: 'rgba(180, 205, 218, 0.86)',
  route: 'rgba(126, 190, 150, 0.86)',
  facility: 'rgba(219, 150, 104, 0.88)',
  wildland: 'rgba(151, 184, 123, 0.86)',
  special: 'rgba(196, 136, 220, 0.86)',
};

const MATCH_REASON_LABELS: Record<NonNullable<ReturnType<typeof findCurrentStarMapLocation>>['reason'], string> = {
  exact: '精确命中',
  alias: '别名命中',
  anchor: '场景锚点',
  path: '完整路径',
  contains: '模糊命中',
};

const SOURCE_LABELS: Record<StarMapSource, string> = {
  official: '官方',
  fan: '玩家',
  workshop: '工坊',
  system: '系统',
};

const PACKAGE_SOURCE_KIND_LABELS: Record<StarMapPackageSourceKind, string> = {
  local: '本地',
  imported: '导入',
  workshop: '工坊',
  system: '系统',
};

interface CurrentMapNavigation {
  view: Extract<StarMapView, 'detail' | 'local' | 'interior'>;
  localRootLocationId: string | null;
  interiorRootLocationId: string | null;
}

function resolveCurrentMapNavigation(
  currentMatch: NonNullable<ReturnType<typeof findCurrentStarMapLocation>>,
  locations: StarMapLocation[],
): CurrentMapNavigation {
  const path = getStarMapLocationPath(currentMatch.location, locations);
  const parent = path.at(-2) ?? null;
  const grandparent = path.at(-3) ?? null;

  if (currentMatch.anchor) {
    if (!parent) {
      return { view: 'local', localRootLocationId: currentMatch.location.id, interiorRootLocationId: null };
    }
    if (currentMatch.location.status === 'locked') {
      return { view: 'local', localRootLocationId: parent.id, interiorRootLocationId: null };
    }
    return { view: 'interior', localRootLocationId: parent.id, interiorRootLocationId: currentMatch.location.id };
  }

  if (grandparent && parent) {
    if (parent.status === 'locked') {
      return { view: 'local', localRootLocationId: grandparent.id, interiorRootLocationId: null };
    }
    return { view: 'interior', localRootLocationId: grandparent.id, interiorRootLocationId: parent.id };
  }
  if (parent) return { view: 'local', localRootLocationId: parent.id, interiorRootLocationId: null };
  return { view: 'detail', localRootLocationId: null, interiorRootLocationId: null };
}

export function StarMapPanel({ worldState, npcRecords, plotNodes, gameSettings, onGameSettingsChange }: StarMapPanelProps) {
  const starMapSettings = gameSettings.星轨航图系统 ?? { customWaypoints: [], customLocations: [], installedPackages: [] };
  const disabledPackageItemIds = useMemo(() => {
    const waypointIds = new Set<string>();
    const locationIds = new Set<string>();
    starMapSettings.installedPackages
      .filter((record) => record.enabled === false)
      .forEach((record) => {
        record.waypointIds.forEach((id) => waypointIds.add(id));
        record.locationIds.forEach((id) => locationIds.add(id));
      });
    return { waypointIds, locationIds };
  }, [starMapSettings.installedPackages]);
  const visibleCustomWaypoints = useMemo(
    () => starMapSettings.customWaypoints.filter((waypoint) => !disabledPackageItemIds.waypointIds.has(waypoint.id)),
    [disabledPackageItemIds, starMapSettings.customWaypoints],
  );
  const visibleCustomLocations = useMemo(
    () => starMapSettings.customLocations.filter((location) => (
      !disabledPackageItemIds.locationIds.has(location.id)
      && !disabledPackageItemIds.waypointIds.has(location.waypointId)
    )),
    [disabledPackageItemIds, starMapSettings.customLocations],
  );
  const allWaypoints = useMemo(
    () => [...STAR_MAP_WAYPOINTS, ...visibleCustomWaypoints],
    [visibleCustomWaypoints],
  );
  const allLocations = useMemo(
    () => [...STAR_MAP_LOCATIONS, ...visibleCustomLocations],
    [visibleCustomLocations],
  );
  const currentLocationText = worldState.当前地点?.trim() || '地点未定';
  const currentMatch = useMemo(
    () => findCurrentStarMapLocation(currentLocationText, allWaypoints, allLocations),
    [allLocations, allWaypoints, currentLocationText],
  );
  const [tab, setTab] = useState<StarMapTab>('map');
  const [view, setView] = useState<StarMapView>('overview');
  const [selectedWaypointId, setSelectedWaypointId] = useState(() => currentMatch?.waypoint.id ?? 'astral_express');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() => currentMatch?.location.id ?? null);
  const [localRootLocationId, setLocalRootLocationId] = useState<string | null>(null);
  const [interiorRootLocationId, setInteriorRootLocationId] = useState<string | null>(null);
  const [selectedSceneAnchorId, setSelectedSceneAnchorId] = useState<string | null>(() => currentMatch?.anchor?.id ?? null);

  useEffect(() => {
    if (!currentMatch) return;
    const waypointLocations = allLocations.filter((location) => location.waypointId === currentMatch.waypoint.id);
    const navigation = resolveCurrentMapNavigation(currentMatch, waypointLocations);
    setSelectedWaypointId(currentMatch.waypoint.id);
    setSelectedLocationId(currentMatch.location.id);
    setSelectedSceneAnchorId(currentMatch.anchor?.id ?? null);
    setLocalRootLocationId(navigation.localRootLocationId);
    setInteriorRootLocationId(navigation.interiorRootLocationId);
  }, [currentLocationText]);

  const selectedWaypoint = allWaypoints.find((item) => item.id === selectedWaypointId) ?? allWaypoints[0];
  const selectedLocations = useMemo(() => allLocations.filter((location) => location.waypointId === selectedWaypoint.id), [allLocations, selectedWaypoint.id]);
  const currentLocationInSelectedWaypoint = currentMatch?.waypoint.id === selectedWaypoint.id ? currentMatch.location : null;
  const selectedLocation = selectedLocations.find((item) => item.id === selectedLocationId) ?? currentLocationInSelectedWaypoint ?? selectedLocations[0] ?? null;
  const selectedLocationParent = selectedLocation?.parentId
    ? selectedLocations.find((item) => item.id === selectedLocation.parentId) ?? null
    : null;
  const localRootLocation = selectedLocations.find((item) => item.id === localRootLocationId)
    ?? (selectedLocationParent && !selectedLocationParent.parentId ? selectedLocationParent : selectedLocation);
  const interiorRootLocation = selectedLocations.find((item) => item.id === interiorRootLocationId) ?? null;

  const updateStarMapSettings = (updater: (current: 星轨航图系统设置) => 星轨航图系统设置) => {
    onGameSettingsChange((prev) => {
      const current = prev.星轨航图系统 ?? { customWaypoints: [], customLocations: [], installedPackages: [] };
      const nextSystem = updater(current);
      const next = { ...prev, 星轨航图系统: nextSystem };
      void setPreference('gameSettings', next);
      return next;
    });
  };

  const openWaypoint = (waypoint: StarMapWaypoint) => {
    setSelectedWaypointId(waypoint.id);
    const locations = allLocations.filter((location) => location.waypointId === waypoint.id);
    setSelectedLocationId(currentMatch?.waypoint.id === waypoint.id ? currentMatch.location.id : locations[0]?.id ?? null);
    setSelectedSceneAnchorId(currentMatch?.waypoint.id === waypoint.id ? currentMatch.anchor?.id ?? null : null);
  };

  const focusCurrentLocation = () => {
    if (!currentMatch) return;
    const waypointLocations = allLocations.filter((location) => location.waypointId === currentMatch.waypoint.id);
    const navigation = resolveCurrentMapNavigation(currentMatch, waypointLocations);
    setTab('map');
    setSelectedWaypointId(currentMatch.waypoint.id);
    setSelectedLocationId(currentMatch.location.id);
    setSelectedSceneAnchorId(currentMatch.anchor?.id ?? null);
    setLocalRootLocationId(navigation.localRootLocationId);
    setInteriorRootLocationId(navigation.interiorRootLocationId);
    setView(navigation.view);
  };

  const openUnregisteredInbox = () => {
    setTab('fan');
  };

  const addCustomLocation = (input: { name: string; waypointId: string; parentId?: string; kind: StarMapLocationKind; navigationMode?: StarMapNavigationMode; description: string; tags?: string[] }) => {
    const name = input.name.trim();
    if (!name) return;
    const sameName = allLocations.some((location) => location.name === name && location.waypointId === input.waypointId);
    if (sameName) return;
    const requestedParent = allLocations.find((location) => location.id === input.parentId && location.waypointId === input.waypointId);
    const parentId = requestedParent && (
      requestedParent.source !== 'official'
        ? getStarMapLocationDepth(requestedParent, allLocations) < STAR_MAP_MAX_LOCATION_DEPTH && requestedParent.navigationMode === 'interior'
        : canStarMapLocationAcceptPlayerChildren(requestedParent, allLocations)
    ) ? requestedParent.id : undefined;
    const siblingCount = allLocations.filter((location) => location.waypointId === input.waypointId).length;
    const customLocation: StarMapLocation = {
      id: `custom_location_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      waypointId: input.waypointId,
      parentId,
      name,
      kind: input.kind,
      source: 'fan',
      status: 'known',
      aliases: [name],
      description: input.description.trim() || '玩家从剧情地点收纳的扩展地点。',
      tags: input.tags?.length ? input.tags : ['玩家扩展'],
      mapPosition: {
        x: 24 + ((siblingCount * 17) % 54),
        y: 28 + ((siblingCount * 13) % 44),
      },
      navigationMode: input.navigationMode === 'interior' ? 'interior' : 'terminal',
      allowsPlayerChildren: input.navigationMode === 'interior',
      sceneAnchors: [],
    };
    updateStarMapSettings((current) => ({
      ...current,
      customLocations: [...current.customLocations, customLocation],
    }));
    setSelectedWaypointId(input.waypointId);
    setSelectedLocationId(customLocation.id);
    setView('detail');
  };

  const addCustomWaypoint = (input: { name: string; shortName: string; kind: StarMapWaypointKind; description: string; tags?: string[] }) => {
    const name = input.name.trim();
    if (!name) return;
    const sameName = allWaypoints.some((waypoint) => waypoint.name === name || waypoint.shortName === name);
    if (sameName) return;
    const customCount = starMapSettings.customWaypoints.length;
    const customWaypoint: StarMapWaypoint = {
      id: `custom_waypoint_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      shortName: input.shortName.trim() || name.slice(0, 6),
      kind: input.kind,
      source: 'fan',
      status: 'draft',
      description: input.description.trim() || `${name} 是玩家创建的同人航点，当前只保存为星轨航图坐标。`,
      tags: input.tags?.length ? input.tags : ['玩家航点', KIND_LABELS[input.kind]],
      position: {
        x: 58 + ((customCount * 11) % 32),
        y: 18 + ((customCount * 17) % 58),
      },
    };
    updateStarMapSettings((current) => ({
      ...current,
      customWaypoints: [...current.customWaypoints, customWaypoint],
    }));
    setSelectedWaypointId(customWaypoint.id);
    setSelectedLocationId(null);
    setView('overview');
  };

  const deleteCustomLocation = (locationId: string) => {
    updateStarMapSettings((current) => ({
      ...current,
      customLocations: current.customLocations.filter((location) => location.id !== locationId),
    }));
    if (selectedLocationId === locationId) {
      setSelectedLocationId(null);
    }
  };

  const patchCustomLocation = (locationId: string, patch: Partial<StarMapLocation>) => {
    updateStarMapSettings((current) => {
      const combinedLocations = [...STAR_MAP_LOCATIONS, ...current.customLocations];
      const requestedParent = patch.parentId
        ? combinedLocations.find((location) => location.id === patch.parentId)
        : null;
      const safePatch = patch.parentId && (!requestedParent || getStarMapLocationDepth(requestedParent, combinedLocations) >= STAR_MAP_MAX_LOCATION_DEPTH)
        ? { ...patch, parentId: undefined }
        : patch;
      return {
        ...current,
        customLocations: current.customLocations.map((location) => (
          location.id === locationId
            ? {
                ...location,
                ...safePatch,
                name: safePatch.name?.trim() || location.name,
                aliases: safePatch.name ? Array.from(new Set([safePatch.name.trim(), ...location.aliases])).filter(Boolean) : location.aliases,
                tags: safePatch.tags?.length ? safePatch.tags : location.tags,
                mapPosition: safePatch.mapPosition ?? location.mapPosition,
              }
            : location
        )),
      };
    });
  };

  const deleteCustomWaypoint = (waypointId: string) => {
    updateStarMapSettings((current) => ({
      ...current,
      customWaypoints: current.customWaypoints.filter((waypoint) => waypoint.id !== waypointId),
      customLocations: current.customLocations.filter((location) => location.waypointId !== waypointId),
    }));
    if (selectedWaypointId === waypointId) {
      setSelectedWaypointId('fan_signal');
      setSelectedLocationId(null);
      setView('overview');
    }
  };

  const patchCustomWaypoint = (waypointId: string, patch: Partial<StarMapWaypoint>) => {
    updateStarMapSettings((current) => ({
      ...current,
      customWaypoints: current.customWaypoints.map((waypoint) => (
        waypoint.id === waypointId
          ? {
              ...waypoint,
              ...patch,
              name: patch.name?.trim() || waypoint.name,
              shortName: patch.shortName?.trim() || waypoint.shortName,
              tags: patch.tags?.length ? patch.tags : waypoint.tags,
              position: patch.position ?? waypoint.position,
            }
          : waypoint
      )),
    }));
  };

  const installMapPackage = (draft: StarMapPackageDraft) => {
    if (draft.waypoints.length === 0 && draft.locations.length === 0) return;
    updateStarMapSettings((current) => {
      const existingRecords = current.installedPackages.filter((record) => record.packageId === draft.packageId);
      const existingRecord = existingRecords[0];
      const oldWaypointIds = new Set(existingRecords.flatMap((record) => record.waypointIds));
      const oldLocationIds = new Set(existingRecords.flatMap((record) => record.locationIds));
      const baseWaypoints = existingRecords.length > 0
        ? current.customWaypoints.filter((waypoint) => !oldWaypointIds.has(waypoint.id))
        : current.customWaypoints;
      const baseLocations = existingRecords.length > 0
        ? current.customLocations.filter((location) => !oldLocationIds.has(location.id) && !oldWaypointIds.has(location.waypointId))
        : current.customLocations;
      const installPlan = buildPackageInstallPlan(draft, baseWaypoints, baseLocations);
      const nextWaypoints = installPlan.installWaypoints;
      const nextLocations = installPlan.installLocations;
      if (nextWaypoints.length === 0 && nextLocations.length === 0) return current;
      const nextPackageRecord: 星轨航图地图包记录 = {
        id: existingRecord?.id ?? `star_map_package_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        packageId: draft.packageId,
        name: draft.name,
        version: draft.version,
        author: draft.author,
        sourceKind: draft.sourceKind,
        license: draft.license,
        sourceUrl: draft.sourceUrl,
        coverAsset: draft.coverAsset,
        tags: draft.tags,
        installedAt: new Date().toISOString(),
        enabled: existingRecord?.enabled ?? true,
        waypointIds: nextWaypoints.map((waypoint) => waypoint.id),
        locationIds: nextLocations.map((location) => location.id),
      };
      return {
        ...current,
        customWaypoints: [...baseWaypoints, ...nextWaypoints],
        customLocations: [...baseLocations, ...nextLocations],
        installedPackages: [
          ...current.installedPackages.filter((record) => record.packageId !== draft.packageId),
          nextPackageRecord,
        ],
      };
    });
  };

  const toggleMapPackageEnabled = (packageId: string) => {
    updateStarMapSettings((current) => ({
      ...current,
      installedPackages: current.installedPackages.map((record) => (
        record.id === packageId ? { ...record, enabled: record.enabled === false } : record
      )),
    }));
  };

  const uninstallMapPackage = (packageId: string) => {
    updateStarMapSettings((current) => {
      const record = current.installedPackages.find((item) => item.id === packageId);
      if (!record) return current;
      const waypointIds = new Set(record.waypointIds);
      const locationIds = new Set(record.locationIds);
      const protectedWaypointIds = new Set(
        current.customLocations
          .filter((location) => waypointIds.has(location.waypointId) && !locationIds.has(location.id))
          .map((location) => location.waypointId),
      );
      return {
        ...current,
        customWaypoints: current.customWaypoints.filter((waypoint) => !waypointIds.has(waypoint.id) || protectedWaypointIds.has(waypoint.id)),
        customLocations: current.customLocations.filter((location) => !locationIds.has(location.id)),
        installedPackages: current.installedPackages.filter((item) => item.id !== packageId),
      };
    });
    setSelectedWaypointId('fan_signal');
    setSelectedLocationId(null);
    setView('overview');
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden" style={{ color: 'rgb(var(--tj-text-primary))' }}>
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 18% 15%, rgba(var(--tj-tech-cyan), 0.16), transparent 27%), radial-gradient(circle at 78% 22%, rgba(var(--tj-amber-soft), 0.13), transparent 24%), linear-gradient(rgba(var(--tj-tech-cyan), 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.035) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 24px 24px, 24px 24px',
          maskImage: 'linear-gradient(180deg, rgba(var(--tj-bg-primary),0.98), rgba(var(--tj-bg-primary),0.28))',
        }}
      />

      <div className="relative mb-3" style={{ clipPath: panelClip }}>
        <div
          className="grid gap-2 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-surface-strong), 0.92), rgba(var(--tj-bubble), 0.84))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
          }}
        >
          <div className="grid min-w-0 grid-cols-3 gap-2">
            <TabButton active={tab === 'map'} label="地图" code="MAP" onClick={() => setTab('map')} />
            <TabButton active={tab === 'fan'} label="同人航点" code="FAN" onClick={() => setTab('fan')} />
            <TabButton active={tab === 'workshop'} label="创意工坊" code="LAB" onClick={() => setTab('workshop')} />
          </div>
          <button
            type="button"
            onClick={currentMatch ? focusCurrentLocation : openUnregisteredInbox}
            className="min-h-[48px] px-4 py-2 text-left transition-all hover:brightness-110 lg:min-w-[190px]"
            style={{
              clipPath: chipClip,
              background: currentMatch
                ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.18), rgba(var(--tj-amber-soft), 0.1))'
                : 'rgba(var(--tj-surface-strong), 0.62)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
              color: currentMatch ? 'rgba(var(--tj-text-primary), 0.92)' : 'rgba(var(--tj-text-secondary), 0.78)',
            }}
          >
            <span className="block font-serif text-[12px] font-bold tracking-[0.16em]">
              {currentMatch ? '定位当前坐标' : '收纳未登记地点'}
            </span>
            <span className="mt-0.5 block truncate text-[10px] tracking-[0.08em]" style={{ color: currentMatch ? 'rgba(var(--tj-tech-cyan-deep), 0.9)' : 'rgba(var(--tj-amber-soft), 0.82)' }}>
              {currentMatch ? `${currentMatch.waypoint.name} / ${currentMatch.location.name}` : currentLocationText}
            </span>
          </button>
        </div>
      </div>

      {tab === 'map' ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {view === 'overview' ? (
            <OverviewMap
              currentMatch={currentMatch}
              selectedWaypoint={selectedWaypoint}
              waypoints={allWaypoints}
              locations={allLocations}
              onSelect={openWaypoint}
              onEnterDetail={() => setView('detail')}
            />
          ) : view === 'detail' ? (
            <DetailMap
              currentMatch={currentMatch}
              currentLocationText={currentLocationText}
              waypoint={selectedWaypoint}
              locations={selectedLocations}
              selectedLocation={selectedLocation}
              onBack={() => setView('overview')}
              onEnterLocalMap={(rootLocation) => {
                setLocalRootLocationId(rootLocation.id);
                setInteriorRootLocationId(null);
                setSelectedLocationId(rootLocation.id);
                setSelectedSceneAnchorId(rootLocation.sceneAnchors?.[0]?.id ?? null);
                setView('local');
              }}
              onSelectLocation={(location) => setSelectedLocationId(location.id)}
              onDeleteCustomLocation={deleteCustomLocation}
              onPatchCustomLocation={patchCustomLocation}
            />
          ) : view === 'local' ? (
            <LocalMap
              currentMatch={currentMatch}
              waypoint={selectedWaypoint}
              locations={selectedLocations}
              rootLocation={localRootLocation}
              selectedLocation={selectedLocation}
              selectedAnchorId={selectedSceneAnchorId}
              npcRecords={npcRecords}
              plotNodes={plotNodes}
              onOpenOverview={() => {
                setLocalRootLocationId(null);
                setInteriorRootLocationId(null);
                setSelectedSceneAnchorId(null);
                setView('overview');
              }}
              onOpenDetail={() => {
                setLocalRootLocationId(null);
                setInteriorRootLocationId(null);
                setSelectedSceneAnchorId(null);
                setView('detail');
              }}
              onEnterInteriorMap={(location) => {
                setInteriorRootLocationId(location.id);
                setSelectedLocationId(location.id);
                setSelectedSceneAnchorId(location.sceneAnchors?.[0]?.id ?? null);
                setView('interior');
              }}
              onSelectLocation={(location) => setSelectedLocationId(location.id)}
              onSelectAnchor={setSelectedSceneAnchorId}
            />
          ) : (
            <InteriorMap
              currentMatch={currentMatch}
              waypoint={selectedWaypoint}
              locations={selectedLocations}
              rootLocation={interiorRootLocation}
              selectedAnchorId={selectedSceneAnchorId}
              npcRecords={npcRecords}
              plotNodes={plotNodes}
              onOpenOverview={() => {
                setLocalRootLocationId(null);
                setInteriorRootLocationId(null);
                setSelectedSceneAnchorId(null);
                setView('overview');
              }}
              onOpenDetail={() => {
                const parentLocation = interiorRootLocation?.parentId
                  ? selectedLocations.find((location) => location.id === interiorRootLocation.parentId) ?? null
                  : null;
                setSelectedLocationId(parentLocation?.id ?? interiorRootLocation?.id ?? null);
                setLocalRootLocationId(null);
                setInteriorRootLocationId(null);
                setSelectedSceneAnchorId(null);
                setView('detail');
              }}
              onBack={() => {
                if (interiorRootLocation) setSelectedLocationId(interiorRootLocation.id);
                setInteriorRootLocationId(null);
                setSelectedSceneAnchorId(null);
                setView('local');
              }}
              onSelectAnchor={setSelectedSceneAnchorId}
            />
          )}
        </div>
      ) : tab === 'fan' ? (
        <FanWaypointsPanel
          currentLocationText={currentLocationText}
          currentMatch={currentMatch}
          waypoints={allWaypoints}
          locations={allLocations}
          customLocations={starMapSettings.customLocations}
          customWaypoints={starMapSettings.customWaypoints}
          selectedWaypointId={selectedWaypoint.id}
          onSelectWaypoint={setSelectedWaypointId}
          onAddLocation={addCustomLocation}
          onAddWaypoint={addCustomWaypoint}
          onDeleteCustomLocation={deleteCustomLocation}
          onDeleteCustomWaypoint={deleteCustomWaypoint}
          onPatchCustomWaypoint={patchCustomWaypoint}
        />
      ) : (
        <WorkshopHarborPanel
          customWaypoints={starMapSettings.customWaypoints}
          customLocations={starMapSettings.customLocations}
          installedPackages={starMapSettings.installedPackages}
          onInstallPackage={installMapPackage}
          onTogglePackageEnabled={toggleMapPackageEnabled}
          onUninstallPackage={uninstallMapPackage}
        />
      )}
    </div>
  );
}

function TabButton({ active, label, code, onClick }: { active: boolean; label: string; code: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 px-3 py-2 text-left transition-all"
      style={{
        clipPath: chipClip,
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.2), rgba(var(--tj-tech-cyan), 0.14))'
          : 'linear-gradient(135deg, rgba(var(--tj-surface-strong), 0.96), rgba(var(--tj-bubble), 0.82))',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.48), 0 0 18px rgba(var(--tj-accent-primary), 0.08)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)',
      }}
    >
      <div className="truncate font-serif text-[13px] font-bold tracking-[0.14em]">{label}</div>
      <div className="mt-0.5 text-[10px] tracking-[0.18em]" style={{ color: active ? 'rgb(var(--tj-amber-deep))' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {code}
      </div>
    </button>
  );
}

function OverviewMap({
  currentMatch,
  selectedWaypoint,
  waypoints,
  locations,
  onSelect,
  onEnterDetail,
}: {
  currentMatch: ReturnType<typeof findCurrentStarMapLocation>;
  selectedWaypoint: StarMapWaypoint;
  waypoints: StarMapWaypoint[];
  locations: StarMapLocation[];
  onSelect: (waypoint: StarMapWaypoint) => void;
  onEnterDetail: () => void;
}) {
  const selectedLocations = locations.filter((location) => location.waypointId === selectedWaypoint.id);
  const [sourceFilter, setSourceFilter] = useState<StarMapSource | 'all'>('all');
  const [chartPage, setChartPage] = useState(0);
  const waypointSourceCounts = useMemo(() => {
    const counts = new Map<StarMapSource, number>();
    waypoints.forEach((waypoint) => counts.set(waypoint.source, (counts.get(waypoint.source) ?? 0) + 1));
    return Array.from(counts.entries()).sort(([left], [right]) => SOURCE_LABELS[left].localeCompare(SOURCE_LABELS[right], 'zh-CN'));
  }, [waypoints]);
  const filteredOverviewWaypoints = useMemo(
    () => sourceFilter === 'all' ? waypoints : waypoints.filter((waypoint) => waypoint.source === sourceFilter),
    [sourceFilter, waypoints],
  );
  const chartTrackWidth = Math.max(100, 16 + filteredOverviewWaypoints.length * 18);
  const maxChartPage = Math.max(0, Math.ceil(chartTrackWidth / 92) - 1);
  const chartPageOffset = Math.min(chartPage, maxChartPage) * 82;
  const railWaypoints = useMemo(
    () => filteredOverviewWaypoints.map((waypoint, index) => ({
      waypoint,
      position: {
        x: 9 + index * 18,
        y: [38, 63, 31, 55, 72, 43][index % 6],
      },
    })),
    [filteredOverviewWaypoints],
  );
  const selectedWaypointVisible = filteredOverviewWaypoints.some((waypoint) => waypoint.id === selectedWaypoint.id);

  useEffect(() => {
    if (chartPage > maxChartPage) setChartPage(maxChartPage);
  }, [chartPage, maxChartPage]);

  return (
    <div className="grid h-full min-h-0 w-full gap-3 overflow-y-auto lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.34fr)] xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.36fr)]">
      <div
        className="relative min-h-[430px] overflow-hidden"
        style={{
          clipPath: shellClip,
          backgroundImage:
            'linear-gradient(180deg, rgba(4, 9, 22, 0.34), rgba(4, 9, 22, 0.5)), radial-gradient(circle at 50% 52%, transparent 0 48%, rgba(0,0,0,0.26) 100%), url(/assets/star-map/star-map-background-tile.png)',
          backgroundSize: 'auto, auto, 920px 450px',
          backgroundPosition: 'center, center, center',
          backgroundRepeat: 'repeat',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.2), inset 0 0 64px rgba(0,0,0,0.5)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[rgba(1,5,15,0.12)]" />
        <div
          className="absolute inset-y-0 top-0 transition-[left] duration-500 ease-out"
          style={{ left: `-${chartPageOffset}%`, width: `${chartTrackWidth}%` }}
        >
          {railWaypoints.map(({ waypoint, position }) => (
            <WaypointOrb
              key={waypoint.id}
              waypoint={waypoint}
              position={position}
              sizeScale={1.55}
              selected={selectedWaypoint.id === waypoint.id}
              current={currentMatch?.waypoint.id === waypoint.id}
              onSelect={() => onSelect(waypoint)}
            />
          ))}
        </div>

        <div className="absolute left-4 top-4 flex max-w-[66%] flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => { setSourceFilter('all'); setChartPage(0); }}
            className="px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] transition-all hover:brightness-110"
            style={{ clipPath: chipClip, background: sourceFilter === 'all' ? 'rgba(var(--tj-amber-soft), 0.24)' : 'rgba(4, 11, 26, 0.64)', color: 'rgba(255,255,255,0.9)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
          >
            全部 {waypoints.length}
          </button>
          {waypointSourceCounts.map(([source, count]) => (
            <button
              key={source}
              type="button"
              onClick={() => { setSourceFilter(source); setChartPage(0); }}
              className="px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] transition-all hover:brightness-110"
              style={{ clipPath: chipClip, background: sourceFilter === source ? 'rgba(var(--tj-tech-cyan), 0.24)' : 'rgba(4, 11, 26, 0.64)', color: 'rgba(255,255,255,0.9)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
            >
              {SOURCE_LABELS[source]} {count}
            </button>
          ))}
        </div>

        {maxChartPage > 0 && (
          <>
            <button
              type="button"
              onClick={() => setChartPage((page) => Math.max(0, page - 1))}
              disabled={chartPage <= 0}
              className="absolute left-3 top-1/2 z-10 flex h-12 w-8 -translate-y-1/2 items-center justify-center text-lg transition-all hover:brightness-125 disabled:opacity-25"
              style={{ clipPath: chipClip, background: 'rgba(4, 11, 26, 0.62)', color: 'rgba(var(--tj-amber-soft), 0.95)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.28)' }}
              aria-label="向左浏览航图"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setChartPage((page) => Math.min(maxChartPage, page + 1))}
              disabled={chartPage >= maxChartPage}
              className="absolute right-3 top-1/2 z-10 flex h-12 w-8 -translate-y-1/2 items-center justify-center text-lg transition-all hover:brightness-125 disabled:opacity-25"
              style={{ clipPath: chipClip, background: 'rgba(4, 11, 26, 0.62)', color: 'rgba(var(--tj-amber-soft), 0.95)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.28)' }}
              aria-label="向右浏览航图"
            >
              ›
            </button>
          </>
        )}
        {filteredOverviewWaypoints.length === 0 && (
          <div className="absolute left-1/2 top-1/2 w-[min(320px,78%)] -translate-x-1/2 -translate-y-1/2 px-4 py-3 text-center text-[12px] leading-relaxed" style={{ clipPath: panelClip, background: 'rgba(4, 11, 26, 0.72)', color: 'rgba(255,255,255,0.78)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}>
            当前来源筛选下暂无航点。
          </div>
        )}
        {!selectedWaypointVisible && filteredOverviewWaypoints.length > 0 && (
          <div className="absolute bottom-4 left-4 max-w-[360px] px-3 py-2 text-[12px] leading-relaxed" style={{ clipPath: panelClip, background: 'rgba(4, 11, 26, 0.78)', color: 'rgba(255,255,255,0.82)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.24)' }}>
            当前选中航点已被来源筛选隐藏。
            <button type="button" onClick={() => setSourceFilter('all')} className="ml-2 font-bold" style={{ color: 'rgb(var(--tj-amber-deep))' }}>显示全部航点</button>
          </div>
        )}
      </div>

      <aside className="min-h-0 w-full overflow-y-visible pr-1 lg:h-full lg:overflow-y-auto">
        <div className="space-y-3">
          <InfoPanel title={selectedWaypoint.name} code={KIND_LABELS[selectedWaypoint.kind]}>
            {!selectedWaypointVisible && (
              <div className="mb-3 px-3 py-2 text-[12px] leading-relaxed" style={{ clipPath: chipClip, background: 'rgba(var(--tj-amber-soft), 0.12)', color: 'rgba(var(--tj-text-primary), 0.84)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.22)' }}>
                该航点暂未显示在当前筛选结果中。
              </div>
            )}
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>{selectedWaypoint.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <MiniTag>{SOURCE_LABELS[selectedWaypoint.source]}</MiniTag>
              {selectedWaypoint.tags.map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
            </div>
            <button
              type="button"
              onClick={onEnterDetail}
              disabled={selectedLocations.length === 0}
              className="mt-4 w-full px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                clipPath: chipClip,
                background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.22), rgba(var(--tj-tech-cyan), 0.12))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.38)',
              }}
            >
              进入内部地图
            </button>
          </InfoPanel>
          <InfoPanel title="当前定位" code={currentMatch ? 'LOCKED' : 'OPEN'}>
            {currentMatch ? (
              <div className="space-y-1 text-[12px]" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
                <div>{currentMatch.waypoint.name}</div>
                <div className="font-serif text-[15px] font-bold" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>{currentMatch.location.name}</div>
                <div style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>匹配方式：{currentMatch.reason}</div>
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                当前地点还没有登记到航图。后续会进入“未登记地点收件箱”，玩家可以决定归属到原著航点或同人航点。
              </p>
            )}
          </InfoPanel>
          <InfoPanel title="地点概览" code="LOCUS">
            <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
              <span>当前航点地点</span>
              <span className="font-bold" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>{selectedLocations.length}</span>
            </div>
            {selectedLocations.length > 0 ? (
              <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {selectedLocations.map((location) => {
                  const current = currentMatch?.waypoint.id === selectedWaypoint.id
                    && getStarMapLocationPath(currentMatch.location, selectedLocations).some((item) => item.id === location.id);
                  return (
                    <div
                      key={location.id}
                      className="px-2.5 py-2 text-[11px] leading-relaxed"
                      style={{
                        clipPath: chipClip,
                        background: current ? 'rgba(var(--tj-tech-cyan), 0.12)' : 'rgba(var(--tj-surface-strong), 0.58)',
                        color: 'rgba(var(--tj-text-primary), 0.86)',
                        boxShadow: current ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.24)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-bold tracking-[0.08em]">{location.name}</span>
                        {current && <span className="shrink-0 text-[10px] font-bold" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>当前</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <MiniTag>{LOCATION_KIND_LABELS[location.kind]}</MiniTag>
                        <MiniTag>{SOURCE_LABELS[location.source]}</MiniTag>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                当前航点还没有登记地点。后续可以在同人航点页添加玩家扩展地点。
              </p>
            )}
          </InfoPanel>
        </div>
      </aside>
    </div>
  );
}

function WaypointOrb({
  waypoint,
  position,
  sizeScale = 1,
  selected,
  current,
  onSelect,
}: {
  waypoint: StarMapWaypoint;
  position?: { x: number; y: number };
  sizeScale?: number;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const visual = WAYPOINT_VISUALS[waypoint.kind];
  const size = Math.round(visual.size * sizeScale);
  const resolvedPosition = position ?? waypoint.position;
  const disabled = waypoint.status === 'locked';
  const round = ROUND_WAYPOINT_KINDS.has(waypoint.kind);
  const usesImageAsset = Boolean(waypoint.imageAsset);
  const vehicle = VEHICLE_WAYPOINT_KINDS.has(waypoint.kind);
  const coreShape = getWaypointCoreShape(waypoint.kind, size);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
      style={{ left: `${resolvedPosition.x}%`, top: `${resolvedPosition.y}%` }}
    >
      <span
        className="relative block transition-transform duration-300 group-hover:scale-105"
        style={{
          width: size + 32,
          height: size + 32,
          opacity: disabled ? 0.62 : 1,
          transform: selected || current ? 'scale(1.06)' : undefined,
        }}
      >
        <span
          className="absolute inset-0 rounded-full opacity-80 blur-xl transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(circle, ${visual.aura}, transparent 68%)`,
          }}
        />
        <span
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: size + 16,
            height: size + 16,
            marginLeft: -(size + 16) / 2,
            marginTop: -(size + 16) / 2,
            border: `1px solid ${visual.ring}`,
            boxShadow: current
              ? `0 0 26px ${visual.aura}, inset 0 0 20px rgba(255,255,255,0.08)`
              : selected
                ? `0 0 22px ${visual.ring}, inset 0 0 16px rgba(255,255,255,0.06)`
                : 'inset 0 0 14px rgba(255,255,255,0.045)',
          }}
        />
        {usesImageAsset ? (
          <img
            src={waypoint.imageAsset}
            alt=""
            className="pointer-events-none absolute left-1/2 top-1/2 block select-none object-contain"
            style={{
              width: size + 34,
              height: size + 34,
              marginLeft: -(size + 34) / 2,
              marginTop: -(size + 34) / 2,
              transform: waypoint.id === 'herta_space_station' ? 'rotate(42deg)' : undefined,
              filter: disabled
                ? 'saturate(0.62) brightness(0.78) drop-shadow(0 14px 22px rgba(0,0,0,0.34))'
                : 'drop-shadow(0 16px 26px rgba(0,0,0,0.36))',
            }}
            draggable={false}
          />
        ) : (
          <span
            className="absolute left-1/2 top-1/2"
            style={{
              ...coreShape,
              background: visual.core,
              boxShadow:
                'inset -18px -18px 28px rgba(0,0,0,0.42), inset 10px 10px 18px rgba(255,255,255,0.18), 0 18px 34px rgba(0,0,0,0.32)',
            }}
          >
            <WaypointSurface kind={waypoint.kind} ringColor={visual.ring} />
            <span
              className="absolute left-[18%] top-[14%] h-[24%] w-[28%] rounded-full opacity-80 blur-[1px]"
              style={{ background: 'rgba(255,255,255,0.58)' }}
            />
            <span
              className="absolute bottom-[18%] right-[16%] font-serif text-[10px] font-bold tracking-[0.12em]"
              style={{ color: 'rgba(255,255,255,0.72)', textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}
            >
              {visual.mark}
            </span>
          </span>
        )}
        {round && waypoint.kind !== 'fan_world' && !usesImageAsset && (
          <span
            className="absolute left-1/2 top-1/2 h-4 -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] rounded-full border border-transparent"
            style={{
              width: size + 38,
              borderTopColor: visual.ring,
              borderBottomColor: 'rgba(255,255,255,0.08)',
              boxShadow: `0 0 14px ${visual.aura}`,
            }}
          />
        )}
        {(waypoint.kind === 'space_station' || waypoint.kind === 'workshop') && (
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{
              width: size + 22,
              height: size + 22,
              border: `1px solid ${visual.ring}`,
              clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
              opacity: 0.72,
            }}
          />
        )}
        {vehicle && (
          <span
            className="absolute left-1/2 top-1/2 h-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: size + 34,
              borderTop: `1px solid ${visual.ring}`,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              transform: 'translate(-50%, -50%) rotate(-22deg)',
            }}
          />
        )}
        {waypoint.kind === 'train' && <VehicleWindows size={size} ringColor={visual.ring} />}
        {(waypoint.kind === 'ship' || waypoint.kind === 'fleet') && <ShipFins size={size} ringColor={visual.ring} />}
        {(selected || current) && (
          <span
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: size + 26,
              height: size + 26,
              marginLeft: -(size + 26) / 2,
              marginTop: -(size + 26) / 2,
              border: `1px solid ${current ? 'rgba(var(--tj-tech-cyan), 0.78)' : 'rgba(var(--tj-accent-primary), 0.72)'}`,
              boxShadow: current ? '0 0 20px rgba(var(--tj-tech-cyan), 0.42)' : '0 0 20px rgba(var(--tj-accent-primary), 0.34)',
            }}
          />
        )}
      </span>
      <span
        className="max-w-[118px] truncate px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] transition-all"
        style={{
          clipPath: chipClip,
          background: current
            ? 'rgba(23, 70, 89, 0.84)'
            : selected
              ? 'rgba(73, 55, 26, 0.82)'
              : 'rgba(4, 11, 26, 0.74)',
          color: current ? 'rgb(var(--tj-tech-cyan))' : 'rgba(255,255,255,0.88)',
          boxShadow: current || selected ? '0 0 14px rgba(255,255,255,0.08)' : undefined,
        }}
      >
        {waypoint.shortName}
      </span>
      <span
        className="px-2 py-0.5 text-[10px] font-bold tracking-[0.14em]"
        style={{
          clipPath: chipClip,
          background: 'rgba(4, 11, 26, 0.58)',
          color: disabled ? 'rgba(255,255,255,0.48)' : 'rgba(var(--tj-amber-soft), 0.88)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {KIND_LABELS[waypoint.kind]}
      </span>
    </button>
  );
}

function getWaypointCoreShape(kind: StarMapWaypointKind, size: number): CSSProperties {
  if (kind === 'train') {
    return {
      width: size + 22,
      height: Math.round(size * 0.52),
      marginLeft: -(size + 22) / 2,
      marginTop: -Math.round(size * 0.52) / 2,
      borderRadius: 999,
      clipPath: 'polygon(10% 12%, 74% 12%, 94% 50%, 74% 88%, 10% 88%, 2% 50%)',
    };
  }

  if (kind === 'ship' || kind === 'fleet') {
    return {
      width: size + 18,
      height: Math.round(size * 0.6),
      marginLeft: -(size + 18) / 2,
      marginTop: -Math.round(size * 0.6) / 2,
      borderRadius: 18,
      clipPath: 'polygon(6% 50%, 26% 16%, 72% 10%, 98% 50%, 72% 90%, 26% 84%)',
    };
  }

  if (kind === 'space_station') {
    return {
      width: size * 0.82,
      height: size * 0.82,
      marginLeft: -(size * 0.82) / 2,
      marginTop: -(size * 0.82) / 2,
      borderRadius: 16,
      transform: 'rotate(45deg)',
      clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    };
  }

  if (kind === 'workshop') {
    return {
      width: size * 0.9,
      height: size * 0.9,
      marginLeft: -(size * 0.9) / 2,
      marginTop: -(size * 0.9) / 2,
      borderRadius: 14,
      clipPath: 'polygon(50% 0, 92% 24%, 92% 76%, 50% 100%, 8% 76%, 8% 24%)',
    };
  }

  return {
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    borderRadius: 999,
  };
}

function VehicleWindows({ size, ringColor }: { size: number; ringColor: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1"
      style={{ transform: 'translate(-50%, -50%) rotate(-1deg)' }}
    >
      {[0, 1, 2, 3].map((item) => (
        <span
          key={item}
          className="block rounded-sm"
          style={{ width: size * 0.09, height: size * 0.12, background: 'rgba(255,255,255,0.26)', boxShadow: `0 0 6px ${ringColor}` }}
        />
      ))}
    </span>
  );
}

function ShipFins({ size, ringColor }: { size: number; ringColor: string }) {
  return (
    <>
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2"
        style={{ width: size + 44, background: `linear-gradient(90deg, transparent, ${ringColor}, transparent)`, transform: 'translate(-50%, -50%) rotate(-18deg)' }}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2"
        style={{ width: size + 30, background: 'rgba(255,255,255,0.16)', transform: 'translate(-50%, -50%) rotate(18deg)' }}
      />
    </>
  );
}

function WaypointSurface({ kind, ringColor }: { kind: StarMapWaypointKind; ringColor: string }) {
  const commonLine: CSSProperties = {
    position: 'absolute',
    left: '18%',
    right: '18%',
    height: 1,
    background: 'rgba(255,255,255,0.18)',
    boxShadow: `0 0 8px ${ringColor}`,
  };

  if (kind === 'space_station' || kind === 'workshop') {
    return (
      <>
        <span className="absolute left-[21%] top-[21%] h-[58%] w-[58%] rotate-45 border border-white/20" />
        <span className="absolute left-[43%] top-[10%] h-[80%] w-[14%] rounded-full bg-white/10" />
        <span className="absolute left-[10%] top-[43%] h-[14%] w-[80%] rounded-full bg-white/10" />
      </>
    );
  }

  if (kind === 'train' || kind === 'ship' || kind === 'fleet') {
    return (
      <>
        <span className="absolute left-[19%] top-[39%] h-[22%] w-[62%] rounded-full bg-white/16" />
        <span className="absolute left-[30%] top-[33%] h-[34%] w-[10%] rounded-full bg-white/18" />
        <span className="absolute left-[58%] top-[33%] h-[34%] w-[10%] rounded-full bg-white/18" />
      </>
    );
  }

  return (
    <>
      <span style={{ ...commonLine, top: '33%', transform: 'rotate(-12deg)' }} />
      <span style={{ ...commonLine, top: '51%', transform: 'rotate(8deg)', opacity: 0.72 }} />
      <span style={{ ...commonLine, top: '67%', transform: 'rotate(-7deg)', opacity: 0.48 }} />
    </>
  );
}

function DetailMap({
  currentMatch,
  currentLocationText,
  waypoint,
  locations,
  selectedLocation,
  onBack,
  onEnterLocalMap,
  onSelectLocation,
  onDeleteCustomLocation,
  onPatchCustomLocation,
}: {
  currentMatch: ReturnType<typeof findCurrentStarMapLocation>;
  currentLocationText: string;
  waypoint: StarMapWaypoint;
  locations: StarMapLocation[];
  selectedLocation: StarMapLocation | null;
  onBack: () => void;
  onEnterLocalMap: (rootLocation: StarMapLocation) => void;
  onSelectLocation: (location: StarMapLocation) => void;
  onDeleteCustomLocation: (locationId: string) => void;
  onPatchCustomLocation: (locationId: string, patch: Partial<StarMapLocation>) => void;
}) {
  const editableLocation = selectedLocation?.source === 'fan' && selectedLocation.id.startsWith('custom_location_') ? selectedLocation : null;
  const filteredLocations = useMemo(
    () => locations.filter((location) => !location.parentId).sort((left, right) => (
      (left.mapPosition.y - right.mapPosition.y)
      || (left.mapPosition.x - right.mapPosition.x)
      || left.name.localeCompare(right.name, 'zh-CN')
    )),
    [locations],
  );
  const currentPathIds = new Set(
    currentMatch?.waypoint.id === waypoint.id
      ? getStarMapLocationPath(currentMatch.location, locations).map((location) => location.id)
      : [],
  );
  const selectedIsCurrentMatch = Boolean(selectedLocation && currentPathIds.has(selectedLocation.id));
  const selectedParentLocation = selectedLocation?.parentId
    ? locations.find((location) => location.id === selectedLocation.parentId && location.waypointId === waypoint.id) ?? null
    : null;
  const selectedChildLocations = selectedLocation
    ? locations.filter((location) => location.parentId === selectedLocation.id)
    : [];
  const editableParentOptions = editableLocation
    ? locations.filter((location) => (
        location.id !== editableLocation.id
        && getStarMapLocationDepth(location, locations) < STAR_MAP_MAX_LOCATION_DEPTH
        && !getDescendantLocationIds(locations, editableLocation.id).has(location.id)
      ))
    : [];
  const canJumpToCurrentLocation = Boolean(
    currentMatch?.waypoint.id === waypoint.id
    && currentMatch.location.id !== selectedLocation?.id,
  );
  const isTrainDetailMap = waypoint.kind === 'train';
  const isHertaDetailMap = waypoint.id === 'herta_space_station';
  const isJariloDetailMap = waypoint.id === 'jarilo_vi';
  const isLuofuDetailMap = waypoint.id === 'xianzhou_luofu';
  const isStructuredDetailMap = isTrainDetailMap || isHertaDetailMap || isJariloDetailMap || isLuofuDetailMap;
  const canEnterLocalMap = Boolean(
    selectedLocation
    && !selectedLocation.parentId
    && (isTrainDetailMap || selectedChildLocations.length > 0),
  );
  const jumpToCurrentLocation = () => {
    if (currentMatch?.waypoint.id !== waypoint.id) return;
    onSelectLocation(currentMatch.location);
  };
  return (
    <div className="grid h-full min-h-0 w-full gap-3 overflow-y-auto lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.34fr)] xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.36fr)]">
      <div
        className="relative min-h-[430px] overflow-hidden"
        style={{
          clipPath: shellClip,
          background: isTrainDetailMap
            ? 'linear-gradient(135deg, rgba(11, 16, 28, 0.98), rgba(24, 31, 43, 0.96) 44%, rgba(53, 44, 30, 0.92))'
            : isHertaDetailMap
              ? 'linear-gradient(145deg, rgba(217, 233, 242, 0.99), rgba(145, 180, 201, 0.98) 48%, rgba(91, 130, 155, 0.98))'
            : isJariloDetailMap
              ? 'linear-gradient(145deg, rgba(211, 230, 239, 0.98), rgba(147, 184, 203, 0.98) 48%, rgba(94, 137, 162, 0.98))'
            : isLuofuDetailMap
              ? 'linear-gradient(145deg, rgba(8,23,24,0.99), rgba(16,42,39,0.98) 46%, rgba(40,31,29,0.98))'
            : 'linear-gradient(135deg, rgba(217, 225, 225, 0.92), rgba(172, 188, 194, 0.9) 44%, rgba(226, 217, 196, 0.86))',
          boxShadow: isTrainDetailMap
            ? 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.34), inset 0 0 54px rgba(0,0,0,0.5), inset 0 0 120px rgba(var(--tj-tech-cyan), 0.08)'
            : isHertaDetailMap
              ? 'inset 0 0 0 1px rgba(224,239,247,0.58), inset 0 0 76px rgba(17,55,80,0.24), inset 0 -90px 110px rgba(31,73,99,0.12)'
            : isJariloDetailMap
              ? 'inset 0 0 0 1px rgba(221,238,246,0.58), inset 0 0 76px rgba(18,54,76,0.22), inset 0 -90px 110px rgba(31,77,102,0.14)'
            : isLuofuDetailMap
              ? 'inset 0 0 0 1px rgba(175,214,193,0.3), inset 0 0 76px rgba(0,7,8,0.56), inset 0 -90px 120px rgba(74,30,25,0.18)'
            : 'inset 0 0 0 1px rgba(var(--tj-border), 0.82), inset 0 0 38px rgba(24, 42, 58, 0.18)',
        }}
      >
        {isTrainDetailMap && <AstralExpressBackdrop />}
        <div
          className={isStructuredDetailMap ? 'absolute inset-0 opacity-25' : 'absolute inset-0 opacity-45'}
          style={{
            background:
              isTrainDetailMap
                ? 'linear-gradient(rgba(222, 191, 118, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(80, 205, 232, 0.1) 1px, transparent 1px)'
                : isHertaDetailMap
                  ? 'linear-gradient(rgba(93, 188, 211, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(93, 188, 211, 0.14) 1px, transparent 1px)'
                : isJariloDetailMap
                  ? 'linear-gradient(rgba(230,242,240,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(230,242,240,0.07) 1px, transparent 1px)'
                : isLuofuDetailMap
                  ? 'linear-gradient(rgba(147,199,177,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(147,199,177,0.06) 1px, transparent 1px)'
                  : 'linear-gradient(rgba(46, 78, 96, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(46, 78, 96, 0.18) 1px, transparent 1px)',
            backgroundSize: isTrainDetailMap ? '34px 34px' : isHertaDetailMap ? '32px 32px' : isJariloDetailMap ? '40px 40px' : isLuofuDetailMap ? '36px 36px' : '28px 28px',
          }}
        />
        <div className="absolute left-4 top-4 z-30 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em]" style={{ color: isStructuredDetailMap ? 'rgba(228, 239, 236, 0.88)' : 'rgba(22, 43, 55, 0.78)' }}>
          <MapBreadcrumbs
            tone={isHertaDetailMap || isJariloDetailMap ? 'light' : isStructuredDetailMap ? 'dark' : 'light'}
            items={[
              { id: 'overview', label: '星海航图', onClick: onBack },
              { id: waypoint.id, label: waypoint.name },
            ]}
          />
        </div>
        <div className={isLuofuDetailMap || isJariloDetailMap || isHertaDetailMap ? 'pointer-events-none absolute inset-0' : 'absolute inset-x-8 top-[22%] h-[56%]'}>
          <DetailSchematic waypoint={waypoint} />
        </div>

        {isLuofuDetailMap ? (
          <LuofuLocationPager
            locations={filteredLocations}
            selectedLocationId={selectedLocation?.id ?? null}
            currentLocationId={currentMatch?.waypoint.id === waypoint.id ? currentMatch.location.id : null}
            onSelect={onSelectLocation}
          />
        ) : filteredLocations.map((location) => {
          const selected = selectedLocation?.id === location.id;
          const current = currentPathIds.has(location.id);
          const kindColor = LOCATION_KIND_COLORS[location.kind];
          const childCount = locations.filter((child) => child.parentId === location.id).length;
          if (isStructuredDetailMap) {
            return (
              <TrainLocationNode
                key={location.id}
                location={location}
                selected={selected}
                current={current}
                childCount={childCount}
                onSelect={() => onSelectLocation(location)}
              />
            );
          }
          return (
            <button
              key={location.id}
              type="button"
              onClick={() => onSelectLocation(location)}
              className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-bold transition-all"
              style={{
                left: `${location.mapPosition.x}%`,
                top: `${location.mapPosition.y}%`,
                clipPath: chipClip,
                color: current || selected ? 'rgb(21, 36, 48)' : 'rgba(24, 40, 52, 0.78)',
                background: current ? 'rgba(83, 202, 226, 0.86)' : selected ? 'rgba(226, 188, 104, 0.86)' : kindColor,
                boxShadow: current
                  ? '0 0 0 1px rgba(20, 93, 112, 0.34), 0 0 18px rgba(83, 202, 226, 0.36)'
                  : selected
                    ? '0 0 0 1px rgba(128, 90, 30, 0.3), 0 0 16px rgba(226, 188, 104, 0.28)'
                    : `0 0 0 1px rgba(29, 54, 68, 0.12), 0 6px 16px ${kindColor.replace('0.86', '0.18').replace('0.88', '0.18').replace('0.9', '0.18')}`,
              }}
            >
              {location.name}
            </button>
          );
        })}
      </div>

      <aside className="min-h-0 w-full space-y-3 overflow-y-visible pr-1 lg:h-full lg:overflow-y-auto">
        <InfoPanel title={selectedLocation?.name ?? waypoint.name} code="DETAIL">
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            {selectedLocation?.description ?? waypoint.description}
          </p>
          {canJumpToCurrentLocation && (
            <button
              type="button"
              onClick={jumpToCurrentLocation}
              className="mt-3 w-full px-3 py-2 text-left text-[11px] font-bold tracking-[0.12em] transition-all hover:brightness-105"
              style={{ clipPath: chipClip, background: 'rgba(var(--tj-tech-cyan), 0.12)', color: 'rgba(var(--tj-text-primary), 0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.24)' }}
            >
              跳到当前剧情坐标：{currentMatch!.location.name}
            </button>
          )}
          {selectedLocation && (
            <div className="mt-3 grid gap-2 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
              <div className="flex flex-wrap gap-1.5">
                <MiniTag>{LOCATION_KIND_LABELS[selectedLocation.kind]}</MiniTag>
                <MiniTag>{SOURCE_LABELS[selectedLocation.source]}</MiniTag>
                {selectedIsCurrentMatch && <MiniTag>{MATCH_REASON_LABELS[currentMatch!.reason]} {currentMatch!.score}分</MiniTag>}
              </div>
              {selectedLocation.aliases.length > 0 && (
                <div className="leading-relaxed">
                  <span className="font-bold" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>别名：</span>
                  {selectedLocation.aliases.slice(0, 6).join('、')}
                  {selectedLocation.aliases.length > 6 ? ' 等' : ''}
                </div>
              )}
              {selectedParentLocation && (
                <button
                  type="button"
                  onClick={() => onSelectLocation(selectedParentLocation)}
                  className="w-full px-2 py-1.5 text-left text-[11px] transition-all hover:brightness-105"
                  style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.58)', color: 'rgba(var(--tj-text-secondary), 0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)' }}
                >
                  <span className="font-bold" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>上级地点：</span>
                  {selectedParentLocation.name}
                </button>
              )}
              {canEnterLocalMap && selectedLocation && (
                <button
                  type="button"
                  onClick={() => onEnterLocalMap(selectedLocation)}
                  className="w-full px-3 py-2 text-left transition-all hover:brightness-110"
                  style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.18), rgba(var(--tj-tech-cyan), 0.1))', color: 'rgba(var(--tj-text-primary), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.3)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif text-[13px] font-bold tracking-[0.12em]">
                      {selectedLocation.navigationMode === 'terminal' ? '查看' : '进入'}{selectedLocation.name}
                    </span>
                    <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>
                      {selectedChildLocations.length > 0 ? selectedChildLocations.length + ' 个地点' : (selectedLocation.sceneAnchors?.length ?? 0) + ' 个场景位置'}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                    {selectedChildLocations.length > 0
                      ? selectedChildLocations.slice(0, 4).map((child) => child.name).join(' / ') + (selectedChildLocations.length > 4 ? ' / ...' : '')
                      : selectedLocation.sceneAnchors?.slice(0, 4).map((anchor) => anchor.name).join(' / ') || '完整场景地图'}
                  </div>
                </button>
              )}
              {false && selectedChildLocations.length > 0 && (
                <div className="grid gap-1">
                  <div className="text-[11px] font-bold tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary), 0.74)' }}>子地点</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedChildLocations.slice(0, 6).map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onSelectLocation(child)}
                        className="px-2 py-1 text-[10px] font-bold tracking-[0.06em] transition-all hover:brightness-105"
                        style={{ clipPath: chipClip, background: 'rgba(var(--tj-tech-cyan), 0.1)', color: 'rgba(var(--tj-text-primary), 0.84)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.2)' }}
                      >
                        {child.name}
                      </button>
                    ))}
                    {selectedChildLocations.length > 6 && <MiniTag>另有 {selectedChildLocations.length - 6} 个</MiniTag>}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(selectedLocation?.tags ?? waypoint.tags).map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
          </div>
          {editableLocation && (
            <button
              type="button"
              onClick={() => onDeleteCustomLocation(editableLocation.id)}
              className="mt-3 w-full px-3 py-2 text-center text-[11px] font-bold tracking-[0.14em] transition-all hover:brightness-110"
              style={{
                clipPath: chipClip,
                background: 'rgba(116, 42, 35, 0.28)',
                color: 'rgba(255, 206, 190, 0.92)',
                boxShadow: 'inset 0 0 0 1px rgba(210, 110, 91, 0.26)',
              }}
            >
              删除玩家扩展地点
            </button>
          )}
        </InfoPanel>
        {editableLocation && (
          <InfoPanel title="编辑扩展地点" code="EDIT">
            <div className="grid gap-2">
              <input
                value={editableLocation.name}
                onChange={(event) => onPatchCustomLocation(editableLocation.id, { name: event.target.value })}
                className="w-full rounded-none px-3 py-2 text-[12px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)', color: 'rgb(var(--tj-text-primary))' }}
              />
              <select
                value={editableLocation.kind}
                onChange={(event) => onPatchCustomLocation(editableLocation.id, { kind: event.target.value as StarMapLocationKind })}
                className="w-full rounded-none px-3 py-2 text-[12px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)', color: 'rgb(var(--tj-text-primary))' }}
              >
                <option value="room">房间</option>
                <option value="facility">设施</option>
                <option value="district">街区</option>
                <option value="zone">区域</option>
                <option value="route">路线</option>
                <option value="wildland">野外</option>
                <option value="special">特殊地点</option>
              </select>
              <select
                value={editableLocation.parentId ?? ''}
                onChange={(event) => onPatchCustomLocation(editableLocation.id, { parentId: event.target.value || undefined })}
                className="w-full rounded-none px-3 py-2 text-[12px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)', color: 'rgb(var(--tj-text-primary))' }}
              >
                <option value="">无上级地点</option>
                {editableParentOptions.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
              <textarea
                value={editableLocation.description}
                onChange={(event) => onPatchCustomLocation(editableLocation.id, { description: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-none px-3 py-2 text-[12px] leading-relaxed outline-none"
                style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)', color: 'rgb(var(--tj-text-primary))' }}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X"
                  value={editableLocation.mapPosition.x}
                  onChange={(x) => onPatchCustomLocation(editableLocation.id, { mapPosition: { ...editableLocation.mapPosition, x } })}
                />
                <NumberField
                  label="Y"
                  value={editableLocation.mapPosition.y}
                  onChange={(y) => onPatchCustomLocation(editableLocation.id, { mapPosition: { ...editableLocation.mapPosition, y } })}
                />
              </div>
            </div>
          </InfoPanel>
        )}
        <div className="min-h-0">
          <div className="space-y-2">
            {filteredLocations.map((location) => {
              const active = selectedLocation?.id === location.id;
              const current = currentPathIds.has(location.id);
              const kindColor = LOCATION_KIND_COLORS[location.kind];
              return (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => onSelectLocation(location)}
                  className="w-full px-3 py-2 text-left transition-all"
                  style={{
                    clipPath: panelClip,
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.2), rgba(var(--tj-tech-cyan), 0.12))'
                      : 'rgba(var(--tj-surface-strong), 0.86)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.4)'
                      : 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-serif text-[13px] font-bold tracking-[0.08em]">{location.name}</span>
                    {current && <span className="text-[10px] font-bold" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>当前</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: kindColor }} />
                    <span>{LOCATION_KIND_LABELS[location.kind]}</span>
                  </div>
                </button>
              );
            })}
            {filteredLocations.length === 0 && (
              <div className="px-3 py-3 text-[12px] leading-relaxed" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.72)', color: 'rgba(var(--tj-text-secondary), 0.8)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)' }}>
                当前筛选或搜索下暂无地点。
              </div>
            )}
          </div>
        </div>
        {!currentMatch && (
          <InfoPanel title="未登记地点" code="INBOX">
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
              {currentLocationText} 暂未匹配。后续可以把它收进当前航点的扩展地点，或新建同人航点。
            </p>
          </InfoPanel>
        )}
      </aside>
    </div>
  );
}

function LocalMap({
  currentMatch,
  waypoint,
  locations,
  rootLocation,
  selectedLocation,
  selectedAnchorId,
  npcRecords,
  plotNodes,
  onOpenOverview,
  onOpenDetail,
  onEnterInteriorMap,
  onSelectLocation,
  onSelectAnchor,
}: {
  currentMatch: ReturnType<typeof findCurrentStarMapLocation>;
  waypoint: StarMapWaypoint;
  locations: StarMapLocation[];
  rootLocation: StarMapLocation | null;
  selectedLocation: StarMapLocation | null;
  selectedAnchorId: string | null;
  npcRecords: NPC记录[];
  plotNodes: 剧情节点[];
  onOpenOverview: () => void;
  onOpenDetail: () => void;
  onEnterInteriorMap: (rootLocation: StarMapLocation) => void;
  onSelectLocation: (location: StarMapLocation) => void;
  onSelectAnchor: (anchorId: string) => void;
}) {
  const localLocations = useMemo(
    () => rootLocation
      ? locations
          .filter((location) => location.parentId === rootLocation.id)
          .sort((left, right) => (
            (left.mapPosition.y - right.mapPosition.y)
            || (left.mapPosition.x - right.mapPosition.x)
            || left.name.localeCompare(right.name, 'zh-CN')
          ))
      : [],
    [locations, rootLocation],
  );
  const currentPathIds = new Set(
    currentMatch?.waypoint.id === waypoint.id
      ? getStarMapLocationPath(currentMatch.location, locations).map((location) => location.id)
      : [],
  );
  const isTerminalMap = rootLocation?.navigationMode === 'terminal';
  const rootSceneAnchors = rootLocation?.sceneAnchors ?? [];
  const selectedSceneAnchor = rootSceneAnchors.find((anchor) => anchor.id === selectedAnchorId)
    ?? (currentMatch?.location.id === rootLocation?.id ? currentMatch?.anchor : undefined)
    ?? rootSceneAnchors[0]
    ?? null;
  const defaultLocalLocation = rootLocation?.id === 'herta_master_control'
    ? localLocations.find((location) => location.id === 'herta_master_core_passage') ?? localLocations[0] ?? null
    : localLocations[0] ?? null;
  const selectedLocalLocation = isTerminalMap
    ? rootLocation
    : selectedLocation && rootLocation && selectedLocation.parentId === rootLocation.id
      ? selectedLocation
      : defaultLocalLocation;
  const canEnterInterior = Boolean(
    !isTerminalMap
    && selectedLocalLocation
    && selectedLocalLocation.navigationMode === 'interior'
    && selectedLocalLocation.status !== 'locked',
  );
  const isTrainLocalMap = waypoint.kind === 'train';
  const fallbackCompanionNpcs = npcRecords.filter((npc) => npc.同行 && !npc.locationId).slice(0, 6);

  return (
    <div className="grid h-full min-h-0 w-full gap-3 overflow-y-auto lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.34fr)] xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.36fr)]">
      <div
        className="relative min-h-[430px] overflow-hidden"
        style={{
          clipPath: shellClip,
          background: isTrainLocalMap
            ? 'linear-gradient(135deg, rgba(226, 229, 226, 0.96), rgba(174, 178, 176, 0.94) 48%, rgba(214, 211, 203, 0.92))'
            : 'linear-gradient(145deg, rgba(7, 15, 25, 0.99), rgba(15, 27, 39, 0.97) 48%, rgba(28, 27, 29, 0.96))',
          boxShadow: isTrainLocalMap
            ? 'inset 0 0 0 1px rgba(244, 244, 238, 0.72), inset 0 0 0 2px rgba(55, 58, 56, 0.18), inset 0 0 42px rgba(44, 47, 46, 0.22)'
            : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.24), inset 0 0 64px rgba(0,0,0,0.52)',
        }}
      >
        {isTrainLocalMap ? (
          <>
            <TrainLocalBackdrop rootLocationId={rootLocation?.id} />
            <div className="absolute left-4 right-4 top-4 z-30 min-w-0" style={{ color: 'rgba(40, 43, 42, 0.84)' }}>
              <MapBreadcrumbs
                tone="light"
                items={[
                  { id: 'overview', label: '星海航图', onClick: onOpenOverview },
                  { id: waypoint.id, label: waypoint.name, onClick: onOpenDetail },
                  ...(rootLocation ? [{ id: rootLocation.id, label: rootLocation.name }] : []),
                ]}
              />
            </div>
            {isTerminalMap && rootSceneAnchors.map((anchor, index) => (
              <SceneAnchorNode
                key={anchor.id}
                anchor={anchor}
                index={index}
                selected={selectedSceneAnchor?.id === anchor.id}
                current={currentMatch?.location.id === rootLocation?.id && currentMatch?.anchor?.id === anchor.id}
                tone="light"
                onSelect={() => onSelectAnchor(anchor.id)}
              />
            ))}
            {!isTerminalMap && localLocations.map((location, index) => (
              <TrainRoomNode
                key={location.id}
                location={location}
                index={index}
                selected={selectedLocalLocation?.id === location.id}
                current={currentPathIds.has(location.id)}
                onSelect={() => onSelectLocation(location)}
              />
            ))}
            {!isTerminalMap && localLocations.length === 0 && (
              <div className="absolute left-1/2 top-1/2 w-[min(340px,78%)] -translate-x-1/2 -translate-y-1/2 px-4 py-3 text-center text-[12px] leading-relaxed" style={{ clipPath: panelClip, background: 'rgba(4, 11, 26, 0.72)', color: 'rgba(255,255,255,0.78)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}>
                当前区域还没有登记可进入地点。
              </div>
            )}
          </>
        ) : (
          <div className="relative z-10 flex h-full min-h-[430px] flex-col px-4 pb-4 pt-4">
            <div className="min-w-0 text-[11px] font-bold tracking-[0.16em]" style={{ color: 'rgba(228, 239, 236, 0.88)' }}>
              <MapBreadcrumbs
                tone="dark"
                items={[
                  { id: 'overview', label: '星海航图', onClick: onOpenOverview },
                  { id: waypoint.id, label: waypoint.name, onClick: onOpenDetail },
                  ...(rootLocation ? [{ id: rootLocation.id, label: rootLocation.name }] : []),
                ]}
              />
            </div>
            <div className="mt-6 flex items-end justify-between gap-4 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-[0.24em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.72)' }}>LOCATION ARCHIVE</div>
                <div className="mt-1 truncate font-serif text-[19px] font-bold tracking-[0.12em] text-white/90">{rootLocation?.name ?? waypoint.name}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[22px] font-light text-white/80">{String(localLocations.length).padStart(2, '0')}</div>
                <div className="text-[9px] font-bold tracking-[0.18em] text-white/40">已知地点</div>
              </div>
            </div>
            {localLocations.length > 0 ? (
              <div className="mt-4 grid min-h-0 flex-1 auto-rows-[minmax(154px,1fr)] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-3">
                {localLocations.map((location, index) => {
                  const current = currentPathIds.has(location.id)
                    || (currentMatch?.location.id === rootLocation?.id && location.id === defaultLocalLocation?.id);
                  const relatedPlots = findLocationPlotNodes(location, rootLocation, plotNodes, location.id === defaultLocalLocation?.id);
                  const locatedNpcs = findLocationNpcRecords(location.id, npcRecords);
                  const cardNpcs = locatedNpcs.length > 0
                    ? locatedNpcs
                    : current
                      ? fallbackCompanionNpcs
                      : [];
                  return (
                    <LocationArchiveCard
                      key={location.id}
                      location={location}
                      index={index}
                      selected={selectedLocalLocation?.id === location.id}
                      current={current}
                      npcNames={cardNpcs.map((npc) => npc.姓名)}
                      plotNodes={relatedPlots}
                      onSelect={() => onSelectLocation(location)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center text-center text-[12px] leading-relaxed text-white/60">
                当前区域还没有登记可进入地点。
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="min-h-0 w-full space-y-3 overflow-y-visible pr-1 lg:h-full lg:overflow-y-auto">
        <InfoPanel title={selectedSceneAnchor?.name ?? selectedLocalLocation?.name ?? rootLocation?.name ?? waypoint.name} code={isTerminalMap ? 'SCENE' : 'LOCAL'}>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            {selectedSceneAnchor?.description ?? selectedLocalLocation?.description ?? rootLocation?.description ?? waypoint.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(selectedSceneAnchor?.tags ?? selectedLocalLocation?.tags ?? rootLocation?.tags ?? waypoint.tags).map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
          </div>
          {!isTerminalMap && selectedLocalLocation?.status === 'locked' && (
            <div className="mt-3 px-3 py-2 text-[11px] leading-relaxed" style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong),0.64)', color: 'rgba(var(--tj-text-secondary),0.76)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.38)' }}>
              {selectedLocalLocation.lockReason ?? '该房间尚未在剧情中解锁。'}
            </div>
          )}
          {canEnterInterior && selectedLocalLocation && (
            <button
              type="button"
              onClick={() => onEnterInteriorMap(selectedLocalLocation)}
              className="mt-3 w-full px-3 py-2 text-left transition-all hover:brightness-105"
              style={{ clipPath: chipClip, background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft),0.2), rgba(var(--tj-tech-cyan),0.12))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.38)' }}
            >
              <span className="block font-serif text-[12px] font-bold tracking-[0.14em]">
                {waypoint.id === 'jarilo_vi' ? '查看地点地图' : '进入房间'}
              </span>
              <span className="mt-0.5 block text-[10px] tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
                {(selectedLocalLocation.sceneAnchors?.length ?? 0) + (waypoint.id === 'jarilo_vi' ? ' 个具体地点' : ' 个室内场景位置')}
              </span>
            </button>
          )}
        </InfoPanel>
        {isTerminalMap ? (
          <InfoPanel title="场景位置" code={String(rootSceneAnchors.length)}>
            <div className="space-y-2">
              {rootSceneAnchors.map((anchor, index) => {
                const active = selectedSceneAnchor?.id === anchor.id;
                return (
                  <button
                    key={anchor.id}
                    type="button"
                    onClick={() => onSelectAnchor(anchor.id)}
                    className="w-full px-3 py-2 text-left transition-all hover:brightness-105"
                    style={{ clipPath: chipClip, background: active ? 'rgba(var(--tj-amber-soft),0.18)' : 'rgba(var(--tj-surface-strong),0.72)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-amber-soft),0.34)' : 'inset 0 0 0 1px rgba(var(--tj-border),0.32)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-serif text-[13px] font-bold tracking-[0.08em]">{anchor.name}</span>
                      <span className="text-[10px] font-bold" style={{ color: 'rgb(var(--tj-amber-deep))' }}>{String(index + 1).padStart(2, '0')}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </InfoPanel>
        ) : (
        <InfoPanel title="本层地点" code={String(localLocations.length)}>
          <div className="space-y-2">
            {localLocations.map((location, index) => {
              const active = selectedLocalLocation?.id === location.id;
              return (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => onSelectLocation(location)}
                  className="w-full px-3 py-2 text-left transition-all hover:brightness-105"
                  style={{ clipPath: chipClip, background: active ? 'rgba(var(--tj-amber-soft),0.18)' : 'rgba(var(--tj-surface-strong),0.72)', color: 'rgba(var(--tj-text-primary),0.86)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-amber-soft),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-border),0.32)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-serif text-[13px] font-bold tracking-[0.08em]">{location.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: 'rgb(var(--tj-amber-deep))' }}>{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
                    {LOCATION_KIND_LABELS[location.kind]} / {SOURCE_LABELS[location.source]}
                  </div>
                </button>
              );
            })}
          </div>
        </InfoPanel>
        )}
        <InfoPanel title="区域状态" code={rootLocation?.status === 'locked' ? 'LOCKED' : 'ACTIVE'}>
          <div className="grid gap-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
            <div>当前位置：{rootLocation?.name ?? waypoint.name}</div>
            <div>出口：返回{waypoint.name}区域图</div>
            <div>NPC：优先显示明确地点；未标注位置的同行角色跟随玩家当前地点。</div>
            <div>剧情：优先使用地点 ID；旧节点继续使用名称与别名匹配。</div>
          </div>
        </InfoPanel>
      </aside>
    </div>
  );
}

function findLocationPlotNodes(
  location: StarMapLocation,
  rootLocation: StarMapLocation | null,
  plotNodes: 剧情节点[],
  includeRootFallback: boolean,
): 剧情节点[] {
  const locationKeys = [location.name, ...location.aliases]
    .map(normalizeStarMapLocationText)
    .filter((key) => key.length >= 2);
  const rootKeys = includeRootFallback && rootLocation
    ? [rootLocation.name, ...rootLocation.aliases].map(normalizeStarMapLocationText).filter((key) => key.length >= 2)
    : [];

  return plotNodes
    .filter((plot) => plot.状态 === 'active' || plot.状态 === 'pending')
    .filter((plot) => {
      if (plot.locationId) return plot.locationId === location.id || (includeRootFallback && plot.locationId === rootLocation?.id);
      const text = normalizeStarMapLocationText([plot.标题, plot.摘要, plot.AI引导 ?? ''].join(' '));
      return locationKeys.some((key) => text.includes(key)) || rootKeys.some((key) => text.includes(key));
    })
    .sort((left, right) => Number(right.状态 === 'active') - Number(left.状态 === 'active'))
    .slice(0, 2);
}

function findLocationNpcRecords(locationId: string, npcRecords: NPC记录[]): NPC记录[] {
  return npcRecords
    .filter((npc) => npc.locationId === locationId)
    .sort((left, right) => Number(right.同行) - Number(left.同行) || right.最近回合 - left.最近回合)
    .slice(0, 6);
}

function LocationArchiveCard({
  location,
  index,
  selected,
  current,
  npcNames,
  plotNodes,
  onSelect,
}: {
  location: StarMapLocation;
  index: number;
  selected: boolean;
  current: boolean;
  npcNames: string[];
  plotNodes: 剧情节点[];
  onSelect: () => void;
}) {
  const locked = location.status === 'locked';
  const hasInteriorMap = location.navigationMode === 'interior';
  const accent = current
    ? 'rgba(var(--tj-tech-cyan),0.9)'
    : selected
      ? 'rgba(var(--tj-amber-soft),0.88)'
      : locked
        ? 'rgba(142,148,148,0.38)'
        : 'rgba(194,211,214,0.38)';
  const statusCode = current ? 'CURRENT' : locked ? 'LOCKED' : selected ? 'SELECTED' : 'ARCHIVE';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative min-h-[154px] overflow-hidden px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
      style={{
        clipPath: panelClip,
        color: 'rgba(239,243,243,0.9)',
        background: current
          ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.19), rgba(8,17,27,0.94) 54%, rgba(14,25,34,0.9))'
          : selected
            ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft),0.18), rgba(17,17,20,0.94) 54%, rgba(25,23,22,0.9))'
            : 'linear-gradient(135deg, rgba(27,40,50,0.88), rgba(7,14,23,0.94) 58%, rgba(18,20,25,0.9))',
        boxShadow: `inset 0 0 0 1px ${accent}, 0 12px 28px rgba(0,0,0,0.2)`,
        opacity: locked ? 0.64 : 1,
      }}
    >
      <span className="pointer-events-none absolute -right-1 -top-5 font-serif text-[74px] leading-none text-white/[0.035]">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: accent }} />
      <span className="relative flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[9px] font-bold tracking-[0.2em]" style={{ color: accent }}>
            {statusCode} / {String(index + 1).padStart(2, '0')}
          </span>
          <span className="mt-1.5 block truncate font-serif text-[16px] font-bold tracking-[0.1em]">{location.name}</span>
        </span>
        <span className="shrink-0 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-white/60" style={{ clipPath: chipClip, background: 'rgba(255,255,255,0.06)' }}>
          {LOCATION_KIND_LABELS[location.kind]}
        </span>
      </span>
      {hasInteriorMap && (
        <span
          className="relative mt-2 inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-[0.14em]"
          style={{
            clipPath: chipClip,
            color: 'rgba(222,239,238,0.9)',
            background: 'rgba(var(--tj-tech-cyan),0.13)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.32)',
          }}
        >
          <span className="h-1.5 w-1.5 rotate-45 bg-[rgba(var(--tj-tech-cyan),0.86)]" />
          {locked ? 'INTERIOR / 未解锁' : 'INTERIOR / 可进入'}
        </span>
      )}
      <span
        className={`relative block overflow-hidden text-[11px] leading-relaxed text-white/58 ${hasInteriorMap ? 'mt-1.5' : 'mt-2'}`}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
      >
        {locked ? location.lockReason ?? '该地点尚未在剧情中解锁。' : location.description}
      </span>
      <span className="relative mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.07] pt-2 text-[9px] font-bold tracking-[0.08em] text-white/48">
        {location.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
        {npcNames.length > 0 && <span style={{ color: 'rgba(var(--tj-tech-cyan),0.78)' }}>同场 {npcNames.slice(0, 3).join('、')}</span>}
        {plotNodes.length > 0 && <span style={{ color: 'rgba(var(--tj-amber-soft),0.78)' }}>剧情 {plotNodes[0].标题}</span>}
        {npcNames.length === 0 && <span>NPC 未标注</span>}
        {plotNodes.length === 0 && <span>剧情未关联</span>}
      </span>
    </button>
  );
}

function InteriorMap({
  currentMatch,
  waypoint,
  locations,
  rootLocation,
  selectedAnchorId,
  npcRecords,
  plotNodes,
  onOpenOverview,
  onOpenDetail,
  onBack,
  onSelectAnchor,
}: {
  currentMatch: ReturnType<typeof findCurrentStarMapLocation>;
  waypoint: StarMapWaypoint;
  locations: StarMapLocation[];
  rootLocation: StarMapLocation | null;
  selectedAnchorId: string | null;
  npcRecords: NPC记录[];
  plotNodes: 剧情节点[];
  onOpenOverview: () => void;
  onOpenDetail: () => void;
  onBack: () => void;
  onSelectAnchor: (anchorId: string) => void;
}) {
  const interiorAnchors = useMemo(
    () => [...(rootLocation?.sceneAnchors ?? [])].sort((left, right) => (
      (left.mapPosition.y - right.mapPosition.y)
      || (left.mapPosition.x - right.mapPosition.x)
      || left.name.localeCompare(right.name, 'zh-CN')
    )),
    [rootLocation],
  );
  const selectedInteriorAnchor = interiorAnchors.find((anchor) => anchor.id === selectedAnchorId)
    ?? (currentMatch?.location.id === rootLocation?.id ? currentMatch?.anchor : undefined)
    ?? interiorAnchors[0]
    ?? null;
  const parentLocation = rootLocation?.parentId
    ? locations.find((location) => location.id === rootLocation.parentId) ?? null
    : null;
  const isTrainInterior = waypoint.kind === 'train';
  const isJariloLocationMap = waypoint.id === 'jarilo_vi';
  const roomNpcs = rootLocation ? findLocationNpcRecords(rootLocation.id, npcRecords) : [];
  const roomPlots = rootLocation
    ? plotNodes.filter((plot) => (plot.状态 === 'active' || plot.状态 === 'pending') && plot.locationId === rootLocation.id)
    : [];

  return (
    <div className="grid h-full min-h-0 w-full gap-3 overflow-y-auto lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.34fr)] xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.36fr)]">
      <div
        className="relative min-h-[430px] overflow-hidden"
        style={{
          clipPath: shellClip,
          background: isTrainInterior
            ? 'linear-gradient(145deg, rgba(33,36,35,0.98), rgba(58,61,58,0.96) 46%, rgba(28,30,29,0.98))'
            : 'linear-gradient(145deg, rgba(16,31,43,0.96), rgba(27,50,62,0.94))',
          boxShadow: 'inset 0 0 0 1px rgba(245,241,228,0.18), inset 0 0 60px rgba(0,0,0,0.42)',
        }}
      >
        <InteriorMapBackdrop waypointKind={waypoint.kind} rootLocationId={rootLocation?.id} />
        <div className="absolute left-4 right-4 top-4 z-30 min-w-0 pr-28" style={{ color: 'rgba(241,239,231,0.84)' }}>
          <MapBreadcrumbs
            items={[
              { id: 'overview', label: '星海航图', onClick: onOpenOverview },
              { id: waypoint.id, label: waypoint.name, onClick: onOpenDetail },
              ...(parentLocation ? [{ id: parentLocation.id, label: parentLocation.name, onClick: onBack }] : []),
              ...(rootLocation ? [{ id: rootLocation.id, label: rootLocation.name }] : []),
            ]}
          />
        </div>
        <div className="absolute right-5 top-5 z-20 text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(238,231,206,0.48)' }}>
          {isJariloLocationMap ? 'DISTRICT LOCATIONS' : 'ROOM INTERIOR'}
        </div>
        {interiorAnchors.map((anchor, index) => (
          <SceneAnchorNode
            key={anchor.id}
            anchor={anchor}
            index={index}
            selected={selectedInteriorAnchor?.id === anchor.id}
            current={currentMatch?.location.id === rootLocation?.id && currentMatch?.anchor?.id === anchor.id}
            npcRecords={roomNpcs.filter((npc) => npc.anchorId === anchor.id)}
            plotCount={roomPlots.filter((plot) => plot.anchorId === anchor.id).length}
            tone="dark"
            onSelect={() => onSelectAnchor(anchor.id)}
          />
        ))}
        {interiorAnchors.length === 0 && (
          <div className="absolute left-1/2 top-1/2 w-[min(340px,78%)] -translate-x-1/2 -translate-y-1/2 px-4 py-3 text-center text-[12px] leading-relaxed" style={{ clipPath: panelClip, background: 'rgba(10,13,12,0.76)', color: 'rgba(245,241,228,0.74)', boxShadow: 'inset 0 0 0 1px rgba(245,241,228,0.14)' }}>
            当前房间还没有登记场景位置。
          </div>
        )}
      </div>

      <aside className="min-h-0 w-full space-y-3 overflow-y-visible pr-1 lg:h-full lg:overflow-y-auto">
        <InfoPanel title={selectedInteriorAnchor?.name ?? rootLocation?.name ?? waypoint.name} code={isJariloLocationMap ? 'AREA' : 'ROOM'}>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.88)' }}>
            {selectedInteriorAnchor?.description ?? rootLocation?.description ?? waypoint.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(selectedInteriorAnchor?.tags ?? rootLocation?.tags ?? waypoint.tags).map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
          </div>
        </InfoPanel>
        <InfoPanel title={isJariloLocationMap ? '区域地点' : '室内位置'} code={String(interiorAnchors.length)}>
          <div className="space-y-2">
            {interiorAnchors.map((anchor, index) => {
              const active = selectedInteriorAnchor?.id === anchor.id;
              const current = currentMatch?.location.id === rootLocation?.id && currentMatch?.anchor?.id === anchor.id;
              return (
                <button
                  key={anchor.id}
                  type="button"
                  onClick={() => onSelectAnchor(anchor.id)}
                  className="w-full px-3 py-2 text-left transition-all hover:brightness-105"
                  style={{ clipPath: chipClip, background: active ? 'rgba(var(--tj-amber-soft),0.18)' : 'rgba(var(--tj-surface-strong),0.72)', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-amber-soft),0.34)' : 'inset 0 0 0 1px rgba(var(--tj-border),0.32)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-serif text-[13px] font-bold tracking-[0.08em]">{anchor.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: current ? 'rgb(var(--tj-tech-cyan-deep))' : 'rgb(var(--tj-amber-deep))' }}>{current ? '当前' : String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
                    具体位置 / NPC 动态落点
                  </div>
                </button>
              );
            })}
          </div>
        </InfoPanel>
        <InfoPanel title="位置联动" code="RESERVED">
          <div className="space-y-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
            <div>NPC：{roomNpcs.length > 0 ? roomNpcs.map((npc) => npc.姓名).join('、') : '暂无明确落点'}</div>
            <div>剧情：{roomPlots.length > 0 ? roomPlots.map((plot) => plot.标题).slice(0, 3).join('、') : '暂无关联剧情'}</div>
            <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>未设置锚点的角色与剧情保留在房间级，不会被猜测分配到具体家具。</div>
          </div>
        </InfoPanel>
      </aside>
    </div>
  );
}

function SceneAnchorNode({
  anchor,
  index,
  selected,
  current,
  npcRecords = [],
  plotCount = 0,
  tone,
  onSelect,
}: {
  anchor: StarMapSceneAnchor;
  index: number;
  selected: boolean;
  current: boolean;
  npcRecords?: NPC记录[];
  plotCount?: number;
  tone: 'light' | 'dark';
  onSelect: () => void;
}) {
  const accent = current ? 'rgba(112,190,226,0.96)' : selected ? 'rgba(226,190,108,0.96)' : 'rgba(235,232,220,0.9)';
  const dark = tone === 'dark';
  const visibleNpcRecords = npcRecords.slice(0, 2);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-anchor-card="true"
      className="absolute z-20 flex min-h-[58px] min-w-[156px] -translate-x-1/2 -translate-y-1/2 items-center gap-3 px-3 py-2 pr-10 text-left transition-all hover:brightness-110"
      style={{
        left: `${anchor.mapPosition.x}%`,
        top: `${anchor.mapPosition.y}%`,
        clipPath: chipClip,
        background: dark ? 'rgba(24,27,26,0.86)' : 'rgba(242,242,235,0.88)',
        color: dark ? 'rgba(245,242,231,0.9)' : 'rgba(31,35,34,0.92)',
        boxShadow: `inset 0 0 0 1px ${accent}, 0 6px 18px rgba(0,0,0,${dark ? '0.28' : '0.16'})`,
      }}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: accent, color: 'rgba(27,29,28,0.94)' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="max-w-[132px] truncate text-[11px] font-bold tracking-[0.06em]">{anchor.name}</span>
      {visibleNpcRecords.length > 0 && (
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 -space-x-1.5" aria-label={`此处 NPC：${npcRecords.map((npc) => npc.姓名).join('、')}`}>
          {visibleNpcRecords.map((npc) => {
            const avatar = 读取NPC头像(npc, '档案');
            return avatar ? (
              <img
                key={npc.id}
                src={avatar}
                alt={npc.姓名}
                title={npc.姓名}
                className="h-7 w-7 rounded-full object-cover"
                style={{ border: `1px solid ${accent}`, background: dark ? 'rgba(20,24,23,0.96)' : 'rgba(239,239,232,0.96)', boxShadow: '0 3px 9px rgba(0,0,0,0.24)' }}
              />
            ) : (
              <span
                key={npc.id}
                title={npc.姓名}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ border: `1px solid ${accent}`, background: dark ? 'rgba(39,46,44,0.98)' : 'rgba(236,235,226,0.98)', color: accent, boxShadow: '0 3px 9px rgba(0,0,0,0.2)' }}
              >
                {npc.姓名.trim().slice(0, 1) || '?'}
              </span>
            );
          })}
          {npcRecords.length > 2 && (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[8px] font-bold" style={{ border: `1px solid ${accent}`, background: dark ? 'rgba(28,32,31,0.98)' : 'rgba(236,235,226,0.98)', color: accent }}>
              +{npcRecords.length - 2}
            </span>
          )}
        </span>
      )}
      {(npcRecords.length > 0 || plotCount > 0) && (
        <span className="absolute bottom-1 right-2 flex shrink-0 gap-1 text-[8px] font-bold" style={{ color: accent }}>
          {npcRecords.length > 0 && <span>NPC {npcRecords.length}</span>}
          {plotCount > 0 && <span>剧情 {plotCount}</span>}
        </span>
      )}
    </button>
  );
}

function InteriorMapBackdrop({
  waypointKind,
  rootLocationId,
}: {
  waypointKind: StarMapWaypointKind;
  rootLocationId?: string;
}) {
  if (waypointKind === 'train') return <TrainInteriorBackdrop rootLocationId={rootLocationId} />;
  if (rootLocationId === 'herta_master_herta_office') return <HertaOfficeInteriorBackdrop />;
  if (rootLocationId === 'herta_storage_curio_collection_room') return <HertaCurioCollectionInteriorBackdrop />;
  if (rootLocationId === 'jarilo_administrative_district') return <JariloAdministrativeDistrictBackdrop />;
  if (rootLocationId === 'jarilo_boulder_town') return <JariloBoulderTownBackdrop />;
  return <GenericInteriorBackdrop />;
}

function TrainInteriorBackdrop({ rootLocationId }: { rootLocationId?: string }) {
  if (rootLocationId === 'express_conductor_console') return <ConductorConsoleInteriorBackdrop />;
  if (rootLocationId === 'express_conductor_quarters') return <ConductorQuartersInteriorBackdrop />;
  if (rootLocationId === 'express_parlor_supply') return <PartyBarInteriorBackdrop />;
  if (rootLocationId === 'express_party_lounge_tables') return <PartyLoungeInteriorBackdrop />;
  if (rootLocationId === 'express_room_danheng') return <GuestRoomInteriorBackdrop variant="danheng" />;
  if (rootLocationId === 'express_room_march') return <GuestRoomInteriorBackdrop variant="march" />;
  if (rootLocationId === 'express_room_himeko') return <GuestRoomInteriorBackdrop variant="himeko" />;
  if (rootLocationId === 'express_room_welt') return <GuestRoomInteriorBackdrop variant="welt" />;
  if (rootLocationId === 'express_observation_sofa_side') return <ObservationSofaInteriorBackdrop />;
  if (rootLocationId === 'express_observation_table_side') return <ObservationTableInteriorBackdrop />;
  return <GenericInteriorBackdrop />;
}

function InteriorBackdropShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-[7%] border border-[rgba(238,231,206,0.3)] bg-[rgba(60,63,59,0.72)]" style={{ clipPath: 'polygon(3% 0, 97% 0, 100% 8%, 100% 92%, 97% 100%, 3% 100%, 0 92%, 0 8%)' }} />
      <div className="absolute inset-[9%] opacity-25" style={{ background: 'linear-gradient(rgba(238,231,206,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(238,231,206,0.08) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
      <div className="absolute left-[9%] right-[9%] top-[16%] h-px bg-[rgba(238,231,206,0.2)]" />
      <div className="absolute bottom-[9%] left-1/2 h-4 w-24 -translate-x-1/2 bg-[rgba(30,32,31,0.95)]" />
      {children}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 72px rgba(0,0,0,0.36)' }} />
    </div>
  );
}

function HertaStationInteriorShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-[6%]"
        style={{
          clipPath: 'polygon(4% 0, 96% 0, 100% 8%, 100% 92%, 96% 100%, 4% 100%, 0 92%, 0 8%)',
          background: 'linear-gradient(145deg, rgba(198,207,207,0.2), rgba(56,70,75,0.44) 42%, rgba(16,28,36,0.82))',
          boxShadow: 'inset 0 0 0 1px rgba(195,224,230,0.28), inset 0 0 48px rgba(2,10,16,0.55)',
        }}
      />
      <div
        className="absolute inset-[8%] opacity-40"
        style={{
          background: 'linear-gradient(rgba(151,202,213,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(151,202,213,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="absolute left-[8%] right-[8%] top-[15%] h-px bg-[rgba(156,216,226,0.24)]" />
      <div className="absolute bottom-[6%] left-1/2 h-[6%] w-[18%] -translate-x-1/2 bg-[rgba(5,13,20,0.96)]" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }} />
      {children}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 86px rgba(0,4,9,0.52)' }} />
    </div>
  );
}

function JariloAdministrativeDistrictBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[rgba(40,52,59,0.98)]">
      <div className="absolute inset-[6%] border border-[rgba(225,231,223,0.24)] bg-[rgba(89,105,110,0.3)]" style={{ clipPath: 'polygon(4% 0, 96% 0, 100% 7%, 100% 93%, 96% 100%, 4% 100%, 0 93%, 0 7%)' }} />
      <div className="absolute inset-x-[8%] top-[13%] h-[24%] border border-[rgba(231,219,181,0.25)] bg-[rgba(66,76,79,0.72)]" style={{ clipPath: 'polygon(5% 20%, 20% 20%, 24% 0, 31% 20%, 47% 20%, 50% 3%, 56% 20%, 78% 20%, 82% 5%, 88% 20%, 95% 20%, 100% 100%, 0 100%)' }} />
      <div className="absolute left-[12%] right-[12%] top-[43%] h-[9%] border-y border-[rgba(223,227,213,0.18)] bg-[rgba(25,33,37,0.72)]" />
      <div className="absolute bottom-[11%] left-[10%] h-[29%] w-[31%] border border-[rgba(210,219,213,0.2)] bg-[rgba(74,86,88,0.62)]" />
      <div className="absolute bottom-[10%] right-[9%] h-[31%] w-[33%] border border-[rgba(222,193,137,0.24)] bg-[rgba(78,70,60,0.66)]" style={{ clipPath: 'polygon(0 12%, 80% 0, 100% 14%, 100% 100%, 0 100%)' }} />
      {[17, 30, 48, 66, 82].map((left) => <div key={left} className="absolute top-[27%] h-1.5 w-2 bg-[rgba(235,193,104,0.52)]" style={{ left: `${left}%`, boxShadow: '0 0 10px rgba(235,193,104,0.25)' }} />)}
      <div className="absolute bottom-[6%] left-1/2 h-[8%] w-[18%] -translate-x-1/2 bg-[rgba(19,25,28,0.94)]" style={{ clipPath: 'polygon(10% 0, 90% 0, 100% 100%, 0 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(235,242,238,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(235,242,238,0.035) 1px, transparent 1px)', backgroundSize: '38px 38px', boxShadow: 'inset 0 0 82px rgba(7,12,15,0.58)' }} />
    </div>
  );
}

function JariloBoulderTownBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[rgba(29,25,24,0.99)]">
      <div className="absolute inset-[6%] border border-[rgba(205,156,91,0.22)] bg-[rgba(58,45,38,0.58)]" style={{ clipPath: 'polygon(3% 4%, 24% 0, 43% 5%, 67% 1%, 96% 6%, 100% 94%, 77% 100%, 52% 96%, 28% 100%, 0 92%)' }} />
      <div className="absolute left-[9%] top-[16%] h-[28%] w-[34%] border border-[rgba(199,151,88,0.24)] bg-[rgba(74,52,39,0.66)]" />
      <div className="absolute right-[9%] top-[14%] h-[31%] w-[35%] border border-[rgba(187,143,88,0.2)] bg-[rgba(55,48,43,0.7)]" style={{ clipPath: 'polygon(0 12%, 79% 0, 100% 14%, 100% 100%, 0 100%)' }} />
      <div className="absolute bottom-[12%] left-[21%] right-[21%] h-[31%] border border-[rgba(207,154,82,0.25)] bg-[rgba(70,47,34,0.68)]" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 18%, 96% 100%, 4% 100%, 0 18%)' }} />
      <div className="absolute left-[8%] right-[8%] top-1/2 h-[7%] border-y border-[rgba(198,144,78,0.2)] bg-[rgba(18,17,17,0.76)]" />
      {[18, 38, 62, 82].map((left) => <div key={left} className="absolute top-[9%] h-[82%] w-px bg-[rgba(197,139,72,0.14)]" style={{ left: `${left}%` }} />)}
      <div className="absolute bottom-[18%] left-1/2 h-[12%] w-[18%] -translate-x-1/2 rounded-t-full border border-[rgba(222,143,62,0.35)] bg-[rgba(200,94,37,0.22)]" style={{ boxShadow: '0 0 24px rgba(211,103,40,0.16)' }} />
      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(rgba(223,173,105,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(223,173,105,0.035) 1px, transparent 1px)', backgroundSize: '34px 34px', boxShadow: 'inset 0 0 90px rgba(3,3,3,0.66)' }} />
    </div>
  );
}

function HertaOfficeInteriorBackdrop() {
  return (
    <HertaStationInteriorShell>
      <div className="absolute left-[6.5%] top-[32%] h-[36%] w-[15%] rounded-[50%] border-[7px] border-[rgba(128,207,222,0.42)] bg-[rgba(10,28,38,0.78)]" style={{ boxShadow: 'inset 0 0 24px rgba(62,182,205,0.2), 0 0 22px rgba(62,182,205,0.12)' }}>
        <div className="absolute inset-[19%] rounded-full border border-[rgba(159,223,233,0.38)] bg-[rgba(51,154,176,0.16)]" />
        <div className="absolute inset-[40%] rounded-full bg-[rgba(211,180,104,0.36)]" />
        <div className="absolute left-1/2 top-[-13%] h-[18%] w-[30%] -translate-x-1/2 border border-[rgba(152,209,218,0.26)] bg-[rgba(17,38,47,0.9)]" />
      </div>
      <div className="absolute left-[22%] right-[7%] top-[18%] h-[20%] border border-[rgba(149,203,211,0.2)] bg-[rgba(18,34,42,0.68)]">
        <div className="absolute inset-x-[3%] bottom-[10%] top-[12%] flex items-end justify-around gap-[2%]">
          {[0, 1, 2, 3, 4, 5].map((portrait) => (
            <div key={`top-${portrait}`} className="relative h-full w-[11%] border border-[rgba(137,211,224,0.34)] bg-[rgba(50,134,153,0.1)]" style={{ boxShadow: 'inset 0 0 13px rgba(76,191,211,0.12)' }}>
              <div className="absolute left-1/2 top-[18%] h-[26%] w-[34%] -translate-x-1/2 rounded-full border border-[rgba(182,228,234,0.28)]" />
              <div className="absolute bottom-[12%] left-[20%] right-[20%] h-[32%] border-x border-t border-[rgba(182,228,234,0.22)]" style={{ clipPath: 'polygon(22% 0, 78% 0, 100% 100%, 0 100%)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-[13%] left-[23%] right-[6%] h-[21%] border border-[rgba(149,203,211,0.2)] bg-[rgba(18,34,42,0.68)]">
        <div className="absolute inset-x-[3%] bottom-[10%] top-[12%] flex items-end justify-around gap-[2%]">
          {[0, 1, 2, 3, 4, 5].map((portrait) => (
            <div key={`bottom-${portrait}`} className="relative h-full w-[11%] border border-[rgba(137,211,224,0.34)] bg-[rgba(50,134,153,0.1)]" style={{ boxShadow: 'inset 0 0 13px rgba(76,191,211,0.12)' }}>
              <div className="absolute left-1/2 top-[18%] h-[26%] w-[34%] -translate-x-1/2 rounded-full border border-[rgba(182,228,234,0.28)]" />
              <div className="absolute bottom-[12%] left-[20%] right-[20%] h-[32%] border-x border-t border-[rgba(182,228,234,0.22)]" style={{ clipPath: 'polygon(22% 0, 78% 0, 100% 100%, 0 100%)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute left-[34%] top-[42%] h-[17%] w-[31%] border border-[rgba(172,206,208,0.14)] bg-[rgba(15,29,36,0.28)]" style={{ clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)' }}>
        <div className="absolute left-[12%] right-[12%] top-1/2 h-px bg-[rgba(132,199,210,0.14)]" />
      </div>
    </HertaStationInteriorShell>
  );
}

function HertaCurioCollectionInteriorBackdrop() {
  return (
    <HertaStationInteriorShell>
      <div className="absolute left-[8%] top-[18%] h-[32%] w-[34%] border border-[rgba(142,210,222,0.2)] bg-[rgba(12,27,36,0.48)]" style={{ clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 92%)' }}>
        <div className="absolute inset-x-[7%] bottom-[12%] top-[12%] flex items-end justify-between gap-[4%]">
          {[0, 1, 2].map((display) => (
            <div key={`curio-left-${display}`} className="relative h-full flex-1 border border-[rgba(118,204,219,0.32)] bg-[rgba(34,82,94,0.2)]">
              <div className="absolute left-1/2 top-[13%] h-[31%] w-[42%] -translate-x-1/2 rounded-full border border-[rgba(205,229,231,0.3)]" />
              <div className="absolute bottom-[11%] left-[12%] right-[12%] h-[28%] border border-[rgba(224,190,118,0.28)] bg-[rgba(165,120,44,0.1)]" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute right-[8%] top-[18%] h-[32%] w-[34%] border border-[rgba(142,210,222,0.2)] bg-[rgba(12,27,36,0.48)]" style={{ clipPath: 'polygon(0 0, 94% 0, 100% 92%, 6% 100%)' }}>
        <div className="absolute inset-x-[7%] bottom-[12%] top-[12%] flex items-end justify-between gap-[4%]">
          {[0, 1, 2].map((display) => (
            <div key={`curio-right-${display}`} className="relative h-full flex-1 border border-[rgba(118,204,219,0.32)] bg-[rgba(34,82,94,0.2)]">
              <div className="absolute left-1/2 top-[13%] h-[31%] w-[42%] -translate-x-1/2 rounded-full border border-[rgba(205,229,231,0.3)]" />
              <div className="absolute bottom-[11%] left-[12%] right-[12%] h-[28%] border border-[rgba(224,190,118,0.28)] bg-[rgba(165,120,44,0.1)]" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-[12%] left-1/2 h-[35%] w-[42%] -translate-x-1/2 border-[8px] border-[rgba(190,210,210,0.24)] bg-[rgba(15,27,34,0.82)]" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }}>
        <div className="absolute inset-[10%] border border-[rgba(111,205,220,0.38)] bg-[rgba(52,145,166,0.12)]" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }} />
        <div className="absolute left-1/2 top-[22%] h-[32%] w-[25%] -translate-x-1/2 rounded-full border border-[rgba(224,190,118,0.36)] bg-[rgba(165,120,44,0.13)]" />
        <div className="absolute bottom-[12%] left-[15%] right-[15%] h-[12%] bg-[rgba(112,191,205,0.16)]" />
      </div>
    </HertaStationInteriorShell>
  );
}

function GuestRoomInteriorBackdrop({ variant }: { variant: 'danheng' | 'march' | 'himeko' | 'welt' }) {
  const accent = variant === 'march' ? 'rgba(196,171,184,0.42)' : variant === 'himeko' ? 'rgba(178,147,117,0.4)' : variant === 'welt' ? 'rgba(132,145,156,0.42)' : 'rgba(113,137,142,0.4)';
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[12%] top-[45%] h-[30%] w-[28%] border border-[rgba(238,231,206,0.32)]" style={{ background: accent }}>
        <div className="absolute left-[8%] right-[8%] top-[12%] h-[22%] bg-[rgba(238,231,206,0.18)]" />
      </div>
      <div className="absolute right-[14%] top-[24%] h-[23%] w-[30%] border border-[rgba(238,231,206,0.3)] bg-[rgba(34,37,35,0.74)]">
        <div className="absolute -bottom-3 left-[12%] h-3 w-1 bg-[rgba(238,231,206,0.3)]" />
        <div className="absolute -bottom-3 right-[12%] h-3 w-1 bg-[rgba(238,231,206,0.3)]" />
      </div>
      <div className="absolute right-[10%] top-[55%] h-[22%] w-[16%] border border-[rgba(238,231,206,0.26)] bg-[rgba(44,47,44,0.76)]" />
      <div className="absolute left-[48%] top-[29%] h-[46%] w-px bg-[rgba(238,231,206,0.18)]" />
      {variant === 'march' && <div className="absolute right-[15%] top-[17%] h-16 w-[30%] border border-[rgba(238,231,206,0.2)]" style={{ background: 'repeating-linear-gradient(90deg, rgba(238,231,206,0.18) 0 18px, transparent 18px 26px)' }} />}
      {variant === 'himeko' && <div className="absolute left-[45%] top-[58%] h-16 w-16 rounded-full border border-[rgba(238,231,206,0.32)] bg-[rgba(130,94,69,0.2)]" />}
      {variant === 'welt' && <div className="absolute left-[15%] top-[24%] h-16 w-14 border border-[rgba(238,231,206,0.24)] bg-[rgba(38,41,40,0.7)]" />}
    </InteriorBackdropShell>
  );
}

function ConductorConsoleInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[13%] top-[24%] h-[28%] w-[38%] rounded-r-[34px] border border-[rgba(238,231,206,0.34)] bg-[rgba(30,35,34,0.76)]" />
      <div className="absolute left-[17%] top-[31%] h-3 w-[28%] rounded-full bg-[rgba(130,188,190,0.34)]" />
      <div className="absolute right-[14%] top-[25%] h-[30%] w-[28%] rounded-full border-[5px] border-[rgba(238,231,206,0.28)] bg-[rgba(120,169,176,0.12)]" />
      <div className="absolute left-[38%] top-[59%] h-20 w-24 rounded-[20px] border border-[rgba(238,231,206,0.24)] bg-[rgba(44,47,44,0.78)]" />
    </InteriorBackdropShell>
  );
}

function ConductorQuartersInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[13%] top-[24%] h-[34%] w-[26%] border border-[rgba(238,231,206,0.28)] bg-[rgba(41,44,42,0.82)]" />
      <div className="absolute left-[14%] top-[31%] h-px w-[24%] bg-[rgba(238,231,206,0.2)]" />
      <div className="absolute right-[15%] top-[49%] h-[24%] w-[32%] rounded-[28px] border border-[rgba(238,231,206,0.3)] bg-[rgba(192,176,132,0.16)]" />
    </InteriorBackdropShell>
  );
}

function PartyBarInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border-[12px] border-[rgba(238,231,206,0.36)] bg-[rgba(32,35,34,0.72)]" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(238,231,206,0.22)] bg-[rgba(162,126,82,0.16)]" />
      <div className="absolute right-[12%] top-[20%] h-[24%] w-[22%] border border-[rgba(238,231,206,0.24)] bg-[rgba(43,46,44,0.78)]" />
    </InteriorBackdropShell>
  );
}

function PartyLoungeInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[12%] top-[45%] h-[24%] w-[30%] rounded-r-[28px] border border-[rgba(238,231,206,0.28)] bg-[rgba(122,113,98,0.18)]" />
      <div className="absolute right-[13%] top-[30%] h-24 w-28 rounded-[18px] border border-[rgba(238,231,206,0.3)] bg-[rgba(42,45,43,0.78)]" />
      <div className="absolute right-[16%] top-[22%] h-px w-[22%] bg-[rgba(129,184,194,0.28)]" />
    </InteriorBackdropShell>
  );
}

function ObservationSofaInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[12%] top-[44%] h-[26%] w-[38%] rounded-r-[38px] border border-[rgba(238,231,206,0.3)] bg-[rgba(110,112,104,0.22)]" />
      <div className="absolute right-[13%] top-[18%] h-[48%] w-[28%] rounded-[50%] border-[6px] border-[rgba(132,187,198,0.28)] bg-[rgba(70,111,124,0.16)]" />
    </InteriorBackdropShell>
  );
}

function ObservationTableInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[28%] top-[34%] h-[32%] w-[38%] rounded-[42px] border-[7px] border-[rgba(238,231,206,0.34)] bg-[rgba(43,46,44,0.72)]" />
      <div className="absolute right-[14%] top-[23%] h-[24%] w-[22%] border border-[rgba(238,231,206,0.28)] bg-[rgba(58,65,63,0.74)]" />
      <div className="absolute right-[18%] top-[31%] h-2 w-[14%] rounded-full bg-[rgba(123,185,195,0.28)]" />
    </InteriorBackdropShell>
  );
}

function GenericInteriorBackdrop() {
  return (
    <InteriorBackdropShell>
      <div className="absolute left-[18%] right-[18%] top-[28%] h-[44%] border border-[rgba(238,231,206,0.24)] bg-[rgba(41,44,42,0.72)]" />
    </InteriorBackdropShell>
  );
}
function MapBreadcrumbs({ items, tone = 'dark' }: {
  items: Array<{ id: string; label: string; onClick?: () => void }>;
  tone?: 'light' | 'dark';
}) {
  const color = tone === 'light' ? 'rgba(40,43,42,0.82)' : 'rgba(241,239,231,0.84)';
  const muted = tone === 'light' ? 'rgba(40,43,42,0.48)' : 'rgba(241,239,231,0.48)';
  return (
    <nav aria-label="地图路径" className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[11px] font-bold tracking-[0.12em]" style={{ color, scrollbarWidth: 'none' }}>
      {items.map((item, index) => (
        <span key={item.id} className="flex shrink-0 items-center gap-1">
          {index > 0 && <span style={{ color: muted }}>/</span>}
          {item.onClick ? (
            <button type="button" onClick={item.onClick} className="max-w-[150px] truncate px-1 py-0.5 transition-all hover:brightness-125">
              {item.label}
            </button>
          ) : (
            <span className="max-w-[180px] truncate px-1 py-0.5">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
function InfoPanel({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  return (
    <section
      className="px-3 py-3"
      style={{
        clipPath: panelClip,
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.94), rgba(var(--tj-surface-strong), 0.9))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.58)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-serif text-[15px] font-bold tracking-[0.12em]">{title}</h3>
        <span className="shrink-0 text-[10px] font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>{code}</span>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function MiniTag({ children }: { children: ReactNode }) {
  return (
    <span className="px-2 py-1 text-[10px] font-bold tracking-[0.08em]" style={{ clipPath: chipClip, background: 'rgba(var(--tj-accent-primary), 0.12)', color: 'rgba(var(--tj-text-primary), 0.82)' }}>
      {children}
    </span>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-h-[96px] px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)' }}>
      <div className="text-[11px] font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>{title}</div>
      <div className="mt-2 max-h-[118px] space-y-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>无</div>
        ) : items.slice(0, 12).map((item) => (
          <div key={item} className="truncate text-[12px]" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>{item}</div>
        ))}
        {items.length > 12 && <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>另有 {items.length - 12} 项</div>}
      </div>
    </div>
  );
}

function PackageCoverPreview({ asset, title }: { asset?: string; title: string }) {
  return (
    <div className="min-h-[112px] overflow-hidden px-3 py-3" style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.72), rgba(var(--tj-tech-cyan), 0.08))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)' }}>
      <div className="text-[11px] font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>封面预览</div>
      <div className="mt-2 flex min-h-[82px] items-center justify-center overflow-hidden" style={{ clipPath: chipClip, background: 'radial-gradient(circle at 50% 42%, rgba(var(--tj-tech-cyan), 0.16), rgba(var(--tj-surface-strong), 0.66) 62%, rgba(var(--tj-bg-primary), 0.72))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.24)' }}>
        {asset ? (
          <img src={asset} alt={`${title} 封面`} className="max-h-[96px] max-w-full object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.32)]" draggable={false} />
        ) : (
          <div className="px-4 text-center font-serif text-[13px] font-bold tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            暂无封面
          </div>
        )}
      </div>
    </div>
  );
}

function buildInstallDestinationSummary(
  draft: StarMapPackageDraft,
  installPlan: StarMapPackageInstallPlan,
  customWaypoints: StarMapWaypoint[],
): Array<{ id: string; name: string; locationCount: number }> {
  const waypointNameById = new Map<string, string>();
  [...STAR_MAP_WAYPOINTS, ...customWaypoints, ...draft.waypoints].forEach((waypoint) => {
    waypointNameById.set(waypoint.id, waypoint.name);
  });

  const counts = new Map<string, number>();
  installPlan.installLocations.forEach((location) => {
    counts.set(location.waypointId, (counts.get(location.waypointId) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([id, locationCount]) => ({
      id,
      name: waypointNameById.get(id) ?? `未知航点：${id}`,
      locationCount,
    }))
    .sort((left, right) => right.locationCount - left.locationCount || left.name.localeCompare(right.name, 'zh-CN'));
}

function getPackageInstalledTime(record: 星轨航图地图包记录): number {
  const time = new Date(record.installedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getDescendantLocationIds(locations: StarMapLocation[], parentId: string): Set<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const location of locations) {
      if (descendants.has(location.id)) continue;
      if (location.parentId === parentId || (location.parentId && descendants.has(location.parentId))) {
        descendants.add(location.id);
        changed = true;
      }
    }
  }
  return descendants;
}

function getStarMapLocationDepth(location: StarMapLocation, locations: StarMapLocation[]): number {
  const locationById = new Map(locations.map((item) => [item.id, item]));
  const visited = new Set<string>([location.id]);
  let depth = 1;
  let cursor = location.parentId;
  while (cursor) {
    if (visited.has(cursor)) return Number.POSITIVE_INFINITY;
    visited.add(cursor);
    const parent = locationById.get(cursor);
    if (!parent) break;
    depth += 1;
    cursor = parent.parentId;
  }
  return depth;
}

function getStarMapParentDepth(parentId: string | undefined, locations: StarMapLocation[]): number {
  if (!parentId) return 0;
  const parent = locations.find((location) => location.id === parentId);
  return parent ? getStarMapLocationDepth(parent, locations) : Number.POSITIVE_INFINITY;
}
function normalizeSearchText(value: string): string {
  return value.trim().replace(/[\s·・「」『』【】\[\]()（）_-]+/g, '').toLocaleLowerCase('zh-CN');
}

function matchSearchTarget(query: string, values: string[]): boolean {
  return values.some((value) => {
    const normalized = normalizeSearchText(value);
    return normalized.includes(query) || query.includes(normalized);
  });
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <label className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-1 text-[11px] font-bold tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
      <span>{label}</span>
      <input
        type="number"
        min={6}
        max={94}
        value={Math.round(value)}
        onChange={(event) => {
          const numeric = Number(event.target.value);
          if (Number.isFinite(numeric)) onChange(Math.max(6, Math.min(94, Math.round(numeric))));
        }}
        className="w-full rounded-none px-2 py-1.5 text-[12px] outline-none"
        style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)', color: 'rgb(var(--tj-text-primary))' }}
      />
    </label>
  );
}

function AstralExpressBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 26%, rgba(var(--tj-tech-cyan), 0.16), transparent 22%), radial-gradient(circle at 86% 66%, rgba(var(--tj-amber-soft), 0.16), transparent 24%), linear-gradient(90deg, rgba(255,255,255,0.02), transparent 20%, rgba(255,255,255,0.035) 52%, transparent 78%)',
        }}
      />
      <div className="absolute left-[5%] right-[5%] top-[13%] h-px bg-[rgba(var(--tj-amber-soft),0.26)]" />
      <div className="absolute left-[5%] right-[5%] bottom-[13%] h-px bg-[rgba(var(--tj-tech-cyan),0.18)]" />
      <div className="absolute left-[8%] right-[8%] top-[17%] h-5" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-amber-soft),0.12), transparent)' }} />
      <div className="absolute left-[10%] right-[10%] bottom-[18%] h-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-tech-cyan),0.1), transparent)' }} />
      {[14, 24, 34, 44, 54, 64, 74, 84].map((left, index) => (
        <div
          key={left}
          className="absolute top-[10%] h-[80%] w-px"
          style={{
            left: `${left}%`,
            background: index % 2 === 0
              ? 'linear-gradient(180deg, transparent, rgba(var(--tj-amber-soft),0.22), transparent)'
              : 'linear-gradient(180deg, transparent, rgba(var(--tj-tech-cyan),0.14), transparent)',
          }}
        />
      ))}
      {[16, 27, 38, 49, 60, 71, 82].map((left, index) => (
        <div
          key={left}
          className="absolute top-[24%] h-7 w-12 -translate-x-1/2 rounded-[4px] border border-white/10 bg-white/[0.035]"
          style={{
            left: `${left}%`,
            boxShadow: index % 2 === 0 ? '0 0 18px rgba(var(--tj-tech-cyan),0.08)' : '0 0 18px rgba(var(--tj-amber-soft),0.08)',
          }}
        />
      ))}
      {[18, 32, 46, 60, 74].map((left) => (
        <div
          key={left}
          className="absolute bottom-[23%] h-px w-16 -translate-x-1/2 rotate-[-14deg] bg-[rgba(var(--tj-amber-soft),0.18)]"
          style={{ left: `${left}%` }}
        />
      ))}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 90px rgba(0,0,0,0.48)' }} />
    </div>
  );
}

function TrainLocalBackdrop({ rootLocationId }: { rootLocationId?: string }) {
  if (rootLocationId === 'express_guest_corridor') return <GuestCarLocalBackdrop />;
  if (rootLocationId === 'express_party_car') return <PartyCarLocalBackdrop />;
  if (rootLocationId === 'express_conductor_room') return <ConductorRoomLocalBackdrop />;
  if (rootLocationId === 'express_observation_car') return <ObservationCarLocalBackdrop />;
  return <GenericTrainLocalBackdrop />;
}

function LocalBackdropShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-[14px]" style={{ clipPath: 'polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px), 0 16px)', background: 'linear-gradient(145deg, rgba(39,43,42,0.98), rgba(70,73,69,0.94) 48%, rgba(31,35,35,0.98))', boxShadow: 'inset 0 0 0 1px rgba(238,232,211,0.18), 0 18px 42px rgba(10,13,14,0.18)' }} />
      <div className="absolute inset-[22px]" style={{ clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)', background: 'linear-gradient(135deg, rgba(231,229,219,0.94), rgba(195,194,186,0.9) 48%, rgba(225,222,210,0.92))', boxShadow: 'inset 0 0 0 1px rgba(42,47,46,0.34), inset 0 0 34px rgba(255,255,255,0.28)' }} />
      <div className="absolute inset-[30px] opacity-[0.22]" style={{ background: 'linear-gradient(rgba(49,55,54,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(49,55,54,0.11) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
      <div className="absolute left-[7%] right-[7%] top-[13%] h-px bg-[rgba(52,58,57,0.2)]" />
      <div className="absolute bottom-[12%] left-[7%] right-[7%] h-px bg-[rgba(52,58,57,0.18)]" />
      <div className="absolute left-[8%] top-[9%] h-1 w-[18%] bg-[rgba(99,159,174,0.42)]" />
      <div className="absolute right-[8%] top-[9%] h-1 w-[9%] bg-[rgba(148,115,61,0.34)]" />
      {children}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 74px rgba(22,27,27,0.2)' }} />
    </div>
  );
}

function GuestCarLocalBackdrop() {
  return (
    <LocalBackdropShell>
      <div className="absolute left-[5%] right-[5%] top-[25%] h-[50%] bg-[rgba(42,45,44,0.8)]" style={{ clipPath: 'polygon(0 8%, 3% 0, 97% 0, 100% 8%, 100% 92%, 97% 100%, 3% 100%, 0 92%)' }} />
      <div className="absolute left-[8%] right-[8%] top-[59%] h-[11%] border-y border-[rgba(238,238,232,0.22)] bg-[rgba(239,239,232,0.12)]" />
      <div className="absolute left-[9%] right-[9%] top-[25%] h-px bg-[rgba(238,238,232,0.34)]" />
      {[20, 42, 64, 84].map((left) => (
        <div key={left} className="absolute top-[27%] h-[27%] w-[14%] -translate-x-1/2 border border-[rgba(238,238,232,0.4)] bg-[rgba(239,239,232,0.08)]" style={{ left: `${left}%` }}>
          <div className="absolute bottom-[-8px] left-1/2 h-2 w-11 -translate-x-1/2 bg-[rgba(229,225,209,0.72)]" />
          <div className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[rgba(112,178,190,0.42)]" />
        </div>
      ))}
      <div className="absolute left-[8%] right-[8%] bottom-[18%] h-px bg-[rgba(48,52,50,0.24)]" />
      <div className="absolute left-[7%] top-[42%] h-[16%] w-[3%] bg-[rgba(215,209,190,0.56)]" />
      <div className="absolute right-[7%] top-[42%] h-[16%] w-[3%] bg-[rgba(215,209,190,0.56)]" />
    </LocalBackdropShell>
  );
}

function PartyCarLocalBackdrop() {
  return (
    <LocalBackdropShell>
      <div className="absolute left-[5%] right-[5%] top-[22%] h-[58%] bg-[rgba(42,45,44,0.82)]" style={{ clipPath: 'polygon(0 0, 14% 0, 14% 22%, 26% 22%, 30% 8%, 70% 8%, 74% 22%, 88% 22%, 88% 0, 100% 0, 100% 100%, 86% 100%, 86% 76%, 74% 76%, 70% 92%, 30% 92%, 26% 76%, 12% 76%, 12% 100%, 0 100%)' }} />
      <div className="absolute left-1/2 top-[55%] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px] border-[rgba(238,238,232,0.54)] bg-[rgba(238,238,232,0.14)]" />
      <div className="absolute left-[38%] right-[38%] top-[25%] h-12 rounded-t-[24px] border border-[rgba(238,238,232,0.38)] bg-[rgba(238,238,232,0.12)]" />
      <div className="absolute left-[18%] top-[60%] h-16 w-28 rounded-[24px] border border-[rgba(238,238,232,0.22)] bg-[rgba(238,238,232,0.08)]" />
      <div className="absolute right-[18%] top-[60%] h-16 w-28 rounded-[24px] border border-[rgba(238,238,232,0.22)] bg-[rgba(238,238,232,0.08)]" />
      <div className="absolute right-[10%] top-[18%] h-[28%] w-[11%] rounded-bl-full border-l-[5px] border-b-[5px] border-[rgba(238,238,232,0.62)]" />
    </LocalBackdropShell>
  );
}

function ConductorRoomLocalBackdrop() {
  const frame = 'polygon(4% 0, 96% 0, 100% 10%, 100% 90%, 96% 100%, 4% 100%, 0 90%, 0 10%)';
  return (
    <LocalBackdropShell>
      <div className="absolute left-[8%] right-[8%] top-[24%] h-[55%] bg-[rgba(42,45,44,0.8)]" style={{ clipPath: 'polygon(0 0, 45% 0, 45% 18%, 100% 18%, 100% 100%, 0 100%)' }} />
      <div className="absolute left-[11%] top-[29%] h-24 w-[26%] rounded-[18px] border border-[rgba(238,238,232,0.36)] bg-[rgba(238,238,232,0.1)]" />
      <div className="absolute left-[14%] top-[36%] h-3 w-[20%] rounded-full bg-[rgba(238,238,232,0.48)]" />
      <div className="absolute right-[15%] top-[48%] h-28 w-[28%] rounded-[22px] border border-[rgba(238,238,232,0.24)] bg-[rgba(238,238,232,0.08)]" />
      <div className="absolute left-[44%] top-[48%] h-px w-[24%] bg-[rgba(238,238,232,0.32)]" />
    </LocalBackdropShell>
  );
}

function ObservationCarLocalBackdrop() {
  const frame = 'polygon(4% 0, 96% 0, 100% 10%, 100% 90%, 96% 100%, 4% 100%, 0 90%, 0 10%)';
  return (
    <LocalBackdropShell>
      <div className="absolute inset-[7%]" style={{ clipPath: frame, background: 'linear-gradient(145deg, rgba(234,232,222,0.96), rgba(198,197,188,0.94) 50%, rgba(229,225,213,0.92))', boxShadow: 'inset 0 0 0 1px rgba(44,49,48,0.28), inset 0 0 30px rgba(255,255,255,0.3)' }} />
      <div className="absolute left-[9%] right-[9%] top-[18%] h-[64%] bg-[rgba(43,47,46,0.91)]" style={{ clipPath: 'polygon(0 8%, 4% 0, 96% 0, 100% 8%, 100% 92%, 96% 100%, 4% 100%, 0 92%)' }} />
      <div className="absolute left-[10%] top-[22%] h-[56%] w-[13%] rounded-r-[58px] border-y border-r-[6px] border-[rgba(229,225,210,0.66)] bg-[rgba(229,225,210,0.08)]" />
      <div className="absolute left-[12%] bottom-[20%] h-[18%] w-[12%] rounded-br-[50px] border-b-[5px] border-r-[5px] border-[rgba(229,225,210,0.48)]" />
      <div className="absolute left-[35%] top-[19%] h-[26%] w-[30%]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 34%, 86% 56%, 72% 78%, 63% 100%, 37% 100%, 28% 78%, 14% 56%, 0 34%)', background: 'linear-gradient(180deg, rgba(232,228,212,0.32), rgba(232,228,212,0.12))', boxShadow: 'inset 0 0 0 1px rgba(232,228,212,0.34)' }} />
      <div className="absolute left-[39%] top-[27%] h-[16%] w-[22%] rounded-t-full border-x-[7px] border-t-[7px] border-[rgba(236,232,216,0.72)]" />
      <div className="absolute bottom-[19%] left-[35%] h-[26%] w-[30%]" style={{ clipPath: 'polygon(37% 0, 63% 0, 72% 22%, 86% 44%, 100% 66%, 100% 100%, 0 100%, 0 66%, 14% 44%, 28% 22%)', background: 'linear-gradient(0deg, rgba(232,228,212,0.32), rgba(232,228,212,0.12))', boxShadow: 'inset 0 0 0 1px rgba(232,228,212,0.34)' }} />
      <div className="absolute bottom-[27%] left-[39%] h-[16%] w-[22%] rounded-b-full border-x-[7px] border-b-[7px] border-[rgba(236,232,216,0.72)]" />
      <div className="absolute left-[45%] top-[42%] h-[16%] w-[10%] rounded-full border-[5px] border-[rgba(226,221,204,0.52)] bg-[rgba(226,221,204,0.08)]" />
      <div className="absolute left-[48%] top-[44%] h-[12%] w-[4%] rounded-full border border-[rgba(104,174,188,0.4)]" />
      <div className="absolute right-[12%] top-[26%] h-[48%] w-[20%] rounded-[18px] border border-[rgba(231,226,207,0.28)] bg-[rgba(231,226,207,0.07)]" />
      <div className="absolute right-[15%] top-[35%] h-px w-[14%] bg-[rgba(231,226,207,0.3)]" />
      <div className="absolute right-[15%] top-1/2 h-px w-[14%] bg-[rgba(101,171,184,0.32)]" />
      <div className="absolute right-[15%] bottom-[35%] h-px w-[14%] bg-[rgba(231,226,207,0.22)]" />
      <div className="absolute left-[7%] top-[43%] h-[14%] w-[3%] bg-[rgba(217,211,190,0.56)]" />
      <div className="absolute right-[7%] top-[43%] h-[14%] w-[3%] bg-[rgba(217,211,190,0.56)]" />
    </LocalBackdropShell>
  );
}

function GenericTrainLocalBackdrop() {
  return (
    <LocalBackdropShell>
      <div className="absolute left-[8%] right-[8%] top-[34%] h-[36%] bg-[rgba(42,45,44,0.78)]" />
    </LocalBackdropShell>
  );
}

const LUOFU_LOCATION_ORDER = [
  'luofu_central_starskiff_haven',
  'luofu_cloudford',
  'luofu_stargazer_navalia',
  'luofu_exalting_sanctum',
  'luofu_aurum_alley',
  'luofu_divination_commission',
  'luofu_artisanship_commission',
  'luofu_fyxestroll_garden',
  'luofu_alchemy_commission',
  'luofu_scalegorge_waterscape',
  'luofu_shackling_prison',
  'luofu_skysplitter',
] as const;

function LuofuLocationPager({
  locations,
  selectedLocationId,
  currentLocationId,
  onSelect,
}: {
  locations: StarMapLocation[];
  selectedLocationId: string | null;
  currentLocationId: string | null;
  onSelect: (location: StarMapLocation) => void;
}) {
  const pageSize = 4;
  const orderedLocations = useMemo(() => {
    const order = new Map<string, number>(LUOFU_LOCATION_ORDER.map((id, index) => [id, index]));
    return [...locations].sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
  }, [locations]);
  const pageCount = Math.max(1, Math.ceil(orderedLocations.length / pageSize));
  const selectedIndex = orderedLocations.findIndex((location) => location.id === selectedLocationId);
  const currentIndex = orderedLocations.findIndex((location) => location.id === currentLocationId);
  const initialIndex = selectedIndex >= 0 ? selectedIndex : currentIndex;
  const [page, setPage] = useState(() => Math.max(0, Math.floor(Math.max(0, initialIndex) / pageSize)));

  useEffect(() => {
    const focusIndex = selectedIndex >= 0 ? selectedIndex : currentIndex;
    if (focusIndex >= 0) setPage(Math.floor(focusIndex / pageSize));
  }, [currentLocationId, selectedLocationId]);

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const pages = Array.from({ length: pageCount }, (_, pageIndex) => orderedLocations.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));
  const nodePositions = [
    { x: 29, y: 30 },
    { x: 71, y: 30 },
    { x: 29, y: 70 },
    { x: 71, y: 70 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-luofu-location-pager="true">
      <div className="pointer-events-auto absolute inset-x-12 bottom-[12%] top-[18%] overflow-hidden">
        <div className="flex h-full transition-transform duration-500 ease-out" style={{ width: `${pageCount * 100}%`, transform: `translateX(-${page * (100 / pageCount)}%)` }}>
          {pages.map((pageLocations, pageIndex) => (
            <div key={pageIndex} className="relative h-full" style={{ width: `${100 / pageCount}%` }}>
              {pageLocations.map((location, index) => (
                <TrainLocationNode
                  key={location.id}
                  location={location}
                  position={nodePositions[index]}
                  selected={location.id === selectedLocationId}
                  current={location.id === currentLocationId}
                  childCount={0}
                  onSelect={() => onSelect(location)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPage((value) => Math.max(0, value - 1))}
        disabled={page === 0}
        className="pointer-events-auto absolute left-3 top-1/2 flex h-14 w-9 -translate-y-1/2 items-center justify-center text-xl transition-all hover:brightness-125 disabled:opacity-25"
        style={{ clipPath: chipClip, background: 'rgba(4,18,19,0.8)', color: 'rgba(222,181,98,0.94)', boxShadow: 'inset 0 0 0 1px rgba(207,168,91,0.3)' }}
        aria-label="向左浏览罗浮区域"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        disabled={page >= pageCount - 1}
        className="pointer-events-auto absolute right-3 top-1/2 flex h-14 w-9 -translate-y-1/2 items-center justify-center text-xl transition-all hover:brightness-125 disabled:opacity-25"
        style={{ clipPath: chipClip, background: 'rgba(4,18,19,0.8)', color: 'rgba(222,181,98,0.94)', boxShadow: 'inset 0 0 0 1px rgba(207,168,91,0.3)' }}
        aria-label="向右浏览罗浮区域"
      >
        ›
      </button>
      <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 items-center gap-3 text-[9px] font-bold tracking-[0.18em] text-white/45">
        <span>{String(page + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span>
        <span className="flex gap-1.5">
          {pages.map((_, index) => <span key={index} className="h-1.5 w-5" style={{ background: index === page ? 'rgba(224,181,96,0.82)' : 'rgba(142,184,165,0.2)' }} />)}
        </span>
      </div>
    </div>
  );
}

function TrainLocationNode({
  location,
  position,
  selected,
  current,
  childCount,
  onSelect,
}: {
  location: StarMapLocation;
  position?: { x: number; y: number };
  selected: boolean;
  current: boolean;
  childCount: number;
  onSelect: () => void;
}) {
  const sourceLabel = SOURCE_LABELS[location.source];
  const kindLabel = LOCATION_KIND_LABELS[location.kind];
  const accent = current
    ? 'rgba(var(--tj-tech-cyan), 0.92)'
    : selected
      ? 'rgba(var(--tj-amber-soft), 0.92)'
      : location.source === 'fan'
        ? 'rgba(210, 167, 105, 0.9)'
        : 'rgba(236, 219, 165, 0.82)';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute z-10 w-[158px] -translate-x-1/2 -translate-y-1/2 px-3 py-2 text-left transition-all duration-200 hover:brightness-110"
      style={{
        left: `${position?.x ?? location.mapPosition.x}%`,
        top: `${position?.y ?? location.mapPosition.y}%`,
        clipPath: panelClip,
        color: 'rgba(255,255,255,0.9)',
        background: current
          ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.24), rgba(8,18,30,0.84))'
          : selected
            ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft),0.25), rgba(18,15,12,0.86))'
            : 'linear-gradient(135deg, rgba(15,21,33,0.88), rgba(6,10,18,0.78))',
        boxShadow: `inset 0 0 0 1px ${accent}, 0 10px 28px rgba(0,0,0,0.22)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-serif text-[14px] font-bold tracking-[0.08em]">{location.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em]" style={{ color: accent }}>
            <span>{kindLabel}</span>
            <span className="opacity-45">/</span>
            <span>{sourceLabel}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold tracking-[0.16em]" style={{ color: accent }}>
          {current ? 'NOW' : selected ? 'SEL' : childCount > 0 ? `L${childCount}` : 'MAP'}
        </span>
      </div>
      <div
        className="mt-2 overflow-hidden text-[11px] leading-relaxed"
        style={{ color: 'rgba(232,238,240,0.72)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
      >
        {location.description}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {location.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em]" style={{ clipPath: chipClip, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.76)' }}>
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

function TrainRoomNode({
  location,
  index,
  selected,
  current,
  onSelect,
}: {
  location: StarMapLocation;
  index: number;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const locked = location.status === 'locked';
  const accent = current
    ? 'rgba(78, 150, 210,0.95)'
    : selected
      ? 'rgba(218, 184, 103,0.96)'
      : locked
        ? 'rgba(118, 112, 102, 0.84)'
        : 'rgba(235, 235, 228, 0.92)';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-1.5 py-1 text-left transition-all hover:brightness-110"
      style={{
        left: `${location.mapPosition.x}%`,
        top: `${location.mapPosition.y}%`,
        background: locked
          ? 'rgba(70, 70, 66, 0.78)'
          : current
            ? 'rgba(232, 239, 244, 0.92)'
            : selected
              ? 'rgba(249, 242, 219, 0.94)'
              : 'rgba(238, 238, 232, 0.86)',
        color: locked ? 'rgba(238,238,232,0.62)' : 'rgba(40,43,42,0.9)',
        boxShadow: `0 0 0 2px rgba(55,58,56,0.42), 0 0 0 4px ${accent}, 0 4px 12px rgba(0,0,0,0.24)`,
      }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: accent, color: locked ? 'rgba(40,43,42,0.62)' : 'rgba(33,36,35,0.92)' }}>
        {locked ? 'L' : String(index + 1)}
      </span>
      <span className="max-w-[86px] truncate pr-1 text-[10px] font-bold tracking-[0.04em]">{location.name}</span>
    </button>
  );
}

function DetailSchematic({ waypoint }: { waypoint: StarMapWaypoint }) {
  const { kind } = waypoint;
  if (kind === 'train') return <TrainSchematic />;
  if (waypoint.id === 'herta_space_station') return <HertaStationSchematic />;
  if (waypoint.id === 'jarilo_vi') return <JariloDistrictSchematic />;
  if (waypoint.id === 'xianzhou_luofu') return <LuofuDelveSchematic />;
  if (kind === 'ship' || kind === 'fleet') return <ShipSchematic />;
  if (kind === 'planet' || kind === 'fan_world' || kind === 'anomaly') return <PlanetSchematic />;
  if (kind === 'dreamscape') return <DreamscapeSchematic />;
  return <StationSchematic />;
}

function LuofuDelveSchematic() {
  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true" data-star-map-schematic="luofu-atlas">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        data-star-map-background-asset="luofu-starskiff-digital-blueprint"
        style={{ backgroundImage: "url('/assets/star-map/luofu-starskiff-digital-blueprint.webp')", filter: 'saturate(0.9) brightness(0.78) contrast(1.08)' }}
      />
      <div className="absolute inset-0 bg-[rgba(13,53,82,0.07)]" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,39,67,0.26), transparent 34%, rgba(14,55,83,0.08)), linear-gradient(180deg, rgba(8,41,70,0.18), transparent 42%, rgba(9,42,68,0.13))' }} />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 86px rgba(5,31,53,0.3), inset 0 -62px 90px rgba(7,38,62,0.12)' }} />
    </div>
  );
}

function JariloDistrictSchematic() {
  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true" data-star-map-schematic="jarilo-districts">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        data-star-map-background-asset="jarilo-architectural-blueprint"
        style={{ backgroundImage: "url('/assets/star-map/jarilo-architectural-blueprint.webp')", filter: 'saturate(0.84) brightness(0.88) contrast(1.08)' }}
      />
      <div className="absolute inset-0 bg-[rgba(173,207,223,0.08)]" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(19,58,82,0.2), transparent 28%, transparent 72%, rgba(19,58,82,0.16)), linear-gradient(180deg, rgba(222,239,247,0.08), transparent 42%, rgba(37,82,106,0.12))' }} />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 88px rgba(16,54,77,0.28), inset 0 -56px 82px rgba(22,64,88,0.12)' }} />
    </div>
  );
}

function TrainSchematic() {
  return (
    <div className="relative h-full w-full text-white/80">
      <div
        className="absolute left-[5%] right-[5%] top-1/2 h-20 -translate-y-1/2 rounded-full border bg-white/[0.055] shadow-inner"
        style={{ borderColor: 'rgba(var(--tj-amber-soft),0.34)', boxShadow: 'inset 0 0 32px rgba(var(--tj-tech-cyan),0.08), 0 0 28px rgba(var(--tj-amber-soft),0.08)' }}
      />
      <div className="absolute left-[9%] right-[9%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-[rgba(var(--tj-amber-soft),0.36)]" />
      <div className="absolute left-[11%] right-[11%] top-[37%] h-px bg-[rgba(var(--tj-tech-cyan),0.2)]" />
      <div className="absolute left-[11%] right-[11%] top-[63%] h-px bg-[rgba(var(--tj-tech-cyan),0.16)]" />
      {[17, 32, 47, 62, 77].map((left, index) => (
        <div
          key={left}
          className="absolute top-1/2 h-28 w-[11%] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border bg-white/[0.08]"
          style={{
            left: `${left}%`,
            borderColor: index === 0 ? 'rgba(var(--tj-amber-soft),0.46)' : 'rgba(255,255,255,0.16)',
            boxShadow: index === 0
              ? 'inset 0 0 24px rgba(var(--tj-amber-soft),0.14), 0 0 22px rgba(var(--tj-amber-soft),0.12)'
              : 'inset 0 0 22px rgba(var(--tj-tech-cyan),0.08)',
          }}
        >
          <div className="absolute left-1/2 top-[18%] h-2 w-[46%] -translate-x-1/2 rounded-full bg-white/12" />
          <div className="absolute left-1/2 bottom-[18%] h-2 w-[46%] -translate-x-1/2 rounded-full bg-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[58%] w-px -translate-x-1/2 -translate-y-1/2 bg-white/12" />
        </div>
      ))}
      {[24.5, 39.5, 54.5, 69.5].map((left) => (
        <div key={left} className="absolute top-1/2 h-8 w-[5%] -translate-x-1/2 -translate-y-1/2 border-y border-white/12 bg-[rgba(var(--tj-tech-cyan),0.06)]" style={{ left: `${left}%` }} />
      ))}
      <div className="absolute left-[87%] top-1/2 h-14 w-[7%] -translate-y-1/2 rounded-r-full border border-white/12 bg-white/[0.045]" />
      <div className="absolute left-[8%] right-[8%] top-[78%] h-px bg-[rgba(var(--tj-amber-soft),0.16)]" />
      <div className="absolute left-[12%] right-[12%] top-[82%] h-px bg-[rgba(var(--tj-tech-cyan),0.1)]" />
    </div>
  );
}

function HertaStationSchematic() {
  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true" data-star-map-schematic="herta">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        data-star-map-background-asset="herta-station-architectural-blueprint"
        style={{ backgroundImage: "url('/assets/star-map/herta-station-architectural-blueprint.webp')", filter: 'saturate(0.84) brightness(0.86) contrast(1.08)' }}
      />
      <div className="absolute inset-0 bg-[rgba(172,207,224,0.07)]" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(17,54,79,0.2), transparent 28%, transparent 72%, rgba(17,54,79,0.16)), linear-gradient(180deg, rgba(222,239,247,0.07), transparent 43%, rgba(34,78,105,0.12))' }} />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 92px rgba(15,52,77,0.28), inset 0 -58px 86px rgba(22,62,88,0.12)' }} />
    </div>
  );
}

function StationSchematic() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-slate-600/28 bg-white/38" />
      <div className="absolute left-1/2 top-[8%] h-[84%] w-8 -translate-x-1/2 rounded-full border border-slate-600/24 bg-white/32" />
      <div className="absolute left-[14%] right-[14%] top-1/2 h-8 -translate-y-1/2 rounded-full border border-slate-600/24 bg-white/32" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-600/32 bg-white/56" />
    </div>
  );
}

function ShipSchematic() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-[8%] right-[8%] top-1/2 h-20 -translate-y-1/2 rounded-full border border-slate-600/25 bg-white/36" style={{ clipPath: 'polygon(0 50%, 14% 18%, 76% 10%, 100% 50%, 76% 90%, 14% 82%)' }} />
      <div className="absolute left-[18%] right-[18%] top-1/2 h-px bg-slate-600/35" />
      {[24, 40, 56, 72].map((left) => (
        <div key={left} className="absolute top-1/2 h-16 w-12 -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-slate-600/22 bg-white/42" style={{ left: `${left}%` }} />
      ))}
      <div className="absolute left-[12%] top-[27%] h-px w-[76%] rotate-[-8deg] bg-slate-600/22" />
      <div className="absolute left-[12%] top-[72%] h-px w-[76%] rotate-[8deg] bg-slate-600/22" />
    </div>
  );
}

function PlanetSchematic() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-600/24 bg-white/32" />
      <div className="absolute left-1/2 top-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-full border border-slate-600/22" />
      <div className="absolute left-[18%] right-[18%] top-[38%] h-9 rounded-full border border-slate-600/18 bg-white/24" />
      <div className="absolute left-[28%] right-[24%] top-[56%] h-11 rounded-full border border-slate-600/18 bg-white/26" />
      <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-600/28 bg-white/48" />
    </div>
  );
}

function DreamscapeSchematic() {
  return (
    <div className="relative h-full w-full">
      {[22, 38, 56, 72].map((left, index) => (
        <div
          key={left}
          className="absolute top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-600/20 bg-white/30"
          style={{ left: `${left}%`, transform: `translate(-50%, -50%) translateY(${index % 2 === 0 ? -12 : 12}px)` }}
        />
      ))}
      <div className="absolute left-[14%] right-[14%] top-1/2 h-px bg-slate-600/28" />
      <div className="absolute left-[18%] right-[18%] top-[35%] h-px rotate-[-7deg] bg-slate-600/18" />
      <div className="absolute left-[18%] right-[18%] top-[65%] h-px rotate-[7deg] bg-slate-600/18" />
    </div>
  );
}

function FanWaypointsPanel({
  currentLocationText,
  currentMatch,
  waypoints,
  locations,
  customLocations,
  customWaypoints,
  selectedWaypointId,
  onSelectWaypoint,
  onAddLocation,
  onAddWaypoint,
  onDeleteCustomLocation,
  onDeleteCustomWaypoint,
  onPatchCustomWaypoint,
}: {
  currentLocationText: string;
  currentMatch: ReturnType<typeof findCurrentStarMapLocation>;
  waypoints: StarMapWaypoint[];
  locations: StarMapLocation[];
  customLocations: StarMapLocation[];
  customWaypoints: StarMapWaypoint[];
  selectedWaypointId: string;
  onSelectWaypoint: (waypointId: string) => void;
  onAddLocation: (input: { name: string; waypointId: string; parentId?: string; kind: StarMapLocationKind; navigationMode?: StarMapNavigationMode; description: string; tags?: string[] }) => void;
  onAddWaypoint: (input: { name: string; shortName: string; kind: StarMapWaypointKind; description: string; tags?: string[] }) => void;
  onDeleteCustomLocation: (locationId: string) => void;
  onDeleteCustomWaypoint: (waypointId: string) => void;
  onPatchCustomWaypoint: (waypointId: string, patch: Partial<StarMapWaypoint>) => void;
}) {
  const unmatched = !currentMatch;
  const [draftName, setDraftName] = useState(unmatched ? currentLocationText : '');
  const [draftWaypointId, setDraftWaypointId] = useState(selectedWaypointId);
  const [draftParentId, setDraftParentId] = useState('');
  const [draftKind, setDraftKind] = useState<StarMapLocationKind>('room');
  const [draftNavigationMode, setDraftNavigationMode] = useState<StarMapNavigationMode>('terminal');
  const [draftDescription, setDraftDescription] = useState('');
  const [waypointName, setWaypointName] = useState('');
  const [waypointShortName, setWaypointShortName] = useState('');
  const [waypointKind, setWaypointKind] = useState<StarMapWaypointKind>('fan_world');
  const [waypointDescription, setWaypointDescription] = useState('');
  const canAddDraft = draftName.trim().length > 0 && draftWaypointId.trim().length > 0;
  const canAddWaypoint = waypointName.trim().length > 0;
  const draftParentOptions = useMemo(
    () => locations.filter((location) => (
      location.waypointId === draftWaypointId
      && (
        location.source !== 'official'
          ? getStarMapLocationDepth(location, locations) < STAR_MAP_MAX_LOCATION_DEPTH && location.navigationMode === 'interior'
          : canStarMapLocationAcceptPlayerChildren(location, locations)
      )
    )),
    [draftWaypointId, locations],
  );

  const addDraft = (nameOverride?: string) => {
    const name = (nameOverride ?? draftName).trim();
    if (!name) return;
    onAddLocation({
      name,
      waypointId: draftWaypointId,
      parentId: draftParentId || undefined,
      kind: draftKind,
      navigationMode: draftNavigationMode,
      description: draftDescription || `${name} 是玩家扩展到航图里的地点，当前只作为地图坐标和备注保存。`,
      tags: ['玩家扩展', KIND_LABELS[waypoints.find((item) => item.id === draftWaypointId)?.kind ?? 'fan_world']],
    });
    setDraftName('');
    setDraftParentId('');
    setDraftNavigationMode('terminal');
    setDraftDescription('');
  };

  const addWaypointDraft = () => {
    const name = waypointName.trim();
    if (!name) return;
    onAddWaypoint({
      name,
      shortName: waypointShortName,
      kind: waypointKind,
      description: waypointDescription || `${name} 是玩家建立的原创航点，可用于承载后续同人地图与地点。`,
      tags: ['玩家航点', KIND_LABELS[waypointKind]],
    });
    setWaypointName('');
    setWaypointShortName('');
    setWaypointDescription('');
  };

  const handleWaypointChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDraftWaypointId(event.target.value);
    setDraftParentId('');
    onSelectWaypoint(event.target.value);
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto pr-1">
      <div
        className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]"
        style={{
          clipPath: shellClip,
          background: 'linear-gradient(135deg, rgba(13, 31, 54, 0.94), rgba(var(--tj-bubble), 0.94) 48%, rgba(var(--tj-tech-cyan), 0.1))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62), inset 0 0 44px rgba(var(--tj-tech-cyan), 0.08)',
        }}
      >
        <div>
          <div className="text-[11px] font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>FAN WAYPOINTS</div>
          <h3 className="mt-2 font-serif text-[21px] font-bold tracking-[0.12em]">同人航点草稿台</h3>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            这里用于整理玩家扩展地图：既可以给原著航点补新房间，也可以先把当前剧情里出现的未登记地点收进航图。当前版本只保存地图配置，不写入主剧情提示词。
          </p>
        </div>
        <div
          className="px-3 py-3"
          style={{
            clipPath: panelClip,
            background: unmatched ? 'rgba(72, 49, 18, 0.32)' : 'rgba(14, 47, 61, 0.34)',
            boxShadow: `inset 0 0 0 1px ${unmatched ? 'rgba(var(--tj-amber-soft), 0.38)' : 'rgba(var(--tj-tech-cyan), 0.28)'}`,
          }}
        >
          <div className="text-[11px] font-bold tracking-[0.2em]" style={{ color: unmatched ? 'rgb(var(--tj-amber-deep))' : 'rgb(var(--tj-tech-cyan-deep))' }}>
            {unmatched ? '待收纳地点' : '当前匹配'}
          </div>
          <div className="mt-2 font-serif text-[16px] font-bold tracking-[0.08em]">
            {unmatched ? currentLocationText : currentMatch.location.name}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
            {unmatched
              ? '这个地点暂未进入航图。可以直接收进下方选择的父级航点，作为玩家扩展地点保存。'
              : `已归入 ${currentMatch.waypoint.name}，后续扩展会优先沿用这个父级航点。`}
          </p>
          {!unmatched && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <MiniTag>{MATCH_REASON_LABELS[currentMatch.reason]}</MiniTag>
              <MiniTag>{currentMatch.score} 分</MiniTag>
              <MiniTag>{LOCATION_KIND_LABELS[currentMatch.location.kind]}</MiniTag>
            </div>
          )}
          {unmatched && currentLocationText !== '地点未定' && (
            <button
              type="button"
              onClick={() => addDraft(currentLocationText)}
              className="mt-3 w-full px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.16em] transition-all hover:brightness-110"
              style={{
                clipPath: chipClip,
                background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.28), rgba(var(--tj-tech-cyan), 0.16))',
                color: 'rgba(var(--tj-text-primary), 0.94)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.38)',
              }}
            >
              收纳当前地点
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.92)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)' }}>
          <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>LOCATION INBOX</div>
          <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">扩展地点收件箱</h4>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              地点名称
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：列车观星露台"
                className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              />
            </label>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              归属航点
              <select
                value={draftWaypointId}
                onChange={handleWaypointChange}
                className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              >
                {waypoints.filter((waypoint) => waypoint.kind !== 'workshop').map((waypoint) => (
                  <option key={waypoint.id} value={waypoint.id}>{waypoint.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              上级地点
              <select
                value={draftParentId}
                onChange={(event) => setDraftParentId(event.target.value)}
                className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              >
                <option value="">无上级地点</option>
                {draftParentOptions.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              地图深度
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraftNavigationMode('terminal')}
                  className="px-3 py-2 text-left text-[12px] transition-all"
                  style={{ clipPath: chipClip, background: draftNavigationMode === 'terminal' ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.22), rgba(var(--tj-tech-cyan), 0.1))' : 'rgba(var(--tj-bubble), 0.86)', boxShadow: draftNavigationMode === 'terminal' ? 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.34)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.4)' }}
                >
                  <div className="font-bold tracking-[0.08em]">到此为止</div>
                  <div className="mt-1 text-[10px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>当前地点就是终点地图，只展示场景位置。</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDraftNavigationMode('interior')}
                  className="px-3 py-2 text-left text-[12px] transition-all"
                  style={{ clipPath: chipClip, background: draftNavigationMode === 'interior' ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.22), rgba(var(--tj-amber-soft), 0.1))' : 'rgba(var(--tj-bubble), 0.86)', boxShadow: draftNavigationMode === 'interior' ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.34)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.4)' }}
                >
                  <div className="font-bold tracking-[0.08em]">包含房间</div>
                  <div className="mt-1 text-[10px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>后续可以从这里继续进入独立房间。</div>
                </button>
              </div>
            </label>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              地点类型
              <select
                value={draftKind}
                onChange={(event) => setDraftKind(event.target.value as StarMapLocationKind)}
                className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              >
                <option value="room">房间</option>
                <option value="facility">设施</option>
                <option value="district">街区</option>
                <option value="zone">区域</option>
                <option value="route">路线</option>
                <option value="special">特殊地点</option>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              备注
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={3}
                placeholder="写一点这个地点的用途，方便以后整理地图包。"
                className="w-full resize-none rounded-none px-3 py-2 text-[13px] leading-relaxed outline-none"
                style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              />
            </label>
            <button
              type="button"
              onClick={() => addDraft()}
              disabled={!canAddDraft}
              className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                clipPath: chipClip,
                background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.2), rgba(var(--tj-amber-soft), 0.18))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.36)',
              }}
            >
              添加到航图
            </button>
          </div>
        </section>

        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.48)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>CUSTOM LOCATIONS</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">玩家扩展地点</h4>
            </div>
            <MiniTag>{customLocations.length} 条</MiniTag>
          </div>
          <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {customLocations.length === 0 ? (
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                暂无玩家扩展地点。遇到列车新增房间、原创据点或未登记舱段时，可以先收进这里。
              </p>
            ) : customLocations.map((location) => {
              const waypoint = waypoints.find((item) => item.id === location.waypointId);
              return (
                <div key={location.id} className="grid gap-2 px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.78)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[14px] font-bold tracking-[0.08em]">{location.name}</div>
                      <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>{waypoint?.name ?? '未知航点'} / {location.kind}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomLocation(location.id)}
                      className="shrink-0 px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                      style={{ clipPath: chipClip, background: 'rgba(116, 42, 35, 0.24)', color: 'rgba(255, 206, 190, 0.9)', boxShadow: 'inset 0 0 0 1px rgba(210, 110, 91, 0.22)' }}
                    >
                      删除
                    </button>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{location.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-surface-strong), 0.92), rgba(var(--tj-tech-cyan), 0.08))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)' }}>
          <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>WAYPOINT BUILDER</div>
          <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">原创航点编辑器</h4>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              航点名称
              <input
                value={waypointName}
                onChange={(event) => setWaypointName(event.target.value)}
                placeholder="例如：逐光号 / 苍蓝回廊"
                className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
                短名
                <input
                  value={waypointShortName}
                  onChange={(event) => setWaypointShortName(event.target.value)}
                  placeholder="首页标签"
                  className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                  style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
                />
              </label>
              <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
                类型
                <select
                  value={waypointKind}
                  onChange={(event) => setWaypointKind(event.target.value as StarMapWaypointKind)}
                  className="w-full rounded-none px-3 py-2 text-[13px] outline-none"
                  style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
                >
                  <option value="fan_world">同人星球</option>
                  <option value="ship">舰船</option>
                  <option value="space_station">空间站</option>
                  <option value="fleet">舰队</option>
                  <option value="anomaly">异常点</option>
                  <option value="dreamscape">梦境</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-[12px] font-bold tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              航点说明
              <textarea
                value={waypointDescription}
                onChange={(event) => setWaypointDescription(event.target.value)}
                rows={3}
                placeholder="写一点这个航点的定位，例如长期篇章舞台、移动据点或异常坐标。"
                className="w-full resize-none rounded-none px-3 py-2 text-[13px] leading-relaxed outline-none"
                style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)', color: 'rgb(var(--tj-text-primary))' }}
              />
            </label>
            <button
              type="button"
              onClick={addWaypointDraft}
              disabled={!canAddWaypoint}
              className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                clipPath: chipClip,
                background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.2), rgba(var(--tj-tech-cyan), 0.18))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.36)',
              }}
            >
              创建原创航点
            </button>
          </div>
        </section>

        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.48)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>CUSTOM WAYPOINTS</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">玩家原创航点</h4>
            </div>
            <MiniTag>{customWaypoints.length} 个</MiniTag>
          </div>
          <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {customWaypoints.length === 0 ? (
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                暂无原创航点。创建后会直接显示在首页星海航图，并可继续收纳扩展地点。
              </p>
            ) : customWaypoints.map((waypoint) => {
              const childCount = customLocations.filter((location) => location.waypointId === waypoint.id).length;
              return (
                <div key={waypoint.id} className="grid gap-2 px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.78)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[14px] font-bold tracking-[0.08em]">{waypoint.name}</div>
                      <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>{KIND_LABELS[waypoint.kind]} / {childCount} 个地点</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomWaypoint(waypoint.id)}
                      className="shrink-0 px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                      style={{ clipPath: chipClip, background: 'rgba(116, 42, 35, 0.24)', color: 'rgba(255, 206, 190, 0.9)', boxShadow: 'inset 0 0 0 1px rgba(210, 110, 91, 0.22)' }}
                    >
                      删除
                    </button>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{waypoint.description}</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                    <input
                      value={waypoint.name}
                      onChange={(event) => onPatchCustomWaypoint(waypoint.id, { name: event.target.value })}
                      className="w-full rounded-none px-2 py-1.5 text-[12px] outline-none"
                      style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)', color: 'rgb(var(--tj-text-primary))' }}
                    />
                    <input
                      value={waypoint.shortName}
                      onChange={(event) => onPatchCustomWaypoint(waypoint.id, { shortName: event.target.value })}
                      className="w-full rounded-none px-2 py-1.5 text-[12px] outline-none"
                      style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)', color: 'rgb(var(--tj-text-primary))' }}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <textarea
                      value={waypoint.description}
                      onChange={(event) => onPatchCustomWaypoint(waypoint.id, { description: event.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-none px-2 py-1.5 text-[12px] leading-relaxed outline-none"
                      style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)', color: 'rgb(var(--tj-text-primary))' }}
                    />
                    <select
                      value={waypoint.kind}
                      onChange={(event) => onPatchCustomWaypoint(waypoint.id, { kind: event.target.value as StarMapWaypointKind })}
                      className="w-full rounded-none px-2 py-1.5 text-[12px] outline-none"
                      style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)', color: 'rgb(var(--tj-text-primary))' }}
                    >
                      <option value="fan_world">同人星球</option>
                      <option value="ship">舰船</option>
                      <option value="space_station">空间站</option>
                      <option value="fleet">舰队</option>
                      <option value="anomaly">异常点</option>
                      <option value="dreamscape">梦境</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="X" value={waypoint.position.x} onChange={(x) => onPatchCustomWaypoint(waypoint.id, { position: { ...waypoint.position, x } })} />
                    <NumberField label="Y" value={waypoint.position.y} onChange={(y) => onPatchCustomWaypoint(waypoint.id, { position: { ...waypoint.position, y } })} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {FAN_BLUEPRINTS.map((item) => (
          <section key={item.code} className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>{item.code}</div>
                <h4 className="mt-1 font-serif text-[15px] font-bold tracking-[0.08em]">{item.title}</h4>
              </div>
              <span className="shrink-0 px-2 py-1 text-[10px] font-bold" style={{ clipPath: chipClip, background: 'rgba(var(--tj-tech-cyan), 0.12)', color: 'rgba(var(--tj-tech-cyan-deep), 0.9)' }}>
                {item.status}
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>{item.lead}</p>
            <div className="mt-3 space-y-1.5">
              {item.rows.map((row) => (
                <div key={row} className="flex items-center gap-2 text-[12px]" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--tj-amber-deep))', boxShadow: '0 0 8px rgba(var(--tj-amber-soft), 0.5)' }} />
                  <span>{row}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
        <InfoPanel title="扩展规则" code="RULES">
          <div className="grid gap-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            <p>官方航点扩展只增加地点，不覆盖原著航点本身；玩家原创航点会使用独立 id，避免和内置地图冲突。</p>
            <p>地图只负责坐标、地点和说明，不会直接改写主剧情提示词。后续联动也会走明确开关和本地审查。</p>
          </div>
        </InfoPanel>
        <InfoPanel title="下一阶段" code="NEXT">
          <div className="flex flex-wrap gap-1.5">
            {['地点编辑器', '未登记收件箱', '玩家扩展存档', '地图包预览'].map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
          </div>
        </InfoPanel>
      </div>
    </div>
  );
}

const VALID_WAYPOINT_KINDS = new Set<StarMapWaypointKind>(['train', 'planet', 'space_station', 'ship', 'fleet', 'dreamscape', 'anomaly', 'fan_world', 'workshop']);
const VALID_LOCATION_KINDS = new Set<StarMapLocationKind>(['zone', 'district', 'room', 'route', 'facility', 'wildland', 'special']);
const STAR_MAP_PACKAGE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/;

function normalizeStarMapPackageId(value: unknown, fallback: string): string {
  const raw = String(value || fallback || 'local_star_map_package').trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const safe = /^[a-z]/.test(normalized) ? normalized : `pkg_${normalized}`;
  return safe.slice(0, 64) || 'local_star_map_package';
}

function normalizeStarMapPackageSourceKind(value: unknown): StarMapPackageSourceKind {
  return value === 'local' || value === 'workshop' || value === 'system' ? value : 'imported';
}

function buildPackageInstallPlan(
  draft: StarMapPackageDraft,
  customWaypoints: StarMapWaypoint[],
  customLocations: StarMapLocation[],
): StarMapPackageInstallPlan {
  const builtinWaypointIds = new Set(STAR_MAP_WAYPOINTS.map((waypoint) => waypoint.id));
  const customWaypointIds = new Set(customWaypoints.map((waypoint) => waypoint.id));
  const existingWaypointIds = new Set([...builtinWaypointIds, ...customWaypointIds]);
  const installWaypoints = draft.waypoints.filter((waypoint) => !existingWaypointIds.has(waypoint.id));
  const skippedWaypoints = draft.waypoints
    .filter((waypoint) => existingWaypointIds.has(waypoint.id))
    .map((waypoint) => waypoint.name);
  const skippedWaypointDetails = draft.waypoints
    .filter((waypoint) => existingWaypointIds.has(waypoint.id))
    .map((waypoint) => `${waypoint.name}：${builtinWaypointIds.has(waypoint.id) ? '官方航点已存在' : '玩家航点 id 已存在'}`);
  const allowedWaypointIds = new Set([
    ...builtinWaypointIds,
    ...customWaypoints.map((waypoint) => waypoint.id),
    ...installWaypoints.map((waypoint) => waypoint.id),
  ]);
  const builtinLocationIds = new Set(STAR_MAP_LOCATIONS.map((location) => location.id));
  const customLocationIds = new Set(customLocations.map((location) => location.id));
  const existingLocationIds = new Set([...builtinLocationIds, ...customLocationIds]);
  const installLocations = draft.locations.filter((location) => allowedWaypointIds.has(location.waypointId) && !existingLocationIds.has(location.id));
  const skippedLocations = draft.locations
    .filter((location) => !allowedWaypointIds.has(location.waypointId) || existingLocationIds.has(location.id))
    .map((location) => location.name);
  const skippedLocationDetails = draft.locations
    .filter((location) => !allowedWaypointIds.has(location.waypointId) || existingLocationIds.has(location.id))
    .map((location) => {
      if (!allowedWaypointIds.has(location.waypointId)) return `${location.name}：父级航点不存在`;
      return `${location.name}：${builtinLocationIds.has(location.id) ? '官方地点已存在' : '玩家地点 id 已存在'}`;
    });
  return {
    installWaypoints,
    installLocations,
    skippedWaypoints,
    skippedLocations,
    skippedDetails: [...skippedWaypointDetails, ...skippedLocationDetails],
  };
}

function normalizeImportedTags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const tags = Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 16);
  return tags.length ? tags : fallback;
}

function normalizeImportedText(value: unknown, fallback: string, maxLength: number, warnings: string[], label: string): string {
  const raw = String(value || fallback).trim() || fallback;
  if (raw.length <= maxLength) return raw;
  warnings.push(`${label} 过长，已截断到 ${maxLength} 字。`);
  return raw.slice(0, maxLength);
}

function normalizeImportedPoint(value: unknown, fallback: { x: number; y: number }, warnings: string[], label: string) {
  const point = value && typeof value === 'object' ? value as { x?: unknown; y?: unknown } : {};
  const toPercent = (raw: unknown, base: number, axis: 'x' | 'y') => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return base;
    const rounded = Math.round(numeric);
    const clamped = Math.max(6, Math.min(94, rounded));
    if (clamped !== rounded) warnings.push(`${label} 的 ${axis.toUpperCase()} 坐标超出 6-94，已修正为 ${clamped}。`);
    return clamped;
  };
  return {
    x: toPercent(point.x, fallback.x, 'x'),
    y: toPercent(point.y, fallback.y, 'y'),
  };
}

function parseStarMapPackage(text: string): StarMapPackageDraft {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('地图包不是有效 JSON。');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('地图包根结构必须是对象。');
  }

  const source = raw as {
    schema?: unknown;
    packageId?: unknown;
    id?: unknown;
    name?: unknown;
    version?: unknown;
    author?: unknown;
    sourceKind?: unknown;
    origin?: unknown;
    license?: unknown;
    sourceUrl?: unknown;
    source?: unknown;
    coverAsset?: unknown;
    cover?: unknown;
    tags?: unknown;
    waypoints?: unknown;
    locations?: unknown;
    customWaypoints?: unknown;
    customLocations?: unknown;
  };
  if (typeof source.schema === 'string' && source.schema !== 'kaituoyishi.star-map.package.v1') {
    warnings.push(`地图包 schema 为 ${source.schema}，当前按兼容模式读取。`);
  }
  if (source.waypoints !== undefined && !Array.isArray(source.waypoints)) {
    warnings.push('waypoints 字段不是数组，已忽略。');
  }
  if (source.locations !== undefined && !Array.isArray(source.locations)) {
    warnings.push('locations 字段不是数组，已忽略。');
  }
  const rawCoverAsset = typeof source.coverAsset === 'string' ? source.coverAsset : typeof source.cover === 'string' ? source.cover : '';
  if (rawCoverAsset && !rawCoverAsset.startsWith('/assets/')) {
    warnings.push('地图包封面使用了外部图片路径，已忽略以避免加载不受控资源。');
  }
  const builtinWaypointIds = new Set(STAR_MAP_WAYPOINTS.map((waypoint) => waypoint.id));
  const builtinLocationIds = new Set(STAR_MAP_LOCATIONS.map((location) => location.id));
  const rawWaypoints = Array.isArray(source.waypoints) ? source.waypoints : Array.isArray(source.customWaypoints) ? source.customWaypoints : [];
  const rawLocations = Array.isArray(source.locations) ? source.locations : Array.isArray(source.customLocations) ? source.customLocations : [];
  if (rawWaypoints.length === 0 && rawLocations.length === 0) {
    warnings.push('地图包没有可读取的航点或地点。');
  }
  const waypointIds = new Set<string>();
  const waypoints: StarMapWaypoint[] = [];

  rawWaypoints.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as Partial<StarMapWaypoint>;
    const id = String(item.id || `custom_waypoint_import_${Date.now()}_${index}`).trim();
    const name = normalizeImportedText(item.name, '', 36, warnings, `第 ${index + 1} 个航点名称`);
    if (!name) {
      warnings.push(`第 ${index + 1} 个航点缺少名称，已跳过。`);
      return;
    }
    if (!STAR_MAP_PACKAGE_ID_RE.test(id)) {
      warnings.push(`${name} 的航点 id 不符合规则，已跳过。id 需以字母开头，只能包含字母、数字、下划线和短横线。`);
      return;
    }
    if (builtinWaypointIds.has(id)) {
      warnings.push(`${name} 使用了内置航点 id，已跳过以避免覆盖官方地图。`);
      return;
    }
    if (waypointIds.has(id)) {
      warnings.push(`${name} 的航点 id 重复，已跳过。`);
      return;
    }
    const kind = VALID_WAYPOINT_KINDS.has(item.kind as StarMapWaypointKind) ? item.kind as StarMapWaypointKind : 'fan_world';
    if (item.kind && !VALID_WAYPOINT_KINDS.has(item.kind as StarMapWaypointKind)) {
      warnings.push(`${name} 的航点类型 ${String(item.kind)} 暂不支持，已按同人航点处理。`);
    }
    if (typeof item.imageAsset === 'string' && item.imageAsset && !item.imageAsset.startsWith('/assets/')) {
      warnings.push(`${name} 使用了外部图片路径，已忽略以避免加载不受控资源。`);
    }
    waypointIds.add(id);
    waypoints.push({
      id,
      name,
      shortName: normalizeImportedText(item.shortName, name, 12, warnings, `${name} 的短名`),
      kind,
      imageAsset: typeof item.imageAsset === 'string' && item.imageAsset.startsWith('/assets/') ? item.imageAsset : undefined,
      source: 'fan',
      status: item.status === 'known' ? 'known' : 'draft',
      description: normalizeImportedText(item.description, '地图包导入的玩家航点。', 180, warnings, `${name} 的说明`),
      tags: normalizeImportedTags(item.tags, ['地图包', KIND_LABELS[kind]]),
      position: normalizeImportedPoint(item.position, { x: 66, y: 26 }, warnings, name),
    });
  });

  const allowedWaypointIds = new Set([...builtinWaypointIds, ...waypointIds]);
  const locationIds = new Set<string>();
  const locations: StarMapLocation[] = [];
  rawLocations.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as Partial<StarMapLocation>;
    const id = String(item.id || `custom_location_import_${Date.now()}_${index}`).trim();
    const name = normalizeImportedText(item.name, '', 36, warnings, `第 ${index + 1} 个地点名称`);
    const waypointId = String(item.waypointId || '').trim();
    if (!name || !waypointId) {
      warnings.push(`第 ${index + 1} 个地点缺少名称或父级航点，已跳过。`);
      return;
    }
    if (!STAR_MAP_PACKAGE_ID_RE.test(id)) {
      warnings.push(`${name} 的地点 id 不符合规则，已跳过。id 需以字母开头，只能包含字母、数字、下划线和短横线。`);
      return;
    }
    if (builtinLocationIds.has(id)) {
      warnings.push(`${name} 使用了内置地点 id，已跳过以避免覆盖官方地图。`);
      return;
    }
    if (!allowedWaypointIds.has(waypointId)) {
      warnings.push(`${name} 的父级航点不存在，已跳过。`);
      return;
    }
    if (locationIds.has(id)) {
      warnings.push(`${name} 的地点 id 重复，已跳过。`);
      return;
    }
    const kind = VALID_LOCATION_KINDS.has(item.kind as StarMapLocationKind) ? item.kind as StarMapLocationKind : 'special';
    if (item.kind && !VALID_LOCATION_KINDS.has(item.kind as StarMapLocationKind)) {
      warnings.push(`${name} 的地点类型 ${String(item.kind)} 暂不支持，已按特殊地点处理。`);
    }
    locationIds.add(id);
    locations.push({
      id,
      waypointId,
      parentId: typeof item.parentId === 'string' ? item.parentId.trim() || undefined : undefined,
      name,
      kind,
      source: 'fan',
      status: item.status === 'draft' ? 'draft' : 'known',
      aliases: normalizeImportedTags(item.aliases, [name]),
      description: normalizeImportedText(item.description, '地图包导入的玩家扩展地点。', 220, warnings, `${name} 的说明`),
      tags: normalizeImportedTags(item.tags, ['地图包']),
      mapPosition: normalizeImportedPoint(item.mapPosition, { x: 50, y: 50 }, warnings, name),
      navigationMode: item.navigationMode === 'interior' ? 'interior' : 'terminal',
      allowsPlayerChildren: item.navigationMode === 'interior' && item.allowsPlayerChildren !== false,
      lockReason: typeof item.lockReason === 'string' ? item.lockReason.trim().slice(0, 80) || undefined : undefined,
    });
  });

  normalizeImportedLocationParents(locations, warnings);

  const packageName = String(source.name || '未命名星轨地图包').trim();
  const sourceUrl = typeof source.sourceUrl === 'string'
    ? source.sourceUrl.trim().slice(0, 240)
    : typeof source.source === 'string'
      ? source.source.trim().slice(0, 240)
      : undefined;

  return {
    packageId: normalizeStarMapPackageId(source.packageId ?? source.id, sourceUrl || packageName),
    name: packageName,
    version: String(source.version || '1.0.0').trim(),
    author: typeof source.author === 'string' ? source.author.trim() : undefined,
    sourceKind: normalizeStarMapPackageSourceKind(source.sourceKind ?? source.origin),
    license: typeof source.license === 'string' ? source.license.trim().slice(0, 80) : undefined,
    sourceUrl,
    coverAsset: rawCoverAsset.startsWith('/assets/') ? rawCoverAsset.trim().slice(0, 240) : undefined,
    tags: normalizeImportedTags(source.tags, ['本地地图包']),
    waypoints,
    locations,
    warnings,
  };
}

function createsImportedLocationParentLoop(location: StarMapLocation, parentId: string, locationById: Map<string, StarMapLocation>): boolean {
  const visited = new Set<string>([location.id]);
  let cursor: string | undefined = parentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = locationById.get(cursor)?.parentId;
  }
  return false;
}

function normalizeImportedLocationParents(locations: StarMapLocation[], warnings: string[]) {
  const locationById = new Map<string, StarMapLocation>();
  STAR_MAP_LOCATIONS.forEach((location) => locationById.set(location.id, location));
  locations.forEach((location) => locationById.set(location.id, location));

  locations.forEach((location) => {
    if (!location.parentId) return;
    const parent = locationById.get(location.parentId);
    if (!parent) {
      warnings.push(`${location.name} 的上级地点不存在，已清空。`);
      location.parentId = undefined;
      return;
    }
    if (parent.source === 'official' && !canStarMapLocationAcceptPlayerChildren(parent, [...locationById.values()])) {
      warnings.push(`${location.name} 的上级地点不开放玩家扩展，已清空。`);
      location.parentId = undefined;
      return;
    }
    if (parent.source !== 'official' && parent.navigationMode !== 'interior') {
      warnings.push(`${location.name} 的上级地点是终点地图，已清空。`);
      location.parentId = undefined;
      return;
    }
    if (parent.waypointId !== location.waypointId) {
      warnings.push(`${location.name} 的上级地点不属于同一航点，已清空。`);
      location.parentId = undefined;
      return;
    }
    if (createsImportedLocationParentLoop(location, parent.id, locationById)) {
      warnings.push(`${location.name} 的上级地点形成循环层级，已清空。`);
      location.parentId = undefined;
      return;
    }
    if (getStarMapParentDepth(parent.id, [...locationById.values()]) >= STAR_MAP_MAX_LOCATION_DEPTH) {
      warnings.push(`${location.name} 的上级地点会形成第五级，已清空。`);
      location.parentId = undefined;
    }
  });
}

function buildStarMapPackageExportText(input: {
  packageId?: string;
  name: string;
  version?: string;
  author?: string;
  sourceKind?: StarMapPackageSourceKind;
  license?: string;
  sourceUrl?: string;
  coverAsset?: string;
  tags?: string[];
  notes?: string[];
  customWaypoints: StarMapWaypoint[];
  customLocations: StarMapLocation[];
}): string {
  return JSON.stringify({
    schema: 'kaituoyishi.star-map.package.v1',
    ...(input.notes?.length ? { notes: input.notes } : {}),
    packageId: normalizeStarMapPackageId(input.packageId, input.name),
    name: input.name,
    version: input.version ?? '1.0.0',
    author: input.author,
    sourceKind: input.sourceKind ?? 'local',
    license: input.license,
    sourceUrl: input.sourceUrl,
    coverAsset: input.coverAsset,
    tags: input.tags?.length ? input.tags : undefined,
    exportedAt: new Date().toISOString(),
    waypoints: input.customWaypoints,
    locations: input.customLocations,
  }, null, 2);
}

function buildStarMapPackageText(customWaypoints: StarMapWaypoint[], customLocations: StarMapLocation[]): string {
  return buildStarMapPackageExportText({
    packageId: 'kaituoyishi_local_player_star_map',
    name: '开拓轶事玩家星轨航图包',
    sourceKind: 'local',
    customWaypoints,
    customLocations,
  });
}

function buildStarMapPackageTemplateText(): string {
  return JSON.stringify({
    schema: 'kaituoyishi.star-map.package.v1',
    notes: [
      'packageId 是地图包稳定标识；发布新版本时保持不变，导入后会更新替换旧版本写入内容。',
      'sourceKind 可填 local / imported / workshop / system，用于本地包库和未来工坊来源筛选。',
      'id 需以字母开头，只使用字母、数字、下划线和短横线，且不要复用官方内置 id。',
      'position / mapPosition 是百分比坐标，推荐保持在 6-94 之间。',
      'parentId 可选，只能指向同一航点下的官方地点或同包地点，用来做房间、街区、区域的层级关系。',
      'license / sourceUrl / tags / coverAsset 用于本地包库展示和未来工坊兼容；coverAsset 仅接受 /assets/ 下的本地资源路径。',
      '地图包只写入玩家扩展航图，不会自动注入主剧情提示词。',
    ],
    packageId: 'example_fan_star_map_package',
    name: '示例星轨地图包',
    version: '1.0.0',
    author: '开拓者',
    sourceKind: 'local',
    license: '允许本地游玩与非商业二创转载，二次分发请保留作者名。',
    sourceUrl: 'local://example-star-map-package',
    coverAsset: '/assets/star-map/fan-world.svg',
    tags: ['同人航点', '本地地图包', '示例'],
    waypoints: [
      {
        id: 'custom_waypoint_example_world',
        name: '示例同人航点',
        shortName: '示例航点',
        kind: 'fan_world',
        source: 'fan',
        status: 'draft',
        description: '用于演示地图包结构的原创航点。导入前请把 id、名称和说明改成自己的内容。',
        tags: ['地图包', '同人航点'],
        position: { x: 68, y: 32 },
      },
    ],
    locations: [
      {
        id: 'custom_location_example_harbor',
        waypointId: 'custom_waypoint_example_world',
        name: '示例港区',
        kind: 'facility',
        source: 'fan',
        status: 'known',
        aliases: ['示例航点港区', '港区'],
        description: '用于演示地点结构的扩展地点。waypointId 要对应上方航点 id，也可以填官方航点 id 来扩展原著地图。',
        tags: ['地图包', '设施'],
        mapPosition: { x: 48, y: 54 },
      },
      {
        id: 'custom_location_example_archive_room',
        waypointId: 'custom_waypoint_example_world',
        parentId: 'custom_location_example_harbor',
        name: '示例档案室',
        kind: 'room',
        source: 'fan',
        status: 'known',
        aliases: ['港区档案室', '档案室'],
        description: '用于演示 parentId 的子地点。导入后会显示在示例港区下面。',
        tags: ['地图包', '房间'],
        mapPosition: { x: 56, y: 48 },
      },
    ],
  }, null, 2);
}

function downloadJsonFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function WorkshopHarborPanel({
  customWaypoints,
  customLocations,
  installedPackages,
  onInstallPackage,
  onTogglePackageEnabled,
  onUninstallPackage,
}: {
  customWaypoints: StarMapWaypoint[];
  customLocations: StarMapLocation[];
  installedPackages: 星轨航图地图包记录[];
  onInstallPackage: (draft: StarMapPackageDraft) => void;
  onTogglePackageEnabled: (packageId: string) => void;
  onUninstallPackage: (packageId: string) => void;
}) {
  const [packageDraft, setPackageDraft] = useState<StarMapPackageDraft | null>(null);
  const [packageError, setPackageError] = useState('');
  const [lastInstallReport, setLastInstallReport] = useState<StarMapPackageInstallReport | null>(null);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  const [packageFilter, setPackageFilter] = useState<StarMapPackageFilter>('all');
  const [packageSort, setPackageSort] = useState<StarMapPackageSort>('installedAt');
  const [packageSearchText, setPackageSearchText] = useState('');
  const packageExistingRecords = useMemo(
    () => packageDraft ? installedPackages.filter((record) => record.packageId === packageDraft.packageId) : [],
    [installedPackages, packageDraft],
  );
  const packageExistingRecord = packageExistingRecords[0] ?? null;
  const packagePreviewBase = useMemo(() => {
    if (!packageDraft || packageExistingRecords.length === 0) {
      return { customWaypoints, customLocations, replacedWaypoints: 0, replacedLocations: 0 };
    }
    const oldWaypointIds = new Set(packageExistingRecords.flatMap((record) => record.waypointIds));
    const oldLocationIds = new Set(packageExistingRecords.flatMap((record) => record.locationIds));
    return {
      customWaypoints: customWaypoints.filter((waypoint) => !oldWaypointIds.has(waypoint.id)),
      customLocations: customLocations.filter((location) => !oldLocationIds.has(location.id) && !oldWaypointIds.has(location.waypointId)),
      replacedWaypoints: oldWaypointIds.size,
      replacedLocations: oldLocationIds.size,
    };
  }, [customLocations, customWaypoints, packageDraft, packageExistingRecords]);
  const installPlan = useMemo(
    () => packageDraft ? buildPackageInstallPlan(packageDraft, packagePreviewBase.customWaypoints, packagePreviewBase.customLocations) : null,
    [packageDraft, packagePreviewBase.customLocations, packagePreviewBase.customWaypoints],
  );
  const installDestinationSummary = useMemo(
    () => packageDraft && installPlan ? buildInstallDestinationSummary(packageDraft, installPlan, packagePreviewBase.customWaypoints) : [],
    [installPlan, packageDraft, packagePreviewBase.customWaypoints],
  );
  const packageLocationPreviewItems = useMemo(() => {
    if (!packageDraft) return [];
    const locationNameById = new Map<string, string>();
    STAR_MAP_LOCATIONS.forEach((location) => locationNameById.set(location.id, location.name));
    packageDraft.locations.forEach((location) => locationNameById.set(location.id, location.name));
    return packageDraft.locations.map((location) => {
      const parentName = location.parentId ? locationNameById.get(location.parentId) : '';
      return `${location.name}${parentName ? ` ← ${parentName}` : ''} / ${LOCATION_KIND_LABELS[location.kind]}`;
    });
  }, [packageDraft]);
  const packageParentedLocationCount = packageDraft?.locations.filter((location) => Boolean(location.parentId)).length ?? 0;
  const waypointNameById = useMemo(() => new Map(customWaypoints.map((waypoint) => [waypoint.id, waypoint.name])), [customWaypoints]);
  const locationNameById = useMemo(() => new Map(customLocations.map((location) => [location.id, location.name])), [customLocations]);
  const packageHasMissingItems = (record: 星轨航图地图包记录) => (
    record.waypointIds.some((id) => !waypointNameById.has(id))
    || record.locationIds.some((id) => !locationNameById.has(id))
  );
  const packageFilterCounts = useMemo(() => ({
    all: installedPackages.length,
    enabled: installedPackages.filter((record) => record.enabled !== false).length,
    disabled: installedPackages.filter((record) => record.enabled === false).length,
    incomplete: installedPackages.filter((record) => packageHasMissingItems(record)).length,
  }), [installedPackages, locationNameById, waypointNameById]);
  const filteredInstalledPackages = useMemo(() => {
    const query = normalizeSearchText(packageSearchText);
    const filtered = installedPackages.filter((record) => {
      if (packageFilter === 'enabled' && record.enabled === false) return false;
      if (packageFilter === 'disabled' && record.enabled !== false) return false;
      if (packageFilter === 'incomplete' && !packageHasMissingItems(record)) return false;
      if (!query) return true;
      const waypointNames = record.waypointIds.map((id) => waypointNameById.get(id) ?? id);
      const locationNames = record.locationIds.map((id) => locationNameById.get(id) ?? id);
      return matchSearchTarget(query, [
        record.id,
        record.packageId,
        record.name,
        record.version,
        record.author ?? '',
        PACKAGE_SOURCE_KIND_LABELS[record.sourceKind ?? 'imported'],
        record.sourceKind ?? 'imported',
        record.license ?? '',
        record.sourceUrl ?? '',
        ...(record.tags ?? []),
        ...waypointNames,
        ...locationNames,
      ]);
    });
    return [...filtered].sort((left, right) => {
      if (packageSort === 'name') return left.name.localeCompare(right.name, 'zh-CN');
      if (packageSort === 'status') {
        const statusCompare = Number(left.enabled === false) - Number(right.enabled === false);
        return statusCompare || left.name.localeCompare(right.name, 'zh-CN');
      }
      if (packageSort === 'incomplete') {
        const missingCompare = Number(packageHasMissingItems(right)) - Number(packageHasMissingItems(left));
        return missingCompare || left.name.localeCompare(right.name, 'zh-CN');
      }
      return getPackageInstalledTime(right) - getPackageInstalledTime(left) || right.name.localeCompare(left.name, 'zh-CN');
    });
  }, [installedPackages, locationNameById, packageFilter, packageSearchText, packageSort, waypointNameById]);

  const handlePackageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const draft = parseStarMapPackage(String(reader.result || ''));
        setPackageDraft(draft);
        setPackageError('');
      } catch (error) {
        setPackageDraft(null);
        setPackageError(error instanceof Error ? error.message : '地图包读取失败。');
      }
    };
    reader.onerror = () => {
      setPackageDraft(null);
      setPackageError('地图包文件读取失败。');
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  };

  const installDraft = () => {
    if (!packageDraft || !installPlan) return;
    const previousPackageRecords = installedPackages.filter((record) => record.packageId === packageDraft.packageId);
    const previousPackageRecord = previousPackageRecords[0];
    setLastInstallReport({
      mode: previousPackageRecords.length > 0 ? 'update' : 'install',
      packageId: packageDraft.packageId,
      packageName: packageDraft.name,
      packageVersion: packageDraft.version,
      packageSourceKind: packageDraft.sourceKind,
      packageTags: packageDraft.tags,
      previousVersion: previousPackageRecord?.version,
      installedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      replacedWaypoints: previousPackageRecords.reduce((total, record) => total + record.waypointIds.length, 0),
      replacedLocations: previousPackageRecords.reduce((total, record) => total + record.locationIds.length, 0),
      installedWaypoints: installPlan.installWaypoints.map((waypoint) => waypoint.name),
      installedLocations: installPlan.installLocations.map((location) => location.name),
      skippedItems: installPlan.skippedDetails,
    });
    onInstallPackage(packageDraft);
    setPackageDraft(null);
  };

  const exportPackage = () => {
    downloadJsonFile(`kaituoyishi-star-map-${new Date().toISOString().slice(0, 10)}.json`, buildStarMapPackageText(customWaypoints, customLocations));
  };

  const exportInstalledPackage = (record: 星轨航图地图包记录) => {
    const waypointIds = new Set(record.waypointIds);
    const locationIds = new Set(record.locationIds);
    const packageWaypoints = customWaypoints.filter((waypoint) => waypointIds.has(waypoint.id));
    const packageLocations = customLocations.filter((location) => locationIds.has(location.id));
    const missingWaypointIds = record.waypointIds.filter((id) => !packageWaypoints.some((waypoint) => waypoint.id === id));
    const missingLocationIds = record.locationIds.filter((id) => !packageLocations.some((location) => location.id === id));
    const safeName = record.name.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 42) || 'star-map-package';
    downloadJsonFile(`kaituoyishi-star-map-${safeName}.json`, buildStarMapPackageExportText({
      packageId: record.packageId,
      name: record.name,
      version: record.version,
      author: record.author,
      license: record.license,
      sourceUrl: record.sourceUrl,
      coverAsset: record.coverAsset,
      sourceKind: record.sourceKind,
      tags: record.tags,
      notes: missingWaypointIds.length || missingLocationIds.length
        ? [
            '导出此已安装地图包时发现部分原写入项已缺失，本文件只包含当前仍存在的可用内容。',
            `缺失航点：${missingWaypointIds.length}；缺失地点：${missingLocationIds.length}`,
          ]
        : undefined,
      customWaypoints: packageWaypoints,
      customLocations: packageLocations,
    }));
  };

  const downloadTemplate = () => {
    downloadJsonFile('kaituoyishi-star-map-template.json', buildStarMapPackageTemplateText());
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto pr-1">
      <div
        className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)]"
        style={{
          clipPath: shellClip,
          background: 'linear-gradient(135deg, rgba(20, 27, 48, 0.96), rgba(var(--tj-bubble), 0.92) 52%, rgba(var(--tj-amber-soft), 0.13))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62), inset 0 0 48px rgba(var(--tj-amber-soft), 0.06)',
        }}
      >
        <div>
          <div className="text-[11px] font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>WORKSHOP HARBOR</div>
          <h3 className="mt-2 font-serif text-[21px] font-bold tracking-[0.12em]">创意工坊星港</h3>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            这里负责地图包导入、预览、审查、本地安装与导出。地图包只会写入玩家扩展航图，不会自动注入主剧情提示词。
          </p>
        </div>
        <div className="grid gap-2">
          {WORKSHOP_PACKAGE_TYPES.map((item) => (
            <div key={item} className="px-3 py-2 text-[12px] font-bold" style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.74)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.44)', color: 'rgba(var(--tj-text-primary), 0.84)' }}>
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-surface-strong), 0.92), rgba(var(--tj-amber-soft), 0.08))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)' }}>
          <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>PACKAGE DOCK</div>
          <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">地图包停靠坞</h4>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
            支持导入 `kaituoyishi.star-map.package.v1` 风格 JSON，也兼容只含 `customWaypoints/customLocations` 的轻量包。
          </p>
          <div className="mt-4 grid gap-2">
            <label
              className="block cursor-pointer px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all hover:brightness-110"
              style={{
                clipPath: chipClip,
                background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.2), rgba(var(--tj-amber-soft), 0.16))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.36)',
              }}
            >
              选择地图包 JSON
              <input type="file" accept="application/json,.json" onChange={handlePackageFile} className="hidden" />
            </label>
            <button
              type="button"
              onClick={exportPackage}
              disabled={customWaypoints.length === 0 && customLocations.length === 0}
              className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                clipPath: chipClip,
                background: 'rgba(var(--tj-bubble), 0.82)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
              }}
            >
              导出当前玩家地图包
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all"
              style={{
                clipPath: chipClip,
                background: 'rgba(var(--tj-surface-strong), 0.82)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.44)',
              }}
            >
              下载地图包模板
            </button>
          </div>
          {packageError && (
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'rgba(255, 185, 165, 0.92)' }}>{packageError}</p>
          )}
        </section>

        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>PACKAGE PREVIEW</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">导入预览</h4>
            </div>
            <MiniTag>{packageDraft ? `${packageDraft.waypoints.length} 航点 / ${packageDraft.locations.length} 地点` : '待选择'}</MiniTag>
          </div>
          {packageDraft ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                <div className="font-serif text-[15px] font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{packageDraft.name}</div>
                <div>版本：{packageDraft.version}{packageDraft.author ? ` / 作者：${packageDraft.author}` : ''}</div>
                <div>包标识：{packageDraft.packageId}</div>
                {packageExistingRecord && (
                  <div style={{ color: 'rgba(var(--tj-amber-soft), 0.92)' }}>
                    将更新已安装包：v{packageExistingRecord.version} → v{packageDraft.version}
                  </div>
                )}
                {packageExistingRecord && (
                  <div style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    预览已排除旧版本内容：{packagePreviewBase.replacedWaypoints} 航点 / {packagePreviewBase.replacedLocations} 地点
                  </div>
                )}
                {(packageDraft.license || packageDraft.sourceUrl) && (
                  <div>{packageDraft.license ? `授权：${packageDraft.license}` : ''}{packageDraft.license && packageDraft.sourceUrl ? ' / ' : ''}{packageDraft.sourceUrl ? `来源：${packageDraft.sourceUrl}` : ''}</div>
                )}
              </div>
              {packageDraft.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {packageDraft.tags.map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
                </div>
              )}
              <PackageCoverPreview asset={packageDraft.coverAsset} title={packageDraft.name} />
              {installPlan && (
                <div className="grid gap-2 rounded-none px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-tech-cyan), 0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.22)' }}>
                  <div className="flex flex-wrap gap-1.5">
                    <MiniTag>将安装 {installPlan.installWaypoints.length} 航点</MiniTag>
                    <MiniTag>将安装 {installPlan.installLocations.length} 地点</MiniTag>
                    <MiniTag>来源 {PACKAGE_SOURCE_KIND_LABELS[packageDraft.sourceKind]}</MiniTag>
                    {packageExistingRecord && <MiniTag>更新模式</MiniTag>}
                    {packageParentedLocationCount > 0 && <MiniTag>层级地点 {packageParentedLocationCount} 项</MiniTag>}
                    <MiniTag>跳过 {installPlan.skippedWaypoints.length + installPlan.skippedLocations.length} 项</MiniTag>
                  </div>
                  {installPlan.skippedDetails.length > 0 && (
                    <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-amber-soft), 0.9)' }}>
                      跳过详情：{installPlan.skippedDetails.slice(0, 4).join('；')}
                      {installPlan.skippedDetails.length > 4 ? ' 等' : ''}
                    </div>
                  )}
                  {installDestinationSummary.length > 0 && (
                    <div className="grid gap-1.5">
                      <div className="text-[11px] font-bold tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}>写入目的地</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {installDestinationSummary.slice(0, 6).map((summary) => (
                          <div key={summary.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]" style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)', color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                            <span className="truncate font-bold" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>{summary.name}</span>
                            <span className="shrink-0">{summary.locationCount} 地点</span>
                          </div>
                        ))}
                      </div>
                      {installDestinationSummary.length > 6 && (
                        <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>另有 {installDestinationSummary.length - 6} 个目的地</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {packageDraft.warnings.length > 0 && (
                <div className="grid gap-1 rounded-none px-3 py-2" style={{ clipPath: panelClip, background: 'rgba(98, 66, 24, 0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.22)' }}>
                  {packageDraft.warnings.slice(0, 5).map((warning) => (
                    <div key={warning} className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-amber-soft), 0.92)' }}>{warning}</div>
                  ))}
                  {packageDraft.warnings.length > 5 && (
                    <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-amber-soft), 0.72)' }}>另有 {packageDraft.warnings.length - 5} 条兼容提示</div>
                  )}
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewList title="航点" items={packageDraft.waypoints.map((waypoint) => `${waypoint.name} / ${KIND_LABELS[waypoint.kind]}`)} />
                <PreviewList title="地点" items={packageLocationPreviewItems} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={installDraft}
                  disabled={!installPlan || (installPlan.installWaypoints.length === 0 && installPlan.installLocations.length === 0)}
                  className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all disabled:opacity-45"
                  style={{ clipPath: chipClip, background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.24), rgba(var(--tj-tech-cyan), 0.16))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.36)' }}
                >
                  安装到本地航图
                </button>
                <button
                  type="button"
                  onClick={() => setPackageDraft(null)}
                  className="px-3 py-2 text-center font-serif text-[12px] font-bold tracking-[0.18em] transition-all"
                  style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.82)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}
                >
                  清空预览
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
              选择地图包后会在这里显示航点、地点和兼容警告。安装前不会写入任何数据。
            </p>
          )}
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
          <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>INSTALL PIPELINE</div>
          <div className="mt-4 space-y-3">
            {WORKSHOP_PIPELINE.map(([title, body], index) => (
              <div key={title} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: 'rgba(var(--tj-amber-soft), 0.18)', color: 'rgb(var(--tj-amber-deep))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.36)' }}>
                  {index + 1}
                </div>
                <div>
                  <div className="font-serif text-[14px] font-bold tracking-[0.08em]">{title}</div>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3">
          <InfoPanel title="兼容红线" code="SAFE">
            <div className="grid gap-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
              <p>地图包不能覆盖内置官方航点，只能新增扩展地点或新增同人航点。</p>
              <p>地图包不会自动注入主剧情提示词；涉及世界书、智库或剧情触发时必须单独确认。</p>
              <p>导入前会检查 id、父级、别名和资源路径，避免旧包把航图结构写乱。</p>
            </div>
          </InfoPanel>
          <InfoPanel title="当前版本" code="V1">
            <div className="flex flex-wrap gap-1.5">
              {['导入预览', '本地安装', '导出扩展', '包记录', '不写主流程'].map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
            </div>
          </InfoPanel>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-bubble), 0.86), rgba(var(--tj-tech-cyan), 0.07))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>SCHEMA GUIDE</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">地图包字段说明</h4>
            </div>
            <MiniTag>package.v1</MiniTag>
          </div>
          <div className="mt-4 grid gap-2">
            {WORKSHOP_SCHEMA_FIELDS.map(([field, detail]) => (
              <div key={field} className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_minmax(0,1fr)]" style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)' }}>
                <div className="font-mono text-[11px] font-bold" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>{field}</div>
                <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>{detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'linear-gradient(135deg, rgba(var(--tj-surface-strong), 0.9), rgba(var(--tj-amber-soft), 0.07))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>IMPORT REPORT</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">最近一次导入日志</h4>
            </div>
            <MiniTag>{lastInstallReport ? '已记录' : '待安装'}</MiniTag>
          </div>
          {lastInstallReport ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                <div className="font-serif text-[15px] font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{lastInstallReport.packageName}</div>
                <div>版本：{lastInstallReport.packageVersion}</div>
                <div>包标识：{lastInstallReport.packageId}</div>
                <div>安装时间：{lastInstallReport.installedAt}</div>
                {lastInstallReport.mode === 'update' && (
                  <div style={{ color: 'rgba(var(--tj-amber-soft), 0.92)' }}>
                    更新完成：v{lastInstallReport.previousVersion ?? '未知'} → v{lastInstallReport.packageVersion}，替换旧内容 {lastInstallReport.replacedWaypoints} 航点 / {lastInstallReport.replacedLocations} 地点
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <MiniTag>{lastInstallReport.mode === 'update' ? '更新完成' : '新增安装'}</MiniTag>
                <MiniTag>来源 {PACKAGE_SOURCE_KIND_LABELS[lastInstallReport.packageSourceKind]}</MiniTag>
                <MiniTag>写入 {lastInstallReport.installedWaypoints.length} 航点</MiniTag>
                <MiniTag>写入 {lastInstallReport.installedLocations.length} 地点</MiniTag>
                <MiniTag>跳过 {lastInstallReport.skippedItems.length} 项</MiniTag>
                {lastInstallReport.packageTags.slice(0, 4).map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewList title="写入内容" items={[...lastInstallReport.installedWaypoints, ...lastInstallReport.installedLocations]} />
                <PreviewList title="跳过内容" items={lastInstallReport.skippedItems} />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
              地图包安装完成后，会在这里临时显示本次写入和跳过的项目，方便确认是否按预期落进本地航图。
            </p>
          )}
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1fr)]">
        <section className="px-4 py-4" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>INSTALLED PACKAGES</div>
              <h4 className="mt-1 font-serif text-[16px] font-bold tracking-[0.1em]">已安装地图包</h4>
            </div>
            <MiniTag>{installedPackages.length} 个</MiniTag>
          </div>
          {installedPackages.length > 0 && (
            <div className="mt-3 grid gap-2">
              <label>
                <span className="sr-only">搜索已安装地图包</span>
                <input
                  value={packageSearchText}
                  onChange={(event) => setPackageSearchText(event.target.value)}
                  placeholder="搜索包名、作者、版本、来源、写入内容"
                  className="w-full rounded-none px-3 py-2 text-[12px] outline-none"
                  style={{ clipPath: chipClip, background: 'rgba(var(--tj-bubble), 0.82)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', color: 'rgb(var(--tj-text-primary))' }}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', '全部'],
                  ['enabled', '启用'],
                  ['disabled', '禁用'],
                  ['incomplete', '异常'],
                ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPackageFilter(filter)}
                  className="px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                  style={{ clipPath: chipClip, background: packageFilter === filter ? 'rgba(var(--tj-tech-cyan), 0.16)' : 'rgba(var(--tj-surface-strong), 0.58)', color: packageFilter === filter ? 'rgb(var(--tj-tech-cyan-deep))' : 'rgba(var(--tj-text-secondary), 0.82)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)' }}
                >
                  {label} {packageFilterCounts[filter]}
                </button>
                ))}
                {packageSearchText.trim() && (
                  <button
                    type="button"
                    onClick={() => setPackageSearchText('')}
                    className="px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                    style={{ clipPath: chipClip, background: 'rgba(var(--tj-amber-soft), 0.12)', color: 'rgba(var(--tj-text-primary), 0.84)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.22)' }}
                  >
                    清空搜索
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['installedAt', '最近安装'],
                  ['name', '名称'],
                  ['status', '状态'],
                  ['incomplete', '异常优先'],
                ] as const).map(([sort, label]) => (
                  <button
                    key={sort}
                    type="button"
                    onClick={() => setPackageSort(sort)}
                    className="px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                    style={{ clipPath: chipClip, background: packageSort === sort ? 'rgba(var(--tj-amber-soft), 0.14)' : 'rgba(var(--tj-surface-strong), 0.48)', color: packageSort === sort ? 'rgb(var(--tj-amber-deep))' : 'rgba(var(--tj-text-secondary), 0.8)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.3)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {installedPackages.length === 0 ? (
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                暂无已安装地图包。导入并安装后，会在这里记录来源，方便之后撤回。
              </p>
            ) : filteredInstalledPackages.length === 0 ? (
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                当前筛选或搜索下暂无地图包。
              </p>
            ) : filteredInstalledPackages.map((record) => {
              const expanded = expandedPackageId === record.id;
              const packageEnabled = record.enabled !== false;
              const waypointNames = record.waypointIds.map((id) => waypointNameById.get(id) ?? `缺失航点：${id}`);
              const locationNames = record.locationIds.map((id) => locationNameById.get(id) ?? `缺失地点：${id}`);
              const missingWaypointCount = waypointNames.filter((name) => name.startsWith('缺失航点：')).length;
              const missingLocationCount = locationNames.filter((name) => name.startsWith('缺失地点：')).length;
              const packageHasMissingItems = missingWaypointCount > 0 || missingLocationCount > 0;
              return (
              <div key={record.id} className="grid gap-2 px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-bubble), 0.78)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[14px] font-bold tracking-[0.08em]">{record.name}</div>
                    <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
                      v{record.version}{record.author ? ` / ${record.author}` : ''}
                    </div>
                    {(record.license || record.sourceUrl) && (
                      <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
                        {record.license ? `授权：${record.license}` : ''}{record.license && record.sourceUrl ? ' / ' : ''}{record.sourceUrl ? `来源：${record.sourceUrl}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onTogglePackageEnabled(record.id)}
                      className="px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                      style={{ clipPath: chipClip, background: packageEnabled ? 'rgba(var(--tj-tech-cyan), 0.14)' : 'rgba(var(--tj-surface-strong), 0.58)', color: 'rgba(var(--tj-text-primary), 0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)' }}
                    >
                      {packageEnabled ? '禁用' : '启用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUninstallPackage(record.id)}
                      className="px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-all hover:brightness-110"
                      style={{ clipPath: chipClip, background: 'rgba(116, 42, 35, 0.24)', color: 'rgba(255, 206, 190, 0.9)', boxShadow: 'inset 0 0 0 1px rgba(210, 110, 91, 0.22)' }}
                    >
                      卸载
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <MiniTag>{packageEnabled ? '已启用' : '已禁用'}</MiniTag>
                  <MiniTag>{record.waypointIds.length} 航点</MiniTag>
                  <MiniTag>{record.locationIds.length} 地点</MiniTag>
                  <MiniTag>{record.installedAt.slice(0, 10)}</MiniTag>
                  <MiniTag>来源 {PACKAGE_SOURCE_KIND_LABELS[record.sourceKind ?? 'imported']}</MiniTag>
                  <MiniTag>{packageHasMissingItems ? `内容缺失 ${missingWaypointCount + missingLocationCount}` : '内容完整'}</MiniTag>
                  {(record.tags ?? []).slice(0, 4).map((tag) => <MiniTag key={tag}>{tag}</MiniTag>)}
                </div>
                {!packageEnabled && (
                  <div className="px-3 py-2 text-[12px] leading-relaxed" style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.56)', color: 'rgba(var(--tj-text-secondary), 0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)' }}>
                    此包写入的扩展内容已从航图、搜索和当前坐标匹配中临时隐藏。重新启用后会恢复显示。
                  </div>
                )}
                {packageHasMissingItems && (
                  <div className="px-3 py-2 text-[12px] leading-relaxed" style={{ clipPath: chipClip, background: 'rgba(98, 66, 24, 0.2)', color: 'rgba(var(--tj-amber-soft), 0.92)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.2)' }}>
                    这个地图包记录中有原写入项已经不存在。导出时只会包含当前仍存在的可用内容。
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setExpandedPackageId(expanded ? null : record.id)}
                    className="w-full px-2 py-1.5 text-left text-[11px] font-bold tracking-[0.1em] transition-all hover:brightness-110"
                    style={{ clipPath: chipClip, background: 'rgba(var(--tj-surface-strong), 0.56)', color: 'rgba(var(--tj-text-primary), 0.82)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)' }}
                  >
                    {expanded ? '收起写入清单' : '查看写入清单'}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportInstalledPackage(record)}
                    disabled={record.waypointIds.length === 0 && record.locationIds.length === 0}
                    className="w-full px-2 py-1.5 text-left text-[11px] font-bold tracking-[0.1em] transition-all hover:brightness-110 disabled:opacity-45"
                    style={{ clipPath: chipClip, background: 'rgba(var(--tj-amber-soft), 0.11)', color: 'rgba(var(--tj-text-primary), 0.84)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-amber-soft), 0.24)' }}
                  >
                    {packageHasMissingItems ? '导出可用内容' : '导出此包'}
                  </button>
                </div>
                {expanded && (
                  <div className="grid gap-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(180px,0.74fr)_minmax(0,1fr)]">
                      <PackageCoverPreview asset={record.coverAsset} title={record.name} />
                      <div className="grid gap-2 px-3 py-3" style={{ clipPath: panelClip, background: 'rgba(var(--tj-surface-strong), 0.54)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)' }}>
                        <div className="text-[11px] font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-amber-deep))' }}>包详情</div>
                        <div className="grid gap-1 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                          <div>记录 ID：{record.id}</div>
                          <div>包标识：{record.packageId}</div>
                          <div>安装时间：{record.installedAt}</div>
                          {record.license && <div>授权：{record.license}</div>}
                          {record.sourceUrl && <div>来源：{record.sourceUrl}</div>}
                          {record.coverAsset && <div>封面：{record.coverAsset}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <PreviewList title="包内航点" items={waypointNames} />
                      <PreviewList title="包内地点" items={locationNames} />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </section>

        <InfoPanel title="卸载规则" code="ROLLBACK">
          <div className="grid gap-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
            <p>卸载只会删除该地图包实际写入的玩家扩展航点和地点，不会删除内置官方地图。</p>
            <p>如果地图包把地点挂在已有官方航点下，卸载时只删除这些新增地点；如果删除的是包内原创航点，也会同步移除其下属地点。</p>
            <p>如果包内原创航点下已经挂载了其他地图包或玩家后续创建的地点，卸载时会保留这个航点，避免误删外部依赖内容。</p>
          </div>
        </InfoPanel>
      </div>
    </div>
  );
}
