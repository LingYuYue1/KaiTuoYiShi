export interface 记忆系统 {
  即时记忆: string[];
  短期记忆: string[];
  /** 长期记忆：由 10 条短期再压缩。 */
  长期记忆: string[];
}

export function 创建空记忆系统(): 记忆系统 {
  return {
    即时记忆: [],
    短期记忆: [],
    长期记忆: [],
  };
}
