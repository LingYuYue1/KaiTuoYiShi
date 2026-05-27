import type { 角色数据结构 } from '@/models/character';
import { Modal } from '@/components/ui/Modal';
import { getPath } from '@/data/journeyPresets';
import { PATH_STAGE_DEFS, 获取命途特质 } from '@/models/path';

interface Props {
  traveler: 角色数据结构;
  onClose: () => void;
}

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

export function TravelerProfileModal({ traveler, onClose }: Props) {
  const primaryPath = traveler.命途列表?.find((p) => p.是否主命途) ?? traveler.命途列表?.[0];
  const primaryPathDef = primaryPath ? getPath(primaryPath.id) : undefined;
  const primaryStageDef = primaryPath
    ? PATH_STAGE_DEFS.find((s) => s.stage === primaryPath.阶段)
    : undefined;
  const primaryTraits = primaryPath ? 获取命途特质(primaryPath.id) : [];
  const avatarUrl = traveler.头像?.trim() || traveler.图像档案?.头像?.trim();

  return (
    <Modal onClose={onClose} title="旅人档案">
      <div className="space-y-4">
        {/* 顶部：头像 + 姓名 */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden font-serif text-4xl font-bold"
            style={{
              background:
                avatarUrl
                  ? 'rgb(var(--tj-surface-strong))'
                  : 'radial-gradient(circle, rgba(var(--tj-bubble), 1) 0%, rgba(var(--tj-surface-strong), 1) 100%)',
              boxShadow:
                'inset 0 0 0 1.5px rgba(var(--tj-accent-primary), 0.75), 0 0 22px rgba(var(--tj-accent-primary), 0.18)',
              color: 'rgb(var(--tj-accent-primary))',
              clipPath:
                'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${traveler.姓名 || '旅人'} 头像`} className="h-full w-full object-cover" />
            ) : (
              traveler.姓名 ? traveler.姓名[0] : '?'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-serif text-2xl font-bold tracking-[0.2em]"
              style={{
                background: 'linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {traveler.姓名 || '无名开拓者'}
            </div>
            {traveler.别名 && (
              <div
                className="mt-1 font-serif text-sm italic tracking-[0.22em]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.95)' }}
              >
                「{traveler.别名}」
              </div>
            )}
          </div>
        </div>

        <div className="kaituo-divider" />

        {/* 基本信息 */}
        <Section title="基本信息">
          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="性别" value={traveler.性别} />
            <InfoCell label="身高" value={traveler.身高} />
            <InfoCell label="年龄" value={traveler.年龄 > 0 ? `${traveler.年龄} 岁` : ''} />
            <InfoCell label="生日" value={traveler.生日} />
            <InfoCell label="身份" value={traveler.身份} />
          </div>
        </Section>

        {/* 命途特质 */}
        {primaryPathDef && (
          <Section title="命途特质">
            <InfoCell
              label="主命途"
              value={`${primaryPathDef.name}（${primaryStageDef?.name ?? '—'}）`}
            />
            {primaryTraits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {primaryTraits.map((trait) => (
                  <TraitChip key={trait.名称} trait={trait} />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* 外观与心性 */}
        {(traveler.外貌 || traveler.性格 || traveler.背景) && (
          <Section title="外观与心性">
            <BlockCell label="外观" value={traveler.外貌} />
            <BlockCell label="性格" value={traveler.性格} />
            <BlockCell label="背景故事" value={traveler.背景} />
          </Section>
        )}

        {/* 能力与特长 */}
        {(traveler.能力?.length > 0 || traveler.专长知识?.length > 0) && (
          <Section title="能力 / 特长">
            {traveler.能力?.length > 0 && (
              <InfoCell label="能力" value={traveler.能力.join('、')} />
            )}
            {traveler.专长知识?.length > 0 && (
              <InfoCell label="知识" value={traveler.专长知识.join('、')} />
            )}
          </Section>
        )}

        {/* 底部提示 */}
        <div
          className="mt-2 px-3 py-2 text-[13px] font-serif tracking-wider"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.95)',
            background: 'linear-gradient(135deg, rgba(var(--tj-amber-soft),0.16), rgba(var(--tj-bubble),1))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
            clipPath: cardClip,
          }}
        >
          ✦ 档案为只读视图。如需修改字段，请前往「变量管理」中调整。
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-2 font-serif text-[13px] tracking-[0.35em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.95)' }}
      >
        ◆ {title.toUpperCase()}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--tj-bubble)), rgba(var(--tj-paper-deep),0.72))',
        boxShadow:
          'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22), inset 2px 0 0 rgba(var(--tj-accent-primary), 0.55)',
        clipPath: cardClip,
      }}
    >
      <span
        className="text-[12px] font-serif tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.96)' }}
      >
        {label}
      </span>
      <div
        className="mt-1 font-serif text-[15px] tracking-wider"
        style={{ color: 'rgba(var(--tj-text-primary), 0.96)' }}
      >
        {value}
      </div>
    </div>
  );
}

function BlockCell({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div
      className="px-3 py-2.5"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--tj-bubble)), rgba(var(--tj-paper-deep),0.72))',
        boxShadow:
          'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22), inset 2px 0 0 rgba(var(--tj-accent-primary), 0.55)',
        clipPath: cardClip,
      }}
    >
      <span
        className="text-[12px] font-serif tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}
      >
        {label}
      </span>
      <div
        className="mt-1 whitespace-pre-wrap font-serif text-[14px] leading-relaxed tracking-wider"
        style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}
      >
        {value}
      </div>
    </div>
  );
}

function TraitChip({ trait }: { trait: { 名称: string; 说明: string } }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.12), rgb(var(--tj-bubble)))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.28), inset 2px 0 0 rgba(var(--tj-accent-primary),0.42)',
        clipPath: cardClip,
      }}
      title={trait.说明}
    >
      <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {trait.名称}
      </div>
      <div className="mt-1 font-serif text-[12px] leading-relaxed tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
        {trait.说明}
      </div>
    </div>
  );
}
