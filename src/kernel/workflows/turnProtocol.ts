import type { 解析后回复 } from '@/models/chat';
import { 提取NPC同行记忆文本列表, type NPC记录 } from '@/models/npc';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 世界状态 } from '@/models/world';
import type { 智库召回诊断 } from '@/services/zhikuRetrieval';
import { hasClosedResponseField } from '@/src/kernel/protocol/mainResponse';

// ── 主剧情协议 & 格式 / recall 预览 ──

export const DEEPSEEK_MAIN_FORMAT_GUARD = [
  'DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。',
  '必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。',
  '<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写"已思考"。',
  '不要在标签外输出解释、道歉、说明或额外标题。',
].join('\n');

export function formatOriginalProtagonistForOpening(originalProtagonist: 世界状态['原著主角']): string {
  if (originalProtagonist === '星') return '原作主角星';
  if (originalProtagonist === '穹') return '原作主角穹';
  if (originalProtagonist === '星穹双主角') return '原作主角星与穹';
  return '所选原著主角';
}

/**
 * Hard protocol issues block turn commit and may trigger main-loop auto-retry.
 * Only settlement-critical gaps belong here (empty/missing body; DeepSeek Step thinking).
 */
export function getHardProtocolIssues(
  parsed: 解析后回复,
  rawText: string,
  requireStepThinking: boolean,
): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  const bodyOk = hasClosedResponseField(raw, 'body') && Boolean(parsed.body.trim());
  if (!bodyOk) {
    issues.push('缺少 <正文> 或正文为空');
  }
  // Completely empty raw is also hard (body check usually covers this).
  if (!raw.trim() && !parsed.body.trim()) {
    if (!issues.includes('缺少 <正文> 或正文为空')) {
      issues.push('响应完全为空');
    }
  }
  if (requireStepThinking) {
    if (!hasClosedResponseField(raw, 'thinking') || !parsed.thinking.trim()) {
      issues.push('缺少 <thinking> 或 thinking 为空');
    } else if (
      !/(?:^|\n)\s*(?:Step|Opening-Step|Awakening-Step|步骤)\s*0?\d/i.test(parsed.thinking) &&
      !/Step(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14)/i.test(parsed.thinking)
    ) {
      issues.push('<thinking> 未按 Step 思维链展开');
    }
  }
  return issues;
}

/**
 * Soft protocol gaps: settlement can degrade (empty memory/world/variable draft).
 * Do not force main-loop retry solely for these when body is valid.
 */
export function getSoftProtocolIssues(parsed: 解析后回复, rawText: string): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  const bodyOk = hasClosedResponseField(raw, 'body') && Boolean(parsed.body.trim());
  if (!bodyOk) return issues;
  if (!hasClosedResponseField(raw, 'thinking') || !parsed.thinking.trim()) {
    issues.push('缺少 <thinking> 或 thinking 为空');
  }
  if (!hasClosedResponseField(raw, 'memory')) {
    issues.push('缺少 <短期记忆>');
  }
  if (!hasClosedResponseField(raw, 'worldEvents')) {
    issues.push('缺少 <动态世界>');
  }
  if (!hasClosedResponseField(raw, 'variableDraft')) {
    issues.push('缺少 <变量草稿>');
  }
  return issues;
}

/** Combined issues for retry-guard messaging (hard first). */
export function getMainProtocolIssues(
  parsed: 解析后回复,
  rawText: string,
  requireStepThinking: boolean,
): string[] {
  return [
    ...getHardProtocolIssues(parsed, rawText, requireStepThinking),
    ...getSoftProtocolIssues(parsed, rawText).filter((issue) => {
      // Soft thinking is hard under requireStepThinking; avoid duplicate wording.
      if (requireStepThinking && issue.includes('thinking')) return false;
      return true;
    }),
  ];
}

export function buildProtocolRetryGuard(issues: string[]): string {
  return [
    '主剧情自动重试：上一版输出未通过协议校验。',
    `失败项：${issues.join('；') || '未知格式错误'}。`,
    '请完全重写，不要延续上一版残缺输出。',
    DEEPSEEK_MAIN_FORMAT_GUARD,
  ].join('\n');
}

export function stripLeakedHistoryMetaFromBody(body: string): string {
  if (!body) return body;
  return body
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return raw;
      const historyTag = line.match(/^【\s*(历史时间|历史正文|历史狭间问答|历史狭间评判|历史短期记忆|历史变量草稿|历史剧情规划)\s*】\s*(.*)$/);
      if (!historyTag) return raw;
      const [, tag, rest] = historyTag;
      if (tag === '历史时间') return '';
      return rest.trim() ? `【旁白】${rest.trim()}` : '';
    })
    .filter((line) => line.trim())
    .join('\n');
}

export function buildStoryProgressMemoryLine(previous: 剧情编织系统, next: 剧情编织系统): string {
  const before = previous.当前进度;
  const after = next.当前进度;
  if (!after) return '';
  if (
    before?.当前系列ID === after.当前系列ID &&
    before?.当前分段ID === after.当前分段ID &&
    before?.推进状态 === after.推进状态 &&
    before?.最近一次推进判定回合 === after.最近一次推进判定回合
  ) {
    return '';
  }
  const series = next.系列列表.find((item) => item.id === after.当前系列ID)
    ?? next.系列列表.find((item) => item.id === next.当前系列ID);
  const current = series?.分段列表.find((item) => item.id === after.当前分段ID)
    ?? series?.分段列表.find((item) => item.组号 === after.当前分段组号);
  const parts = [
    `剧情编织进度：${series?.标题 ?? '未知系列'} 当前进入第 ${after.当前分段组号} 段${current?.标题 ? `「${current.标题}」` : ''}`,
    `状态 ${after.推进状态}`,
  ];
  const latestArchive = after.历史归档.at(-1);
  if (latestArchive) {
    parts.push(`最新归档：第 ${latestArchive.分段组号} 段「${latestArchive.分段标题}」${latestArchive.摘要 ? `：${latestArchive.摘要}` : ''}`);
    if (latestArchive.角色推进摘要?.length) {
      parts.push(`角色阶段承接：${latestArchive.角色推进摘要.slice(0, 4).join('；')}`);
    }
  }
  if (after.已完成摘要.length) parts.push(`已归档：${after.已完成摘要.slice(-3).join('；')}`);
  if (after.当前待解问题.length) parts.push(`待解：${after.当前待解问题.slice(0, 3).join('；')}`);
  if (after.最近判定理由.length) parts.push(`判定：${after.最近判定理由.slice(0, 3).join('；')}`);
  return parts.join('。');
}

export function applyStoryProgressNpcMemory(npcs: NPC记录[], story: 剧情编织系统, _memoryLine: string, turn: number): NPC记录[] {
  if (!story.当前进度) return npcs;
  const series = story.系列列表.find((item) => item.id === story.当前进度?.当前系列ID)
    ?? story.系列列表.find((item) => item.id === story.当前系列ID);
  if (!series) return npcs;
  const latestArchive = story.当前进度.历史归档.at(-1);
  const roleProgress = latestArchive?.角色推进摘要 ?? [];
  if (!roleProgress.length) return npcs;
  let changed = false;
  const next = npcs.map((npc) => {
    const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
    const matched = roleProgress.find((summary) =>
      aliases.some((name) => summary.includes(name)),
    );
    if (!matched || !(npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)) return npc;
    const existing = 提取NPC同行记忆文本列表(npc);
    const cleanSummary = matched.length > 120 ? `${matched.slice(0, 118)}…` : matched;
    if (existing.some((item) => item.includes(cleanSummary))) return npc;
    changed = true;
    const memoryId = `npc_story_progress_${npc.id}_${turn}_${existing.length}`;
    return {
      ...npc,
      同行记忆: [
        ...(npc.同行记忆 ?? []),
        {
          id: memoryId,
          回合: turn,
          摘要: cleanSummary,
          来源: '其他' as const,
          关联NPCID: [npc.id],
        },
      ],
      最近回合: Math.max(npc.最近回合, turn),
    };
  });
  return changed ? next : npcs;
}

export function formatZhikuDiagnosticsPreview(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '';
  return [
    '智库召回诊断：',
    `场景锚点：${diagnostics.场景锚点.join('、') || '无'}`,
    `相关角色：${diagnostics.相关角色.join('、') || '无'}`,
    `在场角色兜底召回：${diagnostics.在场角色兜底召回.join('、') || '无'}`,
    `关键词召回：${diagnostics.关键词召回.join('、') || '无'}`,
    `AI检索补充：${diagnostics.AI检索补充.join('、') || '无'}`,
    `关键词资料召回：${diagnostics.关键词资料召回.join('、') || '无'}`,
    `AI检索补充强资料：${diagnostics.AI检索补充强资料.join('、') || '无'}`,
    `AI检索补充弱资料：${diagnostics.AI检索补充弱资料.join('、') || '无'}`,
    `候选资料：${diagnostics.候选资料.join('、') || '无'}`,
    `AI候选资料：${diagnostics.AI候选资料.join('、') || '无'}`,
    `最终注入角色资料（已去重）：${diagnostics.角色相关资料.join('、') || '无'}`,
    `最终注入强资料：${diagnostics.强相关资料.join('、') || '无'}`,
    `最终注入弱资料：${diagnostics.弱相关资料.join('、') || '无'}`,
    `已注入资料：${diagnostics.已注入资料.join('、') || '无'}`,
    `角色故事层注入：${diagnostics.角色故事层注入?.join('；') || '无'}`,
    diagnostics.被门禁过滤.length
      ? `门禁过滤：${diagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
      : '门禁过滤：无',
    diagnostics.检查项.length ? `检查项：${diagnostics.检查项.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

export function getZhikuEntryKind(title: string): string {
  if (/【人物】|角色|人物/.test(title)) return '角色';
  if (/【地点】|地点|空间站|列车|贝洛伯格|罗浮|仙舟|匹诺康尼|雅利洛/.test(title)) return '地点';
  if (/【组织】|阵营|组织|公司|列车组|天才俱乐部/.test(title)) return '组织';
  if (/【物品】|道具|奇物|星核|光锥/.test(title)) return '物品';
  if (/【敌人】|敌人|军团|裂界|怪物/.test(title)) return '敌人';
  return '资料';
}

export function cleanRecallTitle(title: string): string {
  return String(title || '')
    .replace(/^【[^】]+】/, '')
    .split(/[｜|：:]/)[0]
    .replace(/\s+/g, '')
    .trim();
}

export function formatZhikuRecallSummary(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '智库召回：无';
  const formatList = (titles: string[]) => {
    const items = titles
      .map((title) => {
        const name = cleanRecallTitle(title);
        return name ? `${getZhikuEntryKind(title)}${name}` : '';
      })
      .filter(Boolean);
    return items.length ? items.join('，') : '无';
  };
  return [
    `在场角色兜底召回：${formatList(diagnostics.在场角色兜底召回)}`,
    `关键词召回：${formatList(diagnostics.关键词召回)}`,
    `AI检索补充：${formatList(diagnostics.AI检索补充)}`,
    `关键词资料召回：${formatList(diagnostics.关键词资料召回)}`,
    `AI检索补充强资料：${formatList(diagnostics.AI检索补充强资料)}`,
    `AI检索补充弱资料：${formatList(diagnostics.AI检索补充弱资料)}`,
  ].join('\n');
}

export function formatYitingRecallSummary(previewText?: string): string {
  const text = String(previewText || '').trim();
  if (!text) return '记忆召回：无';
  const names = Array.from(
    new Set(
      text
        .split(/[|\n，,]/)
        .map((item) => item.replace(/^强回忆[:：]/, '').replace(/^弱回忆[:：]/, '').trim())
        .filter((item) => item && item !== '无'),
    ),
  );
  return `记忆召回：${names.length ? names.join('，') : '无'}`;
}
