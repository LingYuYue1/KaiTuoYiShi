/**
 * Cline API documents model IDs but does not expose an OpenAI-compatible
 * `/models` endpoint. Keep the documented examples here as a convenience
 * catalog; users can still enter any model ID their Cline account supports.
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
