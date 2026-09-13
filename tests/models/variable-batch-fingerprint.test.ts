import { describe, expect, it } from 'vitest';
import {
  归一化变量命令批次列表,
  派生变量批次结局,
  变量模型失败哨兵键,
  解析失败哨兵键,
  事实忽略哨兵键,
  type 变量命令,
  type 变量命令批次,
  type 变量命令结果,
} from '@/models/variableCommand';
import {
  commandFingerprint,
  filterCommandsByAppliedFingerprints,
  listAppliedCommandFingerprints,
  variableStateFingerprint,
} from '@/utils/variableFingerprint';
import { reduceVariableCommands } from '@/utils/variableExecutor';
import { VARIABLE_ROOT_KEYS, type VariableState } from '@/utils/variableRegistry';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const NOW = 1_700_000_000_000;

function buildState(overrides: Partial<VariableState> = {}): VariableState {
  const base = Object.fromEntries(VARIABLE_ROOT_KEYS.map((key) => [key, null])) as VariableState;
  return { ...base, ...overrides };
}

function buildCommand(overrides: Partial<变量命令> = {}): 变量命令 {
  return { action: 'set', key: '世界.当前地点', value: '主控舱段', ...overrides };
}

function buildResult(overrides: Partial<变量命令结果> = {}): 变量命令结果 {
  return { command: buildCommand(), ok: true, ...overrides };
}

function buildBatch(overrides: Partial<变量命令批次> = {}): 变量命令批次 {
  return {
    id: 'vbatch_test_1',
    turn: 3,
    timestamp: NOW,
    source: 'calibration',
    results: [],
    ...overrides,
  };
}

describe('命令指纹：只由规范化命令内容决定', () => {
  it('相同内容得相同指纹，与对象身份无关', async () => {
    const left = await commandFingerprint(buildCommand());
    const right = await commandFingerprint(buildCommand());
    expect(left).toBe(right);
    expect(left).toMatch(SHA256_HEX);
  });

  it('key 两端空白被规范化', async () => {
    const trimmed = await commandFingerprint(buildCommand({ key: '世界.当前地点' }));
    const padded = await commandFingerprint(buildCommand({ key: '  世界.当前地点  ' }));
    expect(padded).toBe(trimmed);
  });

  it('动作 / 路径 / 值任一不同则指纹不同', async () => {
    const base = await commandFingerprint(buildCommand());
    expect(await commandFingerprint(buildCommand({ action: 'add', value: 1 }))).not.toBe(base);
    expect(await commandFingerprint(buildCommand({ key: '世界.当前时间' }))).not.toBe(base);
    expect(await commandFingerprint(buildCommand({ value: '空间站' }))).not.toBe(base);
  });

  it('模型响应、时间戳、UI 元数据不参与指纹', async () => {
    const plain = buildCommand();
    const noisy = {
      ...plain,
      reason: '模型解释文本',
      timestamp: NOW + 1,
      batchId: 'vbatch_other',
      uiHint: { selected: true },
    } as 变量命令;
    expect(await commandFingerprint(noisy)).toBe(await commandFingerprint(plain));
  });
});

describe('基态指纹：归约输入投影的稳定摘要', () => {
  it('同内容同指纹，键序无关', async () => {
    const left = await variableStateFingerprint(buildState({ 世界: { 当前地点: '主控舱段', 开拓天数: 3 } }));
    const right = await variableStateFingerprint(buildState({ 世界: { 开拓天数: 3, 当前地点: '主控舱段' } }));
    expect(left).toBe(right);
    expect(left).toMatch(SHA256_HEX);
  });

  it('任一字段变化则指纹变化', async () => {
    const base = await variableStateFingerprint(buildState({ 世界: { 开拓天数: 3 } }));
    const changed = await variableStateFingerprint(buildState({ 世界: { 开拓天数: 4 } }));
    expect(changed).not.toBe(base);
  });
});

describe('批次结局派生', () => {
  const applied = (): 变量命令结果 => buildResult({ ok: true });
  const failed = (): 变量命令结果 => buildResult({ ok: false, reason: '路径未登记' });
  const rejected = (): 变量命令结果 => buildResult({ ok: false, kind: 'rejected', reason: '策略拒绝' });
  const parseError = (): 变量命令结果 => buildResult({
    ok: false,
    kind: 'error',
    command: { action: 'set', key: 解析失败哨兵键, value: null },
  });
  const warning = (): 变量命令结果 => buildResult({
    ok: false,
    kind: 'warning',
    command: { action: 'set', key: 事实忽略哨兵键, value: null },
  });

  it.each([
    [[applied(), applied()], 'completed'],
    [[applied(), failed()], 'partially_applied'],
    [[failed(), failed()], 'preflight_failed'],
    [[rejected()], 'preflight_failed'],
    [[parseError()], 'preflight_failed'],
    [[warning()], 'completed'],
    [[applied(), rejected(), warning()], 'partially_applied'],
    [[], 'completed'],
  ] as const)('结果 %# → %s', (results, expected) => {
    expect(派生变量批次结局([...results])).toBe(expected);
  });

  it('模型失败显式覆盖派生', () => {
    expect(派生变量批次结局([buildResult({ ok: false })], { modelFailed: true })).toBe('model_failed');
  });
});

describe('已落地跳过规则', () => {
  it('只收集成功落地的命令指纹，诊断项不参与', async () => {
    const fingerprint = await commandFingerprint(buildCommand());
    const batches = [
      buildBatch({ results: [{ ...buildResult({ ok: true }), commandFingerprint: fingerprint }] }),
      buildBatch({
        id: 'vbatch_test_2',
        results: [
          { ...buildResult({ ok: true }), commandFingerprint: 'f'.repeat(64) },
          { ...buildResult({ ok: false, reason: 'x' }), commandFingerprint: 'a'.repeat(64) },
          { ...buildResult({ ok: true, kind: 'warning' }), commandFingerprint: 'b'.repeat(64) },
        ],
      }),
    ];
    const applied = listAppliedCommandFingerprints(batches);
    expect(applied.has(fingerprint)).toBe(true);
    expect(applied.has('f'.repeat(64))).toBe(true);
    expect(applied.has('a'.repeat(64))).toBe(false);
    expect(applied.has('b'.repeat(64))).toBe(false);
  });

  it('同内容命令被过滤，不同值命令保留', async () => {
    const appliedCommand = buildCommand();
    const applied = listAppliedCommandFingerprints([
      buildBatch({ results: [{ ...buildResult({ ok: true }), commandFingerprint: await commandFingerprint(appliedCommand) }] }),
    ]);
    const kept = await filterCommandsByAppliedFingerprints([
      buildCommand(),
      buildCommand({ value: '空间站黑塔办公室' }),
      buildCommand({ key: '世界.当前时间', value: '08:30' }),
    ], applied);
    expect(kept).toHaveLength(2);
    expect(kept[0].value).toBe('空间站黑塔办公室');
    expect(kept[1].key).toBe('世界.当前时间');
  });

  it('无已落地指纹时原样返回', async () => {
    const commands = [buildCommand(), buildCommand({ key: '世界.当前时间', value: '08:30' })];
    expect(await filterCommandsByAppliedFingerprints(commands, new Set())).toStrictEqual(commands);
  });
});

describe('归约回执与命令一一对应（指纹按序回填的依赖）', () => {
  it('每条命令产生一条结果且顺序一致', () => {
    const commands: 变量命令[] = [
      buildCommand({ key: '世界.当前时间', value: '08:30' }),
      buildCommand({ action: 'add', key: '世界.开拓天数', value: 1 }),
      buildCommand({ action: 'delete', key: '剧情[id=node_002]' }),
      buildCommand({ action: 'push', key: '旅人.背包', value: { 名称: '面包', 类别: 'food' } }),
    ];
    const state = buildState({
      世界: { 当前日期: '', 当前时间: '', 开拓天数: 1 },
      旅人: { 背包: [] },
      剧情: [],
    });
    const { results } = reduceVariableCommands(commands, state);
    expect(results).toHaveLength(commands.length);
    expect(results.map((result) => result.command.key)).toStrictEqual(commands.map((command) => command.key));
  });
});

describe('legacy 批次归一化', () => {
  it('旧批次缺 outcome / 指纹：派生结局、指纹保持缺失', () => {
    const normalized = 归一化变量命令批次列表([
      buildBatch({
        results: [
          { command: buildCommand(), ok: true },
          { command: buildCommand({ value: '失败' }), ok: false, reason: '未登记' },
        ],
      }),
    ]);
    expect(normalized.issues).toStrictEqual([]);
    expect(normalized.batches).toHaveLength(1);
    expect(normalized.batches[0].outcome).toBe('partially_applied');
    expect(normalized.batches[0].baseStateFingerprint).toBeUndefined();
    expect(normalized.batches[0].results[0].commandFingerprint).toBeUndefined();
  });

  it('旧模型失败批次按哨兵键识别为 model_failed 并补 kind', () => {
    const normalized = 归一化变量命令批次列表([
      buildBatch({
        results: [{ command: { action: 'set', key: 变量模型失败哨兵键, value: null }, ok: false, reason: '网络错误' }],
      }),
    ]);
    expect(normalized.batches[0].outcome).toBe('model_failed');
    expect(normalized.batches[0].results[0].kind).toBe('error');
  });

  it('合法新字段保留，非法指纹字符串丢弃', () => {
    const normalized = 归一化变量命令批次列表([
      buildBatch({
        baseStateFingerprint: 'a'.repeat(64),
        outcome: 'completed',
        results: [{
          command: buildCommand(),
          ok: true,
          kind: 'command',
          commandFingerprint: 'b'.repeat(64),
        }],
      }),
      buildBatch({
        id: 'vbatch_test_bad',
        baseStateFingerprint: 'not-a-hash',
        outcome: 'not-an-outcome' as never,
        results: [{ command: buildCommand(), ok: true, kind: 'command', commandFingerprint: 'x' }],
      }),
    ]);
    expect(normalized.batches[0].baseStateFingerprint).toBe('a'.repeat(64));
    expect(normalized.batches[0].outcome).toBe('completed');
    expect(normalized.batches[0].results[0].commandFingerprint).toBe('b'.repeat(64));
    expect(normalized.batches[1].baseStateFingerprint).toBeUndefined();
    expect(normalized.batches[1].outcome).toBe('completed');
    expect(normalized.batches[1].results[0].commandFingerprint).toBeUndefined();
  });

  it('结构非法项丢弃并记 issue，不静默兜底', () => {
    const normalized = 归一化变量命令批次列表([
      null,
      { id: '', turn: 1, timestamp: NOW, results: [] },
      { id: 'vbatch_ok', turn: 2, timestamp: NOW, results: ['bad-result', { command: { action: 'nope', key: 'x' }, ok: true }] },
    ]);
    expect(normalized.batches).toHaveLength(1);
    expect(normalized.batches[0].id).toBe('vbatch_ok');
    expect(normalized.batches[0].results).toStrictEqual([]);
    expect(normalized.issues).toHaveLength(4);
    expect(normalized.issues[0]).toContain('不是批次对象');
    expect(normalized.issues[1]).toContain('缺少批次 id');
    expect(normalized.issues[2]).toContain('第 1 条结果已丢弃');
    expect(normalized.issues[3]).toContain('第 2 条结果已丢弃');
  });

  it('非数组输入整体丢弃并记 issue', () => {
    const normalized = 归一化变量命令批次列表({ 批次: [] });
    expect(normalized.batches).toStrictEqual([]);
    expect(normalized.issues[0]).toContain('不是数组');
  });

  it('摘要字段合法保留、非法丢弃', () => {
    const normalized = 归一化变量命令批次列表([
      buildBatch({
        retentionSummary: { totalResults: 3, succeededResults: 1, diagnosticResults: 2, omittedDiagnosticResults: 1 },
      }),
      buildBatch({ id: 'vbatch_bad_summary', retentionSummary: { totalResults: 'x' } as never }),
    ]);
    expect(normalized.batches[0].retentionSummary).toStrictEqual({
      totalResults: 3,
      succeededResults: 1,
      diagnosticResults: 2,
      omittedDiagnosticResults: 1,
    });
    expect(normalized.batches[1].retentionSummary).toBeUndefined();
  });
});
