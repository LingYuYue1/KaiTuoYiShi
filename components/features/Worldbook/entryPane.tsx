import { useState } from 'react';
import type { 世界书, 世界书条目, 世界书条目类型, 世界书注入方式 } from '@/models/worldbook';
import { ENTRY_TYPE_LABELS } from '@/models/worldbook';
import { explainEntry } from '@/utils/worldbook';
import { isCalibrationBook, isCalibrationEntry } from '@/utils/worldbookPredicates';
import { EmptyHint, Field, ToggleSwitch } from './worldbookPrimitives';
import { cardClip, smallClip } from './worldbookStyles';

function PaneHeader({
  book,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
}: {
  book: 世界书;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
}) {
  const calibrationDisplay = builtin && isCalibrationBook(book);
  return (
    <div className="px-4 py-4 md:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.22)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          {builtin ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-6 w-[3px] flex-shrink-0"
                  style={{
                    background: 'linear-gradient(180deg, linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92)), rgba(var(--tj-accent-secondary), 0.25))',
                    boxShadow: '0 0 7px rgba(var(--tj-accent-primary), 0.45)',
                  }}
                />
                <h3
                  className="min-w-0 font-serif text-lg font-semibold tracking-[0.16em] sm:text-xl sm:tracking-[0.28em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 55%, rgb(var(--tj-accent-secondary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {book.title}
                </h3>
              </div>
              {calibrationDisplay && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                  独立模型资料展示：真实新闻、手机、变量、智库等请求由服务层源码常量构建；这里用于核对内容，不作为开关或编辑入口。
                </p>
              )}
            </>
          ) : (
            <>
              <input
                value={book.title}
                onChange={(event) => onUpdateBook({ title: event.target.value })}
                className="w-full bg-transparent font-serif text-xl font-semibold tracking-[0.25em] outline-none focus:bg-[rgba(var(--tj-accent-primary),0.05)]"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              />
              <input
                value={book.description}
                onChange={(event) => onUpdateBook({ description: event.target.value })}
                placeholder="描述或注释，可选"
                className="mt-1.5 w-full bg-transparent text-xs font-serif italic tracking-wider outline-none focus:bg-[rgba(var(--tj-accent-primary),0.05)]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}
              />
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {!builtin && (
            <>
              <span
                className="text-xs font-serif tracking-[0.2em]"
                style={{ color: book.enabled ? 'rgba(var(--tj-accent-primary), 0.92)' : 'rgba(var(--tj-text-secondary), 0.6)' }}
              >
                {book.enabled ? '启用' : '关闭'}
              </span>
              <ToggleSwitch checked={book.enabled} onChange={(enabled) => onUpdateBook({ enabled })} title="启用整本" />
              <button
                onClick={onNewEntry}
                className="ml-2 cursor-pointer px-3 py-1.5 text-xs font-serif tracking-[0.2em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)]"
                style={{
                  color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
                  background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.11), rgba(var(--tj-accent-primary), 0.02))',
                  clipPath: smallClip,
                }}
              >
                ＋ 新建条目
              </button>
              <button
                onClick={onDeleteBook}
                className="cursor-pointer px-3 py-1.5 text-xs font-serif tracking-wider transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-danger),0.5)]"
                style={{
                  color: 'rgb(var(--tj-danger))',
                  boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
                  clipPath: smallClip,
                }}
              >
                删除书
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EntryPane({
  book,
  entry,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
  onUpdateEntry,
  onDeleteEntry,
}: {
  book: 世界书;
  entry: 世界书条目;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
  onUpdateEntry: (partial: Partial<世界书条目>) => void;
  onDeleteEntry: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PaneHeader
        book={book}
        builtin={builtin}
        onUpdateBook={onUpdateBook}
        onDeleteBook={onDeleteBook}
        onNewEntry={onNewEntry}
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
        <EntryEditor
          entry={entry}
          builtin={builtin}
          calibrationDisplay={builtin && isCalibrationEntry(entry)}
          onChange={onUpdateEntry}
          onDelete={onDeleteEntry}
        />
      </div>
    </div>
  );
}

export function EmptyBookPane({
  book,
  builtin,
  onUpdateBook,
  onDeleteBook,
  onNewEntry,
}: {
  book: 世界书;
  builtin: boolean;
  onUpdateBook: (partial: Partial<世界书>) => void;
  onDeleteBook: () => void;
  onNewEntry: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PaneHeader
        book={book}
        builtin={builtin}
        onUpdateBook={onUpdateBook}
        onDeleteBook={onDeleteBook}
        onNewEntry={onNewEntry}
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6">
        <EmptyHint text={builtin ? '内置书暂无条目' : '本书暂无条目，点击右上角「＋ 新建条目」'} />
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  builtin,
  calibrationDisplay,
  onChange,
  onDelete,
}: {
  entry: 世界书条目;
  builtin: boolean;
  calibrationDisplay: boolean;
  onChange: (partial: Partial<世界书条目>) => void;
  onDelete: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-serif text-xs tracking-[0.35em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>
          {calibrationDisplay ? '独立模型展示条目' : builtin ? '内置条目' : '条目'}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{
              color: calibrationDisplay || entry.enabled
                ? 'rgba(var(--tj-accent-primary), 0.92)'
                : 'rgba(var(--tj-text-secondary), 0.6)',
            }}
          >
            {calibrationDisplay ? '展示' : entry.enabled ? '启用' : '关闭'}
          </span>
          <ToggleSwitch
            checked={calibrationDisplay || entry.enabled}
            disabled={calibrationDisplay}
            onChange={(enabled) => onChange({ enabled })}
            title={calibrationDisplay ? '独立模型展示条目不是真实请求开关' : '启用条目'}
          />
        </div>
      </div>

      {calibrationDisplay && (
        <div
          className="px-3 py-2 text-xs leading-relaxed"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.78)',
            background: 'rgba(var(--tj-accent-primary), 0.045)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: cardClip,
          }}
        >
          独立模型资料展示：真实请求不读取这里的 enabled 或编辑稿，而是由新闻、手机、变量、智库等服务层共享 prompt / worldbook 常量构建。实际发送内容请在“上下文”页核对。
        </div>
      )}

      <Field label="条目标题">
        <input
          value={entry.title}
          readOnly={calibrationDisplay}
          onChange={(event) => {
            if (calibrationDisplay) return;
            onChange({ title: event.target.value });
          }}
          placeholder="条目标题"
          className="kaituo-input w-full px-3 py-2 text-sm font-serif tracking-wider"
          style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="类型">
          <select
            value={entry.type}
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ type: event.target.value as 世界书条目类型 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          >
            {(Object.entries(ENTRY_TYPE_LABELS) as [世界书条目类型, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="注入模式">
          <select
            value={entry.injectMode}
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ injectMode: event.target.value as 世界书注入方式 })}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          >
            <option value="always">始终注入</option>
            <option value="keyword_match">关键词匹配</option>
          </select>
        </Field>
        <Field label="优先级">
          <input
            type="number"
            value={entry.priority}
            disabled={calibrationDisplay}
            onChange={(event) => onChange({ priority: Number(event.target.value) || 0 })}
            min={0}
            max={999}
            className="kaituo-input w-full px-2.5 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      </div>

      {entry.injectMode === 'keyword_match' && (
        <Field label="触发关键词（逗号分隔，主关键词 OR 命中即触发）">
          <input
            value={entry.keywords.join(', ')}
            readOnly={calibrationDisplay}
            onChange={(event) =>
              onChange({
                keywords: event.target.value
                  .split(/[,,]/)
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
            placeholder="关键词，逗号分隔"
            className="kaituo-input w-full px-3 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      )}

      {entry.injectMode === 'keyword_match' && (
        <Field label="次要关键词（逗号分隔，主命中后须全部 AND 命中才触发，可留空）">
          <input
            value={(entry.keySecondary ?? []).join(', ')}
            readOnly={calibrationDisplay}
            onChange={(event) =>
              onChange({
                keySecondary: event.target.value
                  .split(/[,,]/)
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
            placeholder="次要关键词，逗号分隔（可留空）"
            className="kaituo-input w-full px-3 py-2 text-xs"
            style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.74 : 1 }}
          />
        </Field>
      )}

      {!calibrationDisplay && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-xs font-serif tracking-[0.2em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.5)]"
            style={{
              color: 'rgba(var(--tj-accent-primary), 0.85)',
              background: 'rgba(var(--tj-accent-primary), 0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
              clipPath: cardClip,
            }}
          >
            <span>◆ 高级触发控制（Phase 7.1 / 7.2 / 7.3）</span>
            <span className="text-[10px] tracking-wider transition-transform duration-200" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
              {advancedOpen ? '收起 ▲' : '展开 ▼'}
            </span>
          </button>

          {advancedOpen && (
            <div
              className="space-y-3 px-3 py-3"
              style={{
                background: 'rgba(var(--tj-accent-primary), 0.025)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
                clipPath: cardClip,
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="大小写敏感">
                  <select
                    value={entry.caseSensitive ? '1' : '0'}
                    onChange={(event) => onChange({ caseSensitive: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认）</option>
                    <option value="1">是</option>
                  </select>
                </Field>
                <Field label="全词匹配">
                  <select
                    value={entry.matchWholeWords ? '1' : '0'}
                    onChange={(event) => onChange({ matchWholeWords: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，子串匹配）</option>
                    <option value="1">是（避免「星」命中「星穹铁道」）</option>
                  </select>
                </Field>
                <Field label="正则匹配">
                  <select
                    value={entry.useRegex ? '1' : '0'}
                    onChange={(event) => onChange({ useRegex: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认）</option>
                    <option value="1">是（关键词视为正则表达式）</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="触发概率 (0-100)">
                  <input
                    type="number"
                    value={entry.probability ?? 100}
                    onChange={(event) => onChange({ probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
                    min={0}
                    max={100}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="延迟 (N 条消息后)">
                  <input
                    type="number"
                    value={entry.delay ?? 0}
                    onChange={(event) => onChange({ delay: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="冷却 (N 条消息)">
                  <input
                    type="number"
                    value={entry.cooldown ?? 0}
                    onChange={(event) => onChange({ cooldown: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="扫描深度 (最近 N 条)">
                  <input
                    type="number"
                    value={entry.scanDepth ?? 50}
                    onChange={(event) => onChange({ scanDepth: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 概率 100=必触发，0=不触发；延迟/冷却按累计消息数计算；扫描深度 0=扫描全部历史（默认 50）。
                <br />· 次要关键词仅在主关键词命中后才会做 AND 检查；正则匹配时请确保表达式合法（非法会被忽略）。
              </p>

              {/* Phase 7.2：深度插入 + 分组召回 + 条目互斥 */}
              <div
                className="mt-4 border-t border-[rgba(var(--tj-accent-primary),0.15)] pt-3"
              >
                <div
                  className="mb-3 px-3 py-2 text-[11px] font-serif tracking-[0.2em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  ◆ Phase 7.2 · 深度插入 / 分组 / 互斥
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="深度插入">
                  <select
                    value={entry.injectAtDepth ? '1' : '0'}
                    onChange={(event) => onChange({ injectAtDepth: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，拼 systemPrompt）</option>
                    <option value="1">是（In-Chat 按 depth 插入）</option>
                  </select>
                </Field>
                <Field label="深度值 (In-Chat 位置)">
                  <input
                    type="number"
                    value={entry.depth ?? 0}
                    onChange={(event) => onChange({ depth: Math.max(0, Number(event.target.value) || 0) })}
                    min={0}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="分组 id">
                  <input
                    type="text"
                    value={entry.group ?? ''}
                    onChange={(event) => onChange({ group: event.target.value })}
                    placeholder="同组 id 触发 groupOverride 互斥"
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="组覆盖">
                  <select
                    value={entry.groupOverride ? '1' : '0'}
                    onChange={(event) => onChange({ groupOverride: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，同组全部注入）</option>
                    <option value="1">是（同组只取 groupWeight 最高）</option>
                  </select>
                </Field>
                <Field label="组权重">
                  <input
                    type="number"
                    value={entry.groupWeight ?? 0}
                    onChange={(event) => onChange({ groupWeight: Number(event.target.value) || 0 })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <Field label="禁用其他条目 (id 列表)">
                  <input
                    type="text"
                    value={(entry.disablesEntries ?? []).join(', ')}
                    onChange={(event) =>
                      onChange({
                        disablesEntries: event.target.value
                          .split(/[,,]/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="条目 id，逗号分隔"
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 深度插入：0=末条消息后 / 1=末条消息前 / N=末条消息前 N 条前。
                <br />· 分组覆盖：同组内若有 groupOverride=true 的条目，只取 groupWeight 最高的。
                <br />· 互斥：本条目触发后，列表中的条目会被禁用（按 id 匹配，支持 stwi_ / adapted_ / 自建 id）。
              </p>

              {/* Phase 7.3：递归触发 + 逻辑门 */}
              <div
                className="mt-4 border-t border-[rgba(var(--tj-accent-primary),0.15)] pt-3"
              >
                <div
                  className="mb-3 px-3 py-2 text-[11px] font-serif tracking-[0.2em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  ◆ Phase 7.3 · 递归触发 / 逻辑门
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="逻辑门 (主+次要关键词)">
                  <select
                    value={entry.logic ?? 'AND_ALL'}
                    onChange={(event) => onChange({ logic: event.target.value as 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="AND_ALL">AND_ALL · 主命中 + 所有次要命中（默认）</option>
                    <option value="AND_ANY">AND_ANY · 主命中 + 任一次要命中</option>
                    <option value="NOT_ANY">NOT_ANY · 主命中 + 至少一个次要不命中</option>
                    <option value="NOT_ALL">NOT_ALL · 主命中 + 所有次要都不命中</option>
                  </select>
                </Field>
                <Field label="递归触发">
                  <select
                    value={entry.recurse ? '1' : '0'}
                    onChange={(event) => onChange({ recurse: event.target.value === '1' })}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="0">否（默认，不递归）</option>
                    <option value="1">是（触发后用本条目 content 扫描其他条目）</option>
                  </select>
                </Field>
                <Field label="递归深度 (0-5)">
                  <input
                    type="number"
                    value={entry.recurseDepth ?? 1}
                    onChange={(event) => onChange({ recurseDepth: Math.min(Math.max(Number(event.target.value) || 0, 0), 5) })}
                    min={0}
                    max={5}
                    className="kaituo-input w-full px-2.5 py-2 text-xs"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                · 逻辑门：组合主关键词与次要关键词的命中条件（仅当次要关键词非空时生效）。
                <br />· 递归触发：本条目命中后，把本条目 content 加入扫描文本，重新扫描其他未触发的 keyword_match 条目。
                <br />· 递归深度限制 0-5（防止无限递归），0=不递归，1=递归一次（默认）。
              </p>
            </div>
          )}
        </div>
      )}

      <div
        className="px-3 py-2 text-xs font-serif tracking-wider"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.75)',
          background: 'rgba(var(--tj-accent-primary), 0.04)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: cardClip,
        }}
      >
        <span style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>◆ </span>
        {explainEntry(entry)}
      </div>

      <Field label="条目内容">
        <textarea
          value={entry.content}
          readOnly={calibrationDisplay}
          onChange={(event) => {
            if (calibrationDisplay) return;
            onChange({ content: event.target.value });
          }}
          rows={12}
          placeholder="条目内容"
          className="kaituo-input w-full resize-y px-3 py-2.5 text-sm leading-relaxed md:min-h-[280px]"
          style={{ clipPath: smallClip, opacity: calibrationDisplay ? 0.82 : 1 }}
        />
      </Field>

      {!builtin && (
        <button
          onClick={onDelete}
          className="cursor-pointer px-3 py-1.5 text-xs font-serif tracking-wider transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-danger),0.5)]"
          style={{
            color: 'rgb(var(--tj-danger))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.35)',
            clipPath: smallClip,
          }}
        >
          删除此条目
        </button>
      )}
    </div>
  );
}
