import { useMemo, useState } from 'react';
import type { 世界书, 世界书条目 } from '@/models/worldbook';
import { 创建空世界书条目, 创建空世界书 } from '@/models/worldbook';
import { exportWorldbooks, importWorldbooks, normalizeWorldbooks } from '@/utils/worldbook';
import { isBuiltinBook } from '@/utils/worldbookPredicates';

export type WorldbookTab = 'builtin' | 'user';

/**
 * 世界书管理弹窗的全部状态与动作：草稿维护、标签页切换、选中同步、
 * 条目增删改、导入导出与保存。宿主仅负责布局与事件接线。
 */
export function useWorldbookManager(props: {
  worldbooks: 世界书[];
  onSave: (books: 世界书[]) => void;
  onClose: () => void;
}) {
  const { worldbooks, onSave, onClose } = props;

  const [draft, setDraft] = useState<世界书[]>(() => normalizeWorldbooks(worldbooks));
  const [activeTab, setActiveTab] = useState<WorldbookTab>('builtin');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [prevWorldbooks, setPrevWorldbooks] = useState(worldbooks);
  if (prevWorldbooks !== worldbooks) {
    setPrevWorldbooks(worldbooks);
    setDraft(normalizeWorldbooks(worldbooks));
  }

  const filteredBooks = useMemo(
    () => (activeTab === 'builtin' ? draft.filter(isBuiltinBook) : draft.filter((book) => !isBuiltinBook(book))),
    [activeTab, draft],
  );

  const selectedBook = useMemo(
    () => filteredBooks.find((book) => book.id === selectedBookId) ?? filteredBooks.at(0) ?? null,
    [filteredBooks, selectedBookId],
  );

  const selectedEntry = useMemo(
    () => selectedBook?.entries.find((entry) => entry.id === selectedEntryId) ?? selectedBook?.entries.at(0) ?? null,
    [selectedBook, selectedEntryId],
  );

  const [prevFilteredBooks, setPrevFilteredBooks] = useState(filteredBooks);
  if (prevFilteredBooks !== filteredBooks) {
    setPrevFilteredBooks(filteredBooks);
    setSelectedBookId((current) => {
      if (current && filteredBooks.some((book) => book.id === current)) return current;
      return filteredBooks[0]?.id ?? null;
    });
  }

  const [prevSelectedBook, setPrevSelectedBook] = useState(selectedBook);
  const suspendRender = prevSelectedBook !== selectedBook && !selectedBook;
  if (prevSelectedBook !== selectedBook) {
    setPrevSelectedBook(selectedBook);
    if (!selectedBook) {
      setSelectedEntryId(null);
    } else {
      setSelectedEntryId((current) => {
        if (current && selectedBook.entries.some((entry) => entry.id === current)) return current;
        return selectedBook.entries[0]?.id ?? null;
      });
    }
  }

  const updateBook = (bookId: string, partial: Partial<世界书>) => {
    const rest = { ...partial };
    delete rest.builtin;
    setDraft((prev) =>
      prev.map((book) => (book.id === bookId ? { ...book, ...rest, updatedAt: Date.now() } : book)),
    );
  };

  const updateEntry = (bookId: string, entryId: string, partial: Partial<世界书条目>) => {
    setDraft((prev) =>
      prev.map((book) =>
        book.id !== bookId
          ? book
          : {
              ...book,
              updatedAt: Date.now(),
              entries: book.entries.map((entry) =>
                entry.id === entryId ? { ...entry, ...partial, updatedAt: Date.now() } : entry,
              ),
            },
      ),
    );
  };

  const handleNewBook = () => {
    const entry = 创建空世界书条目({ title: '新条目' });
    const book = 创建空世界书({ title: '新世界书', entries: [entry] });
    setDraft((prev) => [...prev, book]);
    setActiveTab('user');
    setSelectedBookId(book.id);
    setSelectedEntryId(entry.id);
  };

  const handleNewEntry = (bookId: string) => {
    const entry = 创建空世界书条目({ title: '新条目' });
    setDraft((prev) =>
      prev.map((book) =>
        book.id === bookId
          ? { ...book, updatedAt: Date.now(), entries: [...book.entries, entry] }
          : book,
      ),
    );
    setSelectedBookId(bookId);
    setSelectedEntryId(entry.id);
  };

  const handleDeleteBook = (bookId: string) => {
    if (!confirm('确定删除这本世界书？')) return;
    setDraft((prev) => prev.filter((book) => book.id !== bookId));
    setSelectedBookId(null);
  };

  const handleDeleteEntry = (bookId: string, entryId: string) => {
    if (!confirm('确定删除此条目？')) return;
    setDraft((prev) =>
      prev.map((book) =>
        book.id === bookId
          ? { ...book, updatedAt: Date.now(), entries: book.entries.filter((entry) => entry.id !== entryId) }
          : book,
      ),
    );
    setSelectedEntryId(null);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setIsImporting(true);
      try {
        const text = await file.text();
        setDraft((prev) => importWorldbooks(JSON.parse(text), prev));
        alert('世界书导入成功。');
      } catch {
        alert('导入失败，文件格式无效或读取异常。');
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleExport = () => {
    const json = JSON.stringify(exportWorldbooks(draft), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kaituo-worldbooks.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      onSave(normalizeWorldbooks(draft));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectEntry = (bookId: string, entryId: string) => {
    setSelectedBookId(bookId);
    setSelectedEntryId(entryId);
  };

  return {
    activeTab,
    setActiveTab,
    filteredBooks,
    selectedBook,
    selectedEntry,
    selectedEntryId,
    suspendRender,
    isImporting,
    isSaving,
    updateBook,
    updateEntry,
    handleNewBook,
    handleNewEntry,
    handleDeleteBook,
    handleDeleteEntry,
    handleImport,
    handleExport,
    handleSave,
    handleSelectEntry,
  };
}
