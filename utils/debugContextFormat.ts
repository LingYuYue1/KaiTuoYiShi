import type { 聊天消息 } from '@/models/chat';
import { formatTokenCount } from '@/utils/tokenEstimate';

export function 格式化请求上下文(message: 聊天消息): string {
  const debug = message.debugContext;
  if (!debug) return '这条历史消息没有保存请求上下文。请从新增按钮后的新回合开始查看。';
  const yitingRaw = [
    '【忆庭模型原始返回】',
    debug.yitingRecallUsedModel
      ? (debug.yitingRecallRawText?.trim() || '（忆庭模型已调用，但没有保存到原始返回文本。）')
      : '（本回合未调用忆庭模型，使用本地摘要检索，或未到忆庭召回触发回合。）',
  ].join('\n');
  const zhikuRaw = [
    '【智库模型原始返回】',
    debug.zhikuRecallUsedModel
      ? (debug.zhikuRecallRawText?.trim() || '（智库模型已调用，但没有保存到原始返回文本。）')
      : '（本回合未调用智库模型，使用本地规则召回；本地规则不会执行 Step0~Step8 模型思维链。）',
  ].join('\n');
  const recall = debug.recallPreview?.trim()
    ? ['【回忆、剧情编织与智库预览】', debug.recallPreview.trim()].join('\n')
    : '【回忆、剧情编织与智库预览】\n（无或未命中）';
  const deepSeekDiagnostics = [
    '【DeepSeek 主剧情诊断】',
    `主剧情请求模式：${debug.mainRequestMode ?? '未知'}`,
    `模式：${debug.deepSeekMainMode ?? 'off'}`,
    debug.deepSeekMainOriginalModel && debug.deepSeekMainAdaptedModel
      ? `主剧情模型适配：${debug.deepSeekMainOriginalModel} → ${debug.deepSeekMainAdaptedModel}`
      : '主剧情模型适配：未触发',
    `跳过 CoT 伪装历史：${debug.deepSeekCotFakeHistorySkipped ? '是' : '否'}`,
    `Prefix 锁格式：${debug.deepSeekPrefixMode ? '是' : '否'}`,
    debug.deepSeekProtocolIssues?.length
      ? `协议校验失败项：${debug.deepSeekProtocolIssues.join('；')}`
      : '协议校验失败项：无',
    typeof debug.rerollSimilarity === 'number'
      ? `重roll相似度：${Math.round(debug.rerollSimilarity * 100)}%`
      : '重roll相似度：未触发',
    `重roll自动换写：${debug.rerollSimilarityRetried ? '是' : '否'}`,
  ].join('\n');
  const cachePrefixDiagnostics = debug.cachePrefixDiagnostics
    ? [
        '【缓存前缀诊断】',
        `公共前缀：${formatTokenCount(debug.cachePrefixDiagnostics.commonPrefixTokens)} / ${formatTokenCount(debug.cachePrefixDiagnostics.currentPromptTokens)} tokens（${(debug.cachePrefixDiagnostics.commonPrefixRate * 100).toFixed(1)}%）`,
        `首次变化（本回合）：${debug.cachePrefixDiagnostics.firstDiffCurrentSection}`,
        debug.cachePrefixDiagnostics.firstDiffPreviousSection
          ? `首次变化（上一回合）：${debug.cachePrefixDiagnostics.firstDiffPreviousSection}`
          : '',
        `变化后估算：${formatTokenCount(debug.cachePrefixDiagnostics.changedTailTokens)} tokens`,
        debug.cachePrefixDiagnostics.largestChangedSections.length
          ? `变化后大块：${debug.cachePrefixDiagnostics.largestChangedSections.map((item) => `${item.label}≈${formatTokenCount(item.tokens)}`).join('；')}`
          : '',
        `本回合变化片段：${debug.cachePrefixDiagnostics.firstDiffCurrentExcerpt}`,
        debug.cachePrefixDiagnostics.firstDiffPreviousExcerpt
          ? `上一回合变化片段：${debug.cachePrefixDiagnostics.firstDiffPreviousExcerpt}`
          : '',
      ].filter(Boolean).join('\n')
    : '';
  const npcLedger = debug.npcLedgerInjection
    ? [
        '【NPC账本注入诊断】',
        `已注入：${debug.npcLedgerInjection.selectedNames.length ? debug.npcLedgerInjection.selectedNames.join('、') : '无'}`,
        debug.npcLedgerInjection.injected.length
          ? debug.npcLedgerInjection.injected.map((item) => [
              `- ${item.name}`,
              `  原因：${item.reason.join('；') || '相关'}`,
              `  字段：${item.fields.join('；') || '无账本字段，仅旧档案兜底'}`,
              `  标记：最近互动=${item.hasRecentInteraction ? '是' : '否'}；必须记得=${item.hasMustRemember ? '是' : '否'}；未完成事项=${item.hasUnresolvedItems ? '是' : '否'}`,
            ].join('\n')).join('\n')
          : '',
        debug.npcLedgerInjection.skippedNames.length
          ? `未注入示例：\n${debug.npcLedgerInjection.skippedNames.slice(0, 8).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n')
    : '【NPC账本注入诊断】\n（本回合没有保存 NPC 账本诊断；请从本功能更新后的新回合开始查看。）';
  const npcLedgerUpdate = debug.npcLedgerUpdate
    ? [
        '【NPC账本更新诊断】',
        `更新 NPC：${debug.npcLedgerUpdate.updatedNames.length ? debug.npcLedgerUpdate.updatedNames.join('、') : '无'}`,
        debug.npcLedgerUpdate.memoryAppended.length
          ? `追加同行记忆：\n${debug.npcLedgerUpdate.memoryAppended.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
          : '追加同行记忆：无',
        debug.npcLedgerUpdate.ledgerFieldsUpdated.length
          ? `账本字段：\n${debug.npcLedgerUpdate.ledgerFieldsUpdated.slice(0, 12).map((item) => `- ${item}`).join('\n')}`
          : '账本字段：无',
        debug.npcLedgerUpdate.summaryTriggered.length
          ? `触发总结记忆压缩：${debug.npcLedgerUpdate.summaryTriggered.join('、')}`
          : '',
        debug.npcLedgerUpdate.warnings.length
          ? `警告：\n${debug.npcLedgerUpdate.warnings.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n')
    : '【NPC账本更新诊断】\n（本回合尚未保存 NPC 账本更新诊断；变量模型未运行、未命中 NPC，或这是旧回合。）';
  const system = ['【System Prompt】', debug.systemPrompt || '（空）'].join('\n');
  const messages = [
    '【Messages】',
    ...debug.messages.map((msg, index) => [
      `## ${index + 1}. ${msg.role}`,
      msg.content || '（空）',
    ].join('\n')),
  ].join('\n\n---\n\n');
  return [deepSeekDiagnostics, cachePrefixDiagnostics, yitingRaw, zhikuRaw, npcLedger, npcLedgerUpdate, recall, system, messages]
    .filter(Boolean)
    .join('\n\n====================\n\n');
}
