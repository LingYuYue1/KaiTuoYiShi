import type { 智库分类, 智库注入内容 } from '@/models/zhiku';
import {
  创建空智库注入内容,
  归一化智库注入内容,
  ZHIKU_CHARACTER_INJECTION_FIELDS,
  ZHIKU_LORE_INJECTION_FIELDS,
} from '@/models/zhiku';
import { PerformanceTextarea } from './primitives';

interface InjectionContentFieldsProps {
  category: 智库分类;
  value?: 智库注入内容;
  editable: boolean;
  onChange: (next: 智库注入内容) => void;
}

function readField(content: 智库注入内容, field: string): string {
  const record = content as unknown as Record<string, string>;
  return typeof record[field] === 'string' ? record[field] : '';
}

/** 注入内容编辑：召回只使用结构化载荷，缺失字段的条目会被主剧情门禁挡下。 */
export function InjectionContentFields({ category, value, editable, onChange }: InjectionContentFieldsProps) {
  const normalized = 归一化智库注入内容(value, category) ?? 创建空智库注入内容(category);
  if (!normalized) return null;
  const fields = normalized.类型 === 'character'
    ? ZHIKU_CHARACTER_INJECTION_FIELDS
    : ZHIKU_LORE_INJECTION_FIELDS;

  return (
    <section className="mt-4 px-3 py-3" style={{ background: 'rgba(var(--tj-bg-primary), 0.2)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)', clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}>
      <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>注入内容</div>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
        结构化注入是召回时真正送给模型的内容；任一字段为空，该条目都不会参与主剧情注入。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <PerformanceTextarea
            key={field}
            label={field}
            value={readField(normalized, field)}
            editable={editable}
            onChange={(next) => onChange({ ...normalized, [field]: next })}
          />
        ))}
      </div>
    </section>
  );
}
