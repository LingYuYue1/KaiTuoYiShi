import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Copy, Download, FileCheck2, Grid3X3, RotateCcw, Save, Scan, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { CategoryNode } from './CategoryNode';
import { CategoryNodeSlot } from './CategoryField';
import {
  DEFAULT_ZHIKU_DESIGN_LAYOUT,
  normalizeZhikuDesignLayout,
  ZHIKU_DESIGN_CATEGORIES,
  ZHIKU_VIEWPORTS,
  type ZhikuDesignCategory,
  type ZhikuDesignCategoryId,
  type ZhikuDesignLayout,
  type ZhikuNodePlacement,
} from './types';
import { ZhikuScreen } from './ZhikuScreen';
import './zhiku-design-lab.css';

interface ZhikuDesignLabProps {
  initialLayout?: ZhikuDesignLayout;
  initialReducedMotion?: boolean;
  persistenceKey?: string | null;
}

interface DraggableCategoryNodeProps {
  category: ZhikuDesignCategory;
  placement: ZhikuNodePlacement;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const ZHIKU_DESIGN_LAYOUT_STORAGE_KEY = 'kaituo.zhiku-v2.design-layout.v1';

const loadPersistedLayout = (fallback: ZhikuDesignLayout, persistenceKey: string | null): ZhikuDesignLayout => {
  if (!persistenceKey || typeof window === 'undefined') return normalizeZhikuDesignLayout(fallback);

  try {
    const saved = window.localStorage.getItem(persistenceKey);
    return saved ? normalizeZhikuDesignLayout(JSON.parse(saved)) : normalizeZhikuDesignLayout(fallback);
  } catch {
    return normalizeZhikuDesignLayout(fallback);
  }
};

function DraggableCategoryNode({
  category,
  placement,
  selected,
  reducedMotion,
  onSelect,
}: DraggableCategoryNodeProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: category.id,
  });
  const motionStyle = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  } as CSSProperties;

  return (
    <CategoryNodeSlot placement={placement}>
      <div
        ref={setNodeRef}
        className="zhiku-design-lab__draggable"
        data-dragging={isDragging ? 'true' : 'false'}
        style={motionStyle}
      >
        <CategoryNode
          ref={setActivatorNodeRef}
          category={category}
          selected={selected}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
    </CategoryNodeSlot>
  );
}

export function ZhikuDesignLab({
  initialLayout = DEFAULT_ZHIKU_DESIGN_LAYOUT,
  initialReducedMotion = false,
  persistenceKey = ZHIKU_DESIGN_LAYOUT_STORAGE_KEY,
}: ZhikuDesignLabProps) {
  const [layout, setLayout] = useState(() => loadPersistedLayout(initialLayout, persistenceKey));
  const [selectedId, setSelectedId] = useState<ZhikuDesignCategoryId>('character');
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(loadPersistedLayout(initialLayout, persistenceKey), null, 2));
  const [status, setStatus] = useState('拖动节点或使用参数栏微调，完成后点击保存。');
  const stageRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const viewport = ZHIKU_VIEWPORTS.find((item) => item.id === layout.viewportId) ?? ZHIKU_VIEWPORTS[0];
  const selectedCategory = ZHIKU_DESIGN_CATEGORIES.find((item) => item.id === selectedId)!;
  const selectedNode = layout.nodes.find((node) => node.id === selectedId)!;
  const stageStyle = {
    '--zhiku-stage-aspect': viewport.width / viewport.height,
    aspectRatio: `${viewport.width} / ${viewport.height}`,
  } as CSSProperties;

  const serializedLayout = useMemo(() => JSON.stringify(layout, null, 2), [layout]);

  const updateNode = (id: ZhikuDesignCategoryId, patch: Partial<ZhikuNodePlacement>) => {
    setLayout((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node),
    }));
  };

  const updateBackground = (key: keyof ZhikuDesignLayout['background'], value: number) => {
    setLayout((current) => ({ ...current, background: { ...current.background, [key]: value } }));
  };

  const handleDragEnd = ({ active, delta }: DragEndEvent) => {
    const stageRect = stageRef.current
      ?.querySelector<HTMLElement>('.zhiku-v2-screen__stage')
      ?.getBoundingClientRect();
    if (!stageRect) return;
    const id = active.id as ZhikuDesignCategoryId;
    const node = layout.nodes.find((item) => item.id === id);
    if (!node) return;
    updateNode(id, {
      x: clamp(node.x + (delta.x / stageRect.width) * 100, 5, 95),
      y: clamp(node.y + (delta.y / stageRect.height) * 100, 10, 90),
    });
    setSelectedId(id);
    setStatus(`${ZHIKU_DESIGN_CATEGORIES.find((item) => item.id === id)?.label ?? id}位置已更新。`);
  };

  const resetLayout = () => {
    const reset = normalizeZhikuDesignLayout(DEFAULT_ZHIKU_DESIGN_LAYOUT);
    setLayout(reset);
    setSelectedId('character');
    setJsonDraft(JSON.stringify(reset, null, 2));
    setStatus('已恢复默认九节点构图；点击保存后才会覆盖已保存布局。');
  };

  const saveLayout = () => {
    if (!persistenceKey) return;

    try {
      window.localStorage.setItem(persistenceKey, serializedLayout);
      setJsonDraft(serializedLayout);
      setStatus('布局已保存；刷新页面会自动恢复。');
    } catch {
      setStatus('浏览器无法保存布局，请改用下载 JSON 备份。');
    }
  };

  const applyJson = () => {
    try {
      const next = normalizeZhikuDesignLayout(JSON.parse(jsonDraft));
      setLayout(next);
      setStatus('JSON 布局已应用。');
    } catch (error) {
      setStatus(error instanceof Error ? `无法应用：${error.message}` : '无法应用 JSON。');
    }
  };

  const copyJson = async () => {
    setJsonDraft(serializedLayout);
    try {
      await navigator.clipboard.writeText(serializedLayout);
      setStatus('当前布局 JSON 已复制。');
    } catch {
      setStatus('当前布局已写入文本区，可从中复制。');
    }
  };

  const downloadJson = () => {
    setJsonDraft(serializedLayout);
    const href = URL.createObjectURL(new Blob([serializedLayout], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `zhiku-layout-${layout.viewportId}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus('布局 JSON 已导出。');
  };

  return (
    <main className="zhiku-design-lab">
      <section className="zhiku-design-lab__workspace" aria-label="智库星图布局画布">
        <div className="zhiku-design-lab__stage-meta" aria-hidden="true">
          <span>ZHIKU / COMPOSITION LAB</span>
          <span>{viewport.width} x {viewport.height}</span>
        </div>
        <div className="zhiku-design-lab__stage-shell">
          <div ref={stageRef} className="zhiku-design-lab__stage" style={stageStyle}>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <ZhikuScreen
                categories={ZHIKU_DESIGN_CATEGORIES}
                layout={layout}
                selectedId={selectedId}
                reducedMotion={reducedMotion}
                showGrid={showGrid}
                showSafeArea={showSafeArea}
                onSelect={setSelectedId}
                renderNode={(category, placement) => (
                  <DraggableCategoryNode
                    key={category.id}
                    category={category}
                    placement={placement}
                    selected={selectedId === category.id}
                    reducedMotion={reducedMotion}
                    onSelect={() => setSelectedId(category.id)}
                  />
                )}
              />
            </DndContext>
          </div>
        </div>
      </section>

      <aside className="zhiku-design-lab__inspector" aria-label="智库布局参数">
        <header className="zhiku-design-lab__inspector-header">
          <div>
            <span>可视化设计台</span>
            <h2>智库 V2</h2>
          </div>
          <div className="zhiku-design-lab__header-actions">
            {persistenceKey && (
              <button type="button" className="zhiku-design-lab__icon-button" onClick={saveLayout} title="保存布局" aria-label="保存布局">
                <Save size={17} />
              </button>
            )}
            <button type="button" className="zhiku-design-lab__icon-button" onClick={resetLayout} title="重置当前布局" aria-label="重置当前布局">
              <RotateCcw size={17} />
            </button>
          </div>
        </header>

        <div className="zhiku-design-lab__section">
          <label className="zhiku-design-lab__label" htmlFor="zhiku-viewport">预览视口</label>
          <select
            id="zhiku-viewport"
            value={layout.viewportId}
            onChange={(event) => setLayout((current) => ({ ...current, viewportId: event.target.value as ZhikuDesignLayout['viewportId'] }))}
          >
            {ZHIKU_VIEWPORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <div className="zhiku-design-lab__toggles">
            <Toggle icon={<Grid3X3 size={15} />} label="网格" checked={showGrid} onChange={setShowGrid} />
            <Toggle icon={<Scan size={15} />} label="安全区" checked={showSafeArea} onChange={setShowSafeArea} />
            <Toggle icon={<Sparkles size={15} />} label="减少动画" checked={reducedMotion} onChange={setReducedMotion} />
          </div>
        </div>

        <div className="zhiku-design-lab__section">
          <div className="zhiku-design-lab__section-title">
            <span>场景参数</span>
            <small>BACKGROUND</small>
          </div>
          <RangeControl label="背景亮度" value={layout.background.brightness} min={0.4} max={1.2} step={0.01} onChange={(value) => updateBackground('brightness', value)} />
          <RangeControl label="压暗层" value={layout.background.dimmer} min={0} max={0.72} step={0.01} onChange={(value) => updateBackground('dimmer', value)} />
          <RangeControl label="轨道强度" value={layout.background.orbitOpacity} min={0} max={1} step={0.01} onChange={(value) => updateBackground('orbitOpacity', value)} />
        </div>

        <div className="zhiku-design-lab__section">
          <div className="zhiku-design-lab__section-title">
            <span>{selectedCategory.label}</span>
            <small>{selectedCategory.featured ? 'PRIMARY NODE' : 'CATEGORY NODE'}</small>
          </div>
          <RangeControl label="横向位置" value={selectedNode.x} min={5} max={95} step={0.1} suffix="%" onChange={(value) => updateNode(selectedId, { x: value })} />
          <RangeControl label="纵向位置" value={selectedNode.y} min={10} max={90} step={0.1} suffix="%" onChange={(value) => updateNode(selectedId, { y: value })} />
          <RangeControl label="节点比例" value={selectedNode.scale} min={0.55} max={1.45} step={0.01} onChange={(value) => updateNode(selectedId, { scale: value })} />
        </div>

        <div className="zhiku-design-lab__section zhiku-design-lab__section--json">
          <div className="zhiku-design-lab__section-title">
            <span>布局 JSON</span>
            <div className="zhiku-design-lab__json-actions">
              <button type="button" onClick={copyJson} title="复制当前 JSON" aria-label="复制当前 JSON"><Copy size={15} /></button>
              <button type="button" onClick={downloadJson} title="导出 JSON 文件" aria-label="导出 JSON 文件"><Download size={15} /></button>
              <button type="button" onClick={applyJson} title="应用文本区 JSON" aria-label="应用文本区 JSON"><FileCheck2 size={15} /></button>
            </div>
          </div>
          <textarea value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} spellCheck={false} aria-label="布局 JSON 文本" />
        </div>

        <p className="zhiku-design-lab__status" aria-live="polite">{status}</p>
      </aside>
    </main>
  );
}

function Toggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="zhiku-design-lab__toggle" data-checked={checked ? 'true' : 'false'}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const update = (raw: string) => onChange(clamp(Number(raw), min, max));
  return (
    <label className="zhiku-design-lab__range">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => update(event.target.value)} />
      <span className="zhiku-design-lab__number">
        <input type="number" min={min} max={max} step={step} value={Number(value.toFixed(2))} onChange={(event) => update(event.target.value)} />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}
