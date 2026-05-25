import type { API配置项 } from './settings';

export type 剧情编织分段状态 = '待处理' | '处理中' | '已完成' | '失败';
export type 剧情编织运行状态 = '未开始' | '当前' | '已经历' | '已跳过' | '已偏离' | '暂停';
export type 剧情编织来源类型 = 'canon' | 'custom';

export interface 剧情编织可见性 {
  谁知道: string[];
  谁不知道: string[];
  是否仅读者视角可见: boolean;
}

export interface 剧情编织约束条目 {
  内容: string;
  信息可见性: 剧情编织可见性;
}

export interface 剧情编织事件 {
  事件名: string;
  事件说明: string;
  前置条件: string[];
  触发条件: string[];
  阻断条件: string[];
  事件结果: string[];
  对后续影响: string[];
  信息可见性: 剧情编织可见性;
}

export interface 剧情编织角色推进 {
  角色名: string;
  本段前状态: string[];
  本段变化: string[];
  本段后状态: string[];
  对后续影响: string[];
}

export interface 剧情编织时间线事件 {
  标题: string;
  时间锚点: string;
  描述: string;
  涉及角色: string[];
}

export interface 剧情编织角色档案 {
  名称: string;
  身份: string;
  所属势力: string;
  初始立场: string;
  关系摘要: string[];
  状态摘要: string[];
  首次出现: string;
  重要性: '一般' | '重要' | '核心';
}

export interface 剧情编织势力档案 {
  名称: string;
  类型: string;
  地盘: string;
  代表人物: string[];
  立场目标: string;
  当前状态: string;
  关系摘要: string[];
  首次出现: string;
}

export interface 剧情编织地点档案 {
  名称: string;
  层级: '寰宇' | '大地点' | '中地点' | '小地点' | '区地点' | '子地点' | '未知';
  上级地点: string;
  所属势力: string;
  地貌功能: string;
  关键设施: string[];
  首次出现: string;
}

export interface 剧情编织章节 {
  id: string;
  序号: number;
  标题: string;
  内容: string;
  字数: number;
}

export interface 剧情编织分段 {
  id: string;
  组号: number;
  标题: string;
  章节范围: string;
  章节标题: string[];
  是否开局组: boolean;
  起始章序号: number;
  结束章序号: number;
  启用注入: boolean;
  原文内容: string;
  字数: number;
  原文摘要: string;
  本段概括: string;
  时间线起点: string;
  时间线终点: string;
  开局已成立事实: string[];
  前段延续事实: string[];
  本段结束状态: string[];
  给后续参考: string[];
  原著硬约束: 剧情编织约束条目[];
  可提前铺垫: 剧情编织约束条目[];
  登场角色: string[];
  涉及地点: string[];
  涉及派系: string[];
  角色档案: 剧情编织角色档案[];
  势力档案: 剧情编织势力档案[];
  地图地点档案: 剧情编织地点档案[];
  关键事件: 剧情编织事件[];
  时间线: 剧情编织时间线事件[];
  角色推进: 剧情编织角色推进[];
  处理状态: 剧情编织分段状态;
  运行状态: 剧情编织运行状态;
  最近错误?: string;
  updatedAt: number;
}

export interface 剧情编织系列 {
  id: string;
  标题: string;
  作品名: string;
  来源类型: 剧情编织来源类型;
  来源智库条目ID: string[];
  内置预设ID?: string;
  来源文件名?: string;
  原始文本?: string;
  章节列表: 剧情编织章节[];
  分段列表: 剧情编织分段[];
  每段章数: number;
  激活注入: boolean;
  当前分段组号: number;
  当前阶段概括: string;
  核心角色摘要: string[];
  核心角色: string[];
  涉及地点索引: string[];
  涉及派系索引: string[];
  createdAt: number;
  updatedAt: number;
}

export interface 剧情编织系统 {
  系列列表: 剧情编织系列[];
  当前系列ID?: string;
}

export interface 剧情编织API覆盖 {
  provider: API配置项['provider'];
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

const 生成ID = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 读文本 = (value: unknown): string => (typeof value === 'string' ? value : '');
const 清理文本 = (value: string): string => value.replace(/\r\n/g, '\n').replace(/\uFEFF/g, '').trim();
const 文本列表 = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => 读文本(item).trim()).filter(Boolean)
    : []
);
const 去重文本列表 = (items: string[], maxCount?: number): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const normalized = 读文本(raw).trim().replace(/\s+/g, ' ');
    if (!normalized) continue;
    const key = normalized.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (typeof maxCount === 'number' && maxCount > 0 && result.length >= maxCount) break;
  }
  return result;
};
const 切换标题包裹 = (value: string): string => 读文本(value).trim().replace(/^[【\[\(（《「『]+|[】\]\)）》」』]+$/g, '').trim();

const 章节标题层级规则 = {
  volume: /^(?:正文\s*)?(?:第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+[\s]*[卷部篇册季集辑])[^。\n]{0,48}$/u,
  chapter: /^(?:正文\s*)?(?:第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+[\s]*[章节回话幕节]|[章节回话幕节]\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+)[^。\n]{0,48}$/u,
  english: /^(?:chapter|chap|volume|vol(?:ume)?|book|part)\s*(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[^。\n]{0,48}$/iu,
  special: /^(?:序章|楔子|引子|序言|前言|引言|终章|尾声|后记|番外(?:篇)?|外传|附录|大结局|完本感言)(?:\s*[-—:：·•、.]\s*|\s+)?[^\n]{0,30}$/u,
};

const 标题前缀规则 = [
  /^(?:正文\s*)?(?:第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+\s*[卷部篇册季集辑章节回话幕节])\s*[：:·．.\-—\s]*/u,
  /^(?:正文\s*)?[卷部篇册季集辑章节回话幕节]\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+\s*[：:·．.\-—\s]*/u,
  /^(?:chapter|chap|volume|vol(?:ume)?|book|part)\s*(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*[：:·．.\-—\s]*/iu,
  /^(?:序章|楔子|引子|序言|前言|引言|终章|尾声|后记|番外(?:篇)?|外传|附录|大结局|完本感言)\s*[：:·．.\-—\s]*/u,
];

const 规范化章节标题文本 = (title: string): string => {
  let current = 读文本(title).trim().replace(/\s+/g, ' ');
  if (!current) return '';
  current = 切换标题包裹(current);
  current = current.replace(/^[#*]+\s*/g, '').trim();
  let changed = true;
  while (changed && current) {
    changed = false;
    for (const rule of 标题前缀规则) {
      const next = current.replace(rule, '').trim();
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }
  return current.replace(/\s+/g, ' ').trim();
};

const 提取正文中的显式章节标题 = (content: string): string => {
  const lines = 读文本(content)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = 识别章节标题行(line, {
      上一行: index > 0 ? lines[index - 1] : '',
      下一行: index < lines.length - 1 ? lines[index + 1] : '',
    });
    if (match) return match.标题;
  }
  return '';
};

const 去掉正文开头重复章节标题 = (content: string, title: string): string => {
  const normalizedContent = 清理文本(content);
  const normalizedTitle = 规范化章节标题文本(title);
  if (!normalizedContent || !normalizedTitle) return normalizedContent;
  const lines = normalizedContent.split('\n');
  if (lines.length <= 0) return normalizedContent;
  const firstLine = 规范化章节标题文本(lines[0]);
  if (firstLine !== normalizedTitle) return normalizedContent;
  return 清理文本(lines.slice(1).join('\n'));
};

const 识别章节标题行 = (line: string, options?: { 上一行?: string; 下一行?: string }): { 标题: string; 层级: 'volume' | 'chapter' } | null => {
  const raw = 读文本(line).replace(/\r\n/g, '\n').trim();
  if (!raw) return null;
  const decoratedTitle = 切换标题包裹(raw).replace(/^[#*]+\s*/g, '').replace(/\s+/g, ' ').trim();
  const title = 规范化章节标题文本(decoratedTitle) || decoratedTitle;
  if (!title) return null;
  if (章节标题层级规则.volume.test(decoratedTitle)) return { 标题: title, 层级: 'volume' };
  if (章节标题层级规则.chapter.test(decoratedTitle) || 章节标题层级规则.english.test(decoratedTitle) || 章节标题层级规则.special.test(decoratedTitle)) {
    return { 标题: title, 层级: 'chapter' };
  }
  const 上一行 = 读文本(options?.上一行).trim();
  const 下一行 = 读文本(options?.下一行).trim();
  if (
    /^(?:正文\s*)?(?:第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+)\s*[、.．·\-—]\s*[^。\n]{1,32}$/u.test(decoratedTitle)
    && !上一行
    && (下一行.length === 0 || 下一行.length >= 12)
  ) {
    return { 标题: title, 层级: 'chapter' };
  }
  return null;
};

const 是否疑似目录章节 = (title: string, content: string): boolean => {
  const normalizedTitle = 读文本(title).trim();
  const normalizedContent = 读文本(content).trim();
  if (!normalizedContent) return false;
  const chapterRefCount = (normalizedContent.match(/第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+\s*[章节回话幕节卷篇册]/gu) || []).length
    + (normalizedContent.match(/\b(?:chapter|chap|volume|vol(?:ume)?|book|part)\s*(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/giu) || []).length;
  const punctuationCount = (normalizedContent.match(/[。！？!?]/g) || []).length;
  const lineCount = normalizedContent.split('\n').map((item) => item.trim()).filter(Boolean).length;
  const directoryStyleCount = (normalizedContent.match(/^\s*(?:第\s*[0-9零一二三四五六七八九十百千万两〇○壹贰叁肆伍陆柒捌玖拾]+[\s]*[章节回话幕节卷篇册]?|chapter|chap|volume|vol(?:ume)?|book|part)\b/gimu) || []).length;
  if (/^(目录|目次|contents?|table\s+of\s+contents)$/iu.test(normalizedTitle) && chapterRefCount >= 2) return true;
  if (chapterRefCount >= 8 && punctuationCount <= 2) return true;
  if (chapterRefCount >= 6 && lineCount <= 6 && punctuationCount <= 3) return true;
  if (directoryStyleCount >= 5 && punctuationCount <= 3) return true;
  return false;
};

const 解析章节范围文本 = (start: number, end: number): string => (start === end ? `第${start}章` : `第${start}章-第${end}章`);

const 规范化时间线事件 = (raw: Partial<剧情编织时间线事件>): 剧情编织时间线事件 => ({
  标题: 读文本(raw.标题).trim(),
  时间锚点: 读文本(raw.时间锚点).trim(),
  描述: 读文本(raw.描述).trim(),
  涉及角色: 文本列表(raw.涉及角色),
});

const 归一化角色档案 = (raw: Partial<剧情编织角色档案>): 剧情编织角色档案 => ({
  名称: 读文本(raw.名称).trim(),
  身份: 读文本(raw.身份).trim() || '无',
  所属势力: 读文本(raw.所属势力).trim() || '无',
  初始立场: 读文本(raw.初始立场).trim() || '无',
  关系摘要: 文本列表(raw.关系摘要),
  状态摘要: 文本列表(raw.状态摘要),
  首次出现: 读文本(raw.首次出现).trim() || '无',
  重要性: raw.重要性 === '核心' || raw.重要性 === '重要' ? raw.重要性 : '一般',
});

const 归一化势力档案 = (raw: Partial<剧情编织势力档案>): 剧情编织势力档案 => ({
  名称: 读文本(raw.名称).trim(),
  类型: 读文本(raw.类型).trim() || '无',
  地盘: 读文本(raw.地盘).trim() || '无',
  代表人物: 文本列表(raw.代表人物),
  立场目标: 读文本(raw.立场目标).trim() || '无',
  当前状态: 读文本(raw.当前状态).trim() || '无',
  关系摘要: 文本列表(raw.关系摘要),
  首次出现: 读文本(raw.首次出现).trim() || '无',
});

const 归一化地点档案 = (raw: Partial<剧情编织地点档案>): 剧情编织地点档案 => ({
  名称: 读文本(raw.名称).trim(),
  层级: raw.层级 === '寰宇' || raw.层级 === '大地点' || raw.层级 === '中地点' || raw.层级 === '小地点' || raw.层级 === '区地点' || raw.层级 === '子地点'
    ? raw.层级
    : '未知',
  上级地点: 读文本(raw.上级地点).trim() || '无',
  所属势力: 读文本(raw.所属势力).trim() || '无',
  地貌功能: 读文本(raw.地貌功能).trim() || '无',
  关键设施: 文本列表(raw.关键设施),
  首次出现: 读文本(raw.首次出现).trim() || '无',
});

const 聚合剧情编织系列信息 = (series: 剧情编织系列): 剧情编织系列 => {
  const completed = series.分段列表.filter((segment) => segment.处理状态 === '已完成' && segment.启用注入 !== false);
  const recent = completed.slice(-3);
  const 当前阶段概括 = recent.length
    ? 去重文本列表(recent.flatMap((segment) => [segment.本段概括 || segment.原文摘要 || segment.标题]), 3).join('；')
    : '';
  const 核心角色统计 = new Map<string, number>();
  const 涉及地点统计 = new Map<string, number>();
  const 涉及派系统计 = new Map<string, number>();
  completed.forEach((segment) => {
    去重文本列表(segment.登场角色, 30).forEach((item) => 核心角色统计.set(item, (核心角色统计.get(item) || 0) + 1));
    去重文本列表(segment.涉及地点, 30).forEach((item) => 涉及地点统计.set(item, (涉及地点统计.get(item) || 0) + 1));
    去重文本列表(segment.涉及派系, 30).forEach((item) => 涉及派系统计.set(item, (涉及派系统计.get(item) || 0) + 1));
  });
  const 核心角色 = Array.from(核心角色统计.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 8)
    .map(([name]) => name);
  const 核心角色摘要 = Array.from(核心角色统计.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 8)
    .map(([name, count]) => `${name}：关联 ${count} 个分段`);
  const 涉及地点索引 = Array.from(涉及地点统计.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 10)
    .map(([name]) => name);
  const 涉及派系索引 = Array.from(涉及派系统计.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 10)
    .map(([name]) => name);
  return {
    ...series,
    当前阶段概括,
    核心角色摘要,
    核心角色,
    涉及地点索引,
    涉及派系索引,
  };
};

const 默认可见性 = (): 剧情编织可见性 => ({
  谁知道: [],
  谁不知道: [],
  是否仅读者视角可见: false,
});

const 运行状态列表: 剧情编织运行状态[] = ['未开始', '当前', '已经历', '已跳过', '已偏离', '暂停'];

function 归一化运行状态(value: unknown): 剧情编织运行状态 {
  return 运行状态列表.includes(value as 剧情编织运行状态)
    ? value as 剧情编织运行状态
    : '未开始';
}

function 归一化来源类型(value: unknown): 剧情编织来源类型 {
  return value === 'canon' ? 'canon' : 'custom';
}

export function 创建空剧情编织系统(): 剧情编织系统 {
  return { 系列列表: [] };
}

export function 归一化剧情编织系统(input?: Partial<剧情编织系统> | null): 剧情编织系统 {
  if (!input) return 创建空剧情编织系统();
  const 系列列表 = Array.isArray(input.系列列表) ? input.系列列表.map(归一化剧情编织系列) : [];
  const 当前系列ID = input.当前系列ID && 系列列表.some((s) => s.id === input.当前系列ID)
    ? input.当前系列ID
    : 系列列表[0]?.id;
  return { 系列列表, 当前系列ID };
}

export function 归一化剧情编织系列(raw: Partial<剧情编织系列>): 剧情编织系列 {
  const now = Date.now();
  const id = 读文本(raw.id).trim() || 生成ID('story_series');
  const 章节列表 = Array.isArray(raw.章节列表)
    ? raw.章节列表.map((chapter, index) => 归一化剧情编织章节(chapter, id, index + 1))
    : [];
  const 当前分段组号 = Math.max(1, Math.trunc(Number(raw.当前分段组号 ?? 1) || 1));
  const rawSegments = Array.isArray(raw.分段列表)
    ? raw.分段列表.map((segment, index) => 归一化剧情编织分段(segment, index + 1))
    : [];
  const hasCurrentRuntime = rawSegments.some((segment) => segment.运行状态 === '当前');
  const 分段列表 = rawSegments.map((segment) => {
    if (hasCurrentRuntime) return segment;
    return segment.组号 === 当前分段组号 ? { ...segment, 运行状态: '当前' as const } : segment;
  });
  const 系列 = {
    id,
    标题: 读文本(raw.标题).trim() || 读文本(raw.作品名).trim() || '未命名剧情',
    作品名: 读文本(raw.作品名).trim() || 读文本(raw.标题).trim() || '未命名作品',
    来源类型: 归一化来源类型(raw.来源类型),
    来源智库条目ID: 去重文本列表(文本列表(raw.来源智库条目ID), 80),
    内置预设ID: 读文本(raw.内置预设ID).trim() || undefined,
    来源文件名: 读文本(raw.来源文件名).trim() || undefined,
    原始文本: 读文本(raw.原始文本),
    章节列表,
    分段列表,
    每段章数: Math.max(1, Math.trunc(Number(raw.每段章数 ?? 1) || 1)),
    激活注入: raw.激活注入 !== false,
    当前分段组号,
    当前阶段概括: 读文本(raw.当前阶段概括).trim(),
    核心角色摘要: 去重文本列表(文本列表(raw.核心角色摘要), 12),
    核心角色: 去重文本列表(文本列表(raw.核心角色), 12),
    涉及地点索引: 去重文本列表(文本列表(raw.涉及地点索引), 12),
    涉及派系索引: 去重文本列表(文本列表(raw.涉及派系索引), 12),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
  return 聚合剧情编织系列信息(系列);
}

function 归一化剧情编织章节(raw: Partial<剧情编织章节>, _seriesId: string, index: number): 剧情编织章节 {
  const 内容 = 读文本(raw.内容);
  return {
    id: 读文本(raw.id).trim() || 生成ID('story_chapter'),
    序号: Math.max(1, Math.trunc(Number(raw.序号 ?? index) || index)),
    标题: 读文本(raw.标题).trim() || `第 ${index} 章`,
    内容,
    字数: Number(raw.字数) || [...内容].length,
  };
}

export function 归一化剧情编织分段(raw: Partial<剧情编织分段>, index: number): 剧情编织分段 {
  const 原文内容 = 读文本(raw.原文内容);
  const 分段: 剧情编织分段 = {
    id: 读文本(raw.id).trim() || 生成ID('story_segment'),
    组号: Math.max(1, Math.trunc(Number(raw.组号 ?? index) || index)),
    标题: 读文本(raw.标题).trim() || `分段 ${index}`,
    章节范围: 读文本(raw.章节范围).trim(),
    章节标题: 文本列表(raw.章节标题),
    是否开局组: raw.是否开局组 === true,
    起始章序号: Math.max(1, Math.trunc(Number(raw.起始章序号 ?? index) || index)),
    结束章序号: Math.max(1, Math.trunc(Number(raw.结束章序号 ?? index) || index)),
    启用注入: raw.启用注入 !== false,
    原文内容,
    字数: Number(raw.字数) || [...原文内容].length,
    原文摘要: 读文本(raw.原文摘要).trim(),
    本段概括: 读文本(raw.本段概括).trim(),
    时间线起点: 读文本(raw.时间线起点).trim(),
    时间线终点: 读文本(raw.时间线终点).trim(),
    开局已成立事实: 文本列表(raw.开局已成立事实),
    前段延续事实: 文本列表(raw.前段延续事实),
    本段结束状态: 文本列表(raw.本段结束状态),
    给后续参考: 文本列表(raw.给后续参考),
    原著硬约束: 归一化约束列表(raw.原著硬约束),
    可提前铺垫: 归一化约束列表(raw.可提前铺垫),
    登场角色: 文本列表(raw.登场角色),
    涉及地点: 文本列表(raw.涉及地点),
    涉及派系: 文本列表(raw.涉及派系),
    角色档案: Array.isArray(raw.角色档案) ? raw.角色档案.map((item) => 归一化角色档案(item)).filter((item) => item.名称) : [],
    势力档案: Array.isArray(raw.势力档案) ? raw.势力档案.map((item) => 归一化势力档案(item)).filter((item) => item.名称) : [],
    地图地点档案: Array.isArray(raw.地图地点档案) ? raw.地图地点档案.map((item) => 归一化地点档案(item)).filter((item) => item.名称) : [],
    关键事件: Array.isArray(raw.关键事件) ? raw.关键事件.map(归一化事件).filter((e) => e.事件名 || e.事件说明) : [],
    时间线: Array.isArray(raw.时间线) ? raw.时间线.map((item) => 规范化时间线事件(item)).filter((item) => item.标题 || item.描述 || item.时间锚点) : [],
    角色推进: Array.isArray(raw.角色推进) ? raw.角色推进.map(归一化角色推进).filter((r) => r.角色名) : [],
    处理状态: raw.处理状态 === '处理中' || raw.处理状态 === '已完成' || raw.处理状态 === '失败' ? raw.处理状态 : '待处理',
    运行状态: 归一化运行状态(raw.运行状态),
    最近错误: 读文本(raw.最近错误).trim() || undefined,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  return 分段;
}

function 归一化约束列表(value: unknown): 剧情编织约束条目[] {
  return Array.isArray(value)
    ? value.map((item: Partial<剧情编织约束条目>) => ({
        内容: 读文本(item?.内容).trim(),
        信息可见性: {
          ...默认可见性(),
          ...(item?.信息可见性 ?? {}),
          谁知道: 文本列表(item?.信息可见性?.谁知道),
          谁不知道: 文本列表(item?.信息可见性?.谁不知道),
          是否仅读者视角可见: item?.信息可见性?.是否仅读者视角可见 === true,
        },
      })).filter((item) => item.内容)
    : [];
}

function 归一化事件(raw: Partial<剧情编织事件>): 剧情编织事件 {
  return {
    事件名: 读文本(raw.事件名).trim(),
    事件说明: 读文本(raw.事件说明).trim(),
    前置条件: 文本列表(raw.前置条件),
    触发条件: 文本列表(raw.触发条件),
    阻断条件: 文本列表(raw.阻断条件),
    事件结果: 文本列表(raw.事件结果),
    对后续影响: 文本列表(raw.对后续影响),
    信息可见性: {
      ...默认可见性(),
      ...(raw.信息可见性 ?? {}),
      谁知道: 文本列表(raw.信息可见性?.谁知道),
      谁不知道: 文本列表(raw.信息可见性?.谁不知道),
      是否仅读者视角可见: raw.信息可见性?.是否仅读者视角可见 === true,
    },
  };
}

function 归一化角色推进(raw: Partial<剧情编织角色推进>): 剧情编织角色推进 {
  return {
    角色名: 读文本(raw.角色名).trim(),
    本段前状态: 文本列表(raw.本段前状态),
    本段变化: 文本列表(raw.本段变化),
    本段后状态: 文本列表(raw.本段后状态),
    对后续影响: 文本列表(raw.对后续影响),
  };
}

export function 从TXT提取剧情章节(text: string): 剧情编织章节[] {
  const source = 清理文本(text);
  if (!source) return [];
  const lines = source.split('\n');
  const chunks: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const heading = 识别章节标题行(line, {
      上一行: index > 0 ? lines[index - 1] : '',
      下一行: index < lines.length - 1 ? lines[index + 1] : '',
    });
    if (heading && line.length <= 90) {
      if (current) chunks.push(current);
      current = { title: heading.标题, body: [] };
      continue;
    }
    if (!current) current = { title: '正文', body: [] };
    current.body.push(rawLine);
  }
  if (current) chunks.push(current);

  if (chunks.length <= 1 && source.length > 6000) {
    const paragraphs = source.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    const result: string[][] = [];
    let bucket: string[] = [];
    let count = 0;
    for (const p of paragraphs) {
      bucket.push(p);
      count += [...p].length;
      if (count >= 4000) {
        result.push(bucket);
        bucket = [];
        count = 0;
      }
    }
    if (bucket.length) result.push(bucket);
    return result.map((body, index) => ({
      id: 生成ID('story_chapter'),
      序号: index + 1,
      标题: `片段 ${index + 1}`,
      内容: body.join('\n\n'),
      字数: [...body.join('\n\n')].length,
    }));
  }

  const mapped = chunks.map((chunk, index) => {
    const 内容 = 去掉正文开头重复章节标题(chunk.body.join('\n').trim(), chunk.title);
    const finalContent = 内容 || chunk.body.join('\n').trim();
    const explicitTitle = 提取正文中的显式章节标题(finalContent);
    return {
      id: 生成ID('story_chapter'),
      序号: index + 1,
      标题: chunk.title || explicitTitle || `第 ${index + 1} 章`,
      内容: finalContent,
      字数: [...finalContent].length,
    };
  }).filter((chapter) => chapter.内容 || chapter.标题);
  const filtered = mapped.filter((chapter) => !是否疑似目录章节(chapter.标题, chapter.内容));
  return filtered.length > 0 ? filtered : mapped;
}

export function 根据章节生成剧情分段(chapters: 剧情编织章节[], 每段章数 = 1): 剧情编织分段[] {
  const size = Math.max(1, Math.trunc(Number(每段章数) || 1));
  const result: 剧情编织分段[] = [];
  for (let index = 0; index < chapters.length; index += size) {
    const group = chapters.slice(index, index + size);
    if (!group.length) continue;
    const start = group[0].序号;
    const end = group[group.length - 1].序号;
    const 原文内容 = group.map((chapter) => `【${chapter.标题}】\n${chapter.内容}`).join('\n\n');
    result.push(归一化剧情编织分段({
      组号: result.length + 1,
      标题: group.length === 1 ? group[0].标题 : `${group[0].标题} - ${group[group.length - 1].标题}`,
      章节范围: start === end ? `第${start}章` : `第${start}章-第${end}章`,
      章节标题: group.map((chapter) => chapter.标题),
      是否开局组: index === 0,
      起始章序号: start,
      结束章序号: end,
      原文内容,
      字数: [...原文内容].length,
      原文摘要: group.map((chapter, chapterIndex) => `${chapterIndex + 1}. ${规范化章节标题文本(chapter.标题) || chapter.标题}`).join(' / '),
      时间线起点: '',
      时间线终点: '',
      开局已成立事实: [],
      角色档案: [],
      势力档案: [],
      地图地点档案: [],
      时间线: [],
    }, result.length + 1));
  }
  return result;
}

export function 创建剧情编织系列FromText(input: {
  title: string;
  fileName?: string;
  text: string;
  chaptersPerSegment?: number;
}): 剧情编织系列 {
  const now = Date.now();
  const chapters = 从TXT提取剧情章节(input.text);
  const 每段章数 = Math.max(1, Math.trunc(Number(input.chaptersPerSegment ?? 1) || 1));
  const segments = 根据章节生成剧情分段(chapters, 每段章数);
  return 归一化剧情编织系列({
    id: 生成ID('story_series'),
    标题: input.title.trim() || input.fileName?.replace(/\.[^.]+$/, '') || '导入剧情',
    作品名: input.title.trim() || input.fileName?.replace(/\.[^.]+$/, '') || '导入剧情',
    来源类型: 'custom',
    来源文件名: input.fileName,
    原始文本: input.text,
    章节列表: chapters,
    分段列表: segments,
    每段章数,
    激活注入: true,
    当前分段组号: 1,
    createdAt: now,
    updatedAt: now,
  });
}

export function 重建剧情编织系列FromText(series: 剧情编织系列, chaptersPerSegment?: number): 剧情编织系列 {
  const sourceText = series.原始文本?.trim()
    || series.章节列表
      .map((chapter) => `【${chapter.标题}】\n${chapter.内容}`)
      .join('\n\n')
    || '';
  const rebuilt = 创建剧情编织系列FromText({
    title: series.标题,
    fileName: series.来源文件名,
    text: sourceText,
    chaptersPerSegment: chaptersPerSegment ?? series.每段章数,
  });
  return 归一化剧情编织系列({
    ...rebuilt,
    id: series.id,
    标题: series.标题,
    作品名: series.作品名,
    来源类型: series.来源类型,
    来源智库条目ID: series.来源智库条目ID,
    内置预设ID: series.内置预设ID,
    来源文件名: series.来源文件名,
    原始文本: sourceText || series.原始文本,
    激活注入: series.激活注入,
    当前分段组号: Math.min(series.当前分段组号 || 1, rebuilt.分段列表[rebuilt.分段列表.length - 1]?.组号 || 1),
    createdAt: series.createdAt,
    updatedAt: Date.now(),
  });
}
