import type { 智库分类 } from '@/models/zhiku';
import { ZHIKU_CATEGORY_LABELS } from '@/models/zhiku';
import { Field, PerformanceTextarea } from './primitives';
import { categories, zhikuScopeOptions, cardClip, smallClip, type Draft } from './constants';

export function Composer({
  draft,
  setDraft,
  showComposer,
  setShowComposer,
  onCreate,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  showComposer: boolean;
  setShowComposer: React.Dispatch<React.SetStateAction<boolean>>;
  onCreate: () => void;
}) {
  return (
    <section className="min-w-0 px-3 py-4 md:px-4" style={{ background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.86), rgba(var(--tj-surface-strong),0.66))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)', clipPath: cardClip }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-serif text-[14px] tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>自制内容接口</div>
          <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>这里录入玩家自己整理的资料。不会污染内置内容，默认作为可编辑自制条目保存。</div>
        </div>
        <button onClick={() => setShowComposer((v) => !v)} className="px-3 py-2 text-xs font-mono tracking-[0.3em] transition-all hover:opacity-90" style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))', clipPath: smallClip }}>
          {showComposer ? 'CLOSE' : 'NEW'}
        </button>
      </div>

      {showComposer && (
        <div className="mt-4 grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <Field label="标题">
              <input value={draft.标题} onChange={(e) => setDraft({ ...draft, 标题: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="分类">
                <select value={draft.分类} onChange={(e) => setDraft({ ...draft, 分类: e.target.value as 智库分类 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {categories.map((cat) => <option key={cat} value={cat}>{ZHIKU_CATEGORY_LABELS[cat]}</option>)}
                </select>
              </Field>
              <Field label="重要度">
                <input type="number" min={1} max={5} value={draft.重要度} onChange={(e) => setDraft({ ...draft, 重要度: Number(e.target.value) || 3 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </div>
            <Field label="来源">
              <input value={draft.来源} onChange={(e) => setDraft({ ...draft, 来源: e.target.value })} placeholder="例如：BiliWiki / 自整理" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="关键词">
              <input value={draft.关键词} onChange={(e) => setDraft({ ...draft, 关键词: e.target.value })} placeholder="用逗号、顿号或空格分隔" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
            {draft.分类 === 'character' && (
              <section className="px-3 py-3" style={{ background: 'rgba(var(--tj-bg-primary), 0.2)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)', clipPath: smallClip }}>
                <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>人物结构</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Field label="资料类型">
                    <input value={draft.资料类型} onChange={(e) => setDraft({ ...draft, 资料类型: e.target.value })} placeholder="角色主体 / 角色形态" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                  </Field>
                  <Field label="关联角色">
                    <input value={draft.关联角色ID} onChange={(e) => setDraft({ ...draft, 关联角色ID: e.target.value })} placeholder="星 / 三月七 / 丹恒" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                  </Field>
                  <Field label="关联形态">
                    <input value={draft.关联形态ID} onChange={(e) => setDraft({ ...draft, 关联形态ID: e.target.value })} placeholder="基础形态 / 饮月 / 巡猎" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                  </Field>
                  <Field label="解锁状态">
                    <select value={draft.解锁状态} onChange={(e) => setDraft({ ...draft, 解锁状态: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                      <option value="">未标注</option>
                      <option value="默认可用">默认可用</option>
                      <option value="可预热">可预热</option>
                      <option value="未解锁">未解锁</option>
                      <option value="已解锁">已解锁</option>
                      <option value="手动启用">手动启用</option>
                      <option value="只读">只读</option>
                    </select>
                  </Field>
                  <Field label="剧透等级">
                    <select value={draft.剧透等级} onChange={(e) => setDraft({ ...draft, 剧透等级: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                      <option value="">未标注</option>
                      <option value="无">无</option>
                      <option value="轻微">轻微</option>
                      <option value="中等">中等</option>
                      <option value="重大">重大</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {zhikuScopeOptions.slice(0, 4).map((scope) => (
                    <label key={scope} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
                      <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{scope}</span>
                      <input type="checkbox" checked={draft.使用范围.includes(scope)} onChange={(e) => { const next = e.target.checked ? Array.from(new Set([...draft.使用范围, scope])) : draft.使用范围.filter((item) => item !== scope); setDraft({ ...draft, 使用范围: next }); }} className="accent-[rgb(var(--tj-accent-primary))]" />
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="mb-2 font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>人物表现结构</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PerformanceTextarea label="外貌锚点" value={draft.外貌锚点} editable onChange={(value) => setDraft({ ...draft, 外貌锚点: value })} />
                    <PerformanceTextarea label="性格锚点" value={draft.性格锚点} editable onChange={(value) => setDraft({ ...draft, 性格锚点: value })} />
                    <PerformanceTextarea label="说话方式" value={draft.说话方式} editable onChange={(value) => setDraft({ ...draft, 说话方式: value })} />
                    <PerformanceTextarea label="行为习惯" value={draft.行为习惯} editable onChange={(value) => setDraft({ ...draft, 行为习惯: value })} />
                    <PerformanceTextarea label="关系边界" value={draft.关系边界} editable onChange={(value) => setDraft({ ...draft, 关系边界: value })} />
                    <PerformanceTextarea label="禁止误写" value={draft.禁止误写} editable onChange={(value) => setDraft({ ...draft, 禁止误写: value })} />
                  </div>
                </div>
              </section>
            )}
            <label className="flex items-center justify-between gap-3 px-3 py-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)', clipPath: smallClip }}>
              <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>允许联动检索</span>
              <input type="checkbox" checked={draft.可用于联动} onChange={(e) => setDraft({ ...draft, 可用于联动: e.target.checked })} className="accent-[rgb(var(--tj-accent-primary))]" />
            </label>
          </div>
          <div className="space-y-3">
            <Field label="摘要">
              <textarea value={draft.摘要} onChange={(e) => setDraft({ ...draft, 摘要: e.target.value })} rows={4} placeholder="建议写成可检索的短摘要，留空会自动截原文前 220 字。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="角色故事摘要">
              <textarea value={draft.角色故事摘要} onChange={(e) => setDraft({ ...draft, 角色故事摘要: e.target.value })} rows={5} placeholder="只压缩角色故事层 / 历史故事层；语料、表现锚点和常驻事实仍从原文结构正常注入。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="原文">
              <textarea value={draft.原文} onChange={(e) => setDraft({ ...draft, 原文: e.target.value })} rows={7} placeholder="把原文或整理好的内容贴进来。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
            </Field>
            <button onClick={onCreate} disabled={!draft.标题.trim() && !draft.原文.trim()} className="w-full py-2.5 text-sm font-mono tracking-[0.34em] transition-all disabled:opacity-50" style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))', clipPath: smallClip }}>
              WRITE
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
