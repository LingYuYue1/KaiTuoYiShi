import { ArrowLeft, BookOpenText, ChevronRight, Database, ListTree, Lock, UserRound, X } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { 智库辅助关键词逻辑 } from '@/models/zhiku';
import { ResilientImage } from '@/components/ui/ResilientImage';
import type { ZhikuCategory } from './types';
import { ReaderFontSizeControl } from './ReaderFontSizeControl';
import type { ReaderRefreshStatus } from './ReaderFontSizeControl';
import { formatArchiveParagraphLine } from './archiveDocumentFormatting';
import { buildZhikuReaderStyle, ZHIKU_READER_FONT_SIZE_DEFAULT } from './readerFontSize';
import { ZhikuPageFrame } from './ZhikuPageFrame';
import './zhiku-v3.css';
import './archive-browser.css';

export type ZhikuArchiveItemStatus = 'available' | 'new' | 'locked';
export type ZhikuArchiveView = 'archive' | 'injection';

export interface ZhikuArchiveInjectionVariant {
  id: string;
  label: string;
  body?: string;
  triggerKeywords: string[];
  secondaryKeywords: string[];
  secondaryKeywordLogic?: 智库辅助关键词逻辑;
  injectionPreview: string;
}

export interface ZhikuArchiveItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  body: string;
  triggerKeywords?: string[];
  secondaryKeywords?: string[];
  secondaryKeywordLogic?: 智库辅助关键词逻辑;
  injectionPreview?: string;
  injectionVariants?: ZhikuArchiveInjectionVariant[];
  avatarSrc?: string;
  avatarAlt?: string;
  status?: ZhikuArchiveItemStatus;
}

interface ArchiveBrowserProps {
  category: ZhikuCategory;
  items: ZhikuArchiveItem[];
  initialItemId?: string;
  readerFontSize?: number;
  onDecreaseReaderFontSize?: () => void;
  onIncreaseReaderFontSize?: () => void;
  onRefreshBundled?: () => void;
  refreshStatus?: ReaderRefreshStatus;
  reducedMotion?: boolean;
  onBack?: () => void;
  onClose?: () => void;
}

const formatSequence = (index: number): string => String(index + 1).padStart(2, '0');

const SECONDARY_KEYWORD_LOGIC_LABELS: Record<智库辅助关键词逻辑, string> = {
  AND_ANY: '主关键词 + 任一形态限定词',
  AND_ALL: '主关键词 + 全部形态限定词',
  NOT_ANY: '主关键词，且排除其他形态词',
  NOT_ALL: '主关键词，且不同时出现全部排除词',
};

const ARCHIVE_SECTION_HEADINGS = new Set([
  '基础识别',
  '角色详情',
  '常驻事实层',
  '角色故事',
  '角色故事层',
  '表现锚点层',
  '语料层',
  '写法指导',
  '语料参考：',
  '能力与职责模块',
  '人物概要',
  '关系与知情边界',
  '事实边界',
  '本回合注入建议',
]);

function getArchiveHeading(line: string): { level: 3 | 4; text: string } | null {
  const markdownHeading = line.match(/^#{2,4}\s+(.+)$/u);
  if (markdownHeading) {
    const text = markdownHeading[1].trim();
    // Voice corpus entries use markdown markers as labels, not headings.
    if (/^(?:初次见面|问候|道别|关于|闲谈|爱好|烦恼|分享|见闻|危机|提醒)/u.test(text) && /[「『“\"]/.test(text)) {
      return null;
    }
    return { level: markdownHeading[0].startsWith('## ') ? 3 : 4, text };
  }
  if (ARCHIVE_SECTION_HEADINGS.has(line)) return { level: 3, text: line.replace(/：$/u, '') };
  if (/^故事(?:[一二三四五六七八九十百\d]+)[：:]/u.test(line) || /^与他人关系/u.test(line)) {
    return { level: 4, text: line };
  }
  return null;
}

function renderArchiveParagraph(lines: string[], key: string): ReactNode {
  const normalized = lines
    .map(formatArchiveParagraphLine)
    .filter(Boolean);
  if (normalized.length === 0) return null;
  return (
    <p key={key} className="whitespace-pre-wrap">
      {normalized.join('\n')}
    </p>
  );
}

function renderArchiveDocument(source: string): ReactNode {
  const lines = source.trim().split(/\r?\n/u);
  if (lines.every((line) => !line.trim())) return <p>该档案暂无可阅读正文。</p>;

  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let nodeIndex = 0;
  const flushParagraph = () => {
    const node = renderArchiveParagraph(paragraph, `paragraph-${nodeIndex}`);
    if (node) nodes.push(node);
    paragraph = [];
    nodeIndex += 1;
  };
  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`list-${nodeIndex}`}>
        {list.map((line, index) => <li key={`${line}-${index}`}>{line.slice(2)}</li>)}
      </ul>,
    );
    list = [];
    nodeIndex += 1;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    // Some authored archives place a new markdown heading after the final quote.
    // Split it here so the heading cannot become part of the preceding sentence.
    const inlineHeading = line.match(/^(.*?)(?:\s+)(#{2,4})\s+(.+)$/u);
    if (inlineHeading && !line.startsWith('#')) {
      paragraph.push(inlineHeading[1].trim());
      flushParagraph();
      const headingText = inlineHeading[3].trim();
      const Heading = inlineHeading[2] === '##' ? 'h3' : 'h4';
      nodes.push(<Heading key={`heading-${nodeIndex}`}>{headingText}</Heading>);
      nodeIndex += 1;
      return;
    }

    const heading = getArchiveHeading(line);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = heading.level === 3 ? 'h3' : 'h4';
      nodes.push(<Heading key={`heading-${nodeIndex}`}>{heading.text}</Heading>);
      nodeIndex += 1;
      return;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line);
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return nodes;
}

export function ArchiveBrowser({
  category,
  items = [],
  initialItemId,
  readerFontSize = ZHIKU_READER_FONT_SIZE_DEFAULT,
  onDecreaseReaderFontSize,
  onIncreaseReaderFontSize,
  onRefreshBundled,
  refreshStatus,
  reducedMotion = false,
  onBack,
  onClose,
}: ArchiveBrowserProps) {
  const [selectedItemId, setSelectedItemId] = useState(initialItemId ?? '');
  const [activeView, setActiveView] = useState<ZhikuArchiveView>('archive');
  const [selectedInjectionVariantId, setSelectedInjectionVariantId] = useState('');
  const [mobilePane, setMobilePane] = useState<'catalog' | 'detail'>(initialItemId ? 'detail' : 'catalog');
  const archiveTabRef = useRef<HTMLButtonElement>(null);
  const injectionTabRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const archiveTabId = `${panelId}-archive-tab`;
  const injectionTabId = `${panelId}-injection-tab`;
  const selectedItem = items.find((item) => item.id === selectedItemId && item.status !== 'locked')
    ?? items.find((item) => item.status !== 'locked')
    ?? items[0];
  const selectedIndex = selectedItem ? items.findIndex((item) => item.id === selectedItem.id) : -1;
  const archiveKicker = `${category.id.toUpperCase()} ARCHIVE`;
  const showItemVisual = category.id === 'character';
  const watermarkStyle = { '--zhiku-browser-emblem': `url("${category.iconSrc}")` } as CSSProperties;
  const emblemStyle = { '--zhiku-header-emblem': `url("${category.iconSrc}")` } as CSSProperties;
  const injectionVariants = selectedItem?.injectionVariants ?? [];
  const selectedInjectionVariant = injectionVariants.find((variant) => variant.id === selectedInjectionVariantId)
    ?? injectionVariants[0];
  const triggerKeywords = (selectedInjectionVariant?.triggerKeywords ?? selectedItem?.triggerKeywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const secondaryKeywords = (selectedInjectionVariant?.secondaryKeywords ?? selectedItem?.secondaryKeywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const secondaryKeywordLogic = selectedInjectionVariant?.secondaryKeywordLogic
    ?? selectedItem?.secondaryKeywordLogic
    ?? (secondaryKeywords.length ? 'AND_ANY' : undefined);
  const displayKeywords = Array.from(new Set([
    ...triggerKeywords,
    ...(secondaryKeywordLogic === 'AND_ANY' || secondaryKeywordLogic === 'AND_ALL' ? secondaryKeywords : []),
  ]));
  const injectionPreview = (selectedInjectionVariant?.injectionPreview ?? selectedItem?.injectionPreview ?? '').trim();
  const readerStyle = buildZhikuReaderStyle(readerFontSize);

  const handleViewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextView: ZhikuArchiveView | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'Home') nextView = 'archive';
    if (event.key === 'ArrowRight' || event.key === 'End') nextView = 'injection';
    if (!nextView) return;
    event.preventDefault();
    setActiveView(nextView);
    (nextView === 'archive' ? archiveTabRef : injectionTabRef).current?.focus();
  };

  return (
    <section className="zhiku-v3-browser" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <ZhikuPageFrame brightness={0.68} dimmer={0.36} />
      <span className="zhiku-v3-browser__watermark" style={watermarkStyle} aria-hidden="true" />
      <div className="zhiku-v3-header__actions zhiku-v3-browser__close">
        <button type="button" onClick={onClose} aria-label="关闭智库" title="关闭智库">
          <X size={23} strokeWidth={1.5} />
        </button>
      </div>

      <main className="zhiku-v3-browser__content" data-mobile-pane={mobilePane}>
        <aside className="zhiku-v3-browser__catalog" aria-label={`${category.label}列表`}>
          <header>
            <div className="zhiku-v3-browser__catalog-identity">
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
              <span
                className="zhiku-v3-header__mark"
                data-emblem="true"
                style={emblemStyle}
                aria-hidden="true"
              >
                <span />
              </span>
              <div className="zhiku-v3-browser__catalog-title">
                <h1>{category.label}</h1>
                <p>档案终端</p>
              </div>
            </div>
            <b>{String(items.length).padStart(2, '0')}</b>
          </header>

          <ol>
            {items.map((item, index) => {
              const locked = item.status === 'locked';
              const active = item.id === selectedItem?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    data-status={item.status ?? 'available'}
                    data-has-visual={showItemVisual ? 'true' : 'false'}
                    disabled={locked}
                    aria-pressed={active}
                    aria-label={locked ? `${item.title}，尚未解锁` : `阅读${item.title}`}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setSelectedInjectionVariantId('');
                      setMobilePane('detail');
                    }}
                  >
                    <span className="zhiku-v3-browser__sequence">{formatSequence(index)}</span>
                    {showItemVisual && (
                      <span className="zhiku-v3-browser__avatar" data-fallback={item.avatarSrc ? 'false' : 'true'}>
                        {item.avatarSrc ? (
                          <ResilientImage
                            src={item.avatarSrc}
                            alt={item.avatarAlt ?? `${item.title}头像`}
                            loading={index < 8 ? 'eager' : 'lazy'}
                            draggable={false}
                          />
                        ) : (
                          <UserRound size={21} strokeWidth={1.25} aria-hidden="true" />
                        )}
                      </span>
                    )}
                    <span className="zhiku-v3-browser__catalog-copy">
                      <strong>{locked ? '未解锁档案' : item.title}</strong>
                      <small>{item.subtitle ?? item.meta ?? category.label}</small>
                    </span>
                    {locked ? <Lock size={13} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="zhiku-v3-browser__detail" style={readerStyle} aria-live="polite">
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
            className="zhiku-v3-browser__mobile-catalog-trigger"
            onClick={() => setMobilePane('catalog')}
            aria-label={`打开${category.label}目录`}
          >
            <ListTree size={17} strokeWidth={1.6} aria-hidden="true" />
            <span>资料目录</span>
          </button>
          {selectedItem ? (
            <>
              <header className="zhiku-v3-browser__entry-heading">
                <span>{archiveKicker}</span>
                <strong>{selectedIndex >= 0 ? formatSequence(selectedIndex) : '--'}</strong>
                <h2>{selectedItem.title}</h2>
                {selectedItem.subtitle && <p>{selectedItem.subtitle}</p>}
                <div className="zhiku-v3-browser__entry-meta">
                  <span>{selectedItem.meta ?? '已收录档案'}</span>
                  {selectedItem.status === 'new' && <b>新</b>}
                </div>
                <div
                  className="zhiku-v3-browser__view-tabs"
                  role="tablist"
                  aria-label={`${category.label}内容视图`}
                  onKeyDown={handleViewKeyDown}
                >
                  <button
                    ref={archiveTabRef}
                    id={archiveTabId}
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'archive'}
                    aria-controls={panelId}
                    tabIndex={activeView === 'archive' ? 0 : -1}
                    onClick={() => setActiveView('archive')}
                  >
                    <BookOpenText size={13} strokeWidth={1.6} aria-hidden="true" />
                    档案预览
                  </button>
                  <button
                    ref={injectionTabRef}
                    id={injectionTabId}
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'injection'}
                    aria-controls={panelId}
                    tabIndex={activeView === 'injection' ? 0 : -1}
                    onClick={() => setActiveView('injection')}
                  >
                    <Database size={13} strokeWidth={1.6} aria-hidden="true" />
                    注入内容
                  </button>
                </div>
              </header>
              {activeView === 'archive' ? (
                <article
                  id={panelId}
                  className="zhiku-v3-browser__document"
                  role="tabpanel"
                  aria-labelledby={archiveTabId}
                  tabIndex={0}
                >
                  {injectionVariants.length > 1 && (
                    <div className="zhiku-v3-browser__form-preview" role="tablist" aria-label="选择档案形态">
                      <span>形态档案</span>
                      <div>
                        {injectionVariants.map((variant) => {
                          const active = variant.id === selectedInjectionVariant?.id;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setSelectedInjectionVariantId(variant.id)}
                            >
                              {variant.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {renderArchiveDocument(selectedInjectionVariant?.body || selectedItem.body)}
                </article>
              ) : (
                <article
                  id={panelId}
                  className="zhiku-v3-browser__document zhiku-v3-browser__document--injection"
                  role="tabpanel"
                  aria-labelledby={injectionTabId}
                  tabIndex={0}
                >
                  {injectionVariants.length > 1 && (
                    <div className="zhiku-v3-browser__form-preview" role="tablist" aria-label="选择注入形态">
                      <span>形态预览</span>
                      <div>
                        {injectionVariants.map((variant) => {
                          const active = variant.id === selectedInjectionVariant?.id;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setSelectedInjectionVariantId(variant.id)}
                            >
                              {variant.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <section className="zhiku-v3-browser__injection-section">
                    <header className="zhiku-v3-browser__injection-heading">
                      <span>FORM RECALL KEYWORDS</span>
                      <h3>形态召回关键词</h3>
                      <b>{String(displayKeywords.length).padStart(2, '0')}</b>
                    </header>
                    {secondaryKeywordLogic && secondaryKeywords.length > 0 && (
                      <p className="zhiku-v3-browser__keyword-rule">
                        <span>召回规则</span>
                        <strong>{SECONDARY_KEYWORD_LOGIC_LABELS[secondaryKeywordLogic]}</strong>
                      </p>
                    )}
                    {displayKeywords.length ? (
                      <ol className="zhiku-v3-browser__trigger-keywords">
                        {displayKeywords.map((keyword, index) => (
                          <li key={`${keyword}-${index}`}>
                            <span>{formatSequence(index)}</span>
                            <strong>{keyword}</strong>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="zhiku-v3-browser__injection-empty">暂无触发关键词</p>
                    )}
                  </section>
                  <section className="zhiku-v3-browser__injection-section">
                    <header className="zhiku-v3-browser__injection-heading">
                      <span>INJECTION PAYLOAD</span>
                      <h3>注入内容</h3>
                    </header>
                    {injectionPreview ? (
                      <pre className="zhiku-v3-browser__injection-payload">{injectionPreview}</pre>
                    ) : (
                      <p className="zhiku-v3-browser__injection-empty">暂无可注入内容</p>
                    )}
                  </section>
                </article>
              )}
            </>
          ) : (
            <div className="zhiku-v3-browser__empty">
              <strong>暂无可阅读档案</strong>
              <span>当前没有玩家可见资料</span>
            </div>
          )}
        </section>
      </main>

      <div className="zhiku-v3-screen__index" aria-hidden="true">
        <span>ARCHIVE // {selectedIndex >= 0 ? formatSequence(selectedIndex) : '--'} / {String(items.length).padStart(2, '0')}</span>
        <i />
      </div>
    </section>
  );
}
