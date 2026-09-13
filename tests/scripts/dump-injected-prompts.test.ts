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
    // 规则标题以注册表为准（第一部分按 scope 分组导出），避免模块增删时硬编码标题过期。
    const { createBuiltinPromptModules } = await import('../../data/builtinPromptModules');
    const ruleTitles = createBuiltinPromptModules()
      .filter((m) => m.scope.includes('main'))
      .map((m) => m.title);
    expect(ruleTitles.length).toBeGreaterThan(0);
    for (const title of ruleTitles) {
      expect(markdown).toContain(`#### ${title}`);
    }
    for (const title of ['星际罗盘', '世界观', '命途纲要']) {
      expect(markdown).toContain(`### 《${title}》`);
    }
    // “叙事铁律”出现 2 次是因为该模块同时属于 main/opening 两个 scope 分组、各导出一次：
    // 断言“出现次数 = 同名模块的 scope 分组数”，改名/增减 scope 时自动跟随。
    const sameTitle = createBuiltinPromptModules().filter((m) => m.title === '叙事铁律');
    expect(sameTitle).toHaveLength(1);
    const expectedGroups = sameTitle.flatMap((m) => (m.scope.length ? m.scope : ['all']));
    expect(markdown.match(/#### 叙事铁律/g)).toHaveLength(expectedGroups.length);
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
