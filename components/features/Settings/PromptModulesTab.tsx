import { useMemo, useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块类目, 提示词模块作用域 } from '@/models/prompts';
import {
  PROMPT_MODULE_CATEGORY_LABELS,
  PROMPT_MODULE_SCOPE_LABELS,
  isBuiltinPromptModule,
} from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';

const isMainPlotModule = (m: 提示词模块) => !m.scope?.includes('calibration');
const isOtherSystemModule = (m: 提示词模块) => m.scope?.includes('calibration');

/** 独立系统分组映射：calibration 模块按子系统归类 */
const CALIBRATION_SYSTEM_GROUPS: Record<string, { label: string; icon: string; emoji: string; match: (id: string) => boolean }> = {
  news: { label: '新闻系统', icon: '◈', emoji: '🗞️', match: (id) => id === 'builtin_news_cot' || id === 'builtin_news_worldbook' || id === 'builtin_news_output_format' || id.startsWith('st_import_news_') },
  phone: { label: '手机系统', icon: '◈', emoji: '📱', match: (id) => id === 'builtin_phone_cot' || id === 'builtin_phone_worldbook' || id === 'builtin_phone_output_format' || id.startsWith('st_import_phone_') },
  zhiku: { label: '智库系统', icon: '◈', emoji: '📚', match: (id) => id === 'builtin_zhiku_cot' || id === 'builtin_zhiku_output_format' || id.startsWith('st_import_zhiku_') },
  yiting: { label: '忆庭系统', icon: '◈', emoji: '🧠', match: (id) => id === 'builtin_yiting_recall' || id === 'builtin_yiting_archive_format' || id.startsWith('st_import_yiting_') },
  variable: { label: '变量系统', icon: '◈', emoji: '⚙️', match: (id) => id === 'builtin_variable_cot' || id.startsWith('st_import_variable_') },
  storyWeaving: { label: '剧情编织系统', icon: '◈', emoji: '📖', match: (id) => id === 'builtin_story_weaving_cot' || id === 'builtin_story_weaving_worldbook' || id === 'builtin_story_weaving_output_format' || id.startsWith('st_import_story_weaving_') },
};
const CALIBRATION_GROUP_ORDER = ['news', 'phone', 'zhiku', 'yiting', 'variable', 'storyWeaving'] as const;

/** 根据模块 id 获取所属的系统分组 key，不属于任何已知系统的归入 'other' */
const getCalibrationGroupKey = (m: 提示词模块): string => {
  for (const key of CALIBRATION_GROUP_ORDER) {
    if (CALIBRATION_SYSTEM_GROUPS[key].match(m.id)) return key;
  }
  return 'other';
};

/** 文风模块互斥组：同一时间只能启用一个。ST 预设导入的文风（id 含 'st_import_' 前缀）也加入此组。 */
const WRITING_STYLE_MODULE_IDS = new Set([
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
]);
const isWritingStyleModule = (m: 提示词模块) =>
  WRITING_STYLE_MODULE_IDS.has(m.id) || m.id.startsWith('st_import_writing_style_');

/** ST 预设导入的模块：id 以 'st_import_' 前缀标识。
 *  Phase 3 数据模型扩展后会加 source/replaceable 字段，目前先靠 id 前缀识别。 */
const isSTImportedModule = (m: 提示词模块) => m.id.startsWith('st_import_');

/** 从 ST 导入模块的 id 解析它替换的内置模块类别（用于显示替换关系提示）。
 *  命名约定：st_import_<category>_<timestamp>，例如 st_import_writing_style_1719400000000。 */
const ST_IMPORT_CATEGORY_PREFIX = 'st_import_';
const getSTImportTargetCategory = (m: 提示词模块): 提示词模块类目 | null => {
  if (!isSTImportedModule(m)) return null;
  // st_import_writing_style_xxx → style
  // st_import_persona_xxx → persona
  const rest = m.id.slice(ST_IMPORT_CATEGORY_PREFIX.length);
  if (rest.startsWith('writing_style')) return 'style';
  if (rest.startsWith('persona')) return 'persona';
  if (rest.startsWith('cot')) return 'cot';
  if (rest.startsWith('format')) return 'format';
  if (rest.startsWith('devmode')) return 'devmode';
  return m.category;
};

/** 分类语义色：每个类目对应一个 CSS 变量（RGB 三元组），用于分组图标与类目标签着色。
 *  - cot 思维链 → sage-soft 绿（思考/推理）
 *  - format 输出格式 → accent-secondary 副色（结构化）
 *  - persona 叙述人格 → amber-soft 琥珀（人格/温暖）
 *  - devmode 开发模式 → danger 红（特殊/危险模式）
 *  - style 文风 → accent-primary 主色（主轴）
 *  - custom 自定义 → text-secondary 中性（用户自建）
 */
const CATEGORY_COLOR_VAR: Record<提示词模块类目, string> = {
  cot: '--tj-sage-soft',
  format: '--tj-accent-secondary',
  persona: '--tj-amber-soft',
  devmode: '--tj-danger',
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
  const selected = sorted.find((m) => m.id === selectedId) ?? sorted[0];
  // 系统切换：主剧情 / 独立模型
  const [activeSystem, setActiveSystem] = useState<'main' | 'calibration'>('main');
  const visibleModules = useMemo(
    () => sorted.filter(activeSystem === 'main' ? isMainPlotModule : isOtherSystemModule),
    [sorted, activeSystem],
  );

  const update = (next: 提示词模块[]) => {
    onChange({ ...settings, promptModules: next });
  };

  const patch = (id: string, partial: Partial<提示词模块>) => {
    // 文风互斥：启用某个文风模块时，关闭其他文风模块
    if (partial.enabled === true) {
      const target = modules.find((m) => m.id === id);
      if (target && isWritingStyleModule(target)) {
        const next = modules.map((m) =>
          m.id === id
            ? { ...m, ...partial, updatedAt: Date.now() }
            : isWritingStyleModule(m) && m.enabled
              ? { ...m, enabled: false, updatedAt: Date.now() }
              : m,
        );
        update(next);
        return;
      }
    }
    update(
      modules.map((m) =>
        m.id === id ? { ...m, ...partial, updatedAt: Date.now() } : m,
      ),
    );
  };

  const addCustom = () => {
    const now = Date.now();
    const newId = `custom_${now}`;
    const usedOrders = modules.map((m) => m.order);
    const nextOrder = Math.max(1000, ...usedOrders) + 10;
    const created: 提示词模块 = {
      id: newId,
      title: '新自定义模块',
      description: '',
      category: 'custom',
      content: '',
      enabled: true,
      builtin: false,
      order: nextOrder,
      scope: ['all'],
      createdAt: now,
      updatedAt: now,
    };
    update([...modules, created]);
    setSelectedId(newId);
  };

  const isCustomWritingStyleSlot = (id: string) => id === 'builtin_writing_style_custom';

  const removeModule = (id: string) => {
    if (isBuiltinPromptModule(id) || isCustomWritingStyleSlot(id)) return;
    const next = modules.filter((m) => m.id !== id);
    update(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const resetBuiltins = () => {
    if (!confirm('确定将所有内置模块的内容/标题恢复为初始？\n（自定义模块不会被删除，玩家修改过的主剧情内置 enabled 状态会被保留；独立模型展示模块会保持展示状态）')) {
      return;
    }
    const fresh = createBuiltinPromptModules();
    const next = modules.map((m) => {
      if (!isBuiltinPromptModule(m.id)) return m;
      const def = fresh.find((f) => f.id === m.id);
      if (!def) return m;
      const isCalibrationBuiltin = def.scope?.includes('calibration');
      // 保留玩家当前的主剧情 enabled，覆盖其它字段；独立模型展示模块不作为真实请求开关。
      return {
        ...def,
        enabled: isCalibrationBuiltin ? true : m.enabled,
        createdAt: m.createdAt,
        updatedAt: Date.now(),
      };
    });
    // 若某条 builtin 被异常删除，补回
    for (const def of fresh) {
      if (!next.find((m) => m.id === def.id)) next.push(def);
    }
    update(next);
  };

  const importSTPreset = () => {
    // Phase 3 占位：ST 预设导入功能尚未实现
    alert('SillyTavern 预设导入功能开发中（Phase 3）。\n届时将支持导入 .json/.jsonl 预设文件，自动解析为提示词模块。');
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 md:flex-row" style={{ minHeight: 0 }}>
      {/* Left: module list */}
      <div className="flex max-h-[34dvh] min-w-0 flex-shrink-0 flex-col gap-2 md:max-h-none md:w-[280px]">
        {/* 系统切换 Segmented Control */}
        <div className="flex gap-1 p-1" style={{
          background: 'rgba(var(--tj-bg-secondary), 0.5)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: smallClip,
        }}>
          {([
            { key: 'main', label: '◆ 主剧情' },
            { key: 'calibration', label: '◈ 独立系统' },
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
            ◆ 模块列表
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
              if (target && !target.scope?.includes('calibration')) {
                patch(id, { enabled: !target.enabled });
              }
            }}
            showModifyLayer={activeSystem === 'main'}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
          <button
            onClick={addCustom}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: smallClip,
            }}
          >
            + 新增自定义模块
          </button>
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
            重置内置为初始
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 右侧顶部 header：标题 + 导入按钮 */}
        <div className="mb-2 flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            ◆ 模块编辑
          </span>
          <button
            onClick={importSTPreset}
            className="px-3 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.18), rgba(var(--tj-ui-nsfw), 0.08))',
              color: 'rgba(var(--tj-ui-nsfw), 0.95)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.35)',
              clipPath: smallClip,
            }}
            title="导入 SillyTavern 预设文件"
          >
            ◈ 导入酒馆预设
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
            暂无模块。点击「+ 新增自定义模块」开始。
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

/** 判断模块是否可修改：非内置 / 自定义文风槽 / ST导入 都可修改 */
const isModifiableModule = (m: 提示词模块) =>
  !isBuiltinPromptModule(m.id) || m.id === 'builtin_writing_style_custom' || isSTImportedModule(m);

function ModuleList({
  modules,
  selected,
  onSelect,
  onToggle,
  showModifyLayer,
}: {
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  showModifyLayer: boolean;
}) {
  if (!modules.length) return null;

  // 主剧情系统：按可修改性分两层；独立模型系统：不分层，直接展示
  const modifiable = modules.filter(isModifiableModule);
  const readonly = modules.filter((m) => !isModifiableModule(m));

  if (!showModifyLayer) {
    // 独立系统页面：按子系统分组，每组一个折叠标题 + 模块列表
    const grouped: Record<string, 提示词模块[]> = {};
    for (const m of modules) {
      const key = getCalibrationGroupKey(m);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    return (
      <div className="mb-2 space-y-3">
        {CALIBRATION_GROUP_ORDER.filter((k) => grouped[k]?.length).map((key) => {
          const group = CALIBRATION_SYSTEM_GROUPS[key];
          const items = grouped[key];
          return (
            <SystemGroupSection key={key} group={group} items={items} selected={selected} onSelect={onSelect} onToggle={onToggle} />
          );
        })}
        {/* 未归类模块兜底 */}
        {grouped['other']?.length > 0 && (
          <SystemGroupSection
            group={{ label: '其他系统', icon: '◈', emoji: '⚡', match: () => false }}
            items={grouped['other']}
            selected={selected}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* 可修改模块层 */}
      {modifiable.length > 0 && (
        <ModifyLayer
          title="可修改"
          icon="▼"
          defaultCollapsed={false}
          modules={modifiable}
          selected={selected}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      )}
      {/* 不可修改模块层 */}
      {readonly.length > 0 && (
        <ModifyLayer
          title="不可修改"
          icon="▽"
          defaultCollapsed={true}
          modules={readonly}
          selected={selected}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      )}
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
  group: { label: string; icon: string; emoji: string; match: (id: string) => boolean };
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
}: {
  title: string;
  icon: string;
  defaultCollapsed: boolean;
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
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
      </button>
      {!collapsed && modules.map((m) => (
        <ModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
      ))}
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
  const isCal = m.scope?.includes('calibration');
  const isSTImport = isSTImportedModule(m);
  const isStyle = isWritingStyleModule(m);
  // 身份标签：ST导入 > 内置 > 自定义
  const badgeLabel = isSTImport ? 'ST导入' : m.builtin ? '内置' : '自定义';
  const badgeStyle = isSTImport
    ? {
        color: 'rgb(var(--tj-bg-primary))',
        background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.88), rgba(var(--tj-ui-nsfw), 0.68))',
      }
    : m.builtin
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
        {/* 滑块开关：独立模型模块禁用（不是真实开关） */}
        <span
          role="switch"
          aria-checked={isCal || m.enabled}
          title={isCal ? '独立模型展示模块不是真实请求开关' : m.enabled ? '已启用' : '已关闭'}
          onClick={(e) => {
            e.stopPropagation();
            if (!isCal) onToggle(m.id);
          }}
          className="relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer items-center transition-all"
          style={{
            background: isCal || m.enabled
              ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
              : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: isCal || m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            cursor: isCal ? 'not-allowed' : 'pointer',
            opacity: isCal ? 0.6 : 1,
          }}
        >
          <span
            className="absolute top-0.5 h-3 w-3 transition-transform"
            style={{
              left: isCal || m.enabled ? 'calc(100% - 0.875rem)' : '0.125rem',
              background: isCal || m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
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
  const isCalibrationModule = m.scope?.includes('calibration');

  // 分层信息：根据 order 区间映射 Layer
  const layerLabel = m.order < 10 ? 'Layer 1 · 顶层' : m.order < 30 ? 'Layer 2 · 主体' : 'Layer 3 · 尾部';

  // ST 导入替换关系提示
  const isSTImport = isSTImportedModule(m);
  const stTargetCategory = isSTImport ? getSTImportTargetCategory(m) : null;

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
      {/* ST 导入替换关系提示条 */}
      {isSTImport && stTargetCategory && (
        <div
          className="flex items-start gap-2 px-3 py-2 text-xs"
          style={{
            background: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw), 0.08) 0%, transparent 100%)',
            boxShadow: 'inset 2px 0 0 rgba(var(--tj-ui-nsfw), 0.6), inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.15)',
            clipPath:
              'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          }}
        >
          <span
            className="font-serif tracking-[0.12em] flex-shrink-0"
            style={{ color: 'rgba(var(--tj-ui-nsfw), 0.85)' }}
          >
            ◈ ST导入
          </span>
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
            此模块从 SillyTavern 预设导入，归类于
            <span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[stTargetCategory]}), 0.9)`, margin: '0 0.25em' }}>
              {PROMPT_MODULE_CATEGORY_LABELS[stTargetCategory]}
            </span>
            分类。启用后将替换同分类的内置模块内容；删除后会回退到内置版本。
          </span>
        </div>
      )}
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
            {isCalibrationModule ? '独立模型展示' : '启用此模块'}
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
          disabled={isCalibrationModule}
          aria-disabled={isCalibrationModule}
          title={isCalibrationModule ? '独立模型展示模块不是真实请求开关' : undefined}
          onClick={() => {
            if (isCalibrationModule) return;
            onPatch({ enabled: !m.enabled });
          }}
          className="relative h-6 w-11 flex-shrink-0 transition-all"
          style={{
            background: isCalibrationModule || m.enabled
                  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                  : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: isCalibrationModule || m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: smallClip,
            cursor: isCalibrationModule ? 'not-allowed' : 'pointer',
            opacity: isCalibrationModule ? 0.82 : 1,
          }}
        >
          <div
            className="absolute top-0.5 h-5 w-5 transition-transform"
            style={{
              left: isCalibrationModule || m.enabled ? 'calc(100% - 1.375rem)' : '0.125rem',
              background: isCalibrationModule || m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
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
          value={m.scope?.length ? m.scope : ['all']}
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
