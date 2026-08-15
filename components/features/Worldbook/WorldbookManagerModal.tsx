import { useWorldbookManager } from '@/hooks/useWorldbookManager';
import type { 世界书 } from '@/models/worldbook';
import { isBuiltinBook } from '@/utils/worldbookPredicates';
import { renderBookSections } from './bookSidebar';
import { EmptyBookPane, EntryPane } from './entryPane';
import { EmptyHint, EmptyList, HeaderButton, TabButton } from './worldbookPrimitives';

interface Props {
  worldbooks: 世界书[];
  onSave: (books: 世界书[]) => void;
  onClose: () => void;
}

export function WorldbookManagerModal({ worldbooks, onSave, onClose }: Props) {
  const {
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
  } = useWorldbookManager({ worldbooks, onSave, onClose });

  if (suspendRender) return null;

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
