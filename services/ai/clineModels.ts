/**
 * Cline API 文档列出可用模型 ID，但不提供 OpenAI 兼容的 `/models` 接口。
 * 这里保留文档示例作为便捷目录；用户仍可手填其账号支持的任意 `provider/model` ID。
 */
export const CLINE_RECOMMENDED_MODELS = [
  'cline-pass/glm-5.2',
  'cline-pass/kimi-k3',
  'cline-pass/kimi-k2.7-code',
  'cline-pass/kimi-k2.6',
  'cline-pass/deepseek-v4-pro',
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/mimo-v2.5-pro',
  'cline-pass/minimax-m3',
  'cline-pass/qwen3.8-max',
  'cline-pass/qwen3.7-max',
  'cline-pass/qwen3.7-plus',
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-chat',
  'minimax/minimax-m2.5',
] as const;
