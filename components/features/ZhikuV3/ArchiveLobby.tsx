import { BookMarked, BookOpenText, CalendarClock, Flag, MapPin, UserRound, type LucideIcon } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { ZhikuArchiveCategoryId } from '@/services/zhikuArchive';

interface ArchiveLobbyCategory {
  id: ZhikuArchiveCategoryId;
  label: string;
  count: number;
  countLabel: string;
}

interface ArchiveLobbyProps {
  categories: ArchiveLobbyCategory[];
  itemCount: number;
  chapterCount: number;
  onSelect: (id: ZhikuArchiveCategoryId) => void;
}

const CATEGORY_ICONS: Record<ZhikuArchiveCategoryId, LucideIcon> = {
  character: UserRound,
  story: BookOpenText,
  location: MapPin,
  faction: Flag,
  event: CalendarClock,
  term: BookMarked,
};

const NODE_POSITIONS: Record<ZhikuArchiveCategoryId, { x: number; y: number; scale: number }> = {
  character: { x: 50, y: 47, scale: 1.16 },
  story: { x: 29, y: 25, scale: 0.94 },
  term: { x: 71, y: 24, scale: 0.86 },
  location: { x: 21.5, y: 56, scale: 0.8 },
  faction: { x: 74.5, y: 58, scale: 0.8 },
  event: { x: 50, y: 83, scale: 0.78 },
};

const CENTER = NODE_POSITIONS.character;

function routePath(id: ZhikuArchiveCategoryId): string {
  const node = NODE_POSITIONS[id];
  const bendX = (CENTER.x + node.x) / 2 + (id.length % 2 === 0 ? 3 : -3);
  const bendY = (CENTER.y + node.y) / 2 + (node.y < CENTER.y ? -5 : 5);
  return `M ${CENTER.x} ${CENTER.y} Q ${bendX} ${bendY} ${node.x} ${node.y}`;
}

export function ArchiveLobby({ categories, itemCount, chapterCount, onSelect }: ArchiveLobbyProps) {
  const [focusId, setFocusId] = useState<ZhikuArchiveCategoryId | null>(null);
  const isEmpty = itemCount === 0 && chapterCount === 0;

  return (
    <div className="zj-field" aria-label="智库分类大厅">
      <svg className="zj-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {categories
          .filter((category) => category.id !== 'character')
          .map((category) => (
            <g key={category.id}>
              <path
                d={routePath(category.id)}
                data-active={focusId === category.id ? 'true' : 'false'}
              />
              <circle cx={NODE_POSITIONS[category.id].x} cy={NODE_POSITIONS[category.id].y} r="0.5" />
            </g>
          ))}
      </svg>

      <div className="zj-hall__ring" aria-hidden="true">
        <span />
        <span />
      </div>

      {categories.map((category, index) => {
        const position = NODE_POSITIONS[category.id];
        const Icon = CATEGORY_ICONS[category.id];
        return (
          <button
            key={category.id}
            type="button"
            className="zj-node"
            data-category-id={category.id}
            style={{
              '--x': `${position.x}%`,
              '--y': `${position.y}%`,
              '--s': position.scale,
              '--i': index,
            } as CSSProperties}
            onMouseEnter={() => setFocusId(category.id)}
            onMouseLeave={() => setFocusId(null)}
            onFocus={() => setFocusId(category.id)}
            onBlur={() => setFocusId(null)}
            onClick={() => onSelect(category.id)}
            aria-label={`${category.label}，${category.countLabel}`}
          >
            <span className="zj-node__disc">
              <span className="zj-node__halo" aria-hidden="true" />
              <Icon size={30} strokeWidth={1.25} aria-hidden="true" />
            </span>
            <span className="zj-node__label">{category.label}</span>
            <span className="zj-node__count">{category.countLabel}</span>
          </button>
        );
      })}

      {isEmpty && (
        <div className="zj-hall-note" data-archive-state="empty">
          档案尚未收录：内置资料未载入，或当前存档还没有可归档的剧情章节。可尝试重载内置档案。
        </div>
      )}
    </div>
  );
}
