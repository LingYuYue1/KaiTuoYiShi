import { describe, expect, it } from 'vitest';
import {
  归一化剧情编织分段,
  归一化剧情编织系列,
  归一化剧情编织系统,
  type 剧情编织分段,
  type 剧情编织系统,
} from '@/models/storyWeaving';
import { parseResponse, parseStoryAdvanceBlock } from '@/services/ai/responseParser';
import {
  autoAlignCanonStoryProgress,
  buildStoryAdvanceDeclarationContract,
  获取激活剧情系列,
} from '@/services/storyProgressService';
import { buildStoryArrangementSection } from '@/hooks/useGame/systemPromptSections';

function 建分段(input: {
  id: string;
  组号: number;
  运行状态: 剧情编织分段['运行状态'];
  标题?: string;
  本段结束状态?: string[];
  本段概括?: string;
  给后续参考?: string[];
  涉及地点?: string[];
  登场角色?: string[];
}): 剧情编织分段 {
  return 归一化剧情编织分段({
    id: input.id,
    组号: input.组号,
    标题: input.标题 ?? `分段${input.组号}`,
    处理状态: '已完成',
    运行状态: input.运行状态,
    启用注入: true,
    本段结束状态: input.本段结束状态 ?? [],
    本段概括: input.本段概括 ?? '',
    给后续参考: input.给后续参考 ?? [],
    涉及地点: input.涉及地点 ?? [],
    登场角色: input.登场角色 ?? [],
  }, input.组号);
}

function 建系统(分段列表: 剧情编织分段[]): 剧情编织系统 {
  const series = 归一化剧情编织系列({ id: 's', 标题: '测试系列', 来源类型: 'canon', 分段列表 });
  return 归一化剧情编织系统({ 当前系列ID: 's', 系列列表: [series] });
}

function 当前组号(系统: 剧情编织系统): number {
  return 获取激活剧情系列(系统)?.当前分段组号 ?? -1;
}

describe('剧情推进申报解析', () => {
  it('完整子块抽出完成/进入分段/依据', () => {
    const plan = '下一段继续追踪。\n<剧情推进>\n完成: 是\n进入分段: 4\n依据: 正文写到警报解除\n</剧情推进>';
    expect(parseStoryAdvanceBlock(plan)).toEqual({ completed: true, targetSegment: '4', basis: '正文写到警报解除' });
  });

  it('完成支持 true/1/中文冒号，完成否则为否', () => {
    expect(parseStoryAdvanceBlock('<剧情推进>完成：true</剧情推进>')?.completed).toBe(true);
    expect(parseStoryAdvanceBlock('<剧情推进>完成: 1</剧情推进>')?.completed).toBe(true);
    expect(parseStoryAdvanceBlock('<剧情推进>完成: 否；进入分段: 无</剧情推进>')).toEqual({ completed: false });
  });

  it('进入分段为空或"无"时不带 target', () => {
    expect(parseStoryAdvanceBlock('<剧情推进>完成: 是；进入分段: 无；依据: x</剧情推进>')?.targetSegment).toBeUndefined();
    expect(parseStoryAdvanceBlock('<剧情推进>完成: 否</剧情推进>')?.targetSegment).toBeUndefined();
  });

  it('无块或空块返回 undefined，不抛错', () => {
    expect(parseStoryAdvanceBlock('只有规划没有申报')).toBeUndefined();
    expect(parseStoryAdvanceBlock('<剧情推进></剧情推进>')).toBeUndefined();
    expect(parseStoryAdvanceBlock('<剧情推进>   </剧情推进>')).toBeUndefined();
  });

  it('经 parseResponse 全链：申报进 storyAdvance，正文不受污染', () => {
    const parsed = parseResponse('<正文>列车驶入残骸带。</正文>\n<剧情规划>继续追踪。\n<剧情推进>完成: 否；进入分段: 无</剧情推进></剧情规划>');
    expect(parsed.storyAdvance).toEqual({ completed: false });
    expect(parsed.body).toBe('列车驶入残骸带。');
    expect(parsed.storyPlan).toContain('<剧情推进>');
  });
});

describe('剧情推进申报契约', () => {
  it('有当前分段时注入标题/结束状态/格式与校验声明', () => {
    const 系统 = 建系统([
      建分段({ id: 'a', 组号: 1, 运行状态: '当前', 标题: '空间站对接通道', 本段结束状态: ['列车完成对接'] }),
      建分段({ id: 'b', 组号: 2, 运行状态: '未开始', 标题: '主控舱段警报解除' }),
    ]);
    const contract = buildStoryAdvanceDeclarationContract(系统);
    expect(contract).toContain('空间站对接通道');
    expect(contract).toContain('列车完成对接');
    expect(contract).toContain('<剧情推进>完成: 是/否');
    expect(contract).toContain('申报本身不能推进剧情');
  });

  it('无激活系列时返回空串，调用方不注入死指令', () => {
    const empty = 归一化剧情编织系统({});
    expect(buildStoryAdvanceDeclarationContract(empty)).toBe('');
    expect(buildStoryArrangementSection(undefined, [], '')).toBe('');
  });

  it('契约随剧情规划备忘一起注入', () => {
    const section = buildStoryArrangementSection(undefined, ['承接上回合伏笔'], '## 当前剧情分段（推进申报）');
    expect(section).toContain('剧情规划备忘');
    expect(section).toContain('## 当前剧情分段（推进申报）');
  });
});

describe('申报背书参与对齐', () => {
  // 注意：评分器不做中文分词——标题/结束状态按标点切词，单串永远只有 1 命中。
  // 因此结束状态用逗号写成多词串，正文必须逐字包含整串才能计命中。
  const body = '主控舱段警报解除后，黑塔下令警报控制台复位，主控舱段恢复通行；'
    + '列车组进入残骸带搜寻三月七标记的残骸信号，残骸信号、追踪报告确认无误，'
    + '锁定残骸核心坐标，残骸扫描完成，随后前往深空站补给交接。';

  function 三段系统(): 剧情编织系统 {
    return 建系统([
      建分段({ id: 'seg1', 组号: 1, 运行状态: '当前', 标题: '空间站对接通道' }),
      建分段({
        id: 'seg2', 组号: 2, 运行状态: '未开始', 标题: '主控舱段警报解除',
        本段结束状态: ['黑塔发出全站通告'], 涉及地点: ['主控舱段'],
      }),
      建分段({
        id: 'seg3', 组号: 3, 运行状态: '未开始', 标题: '残骸带深空追踪',
        本段结束状态: ['锁定残骸核心坐标', '残骸扫描完成'],
        本段概括: '残骸信号、追踪报告',
        给后续参考: ['深空站补给交接'],
        涉及地点: ['残骸带', '深空站'], 登场角色: ['三月七'],
      }),
    ]);
  }

  it('无申报时正文强证据跳到 seg3', () => {
    const result = autoAlignCanonStoryProgress({ storyWeaving: 三段系统(), turnCount: 6, body, userInput: '继续' });
    expect(result.progressed).toBe(true);
    expect(当前组号(result.system)).toBe(3);
  });

  it('背书过的申报目标把候选收窄到 seg2：seg2 证据不足不跳，整体不推进', () => {
    const result = autoAlignCanonStoryProgress({
      storyWeaving: 三段系统(),
      turnCount: 6,
      body,
      userInput: '继续',
      declaredAdvance: { completed: false, targetSegment: '主控舱段警报解除' },
    });
    expect(result.progressed).toBe(false);
    expect(当前组号(result.system)).toBe(1);
  });

  it('申报目标支持组号写法，效果与标题一致', () => {
    const result = autoAlignCanonStoryProgress({
      storyWeaving: 三段系统(),
      turnCount: 6,
      body,
      userInput: '继续',
      declaredAdvance: { completed: false, targetSegment: '2' },
    });
    expect(result.progressed).toBe(false);
    expect(当前组号(result.system)).toBe(1);
  });

  it('无背书的申报目标被忽略：结果与无申报基线一致', () => {
    const baseline = autoAlignCanonStoryProgress({ storyWeaving: 三段系统(), turnCount: 6, body, userInput: '继续' });
    const withUnendorsed = autoAlignCanonStoryProgress({
      storyWeaving: 三段系统(),
      turnCount: 6,
      body: '列车在空间站外围巡航，三月七清点物资。',
      userInput: '继续',
      declaredAdvance: { completed: false, targetSegment: '主控舱段警报解除' },
    });
    const plain = autoAlignCanonStoryProgress({
      storyWeaving: 三段系统(),
      turnCount: 6,
      body: '列车在空间站外围巡航，三月七清点物资。',
      userInput: '继续',
    });
    expect(baseline.progressed).toBe(true);
    expect(withUnendorsed.progressed).toBe(plain.progressed);
    expect(当前组号(withUnendorsed.system)).toBe(当前组号(plain.system));
  });

  it('越窗的申报目标被忽略', () => {
    const baseline = autoAlignCanonStoryProgress({ storyWeaving: 三段系统(), turnCount: 6, body, userInput: '继续' });
    const jumped = autoAlignCanonStoryProgress({
      storyWeaving: 三段系统(),
      turnCount: 6,
      body,
      userInput: '继续',
      declaredAdvance: { completed: false, targetSegment: '不存在的分段' },
    });
    expect(jumped.progressed).toBe(baseline.progressed);
    expect(当前组号(jumped.system)).toBe(当前组号(baseline.system));
  });

  it('申报完成无正文背书不升：不触发归档', () => {
    const 系统 = 建系统([
      建分段({ id: 'a', 组号: 1, 运行状态: '当前', 标题: '空间站对接通道', 本段结束状态: ['列车完成对接'] }),
      建分段({ id: 'b', 组号: 2, 运行状态: '未开始', 标题: '主控舱段警报解除' }),
    ]);
    const result = autoAlignCanonStoryProgress({
      storyWeaving: 系统,
      turnCount: 6,
      body: '列车在通道里缓慢滑行，三月七望着舷窗发呆。',
      userInput: '继续',
      declaredAdvance: { completed: true },
    });
    expect(result.progressed).toBe(false);
    expect(当前组号(result.system)).toBe(1);
  });

  it('申报完成有正文背书才补足阈值归档', () => {
    const 系统 = 建系统([
      建分段({
        id: 'a', 组号: 1, 运行状态: '当前', 标题: '空间站对接通道',
        本段结束状态: ['列车完成对接，对接通道锁定'],
      }),
      建分段({ id: 'b', 组号: 2, 运行状态: '未开始', 标题: '主控舱段警报解除' }),
    ]);
    const endorsedBody = '列车完成对接，对接通道锁定，乘务组开始下车。';
    const without = autoAlignCanonStoryProgress({ storyWeaving: 系统, turnCount: 6, body: endorsedBody, userInput: '继续' });
    const withDeclared = autoAlignCanonStoryProgress({
      storyWeaving: 系统,
      turnCount: 6,
      body: endorsedBody,
      userInput: '继续',
      declaredAdvance: { completed: true },
    });
    expect(without.progressed).toBe(false);
    expect(withDeclared.progressed).toBe(true);
    expect(当前组号(withDeclared.system)).toBe(2);
  });

  it('申报完成为否永不降级：正文本来够归档照样归档', () => {
    const 系统 = 建系统([
      建分段({
        id: 'a', 组号: 1, 运行状态: '当前', 标题: '空间站对接通道',
        本段结束状态: ['列车完成对接，对接通道锁定', '乘务组下车，交接手续办妥'],
      }),
      建分段({ id: 'b', 组号: 2, 运行状态: '未开始', 标题: '主控舱段警报解除' }),
    ]);
    const body = '列车完成对接，对接通道锁定，乘务组下车解决交接手续。';
    const result = autoAlignCanonStoryProgress({
      storyWeaving: 系统, turnCount: 6, body, userInput: '继续',
      declaredAdvance: { completed: false },
    });
    expect(result.progressed).toBe(true);
    expect(当前组号(result.system)).toBe(2);
  });
});
