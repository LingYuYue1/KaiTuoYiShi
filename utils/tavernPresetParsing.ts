// 酒馆预设原始结构读取：Tavern 导出的 world_info / regex_scripts 字段形状不固定，
// 这些纯函数负责把 unknown 输入安全收敛为可展示的字符串 / 条目列表。

export function getPresetWorldInfoEntries(worldInfo: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(worldInfo)) return worldInfo.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (worldInfo && typeof worldInfo === 'object') {
    return Object.values(worldInfo).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }
  return [];
}

export function getPresetWorldInfoViewEntries(worldInfo: unknown): Array<{ key: string; entry: Record<string, unknown> }> {
  if (Array.isArray(worldInfo)) {
    return worldInfo
      .map((entry, index) => ({ key: String(index), entry: entry as Record<string, unknown> }))
      .filter((item): item is { key: string; entry: Record<string, unknown> } => Boolean(item.entry) && typeof item.entry === 'object');
  }
  if (worldInfo && typeof worldInfo === 'object') {
    return Object.entries(worldInfo)
      .map(([key, entry]) => ({ key, entry: entry as Record<string, unknown> }))
      .filter((item): item is { key: string; entry: Record<string, unknown> } => Boolean(item.entry) && typeof item.entry === 'object');
  }
  return [];
}

export function readPresetWorldInfoText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' ? serialized : '';
}

export function readPresetWorldInfoKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readPresetWorldInfoText(item).trim()).filter(Boolean)
    : [];
}

export function getPresetWorldInfoTitle(entry: Record<string, unknown>, index: number): string {
  return readPresetWorldInfoText(entry.comment) || readPresetWorldInfoText(entry.title) || `world_info_${readPresetWorldInfoText(entry.uid) || index + 1}`;
}

export function isPresetWorldInfoEnabled(entry: Record<string, unknown>): boolean {
  return entry.enabled !== false && entry.disable !== true && entry.disabled !== true;
}

export function isPresetWorldInfoConstant(entry: Record<string, unknown>): boolean {
  return entry.constant === true || entry.constant === 1 || entry.constant === 'true';
}

export const DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE = `<正文>
星在匹诺康尼的走廊停下脚步，望向梦境酒店尽头的光。
</正文>
<行动选项>
1. 继续调查梦境酒店
2. 询问同伴的看法
</行动选项>`;

export function readPresetRegexText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' ? serialized : '';
}

export function getPresetRegexTitle(script: Record<string, unknown>, index: number): string {
  return (
    readPresetRegexText(script.script_name).trim() ||
    readPresetRegexText(script.scriptName).trim() ||
    readPresetRegexText(script.name).trim() ||
    readPresetRegexText(script.id).trim() ||
    `regex_script_${index + 1}`
  );
}

export function getPresetRegexFindText(script: Record<string, unknown>): string {
  return readPresetRegexText(script.find_regex) || readPresetRegexText(script.findRegex) || readPresetRegexText(script.find);
}

export function getPresetRegexReplaceText(script: Record<string, unknown>): string {
  return readPresetRegexText(script.replace_string) || readPresetRegexText(script.replaceString) || readPresetRegexText(script.replace);
}

/** 正则脚本安全类型的 kind 联合字面量：与门面 analyze 动作返回值结构一致（不直取内部模块类型）。 */
export type PresetRegexKind = 'prompt_preprocess' | 'output_postprocess' | 'display_replace' | 'blocked';

export function getPresetRegexKindLabel(kind: PresetRegexKind): string {
  if (kind === 'prompt_preprocess') return '提示词预处理';
  if (kind === 'output_postprocess') return '输出后处理';
  if (kind === 'display_replace') return '显示层替换';
  return '阻断';
}
