import type { CSSProperties, ReactNode } from 'react';
import { CategoryNode } from './CategoryNode';
import type { ZhikuCategory, ZhikuNodePlacement } from './types';

interface CategoryFieldProps {
  categories: ZhikuCategory[];
  nodes: ZhikuNodePlacement[];
  mobileNodes?: ZhikuNodePlacement[];
  selectedId?: string | null;
  reducedMotion?: boolean;
  onSelect?: (id: ZhikuCategory['id']) => void;
  renderNode?: (category: ZhikuCategory, placement: ZhikuNodePlacement) => ReactNode;
}

const ZHIKU_NODE_REVEAL_ORDER: Record<ZhikuCategory['id'], number> = {
  character: 0,
  story: 1,
  aeon: 2,
  path: 3,
  enemy: 4,
  term: 5,
  event: 6,
  faction: 7,
  location: 8,
};

export function CategoryNodeSlot({
  placement,
  mobilePlacement,
  revealOrder = 0,
  children,
}: {
  placement: ZhikuNodePlacement;
  mobilePlacement?: ZhikuNodePlacement;
  revealOrder?: number;
  children: ReactNode;
}) {
  const revealDelay = revealOrder === 0 ? 150 : 500 + (revealOrder - 1) * 46;
  const style = {
    '--zhiku-node-x': `${placement.x}%`,
    '--zhiku-node-y': `${placement.y}%`,
    '--zhiku-node-scale': placement.scale,
    '--zhiku-node-mobile-x': `${mobilePlacement?.x ?? placement.x}%`,
    '--zhiku-node-mobile-y': `${mobilePlacement?.y ?? placement.y}%`,
    '--zhiku-node-mobile-scale': mobilePlacement?.scale ?? placement.scale,
    '--zhiku-node-reveal-order': revealOrder,
    '--zhiku-node-reveal-delay': `${revealDelay}ms`,
  } as CSSProperties;
  return <div className="zhiku-v3-field__slot" data-reveal-order={revealOrder} style={style}>{children}</div>;
}

export function CategoryField({
  categories,
  nodes,
  mobileNodes = nodes,
  selectedId,
  reducedMotion,
  onSelect,
  renderNode,
}: CategoryFieldProps) {
  const placements = new Map(nodes.map((node) => [node.id, node]));
  const mobilePlacements = new Map(mobileNodes.map((node) => [node.id, node]));

  return (
    <div className="zhiku-v3-field">
      {categories.map((category) => {
        const placement = placements.get(category.id);
        if (!placement) return null;
        const revealOrder = ZHIKU_NODE_REVEAL_ORDER[category.id];
        if (renderNode) {
          return (
            <div key={category.id} className="zhiku-v3-field__render-slot">
              {renderNode(category, placement)}
            </div>
          );
        }
        return (
          <CategoryNodeSlot
            key={category.id}
            placement={placement}
            mobilePlacement={mobilePlacements.get(category.id)}
            revealOrder={revealOrder}
          >
            <CategoryNode
              category={category}
              selected={selectedId === category.id}
              reducedMotion={reducedMotion}
              onSelect={() => onSelect?.(category.id)}
            />
          </CategoryNodeSlot>
        );
      })}
    </div>
  );
}
