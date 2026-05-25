import { useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

function setModuleEnabled(modules: 提示词模块[], id: string, v: boolean): 提示词模块[] {
  return modules.map((m) => (m.id === id ? { ...m, enabled: v, updatedAt: Date.now() } : m));
}

export function NsfwSettingsTab({ settings, onChange }: Props) {
  const [saveMessage, setSaveMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = async () => {
    try {
      await saveSetting('gameSettings', settings);
      setSaveMessage('NSFW 设置已保存。');
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (err) {
      setSaveMessage(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const updateNsfw = (enabled: boolean) => {
    onChange({
      ...settings,
      enableNsfw: enabled,
      enableMaleNsfwArchive: enabled ? settings.enableMaleNsfwArchive : false,
      promptModules: setModuleEnabled(settings.promptModules, 'builtin_nsfw', enabled),
    });
  };

  return (
    <div className="space-y-5">
      <div
        className="px-4 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(154, 94, 126, 0.14), rgba(245, 217, 122, 0.035))',
          boxShadow: 'inset 0 0 0 1px rgba(214, 142, 174, 0.24)',
          clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
        }}
      >
        <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: '#fff4d4' }}>
          NSFW 设置
        </div>
        <div className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(220, 208, 178, 0.76)' }}>
          这里只控制成人向内容授权与私密档案写入。关闭总开关时，正文不注入 NSFW 提示词，变量模型也不应写入 NSFW 档案。
        </div>
      </div>

      <ToggleRow
        label="NSFW 总开关"
        desc="开启后注入 NSFW 提示词，并允许成人确认与剧情事实成立后的私密档案写入。"
        checked={settings.enableNsfw}
        onChange={updateNsfw}
      />

      <ToggleRow
        label="男性 NSFW 档案"
        desc="默认关闭。关闭时不写入男性身体档案、男性私密部位与男性长期私密事实；女性档案不受此开关影响。"
        checked={Boolean(settings.enableNsfw && settings.enableMaleNsfwArchive)}
        disabled={!settings.enableNsfw}
        onChange={(v) => onChange({ ...settings, enableMaleNsfwArchive: v })}
      />

      <div
        className="px-4 py-4"
        style={{
          background: 'rgba(16, 14, 16, 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
          clipPath: smallClip,
        }}
      >
        <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.9)' }}>
          档案拆分规则
        </div>
        <div className="mt-2 space-y-1 text-sm leading-relaxed" style={{ color: 'rgba(220, 208, 178, 0.76)' }}>
          <p>女性身体档案：胸部、女性私处、后庭、体态、体味。</p>
          <p>男性身体档案：男性器、后庭、体态、体味。</p>
          <p>普通人物外貌、穿着、性格、同行记忆不混写露骨内容。</p>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 pt-3" style={{ background: 'linear-gradient(180deg, rgba(10,9,10,0), rgba(10,9,10,0.98) 30%)' }}>
        {saveMessage && (
          <div className="mb-2 text-right text-xs" style={{ color: saveMessage.startsWith('保存失败') ? 'rgba(255,180,180,0.92)' : 'rgba(165,230,170,0.92)' }}>
            {saveMessage}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="relative w-full overflow-hidden py-3 font-serif text-sm font-bold tracking-[0.32em] transition-all hover:opacity-95"
          style={{
            color: '#1a1325',
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(165, 230, 170, 0.96), rgba(105, 190, 130, 0.92))'
              : 'linear-gradient(135deg, rgba(245, 217, 122, 0.96), rgba(212, 177, 90, 0.94))',
            boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.52), 0 0 18px rgba(245,217,122,0.16)',
            clipPath: smallClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保存 NSFW 设置'}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        opacity: disabled ? 0.58 : 1,
        background: 'rgba(16, 14, 16, 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.15)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="mr-3 min-w-0">
        <div className="font-serif text-sm font-bold tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {label}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: 'rgba(200, 188, 158, 0.65)' }}>
          {desc}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 transition-all disabled:cursor-not-allowed"
        style={{
          background: checked
            ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))'
            : 'rgba(60, 55, 40, 0.7)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(255, 245, 200, 0.5), 0 0 10px rgba(245, 217, 122, 0.25)'
            : 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
          clipPath: smallClip,
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? '#1a1325' : 'rgba(220, 200, 160, 0.85)',
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
