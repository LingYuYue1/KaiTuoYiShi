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

/** 变量命令应用结果，包含成功失败信息，便于在抽屉里展示给玩家调试。 */
export interface 变量命令结果 {
  command: 变量命令;
  ok: boolean;
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
