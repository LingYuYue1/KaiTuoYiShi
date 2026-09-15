import { describe, expect, it } from 'vitest';
import {
  事实忽略哨兵键,
  变量模型失败哨兵键,
  派生变量批次诊断,
  解析失败哨兵键,
  type 变量命令,
  type 变量命令批次,
  type 变量命令结果,
} from '@/models/variableCommand';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';

const NOW = 1_700_000_000_000;

function buildCommand(overrides: Partial<变量命令> = {}): 变量命令 {
  return { action: 'set', key: '世界.当前地点', value: '主控舱段', ...overrides };
}

function buildResult(overrides: Partial<变量命令结果> = {}): 变量命令结果 {
  return { command: buildCommand(), ok: true, ...overrides };
}

function buildBatch(overrides: Partial<变量命令批次> = {}): 变量命令批次 {
  return {
    id: 'vbatch_diag_1',
    turn: 3,
    timestamp: NOW,
    source: 'calibration',
    results: [],
    ...overrides,
  };
}

describe('派生变量批次诊断：非落地结果归类', () => {
  it('解析错误 → parse_failed / error / parse', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult({ ok: false, kind: 'error', reason: '变量事实：JSON 无法解析', command: { action: 'set', key: 解析失败哨兵键, value: null } }),
    ]);
    expect(diagnostics).toStrictEqual([
      { code: 'parse_failed', severity: 'error', stage: 'parse', message: '变量事实：JSON 无法解析', commandIndex: 0 },
    ]);
  });

  it('模型失败哨兵键 → model_failed', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult({ ok: false, kind: 'error', reason: '网络错误', command: { action: 'set', key: 变量模型失败哨兵键, value: null } }),
    ]);
    expect(diagnostics[0]).toMatchObject({ code: 'model_failed', severity: 'error', stage: 'parse' });
  });

  it('事实忽略 → fact_ignored / warning', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult({ ok: false, kind: 'warning', reason: '事实缺少必填字段', command: { action: 'set', key: 事实忽略哨兵键, value: null } }),
    ]);
    expect(diagnostics[0]).toMatchObject({ code: 'fact_ignored', severity: 'warning', stage: 'parse' });
  });

  it('策略拒绝 → policy_rejected / policy，并记录根路径', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult({ ok: false, kind: 'rejected', reason: 'NSFW 策略拒绝', command: buildCommand({ key: 'NPC[2].好感度' }) }),
    ]);
    expect(diagnostics[0]).toMatchObject({ code: 'policy_rejected', severity: 'warning', stage: 'policy', root: 'NPC' });
  });

  it('命令性失败（无 kind）→ command_failed / commit', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult({ ok: false, reason: '路径未登记' }),
    ]);
    expect(diagnostics[0]).toMatchObject({ code: 'command_failed', severity: 'error', stage: 'commit', root: '世界' });
  });

  it('已落地命令不产生诊断', () => {
    expect(派生变量批次诊断([buildResult(), buildResult({ kind: 'command' })])).toStrictEqual([]);
  });

  it('无 reason 的失败结果被忽略，不造空诊断', () => {
    expect(派生变量批次诊断([buildResult({ ok: false, reason: '   ' })])).toStrictEqual([]);
  });

  it('commandIndex 指向结果在批中的下标', () => {
    const diagnostics = 派生变量批次诊断([
      buildResult(),
      buildResult({ ok: false, reason: '失败一' }),
      buildResult(),
      buildResult({ ok: false, kind: 'rejected', reason: '拒绝', command: buildCommand({ key: '旅人.背包' }) }),
    ]);
    expect(diagnostics.map((item) => item.commandIndex)).toStrictEqual([1, 3]);
  });
});

describe('长期会话压缩：摘要化后诊断由保留结果重算', () => {
  it('压缩批次的保留结果可派生出与截断结果一致的诊断', () => {
    const batches: 变量命令批次[] = Array.from({ length: 24 }, (_, index) =>
      buildBatch({
        id: `vbatch_${index}`,
        turn: index,
        results: [{ command: buildCommand(), ok: false, reason: `失败 ${index}` }],
      }),
    );
    const compacted = compactVariableBatchHistory(batches);
    const summarized = compacted[0];
    expect(summarized.retentionSummary).toBeDefined();
    const diagnostics = 派生变量批次诊断(summarized.results);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'command_failed', commandIndex: 0 });
  });
});
