// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ZhikuArchiveExperience } from '@/components/features/ZhikuV3/ZhikuArchiveExperience';
import { 归一化剧情编织系列, 归一化剧情编织系统 } from '@/models/storyWeaving';
import { 创建空智库系统, 创建智库条目, 归一化智库系统 } from '@/models/zhiku';
import type { 智库系统 } from '@/models/zhiku';
import type { BundledZhikuCatalogLoadResult } from '@/data/zhikuCatalogRepository';

const FONT_SIZE_STORAGE_KEY = 'kaituo-zhiku-reader-font-size';

/**
 * 当前 jsdom/Node 环境下 window.localStorage 属性不可用（读取得到 undefined）。
 * 阅读组件对存储不可用已有兜底；这里提供内存 Storage 实现，让字号持久化逻辑可以被验证。
 */
function ensureLocalStorage(): Storage {
  if (typeof window.localStorage !== 'undefined') return window.localStorage;
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, value); },
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  return shim;
}

const getStorage = (): Storage => ensureLocalStorage();

/** 重载按钮的可访问名随状态变化，统一用 data-refresh-status 属性定位并等待状态。 */
const getRefreshButton = (): HTMLButtonElement => (
  document.querySelector('button[data-refresh-status]') as HTMLButtonElement
);

const waitForRefreshStatus = async (status: string) => {
  await waitFor(() => {
    expect(getRefreshButton()).toHaveAttribute('data-refresh-status', status);
  });
};

const baseCharacterEntry = 创建智库条目({
  标题: '星｜常态',
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

const customStoryEntry = 创建智库条目({
  标题: '自制第一幕',
  分类: 'story',
  系列ID: 'custom_s1',
  系列标题: '自制卷宗',
  章节序号: 1,
  原文: '这是自制剧情的章节正文。',
});

function buildStorySystem() {
  const series = 归一化剧情编织系列({
    id: 'canon_1',
    标题: '开拓主线卷',
    作品名: '开拓主线',
    来源类型: 'canon',
    章节列表: [
      { id: 'ch_1', 序号: 1, 标题: '第一幕', 内容: '主线章节的正文内容', 字数: 9 },
      { id: 'ch_2', 序号: 2, 标题: '第二幕', 内容: '', 字数: 0 },
    ],
    分段列表: [{
      id: 'seg_1',
      组号: 1,
      起始章序号: 1,
      结束章序号: 1,
      运行状态: '当前',
    }] as never,
  });
  return 归一化剧情编织系统({ 当前系列ID: 'canon_1', 系列列表: [series] });
}

/** 两个可读章节的分段剧情：用于上一章 / 下一章导航。 */
function buildNavigableStorySystem() {
  const series = 归一化剧情编织系列({
    id: 'canon_nav',
    标题: '导航卷',
    作品名: '导航作品',
    来源类型: 'canon',
    章节列表: [
      { id: 'nav_ch_1', 序号: 1, 标题: '起航章', 内容: '起航章正文', 字数: 5 },
      { id: 'nav_ch_2', 序号: 2, 标题: '抵达章', 内容: '抵达章正文', 字数: 5 },
    ],
    分段列表: [{
      id: 'nav_seg_1',
      组号: 1,
      起始章序号: 1,
      结束章序号: 2,
      运行状态: '已经历',
    }] as never,
  });
  return 归一化剧情编织系统({ 当前系列ID: 'canon_nav', 系列列表: [series] });
}

const defaultProps = {
  zhikuSystem: 归一化智库系统({ 条目: [baseCharacterEntry, termEntry, customStoryEntry] }),
  storyWeavingSystem: buildStorySystem(),
  onZhikuSystemChange: vi.fn(),
  onManage: vi.fn(),
  onClose: vi.fn(),
};

type ArchiveProps = Parameters<typeof ZhikuArchiveExperience>[0];

function renderArchive(overrides?: Partial<ArchiveProps>) {
  const props: ArchiveProps = {
    ...(defaultProps as unknown as ArchiveProps),
    ...overrides,
  };
  const view = render(<ZhikuArchiveExperience {...props} />);
  return { view, props };
}

beforeEach(() => {
  vi.clearAllMocks();
  getStorage().removeItem(FONT_SIZE_STORAGE_KEY);
});

describe('智库档案大厅', () => {
  it('分类节点以按钮形式呈现，点击人物进入档案并阅读正文，返回回到大厅', () => {
    renderArchive();

    expect(screen.getByRole('button', { name: /^人物，/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^剧情档案，/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^人物，/ }));
    expect(screen.getByLabelText('人物列表')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '阅读星' }));
    expect(screen.getByText('星河旅人的档案正文内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回分类大厅' }));
    expect(screen.getByRole('button', { name: /^人物，/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('人物列表')).not.toBeInTheDocument();
  });

  it('空档案在大厅显示空态提示', () => {
    renderArchive({
      zhikuSystem: 创建空智库系统(),
      storyWeavingSystem: 归一化剧情编织系统(null),
    });
    const lobby = screen.getByLabelText('智库分类大厅');
    expect(lobby.querySelector('[data-archive-state="empty"]')).toBeInTheDocument();
  });
});

describe('人物形态切换', () => {
  it('同一关联角色ID的两个形态提供形态按钮，选中另一形态展示对应正文', () => {
    const alternate = 创建智库条目({
      标题: '星｜饮月',
      分类: 'character',
      关联角色ID: '星',
      关联形态ID: '饮月',
      原文: '饮月形态的档案正文',
    });
    renderArchive({
      zhikuSystem: 归一化智库系统({ 条目: [baseCharacterEntry, alternate, termEntry] }),
    });

    fireEvent.click(screen.getByRole('button', { name: /^人物，/ }));
    fireEvent.click(screen.getByRole('button', { name: '阅读星' }));
    expect(screen.getByText('星河旅人的档案正文内容')).toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText('选择档案形态')).getByRole('tab', { name: '饮月' }));
    expect(screen.getByText('饮月形态的档案正文')).toBeInTheDocument();
    expect(screen.queryByText('星河旅人的档案正文内容')).not.toBeInTheDocument();
  });
});

describe('注入内容面板', () => {
  it('切换到注入内容后展示关键词和注入预览文本块', () => {
    renderArchive();
    fireEvent.click(screen.getByRole('button', { name: /^人物，/ }));
    fireEvent.click(screen.getByRole('button', { name: '阅读星' }));

    fireEvent.click(screen.getByRole('tab', { name: '注入内容' }));
    expect(screen.getByText('列车')).toBeInTheDocument();
    expect(document.querySelector('pre.zj-terminal')).toBeInTheDocument();
  });
});

describe('剧情档案', () => {
  it('卷宗与章节：阅读正文、锁定章节不可点、下一章按钮存在', () => {
    renderArchive();
    fireEvent.click(screen.getByRole('button', { name: /^剧情档案，/ }));

    const index = screen.getByLabelText('剧情卷宗与章节目录');
    // 卷宗标题优先取作品名。
    expect(within(index).getByText('开拓主线')).toBeInTheDocument();

    const readable = within(index).getByRole('button', { name: '阅读第 1 章：第一幕' });
    expect(readable).toHaveAttribute('data-status', 'current');
    fireEvent.click(readable);
    expect(screen.getByText('主线章节的正文内容')).toBeInTheDocument();

    const locked = within(index).getByRole('button', { name: '第 2 章，尚未解锁' });
    expect(locked).toBeDisabled();

    // 当前章节后的第二个章节处于锁定状态，翻页按钮退化为「已经是最后一章」并禁用。
    const nextButton = screen.getByRole('button', { name: '已经是最后一章' });
    expect(nextButton).toBeDisabled();
    expect(screen.getByRole('button', { name: '已经是第一章' })).toBeDisabled();
  });

  it('上一章 / 下一章在可读章节之间移动选中章节', () => {
    renderArchive({ storyWeavingSystem: buildNavigableStorySystem() });
    fireEvent.click(screen.getByRole('button', { name: /^剧情档案，/ }));

    const index = screen.getByLabelText('剧情卷宗与章节目录');
    expect(screen.getByText('起航章正文')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一章：抵达章' }));
    expect(screen.getByText('抵达章正文')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上一章：起航章' }));
    expect(screen.getByText('起航章正文')).toBeInTheDocument();
    expect(within(index).getByRole('button', { name: '阅读第 1 章：起航章' })).toHaveAttribute('data-active', 'true');
  });
});

describe('重载内置档案', () => {
  const nextSystem: 智库系统 = 归一化智库系统({ 条目: [
    创建智库条目({ 标题: '新目录条目', 分类: 'term', 原文: '新目录正文' }),
  ] });

  it('网络源成功时调用回调并展示 done 状态', async () => {
    const onRefreshBundled = vi.fn((): Promise<BundledZhikuCatalogLoadResult> => (
      Promise.resolve({ system: nextSystem, source: 'network' })
    ));
    renderArchive({ onRefreshBundled });

    fireEvent.click(getRefreshButton());
    await waitForRefreshStatus('done');
    expect(onRefreshBundled).toHaveBeenCalledTimes(1);
    expect(defaultProps.onZhikuSystemChange).toHaveBeenCalledWith(nextSystem);
  });

  it('cache 源显示 recovered 状态', async () => {
    const onRefreshBundled = vi.fn((): Promise<BundledZhikuCatalogLoadResult> => (
      Promise.resolve({ system: nextSystem, source: 'cache' })
    ));
    renderArchive({ onRefreshBundled });

    fireEvent.click(getRefreshButton());
    await waitForRefreshStatus('recovered');
  });

  it('重载失败显示 error 并保留当前档案正文', async () => {
    const onRefreshBundled = vi.fn((): Promise<BundledZhikuCatalogLoadResult> => (
      Promise.reject(new Error('重载失败'))
    ));
    renderArchive({ onRefreshBundled });

    fireEvent.click(screen.getByRole('button', { name: /^人物，/ }));
    fireEvent.click(screen.getByRole('button', { name: '阅读星' }));

    fireEvent.click(getRefreshButton());
    await waitForRefreshStatus('error');
    expect(screen.getByText('星河旅人的档案正文内容')).toBeInTheDocument();
  });
});

describe('阅读字号', () => {
  const readOutput = (): string => document.querySelector('output')?.textContent ?? '';

  it('增大/减小字号更新展示值并写入 localStorage', () => {
    renderArchive();
    expect(readOutput()).toBe('17');

    fireEvent.click(screen.getByRole('button', { name: '增大档案字号' }));
    expect(readOutput()).toBe('18');
    expect(getStorage().getItem(FONT_SIZE_STORAGE_KEY)).toBe('18');

    fireEvent.click(screen.getByRole('button', { name: '减小档案字号' }));
    expect(readOutput()).toBe('17');
    expect(getStorage().getItem(FONT_SIZE_STORAGE_KEY)).toBe('17');
  });
});

describe('键盘交互', () => {
  it('分类内按 Escape 回到大厅，大厅内按 Escape 关闭智库', () => {
    const onClose = vi.fn();
    renderArchive({ onClose });

    fireEvent.click(screen.getByRole('button', { name: /^人物，/ }));
    expect(screen.getByLabelText('人物列表')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText('人物列表')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
