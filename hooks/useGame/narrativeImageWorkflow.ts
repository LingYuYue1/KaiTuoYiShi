import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项, API设置, 文生图API配置 } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 队列任务ID, 队列任务状态 } from '@/models/queueTask';
import { buildImagePromptTokenizerConfig } from '@/services/ai/imagePromptTokenizer';
import { pushQueueTask, cancelPendingQueueTasks, type 队列任务补丁 } from './workflowTaskRuntime';
import { beginWorkflowTransaction, isWorkflowAbortError } from './workflowTransaction';
import type { TurnStatus } from './turnStatus';
import { 创建相册图片条目, 添加图片到相册, 创建相册资源引用 } from '@/utils/albumActions';
import { 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { devLogError } from '@/utils/devLog';

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
  assertActive: () => void,
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
  assertActive();
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
  /** 会话身份守卫：旧工作流必须在任何 state 投影前中止（独立事务与主回合共用）。 */
  assertWorkflowActive?: () => void;
  /** 队列账本投递入口：独立事务走 tx.pushTask（同步叶子镜像），主回合走 ctx 镜像。 */
  pushTask?: (id: 队列任务ID, status: 队列任务状态, patch?: 队列任务补丁, turn?: number) => void;
}): Promise<{ images: import('@/models/chat').叙事插图[] | null; 相册: 相册系统 }> {
  const { state, messageId, body, tokenizerConfig, imageApiConfig, turn, signal, replaceExisting = false } = params;
  const assertActive = params.assertWorkflowActive ?? (() => {});
  const pushTask: (id: 队列任务ID, status: 队列任务状态, patch?: 队列任务补丁, turn?: number) => void =
    params.pushTask ?? ((id, status, patch, taskTurn) => pushQueueTask(state, id, status, patch, taskTurn));
  const failMessage = (error: string) => {
    if (!replaceExisting) return;
    assertActive();
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
  pushTask('narrative_image_parse', 'pending', {
    detail: '正在解析正文中的故事快照提示词。',
    turn,
    targetMessageId: messageId,
    cancellable: true,
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
    assertActive();
    pushTask('narrative_image_parse', 'success', {
      detail: `已解析故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const generatedImages: import('@/models/chat').叙事插图[] = [];
    pushTask('narrative_image_generate', 'pending', {
      detail: `正在生成故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
      cancellable: true,
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
    assertActive();
    const archivedResult = archiveNarrativeSnapshotToAlbum(state, result, {
      title: parsedSnapshot.title || '故事快照',
      size: '1280x720',
      sourcePrompt: body,
    }, assertActive);
    generatedImages.push(archivedResult.image);
    pushTask('narrative_image_generate', result.status === 'done' ? 'success' : 'failed', {
      detail: result.status === 'done'
        ? `${parsedSnapshot.title || '故事快照'} 故事快照生成完成。`
        : `${parsedSnapshot.title || '故事快照'} 故事快照生成失败：${result.error}`,
      turn,
      targetMessageId: messageId,
    });
    if (generatedImages.length > 0) {
      assertActive();
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
      pushTask('narrative_image_parse', 'failed', {
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
  opts?: { mode?: 'retry' | 'reroll' },
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId);
  if (!message || message.role !== 'assistant') return;
  const body = message.parsedResponse?.body.trim() || message.content.trim();
  if (!body) return;
  const narrative = state.deviceSettings.gameSettings.文生图系统.正文生图;
  const turn = Number(message.gameTime) || state.turnCount;
  if (!narrative.enabled) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图未启用，无法重新生成故事快照。',
      turn,
      targetMessageId: messageId,
    });
    return;
  }
  const mainConfig = getActiveConfig();
  if (!mainConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '未配置主 API，无法解析故事快照提示词。',
      turn,
      targetMessageId: messageId,
    });
    return;
  }
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state, mainConfig);
  if (!tokenizerConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn,
      targetMessageId: messageId,
    });
    return;
  }
  const imageApiConfig = resolveNarrativeImageGenerationApi(state);
  if (!imageApiConfig) {
    pushQueueTask(state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      turn,
      targetMessageId: messageId,
    });
    return;
  }

  const mode = opts?.mode ?? 'retry';
  const tx = await beginWorkflowTransaction(state, {
    turnStatus: {
      kind: 'generating',
      text: mode === 'reroll' ? '正在重新解析并生成故事快照。' : '正在重新生成故事快照。',
    },
  });
  if (!tx) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '当前有任务进行中，请等待完成后再重新生成。',
      turn,
      targetMessageId: messageId,
    });
    return;
  }

  let terminalStatus: TurnStatus | undefined;
  const previousHistory = state.chatHistory;
  let leafWritten = false;
  try {
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
    const result = await generateNarrativeImagesForMessage({
      state,
      messageId,
      body,
      tokenizerConfig,
      imageApiConfig,
      turn,
      replaceExisting: true,
      signal: tx.signal,
      assertWorkflowActive: tx.assertActive,
      pushTask: tx.pushTask,
    });
    tx.assertActive();
    const images = result.images;
    if (!images?.length) {
      terminalStatus = { kind: 'failed', text: '故事快照重新生成失败。', failCount: 1 };
      return;
    }
    const nextHistory = state.chatHistory.map((item) =>
      item.id === messageId && item.role === 'assistant'
        ? { ...item, narrativeImages: images }
        : item,
    );
    await tx.writeLeaf({ chatHistory: nextHistory, 相册: result.相册 });
    leafWritten = true;
    state.setChatHistory(nextHistory);
    state.set相册(result.相册);
    if (images.some((image) => image.status !== 'done')) {
      terminalStatus = { kind: 'failed', text: '故事快照生成失败，可稍后重试。', failCount: 1 };
    }
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        // 中止：撤掉「生成中」投影，叶子未写、状态与持久化保持一致。
        state.setChatHistory(previousHistory);
        cancelPendingQueueTasks(state);
        terminalStatus = { kind: 'stopped', text: '已取消故事快照重新生成。' };
      }
      return;
    }
    devLogError('net', 'regenerateNarrativeImages.failed', error, { messageId });
    if (tx.isCurrent() && !leafWritten) {
      // 叶子写入失败：生成结果只存在于 React state，回滚到快照避免伪持久化。
      state.setChatHistory(previousHistory);
    }
    tx.pushTask('narrative_image_parse', 'failed', {
      detail: `故事快照重新生成失败：${(error as Error).message}`,
      turn,
      targetMessageId: messageId,
    });
    terminalStatus = { kind: 'failed', text: '故事快照重新生成失败。', failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

