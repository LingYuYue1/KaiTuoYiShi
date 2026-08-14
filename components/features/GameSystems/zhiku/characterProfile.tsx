import { useState, type ReactNode } from 'react';
import type {
  CharacterGateCardData,
  CharacterIdentityRow,
  CharacterProfileSectionKey,
  CharacterProfileViewModel,
} from '@/models/zhikuCharacter';
import { smallClip } from './constants';

export function CharacterProfileWorkspace({ vm }: { vm: CharacterProfileViewModel }) {
  const [activeSection, setActiveSection] = useState<CharacterProfileSectionKey>('identity');
  const visibleSection = vm.sectionTabs.some((item) => item.key === activeSection && item.available) ? activeSection : 'identity';

  return (
    <section className="mt-4 space-y-3">
      <div className="px-3 py-3 md:px-4" style={{ background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.1), rgba(var(--tj-bg-primary), 0.26), rgba(var(--tj-surface-strong), 0.52))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.44)', clipPath: smallClip }}>
        <div className="min-w-0">
          <div className="text-[11px] font-mono tracking-[0.3em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.86)' }}>角色档案工作台</div>
          <div className="mt-2 font-serif text-[20px] font-semibold tracking-[0.16em] md:text-[24px]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{vm.meta.角色名 || '角色档案'}</div>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>{vm.profileSummary}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {vm.keyTags.map((tag) => <CharacterBadge key={tag} label={tag} />)}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[9.5rem_minmax(0,1fr)]">
        <aside className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0" style={{ scrollbarWidth: 'thin' }}>
          {vm.sectionTabs.map((item) => (
            <button key={item.key} type="button" onClick={() => item.available && setActiveSection(item.key)} disabled={!item.available}
              className="shrink-0 px-3.5 py-2.5 text-center text-[12px] font-mono font-semibold tracking-[0.16em] transition-all lg:w-full lg:px-4 lg:py-3 lg:text-left lg:text-[13px]"
              style={{ color: visibleSection === item.key ? 'rgb(var(--tj-bg-primary))' : item.available ? 'rgba(var(--tj-btn-primary-start), 0.9)' : 'rgba(var(--tj-text-secondary), 0.42)', background: visibleSection === item.key ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.86), rgba(var(--tj-btn-primary-end), 0.82))' : 'rgba(var(--tj-bg-primary), 0.2)', boxShadow: visibleSection === item.key ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.72), 0 0 18px rgba(var(--tj-btn-primary-start), 0.12)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)', clipPath: smallClip, cursor: item.available ? 'pointer' : 'not-allowed' }}>
              {item.label}
            </button>
          ))}
        </aside>

        <div className="min-w-0 space-y-3">
          {visibleSection === 'identity' && (
            <CharacterWorkbenchSection title="基础身份层" eyebrow="防止模型自行补完未知身份" tone="plain">
              <div className="grid gap-2 md:grid-cols-2">
                {vm.identityRows.map((row) => <CharacterIdentityCell key={row.label} {...row} />)}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'health' && (
            <CharacterWorkbenchSection title="档案健康度" eyebrow="整理资料时优先补缺口" tone={vm.identityMissing.length ? 'gate' : 'plain'}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {vm.healthItems.map((item) => (
                  <CharacterMetric key={item.label} label={item.label} value={item.value}
                    attention={(item.label === '身份完整' && vm.identityMissing.length > 0) || (item.label === '关键词触发' && vm.keywordBuckets.triggerTerms.length === 0)} />
                ))}
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-mono tracking-[0.2em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.86)' }}>关键词触发</div>
                <div className="grid gap-2 xl:grid-cols-3">
                  <CharacterKeywordTile label="核心触发词" keywords={vm.keywordBuckets.triggerTerms} emptyText="未标注" attention={!vm.keywordBuckets.triggerTerms.length} />
                  <CharacterKeywordTile label="软结构标签" keywords={vm.keywordBuckets.softTags} emptyText="未标注" />
                  <CharacterKeywordTile label="补充关键词" keywords={vm.keywordBuckets.supplementalTerms} emptyText="未标注" />
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-mono tracking-[0.2em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.86)' }}>身份缺口</div>
                {vm.identityMissing.length ? (
                  <div className="flex flex-wrap gap-1.5">{vm.identityMissing.map((item) => <CharacterBadge key={item} label={item} tone="warn" />)}</div>
                ) : (
                  <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>基础身份层已覆盖当前 UI 检查项。</div>
                )}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'facts' && vm.factsBody && (
            <CharacterWorkbenchSection title="常驻事实" eyebrow="默认可用的角色底盘" tone="plain">
              <CharacterTextBlock body={vm.factsBody} compact />
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'story' && vm.storyBody && (
            <CharacterWorkbenchSection title="角色故事" eyebrow="解释动机，不得整段复读" tone="plain">
              <div className="mb-3 px-3 py-3" style={{ background: 'rgba(var(--tj-bg-secondary), 0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)', clipPath: smallClip }}>
                <div className="mb-1 text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>角色故事摘要 / 实际注入</div>
                <CharacterTextBlock body={vm.meta.角色名 ? '见「角色故事摘要」字段' : '暂无角色故事摘要'} compact />
                <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>下方原故事用于人工查看；主剧情注入优先使用角色故事摘要，避免长篇故事层吃掉上下文。</div>
              </div>
              {vm.storyGroups.length ? (
                <div className="grid gap-2 xl:grid-cols-2">{vm.storyGroups.map((group) => <CharacterSubsectionCard key={group.title} title={group.title} body={group.body} />)}</div>
              ) : (
                <CharacterTextBlock body={vm.storyBody} />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'anchors' && (
            <CharacterWorkbenchSection title="表现锚点" eyebrow="保证角色写得像" tone="plain">
              <div className="grid gap-2 xl:grid-cols-2">
                {vm.anchorRows.map((row) => <CharacterInfoTile key={row.label} label={row.label} value={row.value} danger={row.label === '禁止误写'} />)}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'corpus' && vm.corpusBody && (
            <CharacterWorkbenchSection title="语料参考" eyebrow="只学节奏，不得复读" tone="corpus">
              {vm.corpusGroups.length ? (
                <div className="grid gap-2 xl:grid-cols-2">{vm.corpusGroups.map((group) => <CharacterSubsectionCard key={group.title} title={group.title} body={group.body} />)}</div>
              ) : (
                <CharacterTextBlock body={vm.corpusBody} />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'ability' && vm.abilityBody && (
            <CharacterWorkbenchSection title="能力与职责" eyebrow="能力不能覆盖主体人格" tone="plain">
              <CharacterTextBlock body={vm.abilityBody} />
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'gates' && (
            <CharacterWorkbenchSection title="门禁中心" eyebrow="门禁内容完整可见，按剧情状态注入" tone="gate">
              {vm.gateCards.length ? (
                <div className="grid gap-2 xl:grid-cols-2">{vm.gateCards.map((card) => <CharacterGateCard key={card.title} card={card} />)}</div>
              ) : (
                <CharacterTextBlock body="暂无门禁资料" />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'injection' && (
            <CharacterWorkbenchSection title="本回合注入预览" eyebrow="可见 / 可用 / 可注入分离" tone="inject">
              <div className="grid gap-2 xl:grid-cols-3">
                <CharacterInjectionTile label="会注入" value={vm.injectedPreview} tone="ok" />
                <CharacterInjectionTile label="仅提醒" value={vm.lockedGateTitles.join('、') || '暂无被锁门禁'} tone="gate" />
                <CharacterInjectionTile label="不可臆造" value={vm.forbiddenIdentityText} tone="warn" />
              </div>
              {vm.injectionBody && <div className="mt-3"><CharacterTextBlock body={vm.injectionBody} /></div>}
            </CharacterWorkbenchSection>
          )}
        </div>
      </div>
    </section>
  );
}

function CharacterInfoTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: danger ? 'rgba(120, 45, 45, 0.16)' : 'rgba(var(--tj-bg-primary), 0.24)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255, 135, 120, 0.2)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color: danger ? 'rgba(255, 165, 150, 0.9)' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterWorkbenchSection({
  title,
  eyebrow,
  tone,
  children,
}: {
  title: string;
  eyebrow: string;
  tone: 'corpus' | 'gate' | 'plain' | 'inject';
  children: ReactNode;
}) {
  const accent =
    tone === 'gate'
      ? 'rgba(255, 178, 112, 0.9)'
      : tone === 'inject'
        ? 'rgba(150, 220, 180, 0.92)'
      : tone === 'corpus'
        ? 'rgba(var(--tj-btn-primary-start), 0.95)'
        : 'rgba(var(--tj-text-secondary), 0.82)';
  const background =
    tone === 'gate'
      ? 'linear-gradient(135deg, rgba(128, 70, 34, 0.2), rgba(var(--tj-bg-primary), 0.2))'
      : tone === 'inject'
        ? 'linear-gradient(135deg, rgba(40, 96, 72, 0.18), rgba(var(--tj-bg-primary), 0.2))'
      : tone === 'corpus'
        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.1), rgba(var(--tj-bg-primary), 0.2))'
        : 'rgba(var(--tj-bg-primary), 0.18)';

  return (
    <section
      className="px-3 py-3"
      style={{
        background,
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-serif text-[15px] font-semibold tracking-[0.16em]" style={{ color: accent }}>
          {title}
        </div>
        <div className="text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          {eyebrow}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CharacterTextBlock({ body, compact = false }: { body: string; compact?: boolean }) {
  return (
    <div className={`whitespace-pre-wrap text-xs leading-relaxed ${compact ? 'max-h-44 overflow-y-auto pr-1' : ''}`} style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
      {body.trim() || '暂无内容'}
    </div>
  );
}

function CharacterMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return (
    <div
      className="min-w-0 px-3 py-2"
      style={{
        background: attention ? 'rgba(128, 70, 34, 0.18)' : 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: attention ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.22)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="truncate text-[10px] font-mono tracking-[0.16em]" style={{ color: attention ? 'rgba(255, 190, 120, 0.88)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterKeywordTile({
  label,
  keywords,
  emptyText,
  attention = false,
}: {
  label: string;
  keywords: string[];
  emptyText: string;
  attention?: boolean;
}) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: attention ? 'rgba(128, 70, 34, 0.14)' : 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: attention ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.22)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.16em]" style={{ color: attention ? 'rgba(255, 190, 120, 0.88)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      {keywords.length ? (
        <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {keywords.map((keyword) => (
            <CharacterBadge key={`${label}:${keyword}`} label={keyword} tone={attention ? 'warn' : 'plain'} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}

function CharacterBadge({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'warn' | 'ok' }) {
  const color = tone === 'warn' ? 'rgba(255, 178, 112, 0.9)' : tone === 'ok' ? 'rgba(155, 225, 175, 0.92)' : 'rgba(var(--tj-btn-primary-start), 0.92)';
  return (
    <span
      className="px-2 py-0.5 text-[10px] font-mono tracking-[0.14em]"
      style={{
        color,
        background: 'rgba(var(--tj-btn-primary-start), 0.06)',
        boxShadow: `inset 0 0 0 1px ${tone === 'warn' ? 'rgba(255, 178, 112, 0.18)' : 'rgba(var(--tj-btn-primary-start), 0.14)'}`,
        clipPath: smallClip,
      }}
    >
      {label}
    </span>
  );
}

function CharacterIdentityCell({ label, value, missing, wide }: CharacterIdentityRow) {
  return (
    <div
      className={`min-w-0 px-3 py-3 ${wide ? 'md:col-span-2' : ''}`}
      style={{
        background: missing ? 'rgba(128, 70, 34, 0.13)' : 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: missing ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.2)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color: missing ? 'rgba(255, 190, 120, 0.9)' : 'rgba(var(--tj-btn-primary-start), 0.84)' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: missing ? 'rgba(var(--tj-text-secondary), 0.72)' : 'rgba(var(--tj-text-primary), 0.88)' }}>
        {value ?? '未标注'}
      </div>
    </div>
  );
}

function CharacterSubsectionCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[13px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
        {title}
      </div>
      <CharacterTextBlock body={body} />
    </div>
  );
}

function CharacterGateCard({ card }: { card: CharacterGateCardData }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: card.locked ? 'linear-gradient(135deg, rgba(128, 70, 34, 0.18), rgba(var(--tj-bg-primary), 0.2))' : 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: card.locked ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.24)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 font-serif text-[14px] font-semibold tracking-[0.12em]" style={{ color: card.locked ? 'rgba(255, 190, 120, 0.94)' : 'rgba(var(--tj-text-primary), 0.9)' }}>
          {card.title}
        </div>
        <CharacterBadge label={card.status} tone={card.locked ? 'warn' : 'ok'} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CharacterGateRow label="类型" value={card.type || '未标注'} />
        <CharacterGateRow label="剧透" value={card.spoiler || '未标注'} />
        <CharacterGateRow label="当前注入" value={card.injection} />
        <CharacterGateRow label="标准解锁" value={card.condition || '未标注'} />
      </div>
      {card.defaultAvailable && (
        <div className="mt-2">
          <CharacterGateRow label="默认可用" value={card.defaultAvailable} block />
        </div>
      )}
      {card.defaultHandling && (
        <div className="mt-2">
          <CharacterGateRow label="默认处理" value={card.defaultHandling} block />
        </div>
      )}
      {card.usage && (
        <div className="mt-2">
          <CharacterGateRow label="使用方式" value={card.usage} block />
        </div>
      )}
      {card.activation && (
        <div className="mt-2">
          <CharacterGateRow label="启用方式" value={card.activation} block />
        </div>
      )}
      {card.manifestation && (
        <div className="mt-2">
          <CharacterGateRow label="显现机制" value={card.manifestation} block />
        </div>
      )}
      {card.expansion && (
        <div className="mt-2">
          <CharacterGateRow label="展开条件 / 使用" value={card.expansion} block />
        </div>
      )}
      {card.triggeredInjection && (
        <div className="mt-2">
          <CharacterGateRow label="触发后注入" value={card.triggeredInjection} block />
        </div>
      )}
      {card.knowledgeBoundary && (
        <div className="mt-2">
          <CharacterGateRow label="知情边界" value={card.knowledgeBoundary} block />
        </div>
      )}
      {card.rollbackRule && (
        <div className="mt-2">
          <CharacterGateRow label="回落规则" value={card.rollbackRule} block />
        </div>
      )}
      {card.appearanceRule && (
        <div className="mt-2">
          <CharacterGateRow label="外貌规则" value={card.appearanceRule} block />
        </div>
      )}
      {card.personalityRule && (
        <div className="mt-2">
          <CharacterGateRow label="人格规则" value={card.personalityRule} block />
        </div>
      )}
      {card.inheritance && (
        <div className="mt-2">
          <CharacterGateRow label="继承规则" value={card.inheritance} block />
        </div>
      )}
      {card.memoryRule && (
        <div className="mt-2">
          <CharacterGateRow label="记忆规则" value={card.memoryRule} block />
        </div>
      )}
      {card.earlyBoundary && (
        <div className="mt-2">
          <CharacterGateRow label="提前启用边界" value={card.earlyBoundary} block />
        </div>
      )}
      <div className="mt-2">
        <CharacterGateRow label="允许预热 / 门禁" value={card.preview || card.gate || '未标注'} block />
      </div>
      <div className="mt-2">
        <CharacterGateRow label="禁止行为" value={card.forbidden || '未标注'} block danger />
      </div>
    </div>
  );
}

function CharacterGateRow({ label, value, block = false, danger = false }: { label: string; value: string; block?: boolean; danger?: boolean }) {
  return (
    <div
      className={`min-w-0 px-2.5 py-2 ${block ? '' : 'sm:min-h-[4.4rem]'}`}
      style={{
        background: danger ? 'rgba(120, 45, 45, 0.12)' : 'rgba(var(--tj-bg-secondary), 0.28)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255, 135, 120, 0.16)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.24)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.16em]" style={{ color: danger ? 'rgba(255, 165, 150, 0.86)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterInjectionTile({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'gate' | 'warn' }) {
  const color = tone === 'ok' ? 'rgba(155, 225, 175, 0.92)' : tone === 'gate' ? 'rgba(255, 190, 120, 0.9)' : 'rgba(255, 165, 150, 0.9)';
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: `inset 0 0 0 1px ${tone === 'warn' ? 'rgba(255, 135, 120, 0.18)' : 'rgba(var(--tj-border), 0.34)'}`,
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
        {value || '暂无'}
      </div>
    </div>
  );
}
