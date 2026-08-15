import { useState } from 'react';
import { isRecord } from '@/utils/variableManagerLogic';
import { cardClip, smallClip } from './settingsShared';

// ─────────────────────────────────────────────────────────────
// NSFW 档案专用编辑面板
// 在变量管理页 NPC → 某个 NPC → NSFW档案 字段处渲染，
// 提供中文标签、年龄下拉、标签编辑器和分组身体档案表单。
// ─────────────────────────────────────────────────────────────

export const NSFW_AGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'adult', label: '成人' },
  { value: 'unknown', label: '未标注' },
  { value: 'minor_blocked', label: '标注未成年' },
];

const FEMALE_BODY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '胸部', label: '胸部' },
  { key: '女性私处', label: '女性私处' },
  { key: '后庭', label: '后庭' },
  { key: '体态', label: '体态' },
  { key: '体味', label: '体味' },
];

const MALE_BODY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '男性器', label: '男性器' },
  { key: '后庭', label: '后庭' },
  { key: '体态', label: '体态' },
  { key: '体味', label: '体味' },
];

export const nsfwAccent = 'rgba(214, 142, 174, 0.9)';

export function NsfwArchiveEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (next: unknown) => void }) {
  const enabled = value.enabled === true;
  const age = typeof value.年龄确认 === 'string' ? value.年龄确认 : 'unknown';
  const femaleBody = isRecord(value.女性身体档案) ? value.女性身体档案 : undefined;
  const maleBody = isRecord(value.男性身体档案) ? value.男性身体档案 : undefined;

  const patch = (updates: Record<string, unknown>) => onChange({ ...value, ...updates });

  return (
    <div
      className="space-y-4 px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.08), rgba(var(--tj-ui-panel), 0.5))',
        boxShadow: 'inset 0 0 0 1px rgba(214, 142, 174, 0.24)',
        clipPath: cardClip,
      }}
    >
      <button
        onClick={() => patch({ enabled: !enabled })}
        className="flex w-full items-center justify-between gap-3"
      >
        <span className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
          启用状态
        </span>
        <span
          className="px-3 py-0.5 font-mono text-[11px]"
          style={{
            background: enabled ? 'rgba(214, 142, 174, 0.22)' : 'rgba(120, 110, 100, 0.16)',
            color: enabled ? nsfwAccent : 'rgba(var(--tj-text-secondary),0.7)',
            boxShadow: `inset 0 0 0 1px ${enabled ? 'rgba(214, 142, 174, 0.4)' : 'rgba(var(--tj-accent-primary),0.16)'}`,
            clipPath: smallClip,
          }}
        >
          {enabled ? '已启用' : '预留'}
        </span>
      </button>

      <div className="grid gap-3 md:grid-cols-2">
        <NsfwSelectField
          label="年龄确认"
          value={age}
          options={NSFW_AGE_OPTIONS}
          onChange={(v) => patch({ 年龄确认: v })}
        />
        <NsfwTextField
          label="亲密阶段"
          value={typeof value.亲密阶段 === 'string' ? value.亲密阶段 : ''}
          onChange={(v) => patch({ 亲密阶段: v })}
        />
      </div>

      <NsfwTextField
        label="边界"
        area
        value={typeof value.边界 === 'string' ? value.边界 : ''}
        onChange={(v) => patch({ 边界: v })}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <NsfwTagEditor label="偏好" items={toStringArray(value.偏好)} onChange={(items) => patch({ 偏好: items })} />
        <NsfwTagEditor label="敏感点" items={toStringArray(value.敏感点)} onChange={(items) => patch({ 敏感点: items })} />
        <NsfwTagEditor label="禁忌" items={toStringArray(value.禁忌)} onChange={(items) => patch({ 禁忌: items })} />
      </div>

      <NsfwBodyArchiveSection
        title="女性身体档案"
        fields={FEMALE_BODY_FIELDS}
        body={femaleBody}
        onChange={(next) => patch({ 女性身体档案: next })}
      />
      <NsfwBodyArchiveSection
        title="男性身体档案"
        fields={MALE_BODY_FIELDS}
        body={maleBody}
        onChange={(next) => patch({ 男性身体档案: next })}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <NsfwTagEditor label="经历" items={toStringArray(value.经历)} onChange={(items) => patch({ 经历: items })} multiline />
        <NsfwTagEditor label="长期事实" items={toStringArray(value.长期事实)} onChange={(items) => patch({ 长期事实: items })} multiline />
      </div>

      <NsfwTagEditor label="标签" items={toStringArray(value.标签)} onChange={(items) => patch({ 标签: items })} />

      <NsfwTextField
        label="备注"
        area
        value={typeof value.备注 === 'string' ? value.备注 : ''}
        onChange={(v) => patch({ 备注: v })}
      />
    </div>
  );
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function NsfwSelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-2 py-1.5 text-[12px]"
        style={{ clipPath: smallClip }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function NsfwTextField({ label, value, onChange, area }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(5, Math.max(2, Math.ceil(value.length / 48)))}
          className="kaituo-input w-full resize-none px-2 py-1.5 text-[12px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="kaituo-input w-full px-2 py-1.5 text-[12px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      )}
    </div>
  );
}

function NsfwTagEditor({ label, items, onChange, multiline }: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (items.some((item) => item.trim() === text)) { setDraft(''); return; }
    onChange([...items, text]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-1.5">
            {multiline ? (
              <textarea
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
                rows={Math.min(3, Math.max(1, Math.ceil(item.length / 40)))}
                className="kaituo-input min-w-0 flex-1 resize-none px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            ) : (
              <input
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
                className="kaituo-input min-w-0 flex-1 px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            )}
            <button
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="flex-shrink-0 px-1.5 py-1 text-[10px]"
              style={{ color: 'rgba(255,135,135,0.86)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.22)', clipPath: smallClip }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={`添加${label}…`}
          className="kaituo-input min-w-0 flex-1 px-2 py-1 text-[11px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
        <button
          onClick={add}
          className="flex-shrink-0 px-2 py-1 text-[10px]"
          style={{ color: 'rgba(165,230,170,0.94)', boxShadow: 'inset 0 0 0 1px rgba(165,230,170,0.25)', clipPath: smallClip }}
        >
          ＋
        </button>
      </div>
    </div>
  );
}

function NsfwBodyArchiveSection({ title, fields, body, onChange }: {
  title: string;
  fields: ReadonlyArray<{ key: string; label: string }>;
  body: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const current = body ?? {};
  const update = (key: string, text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      onChange({ ...current, [key]: trimmed });
      return;
    }
    const next: Record<string, unknown> = {};
    for (const [entryKey, item] of Object.entries(current)) {
      if (entryKey !== key) next[entryKey] = item;
    }
    onChange(next);
  };
  return (
    <div>
      <div className="mb-2 font-serif text-[12px] tracking-[0.24em]" style={{ color: nsfwAccent }}>
        {title}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {fields.map((field) => {
          const text = typeof current[field.key] === 'string' ? (current[field.key] as string) : '';
          return (
            <div key={field.key}>
              <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(235, 190, 205, 0.72)' }}>
                {field.label}
              </div>
              <textarea
                value={text}
                onChange={(e) => update(field.key, e.target.value)}
                rows={Math.min(4, Math.max(2, Math.ceil((text.length || 1) / 36)))}
                placeholder="暂无"
                className="kaituo-input w-full resize-none px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
