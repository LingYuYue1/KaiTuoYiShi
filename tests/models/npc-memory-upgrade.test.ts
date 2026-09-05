import { describe, expect, it } from 'vitest';
import {
  生成NPC记忆ID,
  升级NPC总结记忆条目Schema,
  升级同行记忆条目Schema,
  归一化NPC记录列表,
} from '@/models/npc';

describe('同行记忆升级', () => {
  it('字符串升级为结构化：来源记变量、回合记 0', () => {
    const entry = 升级同行记忆条目Schema.parse('  初见于渡口  ');
    expect(entry).toMatchObject({
      摘要: '初见于渡口',
      来源: '变量',
      回合: 0,
    });
  });

  it('丢弃无效形态，并清洗 legacy 对象字段', () => {
    expect(升级同行记忆条目Schema.safeParse('   ').success).toBe(false);
    expect(升级同行记忆条目Schema.safeParse(null).success).toBe(false);
    expect(升级同行记忆条目Schema.safeParse(['x']).success).toBe(false);
    expect(
      升级同行记忆条目Schema.parse({ 摘要: '  同行一段  ', 来源: '乱写', 关联NPCID: ['n1', '', 42] }),
    ).toMatchObject({
      摘要: '同行一段',
      回合: 0,
      来源: undefined,
      关联NPCID: ['n1'],
    });
    expect(升级同行记忆条目Schema.parse({ 原文: '长文回忆' })).toMatchObject({ 摘要: '长文回忆' });
  });

  it('内容键派生稳定 id，且完整摘要参与身份', () => {
    const a = 升级同行记忆条目Schema.parse({ 摘要: '一段确定性的同行记忆' });
    const b = 升级同行记忆条目Schema.parse({ 摘要: '一段确定性的同行记忆' });
    expect(a.id).toBe(b.id);
    const prefix = '同一段很长的同行记忆前缀'.repeat(4);
    expect(生成NPC记忆ID('mem', 3, `${prefix}甲`)).not.toBe(
      生成NPC记忆ID('mem', 3, `${prefix}乙`),
    );
  });

  it('归一化 legacy 输入时按内容去重并修复重复身份', () => {
    const [record] = 归一化NPC记录列表([{
      姓名: '阿绫',
      阶位: 'companion',
      同行记忆: [
        '旧存档里的一句话',
        { 摘要: '旧存档里的一句话' },
        { id: 'm2', 回合: 5, 摘要: '新的同行记忆', 来源: '正文' },
      ],
    }]);
    expect(record.同行记忆).toHaveLength(2);
    expect(record.同行记忆?.find((item) => item.id === 'm2')).toMatchObject({ 来源: '正文' });
    const [collisionRecord] = 归一化NPC记录列表([{
      姓名: '阿绫',
      阶位: 'companion',
      同行记忆: [
        { id: 'legacy', 回合: 1, 摘要: '第一件事' },
        { id: 'legacy', 回合: 2, 摘要: '第二件事' },
        { id: 'other', 回合: 1, 摘要: '第一件事' },
      ],
    }]);
    expect(collisionRecord.同行记忆).toHaveLength(2);
    expect(collisionRecord.同行记忆?.map((item) => item.id)).toEqual(['legacy', expect.any(String)]);
  });
});

describe('总结记忆升级', () => {
  it('字符串升级、别名键兼容、脏数据丢弃', () => {
    expect(升级NPC总结记忆条目Schema.parse('  长期相伴  ')).toMatchObject({ 摘要: '长期相伴' });
    expect(升级NPC总结记忆条目Schema.safeParse('   ').success).toBe(false);
    expect(
      升级NPC总结记忆条目Schema.parse({ summary: '旧字段', count: 'x', facts: ['f1'] }),
    ).toMatchObject({ 摘要: '旧字段', 保留事实: ['f1'] });
    expect(升级NPC总结记忆条目Schema.safeParse({}).success).toBe(false);
  });
});
