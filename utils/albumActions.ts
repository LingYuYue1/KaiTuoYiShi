import type { 相册系统, 相册条目, 图片资源, 图片目标类型, 图片槽位 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录, NPC头像槽位 } from '@/models/npc';

const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function 创建相册图片条目(input: {
  title: string;
  src: string;
  source: 图片资源['source'];
  nsfw?: boolean;
  targetType?: 图片目标类型;
  targetId?: string;
  slot?: 图片槽位;
  mimeType?: string;
  prompt?: string;
  negativePrompt?: string;
  dimensions?: string;
  model?: string;
  backend?: string;
  tags?: string[];
  note?: string;
}): { asset: 图片资源; entry: 相册条目 } {
  const now = Date.now();
  const isDataUrl = input.src.startsWith('data:');
  const assetId = makeId('asset');
  const entryId = makeId('album');
  const asset: 图片资源 = {
    id: assetId,
    url: isDataUrl ? undefined : input.src,
    dataUrl: isDataUrl ? input.src : undefined,
    mimeType: input.mimeType,
    source: input.source,
    nsfw: input.nsfw === true,
    createdAt: now,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    dimensions: input.dimensions,
    model: input.model,
    backend: input.backend,
    status: 'ready',
  };
  const entry: 相册条目 = {
    id: entryId,
    assetId,
    title: input.title.trim() || '未命名图片',
    targetType: input.targetType ?? (input.nsfw ? 'nsfw_part' : 'misc'),
    targetId: input.targetId,
    slot: input.slot ?? 'misc',
    tags: input.tags ?? [],
    nsfw: input.nsfw === true,
    createdAt: now,
    note: input.note,
  };
  return { asset, entry };
}

export function 添加图片到相册(album: 相册系统, item: { asset: 图片资源; entry: 相册条目 }): 相册系统 {
  return {
    ...album,
    assets: [item.asset, ...album.assets],
    entries: [item.entry, ...album.entries],
  };
}

export function 读取相册条目地址(album: 相册系统, entryId: string): string | undefined {
  const entry = album.entries.find((item) => item.id === entryId);
  if (!entry) return undefined;
  const asset = album.assets.find((item) => item.id === entry.assetId);
  return asset?.dataUrl || asset?.url || asset?.localRef || undefined;
}

export function 挂载NPC头像图片(npcs: NPC记录[], params: { npcId: string; slot: NPC头像槽位; src: string; source?: '手动' | '原著' | '文生图' | '占位' }): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    const avatarSlots = {
      ...(npc.图像档案?.头像槽位 ?? {}),
      [params.slot]: params.src,
    };
    const profileAvatar = params.slot === '档案' ? params.src : npc.图像档案?.头像 ?? npc.头像;
    return {
      ...npc,
      头像: params.slot === '档案' ? params.src : npc.头像,
      图像档案: {
        ...(npc.图像档案 ?? {}),
        头像: profileAvatar,
        头像槽位: avatarSlots,
        状态: 'done',
        来源: params.source ?? '手动',
      },
    };
  });
}

export function 挂载NPC立绘图片(npcs: NPC记录[], params: { npcId: string; src: string; source?: '手动' | '原著' | '文生图' | '占位' }): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    return {
      ...npc,
      图像档案: {
        ...(npc.图像档案 ?? {}),
        立绘: params.src,
        状态: 'done',
        来源: params.source ?? '手动',
      },
    };
  });
}

export function 卸载NPC头像图片(npcs: NPC记录[], params: { npcId: string; slot: NPC头像槽位 }): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    const avatarSlots = { ...(npc.图像档案?.头像槽位 ?? {}) };
    delete avatarSlots[params.slot];
    const nextImage = { ...(npc.图像档案 ?? {}) };
    nextImage.头像槽位 = Object.keys(avatarSlots).length ? avatarSlots : undefined;
    if (params.slot === '档案') {
      nextImage.头像 = undefined;
    }
    return {
      ...npc,
      头像: params.slot === '档案' ? '' : npc.头像,
      图像档案: nextImage,
    };
  });
}

export function 卸载NPC立绘图片(npcs: NPC记录[], params: { npcId: string }): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    return {
      ...npc,
      图像档案: {
        ...(npc.图像档案 ?? {}),
        立绘: undefined,
      },
    };
  });
}

export function 挂载NPC_NSFW部位图片(
  npcs: NPC记录[],
  params: { npcId: string; slot: '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考'; src: string },
): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    return {
      ...npc,
      NSFW档案: {
        ...(npc.NSFW档案 ?? {}),
        enabled: true,
        部位图片: {
          ...(npc.NSFW档案?.部位图片 ?? {}),
          [params.slot]: params.src,
        },
      },
    };
  });
}

export function 卸载NPC_NSFW部位图片(
  npcs: NPC记录[],
  params: { npcId: string; slot: '女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考' },
): NPC记录[] {
  return npcs.map((npc) => {
    if (npc.id !== params.npcId) return npc;
    const partImages = { ...(npc.NSFW档案?.部位图片 ?? {}) };
    delete partImages[params.slot];
    return {
      ...npc,
      NSFW档案: {
        ...(npc.NSFW档案 ?? {}),
        部位图片: Object.keys(partImages).length ? partImages : undefined,
      },
    };
  });
}

export function 挂载旅人图片(traveler: 角色数据结构, params: { slot: '头像' | '正文头像' | '手机头像' | '立绘'; src: string }): 角色数据结构 {
  const imageArchive = { ...(traveler.图像档案 ?? {}) };
  if (params.slot === '头像') imageArchive.头像 = params.src;
  if (params.slot === '正文头像') imageArchive.正文头像 = params.src;
  if (params.slot === '手机头像') imageArchive.手机头像 = params.src;
  if (params.slot === '立绘') imageArchive.立绘 = params.src;
  return {
    ...traveler,
    头像: params.slot === '头像' ? params.src : traveler.头像,
    图像档案: imageArchive,
  };
}

export function 卸载旅人图片(traveler: 角色数据结构, params: { slot: '头像' | '正文头像' | '手机头像' | '立绘' }): 角色数据结构 {
  const imageArchive = { ...(traveler.图像档案 ?? {}) };
  if (params.slot === '头像') imageArchive.头像 = undefined;
  if (params.slot === '正文头像') imageArchive.正文头像 = undefined;
  if (params.slot === '手机头像') imageArchive.手机头像 = undefined;
  if (params.slot === '立绘') imageArchive.立绘 = undefined;
  return {
    ...traveler,
    头像: params.slot === '头像' ? '' : traveler.头像,
    图像档案: imageArchive,
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}
