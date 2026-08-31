// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EntryPane } from '@/components/features/Worldbook/entryPane';
import { importWorldbooks, normalizeWorldbooks, reconcileBuiltinWorldbooks } from '@/utils/worldbook';
import { isBuiltinBook } from '@/utils/worldbookPredicates';
import { 创建空世界书, 创建空世界书条目, type 世界书 } from '@/models/worldbook';

function EntryPaneHarness({ initialBook, builtin }: { initialBook: 世界书; builtin: boolean }) {
  const [entry, setEntry] = useState(initialBook.entries[0]);
  return createElement(EntryPane, {
    book: { ...initialBook, entries: [entry] },
    entry,
    builtin,
    onUpdateBook: () => undefined,
    onDeleteBook: () => undefined,
    onNewEntry: () => undefined,
    onUpdateEntry: (partial) => setEntry((current) => ({ ...current, ...partial })),
    onDeleteEntry: () => undefined,
  });
}

function renderEntryPane(book: 世界书, builtin: boolean) {
  return render(createElement(EntryPaneHarness, { initialBook: book, builtin }));
}

function stripBuiltin(book: 世界书): 世界书 {
  const { builtin: _builtin, ...rest } = book;
  return rest as 世界书;
}

describe('内置世界书同步', () => {
  it('缺 builtin 且 id 为现行内置 id 时补成内置书', () => {
    const [tagged] = normalizeWorldbooks([stripBuiltin(创建空世界书({ id: 'builtin_compass', title: '罗盘' }))]);
    expect(tagged.builtin).toBe(true);
    expect(isBuiltinBook(tagged)).toBe(true);
  });

  it('缺 builtin 且 id 为普通用户 id 时保持额外书', () => {
    const [tagged] = normalizeWorldbooks([stripBuiltin(创建空世界书({ id: 'wb_user_custom', title: '玩家书' }))]);
    expect(tagged.builtin).toBe(false);
    expect(isBuiltinBook(tagged)).toBe(false);

    const source = 创建空世界书({ id: 'builtin_compass', builtin: true, title: '源码罗盘' });
    const merged = reconcileBuiltinWorldbooks({
      sourceBuiltins: [source],
      archivedWorldbooks: [tagged],
    });
    expect(merged).toEqual([source, tagged]);
  });

  it('以源码合并内置书，保留归档开关与时间戳', () => {
    const sourceEntry = 创建空世界书条目({ id: 'source-entry', title: '源码条目', content: 'source', scope: ['main'] });
    const missingEntry = 创建空世界书条目({ id: 'missing-entry', title: '缺失条目', content: 'missing', scope: ['main'] });
    const sourceBook = 创建空世界书({ id: 'builtin-source', builtin: true, entries: [sourceEntry, missingEntry] });
    const calibrationBook = 创建空世界书({
      id: 'builtin-calibration',
      builtin: true,
      entries: [创建空世界书条目({ id: 'calibration-entry', content: 'calibration source', scope: ['calibration'] })],
    });
    const archivedBook = {
      ...sourceBook,
      enabled: false,
      entries: [{
        ...sourceEntry,
        content: 'edited archive',
        type: 'atmosphere' as const,
        keywords: ['archive'],
        priority: 1,
        enabled: false,
        createdAt: 11,
        updatedAt: 12,
      }],
    };
    const archivedCalibration = {
      ...calibrationBook,
      entries: [{ ...calibrationBook.entries[0], content: 'edited calibration archive', enabled: false }],
    };
    const merged = reconcileBuiltinWorldbooks({
      sourceBuiltins: [sourceBook, calibrationBook],
      archivedWorldbooks: [archivedBook, archivedCalibration],
    });
    const mergedEntry = merged.find((book) => book.id === sourceBook.id)!.entries[0];

    expect(mergedEntry).toMatchObject({
      content: 'source',
      type: 'world_lore',
      keywords: [],
      priority: 100,
      enabled: false,
      createdAt: 11,
      updatedAt: 12,
    });
    expect(merged.find((book) => book.id === sourceBook.id)!.entries[1]).toEqual(missingEntry);
    expect(merged.find((book) => book.id === calibrationBook.id)).toBe(calibrationBook);
  });

  it('存档内置书已不在源码中时丢掉', () => {
    const source = 创建空世界书({ id: 'builtin_compass', builtin: true, title: '源码罗盘' });
    const stale = 创建空世界书({ id: 'stale_builtin', builtin: true, title: '已退役' });
    const extra = 创建空世界书({ id: 'wb_player', builtin: false, title: '玩家书' });
    const merged = reconcileBuiltinWorldbooks({
      sourceBuiltins: [source],
      archivedWorldbooks: [stale, extra],
    });
    expect(merged.map((book) => book.id)).toEqual([source.id, extra.id]);
  });

  it('导入不能伪造或覆盖内置书', () => {
    const source = 创建空世界书({ id: 'builtin_compass', builtin: true, title: '源码罗盘' });
    const extra = 创建空世界书({ id: 'wb_player', builtin: false, title: '玩家书' });
    const merged = importWorldbooks(
      {
        version: 1,
        exportedAt: 1,
        books: [
          { ...source, title: '伪造内置', builtin: true },
          { ...extra, title: '导入覆盖玩家书' },
        ],
      },
      [source, extra],
    );

    expect(merged.find((book) => book.id === source.id)).toMatchObject({ title: '源码罗盘', builtin: true });
    expect(merged.find((book) => book.id === extra.id)).toMatchObject({ title: '导入覆盖玩家书', builtin: false });
    const forged = merged.find((book) => book.title === '伪造内置');
    expect(forged).toBeDefined();
    expect(forged?.builtin).toBe(false);
    expect(forged?.id).not.toBe(source.id);
  });

  it('归档为空数组时原样返回源码内置书', () => {
    const sourceBook = 创建空世界书({ id: 'builtin-source', builtin: true });
    const builtins = [sourceBook];
    expect(reconcileBuiltinWorldbooks({ sourceBuiltins: builtins, archivedWorldbooks: [] })).toBe(builtins);
  });

  it('内置非校准条目的内容字段锁定，但开关能改变显示状态', () => {
    const builtinBook = 创建空世界书({ builtin: true, entries: [创建空世界书条目({ content: 'builtin', scope: ['main'] })] });
    renderEntryPane(builtinBook, true);
    expect(screen.getByLabelText('条目标题')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('条目内容')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('类型')).toBeDisabled();
    fireEvent.click(screen.getByTitle('启用条目'));
    expect(screen.getByTitle('启用条目')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('关闭')).toBeInTheDocument();
  });

  it('校准条目不响应开关交互', () => {
    const calibrationBook = 创建空世界书({ builtin: true, entries: [创建空世界书条目({ content: 'calibration', scope: ['calibration'] })] });
    renderEntryPane(calibrationBook, true);
    const calibrationSwitch = screen.getByRole('switch');
    expect(calibrationSwitch).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(calibrationSwitch);
    expect(calibrationSwitch).toHaveAttribute('aria-checked', 'true');
  });

  it('用户条目的编辑会显示在控件值中', () => {
    const userBook = 创建空世界书({ entries: [创建空世界书条目({ content: 'user', scope: ['main'] })] });
    renderEntryPane(userBook, false);
    const userTitle = screen.getByLabelText('条目标题');
    const userType = screen.getByLabelText('类型');
    const userContent = screen.getByLabelText('条目内容');
    expect(userTitle).not.toHaveAttribute('readonly');
    expect(userType).toBeEnabled();
    expect(userContent).not.toHaveAttribute('readonly');
    fireEvent.change(userTitle, { target: { value: '新标题' } });
    fireEvent.change(userType, { target: { value: 'atmosphere' } });
    fireEvent.change(userContent, { target: { value: '新内容' } });
    fireEvent.click(screen.getByRole('button', { name: /高级触发控制/ }));
    expect(userTitle).toHaveValue('新标题');
    expect(userType).toHaveValue('atmosphere');
    expect(userContent).toHaveValue('新内容');
    expect(screen.getByLabelText('大小写敏感')).toBeEnabled();
  });
});
