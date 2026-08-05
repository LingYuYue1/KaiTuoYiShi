import { ArrowLeft, X } from 'lucide-react';
import type { CSSProperties } from 'react';

interface ZhikuHeaderProps {
  title?: string;
  subtitle?: string;
  emblemSrc?: string;
  onBack?: () => void;
  onClose?: () => void;
}

export function ZhikuHeader({
  title = '智库',
  subtitle = '星海档案',
  emblemSrc,
  onBack,
  onClose,
}: ZhikuHeaderProps) {
  const emblemStyle = emblemSrc
    ? ({ '--zhiku-header-emblem': `url("${emblemSrc}")` } as CSSProperties)
    : undefined;

  return (
    <header className="zhiku-v3-header">
      <div className="zhiku-v3-header__left">
        {onBack && (
          <button type="button" className="zhiku-v3-header__back" onClick={onBack} aria-label="返回分类大厅" title="返回分类大厅">
            <ArrowLeft size={21} strokeWidth={1.6} />
          </button>
        )}
        <div className="zhiku-v3-header__identity">
          <span
            className="zhiku-v3-header__mark"
            data-emblem={emblemSrc ? 'true' : 'false'}
            style={emblemStyle}
            aria-hidden="true"
          >
            <span />
          </span>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="zhiku-v3-header__actions">
        {onClose && (
          <button type="button" onClick={onClose} aria-label="关闭智库" title="关闭智库">
            <X size={23} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  );
}
