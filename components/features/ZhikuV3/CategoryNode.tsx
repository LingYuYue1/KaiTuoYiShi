import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import type { ZhikuCategory } from './types';

interface CategoryNodeProps {
  category: ZhikuCategory;
  selected?: boolean;
  reducedMotion?: boolean;
  onSelect?: () => void;
  dragHandleProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'style' | 'type' | 'onClick'>;
}

export const CategoryNode = forwardRef<HTMLButtonElement, CategoryNodeProps>(function CategoryNode(
  { category, selected = false, reducedMotion = false, onSelect, dragHandleProps },
  ref,
) {
  const style = {
    '--zhiku-node-index': String(category.id.length % 5),
    '--zhiku-node-icon': `url("${category.iconSrc}")`,
  } as CSSProperties;

  return (
    <button
      {...dragHandleProps}
      ref={ref}
      type="button"
      className="zhiku-v3-node"
      data-category={category.id}
      data-featured={category.featured ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={style}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${category.label}，${category.countLabel === '--' ? '资料待接入' : `${category.countLabel} 条可见资料`}`}
    >
      <span className="zhiku-v3-node__emblem" aria-hidden="true">
        <span className="zhiku-v3-node__orbit zhiku-v3-node__orbit--outer" />
        <span className="zhiku-v3-node__orbit zhiku-v3-node__orbit--inner" />
        <span className="zhiku-v3-node__diamond" />
        <span className="zhiku-v3-node__decode">010110100100100101001011010101010011000100110000</span>
        <span className="zhiku-v3-node__icon" />
        <span className="zhiku-v3-node__spark zhiku-v3-node__spark--a" />
        <span className="zhiku-v3-node__spark zhiku-v3-node__spark--b" />
      </span>
      <span className="zhiku-v3-node__copy">
        <strong>{category.label}</strong>
        <span>{category.countLabel}</span>
      </span>
    </button>
  );
});
