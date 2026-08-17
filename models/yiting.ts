/** 忆庭条目分类：区分正文记忆与手机通讯记忆（方案E）。旧条目无此字段时按'正文'处理。 */
export type 忆庭条目分类 = '正文' | '通讯';

/** 通讯元数据：仅分类='通讯'时存在，记录手机通讯的来源信息。 */
export interface 忆庭通讯元数据 {
  /** 对方NPC id（私聊）或主联系人id（群聊） */
  联系人: string;
  /** 是否群聊 */
  群聊?: boolean;
  /** 群聊参与人（群聊时填写） */
  参与人?: string[];
}

export interface 回忆条目 {
  id: string;
  /** 对齐参考项目：新写入条目统一为【回忆N】连续编号（N=档案长度+1）；旧条目归一化时按档案顺序重排。 */
  名称?: string;
  /** 保留兼容：压缩归档类型（短期压缩/中期压缩/长期压缩/精炼纪要）。 */
  类型?: '短期压缩' | '中期压缩' | '长期压缩' | '精炼纪要';
  /** 概括：对应 AI 每回合 <短期记忆> 输出（参考项目回忆条目.概括 语义）。 */
  摘要: string;
  /** 原文：对应即时记忆全文（【游戏时间】+玩家输入+AI输出）。 */
  原文: string;
  检索关键词?: string[];
  来源回合?: number[];
  回合: number;
  /** 写入时的结构化游戏时间（如「琥珀纪 2157.03.07 06:40」）。 */
  时间戳: string;
  /** 对齐参考项目：结构化游戏时间（YYYY:MM:DD:HH:MM 语义），旧条目缺省补「未知时间」。 */
  记录时间?: string;
  /** 阶段1新增：区分正文/通讯来源，旧条目默认'正文'（向前兼容） */
  分类?: 忆庭条目分类;
  /** 阶段1新增：仅分类='通讯'时存在，记录手机通讯来源信息 */
  通讯元数据?: 忆庭通讯元数据;
}

export interface 忆庭系统 {
  回忆档案: 回忆条目[];
}

/** 名称是否为【回忆N】格式 */
const 回忆名称正则 = /^【\s*回忆\s*\d+\s*】$/;

/** 对齐参考项目：按档案顺序重排名称为【回忆N】（幂等：已是连续【回忆N】则不动）。 */
function 重排回忆名称(entries: 回忆条目[]): 回忆条目[] {
  let renamed = false;
  const next = entries.map((entry, index) => {
    const target = `【回忆${String(index + 1).padStart(3, '0')}】`;
    const current = entry.名称?.trim() || '';
    if (回忆名称正则.test(current)) {
      const num = Number(current.match(/\d+/)?.[0]);
      if (num === index + 1) return entry;
    }
    renamed = true;
    return { ...entry, 名称: target };
  });
  return renamed ? next : entries;
}

export function 创建空忆庭系统(): 忆庭系统 {
  return {
    回忆档案: [],
  };
}

export function 归一化忆庭系统(input?: Partial<忆庭系统> | null): 忆庭系统 {
  const base = (input?.回忆档案 ?? []).map((entry) => ({
    ...entry,
    名称: entry.名称 ?? `【回忆${String(Math.max(1, entry.回合)).padStart(3, '0')}】`,
    类型: entry.类型 ?? (entry.摘要?.includes('长期') ? '长期压缩' : '短期压缩'),
    检索关键词: entry.检索关键词 ?? [],
    来源回合: entry.来源回合 ?? [entry.回合],
    记录时间: entry.记录时间 ?? entry.时间戳 ?? '未知时间',
    // 阶段1向前兼容：旧条目无分类字段时默认'正文'
    分类: entry.分类 ?? '正文',
  }));
  return {
    回忆档案: 重排回忆名称(base),
  };
}
