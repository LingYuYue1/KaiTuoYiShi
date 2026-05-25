import type { 组织标签ID } from './journey';

export type 新闻类目 = 'plan' | 'chronicle' | 'starlog' | 'frontline';
export type 新闻状态 = 'upcoming' | 'ongoing' | 'completed' | 'archived';

export const NEWS_CATEGORY_LABELS: Record<新闻类目, string> = {
  plan: '即将发生',
  chronicle: '事件演进',
  starlog: '星历纪闻',
  frontline: '前线战报',
};

export const NEWS_CATEGORY_ORDER: 新闻类目[] = ['plan', 'chronicle', 'starlog', 'frontline'];

export const NEWS_STATUS_LABELS: Record<新闻状态, string> = {
  upcoming: '即将发生',
  ongoing: '进行中',
  completed: '已完成',
  archived: '归档新闻',
};

export const NEWS_STATUS_ORDER: 新闻状态[] = ['upcoming', 'ongoing', 'completed', 'archived'];

export interface 新闻条目 {
  id: string;
  类目: 新闻类目;
  状态: 新闻状态;
  回合: number;
  时间戳: number;
  标题: string;
  正文: string;
  组织标签?: 组织标签ID[];
  /** @deprecated 旧字段。独立阵营系统已删除，读取旧新闻时会迁移到「组织标签」。 */
  阵营标签?: 组织标签ID[];
  关联系统?: string[];
  关联剧情系列ID?: string;
  关联剧情分段ID?: string;
  重要?: boolean;
  创建时间: number;
  更新时间: number;
}

export interface 新闻条目补丁 {
  id?: string;
  类目?: 新闻类目;
  状态?: 新闻状态;
  回合?: number;
  标题?: string;
  正文?: string;
  组织标签?: 组织标签ID[];
  /** @deprecated 旧字段。独立阵营系统已删除，兼容旧模型输出。 */
  阵营标签?: 组织标签ID[];
  关联系统?: string[];
  关联剧情系列ID?: string;
  关联剧情分段ID?: string;
  重要?: boolean;
}

export interface 新闻生成结果 {
  新增: 新闻条目补丁[];
  更新: 新闻条目补丁[];
  归档: string[];
  删除: string[];
  说明?: string;
}

export function 创建新闻条目(input: {
  类目: 新闻类目;
  状态?: 新闻状态;
  回合: number;
  标题: string;
  正文?: string;
  组织标签?: 组织标签ID[];
  /** @deprecated 旧字段。独立阵营系统已删除，兼容旧存档。 */
  阵营标签?: 组织标签ID[];
  关联系统?: string[];
  重要?: boolean;
}): 新闻条目 {
  const now = Date.now();
  return {
    id: `news_${now}_${Math.random().toString(36).slice(2, 7)}`,
    类目: input.类目,
    状态: input.状态 ?? 'completed',
    回合: input.回合,
    时间戳: now,
    标题: input.标题,
    正文: input.正文 ?? '',
    组织标签: input.组织标签 ?? input.阵营标签,
    阵营标签: undefined,
    关联系统: input.关联系统,
    关联剧情系列ID: undefined,
    关联剧情分段ID: undefined,
    重要: input.重要 ?? false,
    创建时间: now,
    更新时间: now,
  };
}

export function 归一化新闻条目(item: Partial<新闻条目> & { id?: string }): 新闻条目 {
  const now = Date.now();
  const organizationTags = item.组织标签 ?? item.阵营标签;
  return {
    id: item.id ?? `news_${now}_${Math.random().toString(36).slice(2, 7)}`,
    类目: item.类目 ?? 'chronicle',
    状态: item.状态 ?? 'completed',
    回合: Number.isFinite(item.回合) ? Number(item.回合) : 0,
    时间戳: Number.isFinite(item.时间戳) ? Number(item.时间戳) : now,
    标题: item.标题 ?? '未命名新闻',
    正文: item.正文 ?? '',
    组织标签: organizationTags,
    阵营标签: undefined,
    关联系统: item.关联系统,
    关联剧情系列ID: typeof item.关联剧情系列ID === 'string' && item.关联剧情系列ID.trim() ? item.关联剧情系列ID.trim() : undefined,
    关联剧情分段ID: typeof item.关联剧情分段ID === 'string' && item.关联剧情分段ID.trim() ? item.关联剧情分段ID.trim() : undefined,
    重要: item.重要 ?? false,
    创建时间: Number.isFinite(item.创建时间) ? Number(item.创建时间) : now,
    更新时间: Number.isFinite(item.更新时间) ? Number(item.更新时间) : now,
  };
}

export function 归一化新闻列表(items?: Partial<新闻条目>[]): 新闻条目[] {
  return (items ?? []).map((item) => 归一化新闻条目(item));
}

export function 创建新闻补丁(input: 新闻条目补丁): 新闻条目补丁 {
  return {
    ...input,
    标题: input.标题?.trim() ?? input.标题,
    正文: input.正文?.trim() ?? input.正文,
  };
}
