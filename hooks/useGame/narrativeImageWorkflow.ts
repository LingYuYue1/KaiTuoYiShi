import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项, API设置, 文生图API配置 } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { buildImagePromptTokenizerConfig } from '@/services/ai/imagePromptTokenizer';
import { pushQueueTask } from './workflowTaskRuntime';
import { 创建相册图片条目, 添加图片到相册, 创建相册资源引用 } from '@/utils/albumActions';
import { 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';

function buildSingleApiSettings(config: API配置项): API设置 {
  return {
    activeConfigId: config.id,
    configs: [config],
  };
}

export function resolveNarrativeImageTokenizerConfig(state: UseGameStateReturn, mainConfig: API配置项): API配置项 | null {
  return buildImagePromptTokenizerConfig(state.deviceSettings.gameSettings, buildSingleApiSettings(mainConfig));
}

export function resolveNarrativeImageGenerationApi(state: UseGameStateReturn): 文生图API配置 | null {
  const imageSettings = state.deviceSettings.gameSettings.文生图系统;
  return imageSettings.普通接口.enabled ? imageSettings.普通接口 : null;
}

function archiveNarrativeSnapshotToAlbum(
  state: UseGameStateReturn,
  image: import('@/models/chat').叙事插图,
  params: {
    title: string;
    size: string;
    sourcePrompt: string;
  },
): { image: import('@/models/chat').叙事插图; 相册: 相册系统 } {
  if (image.status !== 'done' || !image.dataUrl) return { image, 相册: state.相册 };
  const item = 创建相册图片条目({
    title: params.title || image.description || '故事快照',
    src: image.dataUrl,
    source: 'generated',
    targetType: 'scene',
    slot: 'scene',
    prompt: image.prompt,
    negativePrompt: image.negativePrompt,
    sourcePrompt: params.sourcePrompt,
    finalPrompt: image.prompt,
    finalNegativePrompt: image.negativePrompt,
    dimensions: params.size,
    tags: ['故事快照', '正文生图'],
    note: '故事快照',
  });
  // 投影点（B2 定性，S22）：相册面板即时刷新；同时捕获提交后的相册值供 d.相册After（片 5a-2 题外发现 #1）。
  let 相册After = state.相册;
  state.set相册((prev) => {
    相册After = 添加图片到相册(prev, item);
    return 相册After;
  });
  return {
    image: {
      ...image,
      dataUrl: 创建相册资源引用(item.asset.id),
      assetId: item.asset.id,
    },
    相册: 相册After,
  };
}

export async function generateNarrativeImagesForMessage(params: {
  state: UseGameStateReturn;
  messageId: string;
  body: string;
  tokenizerConfig: API配置项;
  imageApiConfig: 文生图API配置;
  turn: number;
  signal?: AbortSignal;
  replaceExisting?: boolean;
}): Promise<{ images: import('@/models/chat').叙事插图[] | null; 相册: 相册系统 }> {
  const { state, messageId, body, tokenizerConfig, imageApiConfig, turn, signal, replaceExisting = false } = params;
  const failMessage = (error: string) => {
    if (!replaceExisting) return;
    state.setChatHistory((prev) => prev.map((msg) =>
      msg.id === messageId && msg.role === 'assistant'
        ? {
            ...msg,
            narrativeImages: [{
              id: `narrative_failed_${turn}_${Date.now()}`,
              dataUrl: '',
              type: 'scene' as const,
              kind: 'snapshot' as const,
              prompt: '',
              negativePrompt: '',
              description: '故事快照',
              status: 'failed' as const,
              error,
            }],
          }
        : msg,
    ));
  };
  pushQueueTask(state, 'narrative_image_parse', 'pending', {
    detail: '正在解析正文中的故事快照提示词。',
    turn,
    targetMessageId: messageId,
  });
  try {
    const { parseStorySnapshotPrompt } = await import('@/services/ai/narrativeImageParse');
    const { generateNarrativeImage } = await import('@/services/ai/imageGeneration');
    const playerAppearanceMode = state.deviceSettings.gameSettings.文生图系统.正文生图.playerAppearanceMode;
    const presentNpcRecords = state.NPC
      .filter((npc: import('@/models/npc').NPC记录) => npc.阶位 === 'companion' && (npc.外貌 || npc.穿着))
      .slice(0, 8);
    const traveler = state.旅人;
    const presentNpcs = presentNpcRecords
      .map((npc: import('@/models/npc').NPC记录) => ({
        name: npc.姓名,
        appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
        clothing: typeof npc.穿着 === 'string' ? npc.穿着 : undefined,
      }));
    const parsedSnapshot = await parseStorySnapshotPrompt(tokenizerConfig, {
      body,
      traveler: playerAppearanceMode === 'off' ? undefined : {
        name: traveler.姓名 || traveler.别名 || '玩家角色',
        gender: traveler.性别 || undefined,
        appearance: traveler.外貌 || undefined,
        identity: traveler.身份 || undefined,
        anchorPrompt: traveler.图像档案?.角色锚点 ? JSON.stringify(traveler.图像档案.角色锚点) : undefined,
      },
      playerAppearanceMode,
      presentNpcs,
    }, signal);
    pushQueueTask(state, 'narrative_image_parse', 'success', {
      detail: `已解析故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const generatedImages: import('@/models/chat').叙事插图[] = [];
    pushQueueTask(state, 'narrative_image_generate', 'pending', {
      detail: `正在生成故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const imageId = `narrative_${turn}_snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const lockedPrompt = 应用场景角色锚点锁({
      prompt: parsedSnapshot.prompt,
      negative: parsedSnapshot.negativePrompt,
      traveler: playerAppearanceMode === 'off' ? undefined : traveler,
      forceTravelerVisible: playerAppearanceMode === 'force',
      presentNpcs: presentNpcRecords,
    });
    const promptRefined = 应用质量增强提示词(
      state.deviceSettings.gameSettings.文生图系统.rules,
      lockedPrompt.prompt,
      lockedPrompt.negative,
    );
    const result = await generateNarrativeImage(
      imageApiConfig,
      promptRefined.prompt,
      promptRefined.negative,
      'scene',
      parsedSnapshot.title || '故事快照',
      imageId,
      signal,
    );
    if (result.status === 'done' || result.status === 'failed') {
      result.kind = 'snapshot';
    }
    const archivedResult = archiveNarrativeSnapshotToAlbum(state, result, {
      title: parsedSnapshot.title || '故事快照',
      size: '1280x720',
      sourcePrompt: body,
    });
    generatedImages.push(archivedResult.image);
    pushQueueTask(state, 'narrative_image_generate', result.status === 'done' ? 'success' : 'failed', {
      detail: result.status === 'done'
        ? `${parsedSnapshot.title || '故事快照'} 故事快照生成完成。`
        : `${parsedSnapshot.title || '故事快照'} 故事快照生成失败：${result.error}`,
      turn,
      targetMessageId: messageId,
    });
    if (generatedImages.length > 0) {
      state.setChatHistory((prev) => {
        const targetIdx = prev.findIndex((msg) => msg.id === messageId);
        if (targetIdx < 0) return prev;
        const targetMsg = prev[targetIdx];
        if (targetMsg.role !== 'assistant') return prev;
        const updated = [...prev];
        updated[targetIdx] = {
          ...targetMsg,
          narrativeImages: replaceExisting
            ? generatedImages
            : [...(targetMsg.narrativeImages ?? []), ...generatedImages],
        };
        return updated;
      });
    }
    return {
      images: generatedImages.length > 0 ? generatedImages : null,
      相册: archivedResult.相册,
    };
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      failMessage((err as Error).message);
      pushQueueTask(state, 'narrative_image_parse', 'failed', {
        detail: `故事快照解析失败：${(err as Error).message}`,
        turn,
        targetMessageId: messageId,
      });
    }
    return { images: null, 相册: state.相册 };
  }
}

export async function regenerateNarrativeImagesForMessage(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  messageId: string,
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId);
  if (!message || message.role !== 'assistant') return;
  const body = message.parsedResponse?.body.trim() || message.content.trim();
  if (!body) return;
  const narrative = state.deviceSettings.gameSettings.文生图系统.正文生图;
  if (!narrative.enabled) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图未启用，无法重新生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
  }
  const mainConfig = getActiveConfig();
  if (!mainConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '未配置主 API，无法解析故事快照提示词。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
  }
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state, mainConfig);
  if (!tokenizerConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
  }
  const imageApiConfig = resolveNarrativeImageGenerationApi(state);
  if (!imageApiConfig) {
    pushQueueTask(state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
  }
  const turn = Number(message.gameTime) || state.turnCount;
  const previousImages = message.narrativeImages ?? [];
  state.setChatHistory((prev) => prev.map((item) =>
    item.id === messageId
      ? {
          ...item,
          narrativeImages: previousImages.length
            ? previousImages.map((img) => ({ ...img, status: 'generating' as const, error: undefined }))
            : [{
                id: `narrative_regen_${turn}_${Date.now()}`,
                dataUrl: '',
                type: 'scene' as const,
                prompt: '',
                negativePrompt: '',
                description: '故事快照',
                kind: 'snapshot' as const,
                status: 'generating' as const,
              }],
        }
      : item,
  ));
  await generateNarrativeImagesForMessage({
    state,
    messageId,
    body,
    tokenizerConfig,
    imageApiConfig,
    turn,
    replaceExisting: true,
  });
}

