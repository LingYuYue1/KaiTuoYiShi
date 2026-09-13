export const UNIFIED_ID_DB_VERSION = 10;

export function createUnifiedId(): string {
  const timestamp = Math.floor(Date.now() / 10).toString(16).padStart(10, '0');
  const timestampPrefix = timestamp.slice(0, 4);
  const timestampSuffix = timestamp.slice(4);
  const version = UNIFIED_ID_DB_VERSION.toString(16).padStart(3, '0');
  // 背靠背创建的 id 必然落进同一个 10ms 窗口：1 个随机 nibble 碰撞率 1/16，
  // 存档树父子 nodeId 一旦相同，采纳 / 映射全部错乱。4 个 nibble（1/65536）。
  // 时间戳前缀保留，id 仍按创建时间可排序；消费方一律按不透明字符串比较。
  const random = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
  return `${timestampPrefix}-${timestampSuffix}-${version}${random}`;
}
