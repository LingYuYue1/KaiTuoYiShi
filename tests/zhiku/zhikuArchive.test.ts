import { describe, expect, it } from 'vitest';
import { 归一化剧情编织分段, 归一化剧情编织系列, 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织分段, 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库条目 } from '@/models/zhiku';
import { 创建空智库系统, 创建智库条目, 归一化智库系统 } from '@/models/zhiku';
import {
  buildStoryArchiveVolumes,
  buildZhikuArchiveItems,
  buildZhikuArchiveView,
  getZhikuArchiveEntryKeywords,
  isEmptyZhikuArchiveView,
  isZhikuArchiveEntryVisible,
  resolveZhikuArchiveCategory,
} from '@/services/zhikuArchive';

const buildEntry = (input: Parameters<typeof 创建智库条目>[0]): 智库条目 => (
  创建智库条目({ 原文: '可读正文', ...input })
);

const buildSegment = (
  input: Partial<剧情编织分段> & { id: string },
): 剧情编织分段 => 归一化剧情编织分段(input, 1);

function buildStorySystem(input: {
  章节列表?: Array<Partial<{ id: string; 序号: number; 标题: string; 内容: string }>>;
  分段列表?: Array<Partial<剧情编织分段> & { id: string }>;
}): 剧情编织系统 {
  const series = 归一化剧情编织系列({
    id: 'series_1',
    标题: '主线卷',
    作品名: '测试作品',
    来源类型: 'canon',
    ...(input.章节列表 ? { 章节列表: input.章节列表 as never } : {}),
    ...(input.分段列表 ? { 分段列表: input.分段列表 as never } : {}),
  });
  return 归一化剧情编织系统({ 当前系列ID: 'series_1', 系列列表: [series] });
}

describe('zhikuArchive 档案可见性', () => {
  it('未解锁或锁定的条目不进入可翻阅档案', () => {
    const hidden = buildEntry({ 标题: '未解锁资料', 分类: 'term', 解锁状态: '未解锁' });
    const locked = buildEntry({ 标题: '锁定资料', 分类: 'faction', 解锁状态: '锁定' });
    const visible = buildEntry({ 标题: '公开资料', 分类: 'term' });

    expect(isZhikuArchiveEntryVisible(hidden)).toBe(false);
    expect(isZhikuArchiveEntryVisible(locked)).toBe(false);
    expect(isZhikuArchiveEntryVisible(visible)).toBe(true);

    const items = buildZhikuArchiveItems(归一化智库系统({ 条目: [hidden, locked, visible] }));
    const titles = items.term.map((item) => item.title);
    expect(titles).toContain('公开资料');
    expect(titles).not.toContain('未解锁资料');
    expect(titles).not.toContain('锁定资料');
  });

  it('运行时解锁状态覆盖解锁状态字段', () => {
    const overwritten = buildEntry({
      标题: '剧情解锁资料',
      分类: 'term',
      解锁状态: '未解锁',
      运行时解锁状态: '默认可用',
    });
    const reclocked = buildEntry({
      标题: '临时锁定资料',
      分类: 'term',
      解锁状态: '默认可用',
      运行时解锁状态: '锁定',
    });

    expect(isZhikuArchiveEntryVisible(overwritten)).toBe(true);
    expect(isZhikuArchiveEntryVisible(reclocked)).toBe(false);

    const items = buildZhikuArchiveItems(归一化智库系统({ 条目: [overwritten, reclocked] }));
    expect(items.term.map((item) => item.title)).toContain('剧情解锁资料');
    expect(items.term.map((item) => item.title)).not.toContain('临时锁定资料');
  });
});

describe('resolveZhikuArchiveCategory', () => {
  it('有效分类映射到对应档案分类', () => {
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'character' }))).toBe('character');
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'location' }))).toBe('location');
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'faction' }))).toBe('faction');
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'event' }))).toBe('event');
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'term' }))).toBe('term');
  });

  it('剧情分类与已退役分类返回 null', () => {
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'story' }))).toBeNull();
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'npc' }))).toBeNull();
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'item' }))).toBeNull();
    expect(resolveZhikuArchiveCategory(buildEntry({ 标题: 'x', 分类: 'system' }))).toBeNull();
  });
});

describe('人物条目归组', () => {
  it('同一关联角色ID多个形态聚合为一条带变形列表的档案', () => {
    const base = 创建智库条目({
      标题: '三月七｜常态',
      分类: 'character',
      关联角色ID: '三月七',
      关联形态ID: '常态',
      原文: '常态正文文本',
    });
    const alternate = 创建智库条目({
      标题: '三月七｜饮月',
      分类: 'character',
      关联角色ID: '三月七',
      关联形态ID: '饮月',
      原文: '饮月正文文本',
    });

    const [item] = buildZhikuArchiveItems(归一化智库系统({ 条目: [alternate, base] })).character;
    expect(item).toBeDefined();
    expect(item.title).toBe('三月七');
    expect(item.variants).toHaveLength(2);
    expect(item.variants?.map((variant) => variant.label)).toEqual(['常态', '饮月']);
    expect(item.body).toBe('常态正文文本');
    expect(item.variants?.some((variant) => variant.body === '饮月正文文本')).toBe(true);
  });

  it('单一形态人物没有变形列表', () => {
    const single = 创建智库条目({
      标题: '独行角色',
      分类: 'character',
      关联角色ID: '独行',
      原文: '独行正文文本',
    });
    const [item] = buildZhikuArchiveItems(归一化智库系统({ 条目: [single] })).character;
    // 人物档案标题优先取关联角色ID。
    expect(item.title).toBe('独行');
    expect(item.variants).toBeUndefined();
  });
});

describe('资料正文与关键词兜底', () => {
  it('原文为空时正文回落到摘要', () => {
    const [item] = buildZhikuArchiveItems(归一化智库系统({
      条目: [buildEntry({ 标题: '摘要资料', 分类: 'term', 摘要: '这是摘要兜底文本', 原文: '' })],
    })).term;
    expect(item.body).toBe('这是摘要兜底文本');
  });

  it('关键词合并原文中的核心触发词', () => {
    const entry = buildEntry({
      标题: '触发词资料',
      分类: 'term',
      关键词: ['列车'],
      原文: '基础资料。\n核心触发词：毁灭、火种、列车。',
    });
    expect(getZhikuArchiveEntryKeywords(entry)).toEqual(['列车', '毁灭', '火种']);
  });
});

describe('剧情卷宗状态判定', () => {
  it('章节状态：空正文锁定、当前分段current、已归档分段read、无分段unread', () => {
    const system = buildStorySystem({
      章节列表: [
        { id: 'ch_1', 序号: 1, 标题: '第一章', 内容: '第一章正文' },
        { id: 'ch_2', 序号: 2, 标题: '第二章', 内容: '第二章正文' },
        { id: 'ch_3', 序号: 3, 标题: '第三章', 内容: '第三章正文' },
        { id: 'ch_4', 序号: 4, 标题: '第四章', 内容: '' },
      ],
      分段列表: [
        buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' }),
        buildSegment({ id: 'seg_2', 组号: 2, 起始章序号: 2, 结束章序号: 2, 运行状态: '已经历' }),
        buildSegment({ id: 'seg_3', 组号: 3, 起始章序号: 3, 结束章序号: 3, 运行状态: '已跳过' }),
        buildSegment({ id: 'seg_4', 组号: 4, 起始章序号: 4, 结束章序号: 4, 运行状态: '已偏离' }),
      ],
    });

    const [volume] = buildStoryArchiveVolumes(system);
    const statusById = new Map(volume.chapters.map((chapter) => [chapter.id, chapter.status]));
    expect(statusById.get('ch_1')).toBe('current');
    expect(statusById.get('ch_2')).toBe('read');
    expect(statusById.get('ch_3')).toBe('read');
    expect(statusById.get('ch_4')).toBe('locked');

    const outside = buildStorySystem({
      章节列表: [{ id: 'ch_9', 序号: 9, 标题: '范围外章节', 内容: '有正文的范围外章节' }],
      分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
    });
    const [outsideVolume] = buildStoryArchiveVolumes(outside);
    expect(outsideVolume.chapters.find((chapter) => chapter.id === 'ch_9')?.status).toBe('unread');
  });

  it('卷宗编号从卷宗 01 递增', () => {
    const system = {
      系列列表: [
        buildStorySystem({
          章节列表: [{ id: 'ch_1', 序号: 1, 标题: '第一章', 内容: '有正文' }],
          分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
        }).系列列表[0],
        buildStorySystem({
          章节列表: [{ id: 'ch_1', 序号: 1, 标题: '第一章', 内容: '有正文' }],
          分段列表: [buildSegment({ id: 'seg_2', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
        }).系列列表[0],
      ],
    };
    const volumes = buildStoryArchiveVolumes(归一化剧情编织系统(system));
    expect(volumes.map((volume) => volume.number)).toEqual(['卷宗 01', '卷宗 02']);
  });

  it('没有章节的系列是锁定卷宗', () => {
    const [volume] = buildStoryArchiveVolumes(buildStorySystem({ 章节列表: [], 分段列表: [] }));
    expect(volume.title).toBe('测试作品');
    expect(volume.locked).toBe(true);
    expect(volume.chapters).toHaveLength(0);
  });

  it('当前进度指向缺失分段、章节序号超出分段范围都不会抛错', () => {
    const system = buildStorySystem({
      章节列表: [
        { id: 'ch_1', 序号: 1, 标题: '第一章', 内容: '第一章正文' },
        { id: 'ch_2', 序号: 2, 标题: '第二章', 内容: '第二章正文' },
      ],
      分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
    });
    const dangling = {
      ...system,
      当前进度: {
        ...system.当前进度,
        当前分段ID: 'missing-segment-id',
        当前分段组号: 999,
      },
    };

    expect(() => buildStoryArchiveVolumes(dangling as 剧情编织系统)).not.toThrow();
    const [volume] = buildStoryArchiveVolumes(dangling as 剧情编织系统);
    const statusById = new Map(volume.chapters.map((chapter) => [chapter.id, chapter.status]));
    expect(statusById.get('ch_1')).toBe('current');
    expect(statusById.get('ch_2')).toBe('unread');
  });
});

describe('自制剧情卷宗', () => {
  it('智库 story 条目按系列聚合并追加在剧情编织卷宗之后', () => {
    const zhikuSystem = 归一化智库系统({
      条目: [
        buildEntry({ 标题: '自制第二幕', 分类: 'story', 系列ID: 'custom_s1', 系列标题: '我的自制卷', 章节序号: 2, 原文: '自制第二幕正文' }),
        buildEntry({ 标题: '自制第一幕', 分类: 'story', 系列ID: 'custom_s1', 系列标题: '我的自制卷', 章节序号: 1, 原文: '自制第一幕正文' }),
        buildEntry({ 标题: '空章节', 分类: 'story', 系列ID: 'custom_s2', 系列标题: '缺文卷', 章节序号: 1, 原文: '', 摘要: '' }),
      ],
    });
    const storySystem = buildStorySystem({
      章节列表: [{ id: 'ch_1', 序号: 1, 标题: '主线章节', 内容: '主线正文' }],
      分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
    });

    const volumes = buildStoryArchiveVolumes(storySystem, zhikuSystem);
    expect(volumes.map((volume) => volume.number)).toEqual(['卷宗 01', '卷宗 02', '卷宗 03']);
    expect(volumes[0].title).toBe('测试作品');
    expect(volumes[1].title).toBe('我的自制卷');
    expect(volumes[2].title).toBe('缺文卷');

    const customChapters = volumes[1].chapters;
    expect(customChapters.map((chapter) => [chapter.title, chapter.status])).toEqual([
      ['自制第一幕', 'unread'],
      ['自制第二幕', 'unread'],
    ]);
    expect(volumes[2].chapters[0].status).toBe('locked');
  });
});

describe('buildZhikuArchiveView 汇总', () => {
  it('统计各分类条目数、条目总数与章节数', () => {
    const zhikuSystem = 归一化智库系统({
      条目: [
        创建智库条目({ 标题: '星', 分类: 'character', 关联角色ID: '星', 原文: '角色正文' }),
        buildEntry({ 标题: '琥珀纪', 分类: 'term', 原文: '术语正文' }),
        buildEntry({ 标题: '自制章', 分类: 'story', 系列ID: 'custom_s1', 系列标题: '自制卷', 章节序号: 1, 原文: '自制正文' }),
      ],
    });
    const storySystem = buildStorySystem({
      章节列表: [{ id: 'ch_1', 序号: 1, 标题: '主线一', 内容: '正文' }],
      分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
    });

    const view = buildZhikuArchiveView(zhikuSystem, storySystem);
    const countById = new Map(view.categories.map((category) => [category.id, category.count]));
    expect(countById.get('character')).toBe(1);
    expect(countById.get('term')).toBe(1);
    expect(countById.get('story')).toBe(2);
    expect(view.itemCount).toBe(2);
    expect(view.chapterCount).toBe(2);
    expect(isEmptyZhikuArchiveView(view)).toBe(false);
  });

  it('空智库系统与空剧情系统给出空档案判定', () => {
    const emptyView = buildZhikuArchiveView(创建空智库系统(), 归一化剧情编织系统(null));
    expect(emptyView.itemCount).toBe(0);
    expect(emptyView.chapterCount).toBe(0);
    expect(isEmptyZhikuArchiveView(emptyView)).toBe(true);

    const onlyZhiku = buildZhikuArchiveView(
      归一化智库系统({ 条目: [buildEntry({ 标题: '资料', 分类: 'term' })] }),
      归一化剧情编织系统(null),
    );
    expect(isEmptyZhikuArchiveView(onlyZhiku)).toBe(false);

    const onlyStory = buildZhikuArchiveView(
      创建空智库系统(),
      buildStorySystem({
        章节列表: [{ id: 'ch_1', 序号: 1, 标题: '第一章', 内容: '正文' }],
        分段列表: [buildSegment({ id: 'seg_1', 组号: 1, 起始章序号: 1, 结束章序号: 1, 运行状态: '当前' })],
      }),
    );
    expect(isEmptyZhikuArchiveView(onlyStory)).toBe(false);
  });
});
