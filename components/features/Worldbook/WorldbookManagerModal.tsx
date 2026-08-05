import { useEffect, useMemo, useState } from 'react';
import type { 世界书, 世界书条目, 世界书条目类型, 世界书注入方式 } from '@/models/worldbook';
import { 创建空世界书条目, 创建空世界书, ENTRY_TYPE_LABELS } from '@/models/worldbook';
import { exportWorldbooks, explainEntry, importWorldbooks, normalizeWorldbooks } from '@/utils/worldbook';
import { BUILTIN_BOOK_IDS } from '@/data/builtinWorldbookConfig';

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
const isBuiltinBook = (book: 世界书) => builtinIds.includes(book.id);
const isCalibrationEntry = (entry: 世界书条目) => entry.scope?.includes('calibration') === true;
const isCalibrationBook = (book: 世界书) => book.entries.some(isCalibrationEntry);

export function WorldbookManagerModal({ worldbooks, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<世界书[]>(() => normalizeWorldbooks(worldbooks));
  const [activeTab, setActiveTab] = useState<WorldbookTab>('builtin');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-[150] flex items-stretch justify-center p-0 md:items-center md:p-2"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[100dvh] w-full min-w-0 max-w-[1100px] animate-slide-up flex-col overflow-hidden md:h-[90vh] lg:max-w-[1280px]"
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
            <p className="mt-1 font-serif text-[10px] italic leading-relaxed tracking-[0.08em] md:mt-1.5 md:text-[11px] md:tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              内置规范与额外世界书分流管理；主剧情世界书保存后参与生成，独立模型资料仅作真实请求展示。
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
              className="ml-1 cursor-pointer px-2 py-1 text-sm font-serif tracking-wider transition-all duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)] md:py-1.5 md:text-base"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
              title="关闭"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="flex max-h-[46dvh] w-full flex-shrink-0 flex-col md:max-h-none md:w-[300px] lg:w-[340px]" style={{ borderRight: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
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
              <button
                onClick={handleSave}
                disabled={isSaving || isImporting}
                className="kaituo-btn kaituo-btn-primary flex-1 cursor-pointer py-1.5 text-sm transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="relative">{isSaving ? '保存中…' : isImporting ? '导入中…' : '保存'}</span>
              </button>
              <button
                onClick={onClose}
                disabled={isSaving || isImporting}
                className="kaituo-btn kaituo-btn-secondary flex-1 cursor-pointer py-1.5 text-sm transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.4)] disabled:cursor-not-allowed disabled:opacity-60"
              >
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
      className="cursor-pointer px-2 py-1 text-[11px] font-serif tracking-[0.12em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)] md:px-3 md:py-1.5 md:text-xs md:tracking-[0.2em]"
      style={{
        color: primary ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))' : 'rgba(var(--tj-text-secondary), 0.9)',
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
      className="flex-1 cursor-pointer px-2 py-1.5 text-xs font-serif tracking-[0.25em] transition-all duration-200 hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.5)]"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.75)',
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

  for (const book of books) {
    nodes.push(
      <BookSection
        key={book.id}
        book={book}
        builtin={isBuiltinBook(book)}
        selectedEntryId={ctx.selectedBookId === book.id ? ctx.selectedEntryId : null}
        onSelectEntry={(entryId) => ctx.onSelectEntry(book.id, entryId)}
        onToggleBook={(enabled) => ctx.onToggleBook(book.id, enabled)}
      />,
    );
  }
  return nodes;
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
              background: 'linear-gradient(180deg, linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92)), rgba(var(--tj-accent-secondary), 0.25))',
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
        <div className="pl-[13px] text-[11px] font-serif tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
          暂无条目
        </div>
      ) : (
        <div className="space-y-1.5 pl-[13px]">
          {book.entries.map((entry) => {
            const active = selectedEntryId === entry.id;
            const calibrationDisplay = builtin && isCalibrationEntry(entry);
            return (
              <button
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-all duration-200 hover:bg-[rgba(var(--tj-accent-primary),0.08)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.5)]"
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
                    background: calibrationDisplay || entry.enabled ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))' : 'rgba(var(--tj-text-secondary), 0.4)',
                    boxShadow: calibrationDisplay || entry.enabled ? '0 0 4px rgba(var(--tj-accent-primary), 0.5)' : 'none',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-serif text-[13px] tracking-[0.18em]"
                    style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.9)' }}
                  >
                    {entry.title || '未命名条目'}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    {calibrationDisplay ? '独立模型展示' : ENTRY_TYPE_LABELS[entry.type]} · 优先级 {entry.priority}
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
  const calibrationDisplay = builtin && isCalibrationBook(book);
  return (
    <div className="px-4 py-4 md:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.22)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          {builtin ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-6 w-[3px] flex-shrink-0"
                  style={{
                    background: 'linear-gradient(180deg, linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92)), rgba(var(--tj-accent-secondary), 0.25))',
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
              {calibrationDisplay && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                  独立模型资料展示：真实新闻、手机、变量、智库等请求由服务层源码常量构建；这里用于核对内容，不作为开关或编辑入口。
                </p>
              )}
            </>
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
              <span
                className="text-xs font-serif tracking-[0.2em]"
                style={{ color: book.enabled ? 'rgba(var(--tj-accent-primary), 0.92)' : 'rgba(var(--tj-text-secondary), 0.6)' }}
              >
                {book.enabled ? '启用' : '关闭'}
              </span>
              <ToggleSwitch checked={book.enabled} onChange={(enabled) => onUpdateBook({ enabled })} title="启用整本" />
              <button
                onClick={onNewEntry}
                className="ml-2 cursor-pointer px-3 py-1.5 text-xs font-serif tracking-[0.2em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)]"
                style={{
                  color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
                  background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.11), rgba(var(--tj-accent-primary), 0.02))',
                  clipPath: smallClip,
                }}
              >
                ＋ 新建条目
              </button>
              <button
                onClick={onDeleteBook}
                className="cursor-pointer px-3 py-1.5 text-xs font-serif tracking-wider transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-danger),0.5)]"
                style={{
                  color: 'rgb(var(--tj-danger))',
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
        <EntryEditor
          entry={entry}
          builtin={builtin}
          calibrationDisplay={builtin && isCalibrationEntry(entry)}
          onChange={onUpdateEntry}
          onDelete={onDeleteEntry}
        />
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
  calibrationDisplay,
  onChange,
  onDelete,
}: {
  entry: 世界书条目;
  builtin: boolean;
  calibrationDisplay: boolean;
  onChange: (partial: Partial<世界书条目>) => void;
  onDelete: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-serif text-xs tracking-[0.35em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>
          {calibrationDisplay ? '独立模型展示条目' : builtin ? '内置条目' : '条目'}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{
              color: calibrationDisplay || entry.enabled
                ? 'rgba(var(--tj-accent-primary), 0.92)'
                : 'rgba(var(--tj-text-secondary), 0.6)',
            }}
          >
            {calibrationDisplay ? '展示' : entry.enabled ? '启用' : '关闭'}
          </span>
          <ToggleSwitch
            checked={calibrationDisplay || entry.enabled}
            disabled={calibrationDisplay}
            onChange={(enabled) => onChange({ enabled })}
            title={calibrationDisplay ? '独立模型展示条目不是真实请求开关' : '启用条目'}
          />
        </div>
      </div>

      {calibrationDisplay && (
        <div
          className="px-3 py-2 text-xs leading-relaxed"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.78)',
            background: 'rgba(var(--tj-accent-primary), 0.045)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: cardClip,
          }}
        >
          独立模型资料展示：真实请求不读取这里的 enabled 或编辑稿，而是由新闻、手机、变量、智库等服务层共享 prompt / worldbook 常量构建。实际发送内容请在“上下文”页核对。
        </div>
      )}

      <Field label="条目标题">
        <input
          value={entry.title}
          readOnly={calibrationDisplay}
          onChange={(event) => {
            if (calibrationDisplay) return;
            onChange({ title: event.target.value });
          }}
          placeholder="条目标题"
          className="kaituo-input w-full px-3 py-2 text-sm font-serif tracking-wider"
          style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="类型">
          <select
            value={entry.type}
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ type: event.target.value as 世界书条目类型 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
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
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ injectMode: event.target.value as 世界书注入方式 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          >
            <option value="always">始终注入</option>
            <option value="keyword_match">关键词匹配</option>
          </select>
        </Field>
        <Field label="优先级">
          <input
            type="number"
            value={entry.priority}
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ priority: Number(event.target.value) || 0 })}
            min={0}
            max={999}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      </div>

      {entry.injectMode === 'keyword_match' && (
        <Field label="触发关键词（逗号分隔，主关键词 OR 命中即触发）">
          <input
            value={entry.keywords.join(', ')}
            readOnly={calibrationDisplay}
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
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      )}

      {entry.injectMode === 'keyword_match' && (
        <Field label="次要关键词（逗号分隔，主命中后须全部 AND 命中才触发，可留空）">
          <input
            value={(entry.keySecondary ?? []).join(', ')}
            readOnly={calibrationDisplay}
            onChange={(event) =>
              onChange({
                keySecondary: event.target.value
                  .split(/[,,]/)
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
            placeholder="次要关键词，逗号分隔（可留空）"
            className="kaituo-input w-full px-3 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      )}

      {!calibrationDisplay && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-xs font-serif tracking-[0.2em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.5)]"
            style={{
              color: 'rgba(var(--tj-accent-primary), 0.85)',
              background: 'rgba(var(--tj-accent-primary), 0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
              clipPath: cardClip,
            }}
          >
            <span>◆ 高级触发控制（Phase 7.1 / 7.2 / 7.3）</span>
            <span className="text-[10px] tracking-wider transition-transform duration-200" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
              {advancedOpen ? '收起 ▲' : '展开 ▼'}
            </span>
          </button>

          {advancedOpen && (
            <div
              className="space-y-3 px-3 py-3"
              style={{
                background: 'rgba(var(--tj-accent-primary), 0.025)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
                clipPath: cardClip,
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="大小写敏感">
                  <select
                    value={entry.caseSensitive ? '1' : '0'}
                    onChange={(event) => onChange({ caseSensitive: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认）</option>
                    <option value="1">是</option>
                  </select>
                </Field>
                <Field label="全词匹配">
                  <select
                    value={entry.matchWholeWords ? '1' : '0'}
                    onChange={(event) => onChange({ matchWholeWords: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，子串匹配）</option>
                    <option value="1">是（避免「星」命中「星穹铁道」）</option>
                  </select>
                </Field>
                <Field label="正则匹配">
                  <select
                    value={entry.useRegex ? '1' : '0'}
                    onChange={(event) => onChange({ useRegex: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认）</option>
                    <option value="1">是（关键词视为正则表达式）</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="触发概率 (0-100)">
                  <input
                    type="number"
                    value={entry.probability ?? 100}
                    onChange={(event) => onChange({ probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
                    min={0}
                    max={100}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="延迟 (N 条消息后)">
                  <input
                    type="number"
                    value={entry.delay ?? 0}
                    onChange={(event) => onChange({ delay: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="冷却 (N 条消息)">
                  <input
                    type="number"
                    value={entry.cooldown ?? 0}
                    onChange={(event) => onChange({ cooldown: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="扫描深度 (最近 N 条)">
                  <input
                    type="number"
                    value={entry.scanDepth ?? 50}
                    onChange={(event) => onChange({ scanDepth: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 概率 100=必触发，0=不触发；延迟/冷却按累计消息数计算；扫描深度 0=扫描全部历史（默认 50）。
                <br />· 次要关键词仅在主关键词命中后才会做 AND 检查；正则匹配时请确保表达式合法（非法会被忽略）。
              </p>

              {/* Phase 7.2：深度插入 + 分组召回 + 条目互斥 */}
              <div
                className="mt-4 border-t border-[rgba(var(--tj-accent-primary),0.15)] pt-3"
              >
                <div
                  className="mb-3 px-3 py-2 text-[11px] font-serif tracking-[0.2em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  ◆ Phase 7.2 · 深度插入 / 分组 / 互斥
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="深度插入">
                  <select
                    value={entry.injectAtDepth ? '1' : '0'}
                    onChange={(event) => onChange({ injectAtDepth: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，拼 systemPrompt）</option>
                    <option value="1">是（In-Chat 按 depth 插入）</option>
                  </select>
                </Field>
                <Field label="深度值 (In-Chat 位置)">
                  <input
                    type="number"
                    value={entry.depth ?? 0}
                    onChange={(event) => onChange({ depth: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="分组 id">
                  <input
                    type="text"
                    value={entry.group ?? ''}
                    onChange={(event) => onChange({ group: event.target.value })}
                    placeholder="同组 id 触发 groupOverride 互斥"
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="组覆盖">
                  <select
                    value={entry.groupOverride ? '1' : '0'}
                    onChange={(event) => onChange({ groupOverride: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，同组全部注入）</option>
                    <option value="1">是（同组只取 groupWeight 最高）</option>
                  </select>
                </Field>
                <Field label="组权重">
                  <input
                    type="number"
                    value={entry.groupWeight ?? 0}
                    onChange={(event) => onChange({ groupWeight: Number(event.target.value) || 0 })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="禁用其他条目 (id 列表)">
                  <input
                    type="text"
                    value={(entry.disablesEntries ?? []).join(', ')}
                    onChange={(event) =>
                      onChange({
                        disablesEntries: event.target.value
                          .split(/[,,]/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="条目 id，逗号分隔"
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 深度插入：0=末条消息后 / 1=末条消息前 / N=末条消息前 N 条前。
                <br />· 分组覆盖：同组内若有 groupOverride=true 的条目，只取 groupWeight 最高的。
                <br />· 互斥：本条目触发后，列表中的条目会被禁用（按 id 匹配，支持 stwi_ / adapted_ / 自建 id）。
              </p>

              {/* Phase 7.3：递归触发 + 逻辑门 */}
              <div
                className="mt-4 border-t border-[rgba(var(--tj-accent-primary),0.15)] pt-3"
              >
                <div
                  className="mb-3 px-3 py-2 text-[11px] font-serif tracking-[0.2em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  ◆ Phase 7.3 · 递归触发 / 逻辑门
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="逻辑门 (主+次要关键词)">
                  <select
                    value={entry.logic ?? 'AND_ALL'}
                    onChange={(event) => onChange({ logic: event.target.value as 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="AND_ALL">AND_ALL · 主命中 + 所有次要命中（默认）</option>
                    <option value="AND_ANY">AND_ANY · 主命中 + 任一次要命中</option>
                    <option value="NOT_ANY">NOT_ANY · 主命中 + 至少一个次要不命中</option>
                    <option value="NOT_ALL">NOT_ALL · 主命中 + 所有次要都不命中</option>
                  </select>
                </Field>
                <Field label="递归触发">
                  <select
                    value={entry.recurse ? '1' : '0'}
                    onChange={(event) => onChange({ recurse: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，不递归）</option>
                    <option value="1">是（触发后用本条目 content 扫描其他条目）</option>
                  </select>
                </Field>
                <Field label="递归深度 (0-5)">
                  <input
                    type="number"
                    value={entry.recurseDepth ?? 1}
                    onChange={(event) => onChange({ recurseDepth: Math.min(Math.max(Number(event.target.value) || 0, 0), 5) })}
                    min={0}
                    max={5}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 逻辑门：组合主关键词与次要关键词的命中条件（仅当次要关键词非空时生效）。
                <br />· 递归触发：本条目命中后，把本条目 content 加入扫描文本，重新扫描其他未触发的 keyword_match 条目。
                <br />· 递归深度限制 0-5（防止无限递归），0=不递归，1=递归一次（默认）。
              </p>
            </div>
          )}
        </div>
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
          readOnly={calibrationDisplay}
          onChange={(event) => {
            if (calibrationDisplay) return;
            onChange({ content: event.target.value });
          }}
          rows={12}
          placeholder="条目内容"
          className="kaituo-input w-full resize-y px-3 py-2.5 text-sm leading-relaxed md:min-h-[280px]"
          style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.82 : 1 }}
        />
      </Field>

      {!builtin && (
        <button
          onClick={onDelete}
          className="cursor-pointer px-3 py-1.5 text-xs font-serif tracking-wider transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-danger),0.5)]"
          style={{
            color: 'rgb(var(--tj-danger))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.35)',
            clipPath: smallClip,
          }}
        >
          删除此条目
        </button>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled = false,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}) {
  return (
    <span
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
      className="relative inline-flex h-[18px] w-[34px] flex-shrink-0 items-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)]"
      style={{
        background: checked
          ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.55), rgba(var(--tj-accent-secondary), 0.75))'
          : 'rgba(var(--tj-bg-primary), 0.85)',
        boxShadow: checked
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.8), 0 0 6px rgba(var(--tj-accent-primary), 0.35)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.78 : 1,
      }}
    >
      <span
        className="absolute h-[12px] w-[12px] transition-all duration-200"
        style={{
          left: checked ? 18 : 3,
          background: checked ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary), 0.7)',
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
      <div className="mb-1 text-[10px] font-serif tracking-[0.3em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function EmptyList({ activeTab }: { activeTab: WorldbookTab }) {
  return (
    <div className="px-4 py-10 text-center text-xs font-serif leading-6 tracking-wider whitespace-pre-line" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
      <div className="mb-2 text-3xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>◇</div>
      {activeTab === 'user' ? '尚无额外世界书\n点击顶部「＋ 新建世界书」' : '内置世界书加载异常'}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <div className="text-center">
        <div className="mb-3 text-4xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>
          ◇
        </div>
        <div className="whitespace-pre-line text-sm font-serif tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
          {text}
        </div>
      </div>
    </div>
  );
}
