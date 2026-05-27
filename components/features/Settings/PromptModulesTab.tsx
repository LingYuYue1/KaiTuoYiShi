import { useMemo, useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块类目, 提示词模块作用域 } from '@/models/prompts';
import {
  PROMPT_MODULE_CATEGORY_LABELS,
  PROMPT_MODULE_SCOPE_LABELS,
  isBuiltinPromptModule,
} from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';

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

  const update = (next: 提示词模块[]) => {
    onChange({ ...settings, promptModules: next });
  };

  const patch = (id: string, partial: Partial<提示词模块>) => {
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
    if (!confirm('确定将所有内置模块的内容/标题恢复为初始？\n（自定义模块不会被删除，玩家修改过的内置 enabled 状态会被保留为当前值）')) {
      return;
    }
    const fresh = createBuiltinPromptModules();
    const next = modules.map((m) => {
      if (!isBuiltinPromptModule(m.id)) return m;
      const def = fresh.find((f) => f.id === m.id);
      if (!def) return m;
      // 保留玩家当前的 enabled，覆盖其它字段
      return {
        ...def,
        enabled: m.enabled,
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

  return (
    <div className="flex h-full gap-4" style={{ minHeight: 0 }}>
      {/* Left: module list */}
      <div className="flex w-[260px] flex-shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            ◆ 模块列表
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            {sorted.length} 条
          </span>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          {sorted.map((m) => {
            const active = m.id === selected?.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="mb-1.5 w-full px-3 py-2 text-left transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.16), rgba(var(--tj-accent-primary), 0.04))'
                    : 'rgba(var(--tj-bg-secondary), 0.45)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] px-1.5 py-0.5"
                    style={{
                      color: m.builtin ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary), 0.9)',
                      background: m.builtin
                        ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.9), rgba(212, 177, 90, 0.9))'
                        : 'rgba(var(--tj-accent-primary), 0.12)',
                      clipPath:
                        'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                    }}
                  >
                    {m.builtin ? '内置' : '自定义'}
                  </span>
                  <span
                    className="flex-1 truncate font-serif text-sm tracking-wider"
                    style={{ color: 'rgb(var(--tj-text-primary))' }}
                  >
                    {m.title}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{
                      color: m.enabled ? 'rgba(120, 220, 130, 0.85)' : 'rgba(var(--tj-text-secondary), 0.55)',
                    }}
                  >
                    {m.enabled ? '● 启用' : '○ 关闭'}
                  </span>
                </div>
                <div
                  className="mt-1 truncate text-xs"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
                >
                  [{PROMPT_MODULE_CATEGORY_LABELS[m.category]} · order {m.order}] {m.description || '—'}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
          <button
            onClick={addCustom}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.9), rgba(212, 177, 90, 0.9))',
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
              color: 'rgba(220, 200, 160, 0.85)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
              clipPath: smallClip,
            }}
          >
            重置内置为初始
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {selected ? (
          <EditorPanel
            module={selected}
            onPatch={(p) => patch(selected.id, p)}
            onDelete={() => removeModule(selected.id)}
          />
        ) : (
          <div
            className="flex flex-1 items-center justify-center text-sm"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.5)' }}
          >
            暂无模块。点击「+ 新增自定义模块」开始。
          </div>
        )}
      </div>
    </div>
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

  return (
    <div className="space-y-3">
      {/* 启用开关 */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath:
            'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        }}
      >
        <div className="min-w-0 mr-3">
          <div
            className="font-serif font-bold text-sm tracking-wider"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          >
            启用此模块
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
            关闭后，本模块的内容不会注入到 system prompt
          </div>
        </div>
        <button
          onClick={() => onPatch({ enabled: !m.enabled })}
          className="relative h-6 w-11 flex-shrink-0 transition-all"
          style={{
            background: m.enabled
              ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
              : 'rgba(60, 55, 40, 0.7)',
            boxShadow: m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: smallClip,
          }}
        >
          <div
            className="absolute top-0.5 h-5 w-5 transition-transform"
            style={{
              left: m.enabled ? 'calc(100% - 1.375rem)' : '0.125rem',
              background: m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(220, 200, 160, 0.85)',
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
          className="kaituo-input w-full px-3 py-2 text-sm"
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
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
        />
      </Field>

      {/* 分类 + order */}
      <div className="flex gap-3">
        <Field label="◆ 分类">
          <select
            value={m.category}
            disabled={readonly}
            onChange={(e) =>
              onPatch({ category: e.target.value as 提示词模块类目 })
            }
            className="kaituo-input px-3 py-2 text-sm"
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
            className="kaituo-input px-3 py-2 text-sm w-24"
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
        勾选「任意」表示在所有场景注入；其他场景互斥于「任意」，选中具体场景将取消「任意」。
      </div>

      {/* 内容 */}
      <Field label={`◆ 提示词正文${readonly ? '（内置，只读）' : ''}`}>
        <textarea
          value={m.content}
          readOnly={readonly}
          onChange={(e) => onPatch({ content: e.target.value })}
          rows={16}
          className="kaituo-input w-full px-3 py-2 text-xs resize-none font-mono"
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
                ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.85), rgba(212, 177, 90, 0.85))'
                : 'rgba(var(--tj-bg-secondary), 0.5)',
              color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(220, 200, 160, 0.85)',
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
