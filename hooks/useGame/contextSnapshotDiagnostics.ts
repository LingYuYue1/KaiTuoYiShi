import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 聊天消息 } from '@/models/chat';
import { formatNpcLedgerForPrompt, type NPC账本选择结果 } from '@/models/npc';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { buildStoryPlanningAnalysis } from '@/services/storyPlanningAnalysis';
import { buildNpcRelationshipPlanning } from '@/services/npcRelationshipPlanning';

export function sectionTitle(content: string, fallback: string): string {
  const first = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first?.replace(/^#+\s*/, '').slice(0, 36) || fallback;
}

export function splitPromptSections(systemPrompt: string): Array<{ title: string; content: string }> {
  return systemPrompt
    .split(/\n\n---\n\n/g)
    .map((content, index) => ({
      title: sectionTitle(content, `系统提示词 ${index + 1}`),
      content: content.trim(),
    }))
    .filter((item) => item.content);
}

export function categoryForPromptSection(title: string): string {
  if (title.startsWith('提示词｜')) return '提示词';
  if (title.startsWith('世界书｜')) return '世界书';
  if (title.includes('记忆') || title.includes('忆庭')) return '记忆';
  if (title.includes('智库')) return '智库';
  if (title.includes('星际和平周报') || title.includes('新闻')) return '新闻';
  if (title.includes('手机')) return '手机';
  if (title.includes('剧情编织')) return '剧情';
  if (title.includes('思维链')) return '思维链';
  return '系统';
}

export function formatMainRequestOrderOverview(
  systemPromptSections: Array<{ title: string; content: string }>,
  apiMessages: 聊天消息[],
  tavernStatus?: {
    attempted: boolean;
    used: boolean;
    presetName?: string;
    reason?: string;
  },
): string {
  const lines: string[] = [
    '# 主剧情真实请求顺序总览',
    '',
    '本区块是本地诊断，不会发送给模型；下面列出的 System Prompt 分段与 API messages 才是本轮真实请求顺序。',
    '',
    '## System Prompt 分段',
  ];
  if (systemPromptSections.length) {
    systemPromptSections.forEach((section, index) => {
      lines.push(`${index + 1}. ${section.title}｜约 ${estimateTextTokens(section.content)} tokens`);
    });
  } else {
    lines.push('- 无 System Prompt 分段。');
  }

  lines.push('', '## API Messages');
  if (apiMessages.length) {
    apiMessages.forEach((message, index) => {
      const preview = message.content.replace(/\s+/g, ' ').trim().slice(0, 90);
      lines.push(`${index + 1}. role=${message.role}｜约 ${estimateTextTokens(message.content)} tokens｜${preview || '（空）'}`);
    });
  } else {
    lines.push('- 无 API messages。');
  }

  if (tavernStatus) {
    lines.push(
      '',
      '## 酒馆预设状态',
      `- 预设：${tavernStatus.presetName || '未选择'}`,
      `- 尝试酒馆消息链：${tavernStatus.attempted ? '是' : '否'}`,
      `- 当前快照已使用酒馆 messages：${tavernStatus.used ? '是' : '否'}`,
      tavernStatus.reason ? `- 说明：${tavernStatus.reason}` : '',
    );
  }

  return lines.filter(Boolean).join('\n');
}

export function formatStoryWeavingProgressSnapshot(state: UseGameStateReturn): string {
  const story = state.剧情编织;
  const progress = story.当前进度;
  const diagnostics = getStoryWeavingInjectionDiagnostics(story);
  const series = story.系列列表.find((item) => item.id === (progress?.当前系列ID || story.当前系列ID))
    ?? story.系列列表.find((item) => item.激活注入)
    ?? story.系列列表.at(0);
  const current = series?.分段列表.find((segment) => segment.id === progress?.当前分段ID)
    ?? series?.分段列表.find((segment) => segment.组号 === progress?.当前分段组号)
    ?? series?.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series?.分段列表.find((segment) => segment.运行状态 === '当前');
  if (!series || !current) return '当前没有可用的剧情编织进度锚点。';
  return [
    '# 剧情编织进度快照',
    '',
    `系列：${series.标题}`,
    `当前分段：第 ${current.组号} 段「${current.标题}」`,
    `运行状态：${current.运行状态}`,
    `推进状态：${progress?.推进状态 ?? '未记录'}`,
    diagnostics ? `注入健康：${diagnostics.健康状态}` : '',
    diagnostics ? `实际注入当前段：第 ${diagnostics.当前分段组号} 段「${diagnostics.当前分段标题}」｜${diagnostics.当前分段运行状态}` : '',
    diagnostics?.归档锚点标题 ? `已跳过归档锚点：第 ${diagnostics.归档锚点组号} 段「${diagnostics.归档锚点标题}」` : '',
    diagnostics?.检查项.length ? `注入检查：\n${diagnostics.检查项.map((item) => `- ${item}`).join('\n')}` : '',
    `最近判定回合：${progress?.最近一次推进判定回合 ?? '未记录'}`,
    progress?.最近门禁结果 ? `最近门禁结果：${progress.最近门禁结果}` : '',
    progress?.已完成摘要.length ? `已完成摘要：\n${progress.已完成摘要.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.当前待解问题.length ? `当前待解问题：\n${progress.当前待解问题.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.最近判定理由.length ? `最近判定理由：\n${progress.最近判定理由.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.历史归档.length ? `历史归档：\n${progress.历史归档.slice(-8).map((item) => {
      const roleProgress = item.角色推进摘要?.length ? `｜角色推进：${item.角色推进摘要.slice(0, 3).join('；')}` : '';
      return `- 第${item.分段组号}段「${item.分段标题}」｜${item.归档状态}${item.归档回合 ? `｜回合${item.归档回合}` : ''}：${item.摘要}${roleProgress}`;
    }).join('\n')}` : '',
    current.本段结束状态.length ? `本段结束状态：\n${current.本段结束状态.slice(0, 6).map((item) => `- ${item}`).join('\n')}` : '',
    current.给后续参考.length ? `给后续参考：\n${current.给后续参考.slice(0, 6).map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function formatStoryWeavingGateSnapshot(state: UseGameStateReturn, ctx: {
  recentUserInput: string;
  recentAIResponse?: string;
  currentLocation?: string;
  openingRegionName?: string;
  openingChapterName?: string;
  openingEntryText?: string;
  openingSource?: import('@/models/journey').开局来源;
  openingArchiveText?: string;
}): string {
  const gate = evaluateStoryWeavingGate(state.剧情编织, {
    recentUserInput: ctx.recentUserInput,
    recentAIResponse: ctx.recentAIResponse ?? '',
    currentLocation: ctx.currentLocation ?? '',
    openingRegionName: ctx.openingRegionName,
    openingChapterName: ctx.openingChapterName,
    openingEntryText: ctx.openingEntryText,
    openingSource: ctx.openingSource,
    openingArchiveText: ctx.openingArchiveText,
  });
  const diagnostics = getStoryWeavingInjectionDiagnostics(state.剧情编织);
  if (!gate) return '当前没有可评估的剧情编织门禁。';
  return [
    '# 剧情编织门禁预览',
    '',
    `系列ID：${gate.系列ID ?? '未知'}`,
    `分段：第 ${gate.分段组号 ?? '?'} 段`,
    `门禁结果：${gate.mode}`,
    diagnostics ? `注入健康：${diagnostics.健康状态}` : '',
    diagnostics ? `实际注入当前段：第 ${diagnostics.当前分段组号} 段「${diagnostics.当前分段标题}」｜${diagnostics.当前分段运行状态}` : '',
    diagnostics?.归档锚点标题 ? `已跳过归档锚点：第 ${diagnostics.归档锚点组号} 段「${diagnostics.归档锚点标题}」` : '',
    diagnostics?.前一分段标题 ? `历史承接段：${diagnostics.前一分段标题}` : '',
    diagnostics?.下一分段标题 ? `下一段预热：${diagnostics.下一分段标题}` : '',
    diagnostics?.检查项.length ? `注入检查：\n${diagnostics.检查项.map((item) => `- ${item}`).join('\n')}` : '',
    gate.reasons.length ? `命中理由：\n${gate.reasons.map((item) => `- ${item}`).join('\n')}` : '命中理由：无，默认软参考',
  ].filter(Boolean).join('\n');
}

export function formatStoryPlanningAnalysisSnapshot(state: UseGameStateReturn): string {
  const analysis = buildStoryPlanningAnalysis(state.剧情编织);
  if (!analysis) return '当前没有可用的剧情规划分析。';
  return [
    '# 剧情规划分析快照',
    '',
    `系列：${analysis.系列标题}`,
    `当前分段：第 ${analysis.当前分段组号} 段「${analysis.当前分段标题}」`,
    `推进状态：${analysis.推进状态}`,
    `门禁结果：${analysis.门禁结果}`,
    `建议动作：${analysis.建议动作}`,
    `偏离风险：${analysis.偏离风险}`,
    analysis.分析理由.length ? `分析理由：\n${analysis.分析理由.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.关注事项.length ? `关注事项：\n${analysis.关注事项.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.切段条件.length ? `切段条件：\n${analysis.切段条件.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.待迁移事项.length ? `待迁移事项：\n${analysis.待迁移事项.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.下一步调度.length ? `下一步调度：\n${analysis.下一步调度.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.归档检查.length ? `归档检查：\n${analysis.归档检查.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.历史摘要.length ? `历史摘要：\n${analysis.历史摘要.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function formatNpcRelationshipPlanningSnapshot(state: UseGameStateReturn): string {
  const analysis = buildNpcRelationshipPlanning(state.NPC, state.turnCount);
  return [
    '# NPC 关系规划分析',
    '',
    analysis.总览,
    '',
    ...analysis.条目.slice(0, 8).map((item, index) => [
      `${index + 1}. ${item.姓名}｜${item.关系}｜好感 ${item.好感度}｜${item.同行 ? '同行' : '未同行'}`,
      `优先级：${item.优先级}`,
      `建议动作：${item.建议动作}`,
      item.理由.length ? `理由：${item.理由.join('；')}` : '',
      item.关注点.length ? `关注点：${item.关注点.join('；')}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n\n');
}

export function formatNpcLedgerSelectionSnapshot(selection: NPC账本选择结果): string {
  return [
    '# 本回合 NPC 账本预期注入',
    '',
    selection.selected.length
      ? selection.selected.map(formatNpcLedgerForPrompt).join('\n\n')
      : '（本回合没有 NPC 账本进入强制承接区。）',
    selection.skipped.length
      ? `\n未注入示例：\n${selection.skipped.slice(0, 10).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

export function latestAssistantZhikuDebugRecall(history: 聊天消息[]): string {
  const latest = [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && (
      msg.debugContext?.zhikuRecallPreview?.trim() ||
      msg.debugContext?.zhikuRecallRawText?.trim() ||
      msg.debugContext?.zhikuRecallUsedModel !== undefined
    ));
  const debug = latest?.debugContext;
  if (!debug) return '';
  return [
    debug.zhikuRecallUsedModel
      ? `智库模型原始返回：\n${debug.zhikuRecallRawText?.trim() || '（智库模型已调用，但没有保存到原始返回文本。）'}`
      : '智库模型原始返回：\n（本回合未调用智库模型，使用本地规则召回；本地规则不会执行 Step0~Step8 模型思维链。）',
    '',
    debug.zhikuRecallPreview?.trim() || '智库召回诊断：无',
  ].join('\n').trim();
}

export function latestAssistantNpcLedgerDebug(history: 聊天消息[]): string {
  const latest = [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && (msg.debugContext?.npcLedgerInjection || msg.debugContext?.npcLedgerUpdate));
  const injection = latest?.debugContext?.npcLedgerInjection;
  const update = latest?.debugContext?.npcLedgerUpdate;
  if (!injection && !update) return '';
  return [
    injection ? '【NPC账本注入诊断】' : '',
    injection ? `已注入：${injection.selectedNames.length ? injection.selectedNames.join('、') : '无'}` : '',
    injection?.injected.length
      ? `注入详情：\n${injection.injected.map((item) => [
          `- ${item.name}`,
          `  原因：${item.reason.join('；') || '相关'}`,
          `  字段：${item.fields.join('；') || '无账本字段，仅旧档案兜底'}`,
          `  标记：最近互动=${item.hasRecentInteraction ? '是' : '否'}；必须记得=${item.hasMustRemember ? '是' : '否'}；未完成事项=${item.hasUnresolvedItems ? '是' : '否'}`,
        ].join('\n')).join('\n')}`
      : '',
    injection?.skippedNames.length
      ? `未注入示例：\n${injection.skippedNames.slice(0, 8).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
      : '',
    update ? '【NPC账本更新诊断】' : '',
    update ? `更新 NPC：${update.updatedNames.length ? update.updatedNames.join('、') : '无'}` : '',
    update?.memoryAppended.length
      ? `追加同行记忆：\n${update.memoryAppended.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
      : '',
    update?.ledgerFieldsUpdated.length
      ? `账本字段：\n${update.ledgerFieldsUpdated.slice(0, 12).map((item) => `- ${item}`).join('\n')}`
      : '',
    update?.summaryTriggered.length
      ? `触发总结记忆压缩：${update.summaryTriggered.join('、')}`
      : '',
    update?.warnings.length
      ? `警告：\n${update.warnings.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}
