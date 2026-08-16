import type { 角色数据结构 } from '@/models/character';
import { 读取NPC头像 } from '@/models/npc';
import type { NPC头像槽位, NPC角色锚点档案, NPC记录 } from '@/models/npc';
import { isCharacterLibrarySlot, slotLabel, 读取图片参考目标 } from '@/models/imageGeneration';
import type { 图片槽位, 图片生成任务, 图片生成任务来源, 图片目标类型, 相册条目, 相册系统 } from '@/models/imageGeneration';
import { 解析相册资源地址, 解析相册资源引用 } from '@/utils/albumActions';
import { getBuiltinAvatarSet, getBuiltinAvatarSetForNames } from '@/data/builtinAvatars';
import { generateTargets } from './foundation';
import type { GenerationHistoryFilter, PromptMeta, SceneLibraryFilter, StorySnapshotSourceOption, StorySnapshotSummary } from './foundation';
import { matchCanonical } from '@/data/canonicalCharacters';
import type { 聊天消息 } from '@/models/chat';
import { revokeAlbumAssets } from '@/utils/albumObjectUrl';
import type { PNG画风预设来源, 文生图规则中心设置 } from '@/models/settings';

export function buildCharacterLibraryRecords(
  traveler: 角色数据结构,
  npcs: NPC记录[],
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryRecord[] {
  const entryIndex = buildCharacterAlbumEntryIndex(traveler, npcs, album, includeNsfw);
  const travelerRecord = buildTravelerLibraryRecord(traveler, album, assetMap, entryIndex.get('traveler') ?? []);
  const npcRecords = npcs
    .filter((npc) => npc.阶位 === 'companion' || npc.原著角色)
    .map((npc): NpcLibraryRecord => {
      const slots = [
        { key: 'avatar-profile', label: '档案头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '档案')) },
        { key: 'avatar-story', label: '正文头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '正文')) },
        { key: 'avatar-phone', label: '手机头像', src: 解析相册资源引用(album, 读取NPC头像(npc, '手机')) },
        { key: 'portrait', label: '角色立绘', src: 解析相册资源引用(album, npc.图像档案?.立绘) },
      ];
      const albumEntries = (entryIndex.get(npc.id) ?? [])
        .map((entry) => ({
          entry,
          src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
        }));
      const builtinEntries = buildBuiltinAvatarEntries(npc);
      const entries = [...builtinEntries, ...albumEntries];
      const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
      const resourceCount = entries.length;
      return {
        id: npc.id,
        kind: 'npc',
        name: npc.姓名,
        alias: npc.别名,
        avatar: 解析相册资源引用(album, 读取NPC头像(npc, '档案')),
        npc,
        entries,
        slots,
        imageCount: resourceCount + mountedCount,
        resourceCount,
        mountedCount,
      };
    })
    .sort((a, b) => b.imageCount - a.imageCount || a.npc.姓名.localeCompare(b.npc.姓名, 'zh-Hans-CN'));
  return [travelerRecord, ...npcRecords];
}
export function buildTravelerLibraryRecord(
  traveler: 角色数据结构,
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  indexedEntries?: 相册条目[],
): TravelerLibraryRecord {
  const travelerId = 'traveler';
  const slots: MountedImageSlot[] = [
    { key: 'traveler-avatar-profile', label: '档案头像', src: 解析相册资源引用(album, traveler.图像档案?.头像 || traveler.头像 || undefined) },
    { key: 'traveler-avatar-story', label: '正文头像', src: 解析相册资源引用(album, traveler.图像档案?.正文头像) },
    { key: 'traveler-avatar-phone', label: '手机头像', src: 解析相册资源引用(album, traveler.图像档案?.手机头像) },
    { key: 'traveler-portrait', label: '角色立绘', src: 解析相册资源引用(album, traveler.图像档案?.立绘) },
  ];
  const albumEntries = indexedEntries ?? buildCharacterAlbumEntryIndex(traveler, [], album, false).get(travelerId) ?? [];
  const entries = albumEntries
    .map((entry) => ({
      entry,
      src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
    }));
  const mountedCount = slots.filter((slot) => Boolean(slot.src)).length;
  const resourceCount = entries.length;
  return {
    id: travelerId,
    kind: 'traveler',
    name: traveler.姓名 || '旅人',
    alias: traveler.别名,
    avatar: 解析相册资源引用(album, traveler.图像档案?.头像 || traveler.头像 || undefined),
    traveler,
    entries,
    slots,
    imageCount: resourceCount + mountedCount,
    resourceCount,
    mountedCount,
  };
}
export function buildCharacterAlbumEntryIndex(
  traveler: 角色数据结构,
  npcs: NPC记录[],
  album: 相册系统,
  includeNsfw: boolean,
): Map<string, 相册条目[]> {
  const index = new Map<string, 相册条目[]>();
  const indexedEntryIds = new Map<string, Set<string>>();
  const knownIds = new Set(['traveler', ...npcs.map((npc) => npc.id)]);
  const npcNames = npcs.map((npc) => ({
    id: npc.id,
    names: [npc.姓名, npc.别名].map((name) => name?.trim()).filter((name): name is string => Boolean(name)),
  }));

  const add = (targetId: string, entry: 相册条目) => {
    if (!knownIds.has(targetId)) return;
    const entryIds = indexedEntryIds.get(targetId) ?? new Set<string>();
    if (entryIds.has(entry.id)) return;
    entryIds.add(entry.id);
    indexedEntryIds.set(targetId, entryIds);
    const entries = index.get(targetId) ?? [];
    entries.push(entry);
    index.set(targetId, entries);
  };

  for (const entry of album.entries) {
    if (entry.nsfw && !includeNsfw) continue;
    const referenceTargets = 读取图片参考目标(entry);
    const hasCharacterOwner = entry.targetType === 'traveler'
      || (entry.targetType === 'npc' && Boolean(entry.targetId));
    if (!isCharacterLibrarySlot(entry.slot) && referenceTargets.length === 0 && !hasCharacterOwner) continue;

    const targetIds = new Set(referenceTargets);
    if (entry.targetType === 'traveler') targetIds.add('traveler');
    if (entry.targetType === 'npc' && entry.targetId) targetIds.add(entry.targetId);

    if (targetIds.size === 0 && isCharacterLibrarySlot(entry.slot)) {
      const title = entry.title || '';
      if (title.includes(traveler.姓名 || '旅人') || title.includes('旅人')) targetIds.add('traveler');
      const matchedNpc = npcNames.find((npc) => npc.names.some((name) => title.includes(name)));
      if (matchedNpc) targetIds.add(matchedNpc.id);
    }
    for (const targetId of targetIds) add(targetId, entry);
  }
  return index;
}
export function buildAlbumResourceEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
  includeNsfw: boolean,
): CharacterLibraryEntry[] {
  return album.entries
    .filter((entry) => {
      if (!includeNsfw && entry.nsfw) return false;
      return (entry.targetType === 'traveler' || entry.targetType === 'npc') && isCharacterLibrarySlot(entry.slot);
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => ({
      entry,
      src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
    }));
}
export function buildSceneLibraryEntries(
  album: 相册系统,
  assetMap: Map<string, { dataUrl?: string; url?: string; localRef?: string }>,
): SceneLibraryEntry[] {
  return album.entries
    .map((entry) => {
      const kind = classifySceneLibraryEntry(entry);
      if (!kind) return null;
      return {
        entry,
        src: 解析相册资源地址(assetMap.get(entry.assetId)) || '',
        kind,
        label: sceneLibraryKindLabel(kind),
      };
    })
    .filter((item): item is SceneLibraryEntry => Boolean(item))
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt);
}
export function buildScopedCharacterGalleryEntries(record: CharacterLibraryRecord | null, resourceEntries: CharacterLibraryEntry[]): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = resourceEntries.filter((item) => {
    if (item.entry.targetId === record.id) return true;
    if (record.kind === 'traveler') return item.entry.targetType === 'traveler';
    return item.entry.targetType === 'npc' && item.entry.targetId === record.id;
  });
  const merged = [...record.entries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}
export function buildVisibleCharacterEntries(
  record: CharacterLibraryRecord | null,
  resourceEntries: CharacterLibraryEntry[],
  album: 相册系统,
): CharacterLibraryEntry[] {
  if (!record) return [];
  const scoped = buildScopedCharacterGalleryEntries(record, resourceEntries);
  const recordEntries = record.entries.filter((item) => isCharacterLibrarySlot(item.entry.slot) || item.entry.targetId === record.id);
  const builtin = record.kind === 'npc' ? buildBuiltinAvatarEntries(record.npc) : buildTravelerBuiltinAvatarEntries(record.traveler, album);
  const merged = [...builtin, ...recordEntries, ...scoped];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.entry.id)) return false;
    seen.add(item.entry.id);
    return true;
  });
}
export function buildBuiltinAvatarEntries(npc: NPC记录): CharacterLibraryEntry[] {
  const canonical = findNpcCanonicalName(npc);
  const set = getBuiltinAvatarSet(canonical);
  if (!set) return [];
  return set.candidates.map((candidate): CharacterLibraryEntry => ({
    entry: {
      id: `builtin-avatar:${npc.id}:${candidate.id}`,
      assetId: candidate.id,
      title: candidate.title,
      targetType: 'npc',
      targetId: npc.id,
      slot: 'avatar_profile',
      tags: ['内置头像', set.canonicalName],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
      referenceTargets: [],
    },
    src: candidate.src,
    mountSrc: candidate.reference,
    sourceLabel: '内置',
  }));
}
export function buildTravelerBuiltinAvatarEntries(traveler: 角色数据结构, album: 相册系统): CharacterLibraryEntry[] {
  const rawAvatar = traveler.图像档案?.头像 || traveler.头像 || '';
  if (rawAvatar.trim().startsWith('asset:')) return [];
  const avatar = 解析相册资源引用(album, rawAvatar) || '';
  if (!avatar) return [];
  return [{
    entry: {
      id: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      assetId: `builtin-avatar:traveler:${traveler.姓名 || 'traveler'}:profile`,
      title: `${traveler.姓名 || '旅人'}·档案头像`,
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
      tags: ['内置头像', traveler.姓名 || '旅人'],
      nsfw: false,
      createdAt: 0,
      note: '随包内置头像',
      referenceTargets: [],
    },
    src: avatar,
    sourceLabel: '内置',
  }];
}
export function classifySceneLibraryEntry(entry: 相册条目): Exclude<SceneLibraryFilter, 'all'> | null {
  const tags = new Set(entry.tags.map((tag) => tag.trim()).filter(Boolean));
  const note = (entry.note ?? '').trim();
  const title = entry.title.trim();
  const kindHint = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (/故事快照|快照|正文插图/.test(kindHint)) return 'snapshot';
  const text = `${title} ${note} ${Array.from(tags).join(' ')}`;
  if (tags.has('故事快照') || entry.targetType === 'scene' && /快照|正文插图|剧情瞬间/.test(text)) return 'snapshot';
  if (entry.targetType === 'phone' || entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || tags.has('手机背景') || /手机背景|壁纸/.test(text)) return 'phone';
  if (entry.targetType === 'scene' || entry.slot === 'scene' || tags.has('场景图') || /场景图/.test(text)) return 'scene';
  return null;
}
export function sceneLibraryKindLabel(kind: Exclude<SceneLibraryFilter, 'all'>): string {
  return {
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}
export function defaultAlbumEntryTags(target: typeof generateTargets[number]): string[] {
  if (target.id === 'scene') return ['场景图'];
  if (target.id === 'phone_wallpaper') return ['手机背景'];
  if (target.targetType === 'traveler' || target.targetType === 'npc') return [slotLabel(target.slot)];
  return [];
}
export function defaultAlbumEntryNote(target: typeof generateTargets[number]): string | undefined {
  if (target.id === 'scene') return '场景图';
  if (target.id === 'phone_wallpaper') return '手机背景';
  return undefined;
}
export function isNpcLibraryRecord(record: CharacterLibraryRecord | null | undefined): record is NpcLibraryRecord {
  return record?.kind === 'npc';
}
export function findNpcCanonicalName(npc: NPC记录): string | undefined {
  const avatarSet = getBuiltinAvatarSetForNames(npc.姓名, npc.别名);
  if (avatarSet) return avatarSet.canonicalName;

  const names = [npc.姓名, npc.别名]
    .flatMap((item) => (item ?? '').split(/[/／|、,，]/))
    .map((item) => item.trim())
    .filter(Boolean);
  for (const name of names) {
    const canonical = matchCanonical(name);
    if (canonical) return canonical.name;
  }
  return undefined;
}
export function mapImageSlotToNpcAvatarSlot(slot: 图片槽位): NPC头像槽位 {
  if (slot === 'avatar_story') return '正文';
  if (slot === 'avatar_phone') return '手机';
  return '档案';
}
export function mapImageSlotToTravelerSlot(slot: 图片槽位): '头像' | '正文头像' | '手机头像' | '立绘' {
  if (slot === 'avatar_story') return '正文头像';
  if (slot === 'avatar_phone') return '手机头像';
  if (slot === 'portrait') return '立绘';
  return '头像';
}
export function buildPresentSceneNpcs(npcs: NPC记录[], sceneText: string): NPC记录[] {
  const text = sceneText.trim();
  return npcs
    .map((npc) => ({
      npc,
      score: (text && (text.includes(npc.姓名) || Boolean(npc.别名 && text.includes(npc.别名))) ? 100 : 0) + (npc.同行 ? 80 : 0) + (npc.图像档案?.角色锚点?.正面提示词 ? 20 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.npc.最近回合 - a.npc.最近回合)
    .map((item) => item.npc)
    .slice(0, 4);
}
export function buildStorySnapshotSourceOptions(history: 聊天消息[]): StorySnapshotSourceOption[] {
  const assistantMessages = history.filter((message) => message.role === 'assistant' && message.content.trim());
  const latest = assistantMessages[assistantMessages.length - 1]?.content.trim() ?? '';
  const previous = assistantMessages[assistantMessages.length - 2]?.content.trim() ?? latest;
  return [
    { id: 'latest_assistant', title: '最近正文', desc: latest ? '上一条回复' : '暂无正文', text: trimSnapshotSource(latest) },
    { id: 'previous_turn', title: '上一回合', desc: previous && previous !== latest ? '再前一条' : '可回退', text: trimSnapshotSource(previous) },
    { id: 'manual', title: '手动片段', desc: '自行粘贴', text: '' },
  ];
}
export function trimSnapshotSource(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<变量事实>[\s\S]*?<\/变量事实>/g, '')
    .replace(/<变量更新>[\s\S]*?<\/变量更新>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1800);
}
export function extractStorySnapshot(text: string, traveler: 角色数据结构, npcs: NPC记录[]): StorySnapshotSummary {
  const source = trimSnapshotSource(text);
  const compact = source.replace(/\s+/g, ' ').trim();
  const names = [traveler.姓名 || '旅人', ...npcs.map((npc) => npc.姓名), ...npcs.flatMap((npc) => npc.别名 ? [npc.别名] : [])]
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  const characters = names.filter((name) => compact.includes(name)).slice(0, 5);
  const locationMatch = compact.match(/(?:在|于|来到|抵达|走进|进入)([^，。！？；]{2,18}(?:车厢|房间|大厅|街道|广场|港口|空间站|列车|仙舟|实验室|走廊|庭院|舱室|店|馆|城|镇|星球|裂界))/);
  const location = locationMatch?.[1]?.trim() || '当前剧情发生地点';
  const actionSentence = pickSentence(compact, ['走', '看', '握', '站', '坐', '伸', '转', '推', '接', '递', '笑', '沉默', '望', '靠近', '离开']) || compact.slice(0, 80) || '角色在当前情境中形成一个可视化瞬间';
  const atmosphere = inferSnapshotAtmosphere(compact);
  const title = buildSnapshotTitle(location, actionSentence);
  return {
    title,
    characters,
    location,
    atmosphere,
    action: actionSentence,
    camera: characters.length >= 2 ? '中景，保留人物站位关系与环境线索' : '中远景，先交代环境，再突出主体动作',
    avoid: '避免无关角色、现代摄影棚感、过度拥挤构图、与正文矛盾的服装或地点',
  };
}
export function pickSentence(text: string, keywords: string[]): string {
  const sentences = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  return sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword))) || sentences[0] || '';
}
export function inferSnapshotAtmosphere(text: string): string {
  if (/紧张|警惕|危险|压迫|战斗|爆炸|追逐|枪|刃|血/.test(text)) return '紧张、压迫、带有行动前后的张力';
  if (/温暖|笑|点心|午后|柔和|安静|闲聊|放松/.test(text)) return '温暖、安静、日常感';
  if (/雨|夜|霓虹|阴影|沉默|低声|秘密/.test(text)) return '低调、潮湿、带一点悬疑感';
  if (/实验|数据|屏幕|机械|空间站|装置/.test(text)) return '冷光、科技感、理性而克制';
  return '贴合正文情绪，保留剧情现场感';
}
export function buildSnapshotTitle(location: string, action: string): string {
  const subject = location.replace(/^当前剧情发生/, '').slice(0, 10) || '故事瞬间';
  const actionHint = action.replace(/[“”"']/g, '').slice(0, 12);
  return `${subject}${actionHint ? ` · ${actionHint}` : ''}`;
}
export function formatStorySnapshotSceneText(summary: StorySnapshotSummary): string {
  return [
    `画面标题：${summary.title}`,
    `出场人物：${summary.characters.length ? summary.characters.join('、') : '按正文片段决定'}`,
    `地点：${summary.location}`,
    `氛围：${summary.atmosphere}`,
    `关键动作：${summary.action}`,
    `镜头构图：${summary.camera}`,
    `不要出现：${summary.avoid}`,
  ].join('\n');
}
export function buildSceneSourceText(text: string, traveler: 角色数据结构, presentNpcs: NPC记录[]): string {
  const travelerAnchor = traveler.图像档案?.角色锚点;
  return [
    `场景说明：${text || '未填写'}`,
    `主控角色：${traveler.姓名 || '旅人'}`,
    traveler.外貌 ? `主控外貌：${traveler.外貌}` : '',
    travelerAnchor?.正面提示词 ? `主控锚点：${travelerAnchor.正面提示词}` : '',
    travelerAnchor?.负面提示词 ? `主控负面锚点：${travelerAnchor.负面提示词}` : '',
    presentNpcs.length ? `在场角色：${presentNpcs.map((npc) => npc.姓名).join('、')}` : '',
    ...presentNpcs.map((npc) => {
      const anchor = npc.图像档案?.角色锚点;
      return [
        `${npc.姓名}：${[npc.外貌, npc.穿着].filter(Boolean).join('，')}`,
        anchor?.正面提示词 ? `${npc.姓名}锚点：${anchor.正面提示词}` : '',
        anchor?.负面提示词 ? `${npc.姓名}负面锚点：${anchor.负面提示词}` : '',
      ].filter(Boolean).join('\n');
    }),
  ].filter(Boolean).join('\n');
}
export function anchorHasUsableContent(anchor?: NPC角色锚点档案): boolean {
  if (!anchor || anchor.是否启用 === false) return false;
  if (anchor.正面提示词?.trim() || anchor.负面提示词?.trim()) return true;
  return Object.values(anchor.结构化特征 ?? {}).some((list) => Array.isArray(list) && list.some((item) => item.trim()));
}
export function getTravelerAnchorStatus(traveler: 角色数据结构): PromptMeta {
  const anchor = traveler.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `主控锚点：${anchor?.名称 || traveler.姓名 || '旅人'}` : '未使用主控锚点，按旅人档案回退',
  };
}
export function getNpcAnchorStatus(npc: NPC记录): PromptMeta {
  const anchor = npc.图像档案?.角色锚点;
  const usable = anchorHasUsableContent(anchor) && anchor?.生成时默认附加 !== false;
  return {
    anchorMode: usable,
    anchorSummary: usable ? `角色锚点：${anchor?.名称 || npc.姓名}` : '未使用角色锚点，按伙伴档案回退',
  };
}
export function getSceneAnchorStatus(traveler: 角色数据结构, presentNpcs: NPC记录[]): PromptMeta {
  const names: string[] = [];
  const travelerAnchor = traveler.图像档案?.角色锚点;
  if (anchorHasUsableContent(travelerAnchor) && travelerAnchor?.场景生图自动注入 !== false) {
    names.push(travelerAnchor?.名称 || traveler.姓名 || '旅人');
  }
  for (const npc of presentNpcs) {
    const anchor = npc.图像档案?.角色锚点;
    if (anchorHasUsableContent(anchor) && anchor?.场景生图自动注入 !== false) names.push(anchor?.名称 || npc.姓名);
  }
  return {
    anchorMode: names.length > 0,
    anchorSummary: names.length ? `场景锚点：${names.slice(0, 4).join('、')}` : '未使用场景角色锚点',
  };
}
export function buildTravelerSourceText(traveler: 角色数据结构): string {
  return [
    `姓名：${traveler.姓名 || '未命名旅人'}`,
    traveler.性别 ? `性别：${traveler.性别}` : '',
    traveler.年龄 ? `年龄：${traveler.年龄}` : '',
    traveler.身高 ? `身高：${traveler.身高}` : '',
    traveler.身份 ? `身份：${traveler.身份}` : '',
    traveler.外貌 ? `外貌：${traveler.外貌}` : '',
    traveler.性格 ? `性格：${traveler.性格}` : '',
    traveler.背景 ? `背景：${traveler.背景}` : '',
    traveler.能力.length ? `能力：${traveler.能力.join('、')}` : '',
    traveler.主命途 ? `命途：${traveler.主命途}` : '',
    traveler.图像档案?.角色锚点?.名称 ? `主控锚点名称：${traveler.图像档案.角色锚点.名称}` : '',
    traveler.图像档案?.角色锚点?.正面提示词 ? `主控锚点：${traveler.图像档案.角色锚点.正面提示词}` : '',
    traveler.图像档案?.角色锚点?.负面提示词 ? `主控负面锚点：${traveler.图像档案.角色锚点.负面提示词}` : '',
  ].filter(Boolean).join('\n');
}
export function buildNpcSourceText(npc: NPC记录): string {
  return [
    `姓名：${npc.姓名}`,
    npc.别名 ? `别名：${npc.别名}` : '',
    npc.性别 ? `性别：${npc.性别}` : '',
    npc.原著角色 ? '原著角色：是' : '',
    npc.外貌 ? `外貌：${npc.外貌}` : '',
    npc.穿着 ? `穿着：${npc.穿着}` : '',
    npc.性格 ? `性格：${npc.性格}` : '',
    npc.说话方式 ? `说话方式：${npc.说话方式}` : '',
    npc.介绍 ? `介绍：${npc.介绍}` : '',
    npc.装备摘要 ? `装备：${npc.装备摘要}` : '',
    npc.图像档案?.头像提示词 ? `头像提示词：${npc.图像档案.头像提示词}` : '',
    npc.图像档案?.立绘提示词 ? `立绘提示词：${npc.图像档案.立绘提示词}` : '',
    npc.图像档案?.角色锚点?.名称 ? `角色锚点名称：${npc.图像档案.角色锚点.名称}` : '',
    npc.图像档案?.角色锚点?.正面提示词 ? `角色锚点：${npc.图像档案.角色锚点.正面提示词}` : '',
    npc.图像档案?.角色锚点?.负面提示词 ? `角色负面锚点：${npc.图像档案.角色锚点.负面提示词}` : '',
    npc.NSFW档案?.enabled ? `NSFW档案：${JSON.stringify(npc.NSFW档案)}` : '',
  ].filter(Boolean).join('\n');
}
export function createTask(input: {
  source?: 图片生成任务来源;
  prompt: string;
  negativePrompt?: string;
  sourcePrompt?: string;
  finalPrompt?: string;
  finalNegativePrompt?: string;
  anchorMode?: boolean;
  anchorSummary?: string;
  nsfw: boolean;
  backend: string;
  slot: 图片槽位;
  targetType: 图片目标类型;
  targetId?: string;
  dimensions?: string;
  referenceImageIds?: string[];
}): 图片生成任务 {
  return {
    id: `img_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetType: input.targetType,
    targetId: input.targetId,
    slot: input.slot,
    source: input.source ?? 'manual',
    status: 'running',
    backend: input.backend,
    nsfw: input.nsfw,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    sourcePrompt: input.sourcePrompt,
    finalPrompt: input.finalPrompt,
    finalNegativePrompt: input.finalNegativePrompt,
    anchorMode: input.anchorMode,
    anchorSummary: input.anchorSummary,
    referenceImageIds: input.referenceImageIds ?? [],
    dimensions: input.dimensions,
    retryCount: 0,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
}
export function requiresCharacterTarget(target: typeof generateTargets[number]): boolean {
  return target.targetType === 'npc' || target.targetType === 'nsfw_part';
}
export function resolveGenerationTargetId(target: typeof generateTargets[number], overrideTargetId: string | undefined, selectedNpcId: string): string | undefined {
  if (overrideTargetId) return overrideTargetId;
  if (target.targetType === 'traveler') return 'traveler';
  if (requiresCharacterTarget(target)) return selectedNpcId || undefined;
  return undefined;
}
export function cleanupAlbumAssets(album: 相册系统): 相册系统 {
  const used = new Set(album.entries.map((entry) => entry.assetId));
  const removed = album.assets.filter((asset) => !used.has(asset.id)).map((asset) => asset.id);
  if (removed.length) revokeAlbumAssets(removed);
  return {
    ...album,
    assets: album.assets.filter((asset) => used.has(asset.id)),
  };
}
export function statusLabel(status: 图片生成任务['status']): string {
  return {
    queued: '排队中',
    running: '生成中',
    success: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status];
}
export function taskPromptTitle(task: 图片生成任务): string {
  const kind = task.slot === 'scene' && task.sourcePrompt?.includes('故事快照') ? '故事快照' : slotLabel(task.slot);
  const suffix = task.status === 'failed' ? '失败任务' : task.status === 'success' ? '完成任务' : '生成任务';
  return `${kind} · ${suffix}`;
}
export function looksLikeRawPromptTitle(title: string): boolean {
  if (!title) return true;
  if (/[\u4e00-\u9fff]/.test(title)) return false;
  const lower = title.toLowerCase();
  return title.length > 18 || title.includes(',') || /cinematic|fantasy|environment|portrait|masterpiece|prompt|style|anime|illustration|photo/.test(lower);
}
export function imageBackendLabel(backend?: string): string {
  return {
    openai_compatible: 'OpenAI 兼容',
    novelai: 'NovelAI',
    sd_webui: 'SD WebUI',
    comfyui: 'ComfyUI',
  }[backend || ''] ?? (backend || '未记录');
}
export function generationSourceLabel(source?: string): string {
  return {
    manual: '手动生成',
    auto: '正文自动生成',
    retry: '重试生成',
    generated: '生成图片',
    upload: '本地上传',
    remote: '远程图片',
  }[source || ''] ?? (source || '未记录');
}
export function formatGenerationDate(value?: number): string {
  if (!value) return '未记录';
  try {
    return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '未记录';
  }
}
export function historyKind(entry: 相册条目): Exclude<GenerationHistoryFilter, 'all'> {
  const text = [entry.title, entry.note, ...entry.tags].join(' ');
  if (entry.slot === 'phone_wallpaper' || entry.slot === 'phone_chat_background' || entry.targetType === 'phone') return 'phone';
  if (/故事快照|快照|正文插图/.test(text)) return 'snapshot';
  if (entry.slot === 'scene' || entry.targetType === 'scene') return 'scene';
  return 'character';
}
export function historyKindLabel(kind: Exclude<GenerationHistoryFilter, 'all'>): string {
  return {
    character: '角色',
    scene: '场景图',
    snapshot: '故事快照',
    phone: '手机背景',
  }[kind];
}
export function pngStyleSourceLabel(source: PNG画风预设来源): string {
  if (source === 'novelai') return 'NAI 风格';
  if (source === 'sd_webui') return 'SD 风格';
  if (source === 'comfyui') return 'ComfyUI';
  return '通用风格';
}
export function resolvePromptMeta(task: 图片生成任务 | undefined, promptMeta: PromptMeta | null): PromptMeta | null {
  if (!task) return promptMeta;
  return {
    anchorMode: task.anchorMode === true,
    anchorSummary: task.anchorSummary || (task.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
    sourcePrompt: task.sourcePrompt,
  };
}
export function buildPngStyleOptions(imageRules: 文生图规则中心设置): Array<{ id: string; title: string; desc: string }> {
  return [
    { id: '', title: '无要求', desc: '不附加' },
    ...imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
}
export function buildBatchExtractPlan(records: NpcLibraryRecord[], travelerHasAnchor: boolean): Array<{ kind: 'traveler' } | { kind: 'npc'; npcId: string }> {
  const plan: Array<{ kind: 'traveler' } | { kind: 'npc'; npcId: string }> = [];
  if (!travelerHasAnchor) plan.push({ kind: 'traveler' });
  for (const record of records) {
    const anchor = record.npc.图像档案?.角色锚点;
    if (anchor?.正面提示词 || anchor?.负面提示词) continue;
    plan.push({ kind: 'npc', npcId: record.npc.id });
  }
  return plan;
}
export interface CharacterLibraryEntry {
  entry: 相册条目;
  src: string;
  mountSrc?: string;
  sourceLabel?: string;
}
export interface SceneLibraryEntry {
  entry: 相册条目;
  src: string;
  kind: Exclude<SceneLibraryFilter, 'all'>;
  label: string;
}
export interface MountedImageSlot {
  key: string;
  label: string;
  src?: string;
  nsfw?: boolean;
}
export type CharacterLibraryRecord = TravelerLibraryRecord | NpcLibraryRecord;
export interface BaseCharacterLibraryRecord {
  id: string;
  kind: 'traveler' | 'npc';
  name: string;
  alias?: string;
  avatar?: string;
  entries: CharacterLibraryEntry[];
  slots: MountedImageSlot[];
  imageCount: number;
  resourceCount: number;
  mountedCount: number;
}
export interface TravelerLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'traveler';
  traveler: 角色数据结构;
}
export interface NpcLibraryRecord extends BaseCharacterLibraryRecord {
  kind: 'npc';
  npc: NPC记录;
}
