// 酒馆预设宏检测：识别 Tavern 风格的 {{macro}} 模板，用于预设导入后的结构扫描。
const ADVANCED_MACRO_RE = /\{\{\s*(?:setvar|setglobalvar|getvar|getglobalvar|if\b|else|\/if|random|pick|pick_var|roll:|[.$][^}]+|bias::|trim::|lower::|upper::)/gi;
const BASIC_MACRO_RE = /\{\{\s*(?:char|user|time|date|datetime|model|messageCount|turnCount|lastMessage|lastUserMessage|lastCharMessage|newline|noop)\s*\}\}/gi;

export type TavernMacroLevel = 'none' | 'basic' | 'advanced';

export function detectTavernMacroInfo(content: string): { level: TavernMacroLevel; macros: string[] } {
  const advanced = content.match(ADVANCED_MACRO_RE) ?? [];
  if (advanced.length > 0) return { level: 'advanced', macros: Array.from(new Set(advanced)).slice(0, 8) };
  const basic = content.match(BASIC_MACRO_RE) ?? [];
  if (basic.length > 0) return { level: 'basic', macros: Array.from(new Set(basic)).slice(0, 8) };
  return { level: 'none', macros: [] };
}
