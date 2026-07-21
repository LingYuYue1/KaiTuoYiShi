import type { AlbumCommandEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import type { AlbumImageGenerator, ExecutionContextProvider, SessionRepository } from '@/src/kernel/ports';
import { resolveCommandSettings } from './turn/turnExecutionState';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import type { 图片槽位, 图片槽位绑定, 相册条目, 相册系统 } from '@/models/imageGeneration';
import { 图片是否参考角色, 归一化相册系统 } from '@/models/imageGeneration';
import type { NPC头像槽位 } from '@/models/npc';
import {
  创建相册图片条目,
  设置NPC头像当前显示,
  设置NPC立绘当前显示,
  设置NPC_NSFW部位当前显示,
  设置旅人图片当前显示,
  清除NPC头像当前显示,
  清除NPC立绘当前显示,
  清除NPC_NSFW部位当前显示,
  清除旅人图片当前显示,
} from '@/utils/albumActions';
import { bindSlotOnAlbum, commitGeneratedOnAlbum, deleteEntriesOnAlbum } from '@/src/kernel/workflows/albumOperations';
import { executeSessionCommand, type StateReduction } from './executeSessionCommand';
import type { Clock } from '@/src/kernel/ports/Clock';

export async function* executeAlbumCommand(
  envelope: AlbumCommandEnvelope,
  dependencies: Readonly<{
    sessions: SessionRepository;
    context: ExecutionContextProvider;
    generator: AlbumImageGenerator;
    signal: AbortSignal;
    clock: Clock;
  }>,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, dependencies.sessions, (base) => reduceAlbumCommand(envelope, base, dependencies));
}

async function reduceAlbumCommand(
  envelope: AlbumCommandEnvelope,
  base: SessionSnapshot,
  dependencies: Readonly<{
    context: ExecutionContextProvider;
    generator: AlbumImageGenerator;
    signal: AbortSignal;
    clock: Clock;
  }>,
): Promise<StateReduction> {
  const command = envelope.command;
  switch (command.type) {
    case 'album.import-reference': return importReference(envelope.commandId, base, command);
    case 'album.set-reference': return setReference(base, command.entryId, command.characterId, command.enabled);
    case 'album.bind-slot': return bindSlot(base, command);
    case 'album.delete-entries': return deleteEntries(base, command.entryIds);
    case 'album.import-archive': return replaceAlbum(base, 归一化相册系统(command.album));
    case 'album.set-character-anchor': return setCharacterAnchor(base, command);
    case 'album.generate': return generateImage(envelope.commandId, base, command, dependencies);
  }
}

async function generateImage(
  commandId: import('@/src/kernel/contract').CommandId,
  base: SessionSnapshot,
  command: Extract<AlbumCommandEnvelope['command'], { type: 'album.generate' }>,
  dependencies: Readonly<{
    context: ExecutionContextProvider;
    generator: AlbumImageGenerator;
    signal: AbortSignal;
    clock: Clock;
  }>,
): Promise<StateReduction> {
  if (!command.prompt.trim()) return rejected('请先填写生图提示词。');
  if ((command.targetType === 'npc' || command.targetType === 'nsfw_part') && !command.targetId) {
    return rejected('角色图片生成必须指定目标角色。');
  }
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(base.state.story, overlay);
  const imageSettings = settings.文生图系统;
  if (!imageSettings.enabled) return rejected('请先在设置里启用文生图。');
  if (command.nsfw && !imageSettings.NSFW接口.enabled) return rejected('NSFW 文生图接口未启用。');
  if (!command.nsfw && !imageSettings.普通接口.enabled) return rejected('普通文生图接口未启用。');

  const api = command.nsfw ? imageSettings.NSFW接口 : imageSettings.普通接口;
  const characterId = command.targetType === 'traveler' ? 'traveler' : command.targetId;
  const mayReferenceCharacter = command.targetType === 'traveler' || command.targetType === 'npc' || command.targetType === 'nsfw_part';
  const backendSupportsReference = api.backend === 'sd_webui'
    || (api.backend === 'comfyui' && imageSettings.参考图.enableComfyWorkflowReference)
    || (api.backend === 'openai_compatible' && imageSettings.参考图.enableOpenAICompatibleReference);
  const referenceEntry = imageSettings.参考图.enabled && mayReferenceCharacter && backendSupportsReference && characterId
    ? base.state.story.album.entries.find((entry) => 图片是否参考角色(entry, characterId))
    : undefined;
  const referenceAsset = referenceEntry
    ? base.state.story.album.assets.find((asset) => asset.id === referenceEntry.assetId)
    : undefined;

  const assetId = `asset_${commandId}`;
  const entryId = `album_${commandId}`;
  const taskId = `img_task_${commandId}`;
  const result = await dependencies.generator.generate(
    settings,
    {
      assetId,
      prompt: command.prompt,
      negativePrompt: command.negativePrompt,
      nsfw: command.nsfw,
      dimensions: command.dimensions,
      references: referenceEntry && referenceAsset ? [{ entryId: referenceEntry.id, asset: referenceAsset }] : [],
    },
    dependencies.signal,
  );
  if (dependencies.signal.aborted) throw new DOMException('Aborted', 'AbortError');

  return commitAlbumGeneration({
    base,
    command,
    result,
    referenceEntry,
    assetId,
    entryId,
    taskId,
    finishedAt: dependencies.clock.now(),
  });
}

function commitAlbumGeneration(input: Readonly<{
  base: SessionSnapshot;
  command: Extract<AlbumCommandEnvelope['command'], { type: 'album.generate' }>;
  result: Awaited<ReturnType<AlbumImageGenerator['generate']>>;
  referenceEntry?: 相册条目;
  assetId: string;
  entryId: string;
  taskId: string;
  finishedAt: number;
}>): StateReduction {
  const { base, command, result, referenceEntry, assetId, entryId, taskId } = input;
  const asset: import('@/models/imageGeneration').图片资源 = {
    id: assetId, url: result.url, originalUrl: result.originalUrl, dataUrl: result.dataUrl,
    size: result.size, mimeType: result.mimeType, source: 'generated', nsfw: command.nsfw,
    createdAt: command.createdAt, prompt: command.prompt, negativePrompt: command.negativePrompt,
    sourcePrompt: command.sourcePrompt, finalPrompt: command.finalPrompt ?? command.prompt,
    finalNegativePrompt: command.finalNegativePrompt ?? command.negativePrompt,
    anchorMode: command.anchorMode, anchorSummary: command.anchorSummary,
    referenceImageIds: referenceEntry ? [referenceEntry.id] : [], dimensions: command.dimensions,
    model: result.model, backend: result.backend, status: 'ready',
  };
  const entry: 相册条目 = {
    id: entryId, assetId, title: command.title.trim() || '未命名图片', targetType: command.targetType,
    targetId: command.targetId, slot: command.slot, tags: [...command.tags], nsfw: command.nsfw,
    createdAt: command.createdAt, note: command.note, referenceTargets: [],
  };
  const task: import('@/models/imageGeneration').图片生成任务 = {
    id: taskId, targetType: command.targetType, targetId: command.targetId, slot: command.slot,
    source: command.source, status: 'success', backend: result.backend, nsfw: command.nsfw,
    prompt: command.prompt, negativePrompt: command.negativePrompt, sourcePrompt: command.sourcePrompt,
    finalPrompt: command.finalPrompt ?? command.prompt,
    finalNegativePrompt: command.finalNegativePrompt ?? command.negativePrompt,
    anchorMode: command.anchorMode, anchorSummary: command.anchorSummary,
    referenceImageIds: referenceEntry ? [referenceEntry.id] : [], dimensions: command.dimensions,
    resultAssetId: assetId, retryCount: result.retryCount, createdAt: command.createdAt,
    startedAt: command.createdAt, finishedAt: input.finishedAt,
  };
  return replaceAlbum(base, commitGeneratedOnAlbum(base.state.story.album, { asset, entry, task }).album);
}

function importReference(
  commandId: import('@/src/kernel/contract').CommandId,
  base: SessionSnapshot,
  command: Extract<AlbumCommandEnvelope['command'], { type: 'album.import-reference' }>,
): StateReduction {
  const created = 创建相册图片条目({
    assetId: `asset_${commandId}`,
    entryId: `album_${commandId}`,
    title: `${command.name} 参考图`,
    src: command.src,
    source: 'upload',
    targetType: command.targetKind === 'traveler' ? 'traveler' : 'npc',
    targetId: command.targetId,
    slot: 'misc',
    mimeType: command.mimeType,
    contentHash: command.contentHash,
    tags: ['参考图'],
    note: '手动上传参考图',
    referenceTargets: [command.targetId],
  });
  const item = {
    asset: { ...created.asset, createdAt: command.createdAt },
    entry: { ...created.entry, createdAt: command.createdAt },
  };
  const album = addOrReuse(base.state.story.album, item, command.contentHash, command.src);
  return replaceAlbum(base, {
    ...album.album,
    entries: setReferenceTargets(album.album.entries, album.entry.id, command.targetId, true),
  });
}

function setReference(base: SessionSnapshot, entryId: string, characterId: string, enabled: boolean): StateReduction {
  const album = base.state.story.album;
  if (!album.entries.some((entry) => entry.id === entryId)) return rejected('Album entry not found');
  return replaceAlbum(base, { ...album, entries: setReferenceTargets(album.entries, entryId, characterId, enabled) });
}

function bindSlot(base: SessionSnapshot, command: Extract<AlbumCommandEnvelope['command'], { type: 'album.bind-slot' }>): StateReduction {
  let album = base.state.story.album;
  if (command.builtin && !album.entries.some((entry) => entry.id === command.entryId)) {
    album = commitGeneratedOnAlbum(album, command.builtin).album;
  }
  const bound = bindSlotOnAlbum(album, {
    entryId: command.entryId,
    targetType: command.targetType,
    targetId: command.targetId,
    slot: command.slot,
  });
  const story = mountBinding(base.state.story, command.targetKind, command.targetId, command.slot, bound.assetRef, command.source);
  return { type: 'next', state: { story: { ...story, album: bound.album } } };
}

function deleteEntries(base: SessionSnapshot, entryIds: readonly string[]): StateReduction {
  const deleted = deleteEntriesOnAlbum(base.state.story.album, entryIds);
  let story = { ...base.state.story, album: deleted.album };
  for (const binding of deleted.removedBindings) story = clearBinding(story, binding);
  return { type: 'next', state: { story } };
}

function setCharacterAnchor(base: SessionSnapshot, command: Extract<AlbumCommandEnvelope['command'], { type: 'album.set-character-anchor' }>): StateReduction {
  if (command.targetKind === 'traveler') {
    const traveler = base.state.story.traveler;
    return {
      type: 'next',
      state: { story: { ...base.state.story, traveler: { ...traveler, 图像档案: { ...(traveler.图像档案 ?? {}), 角色锚点: mergeAnchor(traveler.图像档案?.角色锚点, command.anchor, traveler.姓名 || '旅人', command.updatedAt) } } } },
    };
  }
  if (!command.targetId || !base.state.story.characters.npcs.some((npc) => npc.id === command.targetId)) return rejected('NPC not found');
  return {
    type: 'next',
    state: { story: { ...base.state.story, characters: { npcs: base.state.story.characters.npcs.map((npc) => npc.id === command.targetId
      ? { ...npc, 图像档案: { ...(npc.图像档案 ?? {}), 角色锚点: mergeAnchor(npc.图像档案?.角色锚点, command.anchor, npc.姓名, command.updatedAt) } }
      : npc) } } },
  };
}

function mergeAnchor(current: import('@/models/npc').NPC角色锚点档案 | undefined, patch: import('@/models/npc').NPC角色锚点档案 | undefined, name: string, now: number) {
  if (!patch) return undefined;
  return {
    ...(current ?? {}),
    ...patch,
    id: patch.id || current?.id || `anchor_${now}`,
    名称: patch.名称 || current?.名称 || name,
    来源: patch.来源 || current?.来源 || 'manual',
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
}

function mountBinding(story: SessionSnapshot['state']['story'], kind: 'traveler' | 'npc', targetId: string, slot: 图片槽位, src: string, source: '原著' | '文生图') {
  if (kind === 'traveler') {
    const mapped = slot === 'portrait' ? '立绘' : mapTravelerSlot(slot);
    return { ...story, traveler: 设置旅人图片当前显示(story.traveler, { slot: mapped, src }) };
  }
  const npcs = [...story.characters.npcs];
  const nextNpcs = slot === 'portrait'
    ? 设置NPC立绘当前显示(npcs, { npcId: targetId, src, source })
    : slot === 'nsfw_female_chest' ? 设置NPC_NSFW部位当前显示(npcs, { npcId: targetId, slot: '女性胸部', src })
      : slot === 'nsfw_female_genital' ? 设置NPC_NSFW部位当前显示(npcs, { npcId: targetId, slot: '女性私处', src })
        : slot === 'nsfw_male_genital' ? 设置NPC_NSFW部位当前显示(npcs, { npcId: targetId, slot: '男性器', src })
          : slot === 'nsfw_rear' ? 设置NPC_NSFW部位当前显示(npcs, { npcId: targetId, slot: '后庭', src })
            : slot === 'nsfw_body_reference' ? 设置NPC_NSFW部位当前显示(npcs, { npcId: targetId, slot: '体态参考', src })
              : 设置NPC头像当前显示(npcs, { npcId: targetId, slot: mapNpcSlot(slot), src, source });
  return { ...story, characters: { npcs: nextNpcs } };
}

function clearBinding(story: SessionSnapshot['state']['story'], binding: 图片槽位绑定) {
  if (binding.targetType === 'traveler') {
    if (binding.slot.toString().startsWith('nsfw_')) return story;
    const slot = binding.slot === 'portrait' ? '立绘' : mapTravelerSlot(binding.slot);
    return { ...story, traveler: 清除旅人图片当前显示(story.traveler, { slot }) };
  }
  if (!binding.targetId) return story;
  const npcs = [...story.characters.npcs];
  const nextNpcs = binding.slot === 'portrait'
    ? 清除NPC立绘当前显示(npcs, { npcId: binding.targetId })
    : binding.slot === 'nsfw_female_chest' ? 清除NPC_NSFW部位当前显示(npcs, { npcId: binding.targetId, slot: '女性胸部' })
      : binding.slot === 'nsfw_female_genital' ? 清除NPC_NSFW部位当前显示(npcs, { npcId: binding.targetId, slot: '女性私处' })
        : binding.slot === 'nsfw_male_genital' ? 清除NPC_NSFW部位当前显示(npcs, { npcId: binding.targetId, slot: '男性器' })
          : binding.slot === 'nsfw_rear' ? 清除NPC_NSFW部位当前显示(npcs, { npcId: binding.targetId, slot: '后庭' })
            : binding.slot === 'nsfw_body_reference' ? 清除NPC_NSFW部位当前显示(npcs, { npcId: binding.targetId, slot: '体态参考' })
              : 清除NPC头像当前显示(npcs, { npcId: binding.targetId, slot: mapNpcSlot(binding.slot) });
  return { ...story, characters: { npcs: nextNpcs } };
}

function setReferenceTargets(entries: readonly 相册条目[], entryId: string, characterId: string, enabled: boolean): 相册条目[] {
  return entries.map((entry) => entry.id !== entryId ? entry : {
    ...entry,
    referenceTargets: enabled
      ? Array.from(new Set([...(entry.referenceTargets ?? []), characterId]))
      : (entry.referenceTargets ?? []).filter((id) => id !== characterId),
  });
}

function addOrReuse(albumInput: 相册系统, item: { asset: import('@/models/imageGeneration').图片资源; entry: 相册条目 }, hash: string, src: string) {
  const album = 归一化相册系统(albumInput);
  const asset = album.assets.find((candidate) => candidate.contentHash === hash || candidate.dataUrl === src || candidate.url === src || candidate.originalUrl === src);
  if (!asset) return { album: { ...album, assets: [item.asset, ...album.assets], entries: [item.entry, ...album.entries] }, entry: item.entry };
  const existing = album.entries.find((entry) => entry.assetId === asset.id && entry.targetType === item.entry.targetType && (entry.targetId || '') === (item.entry.targetId || '') && entry.slot === item.entry.slot);
  if (existing) return { album, entry: existing };
  const entry = { ...item.entry, assetId: asset.id };
  return { album: { ...album, entries: [entry, ...album.entries] }, entry };
}

function replaceAlbum(base: SessionSnapshot, album: 相册系统): StateReduction {
  return { type: 'next', state: { story: { ...base.state.story, album } } };
}

function mapNpcSlot(slot: 图片槽位): NPC头像槽位 {
  return slot === 'avatar_story' ? '正文' : slot === 'avatar_phone' ? '手机' : '档案';
}

function mapTravelerSlot(slot: 图片槽位): '头像' | '正文头像' | '手机头像' | '立绘' {
  return slot === 'avatar_story' ? '正文头像' : slot === 'avatar_phone' ? '手机头像' : slot === 'portrait' ? '立绘' : '头像';
}

function rejected(message: string): StateReduction {
  return { type: 'rejected', error: { code: 'no_changes', message } };
}
