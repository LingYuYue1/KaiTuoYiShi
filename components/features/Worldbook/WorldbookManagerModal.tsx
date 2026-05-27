import { useEffect, useMemo, useState } from 'react';
import type { 世界书, 世界书条目, 世界书条目类型, 世界书注入方式 } from '@/models/worldbook';
import { 创建空世界书条目, 创建空世界书, ENTRY_TYPE_LABELS } from '@/models/worldbook';
import { exportWorldbooks, explainEntry, importWorldbooks, normalizeWorldbooks } from '@/utils/worldbook';
import { BUILTIN_BOOK_IDS } from '@/data/builtinWorldbookConfig';
import { STORY_MODE_BOOK_IDS } from '@/data/storyModeWorldbooks';

interface Props {
  worldbooks: 世界书[];
  onSave: (books: 世界书[]) => void;
  onClose: () => void;
}

type WorldbookTab = 'builtin' | 'user';

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const builtinIds: readonly string[] = BUILTIN_BOOK_IDS;
const storyModeIds: readonly string[] = STORY_MODE_BOOK_IDS;
const isBuiltinBook = (book: 世界书) => builtinIds.includes(book.id) || storyModeIds.includes(book.id);
const isStoryModeBook = (book: 世界书) => storyModeIds.includes(book.id);

export function WorldbookManagerModal({ worldbooks, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<世界书[]>(() => normalizeWorldbooks(worldbooks));
  const [activeTab, setActiveTab] = useState<WorldbookTab>('builtin');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(normalizeWorldbooks(worldbooks));
  }, [worldbooks]);

  const filteredBooks = useMemo(
    () => (activeTab === 'builtin' ? draft.filter(isBuiltinBook) : draft.filter((book) => !isBuiltinBook(book))),
    [activeTab, draft],
  );

  const selectedBook = useMemo(
    () => filteredBooks.find((book) => book.id === selectedBookId) ?? filteredBooks[0] ?? null,
    [filteredBooks, selectedBookId],
  );

  const selectedEntry = useMemo(
    () => selectedBook?.entries.find((entry) => entry.id === selectedEntryId) ?? selectedBook?.entries[0] ?? null,
    [selectedBook, selectedEntryId],
  );

  useEffect(() => {
    setSelectedBookId((current) => {
      if (current && filteredBooks.some((book) => book.id === current)) return current;
      return filteredBooks[0]?.id ?? null;
    });
  }, [filteredBooks]);

  useEffect(() => {
    if (!selectedBook) {
      setSelectedEntryId(null);
      return;
    }
    setSelectedEntryId((current) => {
      if (current && selectedBook.entries.some((entry) => entry.id === current)) return current;
      return selectedBook.entries[0]?.id ?? null;
    });
  }, [selectedBook]);

  const updateBook = (bookId: string, partial: Partial<世界书>) => {
    setDraft((prev) =>
      prev.map((book) => (book.id === bookId ? { ...book, ...partial, updatedAt: Date.now() } : book)),
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
      try {
        const text = await file.text();
        setDraft((prev) => importWorldbooks(JSON.parse(text), prev));
        alert('世界书导入成功。');
      } catch {
        alert('导入失败，文件格式无效。');
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
    onSave(normalizeWorldbooks(draft));
    onClose();
  };

  const handleSelectEntry = (bookId: string, entryId: string) => {
    setSelectedBookId(bookId);
    setSelectedEntryId(entryId);
  };

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-[150] flex items-stretch justify-center p-0 md:items-center md:p-2"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[100dvh] w-full min-w-0 max-w-[1280px] animate-slide-up flex-col overflow-hidden md:h-[90vh]"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.97), rgba(var(--tj-bg-primary), 0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45), 0 0 32px rgba(var(--tj-accent-primary), 0.12), 0 20px 60px rgba(0, 0, 0, 0.6)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
        }}
      >
        <header
          className="flex flex-col gap-2 px-3 pb-2 pt-3 md:flex-row md:items-end md:justify-between md:gap-3 md:px-6 md:pb-3 md:pt-4"
          style={{
            borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.28)',
            background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.06), rgba(var(--tj-accent-primary), 0))',
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="text-[10px] font-serif tracking-[0.34em] md:text-xs md:tracking-[0.45em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.65)' }}>
                ◆ INDEX
              </span>
              <h2
                className="font-serif text-[24px] font-semibold leading-tight tracking-[0.12em] md:text-2xl md:tracking-[0.3em]"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                如我所书 · 世界书
              </h2>
            </div>
            <p className="mt-1 font-serif text-[10px] italic leading-relaxed tracking-[0.08em] md:mt-1.5 md:text-[11px] md:tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              内置规范与额外世界书分流管理，保存后参与后续剧情生成。
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 md:gap-2">
            {activeTab === 'user' && (
              <HeaderButton onClick={handleNewBook} primary>
                ＋ 新建世界书
              </HeaderButton>
            )}
            <HeaderButton onClick={handleImport}>导入</HeaderButton>
            <HeaderButton onClick={handleExport}>导出</HeaderButton>
            <button
              onClick={onClose}
              className="ml-1 px-2 py-1 text-sm font-serif tracking-wider transition-all hover:opacity-80 md:py-1.5 md:text-base"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}
              title="关闭"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="flex max-h-[46dvh] w-full flex-shrink-0 flex-col md:max-h-none md:w-[300px]" style={{ borderRight: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
            <div className="flex gap-1 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}>
              <TabButton active={activeTab === 'builtin'} onClick={() => setActiveTab('builtin')} label="内置" />
              <TabButton active={activeTab === 'user'} onClick={() => setActiveTab('user')} label="额外" />
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-3">
              {filteredBooks.length === 0 ? (
                <EmptyList activeTab={activeTab} />
              ) : (
                renderBookSections(filteredBooks, {
                  selectedBookId: selectedBook?.id ?? null,
                  selectedEntryId,
                  onSelectEntry: handleSelectEntry,
                  onToggleBook: (bookId, enabled) => updateBook(bookId, { enabled }),
                })
              )}
            </div>

            <div className="flex gap-2 p-3" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
              <button onClick={handleSave} className="kaituo-btn kaituo-btn-primary flex-1 py-1.5 text-sm">
                <span className="relative">保存</span>
              </button>
              <button onClick={onClose} className="kaituo-btn kaituo-btn-secondary flex-1 py-1.5 text-sm">
                取消
              </button>
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {selectedBook && selectedEntry ? (
              <EntryPane
                book={selectedBook}
                entry={selectedEntry}
                builtin={isBuiltinBook(selectedBook)}
                onUpdateBook={(partial) => updateBook(selectedBook.id, partial)}
                onDeleteBook={() => handleDeleteBook(selectedBook.id)}
                onNewEntry={() => handleNewEntry(selectedBook.id)}
                onUpdateEntry={(partial) => updateEntry(selectedBook.id, selectedEntry.id, partial)}
                onDeleteEntry={() => handleDeleteEntry(selectedBook.id, selectedEntry.id)}
              />
            ) : selectedBook ? (
              <EmptyBookPane
                book={selectedBook}
                builtin={isBuiltinBook(selectedBook)}
                onUpdateBook={(partial) => updateBook(selectedBook.id, partial)}
                onDeleteBook={() => handleDeleteBook(selectedBook.id)}
                onNewEntry={() => handleNewEntry(selectedBook.id)}
              />
            ) : (
              <EmptyHint text={activeTab === 'user' ? '尚未创建额外世界书' : '内置世界书加载异常'} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function HeaderButton({ children, onClick, primary = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-[11px] font-serif tracking-[0.12em] transition-all hover:opacity-90 md:px-3 md:py-1.5 md:text-xs md:tracking-[0.2em]"
      style={{
        color: primary ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(var(--tj-text-secondary), 0.9)',
        boxShadow: `inset 0 0 0 1px ${primary ? 'rgba(var(--tj-accent-primary), 0.55)' : 'rgba(var(--tj-accent-primary), 0.3)'}`,
        background: primary ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.12), rgba(var(--tj-accent-primary), 0.02))' : 'transparent',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-2 py-1.5 text-xs font-serif tracking-[0.25em] transition-all"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.7)',
        background: active ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04))' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)' : 'none',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function renderBookSections(
  books: 世界书[],
  ctx: {
    selectedBookId: string | null;
    selectedEntryId: string | null;
    onSelectEntry: (bookId: string, entryId: string) => void;
    onToggleBook: (bookId: string, enabled: boolean) => void;
  },
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let storyGroupOpen = false;

  for (const book of books) {
    const isStory = isStoryModeBook(book);
    if (isStory && !storyGroupOpen) {
      nodes.push(<GroupTitle key="__story_group__" title="剧情模式" />);
      storyGroupOpen = true;
    }
    if (!isStory) storyGroupOpen = false;

    nodes.push(
      <BookSection
        key={book.id}
        book={book}
        builtin={isBuiltinBook(book)}
        compact={isStory}
        selectedEntryId={ctx.selectedBookId === book.id ? ctx.selectedEntryId : null}
        onSelectEntry={(entryId) => ctx.onSelectEntry(book.id, entryId)}
        onToggleBook={(enabled) => ctx.onToggleBook(book.id, enabled)}
      />,
    );
  }
  return nodes;
}

function GroupTitle({ title }: { title: string }) {
  return (
    <section className="mb-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="h-5 w-[3px] flex-shrink-0"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.25))',
            boxShadow: '0 0 7px rgba(var(--tj-accent-primary), 0.45)',
          }}
        />
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-serif text-base font-semibold tracking-[0.28em]"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {title}
          </div>
          <div
            className="mt-1 h-px"
            style={{
              background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.45), rgba(var(--tj-accent-primary), 0.08), transparent)',
            }}
          />
        </div>
      </div>
    </section>
  );
}

function BookSection({
  book,
  builtin,
  compact = false,
  selectedEntryId,
  onSelectEntry,
  onToggleBook,
}: {
  book: 世界书;
  builtin: boolean;
  compact?: boolean;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  onToggleBook: (enabled: boolean) => void;
}) {
  return (
    <section className="mb-5">
      {compact ? (
        <div className="mb-1.5 flex items-center gap-2 px-2">
          <span
            className="font-serif text-[12px] tracking-[0.22em]"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}
          >
            · {book.title || '未命名世界书'}
          </span>
          {!builtin && (
            <span className="ml-auto">
              <ToggleSwitch checked={book.enabled} onChange={onToggleBook} title="启用整本" />
            </span>
          )}
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span
            className="h-5 w-[3px] flex-shrink-0"
            style={{
              background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.25))',
              boxShadow: '0 0 7px rgba(var(--tj-accent-primary), 0.45)',
            }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-serif text-base font-semibold tracking-[0.28em]"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {book.title || '未命名世界书'}
            </div>
            <div
              className="mt-1 h-px"
              style={{
                background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.45), rgba(var(--tj-accent-primary), 0.08), transparent)',
              }}
            />
          </div>
          {!builtin && <ToggleSwitch checked={book.enabled} onChange={onToggleBook} title="启用整本" />}
        </div>
      )}

      {book.entries.length === 0 ? (
        <div className="pl-[13px] text-[11px] font-serif tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
          暂无条目
        </div>
      ) : (
        <div className="space-y-1.5 pl-[13px]">
          {book.entries.map((entry) => {
            const active = selectedEntryId === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.05)]"
                style={{
                  background: active
                    ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.14), rgba(var(--tj-accent-primary), 0.02))'
                    : 'rgba(var(--tj-accent-primary), 0.018)',
                  boxShadow: active ? 'inset 2px 0 0 rgba(var(--tj-accent-primary), 0.9)' : 'inset 2px 0 0 rgba(var(--tj-accent-primary), 0.12)',
                  clipPath: smallClip,
                }}
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{
                    background: entry.enabled ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(80, 70, 50, 0.55)',
                    boxShadow: entry.enabled ? '0 0 4px rgba(var(--tj-accent-primary), 0.5)' : 'none',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-serif text-[13px] tracking-[0.18em]"
                    style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.9)' }}
                  >
                    {entry.title || '未命名条目'}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                    {ENTRY_TYPE_LABELS[entry.type]} · 优先级 {entry.priority}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PaneHeader({
  book,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
}: {
  book: 世界书;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
}) {
  return (
    <div className="px-4 py-4 md:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.22)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          {builtin ? (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-6 w-[3px] flex-shrink-0"
                style={{
                  background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.25))',
                  boxShadow: '0 0 7px rgba(var(--tj-accent-primary), 0.45)',
                }}
              />
              <h3
                className="min-w-0 font-serif text-lg font-semibold tracking-[0.16em] sm:text-xl sm:tracking-[0.28em]"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 55%, rgb(var(--tj-accent-secondary)) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {book.title}
              </h3>
            </div>
          ) : (
            <>
              <input
                value={book.title}
                onChange={(event) => onUpdateBook({ title: event.target.value })}
                className="w-full bg-transparent font-serif text-xl font-semibold tracking-[0.25em] outline-none focus:bg-[rgba(var(--tj-accent-primary),0.05)]"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              />
              <input
                value={book.description}
                onChange={(event) => onUpdateBook({ description: event.target.value })}
                placeholder="描述或注释，可选"
                className="mt-1.5 w-full bg-transparent text-xs font-serif italic tracking-wider outline-none focus:bg-[rgba(var(--tj-accent-primary),0.05)]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}
              />
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {!builtin && (
            <>
              <span className="text-xs font-serif tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>
                {book.enabled ? '启用' : '关闭'}
              </span>
              <ToggleSwitch checked={book.enabled} onChange={(enabled) => onUpdateBook({ enabled })} title="启用整本" />
              <button
                onClick={onNewEntry}
                className="ml-2 px-3 py-1.5 text-xs font-serif tracking-[0.2em] transition-all hover:opacity-90"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.95)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
                  background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.11), rgba(var(--tj-accent-primary), 0.02))',
                  clipPath: smallClip,
                }}
              >
                ＋ 新建条目
              </button>
              <button
                onClick={onDeleteBook}
                className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  color: 'rgba(220, 120, 120, 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
                  clipPath: smallClip,
                }}
              >
                删除书
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryPane({
  book,
  entry,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
  onUpdateEntry,
  onDeleteEntry,
}: {
  book: 世界书;
  entry: 世界书条目;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
  onUpdateEntry: (partial: Partial<世界书条目>) => void;
  onDeleteEntry: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PaneHeader
        book={book}
        builtin={builtin}
        onUpdateBook={onUpdateBook}
        onDeleteBook={onDeleteBook}
        onNewEntry={onNewEntry}
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
        <EntryEditor entry={entry} builtin={builtin} onChange={onUpdateEntry} onDelete={onDeleteEntry} />
      </div>
    </div>
  );
}

function EmptyBookPane({
  book,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
}: {
  book: 世界书;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PaneHeader
        book={book}
        builtin={builtin}
        onUpdateBook={onUpdateBook}
        onDeleteBook={onDeleteBook}
        onNewEntry={onNewEntry}
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
        <EmptyHint text={builtin ? '内置书暂无条目' : '本书暂无条目，点击右上角「＋ 新建条目」'} />
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  builtin,
  onChange,
  onDelete,
}: {
  entry: 世界书条目;
  builtin: boolean;
  onChange: (partial: Partial<世界书条目>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-serif text-xs tracking-[0.35em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>
          {builtin ? '内置条目' : '条目'}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-serif tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>
            {entry.enabled ? '启用' : '关闭'}
          </span>
          <ToggleSwitch checked={entry.enabled} onChange={(enabled) => onChange({ enabled })} title="启用条目" />
        </div>
      </div>

      <Field label="条目标题">
        <input
          value={entry.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="条目标题"
          className="kaituo-input w-full px-3 py-2 text-sm font-serif tracking-wider"
          style={{ clipPath: smallClip }}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="类型">
          <select
            value={entry.type}
            onChange={(event) => onChange({ type: event.target.value as 世界书条目类型 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip }}
          >
            {(Object.entries(ENTRY_TYPE_LABELS) as [世界书条目类型, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="注入模式">
          <select
            value={entry.injectMode}
            onChange={(event) => onChange({ injectMode: event.target.value as 世界书注入方式 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip }}
          >
            <option value="always">始终注入</option>
            <option value="keyword_match">关键词匹配</option>
          </select>
        </Field>
        <Field label="回合守卫">
          <select
            value={entry.turnGuard ?? ''}
            onChange={(event) =>
              onChange({ turnGuard: event.target.value === 'first_only' ? 'first_only' : undefined })
            }
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip }}
          >
            <option value="">每回合注入</option>
            <option value="first_only">仅首回合</option>
          </select>
        </Field>
        <Field label="优先级">
          <input
            type="number"
            value={entry.priority}
            onChange={(event) => onChange({ priority: Number(event.target.value) || 0 })}
            min={0}
            max={999}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip }}
          />
        </Field>
      </div>

      {entry.injectMode === 'keyword_match' && (
        <Field label="触发关键词（逗号分隔）">
          <input
            value={entry.keywords.join(', ')}
            onChange={(event) =>
              onChange({
                keywords: event.target.value
                  .split(/[,,]/)
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
            placeholder="关键词，逗号分隔"
            className="kaituo-input w-full px-3 py-2 text-xs"
            style={{ clipPath: smallClip }}
          />
        </Field>
      )}

      <div
        className="px-3 py-2 text-xs font-serif tracking-wider"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.75)',
          background: 'rgba(var(--tj-accent-primary), 0.04)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: cardClip,
        }}
      >
        <span style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>◆ </span>
        {explainEntry(entry)}
      </div>

      <Field label="条目内容">
        <textarea
          value={entry.content}
          onChange={(event) => onChange({ content: event.target.value })}
          rows={16}
          placeholder="条目内容"
          className="kaituo-input w-full resize-none px-3 py-2.5 text-sm leading-relaxed"
          style={{ clipPath: smallClip }}
        />
      </Field>

      {!builtin && (
        <button
          onClick={onDelete}
          className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
          style={{
            color: 'rgba(220, 120, 120, 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
            clipPath: smallClip,
          }}
        >
          删除此条目
        </button>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, title }: { checked: boolean; onChange: (checked: boolean) => void; title?: string }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className="relative inline-flex h-[18px] w-[34px] flex-shrink-0 cursor-pointer items-center transition-all"
      style={{
        background: checked
          ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.55), rgba(var(--tj-accent-secondary), 0.75))'
          : 'rgba(28, 25, 28, 0.85)',
        boxShadow: checked
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.8), 0 0 6px rgba(var(--tj-accent-primary), 0.35)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
        borderRadius: 10,
      }}
    >
      <span
        className="absolute h-[12px] w-[12px] transition-all"
        style={{
          left: checked ? 18 : 3,
          background: checked ? 'rgb(var(--tj-text-primary))' : 'rgba(180, 168, 140, 0.85)',
          boxShadow: '0 0 3px rgba(0,0,0,0.4)',
          borderRadius: 6,
        }}
      />
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-serif tracking-[0.3em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function EmptyList({ activeTab }: { activeTab: WorldbookTab }) {
  return (
    <div className="px-4 py-10 text-center text-xs font-serif leading-6 tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
      {activeTab === 'user' ? '尚无额外世界书\n点击顶部「＋ 新建世界书」' : '内置世界书加载异常'}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <div className="text-center">
        <div className="mb-3 text-4xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.28)' }}>
          ◇
        </div>
        <div className="whitespace-pre-line text-sm font-serif tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
          {text}
        </div>
      </div>
    </div>
  );
}
