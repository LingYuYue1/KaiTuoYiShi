import type { 游戏设置, VisualTextSettings } from '@/models/settings';
import { 创建默认视觉文本设置, 归一化视觉文本设置 } from '@/models/settings';

interface Props {
  settings: 游戏设置;
  onChange: (settings: 游戏设置) => void;
}

const smallClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

const RANGE_MIN = 13;
const RANGE_MAX = 30;

export function VisualSettingsTab({ settings, onChange }: Props) {
  const visual = 归一化视觉文本设置(settings.visualTextSettings);

  const update = (patch: Partial<VisualTextSettings>) => {
    onChange({
      ...settings,
      visualTextSettings: 归一化视觉文本设置({ ...visual, ...patch }),
    });
  };

  const reset = () => {
    onChange({
      ...settings,
      visualTextSettings: 创建默认视觉文本设置(),
    });
  };

  return (
    <div className="space-y-5">
      <section
        className="px-4 py-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: smallClip,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-sm font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              正文字号
            </h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              只调整主聊天正文显示，不影响按钮、面板、变量记录、图片卡片和其他系统 UI。
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 font-serif text-xs tracking-[0.18em] transition-all hover:opacity-90"
            style={{
              color: 'rgba(var(--tj-accent-primary), 0.92)',
              background: 'rgba(var(--tj-accent-primary), 0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
            }}
          >
            恢复默认
          </button>
        </div>
      </section>

      <div className="grid gap-3">
        <FontSizeSlider
          label="旁白正文"
          desc="用于环境描写、动作描写和未标注为角色台词的正文。"
          value={visual.narrationFontSize}
          onChange={(value) => update({ narrationFontSize: value })}
        />
        <FontSizeSlider
          label="角色台词"
          desc="用于 NPC 对话气泡和心声段落。"
          value={visual.dialogueFontSize}
          onChange={(value) => update({ dialogueFontSize: value })}
        />
        <FontSizeSlider
          label="玩家发言"
          desc="用于玩家输入气泡，以及正文中被识别为旅人发言的台词。"
          value={visual.playerFontSize}
          onChange={(value) => update({ playerFontSize: value })}
        />
      </div>

      <section
        className="px-4 py-4"
        style={{
          background: 'rgba(var(--tj-bg-primary), 0.26)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)',
          clipPath: smallClip,
        }}
      >
        <div className="mb-3 font-serif text-xs tracking-[0.24em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.86), rgba(var(--tj-accent-secondary),0.82))' }}>
          预览
        </div>
        <div className="space-y-3">
          <div
            className="px-4 py-2.5"
            style={{
              background: 'rgba(var(--tj-accent-primary), 0.018)',
              borderLeft: '2px solid rgba(var(--tj-accent-primary), 0.34)',
              borderRight: '1px solid rgba(var(--tj-border), 0.24)',
            }}
          >
            <p style={{ color: 'rgba(var(--tj-chat-text), 0.94)', fontSize: `${visual.narrationFontSize}px`, lineHeight: 1.8 }}>
              观景车厢外掠过一束冷白色星光，杯沿的热雾在灯下慢慢舒展开。
            </p>
          </div>
          <div
            className="px-4 py-3"
            style={{
              color: 'rgba(var(--tj-chat-text), 0.96)',
              background: 'rgba(var(--tj-chat-bubble), var(--tj-chat-bubble-alpha, 0.78))',
              boxShadow: 'inset 0 0 0 1px rgba(140, 195, 230, 0.42), 0 4px 18px rgba(var(--tj-shadow), 0.24)',
              clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
            }}
          >
            <p style={{ fontSize: `${visual.dialogueFontSize}px`, lineHeight: 1.8 }}>
              三月七：这个大小看起来舒服吗？要是还小，我们就再调大一点。
            </p>
          </div>
          <div className="flex justify-end">
            <div
              className="max-w-[86%] px-4 py-2.5"
              style={{
                color: 'rgba(var(--tj-chat-text), 0.98)',
                background: 'rgba(var(--tj-chat-bubble), var(--tj-chat-bubble-alpha, 0.78))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.46), 0 4px 18px rgba(var(--tj-shadow), 0.24)',
                clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
                fontWeight: 600,
              }}
            >
              <p style={{ fontSize: `${visual.playerFontSize}px`, lineHeight: 1.8 }}>
                我想让正文再清楚一点。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FontSizeSlider({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <section
      className="px-4 py-3"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            {label}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
            {desc}
          </div>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
          {value}px
        </span>
      </div>
      <input
        type="range"
        min={RANGE_MIN}
        max={RANGE_MAX}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[rgb(var(--tj-accent-primary))]"
      />
      <div className="mt-1 flex justify-between text-[10px] font-mono" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
        <span>{RANGE_MIN}px</span>
        <span>{RANGE_MAX}px</span>
      </div>
    </section>
  );
}
