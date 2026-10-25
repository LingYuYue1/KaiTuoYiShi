// 世界观档案持久化服务：负责世界列表、当前激活世界，以及创建 / 删除世界时的数据清理。
// 存储位置：TimeJourneyDB.settings（key-value）。键名常量定义在 models/worldProfile.ts，
// 避免与 dbService 产生循环依赖。

import {
  ACTIVE_WORLD_STORAGE_KEY,
  DEFAULT_WORLD_ID,
  WORLD_PROFILES_STORAGE_KEY,
  创建世界档案,
  归一化世界档案列表,
  生成世界ID,
  type 世界档案,
} from '@/models/worldProfile';
import { loadSetting, saveSetting, deleteSetting, deleteSavesByWorld } from '@/services/dbService';

const BUILTIN_DEFAULT_WORLD: 世界档案 = {
  id: DEFAULT_WORLD_ID,
  name: '星穹铁道',
  description: '内置世界：崩坏·星穹铁道。包含随包预置的角色智库、世界书与剧情编织主线。',
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
};

/** 读取世界档案列表，并保证默认世界始终存在（缺失时补写）。 */
export async function loadWorldProfiles(): Promise<世界档案[]> {
  const saved = await loadSetting<unknown>(WORLD_PROFILES_STORAGE_KEY);
  const list = 归一化世界档案列表(saved);
  const hasDefault = Array.isArray(saved) && saved.some((item) => item && typeof item === 'object' && 'id' in item && item.id === DEFAULT_WORLD_ID);
  if (!hasDefault) {
    const next = [BUILTIN_DEFAULT_WORLD, ...list];
    await saveSetting(WORLD_PROFILES_STORAGE_KEY, next);
    return next;
  }
  return list;
}

export async function saveWorldProfiles(profiles: 世界档案[]): Promise<世界档案[]> {
  const hasDefault = profiles.some((p) => p.id === DEFAULT_WORLD_ID);
  const next = hasDefault ? profiles : [BUILTIN_DEFAULT_WORLD, ...profiles];
  await saveSetting(WORLD_PROFILES_STORAGE_KEY, next);
  return next;
}

/** 读取当前激活世界 ID；未设置过时回退默认世界。 */
export async function loadActiveWorldId(): Promise<string> {
  const saved = (await loadSetting<unknown>(ACTIVE_WORLD_STORAGE_KEY)) as string | null | undefined;
  return typeof saved === 'string' && saved.trim() ? saved.trim() : DEFAULT_WORLD_ID;
}

export async function saveActiveWorldId(worldId: string): Promise<void> {
  await saveSetting(ACTIVE_WORLD_STORAGE_KEY, worldId);
}

export async function createWorld(input: { name: string; description: string }): Promise<世界档案> {
  const world = 创建世界档案({ id: 生成世界ID(), name: input.name, description: input.description });
  const profiles = await loadWorldProfiles();
  await saveWorldProfiles([...profiles, world]);
  return world;
}

/** 重命名 / 编辑世界资料（内置世界不可编辑）。 */
export async function updateWorld(worldId: string, patch: { name?: string; description?: string }): Promise<世界档案[]> {
  const profiles = await loadWorldProfiles();
  const next = profiles.map((p) =>
    p.id === worldId && !p.builtin
      ? {
          ...p,
          name: patch.name !== undefined ? (patch.name.trim().slice(0, 64) || p.name) : p.name,
          description: patch.description !== undefined ? patch.description.trim().slice(0, 512) : p.description,
          updatedAt: Date.now(),
        }
      : p,
  );
  await saveWorldProfiles(next);
  return next;
}

/** 删除自建世界：移除档案、命名空间的智库 / 世界书 / 剧情编织设置，并清空该世界的存档。 */
export async function deleteWorld(worldId: string): Promise<boolean> {
  if (!worldId || worldId === DEFAULT_WORLD_ID) return false;
  const profiles = await loadWorldProfiles();
  const target = profiles.find((p) => p.id === worldId);
  if (!target || target.builtin) return false;

  await deleteSavesByWorld(worldId);
  await deleteSetting(`zhikuSystem:${worldId}`);
  await deleteSetting(`worldbooks:${worldId}`);
  await deleteSetting(`storyWeavingSystem:${worldId}`);

  await saveWorldProfiles(profiles.filter((p) => p.id !== worldId));
  const active = await loadActiveWorldId();
  if (active === worldId) await saveActiveWorldId(DEFAULT_WORLD_ID);
  return true;
}