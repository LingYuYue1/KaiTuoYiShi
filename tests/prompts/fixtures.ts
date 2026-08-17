import { 创建空角色 } from '@/models/character';
import { 创建默认游戏设置 } from '@/models/settings';
import type { 剧情编织分段, 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空世界状态 } from '@/models/world';
import { 创建智库条目, type 智库系统 } from '@/models/zhiku';
import type { FilterContext } from '@/utils/worldbook';

export function createPromptFixture() {
  const traveler = { ...创建空角色(), 姓名: '测试旅人', 身份: '开拓者' };
  const world = {
    ...创建空世界状态(),
    当前日期: '琥珀纪 2158 年 1 月 1 日',
    当前时间: '09:30',
    当前地点: '空间站主控舱段',
  };
  const settings = 创建默认游戏设置();
  const context: FilterContext = {
    recentUserInput: '我已经到过空间站主控舱段了吗？三月七在吗？',
    recentAIResponse: '警报仍在远处回响。',
    worldName: '黑塔空间站',
    travelerName: traveler.姓名,
    turnCount: 8,
    currentLocation: world.当前地点,
    npcNames: ['三月七'],
    currentScope: 'main',
  };
  return { traveler, world, settings, context };
}

function createSegment(input: Pick<剧情编织分段, 'id' | '组号' | '标题' | '运行状态' | '原文摘要' | '本段概括'>): 剧情编织分段 {
  return {
    ...input,
    章节范围: `${input.组号}-${input.组号}`,
    章节标题: [input.标题],
    是否开局组: false,
    起始章序号: input.组号,
    结束章序号: input.组号,
    启用注入: true,
    原文内容: '',
    字数: 0,
    原文摘要: input.原文摘要,
    本段概括: input.本段概括,
    时间线起点: '',
    时间线终点: '',
    开局已成立事实: [],
    前段延续事实: [],
    本段结束状态: [],
    给后续参考: [],
    原著硬约束: [],
    可提前铺垫: [],
    登场角色: ['三月七'],
    涉及地点: ['空间站主控舱段'],
    涉及派系: [],
    角色档案: [],
    势力档案: [],
    地图地点档案: [],
    关键事件: [],
    时间线: [],
    角色推进: [],
    处理状态: '已完成',
    updatedAt: 0,
  };
}

export function createStoryWeavingFixture(): 剧情编织系统 {
  const previous = createSegment({ id: 'previous', 组号: 1, 标题: '旧港余波', 运行状态: '已经历', 原文摘要: '已归档摘要', 本段概括: 'PREVIOUS_SEGMENT_PAYLOAD' });
  const current = createSegment({ id: 'current', 组号: 2, 标题: '主控舱段警报', 运行状态: '当前', 原文摘要: '当前摘要', 本段概括: 'CURRENT_SEGMENT_PAYLOAD' });
  const next = createSegment({ id: 'next', 组号: 3, 标题: '前方信号', 运行状态: '未开始', 原文摘要: '前方摘要', 本段概括: 'NEXT_SEGMENT_PAYLOAD' });
  return {
    当前系列ID: 'station',
    当前进度: {
      当前系列ID: 'station',
      当前分段ID: current.id,
      当前分段组号: current.组号,
      推进状态: '推进中',
      已完成摘要: [],
      当前待解问题: ['警报来源'],
      切换说明: [],
      历史归档: [],
      最近判定理由: ['地点命中'],
      updatedAt: 0,
    },
    系列列表: [{
      id: 'station',
      标题: '空间站事件',
      作品名: '测试作品',
      来源类型: 'custom',
      来源智库条目ID: [],
      章节列表: [],
      分段列表: [previous, current, next],
      每段章数: 1,
      激活注入: true,
      当前分段组号: current.组号,
      当前阶段概括: '警报尚未解除',
      核心角色摘要: [],
      核心角色: ['三月七'],
      涉及地点索引: ['空间站主控舱段'],
      涉及派系索引: [],
      createdAt: 0,
      updatedAt: 0,
    }],
  };
}

export function createZhikuFixture(): 智库系统 {
  return {
    条目: [
      创建智库条目({
        标题: '三月七',
        分类: 'character',
        关键词: ['三月七'],
        原文: '【基础识别】三月七',
        可否主剧情注入: true,
      }),
      创建智库条目({
        标题: '空间站主控舱段',
        分类: 'location',
        摘要: '空间站的指挥区域。',
        关键词: ['主控舱段'],
        可否主剧情注入: true,
      }),
    ],
  };
}
