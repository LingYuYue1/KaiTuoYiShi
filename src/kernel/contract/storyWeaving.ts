import type { 剧情编织分段 } from '@/models/storyWeaving';

export interface StoryPlanningAnalysis {
  系列标题: string;
  当前分段标题: string;
  当前分段组号: number;
  推进状态: string;
  门禁结果: 'soft' | 'strong' | '未记录';
  建议动作: '继续软参考' | '允许强承接' | '等待正文证据' | '可归档或切段' | '需要人工检查';
  偏离风险: '低' | '中' | '高';
  分析理由: string[];
  关注事项: string[];
  切段条件: string[];
  待迁移事项: string[];
  下一步调度: string[];
  归档检查: string[];
  历史摘要: string[];
}

export interface StoryWeavingInjectionDiagnostics {
  系列ID: string;
  系列标题: string;
  健康状态: '正常' | '已跳过归档锚点' | '需要检查';
  检查项: string[];
  当前分段ID: string;
  当前分段组号: number;
  当前分段标题: string;
  当前分段运行状态: 剧情编织分段['运行状态'];
  归档锚点分段ID?: string;
  归档锚点组号?: number;
  归档锚点标题?: string;
  前一分段标题?: string;
  下一分段标题?: string;
  可注入分段数: number;
}
