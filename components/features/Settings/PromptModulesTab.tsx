import { useMemo, useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块类目, 提示词模块作用域 } from '@/models/prompts';
import {
  PROMPT_MODULE_CATEGORY_LABELS,
  PROMPT_MODULE_SCOPE_LABELS,
  isBuiltinPromptModule,
} from '@/models/prompts';
import {
  CALIBRATION_GROUP_ORDER,
  CALIBRATION_SYSTEM_GROUPS,
  addPromptModule,
  getCalibrationGroupKey,
  isBuiltinPresetModule,
  isMainPlotModule,
  isOtherSystemModule,
  isWritingStyleModule,
  patchModule,
  removePromptModule,
  reorderPromptModules,
  resetBuiltinModules,
} from '@/utils/promptModuleTransitions';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** 独立系统分组展示 emoji：逻辑层 CALIBRATION_SYSTEM_GROUPS 只含 label/match，展示符号留在 UI 层。 */
const CALIBRATION_SYSTEM_EMOJIS: Record<string, string> = {
  news: '🗞️',
  phone: '📱',
  zhiku: '📚',
  yiting: '🧠',
  variable: '⚙️',
  companionArchive: '👥',
  storyWeaving: '📖',
};


/** 分类语义色：每个类目对应一个 CSS 变量（RGB 三元组），用于分组图标与类目标签着色。
 *  - cot 思维链 → sage-soft 绿（思考/推理）
 *  - format 输出格式 → accent-secondary 副色（结构化）
 *  - persona 叙述人格 → amber-soft 琥珀（人格/温暖）
 *  - devmode 开发模式 → danger 红（特殊/危险模式）
 *  - jailbreak 越狱 → ui-nsfw 粉（NSFW/越狱解锁，ST 预设常见）
 *  - style 文风 → accent-primary 主色（主轴）
 *  - custom 自定义 → text-secondary 中性（用户自建）
 */
const CATEGORY_COLOR_VAR: Record<提示词模块类目, string> = {
  cot: '--tj-sage-soft',
  format: '--tj-accent-secondary',
  persona: '--tj-amber-soft',
  devmode: '--tj-danger',
  jailbreak: '--tj-ui-nsfw',
  style: '--tj-accent-primary',
  custom: '--tj-text-secondary',
};

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';


export function PromptModulesTab({ settings, onChange }: Props) {
  const modules = settings.promptModules;
  const sorted = useMemo(
    () => [...modules].sort((a, b) => a.order - b.order),
    [modules],
  );
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const selected = sorted.find((m) => m.id === selectedId) ?? sorted.at(0);
  // 系统切换：主剧情 / 独立模型
  const [activeSystem, setActiveSystem] = useState<'main' | 'calibration'>('main');
  const [showAddModal, setShowAddModal] = useState(false);
  const visibleModules = useMemo(
    () => sorted.filter(activeSystem === 'main' ? isMainPlotModule : isOtherSystemModule),
    [sorted, activeSystem],
  );

  const update = (next: 提示词模块[]) => {
    onChange({ ...settings, promptModules: next });
  };

  const patch = (id: string, partial: Partial<提示词模块>) => {
    update(patchModule(modules, id, partial, Date.now()));
  };

  const reorderModules = (reordered: 提示词模块[]) => {
    update(reorderPromptModules(modules, reordered));
  };

  const addCustomModule = (
    systemKey: string,
    category: 提示词模块类目,
    replaceMode: 'replace' | 'coexist',
  ) => {
    const { next, newId } = addPromptModule(modules, { systemKey, category, replaceMode, now: Date.now() });
    update(next);
    setSelectedId(newId);
    setShowAddModal(false);
  };

  const removeModule = (id: string) => {
    const next = removePromptModule(modules, id, Date.now());
    update(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const resetBuiltins = () => {
    if (!confirm('确定将所有内置模块的内容/标题恢复为初始？\n（自定义模块不会被删除，玩家修改过的主剧情内置 enabled 状态会被保留；独立模型展示模块会保持展示状态）')) {
      return;
    }
    update(resetBuiltinModules(modules, Date.now()));
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 md:flex-row" style={{ minHeight: 0 }}>
      <div className="flex max-h-[34dvh] min-w-0 flex-shrink-0 flex-col gap-2 md:max-h-none md:w-[360px]">
        <div className="flex gap-1 p-1" style={{
          background: 'rgba(var(--tj-bg-secondary), 0.5)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: smallClip,
        }}>
          {([
            { key: 'main', label: '主剧情' },
            { key: 'calibration', label: '独立系统' },
          ] as const).map((sys) => {
            const active = activeSystem === sys.key;
            return (
              <button
                key={sys.key}
                type="button"
                onClick={() => setActiveSystem(sys.key)}
                className="flex-1 px-3 py-1.5 text-sm font-serif tracking-[0.12em] transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
                    : 'transparent',
                  color: active ? 'rgb(var(--tj-on-accent))' : 'rgba(var(--tj-text-secondary), 0.7)',
                  clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                  cursor: 'pointer',
                }}
              >
                {sys.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            模块列表
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            {visibleModules.length} 条
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ModuleList
            modules={visibleModules}
            selected={selected}
            onSelect={setSelectedId}
            onToggle={(id) => {
              const target = modules.find((m) => m.id === id);
              if (!target || target.scope.includes('calibration')) return;
              const nextEnabled = !target.enabled;
              if (isBuiltinPresetModule(target) && target.enabled && !nextEnabled) {
                if (!window.confirm('该模块属于原生提示词底座，关闭可能影响输出稳定性。确定要关闭吗？')) {
                  return;
                }
              }
              patch(id, { enabled: nextEnabled });
            }}
            showModifyLayer={activeSystem === 'main'}
            onReorder={reorderModules}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
          <button
            onClick={resetBuiltins}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
              clipPath: smallClip,
            }}
          >
            重置内置模块
          </button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            模块编辑
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: smallClip,
            }}
          >
            + 新增自定义模块
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {selected ? (
            <EditorPanel
              module={selected}
              onPatch={(p) => patch(selected.id, p)}
              onDelete={() => removeModule(selected.id)}
            />
          ) : (
            <div
              className="flex flex-1 items-center justify-center text-sm"
              style={{
                color: 'rgba(var(--tj-text-secondary), 0.5)',
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.06)',
                background: 'radial-gradient(circle at 50% 40%, rgba(var(--tj-accent-primary), 0.018) 0%, transparent 60%)',
                padding: '2rem 1rem',
                textAlign: 'center',
                letterSpacing: '0.2em',
              }}
            >
              暂无模块。点击“新增自定义模块”开始。
            </div>
          )}
        </div>
      </div>
      {showAddModal && (
        <AddCustomModuleModal
          onConfirm={addCustomModule}
          onCancel={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

/** 判断模块是否可修改：非内置 / 自定义文风槽 都可修改。
 *  用于 ModuleItem 显示 ✓ 可修改 / 🔒 不可修改 标识。 */
const isModifiableModule = (m: 提示词模块) =>
  !isBuiltinPromptModule(m.id) || m.id === 'builtin_writing_style_custom';

function ModuleList({
  modules,
  selected,
  onSelect,
  onToggle,
  showModifyLayer,
  onReorder,
}: {
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  showModifyLayer: boolean;
  onReorder?: (reorderedModules: 提示词模块[]) => void;
}) {
  if (!modules.length) return null;

  if (!showModifyLayer) {
    // 独立系统页面：按子系统分组，每组一个折叠标题 + 模块列表
    const grouped: Record<string, 提示词模块[] | undefined> = {};
    for (const m of modules) {
      const key = getCalibrationGroupKey(m);
      const bucket = grouped[key];
      if (bucket) {
        bucket.push(m);
      } else {
        grouped[key] = [m];
      }
    }

    return (
      <div className="mb-2 space-y-3">
        {CALIBRATION_GROUP_ORDER.filter((k) => grouped[k]?.length).map((key) => {
          const group = { label: CALIBRATION_SYSTEM_GROUPS[key].label, emoji: CALIBRATION_SYSTEM_EMOJIS[key] };
          const items = grouped[key] ?? [];
          return (
            <SystemGroupSection key={key} group={group} items={items} selected={selected} onSelect={onSelect} onToggle={onToggle} />
          );
        })}
        {/* 未归类模块兜底 */}
        {(grouped['other']?.length ?? 0) > 0 && (
          <SystemGroupSection
            group={{ label: '其他系统', emoji: '⚡' }}
            items={grouped['other'] ?? []}
            selected={selected}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        )}
      </div>
    );
  }

  // 主剧情系统：统一为「提示词模块」单一列表，按 order 升序排列（不再区分内置 / 预设）。
  return (
    <div className="mb-2">
      <ModifyLayer
        title="提示词模块"
        icon="▼"
        defaultCollapsed={false}
        modules={modules}
        selected={selected}
        onSelect={onSelect}
        onToggle={onToggle}
        onReorder={onReorder}
      />
    </div>
  );
}

function SystemGroupSection({
  group,
  items,
  selected,
  onSelect,
  onToggle,
}: {
  group: { label: string; emoji: string };
  items: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-all"
      >
        <span
          className="text-xs font-mono transition-transform"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.7)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          }}
        >
          ▼
        </span>
        <span className="text-sm">{group.emoji}</span>
        <span
          className="text-sm font-serif tracking-[0.16em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          {group.label}
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
        >
          {items.length} 条
        </span>
      </button>
      {!collapsed && items.map((m) => (
        <ModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
      ))}
    </div>
  );
}

function ModifyLayer({
  title,
  icon,
  defaultCollapsed,
  modules,
  selected,
  onSelect,
  onToggle,
  onReorder,
}: {
  title: string;
  icon: string;
  defaultCollapsed: boolean;
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onReorder?: (reorderedModules: 提示词模块[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // 拖拽结束：按新顺序重算 order（间距 10），仅修改 order 值变化的模块
  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(modules, oldIndex, newIndex);
    const STEP = 10;
    const updated = reordered.map((m, i) => ({
      ...m,
      order: STEP * (i + 1),
      updatedAt: Date.now(),
    }));
    onReorder(updated);
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-all"
      >
        <span
          className="text-xs font-mono transition-transform"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.7)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          }}
        >
          {icon}
        </span>
        <span
          className="text-sm font-serif tracking-[0.16em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          {title}
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
        >
          {modules.length} 条
        </span>
        {onReorder && (
          <span
            className="text-[10px] font-serif tracking-[0.12em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}
          >
            · 可拖拽
          </span>
        )}
      </button>
      {!collapsed && onReorder ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {modules.map((m) => (
              <SortableModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
            ))}
          </SortableContext>
        </DndContext>
      ) : !collapsed ? (
        modules.map((m) => (
          <ModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
        ))
      ) : null}
    </div>
  );
}

/** 拖拽手柄图标（六点双竖线） */
const DRAG_HANDLE_ICON = '⠿';

/** SortableModuleItem：在 ModuleItem 外层包裹 dnd-kit 的 sortable 能力。
 *  - attributes 绑到外层 div（提供 a11y/role 等语义）
 *  - listeners 只绑到内部的拖拽手柄 span，避免吃掉 ModuleItem 内部的 onSelect 点击 / onToggle 滑块开关事件
 *  - 拖拽中：透明度 0.5 + 提升 z-index，避免被遮挡
 */
function SortableModuleItem({ m, active, onSelect, onToggle }: {
  m: 提示词模块;
  active: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-stretch"
    >
      <span
        {...listeners}
        title="拖拽以调整顺序"
        aria-label="拖拽手柄"
        className="flex w-4 flex-shrink-0 cursor-grab select-none items-center justify-center text-xs transition-colors active:cursor-grabbing"
        style={{
          color: 'rgba(var(--tj-accent-primary), 0.45)',
        }}
      >
        {DRAG_HANDLE_ICON}
      </span>
      <div className="min-w-0 flex-1">
        <ModuleItem m={m} active={active} onSelect={onSelect} onToggle={onToggle} />
      </div>
    </div>
  );
}

function ModuleItem({
  m,
  active,
  onSelect,
  onToggle,
}: {
  m: 提示词模块;
  active: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isCal = m.scope.includes('calibration');
  const isStyle = isWritingStyleModule(m);
  // 开关禁用：独立模型展示模块（非真实开关）
  const toggleDisabled = isCal;
  // 身份标签：内置 > 自定义
  const badgeLabel = m.builtin ? '内置' : '自定义';
  const badgeStyle = m.builtin
    ? {
        color: 'rgb(var(--tj-bg-primary))',
        background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
      }
    : {
        color: 'rgba(var(--tj-accent-primary), 0.94)',
        background: 'rgba(var(--tj-accent-primary), 0.12)',
      };
  return (
    <button
      onClick={() => onSelect(m.id)}
      className="mb-1 w-full px-3 py-2 text-left transition-all"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.04))'
          : 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55), 0 0 0 1px rgba(var(--tj-accent-primary), 0.06), 0 0 12px rgba(var(--tj-accent-glow), 0.04)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] px-1.5 py-0.5"
          style={{
            ...badgeStyle,
            clipPath:
              'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        >
          {badgeLabel}
        </span>
        {/* 可修改性标识：✓ 可修改 / 🔒 不可修改 */}
        <span
          title={isModifiableModule(m) ? '可修改' : '只读不可改'}
          className="text-[10px] px-1 py-0.5"
          style={{
            color: isModifiableModule(m)
              ? 'rgba(var(--tj-sage-soft), 0.95)'
              : 'rgba(var(--tj-text-secondary), 0.55)',
            background: isModifiableModule(m)
              ? 'rgba(var(--tj-sage-soft), 0.12)'
              : 'rgba(var(--tj-bg-secondary), 0.5)',
            boxShadow: `inset 0 0 0 1px ${
              isModifiableModule(m)
                ? 'rgba(var(--tj-sage-soft), 0.35)'
                : 'rgba(var(--tj-text-secondary), 0.18)'
            }`,
            clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
          }}
        >
          {isModifiableModule(m) ? '✓' : '🔒'}
        </span>
        {m.replaceMode && (
          <span
            title={m.replaceMode === 'replace' ? '替换模式：删除本模块会恢复被它关闭的内置模块' : '叠加模式：与内置模块共存'}
            className="text-[10px] px-1.5 py-0.5"
            style={{
              color: m.replaceMode === 'replace' ? 'rgba(var(--tj-ui-nsfw), 0.9)' : 'rgba(var(--tj-sage-soft), 0.9)',
              background: m.replaceMode === 'replace' ? 'rgba(var(--tj-ui-nsfw), 0.1)' : 'rgba(var(--tj-sage-soft), 0.1)',
              boxShadow: `inset 0 0 0 1px ${m.replaceMode === 'replace' ? 'rgba(var(--tj-ui-nsfw), 0.28)' : 'rgba(var(--tj-sage-soft), 0.28)'}`,
              clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
            }}
          >
            {m.replaceMode === 'replace' ? '替换' : '叠加'}
          </span>
        )}
        <span
          className="flex-1 truncate font-serif text-sm tracking-wider"
          style={{ color: 'rgb(var(--tj-text-primary))' }}
        >
          {m.title}
        </span>
        {/* 右上角小徽章：文风互斥 */}
        {isStyle && (
          <span
            className="text-[8px] font-serif tracking-[0.12em] px-1.5 py-0.5"
            style={{
              color: 'rgba(var(--tj-accent-secondary), 0.85)',
              background: 'rgba(var(--tj-accent-secondary), 0.1)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-secondary), 0.25)',
              clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            }}
            title="文风模块为单选互斥：启用一个会自动关闭其他文风"
          >
            互斥
          </span>
        )}
        {/* 滑块开关：独立模型模块禁用（不可切换） */}
        <span
          role="switch"
          aria-checked={toggleDisabled || m.enabled}
          title={toggleDisabled ? '独立模型展示模块不是真实请求开关' : m.enabled ? '已启用' : '已关闭'}
          onClick={(e) => {
            e.stopPropagation();
            if (!toggleDisabled) onToggle(m.id);
          }}
          className="relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer items-center transition-all"
          style={{
            background: toggleDisabled || m.enabled
              ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
              : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: toggleDisabled || m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            cursor: toggleDisabled ? 'not-allowed' : 'pointer',
            opacity: toggleDisabled ? 0.6 : 1,
          }}
        >
          <span
            className="absolute top-0.5 h-3 w-3 transition-transform"
            style={{
              left: toggleDisabled || m.enabled ? 'calc(100% - 0.875rem)' : '0.125rem',
              background: toggleDisabled || m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
              clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
            }}
          />
        </span>
      </div>
      <div
        className="mt-1 truncate text-xs"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
      >
        [<span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[m.category]}), 0.9)` }}>{PROMPT_MODULE_CATEGORY_LABELS[m.category]}</span> · order {m.order}] {m.description || '—'}
      </div>
    </button>
  );
}

function EditorPanel({
  module: m,
  onPatch,
  onDelete,
}: {
  module: 提示词模块;
  onPatch: (p: Partial<提示词模块>) => void;
  onDelete: () => void;
}) {
  const readonly = m.builtin && m.id !== 'builtin_writing_style_custom';
  const isCalibrationModule = m.scope.includes('calibration');
  // 开关禁用：独立模型展示模块（非真实开关）
  const toggleDisabled = isCalibrationModule;

  // 分层信息：根据 order 区间映射 Layer
  const layerLabel = m.order < 10 ? 'Layer 1 · 顶层' : m.order < 30 ? 'Layer 2 · 主体' : 'Layer 3 · 尾部';

  return (
    <div className="min-w-0 space-y-3">
      {/* 分层标记 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-serif tracking-[0.16em]"
        style={{
          background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.06) 0%, transparent 100%)',
          color: 'rgba(var(--tj-accent-primary), 0.7)',
          clipPath:
            'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <span>{layerLabel}</span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
        <span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[m.category]}), 0.85)` }}>
          {PROMPT_MODULE_CATEGORY_LABELS[m.category]}
        </span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>
          order {m.order}
        </span>
        {m.builtin && (
          <>
            <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
            <span style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>内置</span>
          </>
        )}
      </div>
      {/* 启用开关 */}
      <div
        className="flex flex-col items-stretch gap-3 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath:
            'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        }}
      >
        <div className="min-w-0 sm:mr-3">
          <div
            className="font-serif font-bold text-sm tracking-wider"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          >
            {toggleDisabled ? '独立模型展示' : '启用此模块'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
            {isCalibrationModule
              ? '独立模型提示词展示：新闻、手机、智库、变量、剧情编织等真实请求由对应服务层共享 prompt 构建；可在“上下文”页核对实际发送内容。'
              : isWritingStyleModule(m)
                ? '文风模块为单选互斥：启用本模块会自动关闭其他文风模块。同一时间只能生效一个文风。'
                : '关闭后，本模块的内容不会注入到当前作用域的 system prompt。'}
          </div>
        </div>
        <button
          type="button"
          disabled={toggleDisabled}
          aria-disabled={toggleDisabled}
          title={toggleDisabled ? '独立模型展示模块不是真实请求开关' : undefined}
          onClick={() => {
            if (toggleDisabled) return;
            onPatch({ enabled: !m.enabled });
          }}
          className="relative h-6 w-11 flex-shrink-0 transition-all"
          style={{
            background: toggleDisabled || m.enabled
                  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                  : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: toggleDisabled || m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: smallClip,
            cursor: toggleDisabled ? 'not-allowed' : 'pointer',
            opacity: toggleDisabled ? 0.82 : 1,
          }}
        >
          <div
            className="absolute top-0.5 h-5 w-5 transition-transform"
            style={{
              left: toggleDisabled || m.enabled ? 'calc(100% - 1.375rem)' : '0.125rem',
              background: toggleDisabled || m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
              clipPath:
                'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            }}
          />
        </button>
      </div>

      {/* 标题 */}
      <Field label={`◆ 标题${readonly ? '（内置，只读）' : ''}`}>
        <input
          type="text"
          value={m.title}
          readOnly={readonly}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
          style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
        />
      </Field>

      {/* 描述 */}
      <Field label={`◆ 描述${readonly ? '（内置，只读）' : ''}`}>
        <input
          type="text"
          value={m.description}
          readOnly={readonly}
          onChange={(e) => onPatch({ description: e.target.value })}
          className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
          style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
        />
      </Field>

      {/* 分类 + order */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="◆ 分类">
          <select
            value={m.category}
            disabled={readonly}
            onChange={(e) =>
              onPatch({ category: e.target.value as 提示词模块类目 })
            }
            className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
            style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
          >
            {(Object.keys(PROMPT_MODULE_CATEGORY_LABELS) as 提示词模块类目[]).map((c) => (
              <option key={c} value={c}>
                {PROMPT_MODULE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="◆ 注入顺序（升序）">
          <input
            type="number"
            value={m.order}
            disabled={readonly}
            onChange={(e) => onPatch({ order: Number(e.target.value) })}
            className="kaituo-input w-full min-w-0 px-3 py-2 text-sm sm:w-24"
            style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
          />
        </Field>
      </div>
      <div className="text-xs -mt-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        order &lt; 30 注入到 system prompt 顶部；&ge; 30 注入到尾部。
      </div>

      {/* 注入场景（scope） */}
      <Field label={`◆ 注入场景${readonly ? '（内置，只读）' : ''}`}>
        <ScopeChips
          value={m.scope.length ? m.scope : ['all']}
          readonly={readonly}
          onChange={(next) => onPatch({ scope: next })}
        />
      </Field>
      <div className="text-xs -mt-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        {isCalibrationModule
          ? '「独立模型」作用域用于展示独立 API / 校准模型提示词，不会进入主剧情 system prompt；真实调用以对应上下文页为准。'
          : '勾选「任意」表示在所有场景注入；其他场景互斥于「任意」，选中具体场景将取消「任意」。'}
      </div>

      {/* 内容 */}
      <Field label={`◆ 提示词正文${readonly ? '（内置，只读）' : ''}`}>
        <textarea
          value={m.content}
          readOnly={readonly}
          onChange={(e) => onPatch({ content: e.target.value })}
          rows={16}
          className="kaituo-input w-full min-w-0 resize-none px-3 py-2 font-mono text-xs"
          style={{ clipPath: smallClip, opacity: readonly ? 0.8 : 1 }}
        />
      </Field>
      <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        可用占位符：<code>{'{wordCountTarget}'}</code>（最少字数）/ <code>{'{personLabel}'}</code>（叙述人称描述）。注入时按当前设置替换。
      </div>

      {/* 删除按钮（自定义模块） */}
      {!readonly && !isBuiltinPromptModule(m.id) && m.id !== 'builtin_writing_style_custom' && (
        <div className="pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}>
          <button
            onClick={() => {
              if (confirm(`确定删除模块「${m.title}」？此操作不可撤销。`)) onDelete();
            }}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(220, 100, 100, 0.85)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 100, 100, 0.4)',
              clipPath: smallClip,
            }}
          >
            ✕ 删除此模块
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-serif tracking-[0.2em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const ADD_MODAL_SYSTEM_OPTIONS = [
  { key: 'main', label: '◆ 主剧情', emoji: '🌟' },
  ...CALIBRATION_GROUP_ORDER.map((key) => {
    return { key, label: `${CALIBRATION_SYSTEM_EMOJIS[key]} ${CALIBRATION_SYSTEM_GROUPS[key].label}`, emoji: CALIBRATION_SYSTEM_EMOJIS[key] };
  }),
] as const;

const MAIN_PLOT_CATEGORIES: 提示词模块类目[] = ['cot', 'format', 'persona', 'devmode', 'jailbreak', 'style', 'custom'];
const CALIBRATION_CATEGORIES: 提示词模块类目[] = ['cot', 'format', 'custom'];

function AddCustomModuleModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (systemKey: string, category: 提示词模块类目, replaceMode: 'replace' | 'coexist') => void;
  onCancel: () => void;
}) {
  const [systemKey, setSystemKey] = useState<string>('main');
  const [category, setCategory] = useState<提示词模块类目>('cot');
  const [replaceMode, setReplaceMode] = useState<'replace' | 'coexist'>('replace');

  const categories = systemKey === 'main' ? MAIN_PLOT_CATEGORIES : CALIBRATION_CATEGORIES;

  const handleConfirm = () => {
    onConfirm(systemKey, category, replaceMode);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="flex w-[360px] max-w-[90vw] flex-col gap-4 p-5"
        style={{
          background: 'rgb(var(--tj-bg-primary))',
          boxShadow: '0 0 40px rgba(var(--tj-accent-primary), 0.12), inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
          clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="text-sm font-serif tracking-[0.2em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}
        >
          + 新增自定义模块
        </div>

        <div className="space-y-4">
          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              1 · 目标系统
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ADD_MODAL_SYSTEM_OPTIONS.map((opt) => {
                const active = systemKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSystemKey(opt.key);
                      setCategory('cot');
                    }}
                    className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.88), rgba(var(--tj-btn-primary-end), 0.78))'
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.45)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              2 · 模块分类
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all"
                    style={{
                      background: active
                        ? `rgba(var(${CATEGORY_COLOR_VAR[cat]}), 0.8)`
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : `rgba(var(${CATEGORY_COLOR_VAR[cat]}), 0.85)`,
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.35)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    {PROMPT_MODULE_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              3 · 替换模式
            </div>
            <div className="flex gap-1.5">
              {([
                { key: 'replace' as const, label: '替换同分类内置', desc: '启用新模块，禁用同系统同分类内置' },
                { key: 'coexist' as const, label: '叠加并存', desc: '新模块和内置模块独立并存' },
              ]).map((opt) => {
                const active = replaceMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setReplaceMode(opt.key)}
                    className="flex-1 px-2.5 py-2 text-xs transition-all"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.88), rgba(var(--tj-btn-primary-end), 0.78))'
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.45)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="font-serif tracking-wider">{opt.label}</div>
                    <div
                      className="mt-0.5 text-[10px]"
                      style={{ color: active ? 'rgba(var(--tj-bg-primary), 0.7)' : 'rgba(var(--tj-text-secondary), 0.55)' }}
                    >
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
              clipPath: smallClip,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 px-3 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: smallClip,
              cursor: 'pointer',
            }}
          >
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

const SCOPE_OPTIONS: 提示词模块作用域[] = ['all', 'main', 'opening', 'battle', 'pathAwakening', 'calibration'];

function ScopeChips({
  value,
  readonly,
  onChange,
}: {
  value: 提示词模块作用域[];
  readonly: boolean;
  onChange: (next: 提示词模块作用域[]) => void;
}) {
  const toggle = (s: 提示词模块作用域) => {
    if (readonly) return;
    let next: 提示词模块作用域[];
    if (s === 'all') {
      next = value.includes('all') ? [] : ['all'];
    } else if (value.includes(s)) {
      next = value.filter((v) => v !== s);
    } else {
      next = [...value.filter((v) => v !== 'all'), s];
    }
    if (next.length === 0) next = ['all'];
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {SCOPE_OPTIONS.map((s) => {
        const active = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            disabled={readonly}
            className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all"
            style={{
              background: active
                ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.85), rgba(var(--tj-btn-primary-end), 0.78))'
                : 'rgba(var(--tj-bg-secondary), 0.5)',
              color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: active
                ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
              clipPath:
                'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
              opacity: readonly ? 0.7 : 1,
              cursor: readonly ? 'not-allowed' : 'pointer',
            }}
          >
            {PROMPT_MODULE_SCOPE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
