import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPresetLoader, type PresetTrack, type Resource } from '@/services/presetLoader';
import type { ResourceProgress } from '@/data/resourceBundle';
import { 创建空剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空智库系统 } from '@/models/zhiku';
import type { 智库系统 } from '@/models/zhiku';

const readyStory = () => 创建空剧情编织系统();
const readyZhiku = () => 创建空智库系统();

/** 简单的两段轨道：fetch 立刻回一条载荷并上报进度，process 立刻产出结果。 */
const simpleStory = (total: number): PresetTrack<剧情编织系统, string> => ({
  total,
  fetch: (onProgress: ResourceProgress) => {
    onProgress(total, total);
    return Promise.resolve(Array.from({ length: total }, (_, index) => `s${index}`));
  },
  process: () => Promise.resolve(readyStory()),
});

const simpleZhiku = (total: number): PresetTrack<智库系统, string> => ({
  total,
  fetch: (onProgress: ResourceProgress) => {
    onProgress(total, total);
    return Promise.resolve(Array.from({ length: total }, (_, index) => `z${index}`));
  },
  process: () => Promise.resolve(readyZhiku()),
});

const storyValue = (resource: Resource<剧情编织系统>): 剧情编织系统 | null =>
  resource.status === 'ready' ? resource.value : null;

describe('createPresetLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 幂等：重复调用只跑一轮', async () => {
    const fetch = vi.fn(() => Promise.resolve(['s']));
    const loader = createPresetLoader({
      story: { total: 1, fetch, process: () => Promise.resolve(readyStory()) },
      zhiku: simpleZhiku(1),
    });

    loader.start();
    loader.start();

    await vi.waitFor(() => expect(loader.getSnapshot().story.status).toBe('ready'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('两路各自落定：一路失败不影响另一路变 ready', async () => {
    const loader = createPresetLoader({
      story: { total: 1, fetch: () => Promise.reject(new Error('原著挂了')), process: () => Promise.resolve(readyStory()) },
      zhiku: simpleZhiku(1),
    });

    loader.start();

    const failed = await vi.waitFor(() => {
      const story = loader.getSnapshot().story;
      if (story.status !== 'failed') throw new Error('still loading');
      return story;
    });
    expect(failed.reason).toContain('原著挂了');
    await vi.waitFor(() => expect(loader.getSnapshot().zhiku.status).toBe('ready'));
  });

  it('网络进度合计两路，且 phase 依次为 network → processing → ready', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loader = createPresetLoader({
      story: {
        total: 2,
        fetch: (onProgress) => {
          onProgress(1, 2);
          onProgress(2, 2);
          return Promise.resolve(['s0', 's1']);
        },
        process: async () => { await gate; return readyStory(); },
      },
      zhiku: simpleZhiku(1),
    });

    loader.start();
    // fetch 同步上报，但加工未完成：网络进度已满，相位尚未离开 network（fetched 未置位）。
    expect(loader.getSnapshot().network.done).toBe(3);
    expect(loader.getSnapshot().network.total).toBe(3);

    await vi.waitFor(() => expect(loader.getSnapshot().phase).toBe('processing'));
    // 网络已满、加工未完成：门禁不得放行。
    expect(loader.getSnapshot().story.status).not.toBe('ready');

    release();
    await vi.waitFor(() => expect(loader.getSnapshot().phase).toBe('ready'));
    expect(loader.getSnapshot().story.status).toBe('ready');
  });

  it('retry 丢弃旧一轮的迟到结果', async () => {
    const fresh = readyStory();
    let releaseFirst!: () => void;
    let fetchCall = 0;
    const loader = createPresetLoader({
      story: {
        total: 1,
        fetch: () => {
          fetchCall += 1;
          if (fetchCall === 1) {
            return new Promise<string[]>((resolve) => { releaseFirst = () => resolve(['stale']); });
          }
          return Promise.resolve(['fresh']);
        },
        process: () => Promise.resolve(fresh),
      },
      zhiku: simpleZhiku(1),
    });

    loader.start();
    loader.retry();
    await vi.waitFor(() => expect(storyValue(loader.getSnapshot().story)).toBe(fresh));

    // 旧一轮现在才落定，必须被丢弃。
    releaseFirst();
    await Promise.resolve();
    expect(storyValue(loader.getSnapshot().story)).toBe(fresh);
  });

  it('超时降级为 failed，不会永远挂在 loading', async () => {
    vi.useFakeTimers();
    const loader = createPresetLoader({
      story: { total: 1, fetch: () => new Promise<string[]>(() => {}), process: () => Promise.resolve(readyStory()) },
      zhiku: simpleZhiku(1),
      timeoutMs: 1000,
    });

    loader.start();
    await vi.advanceTimersByTimeAsync(1000);

    const story = loader.getSnapshot().story;
    expect(story.status).toBe('failed');
    expect(story.status === 'failed' && story.reason).toContain('超时');
  });

  it('subscribe 推送快照，退订后不再推送', async () => {
    const loader = createPresetLoader({ story: simpleStory(1), zhiku: simpleZhiku(1) });
    const seen: string[] = [];
    const unsubscribe = loader.subscribe((snapshot) => { seen.push(snapshot.phase); });

    loader.start();
    await vi.waitFor(() => expect(loader.getSnapshot().phase).toBe('ready'));
    expect(seen).toContain('ready');

    const count = seen.length;
    unsubscribe();
    loader.retry();
    expect(seen.length).toBe(count);
  });
});
