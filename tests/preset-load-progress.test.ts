// 预置载入进度的契约：**无论成功还是失败，进度都必须单调走到总数**。
//
// 为什么值得单独测：界面靠 done / total 显示进度条，靠 status 判断何时解除门禁。
// 如果某个文件抛错就中断计数，进度会停在中途、门禁永远不会解除——玩家被卡在首页。
// 所以「失败也要计数」不是细节，是门禁能解除的前提。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bundledStoryWeavingPresets, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { bundledZhikuPresets, loadAllBundledZhikuPresets } from '@/data/zhikuPreset';

type ProgressCall = [number, number];

const increasingByOneTo = (calls: ProgressCall[], total: number): void => {
  expect(calls.map(([done]) => done)).toEqual(
    Array.from({ length: total }, (_, index) => index + 1),
  );
  expect(calls.every(([, reported]) => reported === total)).toBe(true);
};

describe('预置载入进度：失败也必须走到总数', () => {
  beforeEach(() => {
    // 全部失败：这是最坏情况，也是计数最容易漏掉的情况。
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('原著正文：27 个文件全部计入进度，然后才抛完整性错误', async () => {
    const calls: ProgressCall[] = [];
    await expect(
      loadAllBundledStoryWeavingPresets((done, total) => { calls.push([done, total]); }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(bundledStoryWeavingPresets.length);
    increasingByOneTo(calls, bundledStoryWeavingPresets.length);
  });

  it('智库目录：23 个文件全部计入进度，失败也计数', async () => {
    const calls: ProgressCall[] = [];
    await expect(
      loadAllBundledZhikuPresets({ onProgress: (done, total) => { calls.push([done, total]); } }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(bundledZhikuPresets.length);
    increasingByOneTo(calls, bundledZhikuPresets.length);
  });
});
