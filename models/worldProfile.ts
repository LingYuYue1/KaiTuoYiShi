// 世界观档案：把游戏改造成「可进入任意世界观」的核心抽象。
// 每个世界拥有独立的智库、内置世界书、剧情编织与存档；数据以设置键 + 世界 ID 命名空间隔离。
//
// 默认世界（DEFAULT_WORLD_ID）是内置「星穹铁道」世界，沿用未加后缀的旧存储键
// （zhikuSystem / worldbooks / storyWeavingSystem），因此老玩家的存量数据零迁移即可继续使用。

export interface 世界档案 {
  id: string;
  name: string;
  description: string;
  /** 内置世界不可删除 / 重命名，且会注入随包预置的智库与世界书；自建世界从空库开始。 */
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 内置星穹铁道世界的稳定 ID。旧存档 / 旧设置键均归属此世界。 */
export const DEFAULT_WORLD_ID = 'default';

/** 设置存储键：世界观档案列表。 */
export const WORLD_PROFILES_STORAGE_KEY = 'worldProfiles';

/** 设置存储键：当前激活的世界 ID。 */
export const ACTIVE_WORLD_STORAGE_KEY = 'activeWorldId';

export function 创建世界档案(input: {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
}): 世界档案 {
  const now = Date.now();
  return {
    id: input.id,
    name: input.name.trim() || '未命名世界',
    description: input.description.trim(),
    builtin: input.builtin === true,
    createdAt: now,
    updatedAt: now,
  };
}

export function 生成世界ID(): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `world_${Date.now().toString(36)}_${rand}`;
}

/** 按世界 ID 生成命名空间化设置存储键。默认世界沿用旧键，免数据迁移。 */
export function 世界存储键(baseKey: string, worldId?: string): string {
  if (!worldId || worldId === DEFAULT_WORLD_ID) return baseKey;
  return `${baseKey}:${worldId}`;
}

/** 归一化世界档案列表（兼容旧数据 / 外部导入）。 */
export function 归一化世界档案列表(value: unknown): 世界档案[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: 世界档案[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<世界档案>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id || seen.has(id)) continue;
    if (id === DEFAULT_WORLD_ID && raw.builtin !== true) continue; // 默认世界恒为内置
    seen.add(id);
    const now = Date.now();
    list.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 64) : '未命名世界',
      description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 512) : '',
      builtin: raw.builtin === true,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    });
  }
  return list;
}

/** 判断存档 / 记录是否归属指定世界。旧数据无 worldId 视为默认世界。 */
export function 记录属于世界(worldId: string | undefined | null, targetWorldId: string): boolean {
  return (worldId ?? DEFAULT_WORLD_ID) === targetWorldId;
}