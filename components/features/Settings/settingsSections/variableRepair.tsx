import { useState } from 'react';
import { Wrench } from 'lucide-react';
import type {
  SettingsSectionContext,
  SettingsSectionDefinition,
} from './types';
import type { 变量修复草稿项 } from '@/models/variableRepairBatch';
import { 汇总变量修复草稿 } from '@/models/variableRepairBatch';
import type { 修复项分类 } from '@/models/variableRepair';
import { cardClip, smallClip } from '@/components/features/Chat/turnStyles';
import {
  分类标签,
  分类顺序,
  修复项行,
} from '@/components/features/Variable/variableRepairPrimitives';

const 项状态文案: Record<变量修复草稿项['status'], string> = {
  pending: '待扫描',
  scanning: '扫描中',
  ready: '计划就绪',
  failed: '扫描失败',
};

function SectionButton({
  label,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 font-serif text-xs tracking-[0.2em] transition-all hover:opacity-90 disabled:opacity-35"
      style={
        primary
          ? {
              color: 'rgb(var(--tj-on-accent))',
              background:
                'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
              clipPath: smallClip,
            }
          : {
              color: 'rgba(var(--tj-text-primary), 0.9)',
              background: 'rgba(var(--tj-btn-primary-start), 0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.25)',
              clipPath: smallClip,
            }
      }
    >
      {label}
    </button>
  );
}

function 摘要数据行({ 摘要 }: {
  摘要: { total: number; pending: number; ready: number; failed: number; 可提交项: number };
}) {
  const entries: Array<[string, number]> = [
    ['回合', 摘要.total],
    ['待扫描', 摘要.pending],
    ['就绪', 摘要.ready],
    ['失败', 摘要.failed],
    ['可提交修复项', 摘要.可提交项],
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}>
      {entries.map(([label, value]) => (
        <span key={label}>
          {label}：<span style={{ color: 'rgba(var(--tj-text-primary), 0.95)' }}>{value}</span>
        </span>
      ))}
    </div>
  );
}

/** 展开的计划项渲染：safe 预勾选只读、confirm 可勾选、其余分类带原因只展示。 */
function 回合卡片({
  项,
  展开,
  on展开,
  勾选,
  on勾选,
}: {
  项: 变量修复草稿项;
  展开: boolean;
  on展开: () => void;
  勾选: string[];
  on勾选: (id: string) => void;
}) {
  const 计划 = 项.计划;
  const 分类计数 = new Map<修复项分类, number>();
  for (const item of 计划?.items ?? []) {
    分类计数.set(item.category, (分类计数.get(item.category) ?? 0) + 1);
  }
  const 计数文本 = 分类顺序
    .filter((category) => (分类计数.get(category) ?? 0) > 0)
    .map((category) => `${分类标签[category]} ${分类计数.get(category)}`)
    .join(' · ');

  return (
    <div
      className="px-3 py-2"
      style={{ background: 'rgba(var(--tj-bg-secondary), 0.5)', clipPath: smallClip }}
    >
      <button
        type="button"
        onClick={on展开}
        aria-expanded={展开}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="font-serif text-xs" style={{ color: 'rgba(var(--tj-text-primary), 0.95)' }}>
          第 {项.turn} 回合
        </span>
        <span className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
          {项状态文案[项.status]}
        </span>
        {计数文本 !== '' && (
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
            {计数文本}
          </span>
        )}
        <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
          {展开 ? '收起 ▲' : '展开 ▼'}
        </span>
      </button>

      {项.错误 && (
        <div className="mt-1 break-all text-[11px]" style={{ color: 'rgba(var(--tj-danger), 0.95)' }}>
          ⚠ {项.错误}
        </div>
      )}

      {展开 && 计划 && (
        <div className="mt-2 space-y-1.5">
          {计划.items.map((item) => (
            <修复项行
              key={item.id}
              item={item}
              category={item.category}
              checked={item.category === 'safe' ? true : 勾选.includes(item.id)}
              onToggle={item.category === 'confirm' ? () => on勾选(item.id) : undefined}
            />
          ))}
        </div>
      )}
      {展开 && !计划 && (
        <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
          {项.status === 'failed' ? '该回合没有可用计划。' : '尚未生成计划。'}
        </div>
      )}
    </div>
  );
}

function 提示横幅({ 文案, 展示为状态 }: { 文案: string; 展示为状态: boolean }) {
  return (
    <div
      role={展示为状态 ? 'status' : 'alert'}
      className="px-3 py-2 text-xs"
      style={{
        background: 'rgba(var(--tj-danger), 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.35)',
        clipPath: smallClip,
        color: 'rgba(var(--tj-text-primary), 0.9)',
      }}
    >
      {文案}
    </div>
  );
}

function VariableRepairSection({ 变量修复中心 }: SettingsSectionContext) {
  const [勾选表, set勾选表] = useState<Record<string, string[]>>({});
  const [展开表, set展开表] = useState<Record<string, boolean>>({});
  // 重新扫描会产生新草稿：旧勾选/展开键按 targetMessageId 复用会残留，须随草稿身份重置。
  const 草稿身份 = 变量修复中心?.草稿?.createdAt ?? null;
  const [已同步草稿, set已同步草稿] = useState(草稿身份);
  if (已同步草稿 !== 草稿身份) {
    set已同步草稿(草稿身份);
    set勾选表({});
    set展开表({});
  }

  if (!变量修复中心) {
    return <提示横幅 文案="⚠ 变量修复中心动作未注入（App 未传递 门面），本页不可用。" 展示为状态={false} />;
  }

  const 中心 = 变量修复中心;
  const 草稿 = 中心.草稿;
  const 摘要 = 草稿 ? 汇总变量修复草稿(草稿) : null;

  return (
    <div className="space-y-3">
      {中心.诊断 && <提示横幅 文案={中心.诊断} 展示为状态={false} />}

      <div className="px-4 py-3" style={{ background: 'rgba(var(--tj-bg-secondary), 0.6)', clipPath: cardClip }}>
        {摘要 ? (
          <>
            <摘要数据行 摘要={摘要} />
            <div
              role="progressbar"
              aria-label="变量修复扫描进度"
              aria-valuenow={摘要.ready + 摘要.failed}
              aria-valuemin={0}
              aria-valuemax={Math.max(摘要.total, 1)}
              className="mt-2 h-1.5 w-full"
              style={{ background: 'rgba(var(--tj-border), 0.5)' }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.round(((摘要.ready + 摘要.failed) / Math.max(摘要.total, 1)) * 100)}%`,
                  background:
                    'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.9), rgba(var(--tj-btn-primary-end), 0.9))',
                }}
              />
            </div>
            {草稿?.state === 'completed' && (
              <p role="status" className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.9)' }}>
                ✓ 批量修复已全部提交。
              </p>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>
            扫描历史助手回合，为每个回合生成变量修复计划；扫描进度可暂停续跑，提交复用既有的变量修复事务。
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <SectionButton
          label={中心.扫描中 ? '扫描中…' : '开始扫描'}
          primary={!中心.扫描中 && !中心.提交中 && (!草稿 || 草稿.state === 'completed' || 草稿.state === 'cancelled')}
          onClick={中心.开始扫描}
          disabled={中心.扫描中 || 中心.提交中}
        />
        <SectionButton label="暂停" onClick={中心.暂停} disabled={!中心.扫描中} />
        <SectionButton
          label="继续"
          onClick={中心.继续}
          disabled={中心.扫描中 || 中心.提交中 || 草稿?.state !== 'paused'}
        />
        <SectionButton label="取消" onClick={中心.取消} disabled={!中心.扫描中} />
        <SectionButton
          label={中心.提交中 ? '正在提交…' : '提交选中'}
          primary={中心.提交中}
          onClick={() => void 中心.提交选择(勾选表)}
          disabled={中心.扫描中 || 中心.提交中 || (摘要?.可提交项 ?? 0) === 0 || 草稿?.state === 'completed'}
        />
        <SectionButton label="清除" onClick={中心.清除} disabled={中心.扫描中 || 中心.提交中} />
      </div>

      {草稿 && 草稿.项.length > 0 && (
        <div className="space-y-2">
          {草稿.项.map((项) => (
            <回合卡片
              key={项.targetMessageId}
              项={项}
              展开={展开表[项.targetMessageId]}
              on展开={() => set展开表((prev) => ({ ...prev, [项.targetMessageId]: !prev[项.targetMessageId] }))}
              勾选={勾选表[项.targetMessageId] ?? []}
              on勾选={(id) => set勾选表((prev) => {
                const current = prev[项.targetMessageId] ?? [];
                return {
                  ...prev,
                  [项.targetMessageId]: current.includes(id)
                    ? current.filter((entry) => entry !== id)
                    : [...current, id],
                };
              })}
            />
          ))}
        </div>
      )}

      {草稿 && 草稿.项.length === 0 && (
        <p className="px-3 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
          草稿为空，请重新扫描。
        </p>
      )}
    </div>
  );
}

export const variableRepairSection: SettingsSectionDefinition = {
  key: 'variableRepair',
  label: '变量修复中心',
  icon: '⚒',
  navIcon: Wrench,
  group: 'subsystems',
  subtitle: '批量重解析历史回合的变量修复计划',
  Component: VariableRepairSection,
};
