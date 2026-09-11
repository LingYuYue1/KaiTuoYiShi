import { describe, expect, it } from 'vitest';
import { matchCanonical } from '../../data/canonicalCharacters';
import { ZHIKU_CANONICAL_CHARACTER_ALIASES } from '../../data/zhikuCanonicalCharacters';
import type { CanonicalCharacterDef } from '../../data/canonicalCharacters';

const mustResolve = (name: string): CanonicalCharacterDef => {
  const result = matchCanonical(name);
  if (!result) throw new Error(`${name} 应能解析到原著角色，实际为 null`);
  return result;
};

describe('zhiku canonical roster', () => {
  it('new-cast names and aliases resolve to their canonical character', () => {
    const cases: Record<string, string> = {
      阿格莱雅: '阿格莱雅',
      'Aglaea': '阿格莱雅',
      '金织·阿格莱雅': '阿格莱雅',
      白厄: '白厄',
      卡厄斯兰那: '白厄',
      黑天鹅: '黑天鹅',
      'Black Swan': '黑天鹅',
      银枝: '银枝',
      Argenti: '银枝',
      黄泉: '黄泉',
      Acheron: '黄泉',
      飞霄: '飞霄',
      云璃: '云璃',
      貊泽: '貊泽',
      爻光: '爻光',
      火花: '火花',
      绯英: '绯英',
      不死途: '不死途',
      虚照: '虚照',
      波提欧: '波提欧',
      乱破: '乱破',
      Archer: 'Archer',
      卫宫士郎: 'Archer',
      Saber: 'Saber',
      '阿尔托莉雅·潘德拉贡': 'Saber',
      远坂凛: '远坂凛',
      吉尔伽美什: '吉尔伽美什',
      英雄王: '吉尔伽美什',
    };
    for (const [alias, canonical] of Object.entries(cases)) {
      const result = mustResolve(alias);
      expect(result.name, `alias "${alias}" should resolve to "${canonical}"`).toBe(canonical);
    }
  });

  it('form names resolve into the base character roster', () => {
    // 三月七·巡猎 与 丹恒·饮月 在 CANONICAL_CHARACTERS 中有独立完整档案，保持其自身条目。
    for (const form of ['三月七·巡猎', '丹恒·饮月']) {
      const result = mustResolve(form);
      expect(result.name.startsWith(form.split('·')[0])).toBe(true);
    }
    // 其余形态名走智库兜底，收敛到基础角色。
    expect(mustResolve('长夜月').name).toBe('三月七');
    expect(mustResolve('丹恒·腾荒').name).toBe('丹恒');
    expect(mustResolve('姬子•启行').name).toBe('姬子');
    const welt = mustResolve('瓦尔特·杨');
    expect(['瓦尔特', '瓦尔特·杨']).toContain(welt.name);
  });

  it('matching tolerates surrounding whitespace', () => {
    expect(matchCanonical('  阿格莱雅  ')).toEqual(matchCanonical('阿格莱雅'));
    expect(mustResolve(' Aglaea ').name).toBe('阿格莱雅');
  });

  it('unknown names return null', () => {
    expect(matchCanonical('不存在的角色名-测试')).toBeNull();
  });

  it('high-frequency metadata is preserved', () => {
    const result = mustResolve('三月七');
    expect(result.name).toBe('三月七');
    // 三月七 在 CANONICAL_CHARACTERS 有完整 metadata，应优先返回富档案而非智库兜底。
    expect(result.appearance).toBeDefined();
    expect(result.personality).toBeDefined();
    // 兜底对象仍可在智库别名登记表中作为键被查到。
    expect(ZHIKU_CANONICAL_CHARACTER_ALIASES['三月七']).toBeDefined();
  });
});
