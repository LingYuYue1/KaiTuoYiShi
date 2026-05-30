// 变量命令协议：AI 通过 <变量更新>...</变量更新> 块输出一组命令，由系统解析后修改 state。
// 设计参考：墨色项目 TavernCommand（添加 sub 动作，去除 add 的「数值相加」歧义）。

export type 变量命令动作 = 'set' | 'add' | 'sub' | 'push' | 'delete';

export interface 变量命令 {
  /** 动作：
   * - set: 用 value 覆盖目标路径（对象用深合并）
   * - add: 数字相加（非数字按 0 处理）
   * - sub: 数字相减
   * - push: 把 value 推入数组末尾（目标非数组时初始化为 []）
   * - delete: 删除目标字段或数组元素 */
  action: 变量命令动作;
  /** 变量路径,如 "世界.当前地点" / "NPC[2].好感度"
   *  根路径必须是 VARIABLE_ROOT_KEYS 中的一个 */
  key: string;
  /** JSON 值。delete 时忽略 */
  value: unknown;
}

export type 变量事实类型 =
  | 'traveler_profile'
  | 'time'
  | 'location'
  | 'npc'
  | 'item'
  | 'world_event'
  | 'phone_seed'
  | 'nsfw_archive';

export interface 旅人档案变量事实 {
  type: 'traveler_profile';
  identity?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  abilityAdd?: string[];
  knowledgeAdd?: string[];
  evidence?: string;
}

export interface 时间变量事实 {
  type: 'time';
  /** no_change 表示明确不推进；elapsed 表示推进若干分钟；set_time 表示同日设定目标时刻；overnight / next_day 表示跨日。 */
  mode: 'no_change' | 'elapsed' | 'set_time' | 'overnight' | 'next_day';
  minutes?: number;
  targetTime?: string;
  evidence?: string;
}

export interface 地点变量事实 {
  type: 'location';
  location: string;
  evidence?: string;
}

export interface NPC变量事实 {
  type: 'npc';
  id?: string;
  name: string;
  alias?: string;
  tier?: 'companion' | 'extra';
  affinityDelta?: number;
  affinitySet?: number;
  relation?: string;
  following?: boolean;
  appearance?: string;
  clothing?: string;
  speechStyle?: string;
  personality?: string;
  intro?: string;
  playerAddress?: string;
  memory?: string;
  evidence?: string;
}

export interface 物品变量事实 {
  type: 'item';
  action: 'gain';
  category: 'food' | 'consumable' | 'lightcone' | 'weapon' | 'clothing' | 'accessory' | 'memento' | 'key';
  name: string;
  description?: string;
  quantity?: number;
  quality?: '蓝' | '紫' | '金';
  stackable?: boolean;
  source?: '剧情掉落' | '任务奖励' | '商店' | '打造' | '其它';
  sourceDescription?: string;
  narrativeEffects?: string[];
  evidence?: string;
}

export interface 世界事件变量事实 {
  type: 'world_event';
  text: string;
  evidence?: string;
}

export interface 手机来信变量事实 {
  type: 'phone_seed';
  targetType?: 'private' | 'group';
  targetId?: string;
  targetName?: string;
  title: string;
  context: string;
  triggerType?: 'injury' | 'victory' | 'defeat' | 'location_change' | 'important_item' | 'relationship' | 'news' | 'quest' | 'time' | 'custom';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  relatedNpcIds?: string[];
  evidence?: string;
}

export interface NSFW档案变量事实 {
  type: 'nsfw_archive';
  npcId?: string;
  npcName: string;
  enabled?: boolean;
  ageConfirm?: 'adult' | 'unknown' | 'minor_blocked';
  intimacyStage?: string;
  boundaries?: string;
  preferences?: string[];
  sensitivePoints?: string[];
  taboos?: string[];
  femaleBodyArchive?: {
    胸部?: string;
    女性私处?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  maleBodyArchive?: {
    男性器?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  experiences?: string[];
  longTermFacts?: string[];
  tags?: string[];
  notes?: string;
  evidence?: string;
}

export type 变量事实 =
  | 旅人档案变量事实
  | 时间变量事实
  | 地点变量事实
  | NPC变量事实
  | 物品变量事实
  | 世界事件变量事实
  | 手机来信变量事实
  | NSFW档案变量事实;

export interface 变量事实批次 {
  facts: 变量事实[];
  parseErrors: string[];
}

/** 变量命令应用结果，包含成功失败信息，便于在抽屉里展示给玩家调试。 */
export interface 变量命令结果 {
  command: 变量命令;
  ok: boolean;
  kind?: 'command' | 'warning' | 'error' | 'rejected';
  /** 失败原因：路径未登记 / 类型不匹配 / 解析错误等 */
  reason?: string;
}

/** 一回合的变量命令批次（一次 AI 调用产出的所有命令 + 结果），存入命令历史。 */
export interface 变量命令批次 {
  id: string;
  turn: number;
  timestamp: number;
  /** 触发来源：'main' 主模型直接输出，'calibration' 变量模型二次校准 */
  source: 'main' | 'calibration';
  /** 是否调用了变量模型（false = 主模型直接出，true = 走了二次校准） */
  modelName?: string;
  results: 变量命令结果[];
  /** 变量模型的额外报告（可选，用于调试展示） */
  report?: string;
  /** 变量模型返回的原始文本，供「查看原始信息」面板展示。失败回执时为空。 */
  rawText?: string;
}
