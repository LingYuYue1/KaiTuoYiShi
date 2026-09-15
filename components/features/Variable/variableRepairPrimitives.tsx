// 变量修复预览共用原子组件（Modal 弹窗与设置中心共用）：分类文案 + 单条修复项行渲染。
// 无未引用导出：只导出两个消费方实际用到的组件与记录。

import type { 修复项分类, 变量修复项 } from '@/models/variableRepair';
import { smallClip } from '@/components/features/Chat/turnStyles';

export const 分类标签: Record<修复项分类, string> = {
  safe: '安全',
  confirm: '需确认',
  conflict: '冲突（永不写入）',
  existing: '已存在',
  unsupported: '不支持',
};

const 分类提示: Record<修复项分类, string> = {
  safe: '自动包含在提交中。',
  confirm: '默认不勾选，勾选后随提交写入。',
  conflict: '确定性事实路径，由当前状态维护。',
  existing: '当前值或历史回执已满足，无需写入。',
  unsupported: '路径未登记 / 玩家手写档案 / 策略拒绝。',
};

export const 分类顺序: 修复项分类[] = ['safe', 'confirm', 'conflict', 'existing', 'unsupported'];

function 格式化值(value: unknown): string {
  if (typeof value === 'undefined') return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '—';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/** 单条修复项行：勾选框只由 onToggle 决定渲染；checked 控制勾选与否。 */
export function 修复项行({
  item,
  category,
  checked = false,
  onToggle,
}: {
  item: 变量修复项;
  category: 修复项分类;
  checked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className="px-3 py-2 text-xs"
      style={{
        background: 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.2)',
        clipPath: smallClip,
        opacity:
          category === 'conflict' || category === 'unsupported' || category === 'existing' ? 0.75 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        {onToggle && (
          <input
            type="checkbox"
            className="mt-0.5"
            checked={checked}
            onChange={onToggle}
            aria-label={`修复项 ${item.id}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="break-all font-mono text-[11px]" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
            {item.commands.map((command) => `${command.action} ${command.key}`).join('；')}
          </div>
          {(item.currentValue !== undefined || item.proposedValue !== undefined) && (
            <div className="mt-0.5 break-all" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>
              当前：{格式化值(item.currentValue)} → 目标：{格式化值(item.proposedValue)}
            </div>
          )}
          <div className="mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
            {item.reason ?? 分类提示[category]}
          </div>
        </div>
      </div>
    </div>
  );
}
