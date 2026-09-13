import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  创建默认游戏设置,
  创建空API设置,
  创建空剧情编织API覆盖,
  归一化剧情编织系统设置,
  type API配置项,
  type 游戏设置,
} from '@/models/settings';
import {
  归一化剧情编织分段,
  归一化剧情编织系列,
  归一化剧情编织系统,
  type 剧情编织分段,
  type 剧情编织系统,
} from '@/models/storyWeaving';
import { buildStoryAdvanceJudgeApiConfig } from '@/services/storyWeaving';
import {
  buildStoryAdvanceJudgeUserPrompt,
  judgeStoryAdvance,
} from '@/services/storyAdvanceJudge';
import { autoAlignCanonStoryProgress, 获取当前剧情分段 } from '@/services/storyProgressService';

vi.mock('@/services/ai/chatCompletionClient', () => ({
  chatCompletionNonStream: vi.fn(),
}));

import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';

const nonStreamMock = vi.mocked(chatCompletionNonStream);

const mainConfig: API配置项 = {
  id: 'main',
  name: '主 API',
  provider: 'openai_compatible',
  baseUrl: 'https://main.example/v1',
  apiKey: 'sk-main',
  model: 'main-model',
  createdAt: 0,
  updatedAt: 0,
};

function 建游戏设置(): 游戏设置 {
  return 创建默认游戏设置();
}

function 建分段(input: {
  id: string;
  组号: number;
  运行状态: 剧情编织分段['运行状态'];
  标题?: string;
  本段结束状态?: string[];
  登场角色?: string[];
}): 剧情编织分段 {
  return 归一化剧情编织分段({
    id: input.id,
    组号: input.组号,
    标题: input.标题 ?? `分段${input.组号}`,
    处理状态: '已完成',
    运行状态: input.运行状态,
    启用注入: true,
    本段结束状态: input.本段结束状态 ?? [],
    登场角色: input.登场角色 ?? [],
  }, input.组号);
}

function 建系统(分段列表: 剧情编织分段[]): 剧情编织系统 {
  const series = 归一化剧情编织系列({ id: 's', 标题: '测试系列', 来源类型: 'custom', 分段列表 });
  return 归一化剧情编织系统({ 当前系列ID: 's', 系列列表: [series] });
}

function 对齐(系统: 剧情编织系统, body: string, advanceJudge?: Parameters<typeof autoAlignCanonStoryProgress>[0]['advanceJudge']) {
  return autoAlignCanonStoryProgress({ storyWeaving: 系统, turnCount: 6, body, userInput: '继续', advanceJudge });
}

describe('剧情推进判定设置', () => {
  it('默认与旧档缺省关闭、显式开启保留', () => {
    expect(归一化剧情编织系统设置(undefined).剧情推进AI判定).toBe(false);
    expect(归一化剧情编织系统设置({ enabled: true }).剧情推进AI判定).toBe(false);
    expect(归一化剧情编织系统设置({ enabled: true, 剧情推进AI判定: true }).剧情推进AI判定).toBe(true);
    expect(归一化剧情编织系统设置({ 推进判定API: { ...创建空剧情编织API覆盖(), retryCount: 9 } }).推进判定API.retryCount).toBe(9);
  });
});

describe('推进判定 API 构建', () => {
  it('无主配置返回 null', () => {
    expect(buildStoryAdvanceJudgeApiConfig(建游戏设置(), 创建空API设置())).toBeNull();
  });

  it('覆盖留空回退剧情编织 api，覆盖填写优先，缺口回退主配置', () => {
    const settings = 建游戏设置();
    settings.剧情编织系统.api = { ...settings.剧情编织系统.api, baseUrl: 'https://weaving.example/v1', apiKey: 'sk-weaving', model: 'weaving-model' };
    const apiSettings = { activeConfigId: 'main', configs: [mainConfig] };

    const fallback = buildStoryAdvanceJudgeApiConfig(settings, apiSettings);
    expect(fallback?.baseUrl).toBe('https://weaving.example/v1');
    expect(fallback?.model).toBe('weaving-model');

    settings.剧情编织系统.推进判定API = { ...settings.剧情编织系统.推进判定API, model: 'judge-model' };
    const overridden = buildStoryAdvanceJudgeApiConfig(settings, apiSettings);
    expect(overridden?.model).toBe('judge-model');
    expect(overridden?.baseUrl).toBe('https://main.example/v1');
    expect(overridden?.enableClaudeMode).toBe(settings.enableClaudeMode);
  });

  it('主配置缺字段且无覆盖时返回 null', () => {
    const apiSettings = { activeConfigId: 'main', configs: [{ ...mainConfig, apiKey: '' }] };
    expect(buildStoryAdvanceJudgeApiConfig(建游戏设置(), apiSettings)).toBeNull();
  });
});

describe('judgeStoryAdvance', () => {
  const segment = 建分段({ id: 'c', 组号: 2, 运行状态: '当前', 标题: '主控舱段警报', 本段结束状态: ['警报解除 危机落幕'] });

  beforeEach(() => {
    nonStreamMock.mockReset();
  });

  it('非布尔完成标记视为无效', async () => {
    nonStreamMock.mockResolvedValue('{"completed": "yes", "reason": "x"}');
    expect(await judgeStoryAdvance(mainConfig, { currentSegment: segment, body: '正文', playerInput: '' })).toBeNull();
  });

  it('解析合法判定并裁剪理由', async () => {
    nonStreamMock.mockResolvedValue('{"completed": true, "actualSegmentId": " n ", "reason": "列车启程"}');
    expect(await judgeStoryAdvance(mainConfig, { currentSegment: segment, body: '正文', playerInput: '' }))
      .toEqual({ completed: true, actualSegmentId: 'n', reason: '列车启程' });
  });

  it('调用失败返回 null 不抛出', async () => {
    nonStreamMock.mockRejectedValue(new Error('boom'));
    expect(await judgeStoryAdvance(mainConfig, { currentSegment: segment, body: '正文', playerInput: '去下一站' })).toBeNull();
  });

  it('提示词包含分段锚点与本回合文本', () => {
    const prompt = buildStoryAdvanceJudgeUserPrompt({ currentSegment: segment, body: '正文内容'.repeat(800), playerInput: '玩家' });
    expect(prompt).toContain('主控舱段警报');
    expect(prompt).toContain('警报解除 危机落幕');
    expect(prompt).toContain('玩家');
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe('判定合并到确定性对齐', () => {
  const 行船体 = '警报解除 危机落幕 危机解除 全员撤离';

  it('判定只升不降：可与其他证据合力达到阈值，关闭时保持原结果', () => {
    const system = 建系统([
      建分段({ id: 'c', 组号: 2, 运行状态: '当前', 本段结束状态: ['警报解除 危机落幕', '危机解除 全员撤离'] }),
      建分段({ id: 'n', 组号: 3, 运行状态: '未开始' }),
    ]);
    const baseline = 对齐(system, 行船体);
    expect(baseline.progressed).toBe(false);
    expect(对齐(system, 行船体, { completed: false, reason: '' }).progressed).toBe(false);
    const judged = 对齐(system, 行船体, { completed: true, reason: '本段已完成' });
    expect(judged.progressed).toBe(true);
    expect(judged.system.当前进度?.当前分段ID).toBe('n');
  });

  it('actualSegmentId 只收窄候选，不能越权跳段', () => {
    const system = 建系统([
      建分段({ id: 'c', 组号: 2, 运行状态: '当前' }),
      建分段({ id: 'n', 组号: 3, 运行状态: '未开始', 标题: '星港重逢 登船启程', 本段结束状态: ['飞船启航 众人登船'], 登场角色: ['三月七', '丹恒'] }),
    ]);
    const body = '星港重逢 登船启程 飞船启航 众人登船 三月七 丹恒';
    expect(对齐(system, body).progressed).toBe(true);
    expect(对齐(system, body, { completed: false, reason: '', actualSegmentId: 'c' }).progressed).toBe(false);
    expect(对齐(system, body, { completed: false, reason: '', actualSegmentId: 'missing' }).progressed).toBe(true);
  });

  it('获取当前剧情分段返回锚点分段', () => {
    const system = 建系统([
      建分段({ id: 'c', 组号: 2, 运行状态: '当前' }),
      建分段({ id: 'n', 组号: 3, 运行状态: '未开始' }),
    ]);
    expect(获取当前剧情分段(system)?.id).toBe('c');
  });
});
