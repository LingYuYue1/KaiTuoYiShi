/** 毫秒时间戳（Date.now() 契约）→ zh-CN 完整展示（含秒、24 小时制）。
 *  统一契约：消息时间、存档时间、保存组时间共用同一格式。缺失显示「未记录」（StorageManager
 *  旧实现 `timestamp || Date.now()` 会把缺失时间显示成当前时间，属误导，已修正）。 */
export function 格式化时间戳(timestamp: number): string {
  if (!timestamp) return '未记录';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** ISO 字符串 → 系统 locale 展示（错误报告原始文本场景，有意保留无 locale/无选项行为）；非法值原样透传。 */
export function 格式化ISO时间(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString();
}

/** 二进制字节精确格式（MiB/KiB/B，云备份体积，保留小数一位）。 */
export function 格式化二进制字节(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

/** 存档体积展示格式（KB 取整、MB 一位小数、空值显示「0 KB」）。与 格式化二进制字节 是两种显示契约，拒绝 flag 合一。 */
export function 格式化存档体积(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
