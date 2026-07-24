// 变量执行上下文（确定性改造片 3 A2）
// 默认实现保持与旧 Date.now/Math.random 行为完全一致；
// 测试/校验时注入固定序列即可获得确定性结果。

export interface VariableExecContext {
  /** 当前时间戳。默认: Date.now() */
  now(): number;
  /** 生成长度为 len 的随机字符串（36 进制）。默认: Math.random().toString(36).slice(2, 2+len) */
  randomString(len: number): string;
}

export const DEFAULT_EXEC_CTX: VariableExecContext = {
  now: () => Date.now(),
  randomString: (len) => Math.random().toString(36).slice(2, 2 + len),
};
