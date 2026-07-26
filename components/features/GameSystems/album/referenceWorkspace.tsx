import type { 文生图API配置, 文生图参考图设置 } from '@/models/settings';
import { cardClip, heroGridBackgroundStyle, heroSurface, smallClip } from './foundation';
import { backendLabel, referenceBackendCapability } from './referenceInjection';

interface ReferenceInjectionWorkspaceProps {
  settings: 文生图参考图设置;
  normalApi: 文生图API配置;
  nsfwApi: 文生图API配置;
  onEnabledChange: (enabled: boolean) => void;
  onOpenAICompatibleReferenceChange: (enabled: boolean) => void;
}

export function ReferenceInjectionWorkspace({ settings, normalApi, nsfwApi, onEnabledChange, onOpenAICompatibleReferenceChange }: ReferenceInjectionWorkspaceProps) {
  return (
    <div className="space-y-4">
      <section
        className="px-4 py-4"
        style={{
          background: heroSurface,
          ...heroGridBackgroundStyle,
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)',
          clipPath: cardClip,
        }}
      >
        <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>REFERENCE CONTROL</div>
        <h2 className="mt-1 font-serif text-xl font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>参考图注入</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.78)' }}>
          关闭后，所有生图任务都不会读取或发送参考图片；图库素材和角色参考关系会完整保留。
        </p>
      </section>

      <section className="overflow-hidden" style={{ background: 'rgba(var(--tj-ui-panel),0.56)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.5)', clipPath: cardClip }}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-sm font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>启用参考图注入</div>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
              仅对单个角色的头像、立绘和角色 NSFW 生图生效。
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="启用参考图注入"
            onClick={() => onEnabledChange(!settings.enabled)}
            className="relative h-7 w-12 shrink-0 transition-colors"
            style={{
              background: settings.enabled ? 'rgba(var(--tj-tech-cyan),0.28)' : 'rgba(var(--tj-ui-panel-strong),0.7)',
              boxShadow: settings.enabled
                ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.62), 0 0 14px rgba(var(--tj-tech-cyan),0.12)'
                : 'inset 0 0 0 1px rgba(var(--tj-border),0.72)',
              clipPath: smallClip,
            }}
          >
            <span
              className="absolute top-1 h-5 w-5 transition-all"
              style={{
                left: settings.enabled ? '25px' : '4px',
                background: settings.enabled ? 'rgb(var(--tj-tech-cyan))' : 'rgba(var(--tj-ui-muted),0.72)',
                clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
              }}
            />
          </button>
        </div>

      </section>

      <section className="overflow-hidden" style={{ background: 'rgba(var(--tj-ui-panel),0.56)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.5)', clipPath: cardClip }}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-sm font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>允许 OpenAI 兼容接口发送参考图</div>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>
              部分中转供应商不支持参考图，如参考图生成失败请关闭该开关。
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enableOpenAICompatibleReference}
            aria-label="允许 OpenAI 兼容接口发送参考图"
            onClick={() => onOpenAICompatibleReferenceChange(!settings.enableOpenAICompatibleReference)}
            className="relative h-7 w-12 shrink-0 transition-colors"
            style={{
              background: settings.enableOpenAICompatibleReference ? 'rgba(var(--tj-tech-cyan),0.28)' : 'rgba(var(--tj-ui-panel-strong),0.7)',
              boxShadow: settings.enableOpenAICompatibleReference
                ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.62), 0 0 14px rgba(var(--tj-tech-cyan),0.12)'
                : 'inset 0 0 0 1px rgba(var(--tj-border),0.72)',
              clipPath: smallClip,
            }}
          >
            <span
              className="absolute top-1 h-5 w-5 transition-all"
              style={{
                left: settings.enableOpenAICompatibleReference ? '25px' : '4px',
                background: settings.enableOpenAICompatibleReference ? 'rgb(var(--tj-tech-cyan))' : 'rgba(var(--tj-ui-muted),0.72)',
                clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
              }}
            />
          </button>
        </div>
      </section>

      <section className="overflow-hidden" style={{ background: 'rgba(var(--tj-ui-panel),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.42)', clipPath: cardClip }}>
        <div className="border-b px-4 py-3 font-serif text-xs font-bold tracking-[0.16em]" style={{ borderColor: 'rgba(var(--tj-border),0.42)', color: 'rgba(var(--tj-ui-title),0.92)' }}>接口兼容状态</div>
        <BackendStatusRow label="普通接口" api={normalApi} settings={settings} />
        <BackendStatusRow label="NSFW 接口" api={nsfwApi} settings={settings} />
      </section>

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-ui-faint),0.7)' }}>
        参考图的上传、替换和角色关联继续在“图库”中管理。参考强度与 ComfyUI 工作流设置仍保留在文生图设置中。
      </p>
    </div>
  );
}

function BackendStatusRow({ label, api, settings }: { label: string; api: 文生图API配置; settings: 文生图参考图设置 }) {
  const capability = referenceBackendCapability(api.backend, settings);
  const usable = api.enabled && capability.usable;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'rgba(var(--tj-border),0.34)' }}>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium" style={{ color: 'rgba(var(--tj-ui-body),0.92)' }}>{label} · {api.enabled ? backendLabel(api.backend) : '未启用'}</div>
        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{api.enabled ? capability.message : '当前接口未启用，不会提交生图任务。'}</div>
      </div>
      <span className="shrink-0 px-2 py-1 text-[10px]" style={{ color: usable ? 'rgba(var(--tj-ui-success),0.92)' : 'rgba(var(--tj-ui-muted),0.76)', background: usable ? 'rgba(var(--tj-ui-success),0.08)' : 'rgba(var(--tj-ui-panel-strong),0.42)', boxShadow: `inset 0 0 0 1px ${usable ? 'rgba(var(--tj-ui-success),0.28)' : 'rgba(var(--tj-border),0.48)'}`, clipPath: smallClip }}>
        {usable ? '可用' : '不可用'}
      </span>
    </div>
  );
}
