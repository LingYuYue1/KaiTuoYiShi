import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileText, ListTree, Lock, MapPin, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ZHIKU_CATEGORY_POLICIES } from '@/models/zhikuGovernance';
import { ReaderFontSizeControl } from './ReaderFontSizeControl';
import type { ReaderRefreshStatus } from './ReaderFontSizeControl';
import { buildZhikuReaderStyle, ZHIKU_READER_FONT_SIZE_DEFAULT } from './readerFontSize';
import { ZHIKU_CATEGORIES } from './types';
import { ZhikuPageFrame } from './ZhikuPageFrame';
import './zhiku-v3.css';
import './story-archive-reader.css';

export type StoryArchiveChapterStatus = 'read' | 'current' | 'unread' | 'locked';

export interface StoryArchiveChapter {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  category?: string;
  location?: string;
  timeLabel?: string;
  summary?: string;
  body: string;
  status?: StoryArchiveChapterStatus;
}

export interface StoryArchiveVolume {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  chapters: StoryArchiveChapter[];
  locked?: boolean;
}

interface StoryArchiveReaderProps {
  volumes: StoryArchiveVolume[];
  initialChapterId?: string;
  readerFontSize?: number;
  onDecreaseReaderFontSize?: () => void;
  onIncreaseReaderFontSize?: () => void;
  onRefreshBundled?: () => void;
  refreshStatus?: ReaderRefreshStatus;
  reducedMotion?: boolean;
  onBack?: () => void;
  onClose?: () => void;
}

const STORY_CATEGORY = ZHIKU_CATEGORIES.find((category) => category.id === 'story')!;
const STORY_ARCHIVE_POLICY = ZHIKU_CATEGORY_POLICIES.story;

const CHAPTER_STATUS_LABELS: Record<StoryArchiveChapterStatus, string> = {
  read: '已阅',
  current: '阅读中',
  unread: '未读',
  locked: '未解锁',
};

function getAvailableSibling(
  chapters: StoryArchiveChapter[],
  currentIndex: number,
  direction: -1 | 1,
): StoryArchiveChapter | undefined {
  for (let index = currentIndex + direction; index >= 0 && index < chapters.length; index += direction) {
    if (chapters[index].status !== 'locked') return chapters[index];
  }
  return undefined;
}

function getInitialChapter(volume: StoryArchiveVolume): StoryArchiveChapter | undefined {
  return volume.chapters.find((chapter) => chapter.status === 'current')
    ?? volume.chapters.find((chapter) => chapter.status !== 'locked');
}

export function StoryArchiveReader({
  volumes = [],
  initialChapterId,
  readerFontSize = ZHIKU_READER_FONT_SIZE_DEFAULT,
  onDecreaseReaderFontSize,
  onIncreaseReaderFontSize,
  onRefreshBundled,
  refreshStatus,
  reducedMotion = false,
  onBack,
  onClose,
}: StoryArchiveReaderProps) {
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId ?? '');
  const [mobilePane, setMobilePane] = useState<'catalog' | 'detail'>(initialChapterId ? 'detail' : 'catalog');
  const readingPaneRef = useRef<HTMLElement>(null);
  const selectedVolume = volumes.find((volume) => volume.chapters.some((chapter) => chapter.id === selectedChapterId))
    ?? volumes.find((volume) => !volume.locked && getInitialChapter(volume))
    ?? volumes[0];
  const selectedChapter = selectedVolume?.chapters.find((chapter) => chapter.id === selectedChapterId && chapter.status !== 'locked')
    ?? (selectedVolume ? getInitialChapter(selectedVolume) : undefined);
  const selectedIndex = selectedChapter
    ? selectedVolume?.chapters.findIndex((chapter) => chapter.id === selectedChapter.id) ?? -1
    : -1;
  const previousChapter = selectedVolume
    ? getAvailableSibling(selectedVolume.chapters, selectedIndex, -1)
    : undefined;
  const nextChapter = selectedVolume
    ? getAvailableSibling(selectedVolume.chapters, selectedIndex, 1)
    : undefined;
  const readCount = selectedVolume?.chapters.filter((chapter) => chapter.status === 'read' || chapter.status === 'current').length ?? 0;
  const progress = selectedVolume?.chapters.length
    ? Math.round((readCount / selectedVolume.chapters.length) * 100)
    : 0;
  const watermarkStyle = { '--zhiku-story-emblem': `url("${STORY_CATEGORY.iconSrc}")` } as CSSProperties;
  const emblemStyle = { '--zhiku-header-emblem': `url("${STORY_CATEGORY.iconSrc}")` } as CSSProperties;
  const progressStyle = { '--zhiku-story-progress': `${progress}%` } as CSSProperties;
  const readerStyle = buildZhikuReaderStyle(readerFontSize);

  useEffect(() => {
    readingPaneRef.current?.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion, selectedChapter?.id]);

  const selectChapter = (chapter: StoryArchiveChapter | undefined, openDetail = true) => {
    if (chapter?.status !== 'locked') {
      setSelectedChapterId(chapter?.id ?? '');
      if (openDetail) setMobilePane('detail');
    }
  };

  const selectVolume = (volume: StoryArchiveVolume) => {
    if (!volume.locked) selectChapter(getInitialChapter(volume), false);
  };

  return (
    <section
      className="zhiku-v3-browser zhiku-v3-story-reader"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-access-mode={STORY_ARCHIVE_POLICY.viewMode}
      data-injectable={STORY_ARCHIVE_POLICY.injectionPolicy === 'never' ? 'false' : 'true'}
    >
      <ZhikuPageFrame brightness={0.62} dimmer={0.42} />
      <span className="zhiku-v3-story-reader__watermark" style={watermarkStyle} aria-hidden="true" />
      <div className="zhiku-v3-header__actions zhiku-v3-story-reader__close">
        <button type="button" onClick={onClose} aria-label="关闭智库" title="关闭智库">
          <X size={23} strokeWidth={1.5} />
        </button>
      </div>

      <main className="zhiku-v3-story-reader__content" data-mobile-pane={mobilePane}>
        <aside className="zhiku-v3-story-reader__catalog" aria-label="剧情卷宗与章节目录">
          <header>
            <div className="zhiku-v3-story-reader__identity">
              {onBack && (
                <button
                  type="button"
                  className="zhiku-v3-header__back"
                  onClick={onBack}
                  aria-label="返回分类大厅"
                  title="返回分类大厅"
                >
                  <ArrowLeft size={21} strokeWidth={1.6} />
                </button>
              )}
              <span className="zhiku-v3-header__mark" data-emblem="true" style={emblemStyle} aria-hidden="true">
                <span />
              </span>
              <div className="zhiku-v3-story-reader__catalog-title">
                <h1>剧情档案</h1>
                <p>卷宗目录</p>
              </div>
            </div>
            <b>{String(volumes.length).padStart(2, '0')}</b>
          </header>

          <div className="zhiku-v3-story-reader__archive-list">
            {volumes.map((volume) => {
              const activeVolume = volume.id === selectedVolume?.id;
              const volumeLocked = Boolean(volume.locked);
              return (
                <section
                  key={volume.id}
                  className="zhiku-v3-story-reader__archive-group"
                  data-active={activeVolume ? 'true' : 'false'}
                  data-locked={volumeLocked ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    className="zhiku-v3-story-reader__archive-button"
                    disabled={volumeLocked}
                    aria-expanded={activeVolume}
                    aria-label={volumeLocked ? `${volume.title}，尚未解锁` : `打开卷宗：${volume.title}`}
                    onClick={() => selectVolume(volume)}
                  >
                    <span className="zhiku-v3-story-reader__archive-index">
                      {volumeLocked ? <Lock size={13} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                      {volume.number}
                    </span>
                    <span className="zhiku-v3-story-reader__archive-copy">
                      <strong>{volumeLocked ? '未解锁卷宗' : volume.title}</strong>
                      <small>{volumeLocked ? '档案尚未开放' : volume.subtitle ?? `${volume.chapters.length} 个章节`}</small>
                    </span>
                    {!volumeLocked && <ChevronDown size={14} aria-hidden="true" />}
                  </button>

                  {activeVolume && !volumeLocked && (
                    <ol aria-label={`${volume.title}章节`}>
                      {volume.chapters.map((chapter) => {
                        const status = chapter.status ?? 'unread';
                        const active = chapter.id === selectedChapter?.id;
                        const locked = status === 'locked';
                        return (
                          <li key={chapter.id}>
                            <button
                              type="button"
                              data-active={active ? 'true' : 'false'}
                              data-status={status}
                              disabled={locked}
                              aria-pressed={active}
                              aria-label={locked ? `${chapter.number}，尚未解锁` : `阅读${chapter.number}：${chapter.title}`}
                              onClick={() => selectChapter(chapter)}
                            >
                              <span className="zhiku-v3-story-reader__chapter-number">{chapter.number}</span>
                              <span className="zhiku-v3-story-reader__chapter-copy">
                                <strong>{locked ? '未解锁章节' : chapter.title}</strong>
                                <small>{locked ? '故事仍在远方' : chapter.subtitle ?? '章节档案'}</small>
                              </span>
                              <span className="zhiku-v3-story-reader__chapter-status">
                                {locked && <Lock size={11} strokeWidth={1.6} aria-hidden="true" />}
                                {CHAPTER_STATUS_LABELS[status]}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>

          <footer className="zhiku-v3-story-reader__catalog-progress" style={progressStyle}>
            <span>当前卷阅读</span>
            <strong>{String(progress).padStart(2, '0')}%</strong>
            <i aria-hidden="true"><b /></i>
          </footer>
        </aside>

        <section className="zhiku-v3-story-reader__detail" style={readerStyle} aria-live="polite">
          {onDecreaseReaderFontSize && onIncreaseReaderFontSize && (
            <ReaderFontSizeControl
              value={readerFontSize}
              onDecrease={onDecreaseReaderFontSize}
              onIncrease={onIncreaseReaderFontSize}
              onRefresh={onRefreshBundled}
              refreshStatus={refreshStatus}
            />
          )}
          <button
            type="button"
            className="zhiku-v3-story-reader__mobile-catalog-trigger"
            onClick={() => setMobilePane('catalog')}
            aria-label="打开剧情卷宗目录"
          >
            <ListTree size={17} strokeWidth={1.6} aria-hidden="true" />
            <span>卷宗目录</span>
          </button>
          {selectedChapter ? (
            <>
              <header className="zhiku-v3-story-reader__chapter-heading">
                <span>STORY ARCHIVE // {selectedVolume?.number ?? '--'}</span>
                <h2>{selectedVolume?.title}</h2>
                <div className="zhiku-v3-story-reader__chapter-title">
                  <b>{selectedChapter.number}</b>
                  <h3>{selectedChapter.title}</h3>
                </div>
                {selectedChapter.summary && <p>{selectedChapter.summary}</p>}
                <div className="zhiku-v3-story-reader__chapter-meta">
                  <span>{selectedChapter.category ?? '剧情章节'}</span>
                  {selectedChapter.location && <span><MapPin size={11} aria-hidden="true" />{selectedChapter.location}</span>}
                  {selectedChapter.timeLabel && <span><Clock3 size={11} aria-hidden="true" />{selectedChapter.timeLabel}</span>}
                </div>
              </header>

              <article ref={readingPaneRef} className="zhiku-v3-story-reader__reading-pane" tabIndex={0}>
                <div className="zhiku-v3-story-reader__prose">
                  {selectedChapter.body.trim().split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
                    <p key={`${selectedChapter.id}-${index}`}>{paragraph.replace(/\n/g, ' ')}</p>
                  ))}

                  <div className="zhiku-v3-story-reader__chapter-end" aria-hidden="true">
                    <i />
                    <span>{selectedChapter.number} · END</span>
                    <i />
                  </div>

                  <nav className="zhiku-v3-story-reader__chapter-nav" aria-label="章节切换">
                    <button
                      type="button"
                      disabled={!previousChapter}
                      onClick={() => selectChapter(previousChapter)}
                      aria-label={previousChapter ? `上一章：${previousChapter.title}` : '已经是第一章'}
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                      <span><small>上一章</small><strong>{previousChapter?.title ?? '故事起点'}</strong></span>
                    </button>
                    <button
                      type="button"
                      disabled={!nextChapter}
                      onClick={() => selectChapter(nextChapter)}
                      aria-label={nextChapter ? `下一章：${nextChapter.title}` : '已经是最后一章'}
                    >
                      <span><small>下一章</small><strong>{nextChapter?.title ?? '未完待续'}</strong></span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </article>
            </>
          ) : (
            <div className="zhiku-v3-story-reader__empty">
              <strong>暂无可阅读章节</strong>
              <span>故事尚未归档</span>
            </div>
          )}
        </section>
      </main>

      <div className="zhiku-v3-screen__index" aria-hidden="true">
        <span>VOLUME // {selectedVolume?.number ?? '--'} · CHAPTER // {selectedChapter?.number ?? '--'}</span>
        <i />
      </div>
    </section>
  );
}
