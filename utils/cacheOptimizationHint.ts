export function 构建缓存优化提示(input: {
  provider?: string;
  model?: string;
  inputTokens: number;
  cachedTokens?: number;
  uncachedTokens?: number;
  cacheHitRate?: number;
  cacheKnown: boolean;
}): string {
  if (!input.cacheKnown) return '';
  const providerModel = `${input.provider ?? ''} ${input.model ?? ''}`;
  const isDeepSeek = /deepseek/i.test(providerModel);
  const hitRate = typeof input.cacheHitRate === 'number'
    ? input.cacheHitRate
    : typeof input.cachedTokens === 'number' && input.inputTokens > 0
      ? input.cachedTokens / input.inputTokens
      : undefined;
  if (isDeepSeek && (input.cachedTokens === 0 || hitRate === 0)) {
    return 'DeepSeek 已返回缓存统计但命中为 0，说明统计链路已通，当前请求前缀仍未复用成功。建议连续生成 2-3 个新回合观察；若仍为 0，优先检查 system prompt 前段是否仍有时间、场景、记忆、智库等动态内容提前抖动。';
  }
  if (isDeepSeek && typeof hitRate === 'number' && hitRate > 0 && hitRate < 0.25) {
    return 'DeepSeek 已命中部分缓存，但比例偏低。可继续把稳定规则、CoT 和固定世界观保持在请求最前段，把当前状态、记忆、智库与历史消息后置。';
  }
  if (isDeepSeek && typeof hitRate === 'number' && hitRate >= 0.25) {
    return 'DeepSeek 缓存已经开始命中，说明前缀重排有效。后续重点是保持开头规则稳定，避免把回合时间、当前场景或检索结果插回请求前部。';
  }
  return '';
}
