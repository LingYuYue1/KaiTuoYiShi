import type { 游戏设置 } from '@/models/settings';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: 游戏设置;
  onChange: (settings: 游戏设置) => void;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function ExtraFeaturesSettingsTab({ settings, onChange }: Props) {
  const cleanup = settings.额外功能.污染词清理;
  const tagHide = settings.额外功能.标签块隐藏;
  const patchCleanup = (patch: Partial<typeof cleanup>) => {
    onChange({
      ...settings,
      额外功能: {
        ...settings.额外功能,
        污染词清理: {
          ...cleanup,
          ...patch,
        },
      },
    });
  };
  const patchTagHide = (patch: Partial<typeof tagHide>) => {
    onChange({
      ...settings,
      额外功能: {
        ...settings.额外功能,
        标签块隐藏: {
          ...tagHide,
          ...patch,
        },
      },
    });
  };

  const handleSave = async () => {
    await saveSetting('gameSettings', settings);
  };

  return (
    <div className="space-y-5">
      <section
        className="space-y-3 p-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: smallClip,
        }}
      >
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.22em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
            污染词清理
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            清理主回复落地前的高频污染词，避免它们进入聊天历史、记忆、变量和后续上下文后反复扩散。
          </p>
        </div>

        <ToggleRow
          label="启用污染词清理"
          desc="默认清理“极其”。清理发生在正文进入历史和后台系统前，不只是隐藏显示。"
          checked={cleanup.enabled}
          onChange={(enabled) => patchCleanup({ enabled })}
        />

        <div>
          <label className="mb-1.5 block text-xs font-serif tracking-[0.18em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.86), rgba(var(--tj-accent-secondary),0.82))' }}>
            清理词表
          </label>
          <textarea
            value={cleanup.words.join('\n')}
            onChange={(e) =>
              patchCleanup({
                words: e.target.value
                  .split(/\r?\n|[,，、]/)
                  .map((word) => word.trim())
                  .filter(Boolean),
              })
            }
            rows={6}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
            placeholder={'极其'}
          />
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            每行一个词，也可以用逗号分隔。建议只放明确污染词，避免误删正常叙事。
          </p>
        </div>
      </section>

      <section
        className="space-y-3 p-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: smallClip,
        }}
      >
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.22em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
            标签块隐藏
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            隐藏 ST 预设中“注入+清理”配对标签块（抗空回的 &lt;Q&gt;…&lt;/WF&gt; 越狱声明、抗截断的 &lt;math&gt;…&lt;/math&gt; 高数题占位）。这些内容对 AI 起作用但不应显示给玩家。
          </p>
        </div>

        <ToggleRow
          label="启用标签块隐藏"
          desc="默认启用。整段移除上述标签块（含内容），在正文进入历史和后台系统前生效。"
          checked={tagHide.enabled}
          onChange={(enabled) => patchTagHide({ enabled })}
        />
      </section>

      <section
        className="mt-4 space-y-3 p-4"
        style={{
          background: 'rgba(var(--tj-bg-card), 0.72)',
          border: '1px solid rgba(var(--tj-border), 0.72)',
          clipPath: smallClip,
        }}
      >
        <div>
          <div className="font-serif text-sm font-bold tracking-[0.22em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
            玩家额外要求
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            玩家自定义的输出前要求（如"多写环境描写""少用心理描写"）。非空时作为额外要求区注入（区7 与区8 之间），留空则不注入。
          </p>
        </div>
        <textarea
          value={settings.额外功能.玩家额外要求 ?? ''}
          onChange={(e) => {
            onChange({
              ...settings,
              额外功能: {
                ...settings.额外功能,
                玩家额外要求: e.target.value,
              },
            });
          }}
          placeholder="在此填写你对本回合/长期生效的额外要求…"
          rows={4}
          className="w-full resize-y bg-transparent p-3 text-sm outline-none"
          style={{
            border: '1px solid rgba(var(--tj-border), 0.72)',
            color: 'rgb(var(--tj-text-primary))',
            clipPath: smallClip,
          }}
        />
      </section>

      <button
        type="button"
        onClick={() => void handleSave()}
        className="w-full py-3 font-serif text-sm font-bold tracking-[0.28em] transition-all hover:opacity-95"
        style={{
          color: 'rgb(var(--tj-on-accent))',
          background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.96), rgba(var(--tj-btn-primary-end), 0.84))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.72), 0 0 18px rgba(var(--tj-tech-cyan),0.14)',
          clipPath: smallClip,
        }}
      >
        保存额外功能
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath: smallClip,
      }}
    >
      <div className="mr-3 min-w-0">
        <div className="font-serif text-sm font-bold tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {label}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
          {desc}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 transition-all"
        style={{
          background: checked
            ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
            : 'rgba(var(--tj-bg-secondary), 0.68)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: smallClip,
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
