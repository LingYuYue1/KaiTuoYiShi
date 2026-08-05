import { useId, type CSSProperties } from 'react';
import type { ZhikuNodePlacement } from './types';

interface DataOrbitLayerProps {
  nodes: ZhikuNodePlacement[];
  layoutVariant?: 'desktop' | 'mobile';
  selectedId?: string | null;
  opacity?: number;
  reducedMotion?: boolean;
  entering?: boolean;
}

const ROUTE_REVEAL_ORDER: Record<string, number> = {
  story: 0,
  aeon: 1,
  path: 2,
  enemy: 3,
  term: 4,
  event: 5,
  faction: 6,
  location: 7,
};

export function DataOrbitLayer({
  nodes,
  layoutVariant = 'desktop',
  selectedId,
  opacity = 0.68,
  reducedMotion = false,
  entering = false,
}: DataOrbitLayerProps) {
  const orbitId = useId().replace(/:/g, '');
  const center = nodes.find((node) => node.id === 'character') ?? nodes[0];
  if (!center) return null;
  const routes = nodes
    .filter((node) => node.id !== center.id)
    .map((node) => {
      const order = ROUTE_REVEAL_ORDER[node.id] ?? 99;
      const bendX = (center.x + node.x) / 2 + (order % 2 === 0 ? 3 : -3);
      const bendY = (center.y + node.y) / 2 + (node.y < center.y ? -4 : 4);
      return {
        node,
        order,
        pathId: `${orbitId}-route-${node.id}`,
        pathData: `M ${center.x} ${center.y} Q ${bendX} ${bendY} ${node.x} ${node.y}`,
      };
    })
    .sort((a, b) => a.order - b.order);
  const mobileLayout = layoutVariant === 'mobile';

  return (
    <svg
      className={`zhiku-v3-orbits zhiku-v3-orbits--${layoutVariant}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ '--zhiku-orbit-opacity': opacity } as CSSProperties}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <ellipse
        className="zhiku-v3-orbits__ring"
        cx={mobileLayout ? 50 : 52}
        cy={mobileLayout ? 53 : 50}
        rx={mobileLayout ? 34 : 34}
        ry={mobileLayout ? 34 : 30}
      />
      <ellipse
        className="zhiku-v3-orbits__ring zhiku-v3-orbits__ring--wide"
        cx={mobileLayout ? 50 : 52}
        cy={mobileLayout ? 53 : 50}
        rx={mobileLayout ? 45 : 45}
        ry={mobileLayout ? 43 : 39}
      />
      {routes.map(({ node, pathData, pathId }) => {
        const active = node.id === selectedId || center.id === selectedId;
        return (
          <g key={node.id} className="zhiku-v3-orbits__route" data-active={active ? 'true' : 'false'}>
            <path id={pathId} d={pathData} />
            <circle cx={node.x} cy={node.y} r="0.42" />
          </g>
        );
      })}
      {entering && !reducedMotion && (
        <g className="zhiku-v3-orbits__packet-layer">
          {routes.flatMap(({ node, order, pathId }) =>
            ['01', '10', '11'].map((glyph, packetIndex) => {
              const begin = 210 + order * 46 + packetIndex * 72;
              return (
                <g key={`${node.id}-${glyph}-${packetIndex}`} className="zhiku-v3-orbits__packet" opacity="0">
                  <text className="zhiku-v3-orbits__packet-glyph" x="-1.35" y="0.5" transform="scale(0.56 1)">
                    {glyph}
                  </text>
                  <animateMotion
                    begin={`${begin}ms`}
                    dur="360ms"
                    fill="remove"
                    calcMode="spline"
                    keyTimes="0;1"
                    keySplines="0.18 0.72 0.2 1"
                  >
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;1;0.82;0"
                    keyTimes="0;0.12;0.78;1"
                    begin={`${begin}ms`}
                    dur="360ms"
                    fill="remove"
                  />
                </g>
              );
            }),
          )}
        </g>
      )}
    </svg>
  );
}
