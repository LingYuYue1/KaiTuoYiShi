import type { ReactNode } from 'react';
import type { 世界书 } from '@/models/worldbook';
import { ENTRY_TYPE_LABELS } from '@/models/worldbook';
import { isBuiltinBook, isCalibrationEntry, isStoryModeBook } from '@/utils/worldbookPredicates';
import { ToggleSwitch } from './worldbookPrimitives';
import { smallClip } from './worldbookStyles';

export function renderBookSections(
  books: 世界书[],
  ctx: {
    selectedBookId: string | null;
    selectedEntryId: string | null;
    onSelectEntry: (bookId: string, entryId: string) => void;
    onToggleBook: (bookId: string, enabled: boolean) => void;
  },
): ReactNode {
  const nodes: ReactNode[] = [];
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
