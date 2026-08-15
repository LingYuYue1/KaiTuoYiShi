import type { STPresetOrderSlot, STPresetPrompt } from '@/models/stTypes';
import { TAVERN_RUNTIME_SLOT_IDS } from '@/utils/tavernPresetPanel';
import { smallClip } from './settingsShared';
import { MacroInspector, TogglePill } from './tavernPresetPrimitives';

interface V2PromptDetailPanelProps {
  selectedSlot: STPresetOrderSlot | undefined;
  selectedPrompt: STPresetPrompt | undefined;
  canEdit: boolean;
  canToggle: boolean;
  onToggleSelectedSlot: (enabled: boolean) => void;
  onPatchSelectedPrompt: (partial: Partial<STPresetPrompt>) => void;
}

export function V2PromptDetailPanel({ selectedSlot, selectedPrompt, canEdit, canToggle, onToggleSelectedSlot, onPatchSelectedPrompt }: V2PromptDetailPanelProps) {
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
          详细预览
        </span>
        {selectedSlot && (
          <TogglePill
            checked={selectedSlot.enabled}
            disabled={!canToggle}
            onChange={onToggleSelectedSlot}
            label={!selectedSlot.enabled ? '已关闭' : '已启用'}
          />
        )}
      </div>
    {selectedSlot ? (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {selectedPrompt ? (
          <>
            <input
              value={selectedPrompt.name ?? ''}
              readOnly={!canEdit}
              onChange={(e) => onPatchSelectedPrompt({ name: e.target.value })}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                borderRadius: '2px',
                outline: 'none',
                opacity: canEdit ? 1 : 0.72,
              }}
            />
            <select
              value={selectedPrompt.role}
              disabled={!canEdit}
              onChange={(e) => onPatchSelectedPrompt({ role: e.target.value as typeof selectedPrompt.role })}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                borderRadius: '2px',
                outline: 'none',
              }}
            >
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <textarea
              value={selectedPrompt.content}
              readOnly={!canEdit}
              onChange={(e) => onPatchSelectedPrompt({ content: e.target.value })}
              className="min-h-[280px] resize-y px-3 py-2 font-mono text-sm leading-6"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                borderRadius: '2px',
                outline: 'none',
                opacity: canEdit ? 1 : 0.72,
              }}
            />
            <MacroInspector content={selectedPrompt.content} />
          </>
        ) : (
          <div className="text-sm leading-7" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
            {TAVERN_RUNTIME_SLOT_IDS.has(selectedSlot.identifier)
              ? '运行时槽位由项目上下文注入：聊天历史、世界书、角色描述或玩家输入会在发送时填充。'
              : '该顺序项未匹配到 prompts 内容，可能是预设占位符。'}
          </div>
        )}
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
        从左侧选择一个顺序项查看正文和宏检测。
      </div>
    )}
    </div>
  );
}
