import { ChevronDown, ChevronLeft, ChevronRight, FileText, Lock } from 'lucide-react';
import { useState } from 'react';
import type { ZhikuArchiveChapter, ZhikuArchiveChapterStatus, ZhikuArchiveVolume } from '@/services/zhikuArchive';
import { ArchiveProse } from './ArchiveProse';
import { buildZhikuReaderStyle } from './readerFontSize';

interface ArchiveStoryViewProps {
  volumes: ZhikuArchiveVolume[];
  fontSize: number;
}

const CHAPTER_STATUS: Record<ZhikuArchiveChapterStatus, { label: string; glyph: string }> = {
  read: { label: '已阅', glyph: '✓' },
  current: { label: '阅读中', glyph: '◈' },
  unread: { label: '未读', glyph: '◇' },
  locked: { label: '未解锁', glyph: '⊘' },
};

function getInitialChapter(volume: ZhikuArchiveVolume): ZhikuArchiveChapter | undefined {
  return volume.chapters.find((chapter) => chapter.status === 'current')
    ?? volume.chapters.find((chapter) => chapter.status !== 'locked');
}

function getAvailableSibling(
  chapters: ZhikuArchiveChapter[],
  currentIndex: number,
  direction: -1 | 1,
): ZhikuArchiveChapter | undefined {
  for (let index = currentIndex + direction; index >= 0 && index < chapters.length; index += direction) {
    if (chapters[index].status !== 'locked') return chapters[index];
  }
  return undefined;
}

export function ArchiveStoryView({ volumes, fontSize }: ArchiveStoryViewProps) {
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [expandedVolumeId, setExpandedVolumeId] = useState('');

  const selectedVolume = volumes.find((volume) => volume.chapters.some((chapter) => chapter.id === selectedChapterId))
    ?? volumes.find((volume) => !volume.locked && getInitialChapter(volume))
    ?? volumes.at(0);
  const selectedChapter = selectedVolume?.chapters.find((chapter) => chapter.id === selectedChapterId && chapter.status !== 'locked')
    ?? (selectedVolume ? getInitialChapter(selectedVolume) : undefined);
  const selectedIndex = selectedChapter && selectedVolume
    ? selectedVolume.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const previousChapter = selectedVolume ? getAvailableSibling(selectedVolume.chapters, selectedIndex, -1) : undefined;
  const nextChapter = selectedVolume ? getAvailableSibling(selectedVolume.chapters, selectedIndex, 1) : undefined;
  const activeVolumeId = expandedVolumeId || selectedVolume?.id || '';
  const hasChapters = volumes.some((volume) => volume.chapters.length > 0);

  const selectChapter = (chapter: ZhikuArchiveChapter | undefined) => {
    if (!chapter || chapter.status === 'locked') return;
    setSelectedChapterId(chapter.id);
  };

  return (
    <div className="zj-view" data-archive-state={hasChapters ? 'ready' : 'empty'}>
      <div className="zj-view__body" data-wide="true">
        <div className="zj-index" aria-label="剧情卷宗与章节目录">
          {volumes.length === 0 ? (
            <div className="zj-empty"><strong>暂无卷宗</strong><span>剧情尚未归档</span></div>
          ) : (
            volumes.map((volume) => {
              const volumeLocked = Boolean(volume.locked);
              const volumeActive = volume.id === activeVolumeId;
              const volumeReadCount = volume.chapters.filter((chapter) => chapter.status === 'read' || chapter.status === 'current').length;
              const volumeProgress = volume.chapters.length ? Math.round((volumeReadCount / volume.chapters.length) * 100) : 0;
              return (
                <section key={volume.id} className="zj-volume" data-locked={volumeLocked ? 'true' : 'false'}>
                  <button
                    type="button"
                    className="zj-volume__head"
                    disabled={volumeLocked}
                    aria-expanded={volumeActive}
                    aria-label={volumeLocked ? `${volume.title}，尚未解锁` : `打开卷宗：${volume.title}`}
                    onClick={() => {
                      setExpandedVolumeId(volume.id);
                      selectChapter(getInitialChapter(volume));
                    }}
                  >
                    <span style={{ color: volumeActive ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-btn-primary-start), 0.7)' }}>
                      {volumeLocked ? <Lock size={14} strokeWidth={1.5} aria-hidden="true" /> : <FileText size={14} strokeWidth={1.5} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="zj-volume__title">{volumeLocked ? '未解锁卷宗' : volume.title}</span>
                      <span className="zj-volume__sub">{volumeLocked ? '档案尚未开放' : `${volume.number} · ${volume.subtitle ?? `${volume.chapters.length} 个章节`}`}</span>
                    </span>
                    {!volumeLocked && <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className={volumeActive ? 'rotate-180 transition-transform' : 'transition-transform'} style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }} />}
                  </button>
                  {volumeActive && !volumeLocked && (
                    <>
                      <ol aria-label={`${volume.title}章节`}>
                        {volume.chapters.map((chapter) => {
                          const status = CHAPTER_STATUS[chapter.status];
                          const active = chapter.id === selectedChapter?.id;
                          const locked = chapter.status === 'locked';
                          return (
                            <li key={chapter.id}>
                              <button
                                type="button"
                                className="zj-chapter"
                                data-status={chapter.status}
                                data-active={active ? 'true' : 'false'}
                                data-chapter-id={chapter.id}
                                disabled={locked}
                                aria-pressed={active}
                                aria-label={locked ? `${chapter.number}，尚未解锁` : `阅读${chapter.number}：${chapter.title}`}
                                onClick={() => selectChapter(chapter)}
                              >
                                <span className="zj-chapter__title">{locked ? '未解锁章节' : `${chapter.number} ${chapter.title}`}</span>
                                <span className="zj-chapter__status">{status.glyph} {status.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                      <div className="zj-progress">
                        <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)', marginBottom: 6 }}>
                          <span>阅读进度</span>
                          <span>{String(volumeProgress).padStart(2, '0')}%</span>
                        </div>
                        <div className="zj-progress__track"><i className="zj-progress__fill" style={{ width: `${volumeProgress}%` }} /></div>
                      </div>
                    </>
                  )}
                </section>
              );
            })
          )}
        </div>

        <section className="zj-reader" aria-live="polite">
          {selectedChapter && selectedVolume ? (
            <>
              <header className="zj-reader__head">
                <div className="zj-reader__kicker">STORY ARCHIVE // {selectedVolume.number}</div>
                <h2 className="zj-reader__title">{selectedVolume.title}</h2>
                <div className="zj-reader__meta">
                  <span>{selectedChapter.number}</span>
                  <span>{selectedChapter.category ?? '剧情章节'}</span>
                  {selectedChapter.location && <span>地点：{selectedChapter.location}</span>}
                  {selectedChapter.timeLabel && <span>时间：{selectedChapter.timeLabel}</span>}
                </div>
              </header>
              <div className="zj-reader__scroll" style={buildZhikuReaderStyle(fontSize)}>
                <ArchiveProse
                  source={selectedChapter.body}
                  dropCap
                  footer={
                    <nav className="zj-chapter-nav" aria-label="章节切换">
                      <button
                        type="button"
                        disabled={!previousChapter}
                        onClick={() => selectChapter(previousChapter)}
                        aria-label={previousChapter ? `上一章：${previousChapter.title}` : '已经是第一章'}
                      >
                        <ChevronLeft size={15} strokeWidth={1.6} aria-hidden="true" />
                        <span className="min-w-0">
                          <small>上一章</small>
                          <strong>{previousChapter?.title ?? '故事起点'}</strong>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!nextChapter}
                        onClick={() => selectChapter(nextChapter)}
                        aria-label={nextChapter ? `下一章：${nextChapter.title}` : '已经是最后一章'}
                      >
                        <span className="min-w-0">
                          <small>下一章</small>
                          <strong>{nextChapter?.title ?? '未完待续'}</strong>
                        </span>
                        <ChevronRight size={15} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </nav>
                  }
                />
              </div>
            </>
          ) : (
            <div className="zj-empty" data-archive-state="empty">
              <strong>暂无可阅读章节</strong>
              <span>故事尚未归档</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
