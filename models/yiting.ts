/** 忆庭条目分类：区分正文记忆与手机通讯记忆。旧条目无此字段时按'正文'处理。 */
export type 忆庭条目分类 = '正文' | '通讯';

/** 通讯元数据：仅分类='通讯'时存在，记录手机通讯的来源信息。 */
export interface 忆庭通讯元数据 {
  /** 对方 NPC id（私聊）或主联系人 id（群聊） */
  联系人: string;
  群聊?: boolean;
  /** 群聊参与人（群聊时填写） */
  参与人?: string[];
}

export interface 回忆条目 {
  id: string;
  名称?: string;
  类型?: '短期压缩' | '中期压缩' | '长期压缩' | '精炼纪要';
  摘要: string;
  原文: string;
  检索关键词?: string[];
  来源回合?: number[];
  回合: number;
  时间戳: string;
  /** 区分正文/通讯来源；旧条目无此字段时按'正文'处理 */
  分类?: 忆庭条目分类;
  /** 仅分类='通讯'时存在 */
  通讯元数据?: 忆庭通讯元数据;
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
      类型: entry.类型 ?? (entry.摘要.includes('长期') ? '长期压缩' : '短期压缩'),
      检索关键词: entry.检索关键词 ?? [],
       来源回合: entry.来源回合 ?? [entry.回合],
      // 向前兼容：旧条目无分类字段时默认'正文'
      分类: entry.分类 ?? '正文',
    })),
  };
}
