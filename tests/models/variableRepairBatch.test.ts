import { describe, expect, it } from 'vitest';
import type { 变量修复计划 } from '@/models/variableRepair';
import {
  构建变量修复草稿,
  归一化变量修复草稿,
  草稿是否过期,
  推进草稿项,
  完成扫描状态,
  汇总变量修复草稿,
} from '@/models/variableRepairBatch';

const NOW = 1_700_000_000_000;

function 构建计划(overrides: Partial<变量修复计划> = {}): 变量修复计划 {
  return {
    schemaVersion: 1,
    turn: 3,
    targetMessageId: 'assistant-3',
    baseStateFingerprint: 'fp-1',
    createdAt: NOW,
    items: [
      { id: 'item_0', category: 'safe', commands: [] },
      { id: 'item_1', category: 'confirm', commands: [] },
      { id: 'item_2', category: 'conflict', commands: [] },
    ],
    ...overrides,
  };
}

describe('构建变量修复草稿', () => {
  it('目标列表逐项变为 pending，指纹与时间戳落定', () => {
    const draft = 构建变量修复草稿(
      [
        { turn: 5, targetMessageId: 'a-5' },
        { turn: 3, targetMessageId: 'a-3' },
      ],
      'fp-a',
      NOW,
    );
    expect(draft.version).toBe(1);
    expect(draft.state).toBe('scanning');
    expect(draft.指纹).toBe('fp-a');
    expect(draft.createdAt).toBe(NOW);
    expect(draft.updatedAt).toBe(NOW);
    expect(draft.项).toStrictEqual([
      { turn: 5, targetMessageId: 'a-5', status: 'pending' },
      { turn: 3, targetMessageId: 'a-3', status: 'pending' },
    ]);
  });
});

describe('归一化变量修复草稿', () => {
  it('合法草稿往返等值，坏项丢弃并给出 issue', () => {
    const draft = 构建变量修复草稿([{ turn: 3, targetMessageId: 'a-3' }], 'fp-a', NOW);
    const next = 推进草稿项(draft, 'a-3', { status: 'failed', 错误: '正文为空' }, NOW + 1);
    const round = 归一化变量修复草稿(next);
    expect(round.issues).toStrictEqual([]);
    expect(round.draft).toStrictEqual(next);

    const broken = { ...next, 项: [...next.项, { turn: 2 }] } as unknown;
    const result = 归一化变量修复草稿(broken);
    expect(result.draft?.项).toHaveLength(1);
    expect(result.issues.join('')).toContain('丢弃');
  });

  it('版本非法 / 形态非法整体拒绝', () => {
    expect(归一化变量修复草稿({ version: 2, 项: [] }).draft).toBeUndefined();
    expect(归一化变量修复草稿(null).draft).toBeUndefined();
    expect(归一化变量修复草稿('nope').issues.length).toBeGreaterThan(0);
    const noFingerprint = { version: 1, state: 'ready', 项: [], createdAt: 1, updatedAt: 1 };
    expect(归一化变量修复草稿(noFingerprint).draft).toBeUndefined();
  });
});

describe('推进草稿项', () => {
  it('只更新目标项，原草稿与新草稿互不共享修改', () => {
    const draft = 构建变量修复草稿(
      [
        { turn: 5, targetMessageId: 'a-5' },
        { turn: 3, targetMessageId: 'a-3' },
      ],
      'fp-a',
      NOW,
    );
    const next = 推进草稿项(draft, 'a-3', { status: 'ready', 计划: 构建计划() }, NOW + 5);
    expect(draft.项[1].status).toBe('pending');
    expect(next.项[1].status).toBe('ready');
    expect(next.项[1].计划?.targetMessageId).toBe('assistant-3');
    expect(next.项[0].status).toBe('pending');
    expect(next.updatedAt).toBe(NOW + 5);
    expect(next.项).not.toBe(draft.项);
  });
});

describe('汇总变量修复草稿', () => {
  it('按项状态统计，可提交项只数 safe + confirm', () => {
    const draft = 构建变量修复草稿(
      [
        { turn: 5, targetMessageId: 'a-5' },
        { turn: 4, targetMessageId: 'a-4' },
        { turn: 3, targetMessageId: 'a-3' },
      ],
      'fp-a',
      NOW,
    );
    let working = 推进草稿项(draft, 'a-5', { status: 'ready', 计划: 构建计划() }, NOW);
    working = 推进草稿项(working, 'a-4', { status: 'failed', 错误: '失败' }, NOW);
    const summary = 汇总变量修复草稿(working);
    expect(summary).toStrictEqual({
      total: 3,
      pending: 1,
      ready: 1,
      failed: 1,
      可提交项: 2,
    });
  });
});

describe('草稿是否过期', () => {
  it('指纹不同即过期', () => {
    const draft = 构建变量修复草稿([{ turn: 3, targetMessageId: 'a-3' }], 'fp-a', NOW);
    expect(草稿是否过期(draft, 'fp-a')).toBe(false);
    expect(草稿是否过期(draft, 'fp-b')).toBe(true);
  });
});

describe('完成扫描状态', () => {
  it('全项收敛 → ready；仍有 pending → 保持原状态；空项不收敛', () => {
    let draft = 构建变量修复草稿([{ turn: 3, targetMessageId: 'a-3' }], 'fp-a', NOW);
    draft = 推进草稿项(draft, 'a-3', { status: 'ready', 计划: 构建计划() }, NOW);
    expect(完成扫描状态(draft)).toBe('ready');

    draft = 推进草稿项(draft, 'a-3', { status: 'scanning' }, NOW);
    expect(完成扫描状态(draft)).toBe('scanning');

    expect(完成扫描状态(构建变量修复草稿([], 'fp-a', NOW))).toBe('scanning');
  });
});
