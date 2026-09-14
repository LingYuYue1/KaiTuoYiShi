import { describe, expect, it } from 'vitest';
import {
  未知区域ID,
  区域显示名称,
  推断区域ID,
  推断系列区域ID,
  校正世界区域,
  源文命中区域,
  评估剧情区域连续性,
  重绑系列区域,
} from '@/models/region';
import { 归一化剧情编织系列, 归一化剧情编织系统 } from '@/models/storyWeaving';
import { 创建空世界状态 } from '@/models/world';

type 系列区域输入 = NonNullable<Parameters<typeof 推断系列区域ID>[0]>;

const series = (input: Partial<系列区域输入>): 系列区域输入 => ({
  标题: '',
  作品名: '',
  涉及地点索引: [],
  涉及派系索引: [],
  ...input,
});

describe('区域推断', () => {
  it('单命中返回结构化区域，多命中与空文本保守返回 unknown', () => {
    expect(推断区域ID('仙舟罗浮 · 鳞渊境')).toBe('xianzhou_luofu');
    expect(推断区域ID(['二相乐园', '乐园'])).toBe('planarcadia');
    expect(推断区域ID('贝洛伯格与仙舟罗浮')).toBe(未知区域ID);
    expect(推断区域ID('')).toBe(未知区域ID);
  });

  it('系列区域优先显式值并兼容中文名', () => {
    expect(推断系列区域ID(series({ 区域ID: 'penacony' }))).toBe('penacony');
    expect(推断系列区域ID(series({ 区域ID: '贝洛伯格' }))).toBe('jarilo_vi');
    // 别名表必须落在规范区域 ID 上（二相乐园 = planarcadia），否则会与 世界.开局档案.地区ID 永不一致。
    expect(推断系列区域ID(series({ 标题: '二相乐园其一-欢迎来到乐园' }))).toBe('planarcadia');
    expect(区域显示名称(推断系列区域ID(series({ 标题: '二相乐园其一' })))).toBe('二相乐园');
    expect(推断系列区域ID(series({ 标题: '空间站事件', 涉及地点索引: ['主控舱段'] }))).toBe('herta_space_station');
    expect(推断系列区域ID(series({ 标题: '仙舟与贝洛伯格联动', 涉及地点索引: ['贝洛伯格', '罗浮'] }))).toBe(未知区域ID);
    expect(推断系列区域ID(undefined)).toBe(未知区域ID);
  });

  it('源文命中区域按别名表软匹配', () => {
    expect(源文命中区域('我们抵达了克里珀堡', 'jarilo_vi')).toBe(true);
    expect(源文命中区域('我们抵达了克里珀堡', 'xianzhou_luofu')).toBe(false);
    expect(源文命中区域('克里珀堡', 'not_a_region')).toBe(false);
  });
});

describe('剧情区域连续性', () => {
  it('当前区域与系列区域不一致时 hold 并给出理由', () => {
    const decision = 评估剧情区域连续性({ currentRegionId: 'jarilo_vi', seriesRegionId: 'herta_space_station' });
    expect(decision.hold).toBe(true);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it('一致或任一侧无法确认时 allow；当前区域未知时回退开局档案地区再比对', () => {
    expect(评估剧情区域连续性({ currentRegionId: 'jarilo_vi', seriesRegionId: 'jarilo_vi' }).hold).toBe(false);
    expect(评估剧情区域连续性({ currentRegionId: 未知区域ID, openingRegionId: 未知区域ID, seriesRegionId: 'jarilo_vi' }).hold).toBe(false);
    expect(评估剧情区域连续性({ currentRegionId: 未知区域ID, openingRegionId: 'penacony', seriesRegionId: 'penacony' }).hold).toBe(false);
    expect(评估剧情区域连续性({ currentRegionId: 未知区域ID, openingRegionId: 'jarilo_vi', seriesRegionId: 'penacony' }).hold).toBe(true);
  });

  it('当前区域缺省时从当前地点推断', () => {
    expect(评估剧情区域连续性({ currentLocation: '贝洛伯格 · 下层区', seriesRegionId: 'herta_space_station' }).hold).toBe(true);
    expect(评估剧情区域连续性({ currentLocation: '贝洛伯格 · 下层区', seriesRegionId: 'jarilo_vi' }).hold).toBe(false);
  });
});

describe('连续性确认动作', () => {
  it('确认转场只重绑目标系列且不改动入参', () => {
    const system = 归一化剧情编织系统({
      当前系列ID: 'a',
      系列列表: [归一化剧情编织系列({ id: 'a', 标题: '甲' }), 归一化剧情编织系列({ id: 'b', 标题: '乙' })],
    });
    const rebound = 重绑系列区域(system, 'a', 'jarilo_vi');
    expect(rebound.系列列表.find((item) => item.id === 'a')?.区域ID).toBe('jarilo_vi');
    expect(rebound.系列列表.find((item) => item.id === 'b')?.区域ID).toBeUndefined();
    expect(system.系列列表.find((item) => item.id === 'a')?.区域ID).toBeUndefined();
  });

  it('确认转场忽略 unknown，保持轨道回写世界区域', () => {
    const system = 归一化剧情编织系统({ 当前系列ID: 'a', 系列列表: [归一化剧情编织系列({ id: 'a', 标题: '甲' })] });
    expect(重绑系列区域(system, 'a', 未知区域ID)).toBe(system);

    const world = 创建空世界状态();
    expect(校正世界区域(world, 'penacony').当前区域ID).toBe('penacony');
    expect(校正世界区域(world, 未知区域ID)).toBe(world);
    expect(world.当前区域ID).toBe(未知区域ID);
  });
});
