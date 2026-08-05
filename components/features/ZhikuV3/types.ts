import productionLayoutSource from './zhiku-layout.production.json';

export type ZhikuCategoryId =
  | 'character'
  | 'story'
  | 'location'
  | 'faction'
  | 'event'
  | 'enemy'
  | 'aeon'
  | 'path'
  | 'term';

export interface ZhikuCategory {
  id: ZhikuCategoryId;
  label: string;
  iconSrc: string;
  countLabel: string;
  featured?: boolean;
}

export interface ZhikuNodePlacement {
  id: ZhikuCategoryId;
  x: number;
  y: number;
  scale: number;
}

export type ZhikuViewportId = 'desktop-720' | 'desktop-1080' | 'desktop-16-10';

export interface ZhikuLayout {
  version: 1;
  viewportId: ZhikuViewportId;
  background: {
    brightness: number;
    dimmer: number;
    orbitOpacity: number;
  };
  nodes: ZhikuNodePlacement[];
}

export const ZHIKU_CATEGORIES: ZhikuCategory[] = [
  {
    id: 'character',
    label: '人物',
    iconSrc: '/assets/zhiku/emblems/gold-emblem-trace.svg',
    countLabel: '71',
    featured: true,
  },
  {
    id: 'story',
    label: '剧情档案',
    iconSrc: '/assets/zhiku/emblems/story-archive-emblem-concept-a.svg',
    countLabel: '--',
  },
  {
    id: 'location',
    label: '地点',
    iconSrc: '/assets/zhiku/emblems/location-emblem-concept-a.svg',
    countLabel: '12',
  },
  {
    id: 'faction',
    label: '派系',
    iconSrc: '/assets/zhiku/emblems/faction-emblem-precision-a.svg',
    countLabel: '4',
  },
  {
    id: 'event',
    label: '事件',
    iconSrc: '/assets/zhiku/emblems/event-emblem-concept-a.svg',
    countLabel: '4',
  },
  {
    id: 'enemy',
    label: '敌对生物',
    iconSrc: '/assets/zhiku/emblems/enemy-emblem-precision-h.svg',
    countLabel: '--',
  },
  {
    id: 'aeon',
    label: '星神',
    iconSrc: '/assets/zhiku/emblems/aeon-emblem-precision-c.svg',
    countLabel: '18',
  },
  {
    id: 'path',
    label: '命途',
    iconSrc: '/assets/zhiku/emblems/path-emblem-precision-c.svg',
    countLabel: '18',
  },
  {
    id: 'term',
    label: '专有名词',
    iconSrc: '/assets/zhiku/emblems/term-emblem-precision-a.svg',
    countLabel: '7',
  },
];

export const ZHIKU_PRODUCTION_LAYOUT: ZhikuLayout = {
  version: 1,
  viewportId: productionLayoutSource.viewportId as ZhikuViewportId,
  background: {
    brightness: productionLayoutSource.background.brightness,
    dimmer: productionLayoutSource.background.dimmer,
    orbitOpacity: productionLayoutSource.background.orbitOpacity,
  },
  nodes: productionLayoutSource.nodes.map((node) => ({
    id: node.id as ZhikuCategoryId,
    x: node.x,
    y: node.y,
    scale: node.scale,
  })),
};
