// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InjectionContentFields } from '@/components/features/GameSystems/zhiku/injectionContent';
import { ZhikuPanel } from '@/components/features/GameSystems/ZhikuPanel';
import type { 智库系统 } from '@/models/zhiku';
import { 创建智库条目, 归一化智库系统 } from '@/models/zhiku';
import { 创建默认智库系统设置 } from '@/models/settings';

const LORE_FIELDS = ['核心定义', '关键事实', '叙事用途', '演绎边界'] as const;
const CHARACTER_FIELDS = [
  '核心身份与阵营',
  '独立人格与行为',
  '外貌锚点',
  '说话方式',
  '台词语料',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
] as const;

describe('InjectionContentFields', () => {
  it('设定分类渲染 4 个注入字段并向外传播更新', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <InjectionContentFields
        category="term"
        editable
        onChange={onChange}
      />,
    );
    for (const field of LORE_FIELDS) {
      expect(screen.getByLabelText(field)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('人物结构')).toBeNull();

    fireEvent.change(screen.getByLabelText('核心定义'), { target: { value: '新的核心定义内容' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ 类型: 'lore', 核心定义: '新的核心定义内容' }),
    );
    unmount();
  });

  it('人物分类渲染 8 个注入字段', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <InjectionContentFields
        category="character"
        editable
        onChange={onChange}
      />,
    );
    for (const field of CHARACTER_FIELDS) {
      expect(screen.getByLabelText(field)).toBeInTheDocument();
    }
    // 编回 lore 的字段不属于人物。
    expect(screen.queryByLabelText('核心定义')).toBeNull();
    unmount();
  });

  it('剧情分类不渲染注入字段', () => {
    const { unmount } = render(
      <InjectionContentFields
        category="story"
        editable
        onChange={vi.fn()}
      />,
    );
    for (const field of LORE_FIELDS) {
      expect(screen.queryByLabelText(field)).toBeNull();
    }
    unmount();
  });
});

describe('ZhikuPanel 自制条目保存硬门禁', () => {
  const bundledEntry = 创建智库条目({
    标题: '内置术语',
    分类: 'term',
    原文: '内置正文',
    builtin: true,
  });

  const renderPanel = () => {
    const onZhikuSystemChange = vi.fn();
    const onSaveZhikuSystem = vi.fn(() => Promise.resolve());
    const onZhikuMigration = vi.fn(() => Promise.reject(new Error('unused')));
    const view = render(
      <ZhikuPanel
        zhikuSystem={归一化智库系统({ 条目: [bundledEntry] })}
        onZhikuSystemChange={onZhikuSystemChange}
        settings={创建默认智库系统设置()}
        onSaveZhikuSystem={onSaveZhikuSystem}
        onZhikuMigration={onZhikuMigration}
      />,
    );
    return { view, onZhikuSystemChange, onSaveZhikuSystem };
  };

  const openComposer = async () => {
    fireEvent.click(screen.getByRole('button', { name: '自制' }));
    const write = await screen.findByText('WRITE');
    return write as unknown as HTMLButtonElement;
  };

  it('注入内容为空的自制条目必须显示错误并且不进入保存', async () => {
    const { view, onZhikuSystemChange, onSaveZhikuSystem } = renderPanel();
    const write = await openComposer();

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '自制术语条目' } });
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: '自制条目的正文内容足够长。' } });
    // 分类切换为 term 后，注入内容 4 个字段全部留空。
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'term' } });
    if (!write.disabled) {
      fireEvent.click(write);
    }
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSaveZhikuSystem).not.toHaveBeenCalled();
    expect(onZhikuSystemChange).not.toHaveBeenCalled();
    // 条目没有被加入系统：保存门禁拦截后仍停留在编辑态。
    expect(screen.getByLabelText('标题')).toBeInTheDocument();
    view.unmount();
  });

  it('注入内容齐全的自制条目可以保存并持久化', async () => {
    const { onZhikuSystemChange, onSaveZhikuSystem } = renderPanel();
    await openComposer();

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '自制术语条目' } });
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'term' } });
    for (const [field, value] of [
      ['核心定义', '核心定义内容。'],
      ['关键事实', '关键事实内容。'],
      ['叙事用途', '叙事用途内容。'],
      ['演绎边界', '演绎边界内容。'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(field), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: '自制条目的正文内容足够长。' } });
    fireEvent.click(screen.getByText('WRITE'));

    await waitFor(() => expect(onSaveZhikuSystem).toHaveBeenCalledTimes(1));
    expect(onZhikuSystemChange).toHaveBeenCalled();
    const saved = (onSaveZhikuSystem.mock as unknown as { calls: Array<[智库系统]> }).calls[0]?.[0];
    const created = saved.条目.find((entry) => entry.标题 === '自制术语条目');
    expect(created).toBeDefined();
    expect(created?.builtin).toBe(false);
    expect(created?.原文).toBe('自制条目的正文内容足够长。');
    expect(created?.注入内容).toEqual({
      类型: 'lore',
      核心定义: '核心定义内容。',
      关键事实: '关键事实内容。',
      叙事用途: '叙事用途内容。',
      演绎边界: '演绎边界内容。',
    });
  });
});
