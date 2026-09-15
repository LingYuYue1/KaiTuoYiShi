import type { 聊天消息 } from '@/models/chat';
import { 格式化时间戳 } from '@/utils/format';
import { formatTokenCount } from '@/utils/tokenEstimate';

/** 本地诊断：只读本回合已保存的调试字段，仅开发者模式下展示，永不发送给主剧情模型。 */
export function 格式化本地诊断(message: 聊天消息): string {
  const debug = message.debugContext;
  const usage = message.tokenUsage;
  const inputTokens = usage?.inputTokens ?? message.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? message.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

  const 概览 = [
    '【回合概览】',
    `时间：${格式化时间戳(message.timestamp)}`,
    `回合：第 ${message.gameTime ?? '?'} 回合`,
    `耗时：${typeof message.responseDurationSec === 'number' && Number.isFinite(message.responseDurationSec) ? `${message.responseDurationSec.toFixed(1)} 秒` : '未记录'}`,
    `模型：${usage?.provider ?? '未记录'} / ${usage?.model ?? '未记录'}`,
    `Tokens：输入 ${formatTokenCount(inputTokens)} · 输出 ${formatTokenCount(outputTokens)} · 总计 ${formatTokenCount(totalTokens)}`,
    usage?.cacheHitRate !== undefined ? `缓存命中率：${(usage.cacheHitRate * 100).toFixed(1)}%` : '缓存命中率：未返回',
  ].join('\n');

  if (!debug) {
    return [概览, '【请求诊断】\n这条历史消息没有保存请求诊断。请从「开发者模式」开启后的新回合开始查看。'].join('\n\n');
  }

  const 协议 = [
    '【协议与模式】',
    `主剧情请求模式：${debug.mainRequestMode ?? '未知'}`,
    `主剧情模式：${debug.deepSeekMainMode ?? 'off'}`,
    debug.deepSeekMainOriginalModel && debug.deepSeekMainAdaptedModel
      ? `模型适配：${debug.deepSeekMainOriginalModel} → ${debug.deepSeekMainAdaptedModel}`
      : '模型适配：未触发',
    `跳过 CoT 伪装历史：${debug.deepSeekCotFakeHistorySkipped ? '是' : '否'}`,
    `Prefix 锁格式：${debug.deepSeekPrefixMode ? '是' : '否'}`,
    debug.stV2Attempted
      ? `酒馆 V2：尝试=是 · 采用=${debug.stV2Used ? '是' : '否'}${debug.stV2FallbackReason ? ` · 回退原因=${debug.stV2FallbackReason}` : ''}`
      : '酒馆 V2：未尝试',
    debug.deepSeekProtocolIssues?.length
      ? `协议校验失败项：\n${debug.deepSeekProtocolIssues.map((item) => `- ${item}`).join('\n')}`
      : '协议校验失败项：无',
    typeof debug.rerollSimilarity === 'number'
      ? `重roll 相似度：${Math.round(debug.rerollSimilarity * 100)}%${debug.rerollSimilarityRetried ? '（已自动换写）' : ''}`
      : '重roll：未触发',
  ].join('\n');

  const 召回 = [
    '【召回】',
    `忆庭：${debug.yitingRecallUsedModel ? `模型=${debug.yitingRecallUsedModel}` : '本地摘要'}`,
    `智库：${debug.zhikuRecallUsedModel ? `模型=${debug.zhikuRecallUsedModel}` : '本地规则'}`,
    debug.npcLedgerInjection
      ? `NPC 账本注入：${debug.npcLedgerInjection.selectedNames.length ? debug.npcLedgerInjection.selectedNames.join('、') : '无'}`
      : 'NPC 账本注入：未记录',
    debug.npcLedgerUpdate
      ? `NPC 账本更新：${debug.npcLedgerUpdate.updatedNames.length ? debug.npcLedgerUpdate.updatedNames.join('、') : '无'}`
      : 'NPC 账本更新：未记录',
  ].join('\n');

  const 缓存 = debug.cachePrefixDiagnostics
    ? [
        '【缓存前缀】',
        `公共前缀：${formatTokenCount(debug.cachePrefixDiagnostics.commonPrefixTokens)} / ${formatTokenCount(debug.cachePrefixDiagnostics.currentPromptTokens)} tokens（${(debug.cachePrefixDiagnostics.commonPrefixRate * 100).toFixed(1)}%）`,
        `首次变化：${debug.cachePrefixDiagnostics.firstDiffCurrentSection}`,
        `变化后估算：${formatTokenCount(debug.cachePrefixDiagnostics.changedTailTokens)} tokens`,
      ].join('\n')
    : '';

  return [概览, 协议, 召回, 缓存].filter(Boolean).join('\n\n====================\n\n');
}
