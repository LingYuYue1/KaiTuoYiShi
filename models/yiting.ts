export interface 回忆条目 {
  id: string;
  名称?: string;
  类型?: '短期压缩' | '长期压缩' | '精炼纪要';
  摘要: string;
  原文: string;
  检索关键词?: string[];
  来源回合?: number[];
  回合: number;
  时间戳: string;
}

export interface 忆庭系统 {
  回忆档案: 回忆条目[];
}

export function 创建空忆庭系统(): 忆庭系统 {
  return {
    回忆档案: [],
  };
}

export function 归一化忆庭系统(input?: Partial<忆庭系统> | null): 忆庭系统 {
  return {
    回忆档案: (input?.回忆档案 ?? []).map((entry) => ({
      ...entry,
      名称: entry.名称 ?? `【回忆${String(Math.max(1, entry.回合)).padStart(3, '0')}】`,
      类型: entry.类型 ?? (entry.摘要?.includes('长期') ? '长期压缩' : '短期压缩'),
      检索关键词: entry.检索关键词 ?? [],
      来源回合: entry.来源回合 ?? [entry.回合],
    })),
  };
}
