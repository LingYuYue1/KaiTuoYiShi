import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[turn-usage] ${message}`);
    process.exit(1);
  }
}

const chatModel = read('models/chat.ts');
const client = read('services/ai/chatCompletionClient.ts');
const textService = read('services/ai/text/index.ts');
const sendWorkflow = read('hooks/useGame/sendWorkflow.ts');
const turnItem = read('components/features/Chat/TurnItem.tsx');
const settings = read('models/settings.ts');
const gameSettings = read('components/features/Settings/GameSettings.tsx');

assert(chatModel.includes('tokenUsage?: 回合Token消耗'), 'chat message must persist per-turn token usage.');
assert(chatModel.includes('export interface 回合Token消耗'), 'chat model must define the turn token usage shape.');
assert(chatModel.includes('cachedTokens?: number') && chatModel.includes('uncachedTokens?: number'), 'turn token usage must keep cache hit and miss fields.');
assert(chatModel.includes("source: 'api' | 'estimate' | 'mixed'"), 'turn token usage must record whether data came from API, estimate, or mixed source.');
assert(chatModel.includes('usageFormat?: string') && chatModel.includes('cacheDiagnostic?: string'), 'turn token usage must persist cache diagnostics.');
assert(!chatModel.includes('promptOptimization'), 'turn token usage must not keep the removed prompt optimization field.');
assert(chatModel.includes('export interface 缓存前缀诊断') && chatModel.includes('cachePrefixDiagnostics?: 缓存前缀诊断'), 'chat debugContext must persist optional cache prefix diagnostics.');
assert(settings.includes('enableCacheDiagnostics: boolean') && settings.includes('enableCacheDiagnostics: false'), 'game settings must expose a disabled-by-default cache diagnostics toggle.');
assert(gameSettings.includes('缓存前缀诊断') && gameSettings.includes('enableCacheDiagnostics'), 'game settings UI must provide a standalone cache diagnostics toggle.');

assert(client.includes('onUsage?: (usage: ChatCompletionUsage) => void'), 'chat completion request must expose an onUsage callback.');
assert(client.includes('stream_options') && client.includes('include_usage'), 'OpenAI-compatible streaming requests must ask for usage when supported.');
assert(client.includes('function isStreamUsageOptionUnsupported'), 'unsupported include_usage errors must be detected for fallback retries.');
assert(client.includes('streamOpenAICompatible(config, messages, request, callbacks, false)'), 'OpenAI-compatible streams must retry without include_usage when unsupported.');
assert(client.includes('streamOpenCodeChat(config, messages, request, callbacks, false)'), 'OpenCode chat streams must retry without include_usage when unsupported.');
assert(client.includes('emitUsageFromResponse(parsed, config, request)'), 'streaming chunks must be inspected for usage payloads.');
assert(client.includes('emitUsageFromResponse(json,') && client.includes('response.json()'), 'non-streaming responses must be inspected for usage payloads.');
assert(client.includes('usage.promptTokens') && client.includes('usage.inputTokens'), 'camelCase input token aliases must be parsed.');
assert(client.includes('usage.completionTokens') && client.includes('usage.outputTokens'), 'camelCase output token aliases must be parsed.');
assert(client.includes('usage.totalTokens') && client.includes('usage.tokenCount'), 'camelCase total token aliases must be parsed.');
assert(client.includes('prompt_tokens_details?.cached_tokens'), 'OpenAI cached token field must be parsed.');
assert(client.includes('promptTokensDetails?.cachedTokens'), 'camelCase prompt token details cache fields must be parsed.');
assert(client.includes('input_token_details?.cache_read'), 'Anthropic-style cache read field must be parsed.');
assert(client.includes('cacheHitInputTokens') && client.includes('cachedInputTokens'), 'OpenAI-compatible cache hit aliases must be parsed.');
assert(client.includes('cachedContentTokenCount'), 'Gemini cached content token field must be parsed.');
assert(client.includes('cached_content_token_count'), 'snake_case Gemini cache aliases must be parsed.');
assert(client.includes('prompt_cache_hit_tokens') && client.includes('prompt_cache_miss_tokens'), 'DeepSeek/OpenAI-compatible cache hit and miss aliases must be parsed.');
assert(client.includes('promptCacheHitTokens') && client.includes('promptCacheMissTokens'), 'camelCase DeepSeek/OpenAI-compatible cache aliases must be parsed.');
assert(client.includes('function findUsagePayload') && client.includes('data.response_metadata?.usage'), 'nested usage payloads from compatible proxies must be detected.');
assert(client.includes('function mergeUsageCandidate') && client.includes('isUsageSiblingField(key, value)'), 'usage payload parsing must preserve cache fields that are siblings of a usage object.');
assert(client.includes('function selectBestUsagePayload') && client.includes('scoreUsagePayload'), 'usage payload parsing must prefer candidates that contain cache statistics.');
assert(client.includes("data.choices?.[0]?.usage") && client.includes("mergeUsageCandidate(data, undefined, 'top_level')"), 'usage payload parsing must inspect choices[0].usage and top-level proxy fields.');
assert(client.includes('prompt_cache_tokens') && client.includes('cache_tokens'), 'generic proxy cache token aliases must be parsed.');
assert(client.includes('cache_hit_rate') && client.includes('cacheHitRate'), 'cache hit rate aliases must be parsed even when token counts are absent.');
assert(client.includes('function normalizeGeminiBaseUrl') && client.includes("replace(/\\/openai(?:\\/chat\\/completions)?$/i, '')"), 'Gemini native requests must normalize OpenAI-compatible URL suffixes.');
assert(client.includes('cacheDiagnostic: buildCacheDiagnostic'), 'usage parser must persist a concrete cache diagnostic reason.');
assert(client.includes('explicitUncachedTokens ??') && client.includes('typeof normalizedInput === \'number\' && typeof cachedTokens === \'number\''), 'cache miss may only be derived from API token totals, not local estimates.');
assert(client.includes('/deepseek/i.test(config.model)'), 'DeepSeek stream usage should be requested when the model name reveals DeepSeek under an OpenAI-compatible provider.');
assert(client.includes('function isGeminiConfig') && client.includes('/gemini/i.test(config.model)'), 'Gemini model names must be able to request streaming usage under compatible providers.');

assert(textService.includes('usage?: ChatCompletionUsage'), 'text service result must return usage.');
assert(textService.includes('Object.fromEntries(Object.entries(nextUsage).filter'), 'streaming usage callbacks must merge partial usage fields without wiping prior values.');
assert(textService.includes('function mergeRawUsage') && textService.includes('collectRawUsageKeys'), 'streaming usage callbacks must merge raw usage objects for diagnostics.');
assert(textService.includes('function hasReturnedCacheStats') && textService.includes('previousHasCache'), 'streaming usage callbacks must not let later core-only usage overwrite cache diagnostics.');
assert(textService.includes('onUsage,'), 'text service must pass usage callbacks to the completion client.');

assert(sendWorkflow.includes('estimateTextTokens'), 'send workflow must keep a local token estimate fallback.');
assert(sendWorkflow.includes('function buildTurnTokenUsage'), 'send workflow must normalize API or estimated token usage for each turn.');
assert(sendWorkflow.includes("source: apiHasCoreUsage ? 'api' : apiHasAnyUsage ? 'mixed' : 'estimate'"), 'turn usage source must distinguish API, mixed, and estimate paths.');
assert(sendWorkflow.includes('uncachedTokens = typeof input.apiUsage?.uncachedTokens === \'number\''), 'send workflow must not infer cache miss from locally estimated input tokens.');
assert(sendWorkflow.includes('inputTokens: tokenUsage.inputTokens'), 'assistant message must preserve input token count.');
assert(sendWorkflow.includes('outputTokens: tokenUsage.outputTokens'), 'assistant message must preserve output token count.');
assert(sendWorkflow.includes('tokenUsage,'), 'assistant message must persist the detailed token usage object.');
assert(sendWorkflow.includes('rawUsage: input.apiUsage?.rawUsage'), 'raw API usage must be persisted for cache-field diagnostics.');
assert(sendWorkflow.includes('cacheDiagnostic: input.apiUsage?.cacheDiagnostic'), 'send workflow must persist cache diagnostics on the assistant turn.');
assert(sendWorkflow.includes('function buildCachePrefixDiagnostics') && sendWorkflow.includes('state.gameSettings.enableCacheDiagnostics === true'), 'send workflow must compute prefix cache diagnostics only when the setting is enabled.');

assert(turnItem.includes("type ToolKey = 'edit' | 'thinking' | 'usage'"), 'turn toolbar must use usage as a first-class tool panel.');
assert(turnItem.includes('label="响应详情"'), 'the old variable-record toolbar slot must be replaced by the response details entry.');
assert(!turnItem.includes('label="变量记录"'), 'the variable-record toolbar button must not come back.');
assert(turnItem.includes('<UsagePanel message={message}'), 'turn item must render the usage panel.');
assert(turnItem.includes('Tokens') && turnItem.includes('缓存'), 'usage panel must show token and cache sections.');
assert(!turnItem.includes('正文优化'), 'usage panel must not show the removed prompt optimization section.');
assert(turnItem.includes("typeof usage?.cacheHitRate === 'number'"), 'usage panel must treat cache hit rate as returned cache data.');
assert(turnItem.includes('Usage格式') && turnItem.includes('原始字段'), 'usage panel must show route-level diagnostics for missing cache fields.');
assert(turnItem.includes('未返回'), 'usage panel must say when cache fields were not returned by the API.');
assert(turnItem.includes('缓存命中不做本地猜测'), 'usage panel must explain that cache hits are not guessed locally.');
assert(turnItem.includes('buildCacheOptimizationHint') && turnItem.includes('DeepSeek 已返回缓存统计但命中为 0'), 'usage panel must explain DeepSeek zero cache hits as a prompt-prefix stability issue.');
assert(turnItem.includes('缓存优化：'), 'usage panel must expose cache optimization guidance when cache stats are returned.');
assert(turnItem.includes('前缀诊断') && turnItem.includes('公共前缀') && turnItem.includes('首次变化'), 'usage panel must show cache prefix diagnostics when enabled.');
assert(turnItem.includes('API 已返回 usage，但没有可识别的缓存统计字段'), 'usage panel must distinguish missing cache stats from missing token usage.');
assert(turnItem.includes('prompt_tokens / completion_tokens / total_tokens'), 'usage panel must tell users when only basic usage fields are present.');
assert(turnItem.includes('usageMetadata.cachedContentTokenCount'), 'usage panel must point Gemini users at the native cache usage field.');
assert(turnItem.includes('原始 usage 字段') && turnItem.includes('formatRawUsage'), 'usage panel must expose raw usage fields for cache diagnostics.');
assert(!turnItem.includes('function VariablesPanel'), 'the old variable panel implementation should not remain in TurnItem.');

console.log('[turn-usage] ok');
