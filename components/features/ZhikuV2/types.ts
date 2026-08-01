import productionLayoutSource from './zhiku-layout.production.json';

export type ZhikuDesignCategoryId =
  | 'character'
  | 'story'
  | 'location'
  | 'faction'
  | 'event'
  | 'enemy'
  | 'aeon'
  | 'path'
  | 'term';

export interface ZhikuDesignCategory {
  id: ZhikuDesignCategoryId;
  label: string;
  iconSrc: string;
  countLabel: string;
  featured?: boolean;
}

export interface ZhikuNodePlacement {
  id: ZhikuDesignCategoryId;
  x: number;
  y: number;
  scale: number;
}

export interface ZhikuViewportPreset {
  id: 'desktop-720' | 'desktop-1080' | 'desktop-16-10';
  label: string;
  width: number;
  height: number;
}

export interface ZhikuDesignLayout {
  version: 1;
  viewportId: ZhikuViewportPreset['id'];
  background: {
    brightness: number;
    dimmer: number;
    orbitOpacity: number;
  };
  nodes: ZhikuNodePlacement[];
}

export const ZHIKU_VIEWPORTS: ZhikuViewportPreset[] = [
  { id: 'desktop-720', label: '1280 x 720', width: 1280, height: 720 },
  { id: 'desktop-1080', label: '1920 x 1080', width: 1920, height: 1080 },
  { id: 'desktop-16-10', label: '1440 x 900', width: 1440, height: 900 },
];

export const ZHIKU_DESIGN_CATEGORIES: ZhikuDesignCategory[] = [
  {
    id: 'character',
    label: '人物',
    iconSrc: '/assets/zhiku/icon-trace/gold-emblem-trace.svg',
    countLabel: '71',
    featured: true,
  },
  {
    id: 'story',
    label: '剧情档案',
    iconSrc: '/assets/zhiku/icon-trace/story-archive-emblem-concept-a.svg',
    countLabel: '--',
  },
  {
    id: 'location',
    label: '地点',
    iconSrc: '/assets/zhiku/icon-trace/location-emblem-concept-a.svg',
    countLabel: '12',
  },
  {
    id: 'faction',
    label: '派系',
    iconSrc: '/assets/zhiku/icon-trace/faction-emblem-precision-a.svg',
    countLabel: '4',
  },
  {
    id: 'event',
    label: '事件',
    iconSrc: '/assets/zhiku/icon-trace/event-emblem-concept-a.svg',
    countLabel: '4',
  },
  {
    id: 'enemy',
    label: '敌对生物',
    iconSrc: '/assets/zhiku/icon-trace/enemy-emblem-precision-h.svg',
    countLabel: '--',
  },
  {
    id: 'aeon',
    label: '星神',
    iconSrc: '/assets/zhiku/icon-trace/aeon-emblem-precision-c.svg',
    countLabel: '18',
  },
  {
    id: 'path',
    label: '命途',
    iconSrc: '/assets/zhiku/icon-trace/path-emblem-precision-c.svg',
    countLabel: '18',
  },
  {
    id: 'term',
    label: '专有名词',
    iconSrc: '/assets/zhiku/icon-trace/term-emblem-precision-a.svg',
    countLabel: '7',
  },
];

export const ZHIKU_PRODUCTION_LAYOUT: ZhikuDesignLayout = {
  version: 1,
  viewportId: productionLayoutSource.viewportId as ZhikuViewportPreset['id'],
  background: {
    brightness: productionLayoutSource.background.brightness,
    dimmer: productionLayoutSource.background.dimmer,
    orbitOpacity: productionLayoutSource.background.orbitOpacity,
  },
  nodes: productionLayoutSource.nodes.map((node) => ({
    id: node.id as ZhikuDesignCategoryId,
    x: node.x,
    y: node.y,
    scale: node.scale,
  })),
};

export const DEFAULT_ZHIKU_DESIGN_LAYOUT = ZHIKU_PRODUCTION_LAYOUT;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeZhikuDesignLayout(value: unknown): ZhikuDesignLayout {
  if (!value || typeof value !== 'object') throw new Error('布局必须是 JSON 对象。');
  const input = value as Partial<ZhikuDesignLayout>;
  if (input.version !== 1) throw new Error('布局版本不受支持。');

  const viewport = ZHIKU_VIEWPORTS.find((item) => item.id === input.viewportId) ?? ZHIKU_VIEWPORTS[0];
  const inputNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const nodeMap = new Map(inputNodes.map((node) => [node?.id, node]));

  return {
    version: 1,
    viewportId: viewport.id,
    background: {
      brightness: clamp(Number(input.background?.brightness ?? 0.78), 0.4, 1.2),
      dimmer: clamp(Number(input.background?.dimmer ?? 0.24), 0, 0.72),
      orbitOpacity: clamp(Number(input.background?.orbitOpacity ?? 0.68), 0, 1),
    },
    nodes: DEFAULT_ZHIKU_DESIGN_LAYOUT.nodes.map((fallback) => {
      const node = nodeMap.get(fallback.id);
      return {
        id: fallback.id,
        x: clamp(Number(node?.x ?? fallback.x), 5, 95),
        y: clamp(Number(node?.y ?? fallback.y), 10, 90),
        scale: clamp(Number(node?.scale ?? fallback.scale), 0.55, 1.45),
      };
    }),
  };
}
