// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { ZhikuArchiveExperience } from '@/components/features/ZhikuV3/ZhikuArchiveExperience';
import {
  buildPersistedZhikuSystem,
  fetchAllBundledZhikuPresetsText,
  mergeBundledZhikuSystem,
  加工内置智库目录,
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
} from '@/data/zhikuPreset';
import { fetchAllBundledStoryWeavingPresetsText, 加工内置原著系列 } from '@/data/storyWeavingPreset';
import { useGameState } from '@/hooks/useGameState';
import { 创建空智库系统, 创建智库条目, 归一化智库系统 } from '@/models/zhiku';
import type { 智库系统 } from '@/models/zhiku';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { deleteSetting } from '@/services/storage/settings';
import { devLog, devLogError } from '@/utils/devLog';

vi.mock('@/data/zhikuPreset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/zhikuPreset')>()),
  fetchAllBundledZhikuPresetsText: vi.fn(),
  加工内置智库目录: vi.fn(),
}));
vi.mock('@/data/storyWeavingPreset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/storyWeavingPreset')>()),
  fetchAllBundledStoryWeavingPresetsText: vi.fn(),
  加工内置原著系列: vi.fn(),
}));

const mockZhikuText = vi.mocked(fetchAllBundledZhikuPresetsText);
const mockZhikuProcess = vi.mocked(加工内置智库目录);
const mockStoryText = vi.mocked(fetchAllBundledStoryWeavingPresetsText);
const mockStoryProcess = vi.mocked(加工内置原著系列);

const charEntry = 创建智库条目({
  标题: '星',
  分类: 'character',
  关联角色ID: '星',
  关联形态ID: '常态',
  原文: '星河旅人的档案正文内容',
  关键词: ['列车'],
});

const termEntry = 创建智库条目({
  标题: '琥珀纪',
  分类: 'term',
  原文: '琥珀纪是宇宙纪年单位。',
});

const emptyStory = () => 归一化剧情编织系统(undefined);

const renderArchive = (overrides?: Record<string, unknown>) => render(
  <ZhikuArchiveExperience
    zhikuSystem={归一化智库系统({ 条目: [charEntry, termEntry] })}
    storyWeavingSystem={emptyStory()}
    onZhikuSystemChange={vi.fn()}
    {...overrides}
  />,
);

const rootOf = (container: HTMLElement): HTMLElement => {
  const root = container.querySelector('.zj-root');
  if (!(root instanceof HTMLElement)) throw new Error('missing .zj-root');
  return root;
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockStoryText.mockResolvedValue([]);
  mockStoryProcess.mockReturnValue(emptyStory());
  mockZhikuText.mockResolvedValue([]);
  mockZhikuProcess.mockReturnValue(归一化智库系统({ 条目: [] }));
  await deleteSetting('zhikuSystem');
  await deleteSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
  await deleteSetting('storyWeavingSystem');
});

describe('home 智库目录就绪信号', () => {
  it('boot 未完成时标注 pending，而不是静默 0 条', () => {
    const { container } = render(
      <ZhikuArchiveExperience
        zhikuSystem={创建空智库系统()}
        storyWeavingSystem={emptyStory()}
        onZhikuSystemChange={vi.fn()}
        catalogStatus="pending"
      />,
    );
    const root = rootOf(container);
    expect(root).toHaveAttribute('data-catalog-status', 'pending');
    expect(container.querySelector('[data-archive-state="empty"]')).not.toBeNull();
  });

  it('目录就绪时标注 ready，条数可见', () => {
    const { container } = renderArchive({ catalogStatus: 'ready' });
    const root = rootOf(container);
    expect(root).toHaveAttribute('data-catalog-status', 'ready');
    expect(root.textContent ?? '').toContain('2 条资料');
  });

  it('目录失败时标注 failed 并保留空态提示', () => {
    const { container } = render(
      <ZhikuArchiveExperience
        zhikuSystem={创建空智库系统()}
        storyWeavingSystem={emptyStory()}
        onZhikuSystemChange={vi.fn()}
        catalogStatus="failed"
      />,
    );
    const root = rootOf(container);
    expect(root).toHaveAttribute('data-catalog-status', 'failed');
    expect(container.querySelector('[data-archive-state="empty"]')).not.toBeNull();
  });
});

describe('boot 智库合并状态与日志', () => {
  it('合并前 loading，合并后 ready 并记录 boot 日志', async () => {
    let resolveLoad!: (value: string[]) => void;
    mockZhikuText.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => { resolveLoad = resolve; }),
    );
    mockZhikuProcess.mockReturnValue(归一化智库系统({ 条目: [charEntry, termEntry] }));
    const { result, unmount } = renderHook(() => useGameState());

    expect(result.current.presetLoad.zhiku.status).toBe('loading');
    expect(result.current.智库.条目).toHaveLength(0);

    await waitFor(() => expect(mockZhikuText).toHaveBeenCalled(), { timeout: 5000 });
    resolveLoad(['z']);

    await waitFor(() => expect(result.current.presetLoad.zhiku.status).toBe('ready'), { timeout: 5000 });
    expect(result.current.智库.条目).toHaveLength(2);
    expect(vi.mocked(devLog)).toHaveBeenCalledWith(
      'save',
      'zhiku-boot-merged',
      expect.objectContaining({ total: 2 }),
    );
    unmount();
  });

  it('目录不可用时标记 failed 并记录失败日志', async () => {
    mockZhikuProcess.mockImplementationOnce(() => { throw new Error('catalog boom'); });
    const { result } = renderHook(() => useGameState());

    await waitFor(() => expect(result.current.presetLoad.zhiku.status).toBe('failed'), { timeout: 5000 });
    expect(vi.mocked(devLogError)).toHaveBeenCalledWith(
      'save',
      'preset-load-failed',
      expect.any(Error),
      { track: 'zhiku' },
    );
  });
});

describe('轻量持久化壳往返', () => {
  it('合并恢复内置全文并保留运行时解锁与自制条目', () => {
    const builtin = 创建智库条目({
      标题: '内置术语',
      分类: 'term',
      原文: '内置全文正文',
      运行时解锁状态: '已解锁',
      builtin: true,
    });
    const custom = 创建智库条目({ 标题: '自制资料', 分类: 'term', 原文: '自制正文' });
    const full: 智库系统 = 归一化智库系统({ 条目: [builtin, custom] });

    const shell = buildPersistedZhikuSystem(full);
    expect(shell.条目.find((entry) => entry.标题 === '内置术语')?.原文).toBe('');

    const merged = mergeBundledZhikuSystem(full, shell, Date.now());
    const restored = merged.条目.find((entry) => entry.标题 === '内置术语');
    expect(restored?.原文).toBe('内置全文正文');
    expect(restored?.运行时解锁状态).toBe('已解锁');
    expect(merged.条目.some((entry) => entry.标题 === '自制资料')).toBe(true);
  });
});
