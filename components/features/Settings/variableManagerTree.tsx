import { useState } from 'react';
import { ARRAY_RENDER_BATCH_SIZE, inferDefaultValueFromSibling, isRecord, isUnknownArray, summarizeValue } from '@/utils/variableManagerLogic';
import { smallClip } from './settingsShared';
import { NsfwArchiveEditor, nsfwAccent } from './variableManagerNsfw';

export function TreeNode({
  label,
  value,
  depth,
  onChange,
  onDelete,
}: {
  label: string;
  value: unknown;
  depth: number;
  onChange: (next: unknown) => void;
  onDelete?: () => void;
}) {
  const isArray = isUnknownArray(value);
  const objectLike = isRecord(value);
  const [expanded, setExpanded] = useState(depth === 0);
  const [visibleArrayItems, setVisibleArrayItems] = useState(ARRAY_RENDER_BATCH_SIZE);

  if (!isArray && !objectLike) {
    return <LeafRow label={label} value={value} depth={depth} onChange={onChange} onDelete={onDelete} />;
  }

  // NSFW 档案渲染专用编辑面板（中文标签 + 下拉 + 标签编辑器），而非通用树形展开。
  // 用 <details> 包裹并默认折叠，避免占用大量纵向位置；点击 summary 展开。
  if (!isArray && objectLike && label === 'NSFW档案') {
    const archive = value;
    const enabled = archive.enabled === true;
    const fieldCount = Object.keys(archive).length;
    return (
      <details
        className="mb-1"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer select-none items-center gap-2 py-1.5">
          <span className="font-serif text-sm font-bold" style={{ color: nsfwAccent }}>NSFW 档案</span>
          <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{`{${fieldCount}}`}</span>
          <span className="text-xs" style={{ color: enabled ? nsfwAccent : 'rgba(var(--tj-text-secondary),0.58)' }}>{enabled ? '已启用' : '预留'}</span>
          <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.5)' }}>（点击展开编辑）</span>
        </summary>
        {expanded && (
          <div className="mt-1">
            <NsfwArchiveEditor value={archive} onChange={onChange} />
          </div>
        )}
      </details>
    );
  }

  return (
    <details
      open={expanded}
      onToggle={(event) => {
        const nextExpanded = event.currentTarget.open;
        setExpanded(nextExpanded);
        if (!nextExpanded && isArray) setVisibleArrayItems(ARRAY_RENDER_BATCH_SIZE);
      }}
      className="mb-1.5"
      style={{
        marginLeft: depth === 0 ? 0 : 16,
        paddingLeft: depth === 0 ? 0 : 10,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.10)',
      }}
    >
      <summary className="flex min-w-0 cursor-pointer select-none flex-wrap items-center gap-2 py-1.5">
        <span className="min-w-0 max-w-full truncate font-serif text-sm font-bold" style={{ color: depth === 0 ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-ui-body),0.94)' }}>
          {label}
        </span>
        <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
          {isArray ? `[${value.length}]` : `{${Object.keys(value).length}}`}
        </span>
        <span className="min-w-0 max-w-full truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
          {summarizeValue(value)}
        </span>
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isArray) {
              onChange([...value, inferDefaultValueFromSibling(value)]);
              return;
            }
            const key = window.prompt('新字段名');
            if (!key) return;
            if (key in value) {
              window.alert('字段已存在');
              return;
            }
            onChange({ ...value, [key]: '' });
          }}
          className="px-1.5 py-0.5 text-[10px]"
          style={{ color: 'rgba(165,230,170,0.94)', boxShadow: 'inset 0 0 0 1px rgba(165,230,170,0.25)', clipPath: smallClip }}
        >
          新增
        </button>
        {onDelete && (
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (window.confirm(`确认删除 ${label} ?`)) onDelete();
            }}
            className="px-1.5 py-0.5 text-[10px]"
            style={{ color: 'rgba(255,135,135,0.9)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.25)', clipPath: smallClip }}
          >
            删除
          </button>
        )}
      </summary>

      {expanded && (
      <div className="space-y-0.5">
        {isArray
          ? value.slice(0, visibleArrayItems).map((item, index) => (
              <TreeNode
                key={index}
                label={`[${index}]`}
                value={item}
                depth={depth + 1}
                onChange={(next) => {
                  const nextArr = [...value];
                  nextArr[index] = next;
                  onChange(nextArr);
                }}
                onDelete={() => {
                  const nextArr = [...value];
                  nextArr.splice(index, 1);
                  onChange(nextArr);
                }}
              />
            ))
          : Object.entries(value).map(([key, item]) => (
              <TreeNode
                key={key}
                label={key}
                value={item}
                depth={depth + 1}
                onChange={(next) => onChange({ ...value, [key]: next })}
                onDelete={() => {
                  const nextObj: Record<string, unknown> = {};
                  for (const [entryKey, item] of Object.entries(value)) {
                    if (entryKey !== key) nextObj[entryKey] = item;
                  }
                  onChange(nextObj);
                }}
              />
            ))}
        {isArray && visibleArrayItems < value.length && (
          <button
            type="button"
            onClick={() => setVisibleArrayItems((current) => Math.min(value.length, current + ARRAY_RENDER_BATCH_SIZE))}
            className="ml-4 mt-2 px-3 py-1 text-xs"
            style={{
              color: 'rgba(var(--tj-accent-primary),0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)',
              clipPath: smallClip,
            }}
          >
            继续显示（{Math.min(ARRAY_RENDER_BATCH_SIZE, value.length - visibleArrayItems)} / {value.length - visibleArrayItems}）
          </button>
        )}
      </div>
      )}
    </details>
  );
}

export function LeafRow({
  label,
  value,
  depth,
  onChange,
  onDelete,
}: {
  label: string;
  value: unknown;
  depth: number;
  onChange: (next: unknown) => void;
  onDelete?: () => void;
}) {
  const type = typeof value;

  return (
    <div
      className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:gap-2"
      style={{
        marginLeft: depth === 0 ? 0 : 16,
        paddingLeft: depth === 0 ? 0 : 10,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.08)',
      }}
    >
      <span className="min-w-0 flex-shrink-0 pt-1 font-serif text-sm sm:min-w-[144px]" style={{ color: 'rgba(var(--tj-ui-body),0.92)' }}>
        {label}
      </span>

      {value === null ? (
        <button
          onClick={() => onChange('')}
          className="px-2 py-1 text-[13px]"
          style={{ color: 'rgba(var(--tj-text-secondary),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: smallClip }}
        >
          null
        </button>
      ) : type === 'boolean' ? (
        <button
          onClick={() => onChange(!value)}
          className="px-3 py-1 font-mono text-[13px]"
          style={{
            background: value ? 'rgba(165,230,170,0.16)' : 'rgba(135,135,135,0.14)',
            color: value ? 'rgba(165,230,170,0.95)' : 'rgba(210,200,172,0.78)',
            boxShadow: `inset 0 0 0 1px ${value ? 'rgba(165,230,170,0.32)' : 'rgba(var(--tj-accent-primary),0.16)'}`,
            clipPath: smallClip,
          }}
        >
          {value ? 'true' : 'false'}
        </button>
      ) : type === 'number' ? (
        <input
          type="number"
          value={Number.isFinite(value) ? (value as number) : 0}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
        />
      ) : typeof value === 'string' && (value.length > 58 || value.includes('\n')) ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={Math.min(7, Math.max(2, Math.ceil(value.length / 58)))}
          className="kaituo-input w-full min-w-0 flex-1 resize-none px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      )}

      {onDelete && (
        <button
          onClick={() => {
            if (window.confirm(`确认删除 ${label} ?`)) onDelete();
          }}
          className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 text-[11px]"
          style={{ color: 'rgba(255,135,135,0.86)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.22)', clipPath: smallClip }}
        >
          删除
        </button>
      )}
    </div>
  );
}
