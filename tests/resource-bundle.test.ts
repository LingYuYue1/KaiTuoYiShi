import { describe, expect, it } from 'vitest';
import { loadAllOrThrow } from '@/data/resourceBundle';

describe('loadAllOrThrow', () => {
  it('保持输入顺序，即使完成顺序相反', async () => {
    const result = await loadAllOrThrow({
      items: [1, 2, 3, 4],
      label: String,
      fetchOne: async (n) => {
        await new Promise((resolve) => setTimeout(resolve, (5 - n) * 5));
        return n * 10;
      },
      concurrency: 4,
    });
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('进度单调走到总数', async () => {
    const calls: number[] = [];
    await loadAllOrThrow({
      items: [1, 2, 3],
      label: String,
      fetchOne: (n) => Promise.resolve(n),
      onProgress: (done) => calls.push(done),
    });
    expect(calls).toEqual([1, 2, 3]);
  });

  it('任一失败即整体失败，并在错误里指名是哪一项', async () => {
    await expect(loadAllOrThrow({
      items: ['a', 'b', 'c'],
      label: (item) => `预设 ${item}`,
      fetchOne: (item) => {
        if (item === 'b') throw new Error('坏文件');
        return Promise.resolve(item);
      },
    })).rejects.toThrow(/预设 b：坏文件/u);
  });

  it('失败也计数：进度不停在中途', async () => {
    const calls: number[] = [];
    await expect(loadAllOrThrow({
      items: [1, 2, 3],
      label: String,
      fetchOne: () => Promise.reject(new Error('offline')),
      onProgress: (done) => calls.push(done),
    })).rejects.toThrow();
    expect(calls).toEqual([1, 2, 3]);
  });
});
