import { describe, expect, it } from 'vitest';
import type { 聊天消息 } from '@/models/chat';
import { 格式化本地诊断 } from '@/components/features/Chat/diagnosticsPanel';

function buildMessage(overrides: Partial<聊天消息> = {}): 聊天消息 {
  return {
    id: 'msg_1',
    role: 'assistant',
    content: '正文',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe('本地诊断格式化', () => {
  it('无调试上下文时给出概览与提示，不抛错', () => {
    const report = 格式化本地诊断(buildMessage({
      gameTime: '4',
      responseDurationSec: 12.34,
      tokenUsage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, source: 'api', provider: 'deepseek', model: 'deepseek-chat' },
    }));
    expect(report).toContain('【回合概览】');
    expect(report).toContain('第 4 回合');
    expect(report).toContain('12.3 秒');
    expect(report).toContain('deepseek / deepseek-chat');
    expect(report).toContain('输入');
    expect(report).toContain('没有保存请求诊断');
  });

  it('带调试上下文时输出协议、召回与缓存分节', () => {
    const report = 格式化本地诊断(buildMessage({
      debugContext: {
        systemPrompt: 'sys',
        messages: [],
        mainRequestMode: 'full',
        deepSeekMainMode: 'standard',
        deepSeekCotFakeHistorySkipped: true,
        deepSeekPrefixMode: false,
        deepSeekProtocolIssues: ['缺少结尾'],
        stV2Attempted: true,
        stV2Used: false,
        stV2FallbackReason: '模型不支持',
        rerollSimilarity: 0.42,
        yitingRecallUsedModel: 'yiting-model',
        zhikuRecallUsedModel: undefined,
        npcLedgerInjection: { selectedNames: ['三月七'], injected: [], skippedNames: [] },
        npcLedgerUpdate: { updatedNames: ['丹恒'], memoryAppended: [], ledgerFieldsUpdated: [], summaryTriggered: [], warnings: [] },
        cachePrefixDiagnostics: {
          commonPrefixTokens: 100,
          commonPrefixChars: 0,
          currentPromptTokens: 400,
          commonPrefixRate: 0.25,
          firstDiffCurrentSection: '剧情编织',
          firstDiffPreviousSection: '记忆',
          changedTailTokens: 300,
          largestChangedSections: [],
          firstDiffCurrentExcerpt: 'a',
          firstDiffPreviousExcerpt: 'b',
        },
      } as unknown as 聊天消息['debugContext'],
    }));
    expect(report).toContain('【协议与模式】');
    expect(report).toContain('缺少结尾');
    expect(report).toContain('酒馆 V2：尝试=是 · 采用=否 · 回退原因=模型不支持');
    expect(report).toContain('重roll 相似度：42%');
    expect(report).toContain('【召回】');
    expect(report).toContain('忆庭：模型=yiting-model');
    expect(report).toContain('智库：本地规则');
    expect(report).toContain('NPC 账本注入：三月七');
    expect(report).toContain('【缓存前缀】');
    expect(report).toContain('首次变化：剧情编织');
  });
});
