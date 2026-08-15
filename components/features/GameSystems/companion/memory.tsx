import type { NPC记录 } from '@/models/npc';
import { buildNpcMemoryLedgerView, 提取NPC同行记忆文本列表 } from '@/models/npc';
import { accentColor, bodyColor, faintColor, mutedColor, smallClip } from './constants';
import { Chip, DetailBlock, EmptyText, Paragraph } from './primitives';

export function MemoryPanel({ npc, devMode = false }: { npc: NPC记录; devMode?: boolean }) {
  const ledger = buildNpcMemoryLedgerView(npc, 8);
  const memories = 提取NPC同行记忆文本列表(npc).filter((item) => !item.startsWith('[压缩]'));
  const protectedCount =
    ledger.必须记得.length +
    ledger.禁止遗忘.length +
    ledger.未完成事项.length +
    ledger.未解决冲突.length;
  return (
    <div className="grid gap-4">
      {devMode && (
        <section className="grid gap-4 2xl:grid-cols-[0.86fr_1.14fr]">
          <DetailBlock title="账本状态">
            <div className="grid gap-2 sm:grid-cols-2">
              <LedgerFact label="关系阶段" value={ledger.当前关系阶段} />
              <LedgerFact label="好感度" value={`${ledger.好感度 > 0 ? '+' : ''}${ledger.好感度}`} />
              <LedgerFact label="最近回合" value={`第 ${ledger.最近回合} 回合`} />
              <LedgerFact label="称呼" value={ledger.对玩家称呼 || '未固定'} />
            </div>
            <div className="mt-3 space-y-2">
              <Paragraph text={ledger.最近互动} placeholder="尚无最近互动" />
              <Paragraph text={ledger.对玩家长期印象} placeholder="尚未形成长期印象" italic />
            </div>
          </DetailBlock>

          <DetailBlock title="必须承接">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-serif text-[12px] tracking-[0.12em]" style={{ color: mutedColor }}>
                长期保护事项 {protectedCount} 条
              </div>
              <Chip tone={protectedCount ? 'gold' : 'silver'}>{protectedCount ? '需要承接' : '暂无压力'}</Chip>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <LedgerListCard title="必须记得" items={ledger.必须记得} />
              <LedgerListCard title="禁止遗忘" items={ledger.禁止遗忘} tone="danger" />
              <LedgerListCard title="未完成事项" items={ledger.未完成事项} />
              <LedgerListCard title="未解决冲突" items={ledger.未解决冲突} tone="danger" />
            </div>
          </DetailBlock>
        </section>
      )}

      <section className={devMode ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
        {devMode && (
          <DetailBlock title="共同经历">
            <LedgerListCard title="共同经历" items={ledger.共同经历} />
          </DetailBlock>
        )}

        <DetailBlock title="总结记忆">
          {ledger.总结记忆.length ? (
            <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {ledger.总结记忆.slice(-8).map((summary, index) => (
                <li
                  key={`${summary.id}_${index}`}
                  className="px-3 py-2 font-serif text-[13px] leading-relaxed tracking-[0.06em]"
                  style={{
                    color: bodyColor,
                    background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.56), rgba(var(--tj-surface-strong),0.66))',
                    boxShadow: 'inset 2px 0 0 rgba(var(--tj-btn-primary-start), 0.54), inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="mb-1 text-[11px] tracking-[0.18em]" style={{ color: accentColor }}>
                    {summary.回合范围 || '长期摘要'}{summary.条数 ? ` · ${summary.条数} 条` : ''}
                  </div>
                  {summary.摘要}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText text="尚未形成压缩后的长期关系记忆" />
          )}
        </DetailBlock>
      </section>

      <DetailBlock title={devMode ? '原始同行记忆' : '同行记忆'}>
        {memories.length ? (
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {memories.slice(-12).map((memory, index) => (
              <li
                key={`${index}-${memory}`}
                className="px-3 py-2 font-serif text-[13px] leading-relaxed tracking-[0.06em]"
                style={{
                  color: bodyColor,
                  background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
                  boxShadow: 'inset 2px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.62), inset 0 0 0 1px rgba(var(--tj-border), 0.56)',
                  clipPath: smallClip,
                }}
              >
                {memory}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyText text="尚未记录共同经历的关键时刻" />
        )}
      </DetailBlock>
    </div>
  );
}

function LedgerListCard({ title, items, tone = 'normal' }: { title: string; items: string[]; tone?: 'normal' | 'danger' }) {
  const visibleItems = items.length ? items : ['暂无'];
  const toneColor = tone === 'danger' ? 'rgba(var(--tj-ui-nsfw),0.92)' : accentColor;
  const railColor = tone === 'danger'
    ? 'rgba(var(--tj-ui-nsfw),0.45)'
    : 'rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.52)';

  return (
    <div
      className="flex h-[214px] min-w-0 flex-col px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.58), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: `inset 2px 0 0 ${railColor}, inset 0 0 0 1px rgba(var(--tj-border), 0.46)`,
        clipPath: smallClip,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-serif text-[11px] tracking-[0.2em]" style={{ color: toneColor }}>
          {title}
        </div>
        <div
          className="shrink-0 px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            color: toneColor,
            background: 'rgba(var(--tj-bg-primary), 0.42)',
            boxShadow: `inset 0 0 0 1px ${railColor}`,
          }}
        >
          {items.length}
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <ul className="space-y-1.5">
          {visibleItems.map((item, index) => {
            const empty = !items.length;
            return (
              <li
                key={`${title}_${item}_${index}`}
                className={`min-w-0 break-words font-serif text-[12.5px] leading-relaxed tracking-[0.04em] ${empty ? 'italic' : ''}`}
                style={{ color: empty ? faintColor : bodyColor }}
              >
                <span style={{ color: empty ? faintColor : railColor }}>- </span>
                {item}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function LedgerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-serif text-[11px] tracking-[0.18em]" style={{ color: accentColor }}>{label}</div>
      <div className="mt-1 truncate font-serif text-[13px] tracking-[0.08em]" style={{ color: bodyColor }}>{value}</div>
    </div>
  );
}
