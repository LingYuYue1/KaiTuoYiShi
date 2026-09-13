import { describe, expect, it } from 'vitest';
import {
  MEMORY_DRAFT_MAX_PENDING,
  MEMORY_DRAFT_MAX_TOTAL,
  创建空记忆系统,
  剪裁记忆草稿,
  应用记忆草稿摘要,
  构建记忆失败草稿,
  查找阻塞记忆草稿,
  归一化记忆系统,
  type 记忆失败草稿,
  type 记忆系统,
} from '@/models/memory';

const NOW = 1_700_000_000_000;

function buildDraft(overrides: Partial<Parameters<typeof 构建记忆失败草稿>[0]> = {}): 记忆失败草稿 {
  const draft = 构建记忆失败草稿({
    kind: 'short',
    turn: 3,
    items: ['回合3 玩家进入主控舱段', '回合3 警报响起'],
    prompt: '把即时记忆压缩为短期记忆。',
    failureCode: 'request_failed',
    failureMessage: '网络错误',
    now: NOW,
    ...overrides,
  });
  if (!draft) throw new Error('测试草稿构建失败');
  return draft;
}

function buildMemory(overrides: Partial<记忆系统> = {}): 记忆系统 {
  return { ...创建空记忆系统(), ...overrides };
}

describe('记忆失败草稿构建边界', () => {
  it('超界不建草稿：单条、整批、提示词', () => {
    expect(构建记忆失败草稿({
      kind: 'short', turn: 1, items: ['甲'.repeat(2001)], prompt: 'p', failureCode: 'request_failed', failureMessage: 'x', now: NOW,
    })).toBeNull();
    expect(构建记忆失败草稿({
      kind: 'short', turn: 1, items: Array.from({ length: 9 }, () => '乙'.repeat(2000)), prompt: 'p', failureCode: 'request_failed', failureMessage: 'x', now: NOW,
    })).toBeNull();
    expect(构建记忆失败草稿({
      kind: 'short', turn: 1, items: ['正常'], prompt: '丙'.repeat(4001), failureCode: 'request_failed', failureMessage: 'x', now: NOW,
    })).toBeNull();
  });

  it('空批次不建草稿；正常批次保留精确快照', () => {
    expect(构建记忆失败草稿({
      kind: 'short', turn: 1, items: ['  '], prompt: 'p', failureCode: 'request_failed', failureMessage: 'x', now: NOW,
    })).toBeNull();
    const draft = buildDraft();
    expect(draft.items).toStrictEqual(['回合3 玩家进入主控舱段', '回合3 警报响起']);
    expect(draft.status).toBe('pending');
    expect(draft.attemptCount).toBe(0);
  });
});

describe('阻塞草稿判定', () => {
  it('同层级且快照一致时才阻塞；resolved 与不同批次不阻塞', () => {
    const draft = buildDraft();
    const items = draft.items;
    expect(查找阻塞记忆草稿([draft], 'short', items)?.id).toBe(draft.id);
    expect(查找阻塞记忆草稿([draft], 'middle', items)).toBeUndefined();
    expect(查找阻塞记忆草稿([draft], 'short', [...items, '新增'])).toBeUndefined();
    expect(查找阻塞记忆草稿([{ ...draft, status: 'resolved' }], 'short', items)).toBeUndefined();
  });
});

describe('应用草稿摘要', () => {
  it('按快照移除源层条目、向目标层追加摘要并置 resolved', () => {
    const draft = buildDraft();
    const memory = buildMemory({
      即时记忆: [...draft.items, '回合4 新的即时记忆'],
      短期记忆: ['既有短期'],
      失败草稿: [draft],
    });
    const result = 应用记忆草稿摘要(memory, draft, '- 警报与舱段摘要', NOW + 1);

    expect(result.outcome).toBe('applied');
    expect(result.memory.即时记忆).toStrictEqual(['回合4 新的即时记忆']);
    expect(result.memory.短期记忆).toStrictEqual(['既有短期', '- 警报与舱段摘要']);
    expect(result.memory.失败草稿[0].status).toBe('resolved');
    expect(result.memory.失败草稿[0].attemptCount).toBe(1);
  });

  it('源层已无快照条目时判为过期，草稿置 ignored 并留诊断', () => {
    const draft = buildDraft();
    const memory = buildMemory({ 即时记忆: ['已被其他路径消费'], 失败草稿: [draft] });
    const result = 应用记忆草稿摘要(memory, draft, '摘要', NOW + 2);

    expect(result.outcome).toBe('source_changed');
    expect(result.memory.即时记忆).toStrictEqual(['已被其他路径消费']);
    expect(result.memory.失败草稿[0].status).toBe('ignored');
    expect(result.memory.失败草稿[0].failureCode).toBe('source_changed');
  });
});

describe('草稿裁剪', () => {
  it('pending 超过上限先裁最旧 pending', () => {
    const drafts = Array.from({ length: MEMORY_DRAFT_MAX_PENDING + 2 }, (_, index) => (
      buildDraft({ turn: index + 1, now: NOW + index, items: [`第${index + 1}批`] })
    ));
    const trimmed = 剪裁记忆草稿(drafts);
    expect(trimmed.filter((draft) => draft.status === 'pending')).toHaveLength(MEMORY_DRAFT_MAX_PENDING);
    expect(trimmed[0].turn).toBe(3);
  });

  it('总数超过上限先裁最旧历史，再裁最旧 pending', () => {
    const resolved = Array.from({ length: MEMORY_DRAFT_MAX_TOTAL }, (_, index) => (
      buildDraft({ turn: index + 1, now: NOW + index, items: [`历史${index + 1}`] })
    )).map((draft) => ({ ...draft, status: 'resolved' as const }));
    const pending = [buildDraft({ turn: 90, now: NOW + 90, items: ['待处理'] })];
    const trimmed = 剪裁记忆草稿([...resolved, ...pending]);

    expect(trimmed).toHaveLength(MEMORY_DRAFT_MAX_TOTAL);
    expect(trimmed.some((draft) => draft.status === 'resolved' && draft.turn === 1)).toBe(false);
    expect(trimmed.some((draft) => draft.status === 'pending')).toBe(true);
  });
});

describe('归一化记忆系统', () => {
  it('缺失数组兜底为空；非法草稿清除并记 issue', () => {
    const result = 归一化记忆系统({
      即时记忆: 'not-array',
      短期记忆: ['正常', 42, '  '],
      失败草稿: [{ id: '坏草稿' }, buildDraft()],
    });

    expect(result.value.即时记忆).toStrictEqual([]);
    expect(result.value.短期记忆).toStrictEqual(['正常']);
    expect(result.value.中期记忆).toStrictEqual([]);
    expect(result.value.长期记忆).toStrictEqual([]);
    expect(result.value.失败草稿).toHaveLength(1);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('retrying 归一为 pending；JSON 往返保留草稿', () => {
    const draft = buildDraft();
    const memory = buildMemory({ 失败草稿: [{ ...draft, status: 'retrying' }] });
    const normalized = 归一化记忆系统(JSON.parse(JSON.stringify(memory)));

    expect(normalized.value.失败草稿[0].status).toBe('pending');
    expect(normalized.value.失败草稿[0].items).toStrictEqual(draft.items);
    expect(normalized.issues).toStrictEqual([]);
  });

  it('超界草稿在归一化时清除并记 issue', () => {
    const draft = buildDraft();
    const oversized = { ...draft, items: ['丁'.repeat(2001)] };
    const result = 归一化记忆系统(buildMemory({ 失败草稿: [oversized] }));

    expect(result.value.失败草稿).toStrictEqual([]);
    expect(result.issues.some((issue) => issue.includes('超出边界'))).toBe(true);
  });
});
