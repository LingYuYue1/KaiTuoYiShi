import { describe, expect, it } from 'vitest';
import {
  队列任务可重试,
  回合动作策略表,
  派生回合动作视图,
  查询最新动作任务,
  评估回合动作执行,
  type 回合动作上下文,
} from '@/hooks/useGame/turnActionRuntime';
import type { 聊天消息, 叙事插图 } from '@/models/chat';
import type { 队列任务记录 } from '@/models/queueTask';

function buildMessage(overrides: Partial<聊天消息> = {}): 聊天消息 {
  return {
    id: 'assistant-3',
    role: 'assistant',
    content: '正文',
    timestamp: 1,
    ...overrides,
  };
}

function buildImage(status: 叙事插图['status'] = 'done'): 叙事插图 {
  return {
    id: `narrative_${status}`,
    dataUrl: '',
    type: 'scene',
    status,
    prompt: '',
  };
}

function buildTask(overrides: Partial<队列任务记录> = {}): 队列任务记录 {
  return {
    id: 'narrative_image_parse',
    title: '故事快照解析',
    turn: 3,
    timestamp: 1,
    status: 'pending',
    targetMessageId: 'assistant-3',
    ...overrides,
  };
}

function buildContext(overrides: Partial<回合动作上下文> = {}): 回合动作上下文 {
  return { queueTasks: [], busy: false, 正文生图手动模式: false, ...overrides };
}

describe('回合动作视图派生', () => {
  it('有快照的消息显示动作按钮；无快照且手动模式关闭时不显示', () => {
    const withImages = 派生回合动作视图(
      buildMessage({ narrativeImages: [buildImage()] }),
      buildContext(),
    );
    expect(withImages.regenerate_snapshot).toMatchObject({ visible: true, enabled: true, running: false });

    const withoutImages = 派生回合动作视图(buildMessage(), buildContext());
    expect(withoutImages.regenerate_snapshot).toBeUndefined();
  });

  it('手动模式下无快照也显示；用户消息不显示', () => {
    expect(派生回合动作视图(buildMessage(), buildContext({ 正文生图手动模式: true })).regenerate_snapshot)
      .toMatchObject({ visible: true });

    expect(派生回合动作视图(buildMessage({ role: 'user' }), buildContext({ 正文生图手动模式: true })).regenerate_snapshot)
      .toBeUndefined();
  });

  it('队列任务运行中 / 图片生成中 → 动作运行态', () => {
    const fromQueue = 派生回合动作视图(
      buildMessage({ narrativeImages: [buildImage()] }),
      buildContext({ queueTasks: [buildTask()] }),
    );
    expect(fromQueue.regenerate_snapshot).toMatchObject({ running: true, enabled: false });

    const fromImage = 派生回合动作视图(
      buildMessage({ narrativeImages: [buildImage('generating')] }),
      buildContext(),
    );
    expect(fromImage.regenerate_snapshot).toMatchObject({ running: true, enabled: false });
  });

  it('其他消息的任务不串扰；失败任务原因进 detail', () => {
    const otherMessage = 派生回合动作视图(
      buildMessage({ narrativeImages: [buildImage()] }),
      buildContext({ queueTasks: [buildTask({ targetMessageId: 'assistant-other' })] }),
    );
    expect(otherMessage.regenerate_snapshot).toMatchObject({ running: false, enabled: true });

    const failed = 派生回合动作视图(
      buildMessage({ narrativeImages: [buildImage()] }),
      buildContext({ queueTasks: [buildTask({ status: 'failed', detail: '生成失败原因' })] }),
    );
    expect(failed.regenerate_snapshot).toMatchObject({ enabled: true, detail: '生成失败原因' });
  });

  it('账本查询按最近一条任务判定并支持多任务 id', () => {
    const tasks = [
      buildTask({ id: 'narrative_image_parse', status: 'success' }),
      buildTask({ id: 'narrative_image_generate', status: 'pending' }),
    ];
    expect(查询最新动作任务(tasks, 回合动作策略表.regenerate_snapshot.taskIds, 'assistant-3')?.id)
      .toBe('narrative_image_generate');
  });
});

describe('回合动作执行判定', () => {
  it('空闲且无未决任务 → 放行执行', () => {
    expect(评估回合动作执行(buildMessage(), 'regenerate_snapshot', buildContext()))
      .toStrictEqual({ kind: 'ran' });
  });

  it('忙时拒绝：按策略任务 id 与忙时文案给出结局', () => {
    expect(评估回合动作执行(buildMessage(), 'regenerate_snapshot', buildContext({ busy: true })))
      .toStrictEqual({
        kind: 'refused',
        taskId: 'narrative_image_parse',
        detail: '当前有任务进行中，请等待完成后再重新生成。',
      });
  });

  it('同动作已有未决任务时拒绝重复触发', () => {
    expect(评估回合动作执行(
      buildMessage(),
      'regenerate_snapshot',
      buildContext({ queueTasks: [buildTask()] }),
    )).toMatchObject({ kind: 'refused', taskId: 'narrative_image_parse' });
  });

  it('其他消息的未决任务不影响本消息', () => {
    expect(评估回合动作执行(
      buildMessage(),
      'regenerate_snapshot',
      buildContext({ queueTasks: [buildTask({ targetMessageId: 'assistant-other' })] }),
    )).toStrictEqual({ kind: 'ran' });
  });
});

describe('队列任务重试白名单', () => {
  it.each([
    ['variable', true],
    ['news', true],
    ['narrative_image_parse', true],
    ['narrative_image_generate', true],
    ['main_story', false],
    ['memory', false],
    ['autosave', false],
  ] as const)('%s → %s', (id, expected) => {
    expect(队列任务可重试(id)).toBe(expected);
  });
});
