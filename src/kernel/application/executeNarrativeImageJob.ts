import type { TurnExecutionState } from './turn/turnExecutionState';
import type { AlbumAuthoring } from '@/src/kernel/ports/AlbumAuthoring';
import type { AlbumImageGenerator } from '@/src/kernel/ports/AlbumImageGenerator';
import type { IdGenerator } from '@/src/kernel/ports/IdGenerator';
import { 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { 创建相册图片条目, 创建相册资源引用 } from '@/utils/albumActions';
import { commitGeneratedOnAlbum } from '@/src/kernel/workflows/albumOperations';

export async function executeNarrativeImageJob(
  state: TurnExecutionState,
  messageId: string,
  dependencies: Readonly<{
    authoring: AlbumAuthoring;
    generator: AlbumImageGenerator;
    ids: IdGenerator;
    signal: AbortSignal;
  }>,
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId && item.role === 'assistant');
  if (!message) throw new Error(`Narrative image target message not found: ${messageId}`);
  const body = message.parsedResponse?.body?.trim() || message.content.trim();
  if (!body) throw new Error('Narrative image target body is empty');
  const narrative = state.gameSettings.文生图系统.正文生图;
  if (!narrative.enabled) throw new Error('Narrative image generation is disabled');

  const traveler = state.旅人;
  const presentNpcRecords = state.NPC
    .filter((npc) => npc.阶位 === 'companion' && (npc.外貌 || npc.穿着))
    .slice(0, 8);
  const parsed = await dependencies.authoring.parseStorySnapshot(state.gameSettings, {
    body,
    traveler: narrative.playerAppearanceMode === 'off' ? undefined : {
      name: traveler.姓名 || traveler.别名 || '玩家角色',
      gender: traveler.性别 || undefined,
      appearance: traveler.外貌 || undefined,
      identity: traveler.身份 || undefined,
      anchorPrompt: traveler.图像档案?.角色锚点 ? JSON.stringify(traveler.图像档案.角色锚点) : undefined,
    },
    playerAppearanceMode: narrative.playerAppearanceMode,
    presentNpcs: presentNpcRecords.map((npc) => ({
      name: npc.姓名,
      appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
      clothing: typeof npc.穿着 === 'string' ? npc.穿着 : undefined,
    })),
  }, dependencies.signal);
  const locked = 应用场景角色锚点锁({
    prompt: parsed.prompt,
    negative: parsed.negativePrompt,
    traveler: narrative.playerAppearanceMode === 'off' ? undefined : traveler,
    forceTravelerVisible: narrative.playerAppearanceMode === 'force',
    presentNpcs: presentNpcRecords,
  });
  const refined = 应用质量增强提示词(state.gameSettings.文生图系统.rules, locked.prompt, locked.negative);
  const assetId = dependencies.ids.next('narrative-image');
  const generated = await dependencies.generator.generate(state.gameSettings, {
    assetId,
    prompt: refined.prompt,
    negativePrompt: refined.negative,
    nsfw: false,
    dimensions: '1280x720',
    references: [],
  }, dependencies.signal);
  const src = generated.dataUrl ?? generated.url ?? generated.originalUrl;
  if (!src) throw new Error('Narrative image generator returned no asset reference');
  const title = parsed.title || '故事快照';
  const item = 创建相册图片条目({
    assetId,
    title,
    src,
    source: 'generated',
    targetType: 'scene',
    slot: 'scene',
    prompt: refined.prompt,
    negativePrompt: refined.negative,
    sourcePrompt: body,
    finalPrompt: refined.prompt,
    finalNegativePrompt: refined.negative,
    dimensions: '1280x720',
    tags: ['故事快照', '正文生图'],
    note: '故事快照',
  });
  state.相册 = commitGeneratedOnAlbum(state.相册, { asset: item.asset, entry: item.entry }).album;
  state.chatHistory = state.chatHistory.map((candidate) => candidate.id === messageId ? {
    ...candidate,
    narrativeImages: [{
      id: dependencies.ids.next('narrative-snapshot'),
      dataUrl: 创建相册资源引用(item.asset.id),
      assetId: item.asset.id,
      type: 'scene',
      prompt: refined.prompt,
      negativePrompt: refined.negative,
      description: title,
      kind: 'snapshot',
      status: 'done',
    }],
  } : candidate);
}
