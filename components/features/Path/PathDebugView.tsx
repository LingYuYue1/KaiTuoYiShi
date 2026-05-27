// 变量管理器·命途分区
//
// 把分散在 旅人.命途列表 / 世界.待触发狭间 / 世界.进行中狭间 的命途数据
// 集中在一个面板里,方便手动调试整套命途+狭间流程,不必钻进通用 JSON 树。

import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 命途ID } from '@/models/journey';
import type { 命途阶段, 命途进度 } from '@/models/path';
import { PATH_STAGE_DEFS, 创建命途进度, STAGE_PROGRESS_MAX } from '@/models/path';
import { paths as PATH_DEFS, getPath } from '@/data/journeyPresets';
import {
  awakenPath,
  setPrimaryPath,
  应用狭间结果,
  踏入命途狭间,
  拒绝命途狭间,
} from '@/services/pathService';

interface Props {
  旅人: 角色数据结构;
  世界: 世界状态;
  set旅人: React.Dispatch<React.SetStateAction<角色数据结构>>;
  set世界: React.Dispatch<React.SetStateAction<世界状态>>;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

// 不让玩家在调试里新增「无命途」
const SELECTABLE_PATHS = PATH_DEFS.filter((p) => p.id !== 'none');

function 中文名(id: 命途ID): string {
  return getPath(id)?.name ?? id;
}

function 阶段名(stage: 命途阶段): string {
  return PATH_STAGE_DEFS[stage]?.name ?? `阶段${stage}`;
}

export function PathDebugView({ 旅人, 世界, set旅人, set世界 }: Props) {
  const 命途列表 = 旅人.命途列表 ?? [];
  const 已踏ID集合 = new Set(命途列表.map((p) => p.id));
  const 未踏命途 = SELECTABLE_PATHS.filter((p) => !已踏ID集合.has(p.id));

  // 更新指定 id 的命途条目;merge 字段
  const 更新命途 = (id: 命途ID, patch: Partial<命途进度>) => {
    set旅人((prev) => {
      const list = (prev.命途列表 ?? []).map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      return { ...prev, 命途列表: list };
    });
  };

  const 删除命途 = (id: 命途ID) => {
    if (!confirm(`确认删除命途「${中文名(id)}」?这会清空它的全部进度与阶段。`)) return;
    set旅人((prev) => {
      const list = (prev.命途列表 ?? []).filter((p) => p.id !== id);
      // 若删的是主命途,把 主命途 字段也清掉
      const nextPrimary = prev.主命途 === id ? '' : prev.主命途;
      return { ...prev, 命途列表: list, 主命途: nextPrimary };
    });
  };

  const 添加命途 = (id: 命途ID) => {
    set旅人((prev) => awakenPath(prev, id, { awakenedAt: '手动添加', notes: '变量管理调试' }).traveler);
  };

  const 切换主命途 = (id: 命途ID) => {
    set旅人((prev) => setPrimaryPath(prev, id));
  };

  // 狭间状态操作
  const 设置待触发 = (id: 命途ID | '') => {
    set世界((prev) => ({ ...prev, 待触发狭间: id || undefined }));
  };
  const 设置进行中 = (id: 命途ID | '') => {
    set世界((prev) => ({ ...prev, 进行中狭间: id || undefined }));
  };
  const 应用评判 = () => {
    const pid = 世界.进行中狭间;
    if (!pid) return;
    const res = 应用狭间结果(旅人, pid, '升阶');
    if (!res.ok) {
      alert(res.reason ?? '评判应用失败');
      return;
    }
    set旅人(() => res.traveler);
    set世界((prev) => ({ ...prev, 进行中狭间: undefined }));
  };

  // 一键调试:把目标命途调到 99 + 待升阶 = true(模拟自然达标,准备触发邀请)
  const 调到待升阶 = (id: 命途ID) => {
    更新命途(id, { 进度: STAGE_PROGRESS_MAX - 1, 待升阶: true });
  };

  return (
    <div className="space-y-3">
      {/* 狭间状态 */}
      <div
        className="p-3 space-y-3"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.4)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: cardClip,
        }}
      >
        <div
          className="font-serif text-xs tracking-[0.3em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          ◆ 狭间状态
        </div>

        {/* 待触发狭间 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)', minWidth: 80 }}>
            待触发狭间
          </span>
          <select
            value={世界.待触发狭间 ?? ''}
            onChange={(e) => 设置待触发(e.target.value as 命途ID | '')}
            className="kaituo-input px-2 py-1 text-xs font-mono"
            style={{ clipPath: smallClip, minWidth: 140 }}
          >
            <option value="">(无)</option>
            {命途列表.map((p) => (
              <option key={p.id} value={p.id}>
                {中文名(p.id)}{p.待升阶 ? ' · 待升阶' : ''}
              </option>
            ))}
          </select>
          {世界.待触发狭间 && (
            <>
              <button
                onClick={() => set世界((prev) => 踏入命途狭间(prev))}
                className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.92), rgba(212, 177, 90, 0.92))',
                  color: 'rgb(var(--tj-on-accent))',
                  clipPath: smallClip,
                }}
              >
                踏入(→ 进行中)
              </button>
              <button
                onClick={() => set世界((prev) => 拒绝命途狭间(prev))}
                className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  color: 'rgba(var(--tj-text-secondary), 0.85)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
                  clipPath: smallClip,
                }}
              >
                暂缓(清空)
              </button>
            </>
          )}
        </div>

        {/* 进行中狭间 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)', minWidth: 80 }}>
            进行中狭间
          </span>
          <select
            value={世界.进行中狭间 ?? ''}
            onChange={(e) => 设置进行中(e.target.value as 命途ID | '')}
            className="kaituo-input px-2 py-1 text-xs font-mono"
            style={{ clipPath: smallClip, minWidth: 140 }}
          >
            <option value="">(无)</option>
            {命途列表.map((p) => (
              <option key={p.id} value={p.id}>
                {中文名(p.id)}
              </option>
            ))}
          </select>
          {世界.进行中狭间 && (
            <>
              <button
                onClick={() => 应用评判()}
                className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background: 'rgba(160, 220, 160, 0.2)',
                  color: 'rgba(180, 230, 180, 0.95)',
                  boxShadow: 'inset 0 0 0 1px rgba(160, 220, 160, 0.45)',
                  clipPath: smallClip,
                }}
              >
                评判·升阶
              </button>
            </>
          )}
        </div>

        <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)', lineHeight: 1.5 }}>
          说明:正常流程是 AI 发邀请 → 写入待触发狭间 → 玩家点踏入卡片 → 进入进行中 → AI 出题 →
          AI 写评判 → 落地清空。这里的选择器仅用于本地手动测试。
        </div>
      </div>

      {/* 命途列表 */}
      <div
        className="p-3 space-y-2"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.4)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: cardClip,
        }}
      >
        <div
          className="font-serif text-xs tracking-[0.3em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          ◆ 命途列表(共 {命途列表.length} 条)
        </div>
        {命途列表.length === 0 ? (
          <div className="text-xs py-3 text-center" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
            旅人尚未踏上任何命途。请在下方「添加命途」处选一条踏上。
          </div>
        ) : (
          <div className="space-y-2">
            {命途列表.map((p) => {
              const def = getPath(p.id);
              return (
                <div
                  key={p.id}
                  className="p-2.5 space-y-2"
                  style={{
                    background: 'rgba(28, 24, 20, 0.5)',
                    boxShadow: `inset 0 0 0 1px ${p.待升阶 ? 'rgba(var(--tj-accent-primary), 0.55)' : 'rgba(var(--tj-accent-primary), 0.18)'}`,
                    clipPath: smallClip,
                  }}
                >
                  {/* 标题行:命途名 + 主命途 + 删除 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-serif text-sm font-bold"
                      style={{ color: 'rgba(var(--tj-accent-primary), 0.95)' }}
                    >
                      {def?.emblem ?? '○'} {中文名(p.id)}
                    </span>
                    <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                      ({p.id})
                    </span>
                    <label
                      className="flex items-center gap-1 text-[11px] cursor-pointer"
                      style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}
                    >
                      <input
                        type="radio"
                        name="primary-path"
                        checked={p.是否主命途}
                        onChange={() => 切换主命途(p.id)}
                      />
                      主命途
                    </label>
                    {p.待升阶 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5"
                        style={{
                          color: 'rgba(var(--tj-accent-primary), 0.95)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)',
                          clipPath: smallClip,
                        }}
                      >
                        待升阶
                      </span>
                    )}
                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={() => 调到待升阶(p.id)}
                        title="把进度调到 99 并标 待升阶 = true,模拟自然达标"
                        className="px-2 py-0.5 text-[11px] transition-all hover:opacity-90"
                        style={{
                          color: 'rgba(var(--tj-accent-primary), 0.95)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                          clipPath: smallClip,
                        }}
                      >
                        一键满进度
                      </button>
                      <button
                        onClick={() => 删除命途(p.id)}
                        className="px-2 py-0.5 text-[11px] transition-all hover:opacity-90"
                        style={{
                          color: 'rgba(255, 130, 130, 0.9)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 130, 130, 0.3)',
                          clipPath: smallClip,
                        }}
                      >
                        × 删除
                      </button>
                    </div>
                  </div>

                  {/* 字段行:阶段 / 进度 / 待升阶开关 / 今日累计 / 觉醒于 */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>阶段</span>
                      <select
                        value={p.阶段}
                        onChange={(e) => 更新命途(p.id, { 阶段: Number(e.target.value) as 命途阶段 })}
                        className="kaituo-input px-2 py-1 text-xs font-mono"
                        style={{ clipPath: smallClip }}
                      >
                        {PATH_STAGE_DEFS.map((s) => (
                          <option key={s.stage} value={s.stage}>
                            {s.stage} · {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                        进度 (0–{STAGE_PROGRESS_MAX})
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={STAGE_PROGRESS_MAX}
                        value={p.进度}
                        onChange={(e) => 更新命途(p.id, { 进度: Number(e.target.value) || 0 })}
                        className="kaituo-input px-2 py-1 text-xs font-mono"
                        style={{ clipPath: smallClip }}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>待升阶</span>
                      <button
                        onClick={() => 更新命途(p.id, { 待升阶: !p.待升阶 })}
                        className="px-2 py-1 text-xs font-mono text-left"
                        style={{
                          background: p.待升阶 ? 'rgba(var(--tj-accent-primary), 0.18)' : 'rgba(60, 55, 50, 0.4)',
                          color: p.待升阶 ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(var(--tj-text-secondary), 0.7)',
                          boxShadow: `inset 0 0 0 1px ${p.待升阶 ? 'rgba(var(--tj-accent-primary), 0.5)' : 'rgba(var(--tj-text-secondary), 0.3)'}`,
                          clipPath: smallClip,
                        }}
                      >
                        {p.待升阶 ? 'true' : 'false'}
                      </button>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                        今日累计 / 上限 10
                      </span>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min={0}
                          value={p.今日累计 ?? 0}
                          onChange={(e) => 更新命途(p.id, { 今日累计: Number(e.target.value) || 0 })}
                          className="kaituo-input flex-1 px-2 py-1 text-xs font-mono"
                          style={{ clipPath: smallClip }}
                        />
                        <button
                          onClick={() => 更新命途(p.id, { 今日累计: 0, 今日日期: '' })}
                          title="重置今日累计与日期"
                          className="px-2 text-[11px]"
                          style={{
                            color: 'rgba(var(--tj-text-secondary), 0.85)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
                            clipPath: smallClip,
                          }}
                        >
                          归零
                        </button>
                      </div>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>觉醒于</span>
                      <input
                        value={p.觉醒于}
                        onChange={(e) => 更新命途(p.id, { 觉醒于: e.target.value })}
                        className="kaituo-input px-2 py-1 text-xs font-mono"
                        style={{ clipPath: smallClip }}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>备注</span>
                      <input
                        value={p.备注}
                        onChange={(e) => 更新命途(p.id, { 备注: e.target.value })}
                        className="kaituo-input px-2 py-1 text-xs font-mono"
                        style={{ clipPath: smallClip }}
                      />
                    </label>
                  </div>

                  {/* 阶段说明 */}
                  <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(190, 178, 145, 0.75)' }}>
                    {阶段名(p.阶段)} · {PATH_STAGE_DEFS[p.阶段]?.title ?? ''} —
                    {PATH_STAGE_DEFS[p.阶段]?.blurb ?? ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 添加新命途 */}
        {未踏命途.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(var(--tj-accent-primary), 0.12)' }}>
            <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>踏上新命途</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as 命途ID;
                if (v) {
                  添加命途(v);
                  e.target.value = '';
                }
              }}
              className="kaituo-input px-2 py-1 text-xs font-mono"
              style={{ clipPath: smallClip, minWidth: 160 }}
            >
              <option value="">(选择命途)</option>
              {未踏命途.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emblem} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 字段速查 */}
      <div
        className="p-3 text-[11px] space-y-1"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.4)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
          clipPath: cardClip,
          color: 'rgba(190, 178, 145, 0.85)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>◆ 变量路径速查</div>
        <div>• 旅人.命途列表[].id / 阶段 / 进度 / 待升阶 / 今日累计 / 是否主命途</div>
        <div>• 旅人.主命途(兼容字段)</div>
        <div>• 世界.待触发狭间 (邀请中,等待玩家点踏入)</div>
        <div>• 世界.进行中狭间 (狭间问答中,AI 应出题/评判)</div>
        <div style={{ color: 'rgba(var(--tj-text-secondary), 0.7)', marginTop: 4 }}>
          AI 触发狭间:在正文中输出 &lt;触发狭间&gt;命途ID&lt;/触发狭间&gt;; AI 回应:
          &lt;狭间评判&gt;升阶&lt;/狭间评判&gt;
        </div>
      </div>
    </div>
  );
}
