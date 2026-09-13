import { describe, expect, it } from 'vitest';
import {
  匹配智库关键词,
  归一化智库系统,
  归一化智库注入内容,
  召回智库关键词匹配,
  选择智库关键词互斥结果,
  获取智库显式触发词,
  type 智库条目,
} from '@/models/zhiku';
import { buildZhikuEntryWithId as buildEntry } from '../helpers/zhikuFixture';

describe('获取智库显式触发词', () => {
  it('优先使用结构化触发关键词', () => {
    const entry = buildEntry('e1', {
      标题: '星核',
      分类: 'term',
      触发关键词: ['星核'],
      关键词: ['星神:毁灭'],
      原文: '基础资料。\n核心触发词：毁灭、火种。',
    });
    expect(获取智库显式触发词(entry)).toEqual(['星核']);
  });

  it('没有结构化触发词时回退到原文核心触发词', () => {
    const entry = buildEntry('e2', {
      标题: '毁灭',
      分类: 'term',
      原文: '背景介绍。\n核心触发词：毁灭、火种、荣光。\n结尾。',
    });
    const triggers = 获取智库显式触发词(entry);
    expect(triggers).toContain('毁灭');
    expect(triggers).toContain('火种');
    expect(triggers).toContain('荣光');
  });

  it('人物条目回退到角色标签值并忽略普通标签', () => {
    const entry = buildEntry('e3', {
      标题: '符玄',
      分类: 'character',
      关键词: ['角色:符玄', '所属:太卜司', '资料类型:主体人格'],
    });
    expect(获取智库显式触发词(entry)).toEqual(['符玄']);
  });

  it('非人物条目的回忆标签与普通关键词都进入触发词', () => {
    const entry = buildEntry('e4', {
      标题: '雅利洛',
      分类: 'location',
      关键词: ['地点:雅利洛-六', '地区:雅利洛', '普通标签'],
    });
    const triggers = 获取智库显式触发词(entry);
    expect(triggers).toContain('雅利洛-六');
    expect(triggers).toContain('雅利洛');
    expect(triggers).toContain('普通标签');
  });
});

describe('匹配智库关键词', () => {
  it('主关键词未命中返回 null', () => {
    const entry = buildEntry('e1', {
      标题: '星核',
      分类: 'term',
      触发关键词: ['星核'],
    });
    expect(匹配智库关键词(entry, '聊聊别的话题')).toBeNull();
  });

  it('辅助关键词默认 AND_ANY：命中其一即可保留', () => {
    const entry = buildEntry('e2', {
      标题: '星核',
      分类: 'term',
      触发关键词: ['星核'],
      辅助关键词: ['现界', '败者'],
    });
    const match = 匹配智库关键词(entry, '星核现界于雅利洛');
    expect(match?.entry.id).toBe('e2');
    expect(match?.主关键词命中).toContain('星核');
    expect(match?.辅助关键词命中).toContain('现界');

    // 默认 AND_ANY 下，没有任何辅助关键词命中则拒绝召回。
    expect(匹配智库关键词(entry, '只是提到星核这个词的说明')).toBeNull();
    expect(匹配智库关键词(entry, '星核 相关但也提到 败者 相关内容')).not.toBeNull();
  });

  it.each([
    ['AND_ALL：需要全部命中', 'AND_ALL' as const, ['现界', '败者'], '星核 现界 败者', '星核 现界'],
    ['NOT_ANY：排除词出现即拒绝', 'NOT_ANY' as const, ['残留'], '星核出现了', '星核 以及 残留 相关'],
    ['NOT_ALL：全部出现才拒绝，部分出现仍接受', 'NOT_ALL' as const, ['残留', '后患'], '星核 残留了相关记录', '星核 残留 后患 温床'],
  ])('辅助关键词 %s', (_name, logic, aux, acceptQuery, rejectQuery) => {
    const entry = buildEntry('e-op', {
      标题: '星核',
      分类: 'term',
      触发关键词: ['星核'],
      辅助关键词: aux,
      辅助关键词逻辑: logic,
    });
    expect(匹配智库关键词(entry, acceptQuery)).not.toBeNull();
    expect(匹配智库关键词(entry, rejectQuery)).toBeNull();
  });
});

describe('单字人物关键词的边界匹配', () => {
  const entry = buildEntry('d1', {
    标题: '巡猎星神',
    分类: 'character',
    关键词: ['角色:岚'],
  });

  it('单字出现于分隔符旁时命中', () => {
    expect(匹配智库关键词(entry, '，岚、去吧')).not.toBeNull();
    expect(匹配智库关键词(entry, '裁决：岚。')).not.toBeNull();
  });

  it('单字嵌在更长词内部时不算命中', () => {
    // 「岚」不能匹配「岚德」或「斯岚曼」内部。
    expect(匹配智库关键词(entry, '岚德就要醒了')).toBeNull();
    expect(匹配智库关键词(entry, '斯岚曼爆了')).toBeNull();
  });
});

describe('选择智库关键词互斥结果', () => {
  type 互斥行 = [id: string, title: string, keywords: string[]];
  it.each([
    ['同一互斥组的条目折叠为最具体匹配（更多主关键词命中）', '星核爆裂在拍卖会上出现', 'group_star', [
      ['w1', '星核档案', ['星核']],
      ['w2', '星核爆裂档案', ['星核', '爆裂']],
    ] as 互斥行[], 'w2'],
    ['同一互斥组折叠为更长的主关键词', '存护星神克里珀登场', 'group_path', [
      ['s1', '存护', ['存护']],
      ['s2', '存护星神', ['存护星神克里珀']],
    ] as 互斥行[], 's2'],
  ])('%s', (_name: string, query: string, groupId: string, rows: 互斥行[], expectedId: string) => {
    const entries = rows.map(([id, title, keywords]) => buildEntry(id, {
      标题: title,
      分类: 'term',
      触发关键词: keywords,
      互斥组ID: groupId,
    }));
    const match = (entry: 智库条目): NonNullable<ReturnType<typeof 匹配智库关键词>> => (
      匹配智库关键词(entry, query) as NonNullable<ReturnType<typeof 匹配智库关键词>>
    );

    const selected = 选择智库关键词互斥结果(entries.map(match));
    expect(selected).toHaveLength(1);
    expect(selected[0]?.entry.id).toBe(expectedId);
  });

  it('没有互斥组ID的条目全部保留', () => {
    // 固定 updatedAt：同分时比较器的更新时间兜底会因 build 跨毫秒而翻转顺序（既有偶发）。
    const a = { ...buildEntry('a1', {
      标题: '星核',
      分类: 'term',
      触发关键词: ['星核'],
    }), updatedAt: 1 };
    const b = { ...buildEntry('a2', {
      标题: '档案二',
      分类: 'term',
      触发关键词: ['星核'],
    }), updatedAt: 1 };
    const match = (entry: 智库条目): NonNullable<ReturnType<typeof 匹配智库关键词>> => (
      匹配智库关键词(entry, '星核相关内容') as NonNullable<ReturnType<typeof 匹配智库关键词>>
    );

    const selected = 选择智库关键词互斥结果([a, b].map(match));
    expect(selected.map((item) => item.entry.id)).toEqual(['a1', 'a2']);
  });

  it('召回入口同样执行互斥折叠', () => {
    const system = 归一化智库系统({
      条目: [
        buildEntry('r1', {
          标题: '基础形态',
          分类: 'term',
          触发关键词: ['星核'],
          互斥组ID: 'group_x',
        }),
        buildEntry('r2', {
          标题: '专属形态',
          分类: 'term',
          触发关键词: ['星核', '专属'],
          互斥组ID: 'group_x',
        }),
      ],
    });
    const recalls = 召回智库关键词匹配(system, '星核专属资料');
    expect(recalls).toHaveLength(1);
    expect(recalls[0]?.entry.id).toBe('r2');
  });
});

describe('归一化保留新字段与注入内容', () => {
  it('归一化智库系统保留治理、来源与关键词字段', () => {
    const entry = buildEntry('n1', {
      标题: '资料',
      分类: 'term',
      触发关键词: ['触发甲', '触发甲'],
      辅助关键词: ['辅助甲'],
      辅助关键词逻辑: 'NOT_ANY',
      互斥组ID: 'group_1',
      builtin: true,
    });
    const system = 归一化智库系统({
      目录版本: 'v3:x',
      目录修订: 42,
      条目: [{ ...entry, 治理分类: 'term', 资料所有者: 'builtin-json', 来源预设ID: 'zhiku_term_core', 来源文件: 'term-core.json', 来源序号: 3, 资料版本: 2, 辅助字段版本: 1 }],
    });

    expect(system.目录版本).toBe('v3:x');
    expect(system.目录修订).toBe(42);
    const kept = system.条目[0];
    expect(kept.治理分类).toBe('term');
    expect(kept.资料所有者).toBe('builtin-json');
    expect(kept.来源预设ID).toBe('zhiku_term_core');
    expect(kept.来源文件).toBe('term-core.json');
    expect(kept.来源序号).toBe(3);
    expect(kept.资料版本).toBe(2);
    expect(kept.辅助字段版本).toBe(1);
    expect(kept.触发关键词).toEqual(['触发甲']);
    expect(kept.辅助关键词).toEqual(['辅助甲']);
    expect(kept.辅助关键词逻辑).toBe('NOT_ANY');
    expect(kept.互斥组ID).toBe('group_1');
  });

  it('归一化智库注入内容返回人物与设定的标准结构', () => {
    expect(归一化智库注入内容({
      类型: 'character',
      核心身份与阵营: 'a',
      独立人格与行为: 'b',
      外貌锚点: 'c',
      说话方式: ' d ',
      台词语料: 'e',
      当前形态与能力边界: 'f',
      精简角色故事: 'g',
      演绎红线: 'h',
    }, 'character')).toEqual({
      类型: 'character',
      核心身份与阵营: 'a',
      独立人格与行为: 'b',
      外貌锚点: 'c',
      说话方式: 'd',
      台词语料: 'e',
      当前形态与能力边界: 'f',
      精简角色故事: 'g',
      演绎红线: 'h',
    });

    expect(归一化智库注入内容({
      类型: 'lore',
      核心定义: 'x',
      关键事实: 'y',
      叙事用途: 'z',
      演绎边界: 'w',
    }, 'term')).toEqual({
      类型: 'lore',
      核心定义: 'x',
      关键事实: 'y',
      叙事用途: 'z',
      演绎边界: 'w',
    });
  });

  it('错误类型或剧情分类返回 undefined', () => {
    expect(归一化智库注入内容({ 类型: 'lore' }, 'character')).toBeUndefined();
    expect(归一化智库注入内容({ 类型: 'character' }, 'term')).toBeUndefined();
    expect(归一化智库注入内容({ 类型: 'lore', 核心定义: 'x' }, 'story')).toBeUndefined();
    expect(归一化智库注入内容(null, 'term')).toBeUndefined();
  });
});
