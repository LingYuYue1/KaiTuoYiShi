import { describe, expect, it } from 'vitest';
import { 智库条目注入内容完整 } from '@/models/zhiku';
import { retrieveZhikuContext, renderZhikuEntryStaticInjection, buildZhikuEntryInjectionPreview } from '@/services/zhikuRetrieval';
import { buildZhikuEntryWithId as buildEntry } from '../helpers/zhikuFixture';

describe('renderZhikuEntryStaticInjection', () => {
  const loreEntry = () => buildEntry('lore_1', {
    标题: '星核',
    分类: 'term',
    注入内容: {
      类型: 'lore',
      核心定义: '星核是行星孕育的种子。',
      关键事实: '星核足以毁灭文明。',
      叙事用途: '用作灾难伏笔。',
      演绎边界: '不得让角色提前知晓。',
    },
  });

  const characterEntry = () => buildEntry('char_1', {
    标题: '三月七',
    分类: 'character',
    注入内容: {
      类型: 'character',
      核心身份与阵营: '星穹列车成员。',
      独立人格与行为: '活泼灵动。',
      外貌锚点: '粉发。',
      说话方式: '轻快俏皮。',
      台词语料: '「准备好相机了吗？」',
      当前形态与能力边界: '冰系巡猎。',
      精简角色故事: '被列车救助后同行。',
      演绎红线: '不轻浮。',
    },
  });

  it('设定条目渲染结构化字段与标题', () => {
    const render = renderZhikuEntryStaticInjection(loreEntry());
    expect(render).toContain('【术语：星核】');
    expect(render).toContain('核心定义：星核是行星孕育的种子。');
    expect(render).toContain('关键事实：星核足以毁灭文明。');
    expect(render).toContain('叙事用途：用作灾难伏笔。');
    expect(render).toContain('演绎边界：不得让角色提前知晓。');
  });

  it('人物条目渲染人物标题与八项字段', () => {
    const render = renderZhikuEntryStaticInjection(characterEntry());
    expect(render).toContain('【人物：三月七】');
    expect(render).toContain('核心身份与阵营：星穹列车成员。');
    expect(render).toContain('台词语料：');
    expect(render).toContain('演绎红线：不轻浮。');
  });

  it('注入内容不完整时返回空字符串', () => {
    const broken = buildEntry('lore_broken', {
      标题: '残缺条目',
      分类: 'term',
      注入内容: {
        类型: 'lore',
        核心定义: '有核心定义。',
        关键事实: '有关键事实。',
        叙事用途: '有叙事用途。',
        演绎边界: '',
      },
    });
    expect(智库条目注入内容完整(broken)).toBe(false);
    expect(renderZhikuEntryStaticInjection(broken)).toBe('');
  });
});

describe('buildZhikuEntryInjectionPreview', () => {
  it('结构完整时返回正式静态注入', () => {
    const entry = buildEntry('lore_2', {
      标题: '雅利洛-六',
      分类: 'location',
      注入内容: {
        类型: 'lore',
        核心定义: '冰封的殖民星。',
        关键事实: '裂界正在侵蚀地表。',
        叙事用途: '作主舞台。',
        演绎边界: '不写战后国家全貌。',
      },
    });
    expect(buildZhikuEntryInjectionPreview(entry)).toBe(renderZhikuEntryStaticInjection(entry));
  });

  it('结构不完整时回退到旧版预览且非空', () => {
    const entry = buildEntry('lore_3', {
      标题: '残缺设定',
      分类: 'term',
      摘要: '旧版摘要兜底。',
      注入内容: {
        类型: 'lore',
        核心定义: '只有一項。',
        关键事实: '',
        叙事用途: '',
        演绎边界: '',
      },
    });
    const preview = buildZhikuEntryInjectionPreview(entry);
    expect(preview).not.toBe('');
    expect(preview).not.toBe(renderZhikuEntryStaticInjection(entry));
    expect(preview).toContain('残缺设定');
  });
});

describe('retrieveZhikuContext 主剧情门禁与关键词召回', () => {
  const loreTemplate = {
    类型: 'lore' as const,
    核心定义: '星核孕育的不详种子。',
    关键事实: '星核足以毁灭文明。',
    叙事用途: '用作灾难伏笔。',
    演绎边界: '不得让角色提前知晓。',
  };

  it('注入内容不完整的条目即使标题与关键词命中也不进入召回结果', () => {
    const blocked = buildEntry('blocked', {
      标题: '星核残缺档案',
      分类: 'term',
      触发关键词: ['星核'],
      原文: '星球内孕育着可怕的星核。',
      注入内容: { ...loreTemplate, 演绎边界: '' },
    });
    const complete = buildEntry('complete', {
      标题: '星核完整档案',
      分类: 'term',
      触发关键词: ['星核'],
      原文: '星球内孕育着完整的星核资料。',
      注入内容: loreTemplate,
    });

    const result = retrieveZhikuContext(
      { 条目: [blocked, complete] },
      '这颗 星核 的来历',
      4,
    );

    expect(result.entries.some((entry) => entry.id === 'blocked')).toBe(false);
    expect(result.entries.some((entry) => entry.id === 'complete')).toBe(true);
  });

  it('触发关键词命中触发召回', () => {
    const summoned = buildEntry('summon', {
      标题: '绝灭大君归寂',
      分类: 'term',
      触发关键词: ['绝灭大君'],
      原文: '绝灭大君归寂的档案。',
      注入内容: loreTemplate,
    });
    const other = buildEntry('other', {
      标题: '不相干条目',
      分类: 'term',
      触发关键词: ['别的词'],
      原文: '另一份资料。',
      注入内容: loreTemplate,
    });

    const result = retrieveZhikuContext({ 条目: [summoned, other] }, '绝灭大君 面临', 4);
    expect(result.entries.some((entry) => entry.id === 'summon')).toBe(true);
  });

  it('辅助关键词 NOT_ANY 命中排除词时条目不进入召回', () => {
    const filtered = buildEntry('notany', {
      标题: '被排除挡板资料的标题',
      分类: 'term',
      触发关键词: ['星核'],
      辅助关键词: ['剧透'],
      辅助关键词逻辑: 'NOT_ANY',
      原文: '被关键词逻辑挡下的星核资料。',
      注入内容: loreTemplate,
    });
    // 同场放一条强命中资料，避免语义搜索的弱相关兜底通道把 NOT_ANY 条目捞回来。
    const companion = buildEntry('companion', {
      标题: '星核完整档案',
      分类: 'term',
      关键词: ['星核'],
      原文: '正常的星核资料。',
      注入内容: loreTemplate,
    });

    // 排除词在场。
    const excluded = retrieveZhikuContext({ 条目: [filtered, companion] }, '星核 剧透', 4);
    expect(excluded.entries.some((entry) => entry.id === 'notany')).toBe(false);
    expect(excluded.strongEntries?.some((entry) => entry.id === 'notany')).toBe(false);
    expect(excluded.weakEntries?.some((entry) => entry.id === 'notany')).toBe(false);

    // 排除词不在场。
    const included = retrieveZhikuContext({ 条目: [filtered] }, '星核 出现了', 4);
    expect(included.entries.some((entry) => entry.id === 'notany')).toBe(true);
  });
});
