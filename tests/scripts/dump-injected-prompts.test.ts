import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('注入提示词导出', () => {
  it('写出包含规则模块与内置世界书标题的完整 Markdown', async () => {
    vi.resetModules();
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../../scripts/dump-injected-prompts');
    } finally {
      log.mockRestore();
    }

    expect(mkdirSync).toHaveBeenCalledWith('docs/generated', { recursive: true });
    const markdown = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(writeFileSync).toHaveBeenCalledWith('docs/generated/injected-prompts-full-content.md', markdown, 'utf8');
    for (const title of ['首回合输出规范', '叙事铁律', '禁词与反八股文规则', '情绪真实性约束', '战斗描写规范', '时间推进与变量落库', '力量体系总览', '命途狭间·三问桥段']) {
      expect(markdown).toContain(`#### ${title}`);
    }
    for (const title of ['星际罗盘', '世界观', '命途纲要']) {
      expect(markdown).toContain(`### 《${title}》`);
    }
    expect(markdown.match(/#### 叙事铁律/g)).toHaveLength(2);
  });

  it('每个内置模块都出现在导出文档中，未知 scope 不被静默丢弃', async () => {
    vi.resetModules();
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../../scripts/dump-injected-prompts');
    } finally {
      log.mockRestore();
    }

    const { createBuiltinPromptModules } = await import('../../data/builtinPromptModules');
    const markdown = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    for (const m of createBuiltinPromptModules()) {
      expect(markdown).toContain(`#### ${m.title}`);
    }
  });
});
