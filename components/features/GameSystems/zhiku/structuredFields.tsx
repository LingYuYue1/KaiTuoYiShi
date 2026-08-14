import type { 智库条目 } from '@/models/zhiku';
import { Field, StructuredFlag, PerformanceTextarea } from './primitives';
import { smallClip, zhikuScopeOptions } from './constants';

export function StructuredCharacterFields({
  entry,
  editable,
  onUpdate,
}: {
  entry: 智库条目;
  editable: boolean;
  onUpdate: (patch: Partial<智库条目>) => void;
}) {
  const displayedUnlock = entry.运行时解锁状态 ?? entry.解锁状态;
  const updateUnlock = (status: string) => {
    onUpdate(entry.builtin ? { 运行时解锁状态: status } : { 解锁状态: status });
  };
  const updateScope = (scope: string, checked: boolean) => {
    const current = entry.使用范围 ?? [];
    const next = checked
      ? Array.from(new Set([...current, scope]))
      : current.filter((item) => item !== scope);
    onUpdate({ 使用范围: next });
  };

  return (
    <section
      className="mt-3 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        结构字段
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="资料类型">
          <input value={entry.资料类型 ?? ''} onChange={(e) => onUpdate({ 资料类型: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} placeholder="角色主体 / 角色形态；关键词可用：角色:星、资料类型:角色主体、形态:存护、解锁:未解锁、剧透:重大、范围:主剧情" />
        </Field>
        <Field label="关联角色">
          <input value={entry.关联角色ID ?? ''} onChange={(e) => onUpdate({ 关联角色ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="关联形态">
          <input value={entry.关联形态ID ?? ''} onChange={(e) => onUpdate({ 关联形态ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="解锁状态">
          <select value={displayedUnlock ?? ''} onChange={(e) => updateUnlock(e.target.value)} disabled={!editable && !entry.builtin} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
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
          <select value={entry.剧透等级 ?? ''} onChange={(e) => onUpdate({ 剧透等级: e.target.value })} disabled={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="">未标注</option>
            <option value="无">无</option>
            <option value="轻微">轻微</option>
            <option value="中等">中等</option>
            <option value="重大">重大</option>
          </select>
        </Field>
        <Field label="首次可用剧情段">
          <input value={entry.首次可用剧情段 ?? ''} onChange={(e) => onUpdate({ 首次可用剧情段: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="关联剧情分段ID">
          <input value={entry.关联剧情分段ID ?? ''} onChange={(e) => onUpdate({ 关联剧情分段ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="解锁条件">
          <input value={entry.解锁条件 ?? ''} onChange={(e) => onUpdate({ 解锁条件: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          使用范围
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {zhikuScopeOptions.map((scope) => (
            <label key={scope} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
              <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{scope}</span>
              <input type="checkbox" checked={(entry.使用范围 ?? []).includes(scope)} onChange={(e) => updateScope(scope, e.target.checked)} disabled={!editable} className="accent-[rgb(var(--tj-accent-primary))]" />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          手动门禁
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {['未解锁', '可预热', '已解锁', '手动启用', '默认可用', '只读'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => updateUnlock(status)}
              disabled={!editable && !entry.builtin}
              className="px-3 py-2 text-xs font-mono tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                color: displayedUnlock === status ? 'rgb(var(--tj-on-accent))' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))',
                background: displayedUnlock === status ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(var(--tj-btn-primary-start), 0.05)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                clipPath: smallClip,
              }}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          自制条目会修改资料字段；内置条目只写入当前本地智库的运行时解锁覆盖，不改内置原文。
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StructuredFlag label="主剧情注入" checked={entry.可否主剧情注入} editable={editable} onChange={(checked) => onUpdate({ 可否主剧情注入: checked })} />
        <StructuredFlag label="手机使用" checked={entry.可否手机使用} editable={editable} onChange={(checked) => onUpdate({ 可否手机使用: checked })} />
        <StructuredFlag label="新闻使用" checked={entry.可否新闻使用} editable={editable} onChange={(checked) => onUpdate({ 可否新闻使用: checked })} />
        <StructuredFlag label="变量参考" checked={entry.可否变量参考} editable={editable} onChange={(checked) => onUpdate({ 可否变量参考: checked })} />
      </div>

      <div className="mt-4">
        <PerformanceTextarea label="角色故事摘要" value={entry.角色故事摘要 ?? ''} editable={editable} onChange={(value) => onUpdate({ 角色故事摘要: value })} />
        <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          仅替代角色故事层 / 历史故事层注入；语料层、表现锚点层和常驻事实层仍按原文正常读取。
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          人物表现结构
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <PerformanceTextarea label="外貌锚点" value={entry.外貌锚点 ?? ''} editable={editable} onChange={(value) => onUpdate({ 外貌锚点: value })} />
          <PerformanceTextarea label="性格锚点" value={entry.性格锚点 ?? ''} editable={editable} onChange={(value) => onUpdate({ 性格锚点: value })} />
          <PerformanceTextarea label="说话方式" value={entry.说话方式 ?? ''} editable={editable} onChange={(value) => onUpdate({ 说话方式: value })} />
          <PerformanceTextarea label="行为习惯" value={entry.行为习惯 ?? ''} editable={editable} onChange={(value) => onUpdate({ 行为习惯: value })} />
          <PerformanceTextarea label="关系边界" value={entry.关系边界 ?? ''} editable={editable} onChange={(value) => onUpdate({ 关系边界: value })} />
          <PerformanceTextarea label="禁止误写" value={entry.禁止误写 ?? ''} editable={editable} onChange={(value) => onUpdate({ 禁止误写: value })} />
        </div>
      </div>
    </section>
  );
}
