// 分段时间线锚点解析（尽力而为）：把「时间线起点」里的绝对日期换算成游戏日序。
// 只认两种绝对格式：YYYY:MM:DD…（冒号分隔）与（含前缀的）YYYY.MM.DD；
// 「琥珀2157」这种年级精度、「未知:第N天」这类相对写法一律返回 undefined（调用方回退下一游戏日）。
// 与世界.当前日期做日差：dueAt = 当前游戏日 + max(0, 锚点序数 - 当前序数)，过去锚点视为今天到期。

/** 从文本里提取第一个绝对日期，返回 [年, 月, 日]，认不出返回 undefined。 */
export function 提取绝对日期(text: string): [number, number, number] | undefined {
  const source = text.trim();
  if (!source) return undefined;
  const colon = /(\d{3,4}):(\d{1,2}):(\d{1,2})/.exec(source);
  if (colon) {
    const year = Number(colon[1]);
    const month = Number(colon[2]);
    const day = Number(colon[3]);
    if (Number.isFinite(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return [year, month, day];
    }
    return undefined;
  }
  const dotted = /(\d{3,4})\.(\d{1,2})\.(\d{1,2})/.exec(source);
  if (dotted) {
    const year = Number(dotted[1]);
    const month = Number(dotted[2]);
    const day = Number(dotted[3]);
    if (Number.isFinite(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return [year, month, day];
    }
  }
  return undefined;
}

/**
 * 解析时间线锚点对应的游戏日序：锚点与当前日期都必须是绝对日期，否则 undefined。
 * 序数用 年*372+月*31+日 粗算（只用于日差，不做历法）。
 */
export function 解析时间线锚点日(锚点文本: string, 当前日期文本: string, 当前游戏日: number): number | undefined {
  const anchor = 提取绝对日期(锚点文本);
  const current = 提取绝对日期(当前日期文本);
  if (!anchor || !current) return undefined;
  const ordinal = ([year, month, day]: [number, number, number]) => year * 372 + month * 31 + day;
  const delta = ordinal(anchor) - ordinal(current);
  return Math.max(1, Math.trunc(当前游戏日) + Math.max(0, delta));
}
