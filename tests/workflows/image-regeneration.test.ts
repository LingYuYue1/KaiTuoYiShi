import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStateHarness } from '../helpers/gameStateHarness';
import { seedWorkspace } from '../helpers/workspaceFixture';
import { regenerateNarrativeImagesForMessage } from '@/hooks/useGame/narrativeImageWorkflow';
import { cancelActiveWorkflow } from '@/hooks/useGame/workflowTransaction';
import { parseStorySnapshotPrompt } from '@/services/ai/narrativeImageParse';
import { generateNarrativeImage } from '@/services/ai/imageGeneration';
import { loadActiveLeaf } from '@/services/storage/saveTree';
import { getStreamingMessage } from '@/utils/streamingMessageStore';
import { 创建空解析回复, type 聊天消息 } from '@/models/chat';
import type { 队列任务记录 } from '@/models/queueTask';
import type { 游戏设置 } from '@/models/settings';

vi.mock('@/services/ai/narrativeImageParse', () => ({
  parseStorySnapshotPrompt: vi.fn(),
}));
vi.mock('@/services/ai/imageGeneration', () => ({
  generateNarrativeImage: vi.fn(),
}));

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SNAPSHOT = {
  title: '测试瞬间',
  characters: [],
  location: '',
  atmosphere: '',
  action: '',
  camera: '',
  avoid: '',
  prompt: 'a prompt',
  negativePrompt: 'bad',
  rawText: '',
};

const IMAGE = {
  id: 'img-1',
  dataUrl: PNG_DATA_URL,
  type: 'scene' as const,
  kind: 'snapshot' as const,
  prompt: 'a prompt',
  negativePrompt: 'bad',
  description: '测试瞬间',
  status: 'done' as const,
};

function assistantMessage(id: string, body = '正文内容'): 聊天消息 {
  return {
    id,
    role: 'assistant',
    content: body,
    timestamp: 2,
    gameTime: '2',
    parsedResponse: { ...创建空解析回复(), body, rawText: body },
  };
}

function enableNarrativeImage(settings: 游戏设置): 游戏设置 {
  return {
    ...settings,
    文生图系统: {
      ...settings.文生图系统,
      普通接口: {
        ...settings.文生图系统.普通接口,
        enabled: true,
        baseUrl: 'https://image.test/v1',
        apiKey: 'image-key',
        model: 'image-model',
      },
      正文生图: {
        ...settings.文生图系统.正文生图,
        enabled: true,
      },
    },
  };
}

function latestTask(tasks: 队列任务记录[], id: 队列任务记录['id']): 队列任务记录 | undefined {
  return [...tasks].reverse().find((task) => task.id === id);
}

describe('narrative image regeneration transaction', () => {
  const parseMock = vi.mocked(parseStorySnapshotPrompt);
  const imageMock = vi.mocked(generateNarrativeImage);

  beforeEach(() => {
    parseMock.mockReset();
    imageMock.mockReset();
  });

  it('persists regenerated images to chatHistory and album through the active leaf', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [assistantMessage('assistant-1')],
    });
    harness.setGameSettings(enableNarrativeImage);
    parseMock.mockResolvedValue(SNAPSHOT);
    imageMock.mockResolvedValue(IMAGE);

    await regenerateNarrativeImagesForMessage(harness.state, harness.getActiveConfig, 'assistant-1');

    expect(harness.activeWorkflow.loading).toBe(false);
    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error(`活跃叶子不可读：${active.status}`);
    const message = active.leaf.chatHistory.find((item) => item.id === 'assistant-1');
    expect(message?.narrativeImages).toHaveLength(1);
    expect(message?.narrativeImages?.[0]?.assetId).toBeTruthy();
    expect(active.leaf.相册?.assets).toHaveLength(1);
    expect(latestTask(active.leaf.queueTasks ?? [], 'narrative_image_parse')?.status).toBe('success');
    expect(latestTask(active.leaf.queueTasks ?? [], 'narrative_image_generate')?.status).toBe('success');
  });

  it('cancels a regeneration without writing partially generated images', async () => {
    const harness = createGameStateHarness();
    await seedWorkspace(harness.state, {
      turnCount: 2,
      chatHistory: [assistantMessage('assistant-1')],
    });
    harness.setGameSettings(enableNarrativeImage);
    parseMock.mockImplementation((_config, _ctx, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    const regeneration = regenerateNarrativeImagesForMessage(harness.state, harness.getActiveConfig, 'assistant-1');
    await vi.waitFor(() => {
      expect(latestTask(harness.cells.queueTasks.get(), 'narrative_image_parse')?.status).toBe('pending');
    });

    cancelActiveWorkflow(harness.state);
    await regeneration;

    expect(harness.activeWorkflow.loading).toBe(false);
    expect(getStreamingMessage()).toBe('');
    expect(harness.activeWorkflow.turnStatus.kind).toBe('stopped');
    expect(latestTask(harness.cells.queueTasks.get(), 'narrative_image_parse')?.status).toBe('cancelled');
    const stateMessage = harness.cells.chatHistory.get().find((item) => item.id === 'assistant-1');
    expect(stateMessage?.narrativeImages ?? []).toHaveLength(0);

    const active = await loadActiveLeaf();
    if (active.status !== 'ok') throw new Error(`活跃叶子不可读：${active.status}`);
    const message = active.leaf.chatHistory.find((item) => item.id === 'assistant-1');
    expect(message?.narrativeImages ?? []).toHaveLength(0);
    expect(active.leaf.相册?.assets ?? []).toHaveLength(0);
  });
});
