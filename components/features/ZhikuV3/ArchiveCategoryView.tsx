import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ResilientImage } from '@/components/ui/ResilientImage';
import type { ZhikuArchiveCategoryId, ZhikuArchiveItem } from '@/services/zhikuArchive';
import { buildZhikuReaderStyle } from './readerFontSize';
import { ArchiveProse } from './ArchiveProse';

interface ArchiveCategoryViewProps {
  category: { id: ZhikuArchiveCategoryId; label: string };
  items: ZhikuArchiveItem[];
  fontSize: number;
}

type ReadingPane = 'archive' | 'injection';

const formatSequence = (index: number): string => String(index + 1).padStart(2, '0');

export function ArchiveCategoryView({ category, items, fontSize }: ArchiveCategoryViewProps) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [pane, setPane] = useState<ReadingPane>('archive');
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items.at(0);
  const variants = selectedItem?.variants ?? [];
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants.at(0);
  const keywords = selectedVariant?.keywords ?? selectedItem?.keywords ?? [];
  const injectionPreview = (selectedVariant?.injectionPreview ?? selectedItem?.injectionPreview ?? '').trim();

  return (
    <div className="zj-view" data-archive-state={items.length ? 'ready' : 'empty'}>
      <div className="zj-view__body">
        <div className="zj-index" aria-label={`${category.label}列表`}>
          {items.length === 0 ? (
            <div className="zj-empty"><strong>暂无档案</strong><span>当前分类没有玩家可见资料</span></div>
          ) : (
            items.map((item, index) => {
              const active = item.id === selectedItem?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="zj-index__item"
                  data-active={active ? 'true' : 'false'}
                  data-item-id={item.id}
                  aria-pressed={active}
                  aria-label={`阅读${item.title}`}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setSelectedVariantId('');
                    setPane('archive');
                  }}
                >
                  <span className="zj-index__seq">{formatSequence(index)}</span>
                  {category.id === 'character' && (
                    <span className="zj-index__avatar">
                      {item.avatarSrc ? (
                        <ResilientImage src={item.avatarSrc} alt={item.avatarAlt ?? `${item.title}头像`} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <span className="grid h-full w-full place-items-center font-serif text-sm" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>{item.title.slice(0, 1)}</span>
                      )}
                    </span>
                  )}
                  <span className="zj-index__copy">
                    <span className="zj-index__title">{item.title}</span>
                    <span className="zj-index__meta">{item.subtitle ?? item.meta ?? category.label}</span>
                  </span>
                  <ChevronRight size={13} strokeWidth={1.5} aria-hidden="true" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }} />
                </button>
              );
            })
          )}
        </div>

        <section className="zj-reader" aria-live="polite">
          {selectedItem ? (
            <>
              <header className="zj-reader__head">
                <div className="zj-reader__kicker">
                  {category.id.toUpperCase()} // {formatSequence(items.findIndex((item) => item.id === selectedItem.id))}
                </div>
                <h2 className="zj-reader__title">{selectedItem.title}</h2>
                <div className="zj-reader__meta">
                  <span>{selectedItem.meta ?? '已收录档案'}</span>
                  {selectedItem.subtitle && <span>{selectedItem.subtitle}</span>}
                  <span>{keywords.length} 个关键词</span>
                </div>
                <div className="zj-tabs" role="tablist" aria-label="档案内容视图">
                  <button type="button" role="tab" className="zj-tab" aria-selected={pane === 'archive'} onClick={() => setPane('archive')}>
                    档案预览
                  </button>
                  <button type="button" role="tab" className="zj-tab" aria-selected={pane === 'injection'} onClick={() => setPane('injection')}>
                    注入内容
                  </button>
                </div>
                {variants.length > 1 && (
                  <div className="zj-variants" role="tablist" aria-label="选择档案形态">
                    {variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        role="tab"
                        className="zj-variant"
                        aria-selected={variant.id === selectedVariant?.id}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>
                )}
              </header>
              <div className="zj-reader__scroll" role="tabpanel" aria-label="档案正文" style={buildZhikuReaderStyle(fontSize)}>
                {pane === 'archive' ? (
                  <ArchiveProse source={selectedVariant?.body || selectedItem.body} />
                ) : (
                  <>
                    {keywords.length > 0 && (
                      <div className="zj-keywords">
                        {keywords.map((keyword, index) => (
                          <span key={`${keyword}-${index}`} className="zj-keyword">{keyword}</span>
                        ))}
                      </div>
                    )}
                    {injectionPreview ? (
                      <pre className="zj-terminal">{injectionPreview}</pre>
                    ) : (
                      <p style={{ color: 'rgba(var(--tj-text-secondary), 0.74)', fontSize: 12 }}>暂无可注入内容</p>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="zj-empty" data-archive-state="empty">
              <strong>暂无可阅读档案</strong>
              <span>当前没有玩家可见资料</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
