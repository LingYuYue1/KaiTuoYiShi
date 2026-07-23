import type { 解析后回复 } from '@/models/chat';
import type { 世界状态 } from '@/models/world';

export const DEEPSEEK_MAIN_FORMAT_GUARD = [
  'DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。',
  '必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。',
  '<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写“已思考”。',
  '不要在标签外输出解释、道歉、说明或额外标题。',
].join('\n');

export function formatOriginalProtagonistForOpening(originalProtagonist: 世界状态['原著主角']): string {
  if (originalProtagonist === '星') return '原作主角星';
  if (originalProtagonist === '穹') return '原作主角穹';
  if (originalProtagonist === '星穹双主角') return '原作主角星与穹';
  return '所选原著主角';
}

function hasProtocolTag(rawText: string, tagNames: string[]): boolean {
  return tagNames.some((tag) => {
    const escaped = tag.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`<\\s*${escaped}\\s*>`, 'i').test(rawText);
  });
}

export function getDeepSeekMainProtocolIssues(parsed: 解析后回复, rawText: string): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  if (!hasProtocolTag(raw, ['thinking', 'think', '思考']) || !parsed.thinking.trim()) {
    issues.push('缺少 <thinking> 或 thinking 为空');
  } else if (
    !/(?:^|\n)\s*(?:Step|Opening-Step|Awakening-Step|步骤)\s*0?\d/i.test(parsed.thinking) &&
    !/Step(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14)/i.test(parsed.thinking)
  ) {
    issues.push('<thinking> 未按 Step 思维链展开');
  }
  if (!hasProtocolTag(raw, ['正文', 'body', 'content', 'text', '内容']) || !parsed.body.trim()) {
    issues.push('缺少 <正文> 或正文为空');
  }
  if (!hasProtocolTag(raw, ['短期记忆', 'memory', 'summary', 'recap', '记忆', '回忆'])) {
    issues.push('缺少 <短期记忆>');
  }
  if (!hasProtocolTag(raw, ['动态世界', 'world', 'worldevent', '世界', '事件'])) {
    issues.push('缺少 <动态世界>');
  }
  if (!hasProtocolTag(raw, ['变量草稿', 'variableDraft', '变量候选', '变量线索', '变量摘要'])) {
    issues.push('缺少 <变量草稿>');
  }
  return issues;
}

export function buildDeepSeekProtocolRetryGuard(issues: string[]): string {
  return [
    'DeepSeek 主剧情自动重试：上一版输出未通过协议校验。',
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

/** CoT 伪装历史：在 `user:开始任务` 后注入一条 assistant 历史，强化思考段输出习惯。
 *  内容刻意保留 `<thinking>` 段，让模型 in-context 学到「下次也要写 thinking」。 */
export const COT_FAKE_HISTORY_USER = '开始任务';
export const COT_FAKE_HISTORY_ASSISTANT = `<thinking>
- 系统就绪。当前任务：等待玩家发送指令后按 4 标签协议输出（thinking / 正文 / 短期记忆 / 动态世界）。
- 在收到首条具体指令前不输出正文，本条仅为格式确认。
</thinking>

<正文>
（待命中：等待玩家发起首回合）
</正文>

<短期记忆>
</短期记忆>

<动态世界>
</动态世界>`;

export function isDeepSeekMainConfig(config: { provider?: string; baseUrl?: string; model?: string }): boolean {
  const provider = String(config.provider ?? '').toLowerCase();
  const baseUrl = String(config.baseUrl ?? '').toLowerCase();
  const model = String(config.model ?? '').toLowerCase();
  return provider === 'deepseek' || baseUrl.includes('deepseek') || model.includes('deepseek');
}
