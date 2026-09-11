// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { 相册系统, 图片资源, 相册条目, 图片生成任务 } from '@/models/imageGeneration';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { buildImageTaskFeed, ImageTaskWorkspace } from '@/components/features/GameSystems/album/taskWorkspace';
import { taskPromptTitle } from '@/components/features/GameSystems/album/albumWorkspaceLogic';
import { clearAlbumAssetObjectUrlCache } from '@/utils/albumObjectUrl';

afterEach(() => {
  clearAlbumAssetObjectUrlCache();
});

function makeAsset(overrides: Partial<图片资源> & { id: string }): 图片资源 {
  return {
    source: 'generated',
    nsfw: false,
    createdAt: 1,
    status: 'ready',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<相册条目> & { id: string; assetId: string }): 相册条目 {
  return {
    title: overrides.id,
    targetType: 'traveler',
    targetId: 'traveler',
    slot: 'avatar_profile',
    tags: [],
    nsfw: false,
    createdAt: 1,
    referenceTargets: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<图片生成任务> & { id: string }): 图片生成任务 {
  return {
    targetType: 'traveler',
    targetId: 'traveler',
    slot: 'avatar_profile',
    source: 'manual',
    status: 'queued',
    backend: 'sd_webui',
    nsfw: false,
    prompt: '测试提示词',
    retryCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

function makeAlbum(parts: { assets?: 图片资源[]; entries?: 相册条目[]; tasks?: 图片生成任务[] }): 相册系统 {
  return 归一化相册系统({ assets: parts.assets ?? [], entries: parts.entries ?? [], tasks: parts.tasks ?? [] });
}

function feedKey(item: ReturnType<typeof buildImageTaskFeed>[number]): string {
  return item.kind === 'image' ? `image:${item.entry.id}` : `task:${item.task.id}`;
}

describe('unified task feed', () => {
  it('keeps pending, failed, cancelled and orphaned tasks while suppressing attached successes', () => {
    const attachedEntry = makeEntry({ id: 'entry-attached', assetId: 'asset-attached', createdAt: 150 });
    const attachedTask = makeTask({ id: 'task-attached', status: 'success', resultAssetId: 'asset-attached', createdAt: 400 });
    const album = makeAlbum({
      assets: [makeAsset({ id: 'asset-attached', url: 'https://cdn.example/attached.png' })],
      entries: [attachedEntry],
      tasks: [
        attachedTask,
        makeTask({ id: 'task-pending', status: 'queued', createdAt: 200 }),
        makeTask({ id: 'task-running', slot: 'portrait', status: 'running', createdAt: 250 }),
        makeTask({ id: 'task-failed', slot: 'portrait', status: 'failed', error: '上游超时', createdAt: 300 }),
        makeTask({ id: 'task-cancelled', status: 'cancelled', createdAt: 350 }),
      ],
    });

    const feed = buildImageTaskFeed(album, false);

    expect(feed.map(feedKey)).toEqual([
      'task:task-cancelled',
      'task:task-failed',
      'task:task-running',
      'task:task-pending',
      'image:entry-attached',
    ]);

    const image = feed[4];
    if (image.kind !== 'image') throw new Error('expected an image feed item');
    expect(image.entry).toEqual(attachedEntry);
    expect(image.src).toBe('https://cdn.example/attached.png');
    expect(image.task?.id).toBe('task-attached');

    const failed = feed.find((item) => item.kind === 'task' && item.task.id === 'task-failed');
    if (!failed || failed.kind !== 'task') throw new Error('expected a failed task feed item');
    expect(failed.orphaned).toBe(false);
    expect(failed.task.status).toBe('failed');
    expect(failed.createdAt).toBe(300);
  });

  it('marks successful tasks without an attached entry as orphaned', () => {
    const orphanNoResult = makeTask({ id: 'task-orphan-no-result', status: 'success', createdAt: 100 });
    const orphanMissingAsset = makeTask({ id: 'task-orphan-missing-asset', status: 'success', resultAssetId: 'asset-gone', createdAt: 200 });
    const attachedEntry = makeEntry({ id: 'entry-attached', assetId: 'asset-attached', createdAt: 300 });
    const attachedFailure = makeTask({ id: 'task-failed-with-result', status: 'failed', resultAssetId: 'asset-attached', createdAt: 400 });
    const album = makeAlbum({
      assets: [makeAsset({ id: 'asset-attached', url: 'https://cdn.example/attached.png' })],
      entries: [attachedEntry],
      tasks: [orphanNoResult, orphanMissingAsset, attachedFailure],
    });

    const feed = buildImageTaskFeed(album, false);
    const taskItems = feed.filter((item) => item.kind === 'task');

    expect(feed.map(feedKey)).toEqual([
      'task:task-failed-with-result',
      'image:entry-attached',
      'task:task-orphan-missing-asset',
      'task:task-orphan-no-result',
    ]);
    expect(taskItems.map((item) => [item.task.id, item.orphaned])).toEqual([
      ['task-failed-with-result', false],
      ['task-orphan-missing-asset', true],
      ['task-orphan-no-result', true],
    ]);
  });

  it('binds the newest successful task to its result asset exactly once', () => {
    const entry = makeEntry({ id: 'entry-one', assetId: 'asset-one', createdAt: 100 });
    const older = makeTask({ id: 'task-older', status: 'success', resultAssetId: 'asset-one', retryCount: 0, createdAt: 200 });
    const newer = makeTask({ id: 'task-newer', status: 'success', resultAssetId: 'asset-one', retryCount: 2, createdAt: 300 });
    const album = makeAlbum({
      assets: [makeAsset({ id: 'asset-one', url: 'https://cdn.example/one.png' })],
      entries: [entry],
      tasks: [older, newer],
    });

    const feed = buildImageTaskFeed(album, false);

    expect(feed.map(feedKey)).toEqual(['image:entry-one']);
    const image = feed[0];
    if (image.kind !== 'image') throw new Error('expected an image feed item');
    expect(image.task?.id).toBe('task-newer');
    expect(image.task?.retryCount).toBe(2);
  });

  it('applies the nsfw switch to entries and tasks together', () => {
    const safeEntry = makeEntry({ id: 'entry-safe', assetId: 'asset-safe', createdAt: 100 });
    const nsfwEntry = makeEntry({ id: 'entry-nsfw', assetId: 'asset-nsfw', nsfw: true, createdAt: 200 });
    const safeTask = makeTask({ id: 'task-safe', status: 'queued', createdAt: 300 });
    const nsfwTask = makeTask({ id: 'task-nsfw', status: 'queued', nsfw: true, createdAt: 400 });
    const album = makeAlbum({
      assets: [
        makeAsset({ id: 'asset-safe', url: 'https://cdn.example/safe.png' }),
        makeAsset({ id: 'asset-nsfw', url: 'https://cdn.example/nsfw.png', nsfw: true }),
      ],
      entries: [safeEntry, nsfwEntry],
      tasks: [safeTask, nsfwTask],
    });

    expect(buildImageTaskFeed(album, false).map(feedKey)).toEqual([
      'task:task-safe',
      'image:entry-safe',
    ]);
    expect(buildImageTaskFeed(album, true).map(feedKey)).toEqual([
      'task:task-nsfw',
      'task:task-safe',
      'image:entry-nsfw',
      'image:entry-safe',
    ]);
  });
});

describe('task feed filters', () => {
  it('narrows the merged feed by task state and image kind', () => {
    const characterEntry = makeEntry({ id: 'entry-character', assetId: 'asset-character', title: '角色图甲', createdAt: 100 });
    const sceneEntry = makeEntry({ id: 'entry-scene', assetId: 'asset-scene', title: '场景图乙', targetType: 'scene', targetId: undefined, slot: 'scene', createdAt: 200 });
    const snapshotEntry = makeEntry({ id: 'entry-snapshot', assetId: 'asset-snapshot', title: '快照图丙', targetType: 'scene', targetId: undefined, slot: 'scene', tags: ['故事快照'], createdAt: 300 });
    const phoneEntry = makeEntry({ id: 'entry-phone', assetId: 'asset-phone', title: '壁纸图丁', targetType: 'phone', targetId: undefined, slot: 'phone_wallpaper', createdAt: 400 });
    const pending = makeTask({ id: 'task-pending', slot: 'avatar_profile', status: 'queued', createdAt: 500 });
    const failed = makeTask({ id: 'task-failed', slot: 'portrait', status: 'failed', error: '上游超时', createdAt: 600 });
    const cancelled = makeTask({ id: 'task-cancelled', slot: 'portrait', status: 'cancelled', createdAt: 650 });
    const orphan = makeTask({ id: 'task-orphan', slot: 'scene', status: 'success', resultAssetId: 'asset-gone', createdAt: 700 });
    const album = makeAlbum({
      assets: [
        makeAsset({ id: 'asset-character', url: 'https://cdn.example/character.png' }),
        makeAsset({ id: 'asset-scene', url: 'https://cdn.example/scene.png' }),
        makeAsset({ id: 'asset-snapshot', url: 'https://cdn.example/snapshot.png' }),
        makeAsset({ id: 'asset-phone', url: 'https://cdn.example/phone.png' }),
      ],
      entries: [characterEntry, sceneEntry, snapshotEntry, phoneEntry],
      tasks: [pending, failed, cancelled, orphan],
    });

    render(
      <ImageTaskWorkspace
        album={album}
        includeNsfw
        onSelectEntry={vi.fn<(id: string) => void>()}
        onRetry={vi.fn<(task?: 图片生成任务) => void>()}
      />,
    );

    const titles = {
      character: characterEntry.title,
      scene: sceneEntry.title,
      snapshot: snapshotEntry.title,
      phone: phoneEntry.title,
      pending: taskPromptTitle(pending),
      failed: taskPromptTitle(failed),
      cancelled: taskPromptTitle(cancelled),
      orphan: taskPromptTitle(orphan),
    };

    const expectOnly = (visible: string[]) => {
      for (const title of Object.values(titles)) {
        if (visible.includes(title)) expect(screen.queryByText(title)).not.toBeNull();
        else expect(screen.queryByText(title)).toBeNull();
      }
    };

    expectOnly(Object.values(titles));

    fireEvent.click(screen.getByRole('button', { name: '进行中' }));
    expectOnly([titles.pending]);

    fireEvent.click(screen.getByRole('button', { name: '失败 / 异常' }));
    expectOnly([titles.failed, titles.cancelled, titles.orphan]);

    fireEvent.click(screen.getByRole('button', { name: '角色' }));
    expectOnly([titles.character]);

    fireEvent.click(screen.getByRole('button', { name: '场景' }));
    expectOnly([titles.scene]);

    fireEvent.click(screen.getByRole('button', { name: '快照' }));
    expectOnly([titles.snapshot]);

    fireEvent.click(screen.getByRole('button', { name: '手机' }));
    expectOnly([titles.phone]);

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expectOnly(Object.values(titles));
  });
});
